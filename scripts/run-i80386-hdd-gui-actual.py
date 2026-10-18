#!/usr/bin/env python3
"""MIT. One admitted hosted GUI attempt; never a frontend builder or media fetcher.

The independently retained request digest is authority. Repository variables and
platform fields only transport it. The source and workflow guards need separate
activation review. Inventory records metadata only; it cannot approve an actual.
"""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import resource
import selectors
import signal
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile

ACTUAL_ENABLED = False
INVENTORY_ENABLED = True
REPOSITORY = 'CrispStrobe/brickwright-lite'
LABEL = 'x86-hdd-gui-actual'
BOARD = 'f84ba60ead0a90deb9830f0c1468839c293ecf05'
CUI = '055930ec51300e0d71466c696ce1bf76284bde38'
SB3 = 'a13f92b8bc4b06f0cb9ffec22bab71f06db7ac76'
JSON_CAP = 4 << 20
STREAM_CAP = 1 << 20
FILE_CAP = 32 << 20
BUILD_CAP = 512 << 20
ARCHIVE_CAP = 256 << 20
TOTAL_SECONDS = 1800
SCENARIOS = ('freedos-hdd-persistence', 'forward-debug')
PROBE = 'scripts/verify-i80386-local-hdd-gui.mjs'
CRITICAL = ('vendor-pins.json', 'package.json', 'packages/scratch-gui/package.json',
 'node_modules/bw-board/package.json', 'node_modules/bw-board/src/i80386-debug.js',
 'node_modules/bw-board/src/i80386-adapter.js', 'node_modules/bw-board/src/i8086-cga.js',
 'scripts/lib/i80386-vga-text.mjs', 'scripts/package-provenance.mjs', PROBE,
 'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js',
 'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx',
 'packages/scratch-gui/src/lib/bw-debug/debug-runner.js',
 'packages/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx',
 'overlay/scratch-gui/src/lib/bw-machines/raw-hdd-download.js',
 'overlay/scratch-gui/src/components/tw-pseudocode/debug-drawer.jsx',
 'overlay/scratch-gui/src/lib/bw-debug/debug-capabilities.js',
 'overlay/scratch-gui/src/lib/bw-debug/memory-view.js')
SOURCE = frozenset(x for x in CRITICAL if not x.startswith('node_modules/')) | frozenset((
 'scripts/run-i80386-hdd-gui-actual.py', 'scripts/read-i80386-hdd-gui-originals.py',
 'test/i80386-hdd-gui-actual.test.mjs', '.github/workflows/i80386-hdd-gui-actual.yml',
 'package-lock.json', 'scripts/lib/i80386-freedos-interaction.mjs',
 'scripts/prepare-i80386-freedos-interaction.mjs'))
INPUTS = {
 'floppy': (1228800, '03df6088be016e57a6c44275f5bb9ab0244db71de1360957fd76ba83243b6a77'),
 'hdd': (10653696, '2fa9c252f22cec4f8c5bdc82d1587293ffcaed791e0982384628d19a7316a851'),
 'bios': (65536, '6481181809b58a9f805346a7ecf9bebdaf5b322c32825fb49ee89da51552c4ac'),
 'vgaRom': (38400, '76af53f14955df3edd6365daa64393e91fafe55241c2c00384ff05b740431da1')}


def need(ok, message):
    if not ok:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode()


def decode(raw):
    need(type(raw) is bytes and len(raw) <= JSON_CAP, 'bounded JSON original')
    def pairs(items):
        out = {}
        for key, value in items:
            need(key not in out, 'duplicate JSON field'); out[key] = value
        return out
    def constant(value):
        raise ValueError('nonfinite JSON number')
    def number(token):
        value=float(token);need(-float('inf')<value<float('inf'),'finite JSON number');return value
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant,parse_float=number)


def fields(value, keys):
    need(type(value) is dict and set(value) == set(keys.split()), 'closed object fields: '+keys)


def digest(value, length=64):
    need(type(value) is str and re.fullmatch('[0-9a-f]{'+str(length)+'}', value), 'exact hexadecimal digest')


def integer(value, low, high):
    need(type(value) is int and low <= value <= high, 'bounded integer')


def relative(value):
    need(type(value) is str and 0 < len(value) <= 512 and not value.startswith('/') and
         all(re.fullmatch('[A-Za-z0-9_.@+-]+', x) and x not in ('.', '..')
             for x in value.split('/')), 'plain relative path')
    return value


def rows(value, *, required=(), count=16384, total=BUILD_CAP, file_cap=FILE_CAP):
    need(type(value) is dict and 0 < len(value) <= count and set(required) <= set(value), 'bounded complete file inventory')
    size = 0
    for name, item in value.items():
        relative(name); fields(item, 'byteLength sha256'); integer(item['byteLength'], 1, file_cap)
        digest(item['sha256']); size += item['byteLength']
    need(size <= total, 'aggregate inventory bytes')
    return value


def runtime_path(value):
    need(type(value) is str and 1<len(value)<=512 and re.fullmatch('/[A-Za-z0-9_./@+-]+',value) and
         not value.startswith('//') and str(Path(value))==value and '..' not in Path(value).parts,'canonical selected absolute runtime path')
    return value


def declared_alias_resolution(path,aliases):
    pending=path.split('/');resolved=[];seen=set();steps=0
    while pending:
        steps+=1;need(steps<=4096,'finite alias component resolution')
        part=pending.pop(0)
        if part in ('','.'):continue
        if part=='..':
            need(resolved,'alias cannot escape filesystem root');resolved.pop();continue
        current='/'+('/'.join(resolved+[part]))
        if current in aliases:
            need(current not in seen and len(seen)<256,'finite acyclic declared alias resolution');seen.add(current)
            text=aliases[current]['linkText']
            if text.startswith('/'):resolved=[]
            pending=text.split('/')+pending
        else:resolved.append(part)
    return '/'+('/'.join(resolved))


def runtime_alias_policy(runtime):
    files=runtime['files'];file_aliases=runtime['aliases'];directories=runtime['directoryAliases']
    need(type(file_aliases) is dict and type(directories) is dict and len(file_aliases)+len(directories)<=256 and
         not set(file_aliases)&set(directories),'one bounded disjoint file/directory alias roster')
    aliases=dict(file_aliases,**directories)
    for name in files:runtime_path(name)
    for name,row in aliases.items():
        runtime_path(name);fields(row,'linkText target');runtime_path(row['target'])
        need(type(row['linkText']) is str and 0<len(row['linkText'])<=512 and
             re.fullmatch('[A-Za-z0-9_./@+-]+',row['linkText']),'bounded literal alias link text')
    for name,row in aliases.items():
        need(declared_alias_resolution(name,aliases)==row['target'] and
             declared_alias_resolution(row['target'],aliases)==row['target'],'declared aliases reach exact canonical targets')
        if name in file_aliases:need(row['target'] in files,'file alias reaches selected regular file')
        else:need(any(path.startswith(row['target']+'/') for path in set(files)|set(file_aliases)),
                  'directory alias target contains selected file descendants')
    for path in files:need(declared_alias_resolution(path,aliases)==path,'selected file paths already canonical')
    return aliases


PYTHON_EXECUTABLE = '/usr/bin/python3.12'
PYTHON_CACHE = '/home/runner/work/_temp/bw-gui-hdd-python-cache'
PYTHON_OPTIONS = [PYTHON_EXECUTABLE, '-I', '-S', '-B', '-X', 'pycache_prefix='+PYTHON_CACHE]
PYTHON_PATH = ['/usr/lib/python312.zip', '/usr/lib/python3.12', '/usr/lib/python3.12/lib-dynload']
STARTUP_STEPS = ('Install empty Python cache prefix and refuse unreviewed actual source',
 'Install externally admitted request and refuse runtime/source drift',
 'One official frontend acquisition and two serial genuine UI scenarios')


def startup_policy():
    # This selects startup mechanics, not a complete imported/native runtime graph.
    return {'schema':'bw.gui-hdd.python-startup.v1','executable':PYTHON_EXECUTABLE,
      'options':PYTHON_OPTIONS[1:],'path':PYTHON_PATH,'cachePrefix':PYTHON_CACHE,
      'sourceImportClosureQualified':False,'nativeImportClosureQualified':False}


