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
CUI = 'fe89e3425bf323b1acd9e3f98df6a7383e9b836b'
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


def actual_inventory_reference(reference):
    """External prior-observation reference, never an automatic metadata approval."""
    fields(reference,'schema metadataAdmission jobId artifactId artifactSha256 workflow')
    need(reference['schema']=='bw.gui-hdd.actual-inventory-reference.v1','explicit actual typed inventory reference')
    for name in ('jobId','artifactId'):integer(reference[name],1,2**63-1)
    digest(reference['artifactSha256']);fields(reference['workflow'],'commit path sha256')
    digest(reference['workflow']['commit'],40);digest(reference['workflow']['sha256'])
    need(reference['workflow']['path']=='.github/workflows/i80386-hdd-gui-actual.yml','prior metadata producer workflow')
    selected=reference['metadataAdmission'];fields(selected,'schema source template original runId workflowSha')
    need(selected['schema']=='bw.gui-hdd.inventory-admission.v3','unchanged metadata v3 descriptor shape')
    integer(selected['runId'],1,2**63-1);digest(selected['workflowSha'],40)
    source=selected['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files']);need(set(source['files'])==SOURCE,'separately reviewed prior metadata source21')
    for name in ('template','original'):
        fields(selected[name],'byteLength sha256');integer(selected[name]['byteLength'],1,JSON_CAP);digest(selected[name]['sha256'])
    need(selected['workflowSha']==reference['workflow']['commit'] and
         reference['workflow']['sha256']==source['files'][reference['workflow']['path']]['sha256'],'prior observation/executing workflow/content join')
    return selected


