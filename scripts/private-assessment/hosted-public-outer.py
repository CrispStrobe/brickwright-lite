#!/usr/bin/python3
"""Manual PUBLIC fixed-nine qualification. No LIVE, credential or converter API."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import platform
import re
import resource
import signal
import stat
import struct
import subprocess
import sys
import time
import traceback

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MAX = {'cpu': 25, 'term': 30, 'kill': 33, 'terminal': 35, 'leaf': 8 * 1024**2, 'owned': 64 * 1024**2}
RESERVE = 1900000
DATA_BYTES, DATA_INODES = 24 * 1024**2, 2048
STREAM_BYTES, STREAM_INODES = 1024**2, 16
MODES = ('boundary','bytes','inodes','leaf','pids','cpu-reaped','cpu','wall','symlink')
SOURCE_NAMES = ('hosted-public-outer.py','hosted-run.py','qualify-hosted.py','hosted-public-tools.json')
_OWNED_OUTPUT = None
class Refused(Exception): pass

def reject(code): raise Refused(code)
def bounded(path, maximum):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > maximum: reject('REGULAR_BOUNDED_INPUT')
        data = bytearray()
        while len(data) < before.st_size:
            part = os.pread(fd, min(65536, before.st_size - len(data)), len(data))
            if not part: reject('SHORT_INPUT')
            data.extend(part)
        after = os.fstat(fd)
        if os.pread(fd, 1, before.st_size) or stamp(before) != stamp(after): reject('INPUT_CHANGED')
        return bytes(data)
    finally: os.close(fd)

def stamp(s): return (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def sha(data): return hashlib.sha256(data).hexdigest()
def write(path, value, public=False):
    data = value if isinstance(value, bytes) else (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()
    if len(data) > MAX['leaf']: reject('OUTPUT_LEAF_CAP')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644 if public else 0o600)
    try:
        os.fchmod(fd,0o644 if public else 0o600)
        view = memoryview(data)
        while view:
            n = os.write(fd, view)
            if n <= 0: reject('SHORT_OUTPUT')
            view = view[n:]
    finally: os.close(fd)

def package_versions():
    data = bounded('/var/lib/dpkg/status', MAX['leaf']).decode('utf8')
    out = {}
    for paragraph in data.split('\n\n'):
        fields = dict(line.split(': ',1) for line in paragraph.splitlines() if ': ' in line and not line.startswith(' '))
        if fields.get('Package') in ('bubblewrap','python3.12-minimal'):
            out[fields['Package']] = {k:fields.get(k) for k in ('Version','Architecture','Status')}
    return out

def metadata():
    """Unprivileged, finite fixed public file metadata; no tool execution."""
    env = {k:os.environ.get(k,'') for k in ('ImageOS','ImageVersion','GITHUB_SHA','GITHUB_REPOSITORY','GITHUB_ACTIONS','RUNNER_ENVIRONMENT')}
    if any(len(v)>160 or '\n' in v for v in env.values()): reject('PUBLIC_PLATFORM_FIELD')
    tools = {}
    for name, literal in [('python','/usr/bin/python3'),('bwrap','/usr/bin/bwrap')]:
        p = Path(literal)
        if not p.exists(): tools[name] = {'available':False}; continue
        actual = p.resolve(strict=True); s = actual.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_mode & (stat.S_ISUID|stat.S_ISGID): reject('UNSAFE_SYSTEM_TOOL')
        data = bounded(actual, 32 * 1024**2)
        tools[name] = {'available':True,'path':literal,'realpath':str(actual),'bytes':len(data),'sha256':sha(data),'permissions':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid}
    sources = {}
    for name in SOURCE_NAMES:
        raw = bounded(HERE/name, MAX['leaf']); sources[name] = {'bytes':len(raw),'sha256':sha(raw)}
    return {'schema':'brickwright/public-hosted-tools/v1','runner':{'imageOS':env['ImageOS'],'imageVersion':env['ImageVersion'],'kernel':platform.release(),'machine':platform.machine()},'tools':tools,'packages':package_versions(),'platform':env,'sources':sources}

def admit(observed, policy):
    if type(policy) is not dict or set(policy) != {'schema','profiles'} or policy['schema'] != 'brickwright/public-hosted-tool-admission/v1' or type(policy['profiles']) is not list or len(policy['profiles'])>16: reject('TOOL_POLICY_SCHEMA')
    platform_fields = observed['platform']
    if platform_fields['GITHUB_ACTIONS'] != 'true' or platform_fields['RUNNER_ENVIRONMENT'] != 'github-hosted' or platform_fields['GITHUB_REPOSITORY'] != 'CrispStrobe/brickwright-lite' or not re.fullmatch('[0-9a-f]{40}',platform_fields['GITHUB_SHA']): reject('OWNED_HOSTED_PLATFORM')
    if observed['runner']['machine'] != 'x86_64' or observed['runner']['imageOS'] != 'ubuntu24': reject('RUNNER_LAYOUT')
    expected = {k:observed[k] for k in ('runner','tools','packages')}
    if not all(v.get('available') is True for v in observed['tools'].values()): reject('ISOLATION_UNAVAILABLE_TOOL_ABSENT')
    for name,literal in [('python','/usr/bin/python3'),('bwrap','/usr/bin/bwrap')]:
        tool=observed['tools'][name]
        if set(tool)!={'available','path','realpath','bytes','sha256','permissions','uid','gid'} or tool['path']!=literal or tool['uid']!=0 or tool['gid']!=0 or tool['permissions']&(0o022|stat.S_ISUID|stat.S_ISGID) or not tool['permissions']&0o111 or not re.fullmatch('[0-9a-f]{64}',tool['sha256']) or not 0<tool['bytes']<=32*1024**2:
            reject('SYSTEM_TOOL_IDENTITY_POLICY')
    if set(observed['packages'])!={'bubblewrap','python3.12-minimal'} or any(v.get('Status')!='install ok installed' or v.get('Architecture')!='amd64' or type(v.get('Version'))is not str or not 0<len(v['Version'])<=128 for v in observed['packages'].values()):reject('SYSTEM_PACKAGE_IDENTITY_POLICY')
    for profile in policy['profiles']:
        if type(profile) is not dict or set(profile) != {'runner','tools','packages'}: reject('TOOL_PROFILE_SCHEMA')
        if profile == expected: return profile
    reject('ISOLATION_UNAVAILABLE_UNADMITTED_IMAGE_OR_TOOLS')

def launch_prefix(raw):
    if type(raw) is not bytes or len(raw)!=8:reject('LAUNCH_CPU_RECEIPT')
    value=struct.unpack('!d',raw)[0]
    if not 0<=value<100000:reject('LAUNCH_CPU_RECEIPT')
    return value

def aggregate(kernel_seconds, observer_seconds, launch_seconds=0.):
    # The receipt covers fork/preexec CPU through confirmed membership. The
    # small post-membership overlap is intentionally counted conservatively.
    # Never add successful wait4 totals to this inclusive kernel accounting.
    if any(type(v) not in (int,float) or not 0 <= v < 100000 for v in (kernel_seconds,observer_seconds,launch_seconds)): reject('CPU_COUNTER')
    return kernel_seconds + observer_seconds + launch_seconds

def storage_maximum():
    raw = DATA_BYTES + STREAM_BYTES + len(MODES) * (65536+262144)
    return {'originalBytes':raw,'originalPlusCopies':raw*2,'reserve':RESERVE,'within64MiB':raw*2+RESERVE<MAX['owned']}

def source_module(observed):
    for name,r in observed['sources'].items():
        b = bounded(HERE/name,MAX['leaf'])
        if (len(b),sha(b)) != (r['bytes'],r['sha256']): reject('SOURCE_CHANGED')
    spec = importlib.util.spec_from_file_location('owned_public_kernel',HERE/'hosted-run.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

def process_birth():
    # Linux starttime is boot-time ticks: include interpreter/import/argument
    # startup in the owning deadline, rather than starting after admission.
    raw=Path('/proc/self/stat').read_bytes();end=raw.rfind(b') ')
    if end<0:reject('OWNING_PROCESS_STAT')
    fields=raw[end+2:].split()
    return int(fields[19])/os.sysconf('SC_CLK_TCK')

def whole_wall(birth):return time.clock_gettime(time.CLOCK_BOOTTIME)-birth

def fixed_paths(work, output):
    if not work.is_absolute() or not output.is_absolute() or '..' in work.parts or '..' in output.parts or work.name != 'volatile' or output.name != 'originals' or work.parent != output.parent: reject('FRESH_SIBLING_OUTPUT_PATHS')
    for p in [work.parent,*work.parent.parents]:
        if p.is_symlink(): reject('OUTPUT_SYMLINK_ANCESTOR')
    if work.exists() or output.exists(): reject('FRESH_OUTPUT_REQUIRED')

def copy_originals(source, destination, records, relative='', count=None):
    """Writer has terminated; O_PATH classifies before any readable FD."""
    if count is None: count=[0,0]
    destination.mkdir(mode=0o755);destination.chmod(0o755)
    directory = os.open(source,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        for name in sorted(os.listdir(directory)):
            count[0]+=1
            if count[0]>4096: reject('ORIGINAL_INODE_CAP')
            held=os.open(name,os.O_PATH|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=directory)
            try:
                s=os.fstat(held);rel=relative+name;r={'path':rel,'type':stat.S_IFMT(s.st_mode),'metadata':list(stamp(s))}
                if stat.S_ISDIR(s.st_mode): copy_originals(Path(source)/name,destination/name,records,rel+'/',count)
                elif stat.S_ISREG(s.st_mode):
                    if s.st_nlink!=1 or s.st_size>MAX['leaf']:reject('ORIGINAL_LEAF')
                    fd=os.open('/proc/self/fd/'+str(held),os.O_RDONLY|os.O_NONBLOCK|os.O_CLOEXEC)
                    try:
                        data=bytearray()
                        while len(data)<s.st_size:
                            part=os.pread(fd,min(65536,s.st_size-len(data)),len(data))
                            if not part:reject('ORIGINAL_SHORT_READ')
                            data.extend(part)
                        if os.pread(fd,1,s.st_size)or stamp(os.fstat(fd))!=stamp(s):reject('ORIGINAL_CHANGED')
                    finally:os.close(fd)
                    count[1]+=len(data)
                    if count[1]>storage_maximum()['originalBytes']:reject('ORIGINAL_AGGREGATE')
                    write(destination/name,bytes(data),public=True);r.update(bytes=len(data),sha256=sha(data))
                else:
                    r['refusal']='NONREGULAR_NOT_READ'
                    if stat.S_ISLNK(s.st_mode):r['link']=os.readlink(name,dir_fd=directory)
                    # The deliberate public Unix marker inode is retained as
                    # metadata; failed FIFO/link controls likewise are not read.
                records.append(r)
            finally:os.close(held)
    finally:os.close(directory)


def qualify(work, output):
    global _OWNED_OUTPUT
    start=process_birth();cpu_start=0.;observed=metadata()
    # Unknown tools fail BEFORE imports that call libc, mounts or cgroup setup.
    policy=json.loads(bounded(HERE/'hosted-public-tools.json',MAX['leaf']));admit(observed,policy)
    if os.geteuid()!=0:reject('TRUSTED_HOSTED_ROOT_REQUIRED')
    if not (ROOT/'.git').is_dir() or bounded(ROOT/'.git/HEAD',4096).decode().strip()!=observed['platform']['GITHUB_SHA']:reject('EXACT_PUBLIC_CHECKOUT_HEAD')
    fixed_paths(work,output);work.mkdir(mode=0o711);work.chmod(0o711);output.mkdir(mode=0o755);output.chmod(0o755)
    out_stat=output.lstat();_OWNED_OUTPUT=(str(output),out_stat.st_dev,out_stat.st_ino)
    kernel=None;group=controller=child=handle=episode_fd=None;group_identity=None
    mounts=[];records=[];streams=[];waited=None;failure=None;final_cpu=0.;flags={'cpu':False,'term':False,'kill':False};empty=False;closed_wait=False
    launch_cpu=0.;launch_valid=False;launch_fds=[];launch_baseline=resource.getrusage(resource.RUSAGE_CHILDREN)
    report={'schema':'brickwright/public-hosted-outer/v1','decision':'FAIL','liveEnabled':False,'modes':list(MODES),'toolMetadata':observed,'flags':flags,'errors':[]}
    def check_group():
        if group is None or group_identity is None:reject('OWNED_EPISODE_ABSENT')
        st=group.stat()
        if (st.st_dev,st.st_ino)!=group_identity or st.st_uid!=0 or kernel.fs_type(group)!=kernel.CGROUP2_MAGIC:reject('OWNED_EPISODE_IDENTITY_CHANGED')
        return group
    def kill_group():
        (check_group()/'cgroup.kill').write_text('1')
    try:
        kernel=source_module(observed)
        resource.setrlimit(resource.RLIMIT_CPU,(MAX['cpu'],MAX['cpu']));resource.setrlimit(resource.RLIMIT_FSIZE,(MAX['leaf'],MAX['leaf']));resource.setrlimit(resource.RLIMIT_CORE,(0,0))
        if kernel.native().prctl(36,1,0,0,0)!=0:reject('OUTER_SUBREAPER')
        base=Path('/sys/fs/cgroup')
        if kernel.fs_type(base)!=kernel.CGROUP2_MAGIC:reject('CGROUP2_UNAVAILABLE')
        candidate=base/('bw-public-episode-'+str(os.getpid()));candidate.mkdir(mode=0o700)
        group=candidate;st=group.stat();group_identity=(st.st_dev,st.st_ino)
        if not {'cpu','memory','pids'}<=set((group/'cgroup.controllers').read_text().split()):reject('EPISODE_CONTROLLERS_UNAVAILABLE')
        for name,value in [('cpu.max','100000 100000'),('memory.max',str(512*1024**2)),('memory.swap.max','0'),('pids.max','64')]:
            (group/name).write_text(value)
            if (group/name).read_text().strip()!=value:reject('EPISODE_LIMIT_READBACK')
        (group/'cgroup.subtree_control').write_text('+cpu +memory +pids')
        controller=group/'controller';controller.mkdir();episode_fd=os.open(group,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
        report['episodeIdentity']={'path':str(group),'dev':group.stat().st_dev,'ino':group.stat().st_ino}
        data,logs=work/'data',work/'streams'
        for p,size,nodes in [(data,DATA_BYTES,DATA_INODES),(logs,STREAM_BYTES,STREAM_INODES)]:
            p.mkdir();kernel.mount_tmpfs(p,size,nodes,0,mounts)
        data.chmod(0o711)
        stdout=os.open(logs/'stdout.bin',os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);streams.append(stdout)
        stderr=os.open(logs/'stderr.bin',os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);streams.append(stderr)
        args=['/usr/bin/python3','-I','-S','-B',str(HERE/'qualify-hosted.py'),'--output',str(data/'cohort'),'--controller-sha256',observed['sources']['hosted-run.py']['sha256'],'--bwrap-sha256',observed['tools']['bwrap']['sha256'],'--python-sha256',observed['tools']['python']['sha256'],'--episode-cgroup-fd',str(episode_fd)]
        launch_read,launch_write=os.pipe2(os.O_CLOEXEC|os.O_NONBLOCK);launch_fds=[launch_read,launch_write]
        def enter():
            (controller/'cgroup.procs').write_text(str(os.getpid()))
            if str(os.getpid()) not in (controller/'cgroup.procs').read_text().split():os._exit(121)
            resource.setrlimit(resource.RLIMIT_CPU,(MAX['cpu'],MAX['cpu']))
            usage=resource.getrusage(resource.RUSAGE_SELF)
            receipt=struct.pack('!d',usage.ru_utime+usage.ru_stime)
            if os.write(launch_write,receipt)!=8:os._exit(122)
            os.close(launch_write)
        env={'PATH':'/usr/bin:/bin','LANG':'C','GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted'}
        child=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,env=env,close_fds=True,pass_fds=(episode_fd,launch_write),preexec_fn=enter)
        os.close(launch_write);launch_fds.remove(launch_write)
        launch_cpu=launch_prefix(os.read(launch_read,9));launch_valid=True
        os.close(launch_read);launch_fds.remove(launch_read)
        report['launchCPUReceipt']={'seconds':launch_cpu,'throughConfirmedMembership':True,'conservativePostMembershipOverlap':True}
        handle=os.pidfd_open(child.pid);report['actualQualifierArgv']=args;report['directQualifierPID']=child.pid
        while True:
            done,status,usage=os.wait4(child.pid,os.WNOHANG)
            total=aggregate(kernel.cpu_group(group),time.process_time()-cpu_start,launch_cpu);elapsed=whole_wall(start)
            if total>=MAX['cpu']-.05:flags['cpu']=True;kill_group()
            if elapsed>=MAX['term'] and not flags['term']:
                flags['term']=True
                if not done:signal.pidfd_send_signal(handle,signal.SIGTERM)
            if elapsed>=MAX['kill'] and not flags['kill']:flags['kill']=True;kill_group()
            if done:
                child.returncode=os.waitstatus_to_exitcode(status);waited={'exit':child.returncode,'status':status,'diagnosticWait4CPUAlreadyIncluded':usage.ru_utime+usage.ru_stime};break
            if elapsed>=MAX['terminal']:reject('OUTER_TERMINAL_UNOBSERVED')
            time.sleep(.01)
        if child.returncode or any(flags.values()):reject('ORIGINAL_QUALIFIER_FAILED_OR_RESOURCE_CAP')
        q=json.loads(bounded(data/'cohort/qualification.json',MAX['leaf']))
        if q['decision']!='PASS_PUBLIC_SYNTHETIC_HOSTED_ISOLATION_ONLY'or [c['mode']for c in q['cases']]!=list(MODES)or q['errors']:reject('COMPLETE_NINE_REQUIRED')
        report['qualification']=q
        # Grade original lifetime BEFORE cleanup can kill an escaped descendant.
        report['episodePopulatedAtQualifierSuccess']=bool(kernel.populated(check_group()))
        if report['episodePopulatedAtQualifierSuccess']:reject('ORIGINAL_QUALIFIER_LEFT_DESCENDANTS')
    except BaseException as error:
        failure={'type':type(error).__name__,'reason':str(error),'errno':getattr(error,'errno',None),'traceback':traceback.format_exc()};report['errors'].append(failure)
    finally:
        for fd in launch_fds:os.close(fd)
        # Kill the complete OWNED subtree, never host/global or a historical PID.
        if group is not None and group.exists():
            try:
                report['episodePopulatedBeforeCleanup']=bool(kernel.populated(check_group()))
                if report['episodePopulatedBeforeCleanup']:
                    report['errors'].append({'reason':'ORIGINAL_NONEMPTY_EPISODE_REQUIRED_CLEANUP'})
                    kill_group()
                while kernel.populated(group)and whole_wall(start)<MAX['terminal']:time.sleep(.01)
                empty=not kernel.populated(group)
                if not empty:reject('EPISODE_NOT_EMPTY_RETAIN_MOUNTS')
                check_group();final_cpu=kernel.cpu_group(group);report['episodeCPUStat']=(group/'cpu.stat').read_text();report['memoryEvents']=(group/'memory.events').read_text();report['pidsEvents']=(group/'pids.events').read_text()
                mem=dict(line.split()for line in report['memoryEvents'].splitlines());pids=dict(line.split()for line in report['pidsEvents'].splitlines())
                if int(mem.get('oom',0))or int(mem.get('oom_kill',0))or int(pids.get('max',0)):reject('OUTER_MEMORY_OR_PIDS_EVENT')
            except BaseException as error:report['errors'].append({'episodeCleanup':repr(error)})
        if child is None and group is None:empty=True;closed_wait=True
        elif empty:
            while True:
                try:
                    pid,status,usage=os.wait4(-1,os.WNOHANG)
                    if not pid:reject('WAIT_NOT_CLOSED')
                    if child is not None and pid==child.pid and waited is None:
                        child.returncode=os.waitstatus_to_exitcode(status);waited={'exit':child.returncode,'status':status,'diagnosticWait4CPUAlreadyIncluded':usage.ru_utime+usage.ru_stime}
                except ChildProcessError:closed_wait=True;break
                except BaseException as error:report['errors'].append({'waitCleanup':repr(error)});break
        if not launch_valid:
            # Failed preexec/exec may be reaped inside Popen. Retain the actual
            # cumulative child-usage delta; overlap is conservative on FAILURE.
            u=resource.getrusage(resource.RUSAGE_CHILDREN)
            launch_cpu=max(0.,u.ru_utime+u.ru_stime-launch_baseline.ru_utime-launch_baseline.ru_stime)
            report['launchCPUFailureUpperBound']={'seconds':launch_cpu,'allReapedChildrenConservativeOverlap':True,'writersClosed':closed_wait}
        if not empty or not closed_wait:
            report['failedStreamPrefixes']=[]
            for index,fd in enumerate(streams):
                try:
                    st=os.fstat(fd)
                    if not stat.S_ISREG(st.st_mode)or st.st_nlink!=1 or st.st_size>STREAM_BYTES:reject('HELD_STREAM_PREFIX_ROLE')
                    data=os.pread(fd,st.st_size,0);name='failed-'+('stdout'if index==0 else'stderr')+'-prefix.bin'
                    write(output/name,data,public=True);report['failedStreamPrefixes'].append(dict(name=name,bytes=len(data),sha256=sha(data),partial=True,terminalWriterClosure=False))
                except BaseException as error:report['errors'].append({'failedPrefixPreservation':repr(error)})
        for fd in streams:os.close(fd)
        if handle is not None:os.close(handle)
        if episode_fd is not None:os.close(episode_fd)
        if empty and closed_wait:
            preserved=False
            try:
                copy_originals(work,output/'originals',records);preserved=True
            except BaseException as error:report['errors'].append({'preservation':repr(error),'traceback':traceback.format_exc()})
            if preserved:
                # Failed inner setup may leave its two fixed tmpfs mounts. Only
                # exact owned roots whose kernel mount identity is tmpfs qualify.
                for mode in reversed(MODES):
                    for name in ('scratch','capture'):
                        p=work/'data/cohort'/mode/name
                        try:
                            if p.exists() and kernel.fs_type(p)==kernel.TMPFS_MAGIC:
                                parent=p.parent
                                if p.stat().st_dev!=parent.stat().st_dev:
                                    if kernel.native().umount2(os.fsencode(p),0)!=0:raise OSError('INNER_UNMOUNT')
                        except BaseException as error:report['errors'].append({'innerMountCleanup':str(p),'error':repr(error)})
                for p in reversed(mounts):
                    try:
                        if kernel.native().umount2(os.fsencode(p),0)!=0:raise OSError('OUTER_UNMOUNT')
                    except BaseException as error:report['errors'].append({'outerMountCleanup':str(p),'error':repr(error)})
            else:report['ownedMountsRetainedForPreservation']=[str(p)for p in mounts]
            if group is not None and group.exists():
                try:
                    check_group()
                    for p in sorted(group.rglob('*'),key=lambda p:len(p.parts),reverse=True):
                        if p.is_dir():p.rmdir()
                    group.rmdir()
                except BaseException as error:report['errors'].append({'cgroupRemove':repr(error)})
        try:
            after=metadata()
            if after!=observed:reject('SOURCE_TOOL_METADATA_CHANGED')
        except BaseException as error:report['errors'].append({'finalSourceTool':repr(error)})
        report.update(wait=waited,finalGroupEmpty=empty,finalECHILD=closed_wait,kernelInclusiveCPU=final_cpu,launchPrefixCPU=launch_cpu,launchReceiptValidated=launch_valid,outerObserverCPU=time.process_time()-cpu_start,wall=whole_wall(start),originalRecords=records,storageHardBound=storage_maximum())
        report['aggregateCPU']=aggregate(final_cpu,report['outerObserverCPU'],launch_cpu)
        if report['aggregateCPU']>MAX['cpu'] or report['wall']>=MAX['terminal']:report['errors'].append({'reason':'FINAL_GLOBAL_BOUND'})
        if not report['errors'] and not any(flags.values())and launch_valid and empty and closed_wait:report['decision']='PASS_PUBLIC_FIXED_NINE_ONLY'
        original_bytes=sum(r.get('bytes',0)for r in records)
        artifact_bytes=sum(p.stat().st_size for p in output.rglob('*')if p.is_file()and not p.is_symlink())
        raw=(json.dumps(report,sort_keys=True,indent=2)+'\n').encode()
        if original_bytes+artifact_bytes+len(raw)+RESERVE>MAX['owned']:
            write(output/'aggregate-refusal.json',{'decision':'FAIL','reason':'FINAL_ORIGINALS_COPIES_AGGREGATE','completeOuterReportWritten':False,'originalBytes':original_bytes,'artifactBytes':artifact_bytes,'cpuStat':report.get('episodeCPUStat'),'wait':waited},public=True);reject('FINAL_ORIGINALS_COPIES_AGGREGATE')
        write(output/'outer.json',raw,public=True)
        if aggregate(final_cpu,time.process_time()-cpu_start,launch_cpu)>MAX['cpu']or whole_wall(start)>=MAX['terminal']:
            write(output/'post-bound-refusal.json',{'decision':'FAIL','reason':'POST_SERIALIZATION_BOUND'},public=True);reject('POST_SERIALIZATION_BOUND')
        print('PUBLIC_FIXED_NINE_PASS'if report['decision']=='PASS_PUBLIC_FIXED_NINE_ONLY'else'PUBLIC_FIXED_NINE_FAILED',file=sys.stderr)
    return 0 if report['decision']=='PASS_PUBLIC_FIXED_NINE_ONLY'else 2

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['metadata-probe','qualify-public']);p.add_argument('--output',required=True);p.add_argument('--work-root');a=p.parse_args()
    output=Path(a.output)
    resource.setrlimit(resource.RLIMIT_CPU,(MAX['cpu'],MAX['cpu']));resource.setrlimit(resource.RLIMIT_AS,(16*1024**3,16*1024**3));resource.setrlimit(resource.RLIMIT_FSIZE,(MAX['leaf'],MAX['leaf']));resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    try:
        if a.mode=='metadata-probe':
            if a.work_root is not None or output.exists():reject('FRESH_METADATA_OUTPUT')
            output.parent.mkdir(parents=True,exist_ok=True);write(output,metadata(),public=True);print('PUBLIC_TOOL_METADATA_ONLY',file=sys.stderr);return 0
        if a.work_root is None:reject('FIXED_PUBLIC_WORK_REQUIRED')
        return qualify(Path(a.work_root),output)
    except BaseException as error:
        # Fixed public console only; exact failure remains a bounded artifact.
        if a.mode=='qualify-public' and not output.exists():
            output.mkdir(parents=True,mode=0o755);output.chmod(0o755);write(output/'admission-refusal.json',{'decision':'FAIL_BEFORE_PRIVILEGED_SETUP_OR_UNAVAILABLE','type':type(error).__name__,'reason':str(error),'traceback':traceback.format_exc(),'liveEnabled':False},public=True)
        elif a.mode=='qualify-public' and _OWNED_OUTPUT is not None:
            st=output.lstat()
            if stat.S_ISDIR(st.st_mode)and(str(output),st.st_dev,st.st_ino)==_OWNED_OUTPUT:
                write(output/'entry-error.json',{'decision':'FAIL','type':type(error).__name__,'reason':str(error),'errno':getattr(error,'errno',None),'traceback':traceback.format_exc(),'liveEnabled':False},public=True)
        elif a.mode=='metadata-probe' and not output.exists():
            output.parent.mkdir(parents=True,exist_ok=True)
            write(output.with_suffix('.refusal.json'),{'decision':'PUBLIC_METADATA_FAILED','type':type(error).__name__,'reason':str(error),'errno':getattr(error,'errno',None),'traceback':traceback.format_exc(),'kernelQualification':False},public=True)
        print('PUBLIC_QUALIFICATION_REFUSED',file=sys.stderr);return 2

if __name__=='__main__':raise SystemExit(main())
