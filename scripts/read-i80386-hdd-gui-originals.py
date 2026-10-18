#!/usr/bin/env python3
"""MIT. Standalone original-byte GUI reader. No producer import, browser, replay or execution."""
import argparse
import base64
import hashlib
import io
import os
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tarfile
import zipfile

ACTUAL_ENABLED = False
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


def bounded_input(path,cap):
    path=Path(path).absolute();before=path.lstat()
    need(path.resolve(strict=True)==path and stat.S_ISREG(before.st_mode) and 0<before.st_size<=cap,'bounded canonical external original')
    descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK);first=None;out=bytearray()
    keys=('st_dev','st_ino','st_size','st_mode','st_mtime_ns')
    try:
        need(all(getattr(before,k)==getattr(os.fstat(descriptor),k) for k in keys),'held external original identity')
        while len(out)<=cap:
            part=os.read(descriptor,min(65536,cap+1-len(out)))
            if not part:break
            out.extend(part)
        need(len(out)==before.st_size and all(getattr(before,k)==getattr(os.fstat(descriptor),k)==getattr(path.lstat(),k) for k in keys),'external original stable extent/path')
        return bytes(out)
    except BaseException as error:first=error;raise
    finally:
        try:os.close(descriptor)
        except BaseException:
            if first is None:raise