def startup_installation(raw):
    need(type(raw) is bytes and len(raw)<=4096,'bounded outside Python startup original')
    lines=raw.decode('ascii').splitlines()
    need(len(lines)==5 and raw==('\n'.join(lines)+'\n').encode() and lines[:4]==[
      'bw.gui-hdd.python-startup-install.v1',PYTHON_CACHE,'created-exclusive','empty-before-entry'],
      'fixed outside Python exclusive installation original')
    tokens=lines[4].split(' ')
    need(len(tokens)==8 and all(re.fullmatch('[0-9]+',x) for i,x in enumerate(tokens) if i!=2) and
         re.fullmatch('[0-9a-f]+',tokens[2]),'canonical stat installation fields')
    values=[int(x,16 if i==2 else 10) for i,x in enumerate(tokens)]
    need(tokens==[format(x,'x') if i==2 else str(x) for i,x in enumerate(values)],'canonical installation stat numbers')
    need(values[2]==stat.S_IFDIR|0o555 and values[1]>0 and all(0<=x<2**63 for x in values),
         'fresh readonly directory installation identity')
    return dict(zip(('dev','ino','mode','uid','gid','nlink','size','mtimeSeconds'),values))


def validate_startup(snapshot, installed, mode, arguments):
    fields(snapshot,'schema options arguments flags dontWriteBytecode path cachePrefix xoptions prefix zipAbsent')
    need(snapshot['schema']=='bw.gui-hdd.python-startup-observation.v1' and snapshot['options']==PYTHON_OPTIONS and
         snapshot['arguments']==['scripts/run-i80386-hdd-gui-actual.py',mode]+arguments and
         encode(snapshot['flags'])==encode({'isolated':1,'no_site':1,'no_user_site':1,'dont_write_bytecode':1,'ignore_environment':1,'safe_path':True,'optimize':0}) and
         snapshot['dontWriteBytecode'] is True and snapshot['path']==PYTHON_PATH and
         snapshot['cachePrefix']==PYTHON_CACHE and snapshot['xoptions']=={'pycache_prefix':PYTHON_CACHE} and
         snapshot['zipAbsent'] is True,'fixed isolated no-site no-bytecode startup observations')
    prefix=snapshot['prefix'];fields(prefix,'dev ino mode uid gid nlink size mtimeNs empty')
    for key in ('dev','ino','mode','uid','gid','nlink','size','mtimeNs'):integer(prefix[key],0,2**63-1)
    need(prefix['empty'] is True and all(prefix[key]==installed[key] for key in installed if key!='mtimeSeconds') and
         prefix['mtimeNs']//1000000000==installed['mtimeSeconds'],'outside installation/empty held prefix identity join')
    return snapshot


def parse_request(raw, expected):
    digest(expected); need(type(raw) is bytes and 0 < len(raw) <= JSON_CAP and sha(raw) == expected,
                           'independently selected request digest')
    request = decode(raw)
    fields(request, 'schema repository pullRequest source build criticalFiles installedFiles runtime inventoryAdmission inputs pythonStartup')
    need(encode(request) == raw and request['schema'] == 'bw.gui-hdd.actual-request.v3' and
         request['repository'] == REPOSITORY, 'canonical owned approval request')
    need(encode(request['pythonStartup'])==encode(startup_policy()) and request['runtime']['python']==PYTHON_EXECUTABLE,'explicit v3 startup policy and selected CPython')
    integer(request['pullRequest'], 1, 2**31-1)
    source = request['source']; fields(source, 'head tree files'); digest(source['head'], 40); digest(source['tree'], 40)
    rows(source['files']); need(set(source['files']) == SOURCE, 'exact tracked source closure')
    rows(request['criticalFiles']); need(set(request['criticalFiles']) == set(CRITICAL), 'exact existing probe critical roster')
    for name in SOURCE & set(CRITICAL):
        need(encode(source['files'][name]) == encode(request['criticalFiles'][name]), 'critical/source identity join')
    build = request['build']
    fields(build, 'runId attempt head jobId jobName artifactId name metadataBytes zipBytes sha256 checkoutHead sourceFiles sourceAdmission')
    for key in ('runId', 'jobId', 'artifactId'): integer(build[key], 1, 2**63-1)
    need(build['attempt'] == 1 and type(build['attempt']) is int, 'single build attempt')
    digest(build['head'], 40); digest(build['checkoutHead'], 40); digest(build['sha256'])
    need(type(build['jobName']) is str and build['jobName'] == 'build' and build['name'] == 'github-pages', 'official frontend build descriptor')
    integer(build['metadataBytes'], 1, ARCHIVE_CAP); integer(build['zipBytes'], 1, ARCHIVE_CAP)
    rows(build['sourceFiles']); need(encode(build['sourceFiles']) == encode(source['files']), 'independently admitted build checkout matches source closure')
    prior = build['sourceAdmission']; fields(prior,'schema checkoutHead checkoutTree sourceFiles checkoutLog workflow')
    need(prior['schema']=='bw.gui-hdd.frontend-source-admission.v1' and prior['checkoutHead']==build['checkoutHead'] and
         encode(prior['sourceFiles'])==encode(source['files']), 'prior independently reviewed frontend source admission')
    digest(prior['checkoutTree'],40);fields(prior['checkoutLog'],'byteLength sha256')
    integer(prior['checkoutLog']['byteLength'],1,32<<20);digest(prior['checkoutLog']['sha256'])
    fields(prior['workflow'],'commit path sha256');digest(prior['workflow']['commit'],40);digest(prior['workflow']['sha256'])
    need(prior['workflow']['path']=='.github/workflows/build.yml','exact previously reviewed producer workflow')
    rows(request['installedFiles'])
    need(any(x.startswith('node_modules/bw-board/') for x in request['installedFiles']) and
         any(x.startswith('node_modules/playwright-core/') for x in request['installedFiles']), 'complete selected supplier/browser package inventories required')
    runtime = request['runtime']; fields(runtime, 'files aliases directoryAliases node python chromium tools resources')
    need(type(runtime['files']) is dict and 1 <= len(runtime['files']) <= 512, 'bounded independently admitted runtime graph')
    for name, item in runtime['files'].items():
        need(type(name) is str and name.startswith('/') and '..' not in Path(name).parts, 'absolute runtime file')
        fields(item, 'byteLength sha256'); integer(item['byteLength'], 1, 256 << 20); digest(item['sha256'])
    need(type(runtime['aliases']) is dict and len(runtime['aliases']) <= 256, 'bounded runtime aliases')
    for name, item in runtime['aliases'].items():
        fields(item,'linkText target')
        need(type(name) is str and name.startswith('/') and '..' not in Path(name).parts and
             type(item['linkText']) is str and 0<len(item['linkText'])<=512 and '\0' not in item['linkText'] and
             type(item['target']) is str and item['target'].startswith('/') and '..' not in Path(item['target']).parts and
             item['target'] in runtime['files'], 'bounded actual symlink text and selected canonical target')
    runtime_alias_policy(runtime)
    fields(runtime['tools'],'git gh')
    need(runtime['tools']=={'git':'/usr/bin/git','gh':'/usr/bin/gh'} and
         all(path in runtime['files'] for path in runtime['tools'].values()), 'required selected Git and gh runtime files')
    for key in ('node', 'python', 'chromium'):
        need(runtime[key] in runtime['files'], 'selected executable belongs to admitted runtime graph')
    need(runtime['files'][runtime['node']] == {'byteLength': 124827920,
         'sha256': 'fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48'}, 'independent selected Node identity')
    need(encode(runtime['resources']) == encode({'jobMinutes':35,'controllerSeconds':1800,
         'scenarioSeconds':{'freedos-hdd-persistence':1250,'forward-debug':180},
         'perProcessCoreBytes':0,'perProcessFileBytes':FILE_CAP,'perProcessOpenFiles':256,
         'aggregateContainmentQualified':False}), 'fixed finite hosted envelope; no aggregate containment claim')
    prior_inventory=request['inventoryAdmission']
    fields(prior_inventory,'schema sourceHead runId jobId artifactId artifactSha256 original templateSha256 workflow')
    need(prior_inventory['schema']=='bw.gui-hdd.inventory-admission.v2','separately reviewed prior inventory admission')
    digest(prior_inventory['sourceHead'],40);digest(prior_inventory['artifactSha256']);digest(prior_inventory['templateSha256'])
    for key in ('runId','jobId','artifactId'):integer(prior_inventory[key],1,2**63-1)
    fields(prior_inventory['original'],'byteLength sha256');integer(prior_inventory['original']['byteLength'],1,JSON_CAP);digest(prior_inventory['original']['sha256'])
    fields(prior_inventory['workflow'],'commit path sha256');digest(prior_inventory['workflow']['commit'],40);digest(prior_inventory['workflow']['sha256'])
    need(prior_inventory['workflow']['path']=='.github/workflows/i80386-hdd-gui-actual.yml','prior inventory producer workflow')
    fields(request['inputs'], 'floppy hdd bios vgaRom')
    input_paths={'floppy':'gui-inputs/floppy.img','hdd':'gui-inputs/hdd.img','bios':'gui-inputs/bios.bin','vgaRom':'gui-inputs/vga.bin'}
    for name, row in request['inputs'].items():
        fields(row, 'path byteLength sha256'); relative(row['path']);integer(row['byteLength'],1,FILE_CAP)
        need(row['path']==input_paths[name],'fixed workflow free-input path')
        need((row['byteLength'], row['sha256']) == INPUTS[name], 'fixed free input identity')
    return request


def bind_inventory_event(raw, head, expected, env):
    digest(head,40);digest(expected);event=decode(raw);pr=event.get('pull_request',{});repo=event.get('repository',{})
    need(event.get('action')=='labeled' and event.get('label',{}).get('name')=='x86-hdd-gui-inventory' and
         event.get('sender',{}).get('login')=='CrispStrobe' and repo.get('full_name')==REPOSITORY,'owned inventory label event')
    integer(event.get('number'),1,2**31-1)
    need(type(pr.get('number')) is int and event['number']==pr['number'] and pr.get('state')=='open' and
         pr.get('head',{}).get('sha')==head and pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY,'exact own inventory source event')
    marker='<!-- BW_GUI_HDD_INVENTORY_SHA256='+expected+' -->'
    need(type(pr.get('body')) is str and pr['body'].count('<!-- BW_GUI_HDD_INVENTORY_SHA256=')==1 and pr['body'].count(marker)==1,
         'immutable event inventory template pin transport')
    need(env.get('GITHUB_REPOSITORY')==REPOSITORY and env.get('GITHUB_EVENT_NAME')=='pull_request' and
         env.get('GITHUB_ACTOR')=='CrispStrobe' and env.get('GITHUB_RUN_ATTEMPT')=='1' and env.get('GITHUB_JOB')=='inventory' and
         re.fullmatch('[1-9][0-9]{0,19}',env.get('GITHUB_RUN_ID','')) and env.get('BW_EXPECTED_HEAD')==head,
         'first official inventory platform observations')
    return event


def bind_event(raw, request, expected, env):
    event = decode(raw); pr = event.get('pull_request', {}); repo = event.get('repository', {})
    need(event.get('action') == 'labeled' and event.get('label', {}).get('name') == LABEL and
         event.get('sender', {}).get('login') == 'CrispStrobe' and repo.get('full_name') == REPOSITORY,
         'owned operator labeled event')
    need(type(event.get('number')) is int and event['number'] == request['pullRequest'] and
         type(pr.get('number')) is int and pr.get('number') == request['pullRequest'] and pr.get('state') == 'open' and
         pr.get('head', {}).get('sha') == request['source']['head'] and
         pr.get('head', {}).get('repo', {}).get('full_name') == REPOSITORY and
         pr.get('head', {}).get('repo', {}).get('fork') is False and
         pr.get('base', {}).get('repo', {}).get('full_name') == REPOSITORY and
         pr.get('base', {}).get('ref') == 'main', 'exact own PR source event')
    marker = '<!-- BW_GUI_HDD_REQUEST_SHA256='+expected+' -->'
    need(type(pr.get('body')) is str and pr['body'].count('<!-- BW_GUI_HDD_REQUEST_SHA256=') == 1 and
         pr['body'].count(marker) == 1, 'immutable event request pin transport')
    need(env.get('GITHUB_REPOSITORY') == REPOSITORY and env.get('GITHUB_EVENT_NAME') == 'pull_request' and
         env.get('GITHUB_ACTOR') == 'CrispStrobe' and env.get('GITHUB_RUN_ATTEMPT') == '1' and
         re.fullmatch('[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', '')) and
         env.get('GITHUB_JOB') == 'actual' and env.get('BW_EXPECTED_HEAD') == request['source']['head'], 'official platform observations')
    return event


