#!/usr/bin/python3
"""Hosted PUBLIC synthetic isolation primitive. No converter or LIVE entry exists."""
from pathlib import Path
import ctypes
import errno
import hashlib
import json
import os
import platform
import re
import resource
import signal
import stat
import subprocess
import sys
import time
import traceback

HOSTED_MAX = {"cpu": 600.0, "term": 900.0, "kill": 903.0, "terminal": 905.0}
MODES = ("boundary", "bytes", "inodes", "leaf", "pids", "cpu-reaped", "cpu", "wall", "symlink")
HOST_UID = HOST_GID = 65534
NS_UID = NS_GID = 1000
TMPFS_MAGIC = 0x01021994
CGROUP2_MAGIC = 0x63677270
LEAF = 4096
SCRATCH_BYTES = 65536
SCRATCH_INODES = 32
CAPTURE_BYTES = 262144
CAPTURE_INODES = 32
OWNED = 64 * 1024 * 1024
LIBC = None

class Refused(Exception):
    pass

def fail(code):
    raise Refused(code)

def native():
    global LIBC
    if LIBC is None:
        LIBC = ctypes.CDLL(None, use_errno=True)
        LIBC.mount.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_ulong, ctypes.c_char_p]
        LIBC.mount.restype = ctypes.c_int
        LIBC.umount2.argtypes = [ctypes.c_char_p, ctypes.c_int]
        LIBC.umount2.restype = ctypes.c_int
    return LIBC

def digest(path):
    result = hashlib.sha256()
    with open(path, 'rb') as stream:
        for part in iter(lambda: stream.read(65536), b''):
            result.update(part)
    return result.hexdigest()

def exact_object(value, names):
    if type(value) is not dict or set(value) != set(names):
        fail('SPEC_KEYS')

def validate(spec):
    exact_object(spec, ['mode', 'workRoot', 'source', 'sourceSHA256', 'bwrap', 'bwrapSHA256', 'pythonSHA256', 'limits', 'marker'])
    if spec['mode'] not in MODES:
        fail('PUBLIC_MODE_ONLY_LIVE_REFUSED')
    for key in ['workRoot', 'source', 'bwrap']:
        if type(spec[key]) is not str or not spec[key].startswith('/') or str(Path(spec[key])) != spec[key] or '..' in Path(spec[key]).parts:
            fail('SPEC_PATH')
    if spec['bwrap'] != '/usr/bin/bwrap' or spec['source'] != str(Path(__file__).resolve()):
        fail('FIXED_TOOL_OR_SOURCE')
    for key in ['sourceSHA256', 'bwrapSHA256', 'pythonSHA256']:
        if type(spec[key]) is not str or not re.fullmatch('[0-9a-f]{64}', spec[key]):
            fail('SPEC_PIN')
    exact_object(spec['limits'], HOSTED_MAX)
    limits = spec['limits']
    if any(type(limits[k]) not in (int, float) or not 0 < limits[k] <= HOSTED_MAX[k] for k in HOSTED_MAX):
        fail('LIMIT_MAXIMUM')
    if not limits['cpu'] >= .1 or not limits['term'] < limits['kill'] < limits['terminal']:
        fail('LIMIT_ORDER')
    exact_object(spec['marker'], ['tcpPort', 'unixPath', 'filePath', 'environmentName'])
    m = spec['marker']
    if type(m['tcpPort']) is not int or not 1024 <= m['tcpPort'] <= 65535 or m['environmentName'] != 'BW_PUBLIC_CREDENTIAL_SENTINEL':
        fail('MARKER_SCHEMA')
    for name in ['unixPath', 'filePath']:
        if type(m[name]) is not str or not m[name].startswith('/'):
            fail('MARKER_PATH')
    return spec

def no_links(path):
    p = Path(path)
    for item in [p, *p.parents]:
        if item.is_symlink():
            fail('SYMLINK_ANCESTOR')