def expected_policy(expected):
    fields(expected,'requestSha256 buildSourceAdmissionSha256 inventoryOriginal sourceHead runId jobId artifactId artifactName artifactBytes artifactSha256 run job artifact')
    for name in ('requestSha256','buildSourceAdmissionSha256','artifactSha256'):digest(expected[name])
    digest(expected['sourceHead'],40)
    for name in ('runId','jobId','artifactId'):integer(expected[name],1,2**63-1)
    integer(expected['artifactBytes'],1,384<<20)
    original=expected['inventoryOriginal'];fields(original,'byteLength sha256 base64')
    integer(original['byteLength'],1,JSON_CAP);digest(original['sha256'])
    need(type(original['base64']) is str and len(original['base64'])<=(JSON_CAP+2)//3*4,'bounded prior inventory encoding')
    raw=base64.b64decode(original['base64'],validate=True)
    need(len(raw)==original['byteLength'] and sha(raw)==original['sha256'] and base64.b64encode(raw).decode()==original['base64'],'external prior inventory original')
    return decode(raw)


def allowed_role(name):
    top={'python-startup.original.txt','python-startup.before.json','python-startup.after.json','inventory.json','result.json','request.original.json','event.original.json','source.before.json','source.after.json',
      'runtime.before.json','runtime.after.json','installed.before.json','installed.after.json','build-run.original.json',
      'build-job.original.json','build-artifact.original.json','frontend.original.zip','frontend.partial.zip',
      'frontend.members.json','build.inventory.json','probe-admission.json','frontend-acquisition.stderr','frontend-acquisition.process.json'}
    if name in top:return True
    if re.fullmatch(r'git-[0-9]+\.(stdout|stderr|process\.json)',name):
        number=int(name.split('-')[1].split('.')[0]);return 0<=number<=len(SOURCE)+6
    for scenario in SCENARIOS:
        if name in {scenario+'.stdout',scenario+'.stderr',scenario+'.process.json'}:return True
    parts=name.split('/')
    if len(parts)!=2:return False
    root,leaf=parts
    if root=='freedos-hdd-persistence':return leaf in {'admission.json','proof.json','observations.json','session-witnesses.json','browser-launch.json',
       '386-master-hdd.img','386-master-hdd.json','session-1.png','session-2.png','failure.json','failure-session-1.png','failure-session-2.png'}
    if root=='forward-debug':return leaf in {'admission.json','proof.json','forward-trace.json','browser-launch.json','forward-debug.png','failure.json','authored-boot.sha256'}
    return False


def role_policy(names):
    need(all(allowed_role(name) for name in names),'fixed finite original role families')


def read_frontend(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        need(len(archive.infolist())<=16384,'frontend ZIP census cap');members={};total=0
        for item in archive.infolist():
            if item.is_dir():relative(item.filename.rstrip('/'));continue
            name=relative(item.filename);need(name not in members and not stat.S_ISLNK(item.external_attr>>16),'frontend ZIP regular unique path')
            need(0<item.file_size<=(BUILD_CAP if name=='artifact.tar' else FILE_CAP),'frontend ZIP bound before inflate')
            total+=item.file_size;need(total<=BUILD_CAP,'frontend aggregate bound');members[name]=archive.read(item)
    if set(members)=={'artifact.tar'}:
        build={};total=0;count=0
        with tarfile.open(fileobj=io.BytesIO(members['artifact.tar']),mode='r:') as archive:
            for item in archive:
                count+=1;need(count<=16384,'frontend TAR census cap');name=item.name.removeprefix('./')
                if item.isdir():
                    if name not in ('','.'):relative(name.rstrip('/'))
                    continue
                relative(name);need(item.isfile() and name not in build and 0<item.size<=FILE_CAP,'frontend TAR regular bounded unique member')
                total+=item.size;need(total<=BUILD_CAP and len(build)<8192,'frontend TAR aggregate bound');build[name]=archive.extractfile(item).read(FILE_CAP+1)
    else:build=members
    need({'index.html','brickwright-build.json'}<=set(build) and all(len(PurePosixPath(name).parts)<=32 for name in build),'frontend entry and finite depth')
    return ({name:{'byteLength':len(value),'sha256':sha(value)} for name,value in members.items()},
            {name:{'byteLength':len(value),'sha256':sha(value)} for name,value in build.items()})


def archive_originals(raw):
    need(type(raw) is bytes and 0 < len(raw) <= 384 << 20, 'bounded official original artifact')
    files = {}; total = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        need(len(archive.infolist()) <= 160, 'closed original artifact census')
        for item in archive.infolist():
            if item.is_dir():relative(item.filename.rstrip('/'));continue
            name = relative(item.filename)
            inner=name.removeprefix('originals/')
            need(allowed_role(inner) or name in ('controller.stdout','controller.stderr'),'fixed original role BEFORE inflate')
            need(name not in files and not stat.S_ISLNK(item.external_attr >> 16), 'regular unique original')
            cap = ARCHIVE_CAP if name.endswith('frontend.original.zip') else FILE_CAP
            need(0 <= item.file_size <= cap, 'original member size before inflate')
            total += item.file_size; need(total <= 384 << 20, 'aggregate original extent')
            files[name] = archive.read(item)
    # upload-artifact may retain the explicitly selected originals/ prefix.
    prefixed = [name for name in files if name.startswith('originals/')]
    if prefixed:
        need(all(name.startswith('originals/') or name in ('controller.stdout','controller.stderr') for name in files), 'fixed outer collector files')
        need(files.get('controller.stderr', b'') == b'', 'controller failure diagnostic')
        files = {name.removeprefix('originals/'):value for name,value in files.items() if name.startswith('originals/')}
    role_policy(set(files))
    inventory = decode(files.get('inventory.json', b'')); fields(inventory, 'schema files')
    need(inventory['schema'] == 'bw.gui-hdd.originals.v1' and type(inventory['files']) is dict and
         set(files)-{'inventory.json'} == set(inventory['files']), 'closed retained original roster')
    for name, row in inventory['files'].items():
        fields(row, 'byteLength sha256'); raw_ = files[name]
        need(type(row['byteLength']) is int and row['byteLength'] == len(raw_) and row['sha256'] == sha(raw_), 'original inventory extent/hash')
    return files


def typed_metadata(run,job,artifact):
    for obj,keys in ((run,('id','run_attempt')),(job,('id','run_id')),(artifact,('id','size_in_bytes'))):
        for key in keys:integer(obj.get(key),1,2**63-1)
    integer(artifact.get('workflow_run',{}).get('id'),1,2**63-1)


def process_original(files,role,argv,seconds):
    child=decode(files[role+'.process.json'])
    need(child.get('argv')==argv and type(child.get('exitCode')) is int and child['exitCode']==0 and
         child.get('firstFailure') is None and child.get('remainingDescendants')==[] and
         child.get('overflowObservedBytes')=={} and child.get('secondaryFailures')==[] and child.get('sameProcessGroupCleanupContinuousOwnershipQualified') is False,
         'fixed successful original process descriptor and terminal cleanup')
    integer(child.get('startedNs'),1,2**63-1);integer(child.get('endedNs'),1,2**63-1)
    need(0<child['endedNs']-child['startedNs']<=seconds*1000000000,'finite original process wall interval')
    identity=child['identity']
    for key in ('pid','pgid','sessionId','startTicks'):integer(identity.get(key),1,2**63-1)
    need(identity['pid']==identity['pgid']==identity['sessionId'],'owned process group/session identity')
    for stream in ('stdout','stderr'):
        raw=files[role+'.'+stream]
        need(child['streams'][stream]=={'byteLength':len(raw),'sha256':sha(raw)},'process original stream identity')
    need(files[role+'.stderr']==b'','successful original stderr')
    return child


def tracked_source_originals(files,request):
    arguments=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]+[
        ['cat-file','blob',request['source']['head']+':'+name] for name in sorted(SOURCE)]
    arguments+=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]
    indices=list(range(len(SOURCE)+2))+[len(SOURCE)+5,len(SOURCE)+6]
    prefix=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false',
        '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']
    expected_roles={f'git-{index}.{suffix}' for index in indices for suffix in ('stdout','stderr','process.json')}
    need({name for name in files if name.startswith('git-')}==expected_roles,'exact finite tracked Git original census')
    for position,(index,args) in enumerate(zip(indices,arguments)):
        role='git-'+str(index);process_original(files,role,prefix+args,15);raw=files[role+'.stdout']
        if args[0]=='rev-parse':need(raw.decode().strip()==request['source']['head' if args[1]=='HEAD' else 'tree'],'original Git source head/tree')
        else:
            row=request['source']['files'][sorted(SOURCE)[position-2]]
            need(len(raw)==row['byteLength'] and sha(raw)==row['sha256'],'original tracked source blob extent/hash')