def identity(info):
    return {key: getattr(info, 'st_'+key) for key in ('dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtime_ns')}


def regular(path, cap):
    path = Path(path).absolute(); before = path.lstat()
    need(path.resolve(strict=True) == path and stat.S_ISREG(before.st_mode) and 0 < before.st_size <= cap,
         'canonical bounded regular original')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK); first = None
    try:
        need(identity(os.fstat(fd)) == identity(before), 'held original identity')
        chunks = bytearray()
        while len(chunks) <= cap:
            part = os.read(fd, min(65536, cap+1-len(chunks)))
            if not part: break
            chunks.extend(part)
        need(len(chunks) == before.st_size and identity(os.fstat(fd)) == identity(before) == identity(path.lstat()),
             'stable original bytes/extent/path'); return bytes(chunks)
    except BaseException as error: first = error; raise
    finally:
        try: os.close(fd)
        except BaseException:
            if first is None: raise


def check_file(path, row):
    raw = regular(path, row['byteLength'])
    need(len(raw) == row['byteLength'] and sha(raw) == row['sha256'], 'admitted file changed: '+str(path))
    return raw


def inventory(root, cap=BUILD_CAP):
    root = Path(root); need(root.resolve(strict=True) == root.absolute() and root.is_dir(), 'canonical inventory root')
    out = {}; total = 0; count = 0
    for base, dirs, files in os.walk(root, followlinks=False):
        dirs.sort(); files.sort(); need(len(Path(base).relative_to(root).parts) <= 32, 'inventory depth')
        for name in dirs+files:
            count += 1; need(count <= 32768, 'inventory entry cap')
            need(not (Path(base)/name).is_symlink(), 'inventory symlink refused')
        for name in files:
            path = Path(base)/name; relative_name = relative(path.relative_to(root).as_posix())
            raw = regular(path, FILE_CAP); total += len(raw); need(total <= cap and len(out) < 16384, 'inventory aggregate cap')
            out[relative_name] = {'byteLength': len(raw), 'sha256': sha(raw)}
    return out


def frontend_files(archive):
    """Derive observations only AFTER externally pinned whole-ZIP admission.

    The complete original digest is authority; producer-generated member hashes
    are not selected expectations. Both this controller and the independent
    reader apply their own finite path/type/extent policy to those exact bytes.
    """
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        need(len(source.infolist())<=16384,'bounded ZIP census');members={};total=0
        for info in source.infolist():
            if info.is_dir():relative(info.filename.rstrip('/'));continue
            name=relative(info.filename);need(name not in members and not stat.S_ISLNK(info.external_attr>>16),'regular unique ZIP member')
            limit=BUILD_CAP if name=='artifact.tar' else FILE_CAP
            need(0<info.file_size<=limit,'ZIP member bound BEFORE inflate');total+=info.file_size;need(total<=BUILD_CAP,'ZIP aggregate extent')
            members[name]=source.read(info)
    if set(members)=={'artifact.tar'}:
        files={};total=0;entries=0
        with tarfile.open(fileobj=io.BytesIO(members['artifact.tar']),mode='r:') as source:
            for member in source:
                entries+=1;need(entries<=16384,'bounded Pages TAR census');name=member.name.removeprefix('./')
                if member.isdir():
                    if name not in ('','.'):relative(name.rstrip('/'))
                    continue
                relative(name);need(member.isfile() and name not in files and 0<member.size<=FILE_CAP,'regular bounded unique TAR member')
                total+=member.size;need(total<=BUILD_CAP and len(files)<8192,'inflated build aggregate/count')
                files[name]=source.extractfile(member).read(FILE_CAP+1)
    else:files=members
    need({'index.html','brickwright-build.json'}<=set(files),'required frontend entry/provenance originals')
    for name in files:need(len(PurePosixPath(name).parts)<=32,'build path depth cap')
    members_={name:{'byteLength':len(raw),'sha256':sha(raw)} for name,raw in members.items()}
    files_={name:{'byteLength':len(raw),'sha256':sha(raw)} for name,raw in files.items()}
    return members_,files_,files