def parse_request(raw, expected):
    digest(expected); need(type(raw) is bytes and 0 < len(raw) <= JSON_CAP and sha(raw) == expected,
                           'independently selected request digest')
    request = decode(raw)
    version=4 if request.get('schema')=='bw.gui-hdd.actual-request.v4' else 3
    fields(request, 'schema repository pullRequest source build criticalFiles installedFiles runtime inventoryAdmission inputs pythonStartup')
    need(encode(request) == raw and request['schema'] == 'bw.gui-hdd.actual-request.v'+str(version) and
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
    runtime = request['runtime']; fields(runtime, 'files aliases directoryAliases node python chromium tools resources'+(' emptyPythonSources' if version==4 else ''))
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
    if version==4:empty_python_policy(runtime['emptyPythonSources'],runtime['files'],runtime['aliases'],runtime['directoryAliases'])
    prior_inventory=request['inventoryAdmission']
    if version==4:actual_inventory_reference(prior_inventory)
    else:
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


def expected_embedded_original(original):
    fields(original,'byteLength sha256 base64');integer(original['byteLength'],1,JSON_CAP);digest(original['sha256'])
    need(type(original['base64']) is str and original['base64'].isascii() and len(original['base64'])==4*((original['byteLength']+2)//3),'bounded external embedded original')
    raw=base64.b64decode(original['base64'],validate=True)
    need(len(raw)==original['byteLength'] and sha(raw)==original['sha256'] and base64.b64encode(raw).decode()==original['base64'],'external embedded original exact bytes')
    return raw


def join_actual_typed_inventory(request,prior_inventory,expected):
    reference=request['inventoryAdmission'];metadata=actual_inventory_reference(reference)
    need(sha(encode(reference))==expected['inventoryReferenceSha256'],'independently selected actual prior-observation reference')
    prior_raw=expected_embedded_original(expected['inventoryOriginal']);template_raw=expected_embedded_original(expected['inventoryTemplate'])
    # The held metadata reader checks observations. Only the separately selected
    # reference and actual request authorize this new mapping.
    verify_inventory_original(prior_raw,template_raw,metadata)
    template=decode(template_raw)
    need(encode(prior_inventory['installedFiles'])==encode(request['installedFiles']),'actual installed graph joins reviewed prior observation')
    for role in ('files','aliases','directoryAliases','node','python','chromium','tools','resources'):
        need(encode(prior_inventory['runtime'][role])==encode(request['runtime'][role]),'actual positive runtime graph joins reviewed metadata '+role)
    need(encode(template['emptyPythonSources'])==encode(request['runtime']['emptyPythonSources']),'actual typed selection joins independently pinned metadata template')


def expected_policy(expected):
    version=4 if expected.get('schema')=='bw.gui-hdd.actual-expectation.v4' else 3
    fields(expected,'requestSha256 buildSourceAdmissionSha256 inventoryOriginal sourceHead runId jobId artifactId artifactName artifactBytes artifactSha256 run job artifact'+(' schema inventoryTemplate inventoryReferenceSha256' if version==4 else ''))
    if version==4:
        digest(expected['inventoryReferenceSha256']);expected_embedded_original(expected['inventoryTemplate'])
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
    version=4 if request['schema']=='bw.gui-hdd.actual-request.v4' else 3
    need((version==4)==(expected.get('schema')=='bw.gui-hdd.actual-expectation.v4'),'explicit request/reader expectation version agreement')
    if version==4:join_actual_typed_inventory(request,prior_inventory,expected)
    else:
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
        if request['schema']=='bw.gui-hdd.actual-request.v4':
            fields(runtime,'schema files aliases directoryAliases directoryIdentities identities resources availableCpus rlimits aggregateContainmentQualified emptyPythonSources')
            for role in ('files','aliases','directoryAliases','resources'):
                need(encode(runtime[role])==encode(request['runtime'][role]),'strict actual v4 runtime external graph/cap types')
            cpus=runtime['availableCpus'];need(type(cpus) is list and cpus,'observed nonempty CPU affinity list')
            for cpu in cpus:integer(cpu,0,2**31-1)
            need(cpus==sorted(set(cpus)),'observed sorted unique CPU affinity')
            fields(runtime['rlimits'],'1 4 7')  # Existing Linux FSIZE, CORE and NOFILE observations only.
            for pair in runtime['rlimits'].values():
                need(type(pair) is list and len(pair)==2,'observed rlimit pair')
                for limit in pair:integer(limit,-1,2**64-1)
            need(runtime.get('schema')=='bw.gui-hdd.runtime-observation.v4','explicit typed actual runtime observation v4')
            selected=runtime.get('emptyPythonSources');need(type(selected) is dict and set(selected)==set(request['runtime']['emptyPythonSources']),'runtime typed roster joins independent actual request')
            for row in selected.values():
                fields(row,'attempted status source');need(row['attempted'] is True and row['status']=='observed','actual typed source observed')
                verify_empty_python_source(row['source'])
        targets={row['target'] for row in request['runtime']['directoryAliases'].values()}
        need(type(runtime.get('directoryIdentities')) is dict and set(runtime['directoryIdentities'])==targets,'exact observed directory target census')
        for target,row in runtime['directoryIdentities'].items():
            fields(row,'dev ino mode');integer(row['dev'],0,2**63-1);integer(row['ino'],1,2**63-1);integer(row['mode'],0,2**32-1)
            need(stat.S_ISDIR(row['mode']),'observed selected directory target is directory')
    if request['schema']=='bw.gui-hdd.actual-request.v4':
        need(encode(decode(files['runtime.before.json'])['emptyPythonSources'])==encode(decode(files['runtime.after.json'])['emptyPythonSources']),'actual typed source before/after identity unchanged')
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
    return {'pass':True,'schema':'bw.gui-hdd.reader.v'+('4' if request['schema']=='bw.gui-hdd.actual-request.v4' else '3'),'sourceHead':request['source']['head'],
        'hdd':check_hdd(files),'forwardDebug':check_forward(files),'aggregateContainmentQualified':False,
        'fullOsQualified':False,'physicalTimingQualified':False,'reverseExecutionQualified':False}


EMPTY_PYTHON_PATH='/usr/lib/python3.12/urllib/__init__.py'
EMPTY_PYTHON_SHA256='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'


def empty_python_policy(selected,files,aliases,directory_aliases):
    need(type(selected) is dict and set(selected)=={EMPTY_PYTHON_PATH},'fixed typed empty Python source roster')
    row=selected[EMPTY_PYTHON_PATH];fields(row,'role byteLength sha256 uid gid mode')
    integer(row['byteLength'],0,0);integer(row['uid'],0,0);integer(row['gid'],0,0);integer(row['mode'],0o644,0o644)
    need(row['role']=='python-empty-package-source' and row['sha256']==EMPTY_PYTHON_SHA256,'fixed typed empty Python source identity')
    need(len(files)+len(selected)<=512 and not set(selected)&(set(files)|set(aliases)|set(directory_aliases)),
         'typed source disjoint from positive files/aliases within held cap')


def verify_empty_python_source(observed):
    fields(observed,'namedBefore heldBefore read heldAfter namedAfter close')
    before=observed['namedBefore']
    for snapshot in ('namedBefore','heldBefore','heldAfter','namedAfter'):
        fields(observed[snapshot],'dev ino mode uid gid nlink size mtime_ns')
        for key,value in observed[snapshot].items():integer(value,-2**63 if key=='mtime_ns' else 0,2**63-1 if key=='mtime_ns' else 2**64-1)
    need(before['mode']==stat.S_IFREG|0o644 and before['uid']==before['gid']==0 and before['nlink']==1 and before['size']==0,
         'typed root0644 single-link zero source metadata')
    need(all(observed[key]==before for key in ('heldBefore','heldAfter','namedAfter')),'typed held/named identity readback')
    read=observed['read'];fields(read,'byteLength sha256 eof');integer(read['byteLength'],0,0)
    need(read['eof'] is True and read['sha256']==EMPTY_PYTHON_SHA256,'typed observed EOF and empty digest')
    fields(observed['close'],'attempted succeeded')
    need(observed['close']['attempted'] is True and observed['close']['succeeded'] is True,'typed descriptor successful close')


INVENTORY_FAILURE_EVENT_CAP=256<<10


def inventory_failure_expected(expected):
    fields(expected,'schema source template failure runId workflowSha')
    need(expected['schema'] in ('bw.gui-hdd.inventory-failure-expectation.v2','bw.gui-hdd.inventory-failure-expectation.v3'),'explicit externally selected failure audit policy')
    integer(expected['runId'],1,2**63-1);digest(expected['workflowSha'],40)
    source=expected['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files']);need(set(source['files'])==SOURCE,'separately selected source21')
    for name in ('template','failure'):
        fields(expected[name],'byteLength sha256');integer(expected[name]['byteLength'],1,JSON_CAP);digest(expected[name]['sha256'])


def verify_inventory_failure(failure_raw,template_raw,expected):
    """Audit a retained failed observation; never runtime or official approval.

    The caller independently selects these original extents/digests and source,
    run and workflow facts after official artifact metadata admission.
    """
    inventory_failure_expected(expected)
    for raw,name in ((failure_raw,'failure'),(template_raw,'template')):
        need(type(raw) is bytes and len(raw)==expected[name]['byteLength'] and sha(raw)==expected[name]['sha256'],'independently selected '+name+' original')
    version=3 if expected['schema']=='bw.gui-hdd.inventory-failure-expectation.v3' else 2
    template=decode(template_raw);fields(template,'schema sourceHead files aliases directoryAliases node python chromium tools'+(' emptyPythonSources' if version==3 else ''))
    need(encode(template)==template_raw and template['schema']=='bw.gui-hdd.inventory-template.v'+str(version) and template['sourceHead']==expected['source']['head'],'retained canonical template/source binding')
    for role,cap in (('files',512),('aliases',256),('directoryAliases',256)):
        roster=template[role];need(type(roster) is list and len(roster)<=cap and len(set(roster))==len(roster),'bounded unique selected failure roster')
        for path in roster:runtime_path(path)
    need(template['files'] and len(template['aliases'])+len(template['directoryAliases'])<=256 and
         len(set(template['files']+template['aliases']+template['directoryAliases']))==sum(len(template[k]) for k in ('files','aliases','directoryAliases')),'disjoint complete selected failure roles')
    if version==3:empty_python_policy(template['emptyPythonSources'],template['files'],template['aliases'],template['directoryAliases'])
    value=decode(failure_raw);fields(value,'schema observationOnly candidate qualified template event platform diagnostic files aliases directoryAliases gitSource firstFailure secondary'+(' emptyPythonSources' if version==3 else ''))
    need(encode(value)==failure_raw and value['schema']=='bw.gui-hdd.inventory-failure.v'+str(version) and value['observationOnly'] is True and value['candidate'] is False and value['qualified'] is False and value['firstFailure'] is not None,'explicit canonical failure-only original')
    selected=value['template'];fields(selected,'byteLength sha256 expectedSha256 sourceHead bindingVerified')
    need(selected==dict(expected['template'],expectedSha256=expected['template']['sha256'],sourceHead=expected['source']['head'],bindingVerified=True),'failure retains independently selected template identity')
    event=value['event'];fields(event,'byteLength sha256 bindingVerified original');integer(event['byteLength'],1,INVENTORY_FAILURE_EVENT_CAP);digest(event['sha256'])
    original=event['original'];fields(original,'available base64 reason')
    need(original['available'] is True and original['reason'] is None and event['bindingVerified'] is True and type(original['base64']) is str and original['base64'].isascii() and len(original['base64'])==4*((event['byteLength']+2)//3),'exact raw event original available within fixed cap')
    event_raw=base64.b64decode(original['base64'],validate=True)
    need(len(event_raw)==event['byteLength'] and sha(event_raw)==event['sha256'] and base64.b64encode(event_raw).decode()==original['base64'],'exact raw event byte extent/hash/encoding')
    platform=value['platform'];fields(platform,'GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB GITHUB_REPOSITORY GITHUB_WORKFLOW_SHA GITHUB_WORKFLOW_REF GITHUB_EVENT_NAME GITHUB_ACTOR BW_EXPECTED_HEAD')
    need(platform['GITHUB_RUN_ID']==str(expected['runId']) and platform['GITHUB_WORKFLOW_SHA']==expected['workflowSha'],'independent run/workflow producing context')
    bind_inventory_event(event_raw,expected['source']['head'],expected['template']['sha256'],platform)
    pr=decode(event_raw)['pull_request']
    need(platform['GITHUB_WORKFLOW_REF']==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(pr['number'])+'/merge','raw event/executing workflow ref join')
    diagnostic=value['diagnostic'];fields(diagnostic,'pathBytes limitBytes complete');integer(diagnostic['pathBytes'],0,JSON_CAP);integer(diagnostic['limitBytes'],1,JSON_CAP)
    need(diagnostic['complete'] is True and diagnostic['pathBytes']<=diagnostic['limitBytes'],'complete bounded failure path observations, no hidden truncation')
    frame=decode(encode(value));frame.update(files={},aliases={},directoryAliases={},firstFailure=None,secondary=[],gitSource={'reached':False,'head':None,'tree':None,'files':{}},diagnostic={'pathBytes':0,'limitBytes':0,'complete':False})
    if version==3:frame['emptyPythonSources']={}
    need(diagnostic['limitBytes']==JSON_CAP-len(encode(frame))-8192,'independent event/frame reservation before path diagnostic budget')
    errors=[];counts={};path_cost=0
    roles=('files','emptyPythonSources','aliases','directoryAliases') if version==3 else ('files','aliases','directoryAliases')
    for role in roles:
        observed=value[role];need(type(observed) is dict and set(observed)==set(template[role]),'entire selected failure roster retained');counts[role]={}
        for path in template[role]:
            row=observed[path];need(type(row) is dict and {'attempted','status'}<=set(row) and set(row)<=set('attempted status metadataBefore metadataAfter error'.split())|({'source'} if role=='emptyPythonSources' else {'file'} if role=='files' else {'linkText'}),'closed reported path facts')
            need(type(row['attempted']) is bool and row['status'] in ('observed','failed','unvisited-deadline'),'explicit path attempt/status')
            counts[role][row['status']]=counts[role].get(row['status'],0)+1
            for name in ('metadataBefore','metadataAfter'):
                if name in row:
                    info=row[name];fields(info,'dev ino mode uid gid nlink size mtime_ns')
                    for name,item in info.items():integer(item,-2**63 if name=='mtime_ns' else 0,2**63-1 if name=='mtime_ns' else 2**64-1)
            if row['status']=='observed':
                need(row['attempted'] is True and 'error' not in row,'reported observed path')
                if role=='emptyPythonSources':
                    need(set(row)=={'attempted','status','source'},'closed typed observed path');verify_empty_python_source(row['source'])
                else:need(row['metadataBefore']==row['metadataAfter'],'reported stable observed path')
                if role=='files':
                    fields(row['file'],'byteLength sha256');integer(row['file']['byteLength'],1,256<<20);digest(row['file']['sha256'])
                    need(stat.S_ISREG(row['metadataBefore']['mode']) and row['metadataBefore']['size']==row['file']['byteLength'],'reported regular selected file extent')
                elif role!='emptyPythonSources':need(stat.S_ISLNK(row['metadataBefore']['mode']) and type(row['linkText']) is str and 0<len(row['linkText'])<=512,'reported alias text')
            else:
                need('error' in row and (row['attempted'] is True if row['status']=='failed' else row['attempted'] is False and set(row)=={'attempted','status','error'}),'failed/unvisited paths cannot be observed success')
                error=row['error'];need(error.get('path')==path and error.get('phase')==('inventory-empty-python-source' if role=='emptyPythonSources' else 'inventory-file' if role=='files' else 'inventory-alias'),'path error provenance');errors.append(error)
            path_cost+=len(encode({path:row}))+len(encode(row.get('error')))+32
    need(path_cost==diagnostic['pathBytes'],'independent path budget accounting')
    need(type(value['secondary']) is list and len(value['secondary'])<=770,'bounded secondary failure observations')
    all_errors=[value['firstFailure']]+value['secondary']
    for error in all_errors:
        need(type(error) is dict and {'phase','name','message'}<=set(error)<=set('phase name message path'.split()),'closed retained error observation')
        for name,cap in (('phase',128),('name',128),('message',1024)):need(type(error[name]) is str and error[name].isascii() and len(error[name])<=cap,'capped error fact')
        if 'path' in error:runtime_path(error['path'])
    if version==3:
        path_errors=[error for error in all_errors if error['phase'] in ('inventory-file','inventory-empty-python-source','inventory-alias')]
        need(path_errors==errors and (not errors or all_errors[0]==errors[0]),'typed first path refusal and ordered secondary observations preserved')
    else:need(all_errors[:len(errors)]==errors,'first selected-path error and ordered secondary observations preserved')
    source=value['gitSource'];fields(source,'reached head tree files');need(type(source['reached']) is bool and type(source['files']) is dict,'explicit unavailable/partial source observation')
    if not source['reached']:need(source=={'reached':False,'head':None,'tree':None,'files':{}},'source not invented before held Git gate')
    else:
        for name in ('head','tree'):need(source[name] is None or source[name]==expected['source'][name],'reported source identity joins external selection')
        need(set(source['files'])<=SOURCE and all(row==expected['source']['files'][path] for path,row in source['files'].items()),'reported partial source file identities')
    return {'schema':'bw.gui-hdd.inventory-failure-reader.v'+str(version),'failureObserved':True,'eventJoined':True,'candidate':False,'qualified':False,
      'templateSha256':expected['template']['sha256'],'sourceHead':expected['source']['head'],'runId':expected['runId'],'counts':counts,
      'gitSourceReached':source['reached'],'firstFailure':value['firstFailure']}


def inventory_admission_expected(expected):
    fields(expected,'schema source template original runId workflowSha')
    need(expected['schema']=='bw.gui-hdd.inventory-admission.v3','external metadata admission v3; no actual authority')
    inventory_failure_expected({'schema':'bw.gui-hdd.inventory-failure-expectation.v3','source':expected['source'],
      'template':expected['template'],'failure':expected['original'],'runId':expected['runId'],'workflowSha':expected['workflowSha']})


def verify_inventory_original(original_raw,template_raw,expected):
    """Validate externally pinned metadata only, never create approval or actual input."""
    inventory_admission_expected(expected)
    for raw,name in ((original_raw,'original'),(template_raw,'template')):
        need(type(raw) is bytes and len(raw)==expected[name]['byteLength'] and sha(raw)==expected[name]['sha256'],'independently selected '+name+' original')
    template=decode(template_raw);fields(template,'schema sourceHead files aliases directoryAliases node python chromium tools emptyPythonSources')
    need(encode(template)==template_raw and template['schema']=='bw.gui-hdd.inventory-template.v3' and template['sourceHead']==expected['source']['head'],'explicit canonical metadata template v3')
    for role,cap in (('files',512),('aliases',256),('directoryAliases',256)):
        roster=template[role];need(type(roster) is list and len(roster)<=cap and len(set(roster))==len(roster),'bounded selected metadata roster')
        for path in roster:runtime_path(path)
    need(template['files'] and len(template['aliases'])+len(template['directoryAliases'])<=256 and
         len(set(template['files']+template['aliases']+template['directoryAliases']))==sum(len(template[k]) for k in ('files','aliases','directoryAliases')),'disjoint metadata role roster')
    empty_python_policy(template['emptyPythonSources'],template['files'],template['aliases'],template['directoryAliases'])
    value=decode(original_raw);fields(value,'schema observationOnly templateSha256 source installedFiles runtime event commands platform emptyPythonSources')
    need(encode(value)==original_raw and value['schema']=='bw.gui-hdd.inventory-original.v3' and value['observationOnly'] is True and
         value['templateSha256']==expected['template']['sha256'] and encode(value['source'])==encode(expected['source']),'externally selected canonical metadata/source original')
    runtime=value['runtime'];fields(runtime,'files aliases directoryAliases node python chromium tools resources')
    for role in ('files','aliases','directoryAliases'):need(type(runtime[role]) is dict and set(runtime[role])==set(template[role]),'positive runtime roster joins selected template')
    for path,row in runtime['files'].items():
        fields(row,'byteLength sha256');integer(row['byteLength'],1,256<<20);digest(row['sha256'])
    runtime_alias_policy(runtime)
    for key in ('node','python','chromium'):need(runtime[key]==template[key] and runtime[key] in runtime['files'],'positive selected executable')
    need(runtime['files'][runtime['node']]=={'byteLength':124827920,'sha256':'fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48'},'held independently admitted Node identity')
    need(runtime['tools']==template['tools']=={'git':'/usr/bin/git','gh':'/usr/bin/gh'} and all(path in runtime['files'] for path in runtime['tools'].values()),'held positive bootstrap tool closure')
    need(encode(runtime['resources'])==encode({'jobMinutes':35,'controllerSeconds':1800,'scenarioSeconds':{'freedos-hdd-persistence':1250,'forward-debug':180},
      'perProcessCoreBytes':0,'perProcessFileBytes':FILE_CAP,'perProcessOpenFiles':256,'aggregateContainmentQualified':False}),'held finite metadata envelope')
    selected=value['emptyPythonSources'];need(type(selected) is dict and set(selected)==set(template['emptyPythonSources']),'exact typed source observation roster')
    for row in selected.values():
        fields(row,'attempted status source');need(row['attempted'] is True and row['status']=='observed','typed source actually observed')
        verify_empty_python_source(row['source'])
    rows(value['installedFiles'])
    event=value['event'];fields(event,'byteLength sha256 base64');integer(event['byteLength'],1,JSON_CAP);digest(event['sha256'])
    need(type(event['base64']) is str and len(event['base64'])==4*((event['byteLength']+2)//3),'bounded exact event original')
    raw=base64.b64decode(event['base64'],validate=True)
    need(len(raw)==event['byteLength'] and sha(raw)==event['sha256'] and base64.b64encode(raw).decode()==event['base64'],'raw metadata event identity')
    platform=value['platform'];fields(platform,'GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB GITHUB_REPOSITORY GITHUB_WORKFLOW_SHA GITHUB_WORKFLOW_REF GITHUB_EVENT_NAME GITHUB_ACTOR BW_EXPECTED_HEAD')
    need(platform['GITHUB_RUN_ID']==str(expected['runId']) and platform['GITHUB_WORKFLOW_SHA']==expected['workflowSha'],'external metadata run/workflow join')
    bind_inventory_event(raw,expected['source']['head'],expected['template']['sha256'],platform)
    need(platform['GITHUB_WORKFLOW_REF']==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(decode(raw)['pull_request']['number'])+'/merge','metadata event/workflow ref join')
    commands=value['commands'];need(type(commands) is list and len(commands)==2+len(SOURCE),'finite read-only source command observations')
    arguments=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]+[['cat-file','blob',expected['source']['head']+':'+path] for path in sorted(SOURCE)]
    outputs=[{'byteLength':41,'sha256':sha((expected['source'][key]+'\n').encode())} for key in ('head','tree')]+[expected['source']['files'][path] for path in sorted(SOURCE)]
    prefix=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']
    for command,args,out in zip(commands,arguments,outputs):
        fields(command,'argv stdout stderr exitCode')
        need(command['argv']==prefix+args and type(command['exitCode']) is int and command['exitCode']==0 and command['stdout']==out and
             command['stderr']=={'byteLength':0,'sha256':EMPTY_PYTHON_SHA256},'fixed successful source command output observations')
    return {'schema':'bw.gui-hdd.inventory-reader.v3','observationOnly':True,'candidate':False,'qualified':False,
      'sourceHead':expected['source']['head'],'runId':expected['runId'],'emptyPythonSources':len(selected),'actualRequestSupported':False}


FONT_ROOTS = ('/etc/fonts/conf.d', '/usr/share/fonts', '/usr/local/share/fonts')
FONT_PREFIXES = ('/etc/fonts/', '/usr/share/fontconfig/', '/usr/share/fonts/', '/usr/local/share/fonts/')
FONT_STREAM_CAP = 128 << 10

def font_blob(raw):
    return {'byteLength':len(raw),'sha256':sha(raw),'base64':base64.b64encode(raw).decode()}



def font_request(raw,expected):
    digest(expected);need(sha(raw)==expected,'independently selected font discovery request')
    value=decode(raw);fields(value,'schema source baseline')
    need(encode(value)==raw and value['schema']=='bw.gui-hdd.font-discovery-request.v1','canonical explicit font discovery request')
    source=value['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files']);need(set(source['files'])==SOURCE,'exact discovery source21')
    baseline=value['baseline'];fields(baseline,'byteLength sha256 base64');integer(baseline['byteLength'],1,JSON_CAP//4);digest(baseline['sha256'])
    need(type(baseline['base64']) is str and len(baseline['base64'])==4*((baseline['byteLength']+2)//3),'bounded retained baseline template')
    original=base64.b64decode(baseline['base64'],validate=True)
    need(font_blob(original)==baseline,'exact baseline template original')
    template=decode(original);need(encode(template)==original and template.get('schema') in ('bw.gui-hdd.inventory-template.v2','bw.gui-hdd.inventory-template.v3'),'unmodified versioned baseline template')
    selected=[]
    for key in ('files','aliases'):
        roster=template.get(key);need(type(roster) is list and len(roster)<=512,'finite baseline roster')
        for path in roster:
            runtime_path(path)
            if path.startswith(FONT_PREFIXES):selected.append(path)
    need(len(selected)==len(set(selected)) and len(selected)<=512,'unique bounded baseline font paths')
    return value,sorted(selected)



def font_event(raw,request_sha,head,env):
    event=decode(raw);pr=event.get('pull_request',{})
    need(event.get('action')=='labeled' and event.get('label',{}).get('name')=='x86-hdd-gui-font-discovery' and
         event.get('sender',{}).get('login')=='CrispStrobe' and event.get('repository',{}).get('full_name')==REPOSITORY,'owned discovery event')
    integer(event.get('number'),1,2**31-1)
    need(type(pr.get('number')) is int and event['number']==pr['number'] and pr.get('state')=='open' and
         pr.get('head',{}).get('sha')==head and pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY,'exact own discovery source event')
    marker='<!-- BW_GUI_HDD_FONT_DISCOVERY_SHA256='+request_sha+' -->'
    need(type(pr.get('body')) is str and pr['body'].count('<!-- BW_GUI_HDD_FONT_DISCOVERY_SHA256=')==1 and pr['body'].count(marker)==1,'event transports selected discovery pin only')
    need(env.get('GITHUB_REPOSITORY')==REPOSITORY and env.get('GITHUB_EVENT_NAME')=='pull_request' and env.get('GITHUB_ACTOR')=='CrispStrobe' and
         env.get('GITHUB_RUN_ATTEMPT')=='1' and env.get('GITHUB_JOB')=='font-discovery' and re.fullmatch('[1-9][0-9]{0,19}',env.get('GITHUB_RUN_ID','')) and
         env.get('BW_EXPECTED_HEAD')==head,'first discovery platform observations')
    digest(env.get('GITHUB_WORKFLOW_SHA'),40)
    need(env.get('GITHUB_WORKFLOW_REF')==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(pr['number'])+'/merge','discovery workflow/event reference')



def font_xml(raw):
    # This is a structural reference census, never Fontconfig execution semantics.
    import xml.etree.ElementTree as ET
    need(len(raw)<=65536,'bounded config original')
    text=raw.decode('utf-8');doctype='<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">'
    if doctype in text:need(text.count(doctype)==1,'single opaque standard prolog');text=text.replace(doctype,'',1)
    need(not re.search(r'<!\s*(?:DOCTYPE|ENTITY)',text,re.I),'no DTD loading, internal subset or entities')
    root=ET.fromstring(text);need(root.tag=='fontconfig' and not root.attrib,'fontconfig structural root')
    references=[];unsupported=[]
    for item in root:
        if item.tag in ('include','dir'):
            content=(item.text or '').strip()
            allowed={'ignore_missing','prefix'} if item.tag=='include' else {'prefix','salt'}
            if len(item) or not set(item.attrib)<=allowed or item.attrib.get('prefix','default')!='default' or not content or len(content)>512:
                unsupported.append('unsupported '+item.tag+' reference');continue
            if item.tag=='include' and item.attrib.get('ignore_missing','no') not in ('yes','no'):
                unsupported.append('unsupported include ignore_missing');continue
            references.append({'kind':item.tag,'text':content,'ignoreMissing':item.attrib.get('ignore_missing','no')=='yes'})
        else:unsupported.append('opaque element '+str(item.tag)[:80])
    need(len(references)+len(unsupported)<=512,'bounded XML child census')
    return {'references':references,'unsupported':unsupported,'nativeSelectionInterpreted':False}



def font_config_links(configs,files,aliases,directories):
    import posixpath
    references=[];edges={path:[] for path in configs}
    for path,config in sorted(configs.items()):
        for ref in config['references']:
            text=ref['text'];target=text if text.startswith('/') else posixpath.normpath(posixpath.dirname(path)+'/'+text)
            supported=target.startswith(FONT_PREFIXES) and '..' not in target.split('/') and '~' not in text
            targets=[];status='unsupported' if not supported else 'missing-ignored' if ref['ignoreMissing'] else 'missing'
            if supported:
                if target in aliases:target=aliases[target].get('target',target)
                if ref['kind']=='dir':status='observed-directory' if target in directories and 'after' in directories[target] else status
                elif target in configs:targets=[target];status='observed-config'
                elif target in directories and 'entries' in directories[target]:
                    for name in directories[target]['entries']:
                        if re.fullmatch(r'[0-9].*\.conf',name):
                            child=target+'/'+name;child=aliases.get(child,{}).get('target',child)
                            if child in configs:targets.append(child)
                            else:status='incomplete-directory'
                    if status!='incomplete-directory':status='observed-config-directory'
                edges[path].extend(targets)
            references.append({'from':path,**ref,'target':target,'targets':targets,'status':status})
    cycles=[]
    # Bound expansion without claiming native traversal order or complete grammar.
    visits=0
    for path in edges:
        todo=[(path,[])]
        while todo:
            item,stack=todo.pop();visits+=1;need(visits<=8192 and len(stack)<=128,'finite config reference traversal')
            if item in stack:
                cycle=stack[stack.index(item):]+[item]
                if cycle not in cycles:cycles.append(cycle)
            else:todo.extend((target,stack+[item]) for target in edges.get(item,[]))
    return {'references':references,'cycles':cycles,'nativeSelectionInterpreted':False}



def font_packages(raw):
    need(type(raw) is bytes and len(raw)<=FONT_STREAM_CAP,'bounded package table');out={}
    for line in raw.decode('utf-8').splitlines():
        pieces=line.split('\t');need(len(pieces)==3 and re.fullmatch('[a-z0-9][a-z0-9+.:~-]{0,127}',pieces[0]) and 0<len(pieces[1])<=256 and pieces[2] in ('installed','not-installed','config-files'),'strict installed-package observation')
        need(pieces[0] not in out,'unique package observation');out[pieces[0]]={'version':pieces[1],'status':pieces[2]}
    need(0<len(out)<=8192,'finite package census');return out



def font_owners(raw,query,packages):
    out={}
    for line in raw.decode('utf-8').splitlines():
        names,sep,path=line.partition(': ');need(sep and path in query and path not in out,'ownership matches exact queried path')
        owners=names.split(', ');need(0<len(owners)<=8 and len(set(owners))==len(owners) and all(name in packages and packages[name]['status']=='installed' for name in owners),'installed package ownership observation')
        out[path]=owners
    need(set(out)==set(query),'every queried path has observed ownership; no missing/unowned fallback');return out



def font_manifest(raw):
    out=set()
    for path in raw.decode('utf-8').splitlines():
        need(path.startswith('/') and len(path)<=1024 and '\x00' not in path,'bounded package manifest path');out.add(path)
    need(len(out)<=32768,'finite package manifest census');return out



def font_original_blob(value,cap):
    fields(value,'byteLength sha256 base64');integer(value['byteLength'],0,cap);digest(value['sha256'])
    need(type(value['base64']) is str and len(value['base64'])==4*((value['byteLength']+2)//3),'bounded font original encoding')
    raw=base64.b64decode(value['base64'],validate=True)
    need(len(raw)==value['byteLength'] and sha(raw)==value['sha256'] and base64.b64encode(raw).decode()==value['base64'],'exact font original bytes/hash/extent')
    return raw


def font_stat(info):
    fields(info,'dev ino mode uid gid nlink size mtime_ns')
    for key,value in info.items():integer(value,-2**63 if key=='mtime_ns' else 0,2**63-1 if key=='mtime_ns' else 2**64-1)


def font_file_row(row,complete=False,tool=False):
    need(type(row) is dict and set(row)<=set('namedBefore heldBefore heldAfter namedAfter file close original'.split()),'closed font file observations')
    for key in ('namedBefore','heldBefore','heldAfter','namedAfter'):
        if key in row:font_stat(row[key])
    if 'file' in row:
        fields(row['file'],'byteLength sha256 eof');integer(row['file']['byteLength'],0,FILE_CAP);digest(row['file']['sha256']);need(type(row['file']['eof']) is bool,'strict EOF observation')
    if 'close' in row:
        fields(row['close'],'attempted succeeded');need(all(type(row['close'][k]) is bool for k in ('attempted','succeeded')),'strict close observations')
    if complete:
        need(set(row)>={'namedBefore','heldBefore','heldAfter','namedAfter','file','close'},'complete font file readback/close')
        before=row['namedBefore'];need(stat.S_ISREG(before['mode']) and before['size']==row['file']['byteLength'] and row['file']['eof'] is True,'regular observed EOF/extent')
        need(all(encode(row[key])==encode(before) for key in ('heldBefore','heldAfter','namedAfter')),'strict held/named discovery identity readback')
        need(row['close']=={'attempted':True,'succeeded':True},'discovery close completed')
        if tool:need(before['uid']==0 and not before['mode']&0o6022 and before['mode']&0o111,'selected root-owned nonwritable system tool')


def font_expected(expected):
    fields(expected,'schema source request original runId workflowSha')
    need(expected['schema']=='bw.gui-hdd.font-discovery-expectation.v1','explicit discovery-only expectation')
    inventory_failure_expected({'schema':'bw.gui-hdd.inventory-failure-expectation.v3','source':expected['source'],
      'template':expected['request'],'failure':expected['original'],'runId':expected['runId'],'workflowSha':expected['workflowSha']})


def verify_font_discovery(original_raw,request_raw,expected):
    font_expected(expected)
    for name,raw in (('original',original_raw),('request',request_raw)):
        need(type(raw) is bytes and len(raw)==expected[name]['byteLength'] and sha(raw)==expected[name]['sha256'],'externally selected discovery '+name)
    request,baseline=font_request(request_raw,expected['request']['sha256'])
    need(encode(request['source'])==encode(expected['source']),'discovery source joins external selection')
    value=decode(original_raw);fields(value,'schema observationOnly candidate qualified activeFontSelectionProved perPackageManifestBoundariesProved request event platform sourceCommands tools directories files aliases configs configReferences baselineMissing commands packages complete firstFailure secondary')
    need(encode(value)==original_raw and value['schema']=='bw.gui-hdd.font-discovery-original.v1' and value['observationOnly'] is True and
         value['candidate'] is False and value['qualified'] is False and value['activeFontSelectionProved'] is False and value['perPackageManifestBoundariesProved'] is False and type(value['complete']) is bool,'canonical observation, never actual/font-selection qualification')
    need(font_original_blob(value['request'],JSON_CAP)==request_raw,'retained original request')
    event_raw=font_original_blob(value['event'],256<<10);platform=value['platform']
    fields(platform,'GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB GITHUB_REPOSITORY GITHUB_WORKFLOW_SHA GITHUB_WORKFLOW_REF GITHUB_EVENT_NAME GITHUB_ACTOR BW_EXPECTED_HEAD')
    need(platform['GITHUB_RUN_ID']==str(expected['runId']) and platform['GITHUB_WORKFLOW_SHA']==expected['workflowSha'],'external discovery run/workflow metadata joins')
    font_event(event_raw,expected['request']['sha256'],expected['source']['head'],platform)
    errors=([value['firstFailure']] if value['firstFailure'] is not None else [])+value['secondary']
    need(type(value['secondary']) is list and len(value['secondary'])<=128,'bounded ordered discovery errors')
    for error in errors:
        fields(error,'phase path name message')
        for key in ('phase','name','message'):need(type(error[key]) is str and len(error[key])<=512,'bounded discovery refusal')
        if error['path'] is not None:runtime_path(error['path'])
    need(value['complete'] is not True or not errors,'complete discovery cannot hide a first error')
    tools=value['tools'];need(type(tools) is dict and set(tools)<=set(('/usr/bin/git','/usr/bin/dpkg-query')),'fixed selected tool roster')
    for row in tools.values():font_file_row(row,complete=bool(value['sourceCommands']),tool=bool(value['sourceCommands']))
    if value['directories'] or value['files'] or value['aliases'] or value['configs'] or value['commands'] or value['complete']:
        need(type(value['sourceCommands']) is list and len(value['sourceCommands'])==2+len(SOURCE),'all source21 before any discovery observations')
    if value['sourceCommands']:
        need(set(tools)=={'/usr/bin/git','/usr/bin/dpkg-query'},'tools admitted before source probes')
        args=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]+[['cat-file','blob',request['source']['head']+':'+p] for p in sorted(SOURCE)]
        outputs=[{'byteLength':41,'sha256':sha((request['source'][k]+'\n').encode())} for k in ('head','tree')]+[request['source']['files'][p] for p in sorted(SOURCE)]
        prefix=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']
        need(type(value['sourceCommands']) is list and len(value['sourceCommands'])<=len(args),'finite source command prefix')
        for command,arg,out in zip(value['sourceCommands'],args,outputs):
            fields(command,'argv stdout stderr exitCode');integer(command['exitCode'],0,0)
            need(command['argv']==prefix+arg and encode(command['stdout'])==encode(out) and command['stderr']=={'byteLength':0,'sha256':sha(b'')},'exact source21 Git/live/external observation')
        if value['directories'] or value['commands']:need(len(value['sourceCommands'])==len(args),'all source21 before discovery reads/probes')
    directories=value['directories'];files=value['files'];aliases=value['aliases'];configs=value['configs']
    need(type(directories) is dict and len(directories)<=128 and type(files) is dict and len(files)<=512 and type(aliases) is dict and len(aliases)<=256 and
         type(configs) is dict and not set(files)&set(aliases) and set(configs)<=set(files),'bounded disjoint font/config census')
    reached=set(FONT_ROOTS)|{'/etc/fonts/fonts.conf'};alias_targets=set()
    for path,row in directories.items():
        runtime_path(path);need(path in FONT_ROOTS or any(path.startswith(root+'/') for root in FONT_ROOTS),'fixed discovery directory roots')
        need(type(row) is dict and set(row)<=set(('before','after','entries')),'closed directory census')
        for key in ('before','after'):
            if key in row:font_stat(row[key]);need(stat.S_ISDIR(row[key]['mode']),'directory type')
        if 'entries' in row:
            names=row['entries'];need(type(names) is list and len(names)<=1024 and all(type(n) is str and re.fullmatch('[A-Za-z0-9_.@+ -]{1,255}',n) and n not in ('.','..') for n in names) and names==sorted(set(names)),'strict finite sorted directory census')
            reached.update(path+'/'+name for name in names)
            need('before' in row and 'after' in row and encode(row['before'])==encode(row['after']),'directory census stable readback')
    queue=[p for p in FONT_ROOTS if p in directories];visited=set()
    while queue:
        path=queue.pop(0);need(path not in visited and len(Path(path).parts)<=12,'finite acyclic directory traversal');visited.add(path)
        queue.extend(path+'/'+name for name in directories[path].get('entries',[]) if path+'/'+name in directories)
    need(set(directories)==visited,'directory census reachable from fixed roots')
    if value['complete']:
        need(all(set(row)=={'before','entries','after'} for row in directories.values()),'complete directory snapshots')
        need((reached-set(FONT_ROOTS)-{'/etc/fonts/fonts.conf'})<=set(directories)|set(files)|set(aliases),'every enumerated entry has a typed census observation')
    for path,row in aliases.items():
        runtime_path(path);need(path in reached and type(row) is dict and set(row)<=set(('namedBefore','namedAfter','linkText','target')),'closed reached alias')
        for key in ('namedBefore','namedAfter'):
            if key in row:font_stat(row[key]);need(stat.S_ISLNK(row[key]['mode']),'observed symbolic link')
        if value['complete']:need(set(row)=={'namedBefore','namedAfter','linkText','target'},'complete alias observations')
        if 'target' in row:
            need(set(row)=={'namedBefore','namedAfter','linkText','target'} and encode(row['namedBefore'])==encode(row['namedAfter']),'alias identity readback')
            need(type(row['linkText']) is str and 0<len(row['linkText'])<=512 and re.fullmatch('[A-Za-z0-9_./@+ -]+',row['linkText']),'bounded raw alias text')
            runtime_path(row['target']);need(row['target'].startswith(FONT_PREFIXES) and declared_alias_resolution(path,{path:row})==row['target'],'canonical allowed alias target resolution')
            alias_targets.add(row['target'])
    for path,row in files.items():
        runtime_path(path);need(path in reached|alias_targets and path.startswith(FONT_PREFIXES),'file ancestry/alias target observed')
        font_file_row(row,complete=value['complete'])
        if value['complete'] and path.endswith('.conf'):need('original' in row,'complete raw config original')
        if 'original' in row:
            need(path.endswith('.conf'),'raw config role only');raw=font_original_blob(row['original'],65536)
            need(row.get('file')=={'byteLength':len(raw),'sha256':sha(raw),'eof':True},'raw config joins observed hash/extent/EOF')
            try:parsed=font_xml(raw)
            except Exception as error:parsed={'unsupported':[str(error)[:512]],'references':[],'nativeSelectionInterpreted':False}
            need(path in configs and encode(parsed)==encode(configs[path]),'independent XML reference census from raw original')
    need(sum(row.get('file',{}).get('byteLength',0) for row in files.values())<=256<<20,'aggregate discovery file extent cap')
    if value['complete']:need(alias_targets<=set(files),'every alias reaches an observed regular file')
    need(set(configs)=={p for p,row in files.items() if 'original' in row},'exact config original/reference roster')
    if value['configReferences'] is not None:need(encode(value['configReferences'])==encode(font_config_links(configs,files,aliases,directories)),'independent include/alias/cycle census')
    need(value['baselineMissing']==sorted(set(baseline)-(set(files)|set(aliases))),'old baseline missing paths retained, no roster subtraction')
    commands=value['commands'];need(type(commands) is list and len(commands)<=3,'at most three read-only package probes')
    parsed_packages=None;owners=None;prior_end=0
    for index,command in enumerate(commands):
        fields(command,'role argv tool stdout stderr process');font_file_row(command['tool'],complete=True,tool=True)
        need(encode(command['tool'])==encode(tools['/usr/bin/dpkg-query']),'per-probe selected tool identity/hash/mode readback')
        role=('font-packages','font-owners','font-manifests')[index];need(command['role']==role,'fixed package probe sequence')
        stdout=font_original_blob(command['stdout'],FONT_STREAM_CAP);stderr=font_original_blob(command['stderr'],FONT_STREAM_CAP)
        process=command['process'];fields(process,'argv environment identity descendantSamples remainingDescendants startedNs endedNs exitCode streams overflowObservedBytes firstFailure secondaryFailures sameProcessGroupCleanupContinuousOwnershipQualified')
        need(type(process['descendantSamples']) is list and len(process['descendantSamples'])<=64 and type(process['remainingDescendants']) is list and len(process['remainingDescendants'])<=256 and
             type(process['secondaryFailures']) is list and len(process['secondaryFailures'])<=128 and type(process['overflowObservedBytes']) is dict and set(process['overflowObservedBytes'])<=set(('stdout','stderr')),'bounded process census/errors/overflow')
        for count in process['overflowObservedBytes'].values():integer(count,1,2**63-1)
        need(process['firstFailure'] is None or type(process['firstFailure']) is str,'typed process primary refusal')
        for error in process['secondaryFailures']:
            fields(error,'phase name message');need(all(type(v) is str for v in error.values()),'typed process secondary refusal')
        fields(process['streams'],'stdout stderr')
        prefix=['/usr/bin/dpkg-query'];query=sorted(set(files)|set(aliases)|set(baseline))
        if index==0:argv=prefix+['-W','-f=${binary:Package}\t${Version}\t${db:Status-Status}\n']
        elif index==1:argv=prefix+['-S','--',*query]
        else:
            need(owners is not None,'ownership admitted before package manifests')
            argv=prefix+['-L','--',*sorted({owner for names in owners.values() for owner in names})]
        need(command['argv']==argv and process.get('argv')==argv,'fixed exact readonly dpkg descriptor')
        integer(process.get('startedNs'),1,2**63-1);integer(process.get('endedNs'),1,2**63-1)
        need(prior_end<=process['startedNs']<process['endedNs'] and process['endedNs']-process['startedNs']<=20*10**9,'serial bounded package process originals');prior_end=process['endedNs']
        need(encode(process.get('environment'))==encode({'LANG':'C.UTF-8','HOME':'/nonexistent','PATH':'/usr/bin:/bin','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_NO_LAZY_FETCH':'1','GIT_TERMINAL_PROMPT':'0'}),'fixed scrubbed probe environment')
        identity_=process.get('identity');fields(identity_,'pid state parentPid pgid sessionId startTicks')
        integer(identity_['parentPid'],1,2**63-1);need(type(identity_['state']) is str and re.fullmatch('[A-Za-z]',identity_['state']),'process identity state')
        for key in ('pid','pgid','sessionId','startTicks'):integer(identity_.get(key),1,2**63-1)
        need(identity_['pid']==identity_['pgid']==identity_['sessionId'],'fresh owned process session')
        for key,raw in (('stdout',stdout),('stderr',stderr)):
            need(encode(process.get('streams',{}).get(key))==encode({'byteLength':len(raw),'sha256':sha(raw)}),'process/raw package stream joins')
        integer(process.get('exitCode'),-255,255)
        successful=process['exitCode']==0 and process.get('firstFailure') is None and process.get('secondaryFailures')==[] and process.get('remainingDescendants')==[] and process.get('overflowObservedBytes')=={} and not stderr
        need(process.get('sameProcessGroupCleanupContinuousOwnershipQualified') is False,'finite process observation boundary')
        if not successful:
            need(index==len(commands)-1 and value['firstFailure'] is not None and value['complete'] is False,'failed package probe terminal; no later tools')
            break
        if index==0:parsed_packages=font_packages(stdout)
        elif index==1:owners=font_owners(stdout,query,parsed_packages)
        else:
            listed=font_manifest(stdout);need(all(path in listed for path in owners),'observed ownership/manifest union join')
    if commands:need(encode(value['packages'])==encode(parsed_packages),'package table independently parsed from retained raw stream')
    else:need(value['packages'] is None,'no fabricated package observations')
    if value['complete']:
        need(len(commands)==3 and all(root in directories for root in FONT_ROOTS) and '/etc/fonts/fonts.conf' in files and value['configReferences'] is not None,'complete bounded discovery reaches all probes and fixed roots')
    return {'schema':'bw.gui-hdd.font-discovery-reader.v1','observationOnly':True,'candidate':False,'qualified':False,'activeFontSelectionProved':False,
      'complete':value['complete'],'sourceHead':expected['source']['head'],'runId':expected['runId'],'files':len(files),'aliases':len(aliases),
      'baselineMissing':value['baselineMissing'],'firstFailure':value['firstFailure'],'actualRequestSupported':False}


FONT_DELIVERY_CAP = 32 << 20
FONT_WORKFLOW_PATH = '.github/workflows/i80386-hdd-gui-actual.yml'
FONT_PROCESS_ROOT = 'font-discovery-original-process-originals/'


def font_delivery_expected(expected):
    fields(expected,'schema source request archive runId jobId artifactId prNumber workflow metadata')
    need(expected['schema']=='bw.gui-hdd.font-discovery-delivery-expectation.v1','explicit observation delivery policy')
    for key in ('runId','jobId','artifactId','prNumber'):integer(expected[key],1,2**63-1)
    source=expected['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files']);need(set(source['files'])==SOURCE,'externally selected delivery source21')
    for key,cap in (('request',JSON_CAP),('archive',FONT_DELIVERY_CAP)):
        fields(expected[key],'byteLength sha256');integer(expected[key]['byteLength'],1,cap);digest(expected[key]['sha256'])
    metadata=expected['metadata'];fields(metadata,'run job artifact workflowProof')
    for row in metadata.values():fields(row,'byteLength sha256');integer(row['byteLength'],1,JSON_CAP);digest(row['sha256'])
    workflow=expected['workflow'];fields(workflow,'commit base tree blob byteLength sha256')
    for key in ('commit','base','tree','blob'):digest(workflow[key],40)
    integer(workflow['byteLength'],1,65536);digest(workflow['sha256'])
    need(workflow['commit']!=source['head'] and workflow['base']!=source['head'],'separate executing merge workflow and selected source/base')
    need(encode(source['files'][FONT_WORKFLOW_PATH])==encode({k:workflow[k] for k in ('byteLength','sha256')}),'executing workflow content joins reviewed source21 workflow')


def font_delivery_pin(raw,row):
    need(type(raw) is bytes and len(raw)==row['byteLength'] and sha(raw)==row['sha256'],'separately frozen delivery original extent/hash')


def font_workflow_api_original(value,schema):
    if schema=='bw.gui-hdd.workflow-api-proof.v1':return font_original_blob(value,JSON_CAP)
    need(schema=='bw.gui-hdd.workflow-api-proof.v2','versioned workflow API original')
    fields(value,'codec original compressed');need(value['codec']=='zlib','fixed workflow API compression codec')
    original=value['original'];fields(original,'byteLength sha256');integer(original['byteLength'],1,JSON_CAP);digest(original['sha256'])
    compressed=font_original_blob(value['compressed'],JSON_CAP)
    # Limit output during inflation, before any original JSON interpretation.
    # No flush call may allocate output beyond the declared original extent.
    import zlib
    inflater=zlib.decompressobj()
    try:raw=inflater.decompress(compressed,original['byteLength']+1)
    except zlib.error as error:raise ValueError('invalid bounded workflow API zlib stream') from error
    need(len(raw)==original['byteLength'] and inflater.eof and not inflater.unused_data and not inflater.unconsumed_tail,'exact complete single workflow API compression stream')
    need(sha(raw)==original['sha256'],'uncompressed workflow API original hash')
    return raw


def font_delivery_workflow(proof_raw,workflow_raw,expected):
    # API originals are a separately reviewed metadata boundary. Only the blob's
    # Git object hash is reconstructed; complete commit/tree IDs are not rebuilt.
    selected=expected['workflow'];font_delivery_pin(proof_raw,expected['metadata']['workflowProof'])
    need(type(workflow_raw) is bytes and len(workflow_raw)==selected['byteLength'] and sha(workflow_raw)==selected['sha256'] and
         hashlib.sha1(b'blob '+str(len(workflow_raw)).encode()+b'\0'+workflow_raw).hexdigest()==selected['blob'],'independently selected executing workflow Git blob')
    proof=decode(proof_raw);fields(proof,'schema commit tree');need(proof['schema'] in ('bw.gui-hdd.workflow-api-proof.v1','bw.gui-hdd.workflow-api-proof.v2') and encode(proof)==proof_raw,'canonical pinned workflow API proof wrapper')
    commit=decode(font_workflow_api_original(proof['commit'],proof['schema']));tree=decode(font_workflow_api_original(proof['tree'],proof['schema']))
    need(commit.get('sha')==selected['commit'] and commit.get('tree',{}).get('sha')==selected['tree'] and tree.get('sha')==selected['tree'] and tree.get('truncated') is False,'selected commit/tree API observation joins')
    parents=commit.get('parents');need(type(parents) is list and len(parents)==2,'executing pull-request merge has two observed parents')
    for parent in parents:digest(parent.get('sha'),40)
    need([p['sha'] for p in parents]==[selected['base'],expected['source']['head']],'executing merge includes independently selected source and base')
    entries=tree.get('tree');need(type(entries) is list and len(entries)<=65536,'bounded recursive workflow tree observation')
    names=set();matches=[]
    for entry in entries:
        path=entry.get('path');need(type(path) is str and 0<len(path)<=1024 and '\x00' not in path and not path.startswith('/') and str(PurePosixPath(path))==path and '..' not in PurePosixPath(path).parts and path not in names,'unique canonical Git tree paths')
        names.add(path)
        if path==FONT_WORKFLOW_PATH:matches.append(entry)
    need(len(matches)==1,'one executing workflow tree entry');item=matches[0];integer(item.get('size'),1,65536)
    need(item.get('mode')=='100644' and item.get('type')=='blob' and item.get('sha')==selected['blob'] and item['size']==selected['byteLength'],'fixed workflow path/mode/blob/extent')


def font_delivery_archive(raw):
    need(type(raw) is bytes and 0<len(raw)<=FONT_DELIVERY_CAP,'bounded font delivery ZIP')
    top={'guard.stdout','guard.stderr','npm.stdout','npm.stderr','chromium-install.stdout','chromium-install.stderr',
         'input-install.stdout','input-install.stderr','request.json','controller.stdout','controller.stderr','font-discovery-original.json'}
    headers=[];names=set();total=0;prefix=None
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        items=archive.infolist();need(len(items)<=96,'bounded delivery ZIP entry census')
        for item in items:
            name=item.filename;need(item.orig_filename==name and '\x00' not in name,'exact untruncated ZIP member name');relative(name.rstrip('/') if item.is_dir() else name)
            need(name not in names and not item.flag_bits&1 and item.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED),'unique unencrypted stored/deflated ZIP entries');names.add(name)
            mode=stat.S_IFMT(item.external_attr>>16)
            need(mode in ((0,stat.S_IFDIR) if item.is_dir() else (0,stat.S_IFREG)),'regular font delivery members; no links or special files')
            if item.is_dir():
                need(item.file_size==0,'known directory roles carry no ignored payload')
                need(name in ('gui-font-discovery/',FONT_PROCESS_ROOT,'gui-font-discovery/'+FONT_PROCESS_ROOT),'fixed delivery directory roles');continue
            current='gui-font-discovery/' if name.startswith('gui-font-discovery/') else ''
            if prefix is None:prefix=current
            need(current==prefix,'one uniform upload root');inner=name.removeprefix(current)
            if inner in top:
                cap=JSON_CAP if inner in ('request.json','font-discovery-original.json','npm.stdout','npm.stderr','chromium-install.stdout','chromium-install.stderr') else 16384
            else:
                need(inner.startswith(FONT_PROCESS_ROOT),'fixed delivery raw-process root');leaf=inner[len(FONT_PROCESS_ROOT):]
                match=re.fullmatch(r'(git-([0-9]+)|font-packages|font-owners|font-manifests)\.(stdout|stderr|process\.json)',leaf)
                need(match is not None and (match[2] is None or 0<=int(match[2])<2+len(SOURCE) and str(int(match[2]))==match[2]),'fixed finite process roles before inflate')
                cap=JSON_CAP if match[3]=='process.json' else STREAM_CAP if match[1].startswith('git-') else FONT_STREAM_CAP
            need(type(item.file_size) is int and 0<=item.file_size<=cap,'delivery role extent before inflate');total+=item.file_size
            need(total<=FONT_DELIVERY_CAP and len(headers)<96,'inflated delivery aggregate/file cap before inflate');headers.append((inner,item))
        need(top<={name for name,item in headers},'complete request/observation delivery required; early failures retained externally')
        # No member is inflated until the ENTIRE role/extent census has passed.
        return {name:archive.read(item) for name,item in headers}


def font_delivery_identity(value,descendant=False):
    base=set('pid state parentPid pgid sessionId startTicks'.split())
    need(type(value) is dict and (set(value)==base or descendant and base<=set(value)<=base|{'executable','executableIdentity'}),'closed raw process identity')
    for key in base-{'state'}:integer(value[key],1,2**63-1)
    need(type(value['state']) is str and re.fullmatch('[A-Za-z]',value['state']),'raw process state')
    if 'executable' in value:need(value['executable'] is None or type(value['executable']) is str and 0<len(value['executable'])<=4096 and '\x00' not in value['executable'],'bounded observed executable path')
    if 'executableIdentity' in value:
        fields(value['executableIdentity'],'dev ino');need(type(value.get('executable')) is str,'executable identity has observed path')
        for item in value['executableIdentity'].values():integer(item,0,2**64-1)


def font_delivery_process(raw,stdout,stderr,argv):
    process=decode(raw);fields(process,'argv environment identity descendantSamples remainingDescendants startedNs endedNs exitCode streams overflowObservedBytes firstFailure secondaryFailures sameProcessGroupCleanupContinuousOwnershipQualified')
    need(encode(process['argv'])==encode(argv) and encode(process['environment'])==encode({'LANG':'C.UTF-8','HOME':'/nonexistent','PATH':'/usr/bin:/bin','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_NO_LAZY_FETCH':'1','GIT_TERMINAL_PROMPT':'0'}),'exact raw process descriptor/environment')
    integer(process['startedNs'],1,2**63-1);integer(process['endedNs'],1,2**63-1);integer(process['exitCode'],-255,255)
    need(0<process['endedNs']-process['startedNs']<=20*10**9 and process['sameProcessGroupCleanupContinuousOwnershipQualified'] is False,'finite raw child interval; no continuous ownership claim')
    font_delivery_identity(process['identity']);identity_=process['identity'];need(identity_['pid']==identity_['pgid']==identity_['sessionId'] and identity_['parentPid']!=identity_['pid'],'raw fresh child session and distinct parent')
    fields(process['streams'],'stdout stderr')
    for key,value in (('stdout',stdout),('stderr',stderr)):
        need(encode(process['streams'][key])==encode({'byteLength':len(value),'sha256':sha(value)}),'retained raw stream/process identity')
    need(type(process['descendantSamples']) is list and len(process['descendantSamples'])<=64 and type(process['remainingDescendants']) is list and len(process['remainingDescendants'])<=256,'bounded raw descendant observations')
    sample_times=[]
    for sample in process['descendantSamples']:
        fields(sample,'atNs descendants');integer(sample['atNs'],process['startedNs'],process['endedNs'])
        need(type(sample['descendants']) is list and len(sample['descendants'])<=256,'bounded raw descendant sample')
        sample_times.append(sample['atNs'])
        for row in sample['descendants']:font_delivery_identity(row,True)
        need(len({row['pid'] for row in sample['descendants']})==len(sample['descendants']),'unique PIDs in each raw descendant sample')
    need(sample_times==sorted(sample_times),'monotonic raw descendant sample append order')
    for row in process['remainingDescendants']:font_delivery_identity(row)
    need(len({row['pid'] for row in process['remainingDescendants']})==len(process['remainingDescendants']),'unique raw terminal-census PIDs')
    need(process['firstFailure'] is None or type(process['firstFailure']) is str and len(process['firstFailure'].encode())<=16384,'bounded raw primary refusal')
    need(type(process['secondaryFailures']) is list and len(process['secondaryFailures'])<=128,'bounded raw secondary refusals')
    for row in process['secondaryFailures']:
        fields(row,'phase name message');need(all(type(value) is str and len(value.encode())<=16384 for value in row.values()),'typed raw secondary refusal')
    need(type(process['overflowObservedBytes']) is dict and set(process['overflowObservedBytes'])<=set(('stdout','stderr')),'closed raw overflow observations')
    for count in process['overflowObservedBytes'].values():integer(count,1,2**63-1)
    if process['exitCode']!=0 or process['overflowObservedBytes'] or process['remainingDescendants'] or process['secondaryFailures']:
        need(type(process['firstFailure']) is str,'known raw process refusal preserves its primary')
    return process


def font_delivery_raw(value,files,request):
    selected={};prior_end=0;parent=None;identities=set()
    for index,command in enumerate(value['sourceCommands']):selected['git-'+str(index)]=('git',command)
    for command in value['commands']:selected[command['role']]=('package',command)
    names={FONT_PROCESS_ROOT+role+'.'+suffix for role in selected for suffix in ('stdout','stderr','process.json')}
    need({name for name in files if name.startswith(FONT_PROCESS_ROOT)}==names,'exact asserted raw triples; missing/extra failed prefixes refuse')
    for role,(kind,command) in selected.items():
        prefix=FONT_PROCESS_ROOT+role;stdout=files[prefix+'.stdout'];stderr=files[prefix+'.stderr']
        process=font_delivery_process(files[prefix+'.process.json'],stdout,stderr,command['argv'])
        need(process['startedNs']>=prior_end,'source-to-package serial monotonic chronology');prior_end=process['endedNs']
        current=process['identity'];need(parent is None or parent==current['parentPid'],'same observed controller parent across raw commands');parent=current['parentPid']
        key=(current['pid'],current['startTicks']);need(key not in identities,'distinct observed child identities');identities.add(key)
        if kind=='git':
            need(process['exitCode']==0 and process['firstFailure'] is None and process['secondaryFailures']==[] and process['remainingDescendants']==[] and
                 process['overflowObservedBytes']=={} and not stderr,'successful asserted source raw process')
            need(encode(command['stdout'])==encode(process['streams']['stdout']) and encode(command['stderr'])==encode(process['streams']['stderr']) and
                 type(command['exitCode']) is int and command['exitCode']==process['exitCode'],'source summary joins raw original')
        else:
            need(encode(process)==encode(command['process']) and stdout==font_original_blob(command['stdout'],FONT_STREAM_CAP) and stderr==font_original_blob(command['stderr'],FONT_STREAM_CAP),'embedded package observations join raw originals')
            if process['firstFailure'] is not None:
                need(value['firstFailure']['phase']==role and value['firstFailure']['path'] is None and value['firstFailure']['message']==process['firstFailure'][:512],'failed raw package primary retained unchanged')


def font_delivery_time(value):
    import datetime
    need(type(value) is str and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z',value),'official UTC timestamp')
    return datetime.datetime.strptime(value,'%Y-%m-%dT%H:%M:%SZ')


def font_delivery_official(metadata,expected):
    for key,raw in metadata.items():font_delivery_pin(raw,expected['metadata'][key])
    run=decode(metadata['run']);job=decode(metadata['job']);artifact=decode(metadata['artifact'])
    if set(artifact)=={'total_count','artifacts'}:
        integer(artifact['total_count'],1,1);need(type(artifact['artifacts']) is list and len(artifact['artifacts'])==1,'one selected official artifact wrapper');artifact=artifact['artifacts'][0]
    for value,key,selected in ((run,'id','runId'),(job,'id','jobId'),(artifact,'id','artifactId')):
        integer(value.get(key),1,2**63-1);need(value[key]==expected[selected],'exact official delivery IDs')
    for value in (run,job):integer(value.get('run_attempt'),1,1)
    integer(job.get('run_id'),1,2**63-1);integer(artifact.get('workflow_run',{}).get('id'),1,2**63-1);integer(artifact.get('size_in_bytes'),1,FONT_DELIVERY_CAP)
    need(run.get('event')=='pull_request' and run.get('head_sha')==expected['source']['head'] and run.get('repository',{}).get('full_name')==REPOSITORY and
         run.get('head_repository',{}).get('full_name')==REPOSITORY and run.get('head_repository',{}).get('fork') is False and
         run.get('actor',{}).get('login')=='CrispStrobe' and run.get('triggering_actor',{}).get('login')=='CrispStrobe' and run.get('path')==FONT_WORKFLOW_PATH,'owned official source/event/actor/workflow run')
    need(run.get('status') in ('queued','in_progress','completed','waiting','pending','requested') and (run.get('conclusion') is None or type(run['conclusion']) is str),'observed whole-run state, not unrelated job success')
    prs=run.get('pull_requests');need(type(prs) is list and 1<=len(prs)<=32,'bounded run PR association')
    for pr in prs:integer(pr.get('number'),1,2**63-1)
    need(sum(pr['number']==expected['prNumber'] for pr in prs)==1,'official PR number association; moving nested head is not authority')
    integer(job.get('runner_id'),1,2**63-1);need(type(job.get('runner_name')) is str and 0<len(job['runner_name'])<=256 and encode(job.get('labels'))==encode(['ubuntu-24.04']),'assigned selected hosted runner observations')
    need(job['run_id']==expected['runId'] and job.get('head_sha')==expected['source']['head'] and job.get('name')=='font-discovery' and job.get('status')=='completed' and job.get('conclusion') in ('success','failure'),'selected producing job terminal')
    need(artifact.get('name')=='i80386-hdd-gui-font-discovery-'+str(expected['runId'])+'-1' and artifact.get('expired') is False and
         artifact['size_in_bytes']==expected['archive']['byteLength'] and artifact.get('digest')=='sha256:'+expected['archive']['sha256'] and
         artifact['workflow_run']['id']==expected['runId'] and artifact['workflow_run'].get('head_sha')==expected['source']['head'],'official artifact/run/source/name/extent/digest joins; no job-ID field inferred')
    began=font_delivery_time(job.get('started_at'));ended=font_delivery_time(job.get('completed_at'));need(began<=ended,'official terminal job chronology')
    steps=job.get('steps');need(type(steps) is list and len(steps)<=64,'bounded official producing steps');numbers=[]
    for step in steps:integer(step.get('number'),1,128);numbers.append(step['number'])
    need(numbers==sorted(set(numbers)),'strict unique ordered official step numbers')
    required=['Run actions/checkout@11d5960a326750d5838078e36cf38b85af677262','Refuse unreviewed discovery before setup or input retrieval',
      'Run actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020','Install unchanged selected packages and Chromium for font observation',
      'Install externally selected immutable discovery request','Record bounded read-only font discovery without credentials',
      'Run actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02']
    previous=began;positions=[]
    for name in required:
        matches=[(index,step) for index,step in enumerate(steps) if step.get('name')==name];need(len(matches)==1,'one official producing step for each reviewed role')
        index,step=matches[0];need(step.get('status')=='completed' and step.get('conclusion')==(job['conclusion'] if name.startswith('Record bounded') else 'success'),'terminal official guard/setup/input/collector/upload step')
        start=font_delivery_time(step.get('started_at'));end=font_delivery_time(step.get('completed_at'));need(previous<=start<=end<=ended,'official producing step chronology');previous=end;positions.append(index)
    need(positions==sorted(set(positions)),'official guard precedes setup, input, collection and upload')
    return job['conclusion']


def verify_font_delivery(archive_raw,request_raw,expected,metadata,workflow_raw):
    font_delivery_expected(expected);fields(metadata,'run job artifact workflowProof')
    font_delivery_pin(archive_raw,expected['archive']);font_delivery_pin(request_raw,expected['request'])
    conclusion=font_delivery_official(metadata,expected);font_delivery_workflow(metadata['workflowProof'],workflow_raw,expected)
    request,baseline=font_request(request_raw,expected['request']['sha256']);need(encode(request['source'])==encode(expected['source']),'outer selected source21/request join')
    files=font_delivery_archive(archive_raw);need(files['request.json']==request_raw,'exact installed request original')
    original=files['font-discovery-original.json'];value=decode(original)
    inner={'schema':'bw.gui-hdd.font-discovery-expectation.v1','source':expected['source'],'request':expected['request'],
      'original':{'byteLength':len(original),'sha256':sha(original)},'runId':expected['runId'],'workflowSha':expected['workflow']['commit']}
    verdict=verify_font_discovery(original,request_raw,inner)
    event=decode(font_original_blob(value['event'],256<<10));need(event['number']==expected['prNumber'],'raw retained event joins official selected PR')
    font_delivery_raw(value,files,request)
    need(all(files[name]==b'' for name in ('guard.stdout','guard.stderr','input-install.stderr','controller.stdout','controller.stderr')),'complete normal control streams; retention/early failures stay unqualified')
    installed={'byteLength':len(request_raw),'sha256':sha(request_raw),'gitBlob':hashlib.sha1(b'blob '+str(len(request_raw)).encode()+b'\0'+request_raw).hexdigest()}
    need(files['input-install.stdout']==encode(installed),'immutable input installer witness joins exact request bytes')
    if conclusion=='success':need(value['complete'] is True and value['firstFailure'] is None,'successful producing job requires complete observation')
    else:need(value['complete'] is False and value['firstFailure'] is not None,'failed producing job retains its observed primary, never promoted')
    return {'schema':'bw.gui-hdd.font-discovery-delivery-reader.v1','observationOnly':True,'candidate':False,'qualified':False,'activeFontSelectionProved':False,
      'actualRequestSupported':False,'actual':False,'producingConclusion':conclusion,'complete':value['complete'],'sourceHead':expected['source']['head'],
      'workflowCommit':expected['workflow']['commit'],'runId':expected['runId'],'jobId':expected['jobId'],'artifactId':expected['artifactId'],
      'firstFailure':value['firstFailure'],'observation':verdict}


def main(argv=None):
    raw_args=list(sys.argv[1:] if argv is None else argv)
    if raw_args[:1]==['--font-discovery-delivery']:
        parser=argparse.ArgumentParser(description='Independent font-delivery original admission',allow_abbrev=False)
        names=('font-discovery-delivery','request','expected','run','job','artifact','workflow-proof','workflow')
        for name in names:parser.add_argument('--'+name,required=True)
        need(len(raw_args)==16 and all(raw_args.count('--'+name)==1 for name in names),'exact delivery audit inputs')
        args=parser.parse_args(raw_args);expected=decode(bounded_input(args.expected,JSON_CAP));font_delivery_expected(expected)
        archive=bounded_input(args.font_discovery_delivery,expected['archive']['byteLength']);request=bounded_input(args.request,expected['request']['byteLength'])
        metadata={key:bounded_input(getattr(args,'workflow_proof' if key=='workflowProof' else key),expected['metadata'][key]['byteLength']) for key in ('run','job','artifact','workflowProof')}
        workflow=bounded_input(args.workflow,expected['workflow']['byteLength'])
        print(encode(verify_font_delivery(archive,request,expected,metadata,workflow)).decode(),end='');return 0
    if raw_args[:1]==['--font-discovery']:
        parser=argparse.ArgumentParser(description='Independent bounded font discovery audit',allow_abbrev=False)
        for name in ('font-discovery','request','expected'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==6 and all(raw_args.count('--'+name)==1 for name in ('font-discovery','request','expected')),'exact discovery audit inputs')
        args=parser.parse_args(raw_args);expected=decode(bounded_input(args.expected,JSON_CAP));font_expected(expected)
        original=bounded_input(args.font_discovery,expected['original']['byteLength']);request=bounded_input(args.request,expected['request']['byteLength'])
        print(encode(verify_font_discovery(original,request,expected)).decode(),end='');return 0
    if raw_args[:1]==['--inventory-original']:
        parser=argparse.ArgumentParser(description='Independent typed metadata original audit',allow_abbrev=False)
        for name in ('inventory-original','template','expected'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==6 and all(raw_args.count('--'+name)==1 for name in ('inventory-original','template','expected')),'exact metadata audit inputs')
        args=parser.parse_args(raw_args);expected=decode(bounded_input(args.expected,JSON_CAP));inventory_admission_expected(expected)
        original=bounded_input(args.inventory_original,expected['original']['byteLength']);template=bounded_input(args.template,expected['template']['byteLength'])
        print(encode(verify_inventory_original(original,template,expected)).decode(),end='');return 0
    if raw_args[:1]==['--inventory-failure']:
        parser=argparse.ArgumentParser(description='Independent failure-only inventory audit',allow_abbrev=False)
        for name in ('inventory-failure','template','expected'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==6 and all(raw_args.count('--'+name)==1 for name in ('inventory-failure','template','expected')),'exact failure audit inputs')
        args=parser.parse_args(raw_args);expected=decode(bounded_input(args.expected,JSON_CAP));inventory_failure_expected(expected)
        failure=bounded_input(args.inventory_failure,expected['failure']['byteLength']);template=bounded_input(args.template,expected['template']['byteLength'])
        print(encode(verify_inventory_failure(failure,template,expected)).decode(),end='');return 0
    parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False);parser.add_argument('artifact');parser.add_argument('expected')
    args=parser.parse_args(argv);expected=decode(bounded_input(args.expected,JSON_CAP));expected_policy(expected)
    raw=bounded_input(args.artifact,expected['artifactBytes'])
    need(len(raw)==expected['artifactBytes'] and sha(raw)==expected['artifactSha256'],'external actual artifact digest')
    print(encode(audit(archive_originals(raw),expected)).decode(),end='');return 0


if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        print(json.dumps({'pass':False,'firstFailure':{'name':type(error).__name__,'message':str(error)}}),file=sys.stderr);sys.exit(1)