def write_json(path, value):
    data = (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()
    if len(data) > 8 * 1024 * 1024:
        fail('RESULT_LEAF')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        view = memoryview(data)
        while view:
            count = os.write(fd, view)
            if count <= 0:
                fail('RESULT_SHORT_WRITE')
            view = view[count:]
    finally:
        os.close(fd)

def fs_type(path):
    # Linux statfs has an architecture-native first long f_type. Keep ample
    # storage for the complete result and use only the declared first field.
    values = (ctypes.c_long * 64)()
    if native().statfs(os.fsencode(path), ctypes.byref(values)) != 0:
        raise OSError(ctypes.get_errno(), 'statfs')
    return values[0]

def mount_tmpfs(path, size, inodes, uid, mounts):
    if native().mount(b'tmpfs', os.fsencode(path), b'tmpfs', 2 | 4 | 8,
                      f'size={size},nr_inodes={inodes},mode=0700,uid={uid},gid={uid}'.encode()) != 0:
        raise OSError(ctypes.get_errno(), 'HOSTED_TMPFS_UNAVAILABLE')
    mounts.append(path)  # Own a successful mount before any later readback can fail.
    fs = os.statvfs(path)
    if fs_type(path) != TMPFS_MAGIC or fs.f_blocks * fs.f_frsize > size or fs.f_files > inodes:
        fail('ACTUAL_TMPFS_BOUND')
    return {'bytes': fs.f_blocks * fs.f_frsize, 'inodes': fs.f_files, 'device': path.stat().st_dev}

def cpu_group(group):
    values = dict(line.split() for line in (group / 'cpu.stat').read_text().splitlines())
    return int(values['usage_usec']) / 1000000

def populated(group):
    return dict(line.split() for line in (group / 'cgroup.events').read_text().splitlines())['populated'] == '1'

def term_python_payload(group):
    # Only the genuine fixed public Python payload gets TERM. Killing bwrap's
    # launcher would itself kill the namespace and make the ignore-TERM control
    # vacuous. All final teardown uses cgroup.kill, including the launcher.
    expected = '0::/' + str(group.relative_to('/sys/fs/cgroup'))
    signaled = []
    for text in (group / 'cgroup.procs').read_text().split():
        pid = int(text)
        try:
            executable = Path('/proc/' + text + '/exe').resolve(strict=True)
            if executable != Path('/usr/bin/python3').resolve(): continue
            fd = os.pidfd_open(pid)
            try:
                if expected not in Path('/proc/' + text + '/cgroup').read_text().splitlines():
                    fail('TERM_MEMBERSHIP_CHANGED')
                if text not in (group / 'cgroup.procs').read_text().split():
                    fail('TERM_MEMBERSHIP_LOST')
                signal.pidfd_send_signal(fd, signal.SIGTERM); signaled.append(pid)
            finally: os.close(fd)
        except ProcessLookupError: continue
    if not signaled: fail('ACTUAL_PYTHON_TERM_TARGET_ABSENT')
    return signaled

def same_body(path, size, expected):
    st = path.lstat()
    return stat.S_ISREG(st.st_mode) and st.st_size == size and digest(path) == expected

def stable_stat(st):
    return (st.st_dev, st.st_ino, st.st_mode, st.st_nlink, st.st_uid, st.st_gid, st.st_size, st.st_mtime_ns, st.st_ctime_ns)

def inventory(root):
    """No-follow finite metadata + regular body collector, including refusals."""
    records, count, total = [], 0, 0
    def visit(directory, prefix=''):
        nonlocal count, total
        for name in sorted(os.listdir(directory)):
            count += 1
            if count > 4096:
                fail('COLLECTION_NODE_CAP')
            fd = os.open(name, os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
            try:
                st = os.fstat(fd); logical = prefix + name
                item = {'name': logical, 'mode': stat.S_IFMT(st.st_mode), 'bytes': st.st_size, 'inode': st.st_ino,
                        'permissions': stat.S_IMODE(st.st_mode), 'uid': st.st_uid, 'gid': st.st_gid, 'links': st.st_nlink,
                        'device': st.st_dev, 'mtimeNs': st.st_mtime_ns, 'ctimeNs': st.st_ctime_ns}
                if stat.S_ISDIR(st.st_mode):
                    sub = os.open('/proc/self/fd/' + str(fd), os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
                    try: visit(sub, logical + '/')
                    finally: os.close(sub)
                elif stat.S_ISREG(st.st_mode):
                    if st.st_nlink != 1 or st.st_size > 8 * 1024 * 1024:
                        fail('COLLECTION_REGULAR_BOUND')
                    total += st.st_size
                    if total > OWNED:
                        fail('COLLECTION_BYTE_CAP')
                    bodyfd = os.open('/proc/self/fd/' + str(fd), os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
                    try:
                        data = bytearray(st.st_size); at = 0
                        while at < len(data):
                            part = os.pread(bodyfd, min(65536, len(data) - at), at)
                            if not part: fail('COLLECTION_SHORT_READ')
                            data[at:at + len(part)] = part; at += len(part)
                        if os.pread(bodyfd, 1, at) or stable_stat(os.fstat(bodyfd)) != stable_stat(st):
                            fail('COLLECTION_MUTATED')
                    finally: os.close(bodyfd)
                    item['sha256'] = hashlib.sha256(data).hexdigest()
                else:
                    if stat.S_ISLNK(st.st_mode): item['link'] = os.readlink(name, dir_fd=directory)
                    # Preserve original type/name; never open a FIFO/device for
                    # reading. Caller must treat nonregular as a failed result.
                    item['refusal'] = 'NONREGULAR'
                records.append(item)
            finally: os.close(fd)
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try: visit(fd)
    finally: os.close(fd)
    return records

def episode_parent(fd):
    """Trusted fixed outer's inherited cgroup FD; not a caller path certificate."""
    if type(fd) is not int or not 3 <= fd <= 4096: fail('EPISODE_FD')
    st = os.fstat(fd)
    path = Path(os.readlink('/proc/self/fd/' + str(fd)))
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or path != Path('/sys/fs/cgroup') / ('bw-public-episode-' + str(os.getppid())):
        fail('EPISODE_FD_ORIGIN')
    current = path.stat()
    if (st.st_dev, st.st_ino) != (current.st_dev, current.st_ino) or fs_type(path) != CGROUP2_MAGIC:
        fail('EPISODE_KERNEL_IDENTITY')
    own = Path('/proc/self/cgroup').read_text().splitlines()
    if '0::/' + str(path.relative_to('/sys/fs/cgroup')) + '/controller' not in own:
        fail('EPISODE_CONTROLLER_MEMBERSHIP')
    if (path / 'cgroup.procs').read_text().strip() or not {'cpu','memory','pids'} <= set((path / 'cgroup.subtree_control').read_text().split()):
        fail('EPISODE_PARENT_POLICY')
    os.set_inheritable(fd, False)
    return {'path': path, 'fd': fd, 'identity': (st.st_dev, st.st_ino)}

def checked_episode(context):
    if type(context) is not dict or set(context) != {'path','fd','identity'}: fail('EPISODE_CONTEXT')
    st = os.fstat(context['fd']); current = context['path'].stat()
    if (st.st_dev,st.st_ino) != context['identity'] or (current.st_dev,current.st_ino) != context['identity'] or fs_type(context['path']) != CGROUP2_MAGIC:
        fail('EPISODE_PARENT_CHANGED')
    return context['path']

def run_public_probe(spec, *, episode=None):
    spec = validate(spec)
    if os.geteuid() != 0 or os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
        fail('ISOLATION_UNAVAILABLE_HOSTED_ROOT_REQUIRED')
    if platform.machine() != 'x86_64' or not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        fail('ISOLATION_UNAVAILABLE_KERNEL_API')
    if digest('/usr/bin/python3') != spec['pythonSHA256'] or digest(spec['source']) != spec['sourceSHA256'] or digest(spec['bwrap']) != spec['bwrapSHA256']:
        fail('HOSTED_TOOL_CHANGED')
    if Path(spec['bwrap']).stat().st_mode & (stat.S_ISUID | stat.S_ISGID):
        fail('SETUID_TOOL_REFUSED')
    work = Path(spec['workRoot']); no_links(work.parent)
    if work.exists() or work.is_symlink(): fail('FRESH_PUBLIC_WORK_REQUIRED')
    work.mkdir(mode=0o711); work.chmod(0o711)
    start, own_start = time.monotonic(), time.process_time()
    limits = spec['limits']; mounts = []; group = parent = child = pidfd = stdout = stderr = None
    result = {'schema': 'brickwright/hosted-public-isolation/v1', 'mode': spec['mode'], 'status': 'FAIL',
              'liveEnabled': False, 'errors': [], 'flags': {'cpu': False, 'term': False, 'kill': False}}
    try:
        if native().prctl(36, 1, 0, 0, 0) != 0: fail('SUBREAPER_UNAVAILABLE')
        # Only a fresh, empty owned subtree is changed. Never enable controllers
        # in the host root or alter a kernel/AppArmor/sysctl policy.
        base = checked_episode(episode) if episode is not None else Path('/sys/fs/cgroup')
        if fs_type(base) != CGROUP2_MAGIC: fail('ISOLATION_UNAVAILABLE_CGROUP2')
        parent = base / ('bw-public-' + str(os.getpid()) + '-' + str(time.monotonic_ns()))
        parent.mkdir(); available = set((parent / 'cgroup.controllers').read_text().split())
        if not {'cpu', 'memory', 'pids'} <= available: fail('ISOLATION_UNAVAILABLE_CONTROLLERS')
        (parent / 'cgroup.subtree_control').write_text('+cpu +memory +pids')
        group = parent / 'payload'; group.mkdir()
        for name, value in [('cpu.max', '100000 100000'), ('memory.max', str(256 * 1024**2)), ('memory.swap.max', '0'), ('pids.max', '32')]:
            (group / name).write_text(value)
            if (group / name).read_text().strip() != value: fail('CGROUP_LIMIT_READBACK')
        result['cgroupIdentity'] = {'device': group.stat().st_dev, 'inode': group.stat().st_ino}
        result['episodeParent'] = str(base) if episode is not None else None
        capture, scratch = work / 'capture', work / 'scratch'
        for path, size, nodes, uid in [(capture, CAPTURE_BYTES, CAPTURE_INODES, 0), (scratch, SCRATCH_BYTES, SCRATCH_INODES, HOST_UID)]:
            path.mkdir(); info = mount_tmpfs(path, size, nodes, uid, mounts)
            result[path.name + 'Capacity'] = info
        inputs = work / 'input'; inputs.mkdir(mode=0o755); inputs.chmod(0o755)
        config = dict(spec['marker'], mode=spec['mode'], hostNamespaces={k: os.readlink('/proc/self/ns/' + k) for k in ['user', 'mnt', 'pid', 'net', 'cgroup']})
        write_json(inputs / 'public.json', config); os.chmod(inputs / 'public.json', 0o444)
        (inputs / 'readonly.txt').write_bytes(b'public-readonly-input\n'); os.chmod(inputs / 'readonly.txt', 0o444)
        source = Path(spec['source']); source_before = (source.stat().st_size, digest(source))
        (scratch / 'home').mkdir(mode=0o700); (scratch / 'tmp').mkdir(mode=0o700)
        os.chown(scratch / 'home', HOST_UID, HOST_GID); os.chown(scratch / 'tmp', HOST_UID, HOST_GID)
        # Empty root, explicit interpreter/runtime base only. Never bind host /,
        # /etc, /home, /run, repository parents, Actions files, or cgroup tree.
        version = str(sys.version_info.major) + '.' + str(sys.version_info.minor)
        runtime = [('/usr/bin/python3', '/usr/bin/python3'), ('/usr/lib/python' + version, '/usr/lib/python' + version),
                   ('/lib/x86_64-linux-gnu', '/lib/x86_64-linux-gnu'), ('/usr/lib/x86_64-linux-gnu', '/usr/lib/x86_64-linux-gnu'),
                   ('/lib64/ld-linux-x86-64.so.2', '/lib64/ld-linux-x86-64.so.2')]
        if any(not Path(a).exists() for a, _ in runtime): fail('ISOLATION_UNAVAILABLE_RUNTIME_LAYOUT')
        args = [spec['bwrap'], '--unshare-user', '--unshare-pid', '--unshare-net', '--unshare-ipc', '--unshare-uts', '--unshare-cgroup',
                '--disable-userns', '--assert-userns-disabled', '--uid', str(NS_UID), '--gid', str(NS_GID),
                '--cap-drop', 'ALL', '--die-with-parent', '--new-session', '--clearenv', '--hostname', 'public-probe',
                '--dir', '/usr', '--dir', '/usr/bin', '--dir', '/usr/lib', '--dir', '/lib', '--dir', '/lib64']
        for a, b in runtime: args += ['--ro-bind', a, b]
        args += ['--ro-bind', str(source), '/probe.py', '--ro-bind', str(inputs), '/input', '--bind', str(scratch), '/scratch',
                 '--proc', '/proc', '--dev', '/dev', '--remount-ro', '/proc', '--remount-ro', '/dev', '--remount-ro', '/',
                 '--setenv', 'HOME', '/scratch/home', '--setenv', 'TMPDIR', '/scratch/tmp', '--setenv', 'LANG', 'C',
                 '--setenv', 'PATH', '/usr/bin', '--chdir', '/input', '--', '/usr/bin/python3', '-I', '-S', '-B', '/probe.py', '--inside-public-probe']
        result['argv'] = args
        stdout = os.open(capture / 'stdout.bin', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        stderr = os.open(capture / 'stderr.bin', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        def enter():
            # No public/untrusted code before membership. Trusted launch prefix
            # is separately recorded, not an arbitrary-executable exact counter.
            (group / 'cgroup.procs').write_text(str(os.getpid()))
            if str(os.getpid()) not in (group / 'cgroup.procs').read_text().split(): os._exit(121)
            resource.setrlimit(resource.RLIMIT_FSIZE, (LEAF, LEAF)); resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2, 256 * 1024**2))
            os.setgroups([]); os.setgid(HOST_GID); os.setuid(HOST_UID)
            if os.getuid() != HOST_UID or os.geteuid() != HOST_UID or os.getgroups(): os._exit(122)
            if native().prctl(38, 1, 0, 0, 0) != 0: os._exit(123)
        try:
            child = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                     env={'PATH': '/usr/bin:/bin', 'LANG': 'C'}, close_fds=True, preexec_fn=enter)
            pidfd = os.pidfd_open(child.pid)
            while True:
                done, status, usage = os.wait4(child.pid, os.WNOHANG)
                elapsed = time.monotonic() - start
                measured = cpu_group(group) + time.process_time() - own_start
                if measured >= limits['cpu'] - .02:
                    result['flags']['cpu'] = True; (group / 'cgroup.kill').write_text('1')
                if elapsed >= limits['term'] and not result['flags']['term']:
                    result['flags']['term'] = True
                    if not done: result['termPayloadPids'] = term_python_payload(group)
                if elapsed >= limits['kill'] and not result['flags']['kill']:
                    result['flags']['kill'] = True; (group / 'cgroup.kill').write_text('1')
                if done:
                    child.returncode = os.waitstatus_to_exitcode(status)
                    result['wait'] = {'exit': child.returncode, 'status': status, 'wait4CPU': usage.ru_utime + usage.ru_stime}
                    break
                if elapsed >= limits['terminal']: fail('HOSTED_TERMINAL_UNOBSERVED')
                time.sleep(.01)
            # A root exit is never group-empty evidence. Detached/autoreaped
            # descendants remain charged to cpu.stat and must be terminated.
            while populated(group):
                elapsed = time.monotonic() - start
                if cpu_group(group) + time.process_time() - own_start >= limits['cpu'] - .02: result['flags']['cpu'] = True
                if result['flags']['cpu'] or elapsed >= limits['term']:
                    (group / 'cgroup.kill').write_text('1')
                    if not result['flags']['cpu']: result['flags']['kill'] = True
                if elapsed >= limits['terminal']: fail('HOSTED_GROUP_REMAINS')
                time.sleep(.01)
            receipts = []
            while True:
                try:
                    pid, status, usage = os.wait4(-1, os.WNOHANG)
                    if not pid: fail('WAIT_CLOSURE_INCOMPLETE')
                    receipts.append({'pid': pid, 'status': status, 'CPU': usage.ru_utime + usage.ru_stime})
                except ChildProcessError: break
            result['adoptedWaits'] = receipts; result['groupEmpty'] = not populated(group); result['ECHILD'] = True
            result['cpuStat'] = (group / 'cpu.stat').read_text(); result['memoryEvents'] = (group / 'memory.events').read_text()
            result['pidsEvents'] = (group / 'pids.events').read_text()
            for name, fd in [('stdout.bin', stdout), ('stderr.bin', stderr)]:
                st = os.fstat(fd); visible = (capture / name).lstat()
                if (st.st_dev, st.st_ino) != (visible.st_dev, visible.st_ino): fail('ORIGINAL_STREAM_REPLACED')
            result['sourceUnchanged'] = same_body(source, *source_before)
            if not result['sourceUnchanged'] or (inputs / 'readonly.txt').read_bytes() != b'public-readonly-input\n': fail('SOURCE_INPUT_MUTATION')
            result['status'] = 'OBSERVED_PUBLIC_PROBE'
        finally:
            pass  # Original output FDs remain held through cleanup and collection.
    except BaseException as error:
        result['errors'].append({'type': type(error).__name__, 'reason': str(error), 'errno': getattr(error, 'errno', None), 'traceback': traceback.format_exc()})
    finally:
        if group is not None and group.exists():
            try:
                if populated(group): (group / 'cgroup.kill').write_text('1')
                until = min(start + limits['terminal'], time.monotonic() + 2)
                while populated(group) and time.monotonic() < until: time.sleep(.01)
                result['finalGroupEmpty'] = not populated(group)
                if not result['finalGroupEmpty']: result['errors'].append({'reason': 'CLEANUP_GROUP_NOT_EMPTY'})
            except BaseException as error: result['errors'].append({'cleanup': repr(error)})
        if child is not None and child.returncode is None:
            try: child.wait(timeout=max(.01, min(1, start + limits['terminal'] - time.monotonic())))
            except BaseException as error: result['errors'].append({'waitCleanup': repr(error)})
        if group is not None and group.exists() and result.get('finalGroupEmpty'):
            drained = []
            while True:
                try:
                    pid, status, usage = os.wait4(-1, os.WNOHANG)
                    if not pid:
                        result['errors'].append({'reason': 'FINAL_WAIT_NOT_ECHILD'}); break
                    drained.append({'pid': pid, 'status': status, 'CPU': usage.ru_utime + usage.ru_stime})
                except ChildProcessError:
                    result['finalECHILD'] = True; break
            result['cleanupAdoptedWaits'] = drained
        if pidfd is not None: os.close(pidfd)
        # Retain exact raw files before unmount, including failed outputs. The
        # public mode's combined original+copy capacities are below 2 MiB/case.
        snapshots = []
        for mounted in mounts:
            try:
                if not result.get('finalGroupEmpty', group is None): fail('NO_COLLECTION_WHILE_GROUP_ALIVE')
                rows = inventory(mounted); snapshots.append({'root': mounted.name, 'records': rows})
                destination = work / ('retained-' + mounted.name); destination.mkdir(mode=0o700)
                for row in rows:
                    if row.get('refusal'):
                        result['errors'].append({'collectionRefusal': row}); continue
                    if row['mode'] != stat.S_IFREG: continue
                    src = mounted / row['name']; dst = destination / row['name']; dst.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                    try:
                        data = src.read_bytes()
                        if len(data) != row['bytes'] or hashlib.sha256(data).hexdigest() != row['sha256']: fail('SNAPSHOT_COPY_CHANGED')
                        view = memoryview(data)
                        while view:
                            wrote = os.write(fd, view)
                            if wrote <= 0: fail('SNAPSHOT_SHORT_WRITE')
                            view = view[wrote:]
                    finally: os.close(fd)
                if native().umount2(os.fsencode(mounted), 0) != 0: raise OSError(ctypes.get_errno(), 'unmount')
            except BaseException as error: result['errors'].append({'snapshotCleanup': repr(error), 'traceback': traceback.format_exc()})
        for fd in [stdout, stderr]:
            if fd is not None: os.close(fd)
        result['snapshots'] = snapshots
        if group is not None and group.exists():
            try:
                result['payloadCPU'] = cpu_group(group); group.rmdir()
            except BaseException as error: result['errors'].append({'cgroupCleanup': repr(error)})
        if parent is not None and parent.exists():
            try: parent.rmdir()
            except BaseException as error: result['errors'].append({'cgroupParentCleanup': repr(error)})
        result['observerCPU'] = time.process_time() - own_start; result['wall'] = time.monotonic() - start
        result['accountingScope'] = 'Kernel cgroup counts every post-admission payload descendant including autoreaped tasks; observer CPU added. Trusted pre-exec launch prefix is setup, not certified arbitrary code or a combined setup/live budget.'
        result['aggregateCPU'] = result.get('payloadCPU', 0) + result['observerCPU']
        if result['aggregateCPU'] > limits['cpu'] or result['wall'] >= limits['terminal']: result['errors'].append({'reason': 'FINAL_RESOURCE_LIMIT'})
        if sum(p.stat().st_size for p in work.rglob('*') if p.is_file() and not p.is_symlink()) > 2 * 1024**2: result['errors'].append({'reason': 'PUBLIC_CASE_CAPTURE_CAP'})
        write_json(work / 'result.json', result)
    return result

def inside_probe():
    """Fixed PUBLIC payload only. No arbitrary script/command/input evaluation."""
    import socket
    config = json.loads(Path('/input/public.json').read_bytes()); mode = config['mode']; report = {'mode': mode}
    if mode == 'boundary':
        report['uid'] = os.getuid(); report['gid'] = os.getgid(); report['groups'] = os.getgroups()
        status = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
        report['caps'] = {k: status[k].strip() for k in ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']}
        report['noNewPrivs'] = status['NoNewPrivs'].strip()
        report['namespaces'] = {k: os.readlink('/proc/self/ns/' + k) for k in ['user', 'mnt', 'pid', 'net', 'cgroup']}
        report['hostNamespaces'] = config['hostNamespaces']; report['environmentAbsent'] = config['environmentName'] not in os.environ
        report['hostReads'] = {}
        for p in [config['filePath'], '/home', '/run', '/etc/shadow', '/sys/fs/cgroup', '/proc/1/root' + config['filePath']]:
            try:
                fd = os.open(p, os.O_RDONLY | os.O_NONBLOCK); os.close(fd); report['hostReads'][p] = True
            except OSError: report['hostReads'][p] = False
        report['writes'] = {}
        for p in ['/root-write', '/probe.py', '/input/readonly.txt', '/dev/regular-leak', '/proc/host-write']:
            try:
                fd = os.open(p, os.O_WRONLY | os.O_CREAT, 0o600); os.close(fd); report['writes'][p] = True
            except OSError: report['writes'][p] = False
        report['network'] = {}
        for name, family, address in [('tcp', socket.AF_INET, ('127.0.0.1', config['tcpPort'])), ('unix', socket.AF_UNIX, config['unixPath'])]:
            client = socket.socket(family, socket.SOCK_STREAM); client.settimeout(.2)
            try: client.connect(address); report['network'][name] = True
            except OSError: report['network'][name] = False
            finally: client.close()
        api = ctypes.CDLL(None, use_errno=True)
        report['namespaceDenials'] = {}
        for name, invoke in [('unshare-user', lambda: api.unshare(0x10000000)),
                             ('mount', lambda: api.mount(b'tmpfs', b'/scratch', b'tmpfs', 0, b'size=4096'))]:
            ctypes.set_errno(0); code = invoke()
            report['namespaceDenials'][name] = {'return': code, 'errno': ctypes.get_errno()}
        nsfd = os.open('/proc/self/ns/mnt', os.O_RDONLY)
        try:
            ctypes.set_errno(0); code = api.setns(nsfd, 0x20000)
            report['namespaceDenials']['setns-mount'] = {'return': code, 'errno': ctypes.get_errno()}
        finally: os.close(nsfd)
        report['cgroup'] = Path('/proc/self/cgroup').read_text()
        report['fds'] = {}
        for fd in os.listdir('/proc/self/fd'):
            try: report['fds'][fd] = os.readlink('/proc/self/fd/' + fd)
            except OSError: pass
        report['mounts'] = []
        for line in Path('/proc/self/mountinfo').read_text().splitlines():
            fields = line.split(); cut = fields.index('-')
            report['mounts'].append({'point': fields[4], 'options': fields[5], 'type': fields[cut + 1]})
        Path('/scratch/positive.txt').write_bytes(b'public-positive\n')
        report['scratchWrite'] = Path('/scratch/positive.txt').read_bytes() == b'public-positive\n'
    elif mode in ['bytes', 'inodes', 'leaf']:
        count = 0
        try:
            for i in range(256):
                with open('/scratch/fill-' + str(i), 'xb') as stream:
                    if mode == 'bytes': stream.write(b'x' * 4096)
                    elif mode == 'leaf': stream.write(b'x' * (LEAF + 1))
                count += 1
        except OSError as error: report['errno'] = error.errno
        report['created'] = count
    elif mode == 'pids':
        children = []
        try:
            for i in range(64):
                child = os.fork()
                if child == 0:
                    while True: time.sleep(.1)
                children.append(child)
        except OSError as error: report['errno'] = error.errno
        finally:
            for child in children: os.kill(child, signal.SIGKILL)
            for child in children: os.waitpid(child, 0)
        report['created'] = len(children)
    elif mode == 'cpu-reaped':
        # Positive accounting control: the parent sleeps and SIGCHLD-ignore
        # genuinely autoreaps the completed detached child. Its own CPU result
        # travels through a bounded pipe before that child exits; no wait rusage
        # or fabricated cgroup statistic is substituted for the kernel counter.
        signal.signal(signal.SIGCHLD, signal.SIG_IGN)
        readfd, writefd = os.pipe()
        child = os.fork()
        if child == 0:
            os.close(readfd); os.setsid(); began = time.process_time()
            while time.process_time() - began < .15: pass
            data = json.dumps({'childCPU': time.process_time() - began,
                               'childPid': os.getpid(), 'childSession': os.getsid(0)}).encode()
            os.write(writefd, data); os.close(writefd); os._exit(0)
        os.close(writefd)
        try:
            data = os.read(readfd, 4096)
            if os.read(readfd, 1): raise ValueError('COMPLETED_CHILD_RECORD_CAP')
        finally: os.close(readfd)
        while True:
            try: os.waitpid(child, os.WNOHANG)
            except ChildProcessError: break
            time.sleep(.005)
        report.update(json.loads(data)); report['actualDetachedChildAutoreaped'] = True
        report['parentCPU'] = time.process_time(); report['parentPid'] = os.getpid()
    elif mode == 'cpu':
        # Counterfactual root-only accounting must fail: ONLY the detached child
        # burns CPU. The original Python parent merely sleeps until termination.
        # Actual child progress includes the sleeping parent's kernel CPU ticks.
        parent = os.getpid(); parent_session = os.getsid(0)
        print(json.dumps({'mode': mode, 'kind': 'parent-sleeps', 'parentPid': parent,
                          'parentCPU': time.process_time()}), flush=True)
        child = os.fork()
        if child == 0:
            os.setsid(); began = time.process_time(); next_report = .1
            while True:
                used = time.process_time() - began
                if used >= next_report:
                    fields = Path('/proc/' + str(parent) + '/stat').read_text().rsplit(')', 1)[1].split()
                    parent_cpu = (int(fields[11]) + int(fields[12])) / os.sysconf('SC_CLK_TCK')
                    print(json.dumps({'mode': mode, 'kind': 'detached-progress', 'childCPU': used,
                                      'childPid': os.getpid(), 'childSession': os.getsid(0),
                                      'parentPid': parent, 'parentSession': parent_session,
                                      'parentCPU': parent_cpu}), flush=True)
                    next_report += .1
        while True: time.sleep(.05)
    elif mode == 'wall':
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        while True: time.sleep(.1)
    elif mode == 'symlink':
        os.symlink('/input/readonly.txt', '/scratch/forbidden-link')
        os.mkfifo('/scratch/forbidden-fifo', 0o600)
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    if sys.argv[1:] == ['--inside-public-probe']:
        inside_probe()
    else:
        # No generic CLI argv, credential, workflow or live assessment endpoint.
        print('PUBLIC_SYNTHETIC_CONTROLLER_LIBRARY_ONLY', file=sys.stderr)
        raise SystemExit(2)