def install_members(archive,target):
    need(not Path(target).exists(),'fresh build extraction only')
    members,inventory_,files=frontend_files(archive);Path(target).mkdir(mode=0o700)
    for name,raw in files.items():
        path=Path(target)/name;path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with path.open('xb') as output:need(output.write(raw)==len(raw),'complete authenticated build installation')
    return members,inventory_


class Originals:
    def __init__(self, path):
        self.root = Path(path).absolute(); need(not self.root.exists() and self.root.parent.resolve(strict=True) == self.root.parent,
                                               'new canonical evidence root')
        self.root.mkdir(mode=0o700); self.files = {}; self.total = 0
    def save(self, name, raw):
        relative(name); need(type(raw) is bytes and len(raw) <= (ARCHIVE_CAP if name in ('frontend.original.zip','frontend.partial.zip') else FILE_CAP) and name not in self.files, 'exclusive bounded original')
        self.total += len(raw); need(self.total <= 384 << 20 and len(self.files) < 128, 'aggregate original cap')
        path = self.root/name; path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with path.open('xb') as output: need(output.write(raw) == len(raw), 'complete original write')
        self.files[name] = {'byteLength': len(raw), 'sha256': sha(raw)}
    def seal(self, result):
        self.save('result.json', encode(result))
        (self.root/'inventory.json').write_bytes(encode({'schema': 'bw.gui-hdd.originals.v1', 'files': self.files}))


class Hosted:
    """Real edges are called only after the literal source guard and external pin."""
    def __init__(self, root, output, env):
        self.root = Path(root).absolute(); self.output = output; self.env = dict(env)
        self.deadline = time.monotonic()+TOTAL_SECONDS; self.children = []; self.attempts = set()
    def api(self, route):
        need(re.fullmatch('/(?:actions/(?:runs/[0-9]+/attempts/1|jobs/[0-9]+|artifacts/[0-9]+)|git/blobs/[0-9a-f]{40})', route), 'fixed owned metadata route')
        url = 'https://api.github.com/repos/'+REPOSITORY+route
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs): raise ValueError('metadata redirect refused')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'bw-gui-hdd-v1', 'X-GitHub-Api-Version': '2022-11-28'}
        if self.env.get('GH_TOKEN'): headers['Authorization'] = 'Bearer '+self.env['GH_TOKEN']
        with opener.open(urllib.request.Request(url, headers=headers), timeout=15) as response:
            need(response.status == 200 and response.geturl() == url, 'fixed successful metadata endpoint')
            raw = response.read(JSON_CAP+1)
        need(len(raw) <= JSON_CAP, 'metadata extent'); return raw
    def run(self, role, argv, env, seconds, stdout_cap=STREAM_CAP):
        need(role not in self.attempts, 'one-shot child role'); self.attempts.add(role)
        need(time.monotonic() < self.deadline and type(argv) is list and all(type(x) is str for x in argv), 'finite child descriptor')
        # Sole waiter and default SIGCHLD policy while this child is owned.
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        def before_exec():
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0)); resource.setrlimit(resource.RLIMIT_FSIZE, (FILE_CAP, FILE_CAP))
            resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
        began = time.monotonic_ns(); child = subprocess.Popen(argv, cwd=self.root, env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, preexec_fn=before_exec)
        self.children.append(child)
        child_identity = None; known = {}; samples = []
        streams = {'stdout': bytearray(), 'stderr': bytearray()}; overflow = {}; first = None
        selector = None; remaining = []; secondary=[]; retention_failed=False
        def retain(error,phase):
            nonlocal first
            if first is None:first=error
            else:secondary.append({'phase':phase,'name':type(error).__name__,'message':str(error)})
        try:
            child_identity = process_identity(child.pid)
            need(child_identity['pgid'] == child.pid and child_identity['sessionId']==child.pid and
                 child_identity['parentPid'] == os.getpid(), 'owned fresh child session')
            selector = selectors.DefaultSelector()
            for name, stream in (('stdout', child.stdout), ('stderr', child.stderr)):
                os.set_blocking(stream.fileno(), False); selector.register(stream, selectors.EVENT_READ, name)
            end = min(self.deadline, time.monotonic()+seconds)
            while selector.get_map() or child.poll() is None:
                need(time.monotonic() < end, 'bounded child wall interval')
                census = descendants(child.pid); known.update({item['pid']:item for item in census})
                if census and len(samples)<64:samples.append({'atNs':time.monotonic_ns(),'descendants':census})
                for key, _ in selector.select(min(.1, max(0, end-time.monotonic()))):
                    part = os.read(key.fileobj.fileno(), 65536)
                    if not part: selector.unregister(key.fileobj); continue
                    cap = stdout_cap if key.data=='stdout' else STREAM_CAP
                    available = max(0,cap-len(streams[key.data]));streams[key.data].extend(part[:available])
                    if len(part)>available:overflow[key.data]=len(part)-available
                    need(key.data not in overflow, 'child stream cap; bounded prefix retained')
            terminal = child.wait(timeout=2); need(terminal == 0, 'child nonzero exit')
        except BaseException as error: first = error
        finally:
            # Only a still-unreaped own leader permits a group signal. A reaped
            # leader never authorizes signaling a possibly reused group number.
            try:unreaped=child.poll() is None
            except BaseException as error:retain(error,'leader-status');unreaped=False
            if unreaped:
                try:
                    need(signal.getsignal(signal.SIGCHLD)==signal.SIG_DFL,'sole default waiter cleanup policy')
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:pass
                except BaseException as error:retain(error,'group-signal')
                try:child.wait(timeout=5)
                except BaseException as error:retain(error,'leader-reap')
            try:
                remaining=remaining_processes(child.pid,known)
                if remaining:retain(ValueError('observed descendants/session members remain; outside job owner required'),'terminal-census')
            except BaseException as error:retain(error,'terminal-census')
            for stream in (child.stdout,child.stderr):
                try:stream.close()
                except BaseException as error:retain(error,'stream-close')
            if selector is not None:
                try:selector.close()
                except BaseException as error:retain(error,'selector-close')
            for name,raw in streams.items():
                try:
                    # Failure retains the exact capped prefix; success has one ZIP.
                    if role=='frontend-acquisition' and name=='stdout':
                        if first:self.output.save('frontend.partial.zip',bytes(raw))
                    else:self.output.save(role+'.'+name,bytes(raw))
                except BaseException as error:retain(error,'retain-'+name);retention_failed=True
            safe_env={key:value for key,value in env.items() if key!='GH_TOKEN'}
            try:
                self.output.save(role+'.process.json', encode({'argv':argv,'environment':safe_env,
                    'identity':child_identity,'descendantSamples':samples,'remainingDescendants':remaining,'startedNs':began,
                    'endedNs':time.monotonic_ns(),'exitCode':child.returncode,
                    'streams':{key:{'byteLength':len(value),'sha256':sha(value)} for key,value in streams.items()},
                    'overflowObservedBytes':overflow,'firstFailure':str(first) if first else None,'secondaryFailures':secondary,
                    'sameProcessGroupCleanupContinuousOwnershipQualified':False}))
            except BaseException as error:retain(error,'retain-process');retention_failed=True
            if retention_failed:
                try:sys.stderr.write(encode({'firstFailure':str(first),'secondaryFailures':secondary}).decode()[:16384])
                except BaseException as error:retain(error,'retention-diagnostic')
        if first: raise first
        return bytes(streams['stdout'])
    def git(self, arguments):
        argv = ['/usr/bin/git', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false',
                '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', *arguments]
        return self.run('git-'+str(len(self.attempts)), argv, clean_env(), 15)


