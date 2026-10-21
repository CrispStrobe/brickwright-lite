#!/usr/bin/python3
"""Complete real PUBLIC hosted kernel cohort. No skips and no LIVE operation."""
from pathlib import Path
import argparse
import errno
import hashlib
import importlib.util
import json
import os
import signal
import socket
import stat
import sys
import time
import traceback

HERE = Path(__file__).resolve().parent

def sha(path):
    value = hashlib.sha256()
    with open(path, 'rb') as stream:
        for piece in iter(lambda: stream.read(65536), b''): value.update(piece)
    return value.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--controller-sha256', required=True)
    parser.add_argument('--bwrap-sha256', required=True)
    parser.add_argument('--python-sha256', required=True)
    parser.add_argument('--episode-cgroup-fd', type=int, required=True)
    args = parser.parse_args()
    output = Path(args.output)
    if not output.is_absolute() or output.exists() or output.is_symlink(): raise ValueError('FRESH_OUTPUT_REQUIRED')
    # Public synthetic inputs only; search permission lets the dropped host UID
    # demonstrate that the world-readable host marker WOULD be accessible if
    # the host root were accidentally exposed. Captures/results stay private.
    output.mkdir(mode=0o711); output.chmod(0o711)
    began, cpu_began = time.monotonic(), time.process_time()
    report = {'schema': 'brickwright/hosted-public-qualification/v1', 'decision': 'FAIL', 'liveEnabled': False, 'cases': [], 'errors': [], 'trustedSetupChildCPU': 0.0}
    tcp = unix = episode = None
    old = os.environ.get('BW_PUBLIC_CREDENTIAL_SENTINEL')
    try:
        source = HERE / 'hosted-run.py'
        if sha(source) != args.controller_sha256: raise ValueError('CONTROLLER_PIN')
        spec = importlib.util.spec_from_file_location('owned_hosted_public_controller', source)
        controller = importlib.util.module_from_spec(spec); spec.loader.exec_module(controller)
        episode = controller.episode_parent(args.episode_cgroup_fd)
        if os.geteuid() != 0 or os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
            raise ValueError('ISOLATION_UNAVAILABLE_HOSTED_ROOT_REQUIRED')
        # No corpus, real key, token or secret is acquired. These are deliberately
        # public sentinel bytes and genuine host listening sockets.
        markers = output / 'host-markers'; markers.mkdir(mode=0o755); markers.chmod(0o755)
        marker = markers / 'readable-credential.txt'; marker.write_bytes(b'public-credential-sentinel\n'); marker.chmod(0o444)
        tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM); tcp.bind(('127.0.0.1', 0)); tcp.listen(4)
        unix = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); unix.bind(str(markers / 'socket')); os.chmod(markers / 'socket', 0o777); unix.listen(4)
        for family, address, server in [(socket.AF_INET, tcp.getsockname(), tcp), (socket.AF_UNIX, str(markers / 'socket'), unix)]:
            client = socket.socket(family, socket.SOCK_STREAM); client.settimeout(.2)
            try:
                client.connect(address); accepted, _ = server.accept(); accepted.close()
            finally: client.close()
        # Prove the same dropped HOST UID can really read/connect to the host
        # markers without namespace isolation. Permission-denied fixtures could
        # otherwise create a false absence result even with host-root exposure.
        readfd, writefd = os.pipe()
        pid = os.fork()
        if pid == 0:
            os.close(readfd)
            try:
                os.setgroups([]); os.setgid(65534); os.setuid(65534)
                if marker.read_bytes() != b'public-credential-sentinel\n': raise ValueError('HOST_MARKER_BYTES')
                for family, address in [(socket.AF_INET, tcp.getsockname()), (socket.AF_UNIX, str(markers / 'socket'))]:
                    client = socket.socket(family, socket.SOCK_STREAM); client.settimeout(.2)
                    try: client.connect(address)
                    finally: client.close()
                os.write(writefd, b'{"accessible":true}')
                os._exit(0)
            except BaseException as error:
                data = json.dumps({'accessible': False, 'type': type(error).__name__, 'reason': str(error), 'errno': getattr(error, 'errno', None)}).encode()
                os.write(writefd, data[:4096]); os._exit(2)
        os.close(writefd); handle = os.pidfd_open(pid); until = time.monotonic() + 1
        try:
            while True:
                waited, status, usage = os.wait4(pid, os.WNOHANG)
                if waited: break
                if time.monotonic() >= until:
                    signal.pidfd_send_signal(handle, signal.SIGKILL); waited, status, usage = os.wait4(pid, 0); break
                time.sleep(.01)
            report['trustedSetupChildCPU'] += usage.ru_utime + usage.ru_stime
            report['hostNonrootPositive'] = {'status': status, 'observation': json.loads(os.read(readfd, 4096))}
        finally: os.close(handle); os.close(readfd)
        if status != 0 or report['hostNonrootPositive']['observation'] != {'accessible': True}: raise ValueError('HOST_MARKERS_NOT_GENUINELY_ACCESSIBLE')
        for server in [tcp, unix]:
            accepted, _ = server.accept(); accepted.close()
        os.environ['BW_PUBLIC_CREDENTIAL_SENTINEL'] = 'public-credential-sentinel'
        marker_config = {'tcpPort': tcp.getsockname()[1], 'unixPath': str(markers / 'socket'), 'filePath': str(marker), 'environmentName': 'BW_PUBLIC_CREDENTIAL_SENTINEL'}
        for mode in controller.MODES:
            limits = {'cpu': 2.0, 'term': 3.0, 'kill': 3.25, 'terminal': 4.0}
            if mode == 'cpu': limits = {'cpu': .7, 'term': 2.0, 'kill': 2.25, 'terminal': 3.0}
            if mode == 'wall': limits = {'cpu': 2.0, 'term': .8, 'kill': 1.05, 'terminal': 2.0}
            case = controller.run_public_probe({'mode': mode, 'workRoot': str(output / mode), 'source': str(source),
                'sourceSHA256': args.controller_sha256, 'bwrap': '/usr/bin/bwrap', 'bwrapSHA256': args.bwrap_sha256,
                'pythonSHA256': args.python_sha256, 'limits': limits, 'marker': marker_config}, episode=episode)
            report['cases'].append({'mode': mode, 'result': str(output / mode / 'result.json'), 'sha256': sha(output / mode / 'result.json')})
            if not case.get('finalGroupEmpty') or not case.get('finalECHILD'): raise ValueError('INCOMPLETE_KERNEL_TERMINAL')
            raw = output / mode / 'retained-capture/stdout.bin'
            records = [json.loads(line) for line in raw.read_text().splitlines()]
            if mode == 'boundary':
                if case['errors'] or case['wait']['exit'] != 0 or any(case['flags'].values()): raise ValueError('BOUNDARY_OPERATION')
                if len(records) != 1: raise ValueError('BOUNDARY_REPORT')
                r = records[0]
                if r['uid'] != 1000 or r['gid'] != 1000 or r['groups'] or r['noNewPrivs'] != '1' or any(int(v, 16) for v in r['caps'].values()): raise ValueError('KERNEL_PRIVILEGES')
                if any(r['namespaces'][k] == r['hostNamespaces'][k] for k in ['user', 'mnt', 'pid', 'net', 'cgroup']): raise ValueError('NAMESPACE_IDENTITY')
                if not r['environmentAbsent'] or any(r['hostReads'].values()) or any(r['writes'].values()) or any(r['network'].values()) or not r['scratchWrite']: raise ValueError('ACTUAL_BOUNDARY_ESCAPE')
                if set(r['fds']) != {'0', '1', '2'}: raise ValueError('UNEXPECTED_INHERITED_FD')
                if r['cgroup'].strip() != '0::/' or any(v['return'] != -1 or v['errno'] != errno.EPERM for v in r['namespaceDenials'].values()): raise ValueError('KERNEL_NAMESPACE_ESCAPE')
                rw = {m['point'] for m in r['mounts'] if 'rw' in m['options'].split(',')}
                if rw != {'/scratch'}: raise ValueError('UNBOUNDED_WRITABLE_MOUNT')
                for server in [tcp, unix]:
                    server.setblocking(False)
                    try:
                        unexpected, _ = server.accept(); unexpected.close(); raise ValueError('HOST_MARKER_WAS_CONTACTED')
                    except BlockingIOError: pass
            elif mode in ['bytes', 'inodes', 'leaf']:
                if case['errors'] or case['wait']['exit'] != 0 or any(case['flags'].values()) or len(records) != 1: raise ValueError('QUOTA_OPERATION')
                if records[0].get('errno') != (errno.EFBIG if mode == 'leaf' else errno.ENOSPC): raise ValueError('REAL_QUOTA_NOT_REACHED')
            elif mode == 'pids':
                if case['errors'] or case['wait']['exit'] != 0 or any(case['flags'].values()) or len(records) != 1: raise ValueError('PIDS_OPERATION')
                if records[0].get('errno') != errno.EAGAIN or not 1 <= records[0].get('created', 0) < 32: raise ValueError('REAL_PIDS_LIMIT')
                events = dict(line.split() for line in case['pidsEvents'].splitlines())
                if int(events['max']) < 1: raise ValueError('KERNEL_PIDS_EVENT')
            elif mode == 'cpu-reaped':
                if case['errors'] or case['wait']['exit'] != 0 or any(case['flags'].values()) or len(records) != 1: raise ValueError('COMPLETED_CHILD_OPERATION')
                r = records[0]
                if r.get('actualDetachedChildAutoreaped') is not True or r['childPid'] != r['childSession'] or r['childPid'] == r['parentPid']: raise ValueError('COMPLETED_CHILD_NOT_DETACHED_AUTOREAPED')
                if not .15 <= r['childCPU'] < .3 or not 0 <= r['parentCPU'] < .1: raise ValueError('COMPLETED_CHILD_CPU_WITNESS')
                kernel = dict(line.split() for line in case['cpuStat'].splitlines())
                if int(kernel['usage_usec']) / 1000000 < r['childCPU'] + r['parentCPU']: raise ValueError('AUTOREAPED_CPU_NOT_CHARGED')
            elif mode == 'cpu':
                if case['errors'] or not case['flags']['cpu'] or case['flags']['term'] or case['flags']['kill'] or case['aggregateCPU'] > limits['cpu']: raise ValueError('DESCENDANT_ONLY_CPU_CONTROL')
                if not records or records[0].get('kind') != 'parent-sleeps': raise ValueError('SLEEPING_PARENT_NOT_REACHED')
                progress = records[1:]
                if not progress or max(r['childCPU'] for r in progress) < .3: raise ValueError('DETACHED_CHILD_CPU_NOT_OBSERVED')
                if records[0]['parentCPU'] >= .1 or case['observerCPU'] >= .15: raise ValueError('ROOT_ONLY_ACCOUNTING_COUNTERFACTUAL')
                for r in progress:
                    if r.get('mode') != 'cpu' or r.get('kind') != 'detached-progress' or r['childPid'] != r['childSession'] or r['childSession'] == r['parentSession'] or r['parentPid'] != records[0]['parentPid'] or not 0 <= r['parentCPU'] < .1: raise ValueError('DETACHED_CHILD_PARENT_CPU_WITNESS')
                if case['payloadCPU'] < max(r['childCPU'] for r in progress): raise ValueError('DETACHED_CPU_NOT_CHARGED')
            elif mode == 'wall':
                if case['errors'] or not case['flags']['term'] or not case['flags']['kill']: raise ValueError('REAL_KILL_CONTROL')
            elif mode == 'symlink':
                refusals = [r for snapshot in case['snapshots'] for r in snapshot['records'] if r.get('refusal')]
                if {r['name'] for r in refusals} != {'forbidden-link', 'forbidden-fifo'}: raise ValueError('REAL_NONREGULAR_CONTROL')
                if any(set(e) != {'collectionRefusal'} for e in case['errors']) or len(case['errors']) != 2: raise ValueError('COLLECTOR_REFUSAL_SHAPE')
            if marker.read_bytes() != b'public-credential-sentinel\n' or sha(source) != args.controller_sha256: raise ValueError('HOST_INPUT_CHANGED')
            if time.monotonic() - began >= 30 or time.process_time() - cpu_began + report['trustedSetupChildCPU'] + sum(json.loads(Path(c['result']).read_bytes()).get('payloadCPU', 0) for c in report['cases']) > 25:
                raise ValueError('COMPLETE_SYNTHETIC_COHORT_RESOURCE_CAP')
        report['decision'] = 'PASS_PUBLIC_SYNTHETIC_HOSTED_ISOLATION_ONLY'
    except BaseException as error:
        report['errors'].append({'type': type(error).__name__, 'reason': str(error), 'errno': getattr(error, 'errno', None), 'traceback': traceback.format_exc()})
    finally:
        if old is None: os.environ.pop('BW_PUBLIC_CREDENTIAL_SENTINEL', None)
        else: os.environ['BW_PUBLIC_CREDENTIAL_SENTINEL'] = old
        if tcp is not None: tcp.close()
        if unix is not None: unix.close()
        if episode is not None: os.close(episode['fd'])
        # Deliberately retain public marker file/socket inode and every original
        # failure/capture. No recursive deletion and no replacement of failures.
        report['wall'] = time.monotonic() - began; report['observerCPU'] = time.process_time() - cpu_began
        report['aggregateCPU'] = report['observerCPU'] + report['trustedSetupChildCPU'] + sum(json.loads(Path(c['result']).read_bytes()).get('payloadCPU', 0) for c in report['cases'])
        total = sum(p.stat().st_size for p in output.rglob('*') if p.is_file() and not p.is_symlink())
        if report['aggregateCPU'] > 25 or report['wall'] >= 35 or total > 64 * 1024**2: report['decision'] = 'FAIL'; report['errors'].append({'reason': 'FINAL_WHOLE_COHORT_BOUND'})
        data = (json.dumps(report, indent=2) + '\n').encode()
        fd = os.open(output / 'qualification.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            view = memoryview(data)
            while view:
                count = os.write(fd, view)
                if count <= 0: raise OSError('QUALIFICATION_SHORT_WRITE')
                view = view[count:]
        finally: os.close(fd)
        print('PUBLIC_HOSTED_ISOLATION_PASS' if report['decision'].startswith('PASS_') else 'ISOLATION_UNAVAILABLE_OR_FAILED', file=sys.stderr)
    return 0 if report['decision'].startswith('PASS_') else 2

if __name__ == '__main__':
    result = main()
    raise SystemExit(result)
