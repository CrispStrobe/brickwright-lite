#!/usr/bin/env python3
"""Build a source-bound native executable; private runtime assembly is separate.

No firmware is downloaded, built, uploaded or executed by this producer.
Compile-pin declarations are checked again against actual private resources at
installed acceptance; a successful build is not an installed-app verdict.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import zipfile

REPO = 'CrispStrobe/brickwright-lite'
LIMIT = 512 * 1024 * 1024
ROOT_PINS = {
    'BW_RENODE_RESOURCE_EXECUTABLE': 'renode/renode',
    'BW_RENODE_MICROPYTHON_RESOURCE_ROOT': 'micropython',
    'BW_RENODE_NUTTX_RESOURCE_ROOT': 'nuttx',
}
HASH_PINS = {
    'BW_RENODE_SHA256', 'BW_RENODE_MICROPYTHON_MANIFEST_SHA256',
    'BW_RENODE_NUTTX_SCENARIO_SHA256', 'BW_RENODE_NUTTX_FIRMWARE_SHA256',
    'BW_RENODE_NUTTX_STATE_SCRIPT_SHA256', 'BW_RENODE_NUTTX_STATE_CONFIG_SHA256',
    'BW_RENODE_NUTTX_MANIFEST_SHA256',
}
# A runtime with compiled Prime models needs compiled MicroPython support, and
# the launcher selects that mode only from this compile-time pin. Without it the
# executable can only run legacy source-overlay support.
OPTIONAL_HASH_PINS = {'BW_RENODE_MICROPYTHON_PROFILE_SHA256'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key')
        result[key] = value
    return result


def profile(text):
    require(isinstance(text, str) and len(text.encode()) <= 16384, 'Bounded pin declaration required')
    pins = json.loads(text, object_pairs_hook=unique_object)
    required = set(ROOT_PINS) | HASH_PINS
    require(isinstance(pins, dict) and required <= set(pins) <= required | OPTIONAL_HASH_PINS,
            'Exactly the closed resource pin vocabulary is required')
    for key, value in ROOT_PINS.items():
        require(pins[key] == value, 'Resource roots must use the fixed relative layout')
    for key in HASH_PINS | (OPTIONAL_HASH_PINS & set(pins)):
        require(isinstance(pins[key], str) and re.fullmatch('[0-9a-f]{64}', pins[key]),
                'Resource hashes must be complete lowercase SHA256 values')
    return pins


def build_request(defaults, overrides):
    require(isinstance(defaults, dict) and set(defaults) == {'consumer', 'frontend_run', 'compile_pins'},
            'Closed qualification request required')
    present = [bool(overrides.get(key)) for key in ['consumer', 'frontend_run', 'compile_pins']]
    require(all(present) or not any(present), 'Override the entire qualification request together')
    if any(present):
        require(re.fullmatch('[1-9][0-9]{0,15}', overrides['frontend_run']) is not None,
                'Positive workflow run identity required')
        request = {'consumer': overrides['consumer'], 'frontend_run': int(overrides['frontend_run']),
                   'compile_pins': profile(overrides['compile_pins'])}
    else:
        request = {**defaults, 'compile_pins': profile(json.dumps(defaults['compile_pins']))}
    require(isinstance(request['consumer'], str) and re.fullmatch('[0-9a-f]{40}', request['consumer']),
            'Full consumer commit required')
    require(type(request['frontend_run']) is int and 0 < request['frontend_run'] <= 2**53 - 1,
            'Exact positive workflow run identity required')
    return request


def request_outputs(args):
    data = Path(args.defaults).read_bytes()
    require(len(data) <= 16384, 'Bounded qualification request required')
    defaults = json.loads(data, object_pairs_hook=unique_object)
    request = build_request(defaults, {'consumer': os.environ.get('NATIVE_CONSUMER', ''),
                                     'frontend_run': os.environ.get('NATIVE_FRONTEND_RUN', ''),
                                     'compile_pins': os.environ.get('BW_NATIVE_PROFILE_PINS', '')})
    with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
        stream.write('consumer=' + request['consumer'] + '\n')
        stream.write('frontend_run=' + str(request['frontend_run']) + '\n')
        stream.write('compile_pins=' + json.dumps(request['compile_pins'], separators=(',', ':')) + '\n')


def admit_metadata(run, jobs, artifacts, head, run_id):
    require(re.fullmatch('[0-9a-f]{40}', head) is not None, 'Full consumer commit required')
    require(type(run_id) is int and run_id > 0, 'Positive workflow run identity required')
    require(run.get('id') == run_id and run.get('head_sha') == head, 'Workflow/source mismatch')
    require(run.get('repository', {}).get('full_name') == REPO, 'Foreign workflow repository')
    require(run.get('path') == '.github/workflows/build.yml', 'Official frontend workflow required')
    require(run.get('event') in ['push', 'pull_request'], 'Automatic official frontend required')
    builds = [j for j in jobs if j.get('name') == 'build']
    require(len(builds) == 1 and builds[0].get('conclusion') == 'success' and
            builds[0].get('head_sha') == head and builds[0].get('run_id') == run_id,
            'One successful same-source build job required')
    selected = [a for a in artifacts if a.get('name') == 'github-pages' and a.get('expired') is False]
    require(len(selected) == 1, 'One unexpired official frontend artifact required')
    artifact = selected[0]
    require(artifact.get('workflow_run', {}).get('id') == run_id and
            artifact.get('workflow_run', {}).get('head_sha') == head,
            'Artifact/source mismatch')
    require(type(artifact.get('id')) is int and artifact['id'] > 0 and
            type(artifact.get('size_in_bytes')) is int and
            0 < artifact['size_in_bytes'] <= LIMIT // 2 and
            re.fullmatch('sha256:[0-9a-f]{64}', artifact.get('digest', '')),
            'Bounded artifact with publisher SHA256 required')
    return builds[0], artifact


def extract_frontend(archive, artifact, destination):
    require(archive.stat().st_size == artifact['size_in_bytes'] and
            sha(archive.read_bytes()) == artifact['digest'].split(':')[1], 'Archive integrity mismatch')
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        require(len(entries) == 1 and entries[0].filename == 'artifact.tar' and
                not stat.S_ISLNK(entries[0].external_attr >> 16) and
                0 < entries[0].file_size <= LIMIT, 'One bounded regular artifact.tar required')
        with z.open(entries[0]) as stream:
            tar_bytes = stream.read(LIMIT + 1)
    require(len(tar_bytes) <= LIMIT, 'Frontend archive exceeds bounds')
    # Validate the whole roster before writing any member, including aliases.
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode='r:') as tar:
        members = tar.getmembers()
        require(len(members) <= 30000, 'Too many frontend members')
        names, total = set(), 0
        for member in members:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in member.name and
                    (member.isdir() or member.isfile()), 'Unsafe frontend member')
            key = str(path)
            require(key not in names, 'Duplicate frontend member')
            names.add(key)
            require(member.size >= 0 and member.size <= LIMIT, 'Oversized frontend member')
            total += member.size
            require(total <= LIMIT, 'Frontend exceeds bounds')
        destination.mkdir()
        inventory = {}
        for member in members:
            path = PurePosixPath(member.name)
            target = destination.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as stream:
                data = stream.read(member.size + 1)
            require(len(data) == member.size, 'Truncated frontend member')
            with target.open('xb') as output:
                output.write(data)
            inventory[str(path)] = sha(data)
    require({'index.html', 'capability-broker.html', 'brickwright-build.json'} <= inventory.keys(),
            'Complete real editor and broker frontend required')
    return inventory


def checkout_from_log(text):
    lines = text.splitlines()
    boundary = next((i for i, line in enumerate(lines) if '##[group]Run actions/setup-node@' in line), None)
    require(boundary is not None and any('Syncing repository: ' + REPO in x for x in lines[:boundary]),
            'Primary official checkout log required')
    positions = [i for i, line in enumerate(lines[:boundary]) if 'git log -1 --format=%H' in line]
    require(len(positions) == 1 and positions[0] + 1 < boundary, 'Unambiguous checkout identity required')
    match = re.search(r'\b([a-f0-9]{40})\s*$', lines[positions[0] + 1])
    require(match is not None, 'Complete checkout commit required')
    return match.group(1)


def prose_only(paths):
    return all((p.startswith('docs/') or p.startswith('lanes/')) and p.endswith('.md') for p in paths)


def verify_tree(root, expected):
    actual = {}
    for path in root.rglob('*'):
        require(not path.is_symlink(), 'Input tree contains a link')
        if path.is_file():
            name = path.relative_to(root).as_posix()
            require(name in expected, 'Input tree contains an unrecorded file')
            actual[name] = sha(path.read_bytes())
        else:
            require(path.is_dir(), 'Input tree contains a special entry')
    require(actual == expected, 'Input tree changed or lost a recorded file')


def command(*args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, text=True, timeout=120).strip()


def api(path):
    command = ['gh', 'api', 'repos/' + REPO + '/' + path]
    if re.fullmatch(r'actions/jobs/[1-9][0-9]*/logs', path):
        # Preserve the official original in a captured byte stream, never a terminal.
        command.append('--allow-escape-sequences')
    return subprocess.check_output(command, timeout=120)


def prepare(args):
    pins = profile(os.environ.get('BW_NATIVE_PROFILE_PINS', ''))
    consumer, output = Path(args.consumer).resolve(), Path(args.output).resolve()
    require(command('git', 'rev-parse', 'HEAD', cwd=consumer) == args.head, 'Consumer checkout changed')
    require(not command('git', 'status', '--porcelain', '--untracked-files=no', cwd=consumer),
            'Consumer tracked source is dirty')
    require(not output.exists(), 'Preserve prior attempts; output already exists')
    require(output != consumer and not output.is_relative_to(consumer), 'Keep output outside consumer source')
    raw_run = api('actions/runs/' + str(args.frontend_run))
    raw_jobs = api('actions/runs/' + str(args.frontend_run) + '/jobs?per_page=100')
    raw_artifacts = api('actions/runs/' + str(args.frontend_run) + '/artifacts?per_page=100')
    run, jobs, artifacts = json.loads(raw_run), json.loads(raw_jobs), json.loads(raw_artifacts)
    require(jobs['total_count'] <= 100 and artifacts['total_count'] <= 100, 'Unexpected paginated roster')
    build, artifact = admit_metadata(run, jobs['jobs'], artifacts['artifacts'], args.head, args.frontend_run)
    output.mkdir(mode=0o700)
    for name, data in [('run.json', raw_run), ('jobs.json', raw_jobs), ('artifacts.json', raw_artifacts)]:
        (output / name).write_bytes(data)
    log = api('actions/jobs/' + str(build['id']) + '/logs')
    (output / 'build-job.log').write_bytes(log)
    checkout = checkout_from_log(log.decode())
    if subprocess.run(['git', 'cat-file', '-e', checkout + '^{commit}'], cwd=consumer,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        command('git', 'fetch', '--no-tags', 'https://github.com/' + REPO + '.git', checkout, cwd=consumer)
    changes = command('git', 'diff', '--name-only', args.head, checkout, cwd=consumer).splitlines()
    require(prose_only(changes), 'CI checkout has implementation differences; do not rebind it')
    archive = output / 'github-pages.zip'
    with archive.open('xb') as stream:
        subprocess.run(['gh', 'api', 'repos/' + REPO + '/actions/artifacts/' + str(artifact['id']) + '/zip'],
                       stdout=stream, check=True, timeout=300)
    inventory = extract_frontend(archive, artifact, output / 'frontend')
    stamp = json.loads((output / 'frontend/brickwright-build.json').read_text())
    stamped = stamp.get('commit', '')
    require(stamp.get('product') == 'Brickwright' and isinstance(stamped, str) and
            re.fullmatch('[0-9a-f]{7,40}', stamped) and checkout.startswith(stamped),
            'Embedded frontend stamp does not match the actual CI checkout')
    native = output / 'source'
    names = command('git', 'ls-files', 'apps/tauri/src-tauri', cwd=consumer).splitlines()
    names += ['overlay/scratch-vm/src/extension-support/native-broker-protocol.js',
              'overlay/scratch-gui/static/native-broker/native-broker-host.js']
    sources = {}
    for name in names:
        source = consumer / name
        require(source.is_file() and not source.is_symlink(), 'Native source must be regular tracked files')
        data = source.read_bytes()
        target = native / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        sources[name] = sha(data)
    manifest = native / 'apps/tauri/src-tauri/Cargo.toml'
    text = manifest.read_text()
    original = 'crate-type = ["staticlib", "cdylib", "rlib"]'
    require(text.count(original) == 1, 'Unexpected desktop library profile')
    manifest.write_text(text.replace(original, 'crate-type = ["rlib"]'))
    producer = Path(__file__).resolve().parents[1]
    receipt = {'schema': 1, 'consumer': args.head, 'ciCheckout': checkout, 'proseDifferences': changes,
               'run': args.frontend_run, 'artifact': artifact, 'frontend': inventory,
               'nativeSources': sources, 'desktopManifestSha256': sha(manifest.read_bytes()),
               'producer': {'commit': command('git', 'rev-parse', 'HEAD', cwd=producer),
                            'helperSha256': sha(Path(__file__).read_bytes()),
                            'requestSha256': sha((producer / 'scripts/native-installed-qualification-profile.json').read_bytes()),
                            'workflowSha256': sha((producer / '.github/workflows/native-installed-qualification.yml').read_bytes())},
               'compilePins': pins, 'scope': 'Build inputs only; runtime resource and installed acceptance remain required'}
    (output / 'inputs.json').write_text(json.dumps(receipt, indent=2) + '\n')


def build(args):
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_REPOSITORY') == REPO and
            os.environ.get('GITHUB_JOB') == 'executable' and
            os.environ.get('GITHUB_WORKFLOW_REF', '').startswith(
                REPO + '/.github/workflows/native-installed-qualification.yml@'),
            'Native compilation requires the declared hosted qualification job')
    require(sys.platform == 'linux' and platform.machine() == 'x86_64', 'Linux x86_64 build host required')
    output = Path(args.output).resolve()
    require(not (output / 'result').exists() and not (output / 'target').exists(),
            'Preserve prior native build attempts')
    receipt = json.loads((output / 'inputs.json').read_text())
    producer = Path(__file__).resolve().parents[1]
    require(receipt['producer']['commit'] == command('git', 'rev-parse', 'HEAD', cwd=producer) and
            receipt['producer']['helperSha256'] == sha(Path(__file__).read_bytes()) and
            receipt['producer']['requestSha256'] == sha((producer / 'scripts/native-installed-qualification-profile.json').read_bytes()) and
            receipt['producer']['workflowSha256'] == sha((producer / '.github/workflows/native-installed-qualification.yml').read_bytes()),
            'Qualification producer changed after input admission')
    pins = profile(json.dumps(receipt['compilePins']))
    manifest = output / 'source/apps/tauri/src-tauri/Cargo.toml'
    require(sha(manifest.read_bytes()) == receipt['desktopManifestSha256'], 'Desktop profile changed')
    sources = {**receipt['nativeSources'], 'apps/tauri/src-tauri/Cargo.toml': receipt['desktopManifestSha256']}
    verify_tree(output / 'source', sources)
    verify_tree(output / 'frontend', receipt['frontend'])
    # No firmware files are transferred to hosted CI. This executable is bound
    # to declared resource hashes, then assembled and independently verified with
    # the actual private resource closure on the direct test host.
    env = {k: v for k, v in os.environ.items()
           if not k.startswith('BW_RENODE_') and k not in ['GH_TOKEN', 'GITHUB_TOKEN', 'BW_NATIVE_PROFILE_PINS']}
    env.update(pins)
    env.update({'TAURI_CONFIG': json.dumps({'build': {'frontendDist': str(output / 'frontend')},
                                          'bundle': {'resources': {}}}),
                'CARGO_TARGET_DIR': str(output / 'target'), 'CARGO_BUILD_JOBS': '2',
                'CARGO_PROFILE_DEV_DEBUG': '0', 'CARGO_INCREMENTAL': '0'})
    subprocess.run(['cargo', 'fetch', '--locked', '--manifest-path', str(manifest)], env=env, check=True, timeout=600)
    subprocess.run(['cargo', 'build', '--locked', '--offline', '--manifest-path', str(manifest),
                    '--features', 'custom-protocol', '--bin', 'brickwright-tauri'],
                   env=env, check=True, timeout=3600)
    binary = output / 'target/debug/brickwright-tauri'
    data = binary.read_bytes()
    require(data[:6] == b'\x7fELF\x02\x01' and int.from_bytes(data[18:20], 'little') == 62,
            'Expected a Linux x86_64 ELF executable')
    result = output / 'result'
    result.mkdir()
    shutil.copy2(binary, result / 'brickwright-tauri')
    receipt['binarySha256'] = sha(data)
    receipt['rustc'] = command('rustc', '--version', '--verbose')
    receipt['cargo'] = command('cargo', '--version')
    receipt['scope'] = 'Native executable build; no bundled runtime, firmware, installed acceptance or distribution approval'
    (result / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='operation', required=True)
    p = sub.add_parser('request')
    p.add_argument('--defaults', required=True)
    p = sub.add_parser('prepare')
    p.add_argument('--consumer', required=True)
    p.add_argument('--head', required=True)
    p.add_argument('--frontend-run', type=int, required=True)
    p.add_argument('--output', required=True)
    p = sub.add_parser('build')
    p.add_argument('--output', required=True)
    args = parser.parse_args()
    {'request': request_outputs, 'prepare': prepare, 'build': build}[args.operation](args)