def proc_stat(pid):
    integer(pid,1,2**31-1);path='/proc/'+str(pid)+'/stat';descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    first=None;raw=bytearray()
    try:
        before=os.fstat(descriptor);need(stat.S_ISREG(before.st_mode),'regular held proc stat observation')
        while len(raw)<=4096:
            part=os.read(descriptor,min(1024,4097-len(raw)))
            if not part:break
            raw.extend(part)
        need(0<len(raw)<=4096,'proc stat cap before parsing')
        after=os.fstat(descriptor)
        need((before.st_dev,before.st_ino,before.st_mode)==(after.st_dev,after.st_ino,after.st_mode),'held proc stat identity')
        return bytes(raw)
    except BaseException as error:first=error;raise
    finally:
        try:os.close(descriptor)
        except BaseException:
            if first is None:raise


def proc_pids():
    count=0
    with os.scandir('/proc') as entries:
        for entry in entries:
            count+=1;need(count<=8192,'bounded lazy host process census')
            if re.fullmatch('[1-9][0-9]{0,9}',entry.name):yield int(entry.name)


def process_identity(pid):
    raw=proc_stat(pid);need(raw.startswith(str(pid).encode()+b' ('),'proc stat exact PID binding')
    fields_=raw.rsplit(b')',1)[1].split();need(len(fields_)>=20,'complete bounded proc stat fields')
    return {'pid':pid,'state':fields_[0].decode(),'parentPid':int(fields_[1]),
            'pgid':int(fields_[2]),'sessionId':int(fields_[3]),'startTicks':int(fields_[19])}


def descendants(parent):
    all_ = {}
    for pid in proc_pids():
        try:all_[pid] = process_identity(pid)
        except (FileNotFoundError,ProcessLookupError):continue
    selected = {parent}; found = []
    for _ in range(32):
        next_ = [item for pid,item in all_.items() if pid not in selected and item['parentPid'] in selected]
        if not next_:break
        need(len(found)+len(next_)<=256, 'bounded owned descendant census')
        found.extend(next_);selected.update(item['pid'] for item in next_)
    else:raise ValueError('owned descendant depth cap')
    for item in found:
        path=Path('/proc')/str(item['pid'])/'exe'
        try:
            item['executable']=str(path.resolve(strict=True));info=path.stat()
            item['executableIdentity']={'dev':info.st_dev,'ino':info.st_ino}
        except (FileNotFoundError,ProcessLookupError):item['executable']=None
    return sorted(found,key=lambda item:item['pid'])


def remaining_processes(leader,known):
    out={}
    for pid in proc_pids():
        try:item=process_identity(pid)
        except (FileNotFoundError,ProcessLookupError):continue
        if item['state']=='Z':continue
        retained=known.get(item['pid'])
        if item['sessionId']==leader or item['pgid']==leader or (retained and retained['startTicks']==item['startTicks']):
            out[item['pid']]=item
        need(len(out)<=256,'bounded conservative terminal process census')
    return sorted(out.values(),key=lambda item:item['pid'])


def clean_env():
    return {'LANG': 'C.UTF-8', 'HOME': '/nonexistent', 'PATH': '/usr/bin:/bin',
            'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_NO_LAZY_FETCH': '1', 'GIT_TERMINAL_PROMPT': '0'}


def observed_alias_resolution(path,aliases):
    pending=path.split('/');resolved=[];seen=set();snapshots=[];steps=0
    while pending:
        steps+=1;need(steps<=4096,'finite observed alias component resolution')
        part=pending.pop(0)
        if part in ('','.'):continue
        if part=='..':
            need(resolved,'observed alias cannot escape filesystem root');resolved.pop();continue
        current='/'+('/'.join(resolved+[part]));before=os.lstat(current)
        if stat.S_ISLNK(before.st_mode):
            need(current in aliases and current not in seen and len(seen)<256,'declared finite observed symlink chain')
            seen.add(current);text=os.readlink(current);need(text==aliases[current]['linkText'],'actual selected alias text')
            snapshots.append((current,identity(before)))
            if text.startswith('/'):resolved=[]
            pending=text.split('/')+pending
        else:
            if pending:need(stat.S_ISDIR(before.st_mode),'runtime alias parent directory')
            resolved.append(part)
    for name,before in snapshots:need(identity(os.lstat(name))==before,'observed alias path identity after resolution')
    return '/'+('/'.join(resolved))


def directory_identity(path):
    before=os.lstat(path);descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_DIRECTORY);first=None
    try:
        held=os.fstat(descriptor);need(stat.S_ISDIR(held.st_mode) and identity(before)==identity(held),'held canonical directory target')
        need(identity(os.fstat(descriptor))==identity(held)==identity(os.lstat(path)),'directory target snapshot readback')
        return {'dev':held.st_dev,'ino':held.st_ino,'mode':held.st_mode}
    except BaseException as error:first=error;raise
    finally:
        try:os.close(descriptor)
        except BaseException:
            if first is None:raise


def empty_python_prefix():
    path=Path(PYTHON_CACHE)
    need(str(path.resolve(strict=True))==PYTHON_CACHE,'canonical startup prefix and ancestors')
    before=os.lstat(path);fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_DIRECTORY);first=None
    try:
        held=os.fstat(fd);need(identity(before)==identity(held) and held.st_mode==stat.S_IFDIR|0o555,'held readonly startup prefix')
        with os.scandir(fd) as entries:need(next(entries,None) is None,'startup cache prefix must remain empty')
        need(identity(os.fstat(fd))==identity(held)==identity(os.lstat(path)),'empty prefix readback identity')
        return {'dev':held.st_dev,'ino':held.st_ino,'mode':held.st_mode,'uid':held.st_uid,'gid':held.st_gid,
          'nlink':held.st_nlink,'size':held.st_size,'mtimeNs':held.st_mtime_ns,'empty':True}
    except BaseException as error:first=error;raise
    finally:
        try:os.close(fd)
        except BaseException:
            if first is None:raise


def observe_python_startup(root,mode,arguments):
    raw=regular(Path(root)/'gui-setup/python-startup.original.txt',4096);installed=startup_installation(raw)
    snapshot={'schema':'bw.gui-hdd.python-startup-observation.v1','options':list(sys.orig_argv[:6]),
      'arguments':list(sys.orig_argv[6:]),'flags':{key:getattr(sys.flags,key) for key in
       ('isolated','no_site','no_user_site','dont_write_bytecode','ignore_environment','safe_path','optimize')},
      'dontWriteBytecode':sys.dont_write_bytecode,'path':list(sys.path),'cachePrefix':sys.pycache_prefix,
      'xoptions':dict(sys._xoptions),'prefix':empty_python_prefix(),'zipAbsent':not os.path.lexists(PYTHON_PATH[0])}
    need(sys.executable==PYTHON_EXECUTABLE and str(Path('/proc/self/exe').resolve(strict=True))==PYTHON_EXECUTABLE,
         'actual selected startup executable')
    validate_startup(snapshot,installed,mode,arguments)
    return raw,snapshot