def official_joins(request, originals, expected):
    prior_inventory=expected_policy(expected)
    need(sha(encode(prior_inventory))==request['inventoryAdmission']['original']['sha256'] and
         len(encode(prior_inventory))==request['inventoryAdmission']['original']['byteLength'],'externally reviewed prior inventory identity')
    admission=request['inventoryAdmission'];platform=prior_inventory.get('platform',{})
    need(prior_inventory.get('schema')=='bw.gui-hdd.inventory-original.v2' and prior_inventory.get('observationOnly') is True and
         prior_inventory.get('templateSha256')==admission['templateSha256'] and
         platform.get('GITHUB_RUN_ID')==str(admission['runId']) and platform.get('GITHUB_RUN_ATTEMPT')=='1' and
         platform.get('GITHUB_JOB')=='inventory' and platform.get('GITHUB_REPOSITORY')==REPOSITORY and
         platform.get('GITHUB_WORKFLOW_SHA')==admission['workflow']['commit'] and
         platform.get('GITHUB_EVENT_NAME')=='pull_request','prior inventory observed producing platform joins')
    event=prior_inventory.get('event');fields(event,'byteLength sha256 base64');integer(event['byteLength'],1,JSON_CAP);digest(event['sha256'])
    need(type(event['base64']) is str and len(event['base64'])<=(JSON_CAP+2)//3*4,'bounded prior event encoding')
    event_raw=base64.b64decode(event['base64'],validate=True)
    need(len(event_raw)==event['byteLength'] and sha(event_raw)==event['sha256'] and base64.b64encode(event_raw).decode()==event['base64'],'prior inventory event original identity')
    bind_inventory_event(event_raw,admission['sourceHead'],admission['templateSha256'],platform)
    need(prior_inventory['source']['head']==request['inventoryAdmission']['sourceHead'] and
         prior_inventory['installedFiles']==request['installedFiles'] and prior_inventory['runtime']['files']==request['runtime']['files'] and
         prior_inventory['runtime']['aliases']==request['runtime']['aliases'] and
         prior_inventory['runtime']['directoryAliases']==request['runtime']['directoryAliases'],'request graph joins independently supplied prior inventory original')
    digest(expected['buildSourceAdmissionSha256']);need(sha(encode(request['build']['sourceAdmission']))==expected['buildSourceAdmissionSha256'],'independent prior Build source admission original selection')
    digest(expected['requestSha256']); digest(expected['sourceHead'], 40); digest(expected['artifactSha256'])
    for key in ('runId','jobId','artifactId','artifactBytes'):integer(expected[key],1,2**63-1)
    need(expected['sourceHead'] == request['source']['head'], 'independent source selection')
    run, job, artifact = expected['run'], expected['job'], expected['artifact'];typed_metadata(run,job,artifact)
    need(run.get('id') == expected['runId'] and run.get('run_attempt') == 1 and run.get('status') == 'completed' and
         run.get('conclusion') == 'success' and run.get('event') == 'pull_request' and
         run.get('head_sha') == expected['sourceHead'] and run.get('repository',{}).get('full_name') == REPOSITORY and
         run.get('path') == '.github/workflows/i80386-hdd-gui-actual.yml', 'independently admitted official actual run')
    need(job.get('id') == expected['jobId'] and job.get('run_id') == expected['runId'] and
         job.get('name') == 'actual' and job.get('status') == 'completed' and job.get('conclusion') == 'success', 'official actual job')
    steps=job.get('steps');need(type(steps) is list and len(steps)<=64,'bounded official startup steps')
    positions=[]
    for name in STARTUP_STEPS:
        matches=[(i,item) for i,item in enumerate(steps) if item.get('name')==name]
        need(len(matches)==1 and matches[0][1].get('status')=='completed' and matches[0][1].get('conclusion')=='success','successful unique official startup/preflight/actual steps')
        positions.append(matches[0][0])
    need(positions==sorted(set(positions)),'outside startup precedes preflight and actual')
    need(artifact.get('id') == expected['artifactId'] and artifact.get('name') == expected['artifactName'] ==
         'i80386-hdd-gui-'+str(expected['runId'])+'-1' and artifact.get('expired') is False and
         artifact.get('size_in_bytes') == expected['artifactBytes'] and artifact.get('workflow_run',{}).get('id') == expected['runId'] and
         artifact.get('workflow_run',{}).get('head_sha') == expected['sourceHead'] and
         artifact.get('digest') == 'sha256:'+expected['artifactSha256'], 'official original artifact join')
    event = decode(originals['event.original.json']); env = {
        'GITHUB_REPOSITORY':REPOSITORY,'GITHUB_EVENT_NAME':'pull_request','GITHUB_ACTOR':'CrispStrobe',
        'GITHUB_RUN_ID':str(expected['runId']),'GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'actual','BW_EXPECTED_HEAD':expected['sourceHead']}
    bind_event(originals['event.original.json'], request, expected['requestSha256'], env)
    need(event.get('sender',{}).get('login') == run.get('actor',{}).get('login') == 'CrispStrobe', 'official actor/event join')


def fat_marker(image):
    """Read the genuine downloaded FAT16 directory/chain; no guest execution."""
    need(type(image) is bytes and len(image) == INPUTS['hdd'][0], 'fixed exported HDD extent')
    need(image[510:512] == b'\x55\xaa', 'HDD MBR signature')
    partition = int.from_bytes(image[454:458], 'little')*512
    need(partition == 17*512, 'fixed type1 partition start')
    boot = image[partition:partition+512]
    need(boot[510:512] == b'\x55\xaa' and int.from_bytes(boot[11:13],'little') == 512 and boot[13] == 2, 'fixed FAT16 boot geometry')
    reserved = int.from_bytes(boot[14:16],'little'); fats = boot[16]; sectors = int.from_bytes(boot[22:24],'little')
    entries = int.from_bytes(boot[17:19],'little'); need(reserved == 1 and fats == 2 and sectors == 41 and entries == 512, 'fixed FAT16 layout')
    fat_start = partition+reserved*512; root_start = fat_start+fats*sectors*512; data_start = root_start+entries*32
    need(image[fat_start:fat_start+sectors*512] == image[fat_start+sectors*512:fat_start+2*sectors*512], 'matching actual FAT copies')
    matches = []
    for offset in range(root_start, root_start+entries*32, 32):
        row = image[offset:offset+32]
        if row[0] == 0:break
        if row[:11]==b'BWKEEP  TXT':
            need(row[0]!=0xe5 and row[11]==0x20,'canonical regular marker attributes; no volume/LFN/directory alias');matches.append(row)
    need(len(matches) == 1 and not matches[0][11]&0x18, 'one actual regular marker directory entry')
    row = matches[0]; length = int.from_bytes(row[28:32],'little'); cluster = int.from_bytes(row[26:28],'little')
    need(length==len(b'bw-hdd-persist-ok\r\n'), 'exact genuine marker length'); out = bytearray(); seen = set()
    while cluster < 0xfff8:
        need(2 <= cluster < 0xfff0 and cluster not in seen and len(seen) < 4, 'finite valid FAT chain')
        seen.add(cluster);at = data_start+(cluster-2)*1024;need(at+1024 <= len(image), 'cluster inside image')
        out.extend(image[at:at+1024]);cluster = int.from_bytes(image[fat_start+cluster*2:fat_start+cluster*2+2],'little')
    need(len(seen)==(length+1023)//1024 and cluster in (0xfff8,0xffff) and bytes(out[:length])==b'bw-hdd-persist-ok\r\n','exact marker content/chain extent/canonical EOF')
    return {'byteLength':length,'clusters':len(seen),'sha256':sha(bytes(out[:length]))}


def counters(row):
    integer(row.get('cpuCycles'),0,240000000);integer(row.get('machineCycles'),0,2**53-1)
    need(type(row.get('timeNs')) in (int,float) and 0 <= row['timeNs'] <= 240000000000, 'finite simulated observation time')


def check_hdd(files):
    root = 'freedos-hdd-persistence/'
    proof = decode(files[root+'proof.json']); observations = decode(files[root+'observations.json'])
    need(proof.get('ok') is True and proof.get('scenario') == 'freedos-hdd-persistence' and
         proof.get('downloadsSaved') == 2 and proof.get('freshSessionReadback') is True and
         proof.get('originalSessionRetained') is True and proof.get('fullOsQualified') is False and
         proof.get('crashDurabilityQualified') is False, 'bounded genuine GUI scenario result')
    image = files[root+'386-master-hdd.img']; metadata = decode(files[root+'386-master-hdd.json'])
    fields(metadata, 'schema snapshotSchema drive byteLength sha256 geometry boundary boundaryMeaning guestCompletionQualified crashDurabilityQualified')
    need(metadata['schema'] == 'bw.i80386-master-hdd-download.v1' and metadata['snapshotSchema'] == 'bw.i80386-master-hdd-copy.v1' and
         metadata['drive'] == 'master' and metadata['byteLength'] == len(image) and metadata['sha256'] == sha(image) == proof['exportSha256'] and
         metadata['geometry'] == {'cylinders':306,'heads':4,'sectors':17} and metadata['boundaryMeaning'] == 'settled-detached-copy' and
         metadata['guestCompletionQualified'] is False and metadata['crashDurabilityQualified'] is False and
         sha(image) != INPUTS['hdd'][1], 'actual detached image/metadata binding')
    fields(metadata['boundary'], 'cpuCycles machineCycles')
    need(type(observations) is list and 1 <= len(observations) <= 4096, 'bounded actual page observations')
    per_page = {1:[],2:[]}
    for item in observations:
        need(type(item) is dict and type(item.get('page')) is int and item['page'] in per_page, 'real two-session page observation')
        counters(item); need(type(item.get('text')) is str and len(item['text']) <= 16384, 'bounded raw VGA text')
        previous = per_page[item['page']][-1] if per_page[item['page']] else None
        if previous:need(item['cpuCycles'] >= previous['cpuCycles'] and item['timeNs'] >= previous['timeNs'], 'per-session monotonic counters')
        per_page[item['page']].append(item)
    for page, sequence in per_page.items():
        need(sequence and any(re.search(r'(?im)^.*>type c:\\bwkeep\.txt\s*\n.*?bw-hdd-persist-ok\s*\n.*?>',item['text'],re.S) for item in sequence), 'fresh-session command echo, marker and later shell prompt')
    witnesses = decode(files[root+'session-witnesses.json']);fields(witnesses,'paused downloaded reloaded retained actions')
    for key in ('paused','downloaded','retained'):
        counters(witnesses[key]);need(witnesses[key]['phase'] == 'paused' and witnesses[key]['sameTarget'] is True, 'unchanged real paused original')
        need(all(witnesses[key][name] == metadata['boundary'][name] for name in ('cpuCycles','machineCycles')), 'download/retained paused counter boundary')
    need(witnesses['reloaded']['page'] == 2 and witnesses['reloaded']['sameAsOriginal'] is False, 'genuine distinct chooser session')
    need(type(witnesses['actions']) is list and [x['action'] for x in witnesses['actions']] ==
         ['write-marker','read-original','pause','download','reload-export','read-reloaded','retain-original'], 'finite actual UI operation sequence')
    for name in ('session-1.png','session-2.png'):need(files[root+name].startswith(b'\x89PNG\r\n\x1a\n'), 'actual canvas PNG original')
    return fat_marker(image)


def check_forward(files):
    root = 'forward-debug/';trace = decode(files[root+'forward-trace.json']);proof = decode(files[root+'proof.json'])
    need(proof.get('ok') is True and proof.get('scenario') == 'forward-debug' and proof.get('reverseExecutionQualified') is False and
         proof.get('modeAwareDisassemblyQualified') is False, 'bounded forward-only result')
    need(type(trace) is list and [x.get('action') for x in trace] == ['pause','align','breakpoint-add','breakpoint-hit','step-1','step-2',
        'physical-memory','breakpoint-remove','resume','pause-after-resume','circuits','code-retained'], 'actual finite debugger UI trace')
    for item in trace:
        counters(item);need(item.get('sameTarget') is True and type(item.get('regs')) is dict, 'real retained debugger target')
        for name in ('eax','edi','eip','eflags'):
            integer(item['regs'].get(name),0,0xffffffff)
        need(item['regs']['edi'] == 0x89abcdef, 'authored full-width EDI observed')
    paused,aligned=trace[:2]
    need(type(aligned.get('stepPerformed')) is bool,'recorded UI alignment choice')
    if aligned['stepPerformed']:
        need(paused['regs']['pc']==0x7c13 and aligned['regs']['pc']==0x7c11 and aligned['cpuCycles']>paused['cpuCycles'],'real optional alignment instruction')
    else:need(paused['regs']['pc']==aligned['regs']['pc']==0x7c11 and paused['cpuCycles']==aligned['cpuCycles'],'no invented alignment step')
    hit, one, two = trace[3:6]
    need(hit['phase'] == one['phase'] == two['phase'] == 'paused' and hit['breakpointAddress'] == hit['regs']['pc'], 'actual code breakpoint stops before address')
    for before, after in ((hit,one),(one,two)):
        pc = before['regs']['pc'];need(pc in (0x7c11,0x7c13), 'authored two-instruction loop PC')
        need(after['regs']['pc'] == (0x7c13 if pc==0x7c11 else 0x7c11) and
             after['regs']['eax'] == ((before['regs']['eax']+(pc==0x7c11))&0xffffffff) and
             after['cpuCycles'] > before['cpuCycles'], 'real one-instruction UI step architectural transition')
    memory = trace[6];need(memory['phase'] == 'paused' and memory.get('readOnly') is True and memory.get('space') == 'mem', 'physical memory UI readonly state')
    expected = bytes.fromhex('fa31c08ed866b87856341266bfefcdab896640ebfc')
    cells=memory.get('cells');need(type(cells) is list and len(cells)==len(expected),'exact physical memory UI cell extent')
    rendered_bytes=[]
    for index,cell in enumerate(cells):
        fields(cell,'address text role');integer(cell['address'],0,0xffffffff)
        need(cell['address']==0x7c00+index and type(cell['text']) is str and re.fullmatch('[0-9A-F]{2}',cell['text']) and
             cell['role'] in (None,'cell','presentation'),'canonical addressed noninteractive physical byte UI cell')
        rendered_bytes.append(int(cell['text'],16))
    need(memory.get('address') == 0x7c00 and memory.get('bytes') == rendered_bytes == list(expected) and
         memory['cpuCycles'] == two['cpuCycles'], 'passive rendered physical byte UI matches authored boot code')
    rendered=memory.get('renderedRegisters')
    need(type(rendered) is str and len(rendered)<=65536 and
         re.search(r'\bEAX\s+'+format(two['regs']['eax'],'08X')+r'(?![0-9A-Fa-f])',rendered) and
         re.search(r'\bEDI\s+89ABCDEF(?![0-9A-Fa-f])',rendered),'captured full-width rendered registers match actual two-step target')
    disabled = memory.get('unsupported');need(type(disabled) is dict and disabled == {'stepOver':True,'stepOut':True,'reverseStep':True,'reverseCycle':True,'reverseContinue':True}, 'source-backed unavailable operations remain disabled')
    resumed, paused, circuits, retained = trace[8:12]
    need(resumed['phase'] == 'running' and paused['phase'] == retained['phase'] == 'paused' and
         paused['cpuCycles'] > two['cpuCycles'] and paused['regs'] == retained['regs'] and
         paused['cpuCycles'] == circuits['cpuCycles'] == retained['cpuCycles'], 'resume progress and actual pane retention')
    need(files[root+'forward-debug.png'].startswith(b'\x89PNG\r\n\x1a\n'), 'actual debugger PNG original')
    return {'instructions':2,'breakpoint':hit['breakpointAddress'],'physicalBytes':len(expected)}


def audit(files, expected):
    expected_policy(expected);request = parse_request(files['request.original.json'], expected['requestSha256']);official_joins(request,files,expected)
    tracked_source_originals(files,request)
    role_policy(set(files));need(not any('failure' in name or name=='frontend.partial.zip' for name in files),'no hidden failed original in positive packet')
    result = decode(files['result.json']);fields(result,'schema pass requestSha256 scenarios firstFailure secondary')
    need(result['schema'] == 'bw.gui-hdd.result.v1' and result['pass'] is True and result['firstFailure'] is None and
         result['secondary'] == [] and result['requestSha256'] == expected['requestSha256'] and
         result['scenarios'] == list(SCENARIOS), 'authoritative terminal attempt result')
    for stage in ('before','after'):
        need(encode(decode(files['source.'+stage+'.json'])) == encode(request['source']), 'source original external expectation')
        need(encode(decode(files['installed.'+stage+'.json'])) == encode(request['installedFiles']), 'installed graph original external expectation')
        runtime = decode(files['runtime.'+stage+'.json']);need(runtime['files'] == request['runtime']['files'] and
             runtime['aliases'] == request['runtime']['aliases'] and runtime['directoryAliases']==request['runtime']['directoryAliases'] and runtime['resources'] == request['runtime']['resources'] and
             runtime['aggregateContainmentQualified'] is False, 'runtime external graph/caps and honest containment boundary')
        targets={row['target'] for row in request['runtime']['directoryAliases'].values()}
        need(type(runtime.get('directoryIdentities')) is dict and set(runtime['directoryIdentities'])==targets,'exact observed directory target census')
        for target,row in runtime['directoryIdentities'].items():
            fields(row,'dev ino mode');integer(row['dev'],0,2**63-1);integer(row['ino'],1,2**63-1);integer(row['mode'],0,2**32-1)
            need(stat.S_ISDIR(row['mode']),'observed selected directory target is directory')
    build = request['build'];run = decode(files['build-run.original.json']);job = decode(files['build-job.original.json']);artifact = decode(files['build-artifact.original.json']);typed_metadata(run,job,artifact)
    need(run.get('id') == build['runId'] and run.get('run_attempt') == 1 and run.get('repository',{}).get('full_name')==REPOSITORY and run.get('head_sha') == build['head'] and
         run.get('path') == '.github/workflows/build.yml' and run.get('status') == 'completed' and run.get('conclusion') == 'success', 'external frontend official run')
    need(job.get('id') == build['jobId'] and job.get('run_id') == build['runId'] and job.get('name') == 'build' and job.get('status')=='completed' and job.get('conclusion') == 'success', 'frontend producing job')
    need(artifact.get('id') == build['artifactId'] and artifact.get('name') == 'github-pages' and artifact.get('expired') is False and
         artifact.get('size_in_bytes')==build['metadataBytes'] and artifact.get('workflow_run',{}).get('head_sha')==build['head'] and artifact.get('digest') == 'sha256:'+build['sha256'] and artifact.get('workflow_run',{}).get('id') == build['runId'], 'external frontend artifact metadata')
    acquisition=decode(files['frontend-acquisition.process.json'])
    need(acquisition.get('argv')==['/usr/bin/gh','api','repos/'+REPOSITORY+'/actions/artifacts/'+str(build['artifactId'])+'/zip'] and
         type(acquisition.get('exitCode')) is int and acquisition['exitCode']==0 and acquisition.get('firstFailure') is None and
         acquisition.get('remainingDescendants')==[] and acquisition.get('overflowObservedBytes')=={} and acquisition.get('secondaryFailures')==[] and
         files['frontend-acquisition.stderr']==b'','one finite authenticated official frontend acquisition')
    integer(acquisition.get('startedNs'),1,2**63-1);integer(acquisition.get('endedNs'),1,2**63-1)
    need(0<acquisition['endedNs']-acquisition['startedNs']<=180000000000,'finite frontend acquisition interval')
    zip_ = files['frontend.original.zip'];need(len(zip_) == build['zipBytes'] and sha(zip_) == build['sha256'], 'retained exact frontend original')
    need(acquisition['streams']['stdout']=={'byteLength':len(zip_),'sha256':sha(zip_)} and acquisition['streams']['stderr']=={'byteLength':0,'sha256':sha(b'')},'acquisition raw stream original binding')
    observed_members,observed_build=read_frontend(zip_)
    admission_raw=files['probe-admission.json'];admission=decode(admission_raw)
    fields(admission,'schema boardPin sourceHead criticalFiles buildRoot buildFiles inputPaths')
    need(admission['schema']=='bw.gui-hdd-persistence-admission.v1' and admission['boardPin']==BOARD and
         admission['sourceHead']==request['source']['head'] and admission['criticalFiles']==request['criticalFiles'] and
         admission['buildFiles']==observed_build,'actual probe source/build admission joins')
    build_root=admission['buildRoot'];need(type(build_root) is str and build_root.startswith('/') and '..' not in Path(build_root).parts and
         build_root.endswith('/originals-build'),'fixed fresh actual build root')
    checkout=build_root.removesuffix('/gui-originals/originals-build')
    installed=startup_installation(files['python-startup.original.txt'])
    startup_arguments=['--request',checkout+'/gui-inputs/request.json','--expected-sha256',expected['requestSha256'],'--output',checkout+'/gui-originals/originals']
    for stage in ('before','after'):validate_startup(decode(files['python-startup.'+stage+'.json']),installed,'actual',startup_arguments)
    need(files['python-startup.before.json']==files['python-startup.after.json'],'unchanged startup observations across both scenarios')
    need(checkout!=build_root and admission['inputPaths']=={name:checkout+'/'+row['path'] for name,row in request['inputs'].items()},
         'fixed controller input path delivery')
    need(decode(files['frontend.members.json'])==observed_members and
         decode(files['build.inventory.json'])==observed_build,'independent complete authenticated frontend inventories')
    for scenario, limit in zip(SCENARIOS,(1250,180)):
        need(files[scenario+'/admission.json']==admission_raw,'original probe admission byte identity')
        proof=decode(files[scenario+'/proof.json'])
        need(proof.get('sourceHead')==request['source']['head'] and proof.get('boardPin')==BOARD and
             proof.get('admissionSha256')==sha(admission_raw),'scenario proof source/admission identity')
        child=decode(files[scenario+'.process.json']);need(type(child['exitCode']) is int and child['exitCode']==0 and child['firstFailure'] is None and child.get('secondaryFailures')==[] and
             child['remainingDescendants']==[] and type(child['startedNs']) is int and type(child['endedNs']) is int and
             0<child['endedNs']-child['startedNs']<=limit*1000000000,'actual bounded scenario lifetime/cleanup')
        identity=child['identity'];need(identity['pid']==identity['pgid']==identity['sessionId'] and identity['startTicks']>0,'actual owned process session')
        need(child['argv']==[request['runtime']['node'],PROBE], 'fixed source-backed browser descriptor')
        for stream in ('stdout','stderr'):
            raw=files[scenario+'.'+stream];need(child['streams'][stream]=={'byteLength':len(raw),'sha256':sha(raw)},'actual child stream binding')
        need(files[scenario+'.stderr']==b'', 'scenario stderr refusal')
        env=child['environment'];need(env['PROOF_ADMISSION']==checkout+'/gui-originals/originals/probe-admission.json' and env['PROOF_OUTPUT']==checkout+'/gui-originals/originals/'+scenario and env['PROOF_SCENARIO']==scenario and env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH']==request['runtime']['chromium'] and
             env['PROOF_BROWSER_SHA256']==request['runtime']['files'][request['runtime']['chromium']]['sha256'],'selected real browser delivery')
        launch=decode(files[scenario+'/browser-launch.json']);need(launch['executablePath']==request['runtime']['chromium'] and
             launch['sha256']==env['PROOF_BROWSER_SHA256'] and launch['byteLength']==request['runtime']['files'][request['runtime']['chromium']]['byteLength'],
             'admitted browser launch executable witness')
        identity_before=decode(files['runtime.before.json'])['identities'][request['runtime']['chromium']]
        need(any(item.get('executable')==request['runtime']['chromium'] and item.get('executableIdentity')==identity_before
             for sample in child['descendantSamples'] for item in sample['descendants']), 'actual observed browser process executable identity')
    return {'pass':True,'schema':'bw.gui-hdd.reader.v3','sourceHead':request['source']['head'],
        'hdd':check_hdd(files),'forwardDebug':check_forward(files),'aggregateContainmentQualified':False,
        'fullOsQualified':False,'physicalTimingQualified':False,'reverseExecutionQualified':False}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False);parser.add_argument('artifact');parser.add_argument('expected')
    args=parser.parse_args(argv);expected=decode(bounded_input(args.expected,JSON_CAP));expected_policy(expected)
    raw=bounded_input(args.artifact,expected['artifactBytes'])
    need(len(raw)==expected['artifactBytes'] and sha(raw)==expected['artifactSha256'],'external actual artifact digest')
    print(encode(audit(archive_originals(raw),expected)).decode(),end='');return 0


if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        print(json.dumps({'pass':False,'firstFailure':{'name':type(error).__name__,'message':str(error)}}),file=sys.stderr);sys.exit(1)