def observe_runtime(request):
    runtime = request['runtime']; aliases=runtime_alias_policy(runtime)
    facts = {'files': {}, 'aliases': {},'directoryAliases':{},'directoryIdentities':{},'identities':{}}
    need(str(Path('/proc/self/exe').resolve(strict=True))==runtime['python']==str(Path(sys.executable).resolve(strict=True)),
         'selected actual executing CPython identity')
    for path, row in runtime['files'].items():
        need(observed_alias_resolution(path,aliases)==path,'actual canonical selected runtime file')
        raw = check_file(path, row); facts['files'][path] = {'byteLength': len(raw), 'sha256': sha(raw)}
        info=Path(path).stat();facts['identities'][path]={'dev':info.st_dev,'ino':info.st_ino}
    for path,item in aliases.items():
        before=os.lstat(path);need(stat.S_ISLNK(before.st_mode),'actual selected alias is symlink')
        need(os.readlink(path)==item['linkText'] and observed_alias_resolution(path,aliases)==item['target'] and
             identity(os.lstat(path))==identity(before),'selected alias snapshot text/target identity')
        role='directoryAliases' if path in runtime['directoryAliases'] else 'aliases';facts[role][path]=dict(item)
        if role=='directoryAliases':facts['directoryIdentities'][item['target']]=directory_identity(item['target'])
    facts['resources'] = runtime['resources']
    facts['availableCpus'] = sorted(os.sched_getaffinity(0))
    facts['rlimits'] = {str(key):list(resource.getrlimit(key)) for key in (resource.RLIMIT_CORE,resource.RLIMIT_FSIZE,resource.RLIMIT_NOFILE)}
    facts['aggregateContainmentQualified'] = False
    return facts


def admit_build_metadata(request, run, job, artifact):
    build = request['build']
    for obj,keys in ((run,('id','run_attempt')),(job,('id','run_id')),(artifact,('id','size_in_bytes'))):
        for key in keys:integer(obj.get(key),1,2**63-1)
    integer(artifact.get('workflow_run',{}).get('id'),1,2**63-1)
    need(run.get('id') == build['runId'] and run.get('run_attempt') == 1 and run.get('status') == 'completed' and
         run.get('conclusion') == 'success' and run.get('head_sha') == build['head'] and
         run.get('path') == '.github/workflows/build.yml' and run.get('repository', {}).get('full_name') == REPOSITORY,
         'successful independently selected official Build run')
    need(job.get('id') == build['jobId'] and job.get('run_id') == build['runId'] and job.get('name') == build['jobName'] and
         job.get('status') == 'completed' and job.get('conclusion') == 'success', 'official frontend producing job')
    need(artifact.get('id') == build['artifactId'] and artifact.get('name') == build['name'] and artifact.get('expired') is False and
         artifact.get('size_in_bytes') == build['metadataBytes'] and artifact.get('workflow_run', {}).get('id') == build['runId'] and
         artifact.get('workflow_run', {}).get('head_sha') == build['head'] and
         artifact.get('digest') == 'sha256:'+build['sha256'], 'artifact metadata admitted before one retrieval')


def execute(request_raw, expected, root, output_path, env, factory=Hosted, preflight=False):
    request = parse_request(request_raw, expected); output = Originals(output_path); first = None; secondary = []
    result = {'schema': 'bw.gui-hdd.result.v1', 'pass': False, 'requestSha256': expected,
              'scenarios': [], 'firstFailure': None, 'secondary': secondary}
    def retain(error,phase):
        nonlocal first
        record={'phase':phase,'name':type(error).__name__,'message':str(error)}
        if first is None:first=error;result['firstFailure']=record
        else:secondary.append(record)
        result['pass']=False
    output.save('request.original.json', request_raw)
    try:
        startup_mode='preflight' if preflight else 'actual'
        startup_args=['--request',str(Path(root)/'gui-inputs/request.json'),'--expected-sha256',expected,'--output',str(output_path)]
        startup_raw,startup_before=observe_python_startup(root,startup_mode,startup_args)
        output.save('python-startup.original.txt',startup_raw);output.save('python-startup.before.json',encode(startup_before))
        hosted = factory(root, output, env)
        event_raw = regular(env['GITHUB_EVENT_PATH'], JSON_CAP); bind_event(event_raw, request, expected, env)
        output.save('event.original.json', event_raw)
        output.save('runtime.before.json', encode(observe_runtime(request)))
        need(hosted.git(['rev-parse', 'HEAD']).decode().strip() == request['source']['head'] and
             hosted.git(['rev-parse', 'HEAD^{tree}']).decode().strip() == request['source']['tree'], 'actual source HEAD/tree')
        observed_source={}
        for path, row in request['source']['files'].items():
            raw = check_file(Path(root)/path, row)
            need(hosted.git(['cat-file', 'blob', request['source']['head']+':'+path]) == raw, 'live tracked source/Git blob')
            observed_source[path]={'byteLength':len(raw),'sha256':sha(raw)}
        output.save('source.before.json', encode({'head':request['source']['head'],'tree':request['source']['tree'],'files':observed_source}))
        for path, row in request['criticalFiles'].items(): check_file(Path(root)/path, row)
        # Complete selected package census; expected rows originate outside this attempt.
        installed = {}
        for prefix in ('node_modules/bw-board', 'node_modules/playwright', 'node_modules/playwright-core'):
            for path, row in inventory(Path(root)/prefix).items(): installed[prefix+'/'+path] = row
        need(encode(installed) == encode(request['installedFiles']), 'closed selected installed supplier/browser graph')
        pins = decode(regular(Path(root)/'vendor-pins.json', JSON_CAP))
        need({key: pins[key] for key in ('bw-board', 'bw-circuit-ui', 'sb3-creator')} ==
             {'bw-board': BOARD, 'bw-circuit-ui': CUI, 'sb3-creator': SB3}, 'held adopted dependency identities')
        output.save('installed.before.json', encode(installed))
        if preflight:
            result['schema']='bw.gui-hdd.preflight.v1';result['pass']=True
        else:
            metadata = []
            for role, route in (('build-run', '/actions/runs/'+str(request['build']['runId'])+'/attempts/1'),
                                ('build-job', '/actions/jobs/'+str(request['build']['jobId'])),
                                ('build-artifact', '/actions/artifacts/'+str(request['build']['artifactId']))):
                raw = hosted.api(route); output.save(role+'.original.json', raw); metadata.append(decode(raw))
            admit_build_metadata(request, *metadata)
            token = env.get('GH_TOKEN'); need(type(token) is str and token, 'scoped Actions read credential')
            download_env = dict(clean_env(), GH_TOKEN=token, GH_HOST='github.com')
            archive = hosted.run('frontend-acquisition', ['/usr/bin/gh', 'api', 'repos/'+REPOSITORY+
                 '/actions/artifacts/'+str(request['build']['artifactId'])+'/zip'], download_env, 180, ARCHIVE_CAP)
            output.save('frontend.original.zip', archive)
            need(len(archive) == request['build']['zipBytes'] and sha(archive) == request['build']['sha256'], 'one official frontend archive digest')
            build_root = output.root.parent/(output.root.name+'-build')
            members,build_files=install_members(archive,build_root)
            output.save('frontend.members.json',encode(members));output.save('build.inventory.json', encode(inventory(build_root)))
            need(inventory(build_root)==build_files,'authenticated build installation readback')
            build_manifest = decode(regular(build_root/'brickwright-build.json', JSON_CAP))
            need(build_manifest.get('commit') == request['build']['checkoutHead'][:7], 'admitted actual frontend checkout identity')
            for role, row in request['inputs'].items(): check_file(Path(root)/row['path'], row)
            manifest = {'schema': 'bw.gui-hdd-persistence-admission.v1', 'boardPin': BOARD,
                'sourceHead': request['source']['head'], 'criticalFiles': request['criticalFiles'],
                'buildRoot': str(build_root), 'buildFiles': build_files,
                'inputPaths': {name: str(Path(root)/row['path']) for name, row in request['inputs'].items()}}
            output.save('probe-admission.json', encode(manifest))
            for scenario, seconds in zip(SCENARIOS, (1250, 180)):
                child_env = dict(clean_env(), PROOF_SCENARIO=scenario, PROOF_ADMISSION=str(output.root/'probe-admission.json'),
                    PROOF_OUTPUT=str(output.root/scenario), PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=request['runtime']['chromium'],
                    PROOF_BROWSER_SHA256=request['runtime']['files'][request['runtime']['chromium']]['sha256'])
                hosted.run(scenario, [request['runtime']['node'], PROBE], child_env, seconds)
                result['scenarios'].append(scenario)
            # Actual originals, not producer truthiness, are graded by the separate reader.
            need(hosted.git(['rev-parse','HEAD']).decode().strip()==request['source']['head'] and
                 hosted.git(['rev-parse','HEAD^{tree}']).decode().strip()==request['source']['tree'],'actual after source HEAD/tree')
            observed_after={}
            for path,row in request['source']['files'].items():
                raw=check_file(Path(root)/path,row);observed_after[path]={'byteLength':len(raw),'sha256':sha(raw)}
            output.save('source.after.json',encode({'head':request['source']['head'],'tree':request['source']['tree'],'files':observed_after}))
            installed_after={}
            for prefix in ('node_modules/bw-board','node_modules/playwright','node_modules/playwright-core'):
                for name,row in inventory(Path(root)/prefix).items():installed_after[prefix+'/'+name]=row
            need(installed_after==request['installedFiles'],'complete installed graph after both scenarios')
            output.save('installed.after.json', encode(installed_after)); output.save('runtime.after.json', encode(observe_runtime(request)))
            need(inventory(build_root) == build_files, 'served build changed after scenarios')
            for role, row in request['inputs'].items(): check_file(Path(root)/row['path'], row)
            result['pass'] = True
        startup_after_raw,startup_after=observe_python_startup(root,startup_mode,startup_args)
        need(startup_after_raw==startup_raw and startup_after==startup_before,'startup prefix and flags after attempt unchanged')
        output.save('python-startup.after.json',encode(startup_after))
    except BaseException as error:
        retain(error,'attempt')
    finally:
        # Collect only bounded regular owned probe originals, including partial failures.
        for scenario in SCENARIOS:
            path = output.root/scenario
            if path.exists():
                try:
                    for item in sorted(path.iterdir()):
                        relative(item.name); raw = regular(item, FILE_CAP)
                        name=scenario+'/'+item.name;need(name not in output.files,'exclusive probe original role')
                        output.total+=len(raw);need(output.total<=384<<20 and len(output.files)<128,'aggregate probe/archive original cap')
                        output.files[name] = {'byteLength': len(raw), 'sha256': sha(raw)}
                except BaseException as error:
                    retain(error,'probe-collector')
        try:output.seal(result)
        except BaseException as error:
            retain(error,'seal')
            try:sys.stderr.write(encode(result).decode()[:16384])
            except BaseException as error:retain(error,'seal-diagnostic')
    if first: return 1
    return 0 if result['pass'] and not secondary else 1


def install_input(blob,expected,target,env):
    """Immutable own-repository input transport, never an approval decision."""
    digest(blob,40);digest(expected);target=Path(target).absolute()
    need(target.name in ('request.json','runtime-template.json') and target.parent.resolve(strict=True)==target.parent and
         not target.exists(),'fixed fresh canonical input installation')
    # The fixed metadata adapter does not launch a process or acquire an artifact.
    class Edge:
        API = Hosted.api
    edge=Edge();edge.env=dict(env)
    raw=Hosted.api(edge,'/git/blobs/'+blob);response=decode(raw)
    need(response.get('sha')==blob and response.get('encoding')=='base64' and type(response.get('size')) is int and
         0<response['size']<=JSON_CAP and type(response.get('content')) is str,'bounded immutable input Git blob')
    content=response['content'].replace('\n','');payload=base64.b64decode(content,validate=True)
    need(len(payload)==response['size'] and sha(payload)==expected and
         hashlib.sha1(b'blob '+str(len(payload)).encode()+b'\0'+payload).hexdigest()==blob and
         base64.b64encode(payload).decode()==content,'independent input digest/Git object/extent')
    decode(payload)
    descriptor=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);first=None
    try:
        need(os.write(descriptor,payload)==len(payload),'complete immutable input installation');os.fchmod(descriptor,0o444)
    except BaseException as error:first=error;raise
    finally:
        try:os.close(descriptor)
        except BaseException:
            if first is None:raise
    need(regular(target,JSON_CAP)==payload,'installed input bytes readback')
    return {'byteLength':len(payload),'sha256':sha(payload),'gitBlob':blob}


def inventory_error(value,error,phase,path=None):
    # Error messages are observations, never arbitrary-length file contents.
    row={'phase':phase,'name':type(error).__name__.encode('ascii','backslashreplace')[:128].decode('ascii'),
      'message':str(error).encode('ascii','backslashreplace')[:1024].decode('ascii')}
    if path is not None:row['path']=path
    if value['firstFailure'] is None:value['firstFailure']=row
    else:value['secondary'].append(row)
    return row


def inventory_observation(template_raw,expected,root,env,output_path):
    failure={'schema':'bw.gui-hdd.inventory-failure.v1','observationOnly':True,'candidate':False,'qualified':False,
      'template':{'byteLength':len(template_raw),'sha256':sha(template_raw),'expectedSha256':None,'sourceHead':None,'bindingVerified':False},
      'event':None,'platform':{key:(env[key] if type(env.get(key)) is str and len(env[key].encode())<=1024 else None) for key in ('GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB','GITHUB_REPOSITORY',
       'GITHUB_WORKFLOW_SHA','GITHUB_WORKFLOW_REF','GITHUB_EVENT_NAME','GITHUB_ACTOR','BW_EXPECTED_HEAD')},
      'files':{},'aliases':{},'directoryAliases':{},'gitSource':{'reached':False,'head':None,'tree':None,'files':{}},
      'firstFailure':None,'secondary':[]}
    try:return collect_inventory_observation(template_raw,expected,root,env,output_path,failure)
    except BaseException as error:
        inventory_error(failure,error,'inventory');return failure


def retain_inventory_observation(value,output_path):
    failed=value.get('schema')=='bw.gui-hdd.inventory-failure.v1'
    need(failed or value.get('schema')=='bw.gui-hdd.inventory-original.v2','explicit inventory original version')
    if failed:need(value['firstFailure'] is not None and value['candidate'] is False and value['qualified'] is False,'failure-only inventory cannot qualify')
    target=Path(output_path).with_name('inventory-failure.json') if failed else Path(output_path)
    output=None;first=None;secondary=[]
    try:
        raw=encode(value);need(len(raw)<=JSON_CAP,'bounded inventory original')
        output=target.open('xb');need(output.write(raw)==len(raw),'complete inventory original')
    except BaseException as error:first=error
    finally:
        if output is not None:
            try:output.close()
            except BaseException as error:
                if first is None:first=error
                else:secondary.append(error)
    if first is not None:
        if not failed:
            first.inventory_secondary=secondary;raise first
        inventory_error(value,first,'inventory-failure-retention')
        for error in secondary:inventory_error(value,error,'inventory-failure-close')
        # Never overwrite a partial/uncertain original. A bounded canonical
        # stderr diagnostic preserves the first refusal and retention uncertainty.
        diagnostic={'schema':value['schema'],'candidate':False,'qualified':False,'firstFailure':value['firstFailure'],
          'secondary':value['secondary'][-4:],'secondaryCount':len(value['secondary'])}
        try:sys.stderr.write(encode(diagnostic).decode())
        except BaseException as secondary:inventory_error(value,secondary,'inventory-failure-diagnostic')
        return 1
    return 1 if failed else 0


def collect_inventory_observation(template_raw,expected,root,env,output_path,failure):
    """Metadata only. No browser/tool probe/guest, and never self-approval."""
    digest(expected);failure['template']['expectedSha256']=expected
    need(sha(template_raw)==expected,'independently selected inventory template')
    template=decode(template_raw);fields(template,'schema sourceHead files aliases directoryAliases node python chromium tools')
    need(encode(template)==template_raw and template['schema']=='bw.gui-hdd.inventory-template.v2','canonical bounded inventory template')
    digest(template['sourceHead'],40);failure['template'].update(sourceHead=template['sourceHead'],bindingVerified=True)
    event_raw=regular(env['GITHUB_EVENT_PATH'],JSON_CAP);failure['event']={'byteLength':len(event_raw),'sha256':sha(event_raw),'bindingVerified':False}
    bind_inventory_event(event_raw,template['sourceHead'],expected,env);failure['event']['bindingVerified']=True
    need(type(template['files']) is list and 1<=len(template['files'])<=512 and len(set(template['files']))==len(template['files']) and
         type(template['aliases']) is list and len(template['aliases'])<=256 and len(set(template['aliases']))==len(template['aliases']) and type(template['directoryAliases']) is list and
         len(set(template['directoryAliases']))==len(template['directoryAliases']) and len(template['aliases'])+len(template['directoryAliases'])<=256,
         'closed independently selected runtime path roster')
    runtime={'files':{},'aliases':{},'directoryAliases':{},'node':template['node'],'python':template['python'],'chromium':template['chromium'],
        'tools':template['tools'],'resources':{'jobMinutes':35,'controllerSeconds':1800,
        'scenarioSeconds':{'freedos-hdd-persistence':1250,'forward-debug':180},'perProcessCoreBytes':0,
        'perProcessFileBytes':FILE_CAP,'perProcessOpenFiles':256,'aggregateContainmentQualified':False}}
    # Validate the entire finite roster before any selected-path access.
    for role in ('files','aliases','directoryAliases'):
        for path in template[role]:runtime_path(path)
    need(set(template['files']).isdisjoint(set(template['aliases'])|set(template['directoryAliases'])) and
         set(template['aliases']).isdisjoint(template['directoryAliases']),'disjoint fixed inventory roles')
    deadline=time.monotonic()+180
    def metadata(info):return {key:getattr(info,'st_'+key) for key in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns')}
    for path in template['files']:
        row={'attempted':False};failure['files'][path]=row
        try:
            need(time.monotonic()<deadline,'inventory selected-path deadline; remaining paths not read')
            row['attempted']=True;row['metadataBefore']=metadata(os.lstat(path))
            raw=regular(path,256<<20);row['file']={'byteLength':len(raw),'sha256':sha(raw)}
            row['metadataAfter']=metadata(os.lstat(path));need(row['metadataBefore']==row['metadataAfter'],'inventory diagnostic file metadata drift')
            need(time.monotonic()<deadline,'inventory selected-path deadline after bounded read')
            runtime['files'][path]=row['file'];row['status']='observed'
        except BaseException as error:
            row['status']='failed' if row['attempted'] else 'unvisited-deadline';row['error']=inventory_error(failure,error,'inventory-file',path)
    all_aliases={}
    for role in ('aliases','directoryAliases'):
        for path in template[role]:
            observed={'attempted':False};failure[role][path]=observed
            try:
                need(time.monotonic()<deadline,'inventory selected-path deadline; remaining aliases not read')
                observed['attempted']=True;before=os.lstat(path);observed['metadataBefore']=metadata(before);need(stat.S_ISLNK(before.st_mode),'selected inventory alias is symlink')
                text=os.readlink(path);need(type(text) is str and 0<len(text)<=512,'bounded selected inventory link text');observed['linkText']=text
                after=os.lstat(path);observed['metadataAfter']=metadata(after);need(identity(after)==identity(before),'inventory alias snapshot readback')
                need(time.monotonic()<deadline,'inventory selected-path deadline after alias read')
                row={'linkText':text,'target':None};runtime[role][path]=row;need(path not in all_aliases,'disjoint alias template rosters');all_aliases[path]=row
                observed['status']='observed'
            except BaseException as error:
                observed['status']='failed' if observed['attempted'] else 'unvisited-deadline';observed['error']=inventory_error(failure,error,'inventory-alias',path)
    if failure['firstFailure'] is not None:return failure  # No tools, Git, runtime probes or candidate after ANY required read failure.
    for path,row in all_aliases.items():row['target']=declared_alias_resolution(path,all_aliases)
    runtime_alias_policy(runtime)
    for name in ('node','python','chromium'):need(runtime[name] in runtime['files'],'selected inventory executable')
    need(runtime['files'][runtime['node']]=={'byteLength':124827920,'sha256':'fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48'},'known independently admitted Node identity')
    fields(runtime['tools'],'git gh');need(runtime['tools']=={'git':'/usr/bin/git','gh':'/usr/bin/gh'} and
        all(path in runtime['files'] for path in runtime['tools'].values()),'explicit inventory bootstrap tool closure')
    observe_runtime({'runtime':runtime})
    # Only fixed read-only Git metadata; these observations do not approve their
    # source, inventory template, future request or changed activation code.
    git=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false',
        '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']
    failure['gitSource']['reached']=True
    capture=Originals(Path(output_path).parent/(Path(output_path).stem+'-git-originals'))
    edge=Hosted(root,capture,env);edge.deadline=min(edge.deadline,time.monotonic()+300)
    commands=[]
    def command(arguments):
        role='git-'+str(len(edge.attempts));raw=edge.git(arguments)
        process=decode(regular(capture.root/(role+'.process.json'),JSON_CAP))
        commands.append({'argv':process['argv'],'stdout':capture.files[role+'.stdout'],
                         'stderr':capture.files[role+'.stderr'],'exitCode':process['exitCode']})
        return raw
    head=command(['rev-parse','HEAD']).decode().strip();failure['gitSource']['head']=head
    tree=command(['rev-parse','HEAD^{tree}']).decode().strip();failure['gitSource']['tree']=tree;digest(head,40);digest(tree,40)
    need(head==template['sourceHead'],'externally selected inventory source head')
    files={};failure['gitSource']['files']=files
    for path in sorted(SOURCE):
        raw=regular(Path(root)/path,FILE_CAP);need(command(['cat-file','blob',head+':'+path])==raw,'inventory source actual Git/live identity')
        files[path]={'byteLength':len(raw),'sha256':sha(raw)}
    installed={}
    for prefix in ('node_modules/bw-board','node_modules/playwright','node_modules/playwright-core'):
        for path,row in inventory(Path(root)/prefix).items():installed[prefix+'/'+path]=row
    return {'schema':'bw.gui-hdd.inventory-original.v2','observationOnly':True,'templateSha256':expected,
        'source':{'head':head,'tree':tree,'files':files},'installedFiles':installed,'runtime':runtime,
        'event':{'byteLength':len(event_raw),'sha256':sha(event_raw),'base64':base64.b64encode(event_raw).decode()},
        'commands':commands,'platform':{name:env.get(name) for name in ('GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB',
        'GITHUB_REPOSITORY','GITHUB_WORKFLOW_SHA','GITHUB_WORKFLOW_REF','GITHUB_EVENT_NAME','GITHUB_ACTOR','BW_EXPECTED_HEAD')}}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('mode',choices=('guard','inventory-guard','install-input','inventory','preflight','actual'))
    for option in ('request','expected-sha256','output','blob'):parser.add_argument('--'+option)
    raw=list(sys.argv[1:] if argv is None else argv)
    for option in ('--request','--expected-sha256','--output','--blob'):
        if raw.count(option)>1:parser.error('one fixed input per option')
    args=parser.parse_args(raw)
    if args.mode in ('guard','preflight','actual'):
        need(ACTUAL_ENABLED is True,'GUI actual disabled pending exact source/input/event/resource admission')
    if args.mode in ('inventory-guard','inventory'):
        need(INVENTORY_ENABLED is True,'GUI inventory disabled pending exact source/template/event admission')
    if args.mode=='guard':observe_python_startup(Path.cwd(),'guard',[])
    if args.mode=='install-input' and Path('gui-setup/python-startup.original.txt').exists():
        observe_python_startup(Path.cwd(),'install-input',raw[1:])
    if args.mode in ('guard','inventory-guard'):return 0
    need(args.expected_sha256 and args.output,'fixed independent digest and output required')
    env=dict(os.environ)
    if args.mode=='install-input':
        need(args.blob,'fixed immutable input blob required');print(encode(install_input(args.blob,args.expected_sha256,args.output,env)).decode(),end='');return 0
    need(args.request,'fixed canonical input original required')
    request_raw=regular(args.request,JSON_CAP)
    if args.mode=='inventory':
        result=inventory_observation(request_raw,args.expected_sha256,Path.cwd(),env,args.output)
        return retain_inventory_observation(result,args.output)
    return execute(request_raw,args.expected_sha256,Path.cwd(),args.output,env,preflight=args.mode=='preflight')


if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        raw=encode({'pass':False,'firstFailure':{'name':type(error).__name__,'message':str(error)}})
        sys.stderr.buffer.write(raw[:16384]);sys.exit(1)
