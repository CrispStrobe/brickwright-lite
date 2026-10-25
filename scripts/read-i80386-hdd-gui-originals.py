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
ACTUAL_V7_READER_ENABLED = True
ACTUAL_V8_READER_ENABLED = False
REPOSITORY = 'CrispStrobe/brickwright-lite'
LABEL = 'x86-hdd-gui-actual'
BOARD = '761153ff92d521c01107ee7b32922ba7adc10ee2'
CUI = '91d8434a79d373cef2837c137ab356356f1a3b44'
SB3 = '1cbaeed325f5a890e43b78a4211acae8f801f2d2'
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


INSTALLED_V5_ROOTS = ('node_modules/bw-board','node_modules/bw-circuit-ui',
                      'node_modules/playwright','node_modules/playwright-core')
EMPTY_SHA256 = hashlib.sha256(b'').hexdigest()
INSTALLED_V5_CRITICAL = frozenset((
 'node_modules/bw-board/package.json','node_modules/bw-board/src/index.js',
 'node_modules/bw-circuit-ui/package.json','node_modules/bw-circuit-ui/src/current.js',
 'node_modules/playwright/package.json','node_modules/playwright-core/package.json'))
INSTALLED_V6_CRITICAL = frozenset((INSTALLED_V5_CRITICAL -
 {'node_modules/bw-circuit-ui/src/current.js'}) |
 {'node_modules/bw-circuit-ui/src/index.js'})


def installed_rows_v5(value, critical=INSTALLED_V5_CRITICAL):
    need(type(value) is dict and 0<len(value)<=16384 and
         critical<=set(value),'complete finite v5 installed rows')
    sizes={prefix:0 for prefix in INSTALLED_V5_ROOTS}
    for name,row in value.items():
        relative(name);fields(row,'byteLength sha256')
        matching=[root for root in INSTALLED_V5_ROOTS if name.startswith(root+'/')]
        need(len(matching)==1 and name!=matching[0],
             'installed-only finite v5 regular row')
        integer(row['byteLength'],0,FILE_CAP);digest(row['sha256'])
        need(row['byteLength']>0 or row['sha256']==EMPTY_SHA256,
             'zero installed original has exact empty digest')
        if name in critical:
            integer(row['byteLength'],1,FILE_CAP)
        sizes[matching[0]]+=row['byteLength']
    need(all(sizes.values()) and all(size<=BUILD_CAP for size in sizes.values()),
         'bounded four-package installed census')
    return value


def installed_progress_v5(value):
    fields(value,'package path entryStat file completedPrefixes completedRows totalBytes')
    completed=value['completedPrefixes']
    need(type(completed) is list and completed==list(INSTALLED_V5_ROOTS[:len(completed)]),
         'ordered completed installed package prefix')
    integer(value['completedRows'],0,16384)
    integer(value['totalBytes'],0,4*BUILD_CAP)
    package=value['package'];path=value['path'];file=value['file']
    need(package is None or package in INSTALLED_V5_ROOTS,'attempted fixed package')
    need(path is None or (type(path) is str and package is not None and path.startswith(package+'/') and
         relative(path)==path),'attempted canonical installed path')
    need(file is None or (path is not None and type(file) is dict),'attempted file facts')
    if value['entryStat'] is not None:
        fields(value['entryStat'],'dev ino mode uid gid nlink size mtime_ns')
        for name,number in value['entryStat'].items():
            integer(number,-2**63 if name=='mtime_ns' else 0,
                    2**63-1 if name=='mtime_ns' else 2**64-1)
    if file is None:return
    fields(file,'stage namedBefore heldBefore heldAfter namedAfter bytesRead sha256 eof complete closeAttempted closeSucceeded')
    need(file['stage'] in ('not-started','lstat','open','held-before','read','readback','close','complete'),
         'bounded installed read phase')
    for key in ('namedBefore','heldBefore','heldAfter','namedAfter'):
        row=file[key]
        if row is None:continue
        fields(row,'dev ino mode uid gid nlink size mtime_ns')
        for name,number in row.items():
            integer(number,-2**63 if name=='mtime_ns' else 0,
                    2**63-1 if name=='mtime_ns' else 2**64-1)
    # A failed read may retain the single byte used to detect growth past cap.
    integer(file['bytesRead'],0,FILE_CAP+1);digest(file['sha256'])
    for name in ('eof','complete','closeAttempted','closeSucceeded'):
        need(type(file[name]) is bool,'strict installed partial boolean')
    need(file['closeSucceeded'] is False or file['closeAttempted'] is True,
         'close success requires attempt')
    if file['complete']:
        need(file['bytesRead']<=FILE_CAP,'accepted installed file cap')
        need(file['stage']=='complete' and all(file[name] is not None for name in
             ('namedBefore','heldBefore','heldAfter','namedAfter')) and
             file['eof'] is True and file['closeAttempted'] is True and
             file['closeSucceeded'] is True and
             file['bytesRead']==file['namedBefore']['size'] and
             all(file[name]==file['namedBefore'] for name in ('heldBefore','heldAfter','namedAfter')),
             'complete installed file exact held/named readback')
        need(value['entryStat']==file['namedBefore'],
             'complete installed entry/file identity')
    if file['bytesRead']==0:need(file['sha256']==EMPTY_SHA256,'empty prefix digest')


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
STARTUP_STEPS_V7 = ('Install empty Python cache prefix and refuse unreviewed v7 source',
 'Install externally admitted v7 request and refuse runtime/source drift',
 'One official frontend acquisition and two serial genuine v7 UI scenarios')
STARTUP_STEPS_V8 = ('Install empty Python cache prefix and refuse unreviewed v8 source',
 'Install externally admitted v8 request and refuse runtime/source drift',
 'One official frontend acquisition and two serial genuine v8 UI scenarios')


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


FINITE_INVENTORY_TEMPLATE_CAP = 32 << 10
FINITE_INVENTORY_BEGIN = '<!-- BW_GUI_HDD_FINITE_INVENTORY_V4_BEGIN -->'
FINITE_INVENTORY_END = '<!-- BW_GUI_HDD_FINITE_INVENTORY_V4_END -->'


def finite_inventory_scope():
    return {'basis':'selected-core-runtime-for-owned-v5-fontconfig','globalFontDiscovery':False,
      'historicalGlobalRosterQualified':False,'nativeLibraryClosureProved':False,
      'fontSelectionProved':False,'browserFontSelectionProved':False,'guestApproved':False}


def finite_inventory_path(path):
    runtime_path(path)
    roots=('/etc/fonts','/usr/share/fontconfig','/usr/share/fonts','/usr/local/share/fonts','/var/cache/fontconfig')
    need(not any(path==prefix or path.startswith(prefix+'/') for prefix in roots) and
         '/gui-inputs/native-font' not in path and not path.lower().endswith(('.ttf','.otf','.ttc')),
         'finite v4 core scope excludes global and later staged font/config/cache inputs')


def finite_inventory_template(raw,expected):
    digest(expected);need(type(raw) is bytes and 0<len(raw)<=FINITE_INVENTORY_TEMPLATE_CAP and sha(raw)==expected,'selected finite v4 template bytes')
    template=decode(raw);fields(template,'schema sourceHead files aliases directoryAliases node python chromium tools emptyPythonSources libraries scope')
    need(encode(template)==raw and template['schema']=='bw.gui-hdd.inventory-template.v4' and
         encode(template['scope'])==encode(finite_inventory_scope()),'explicit canonical finite v4 scope; no historical success promotion')
    digest(template['sourceHead'],40)
    for role,cap in (('files',512),('aliases',256),('directoryAliases',256)):
        roster=template[role];need(type(roster) is list and len(roster)<=cap and roster==sorted(set(roster)),'finite sorted unique selected '+role)
        for path in roster:finite_inventory_path(path)
    need(1<=len(template['files']) and len(template['aliases'])+len(template['directoryAliases'])<=256 and
         len(set(template['files']+template['aliases']+template['directoryAliases']))==sum(len(template[key]) for key in ('files','aliases','directoryAliases')),'disjoint finite core runtime roles')
    fields(template['tools'],'git gh');need(template['tools']=={'git':'/usr/bin/git','gh':'/usr/bin/gh'},'selected finite bootstrap tools')
    need(template['python']==PYTHON_EXECUTABLE and all(path in template['files'] for path in
         (template['node'],template['python'],template['chromium'],'/usr/bin/git','/usr/bin/gh','/usr/bin/curl')),'selected Node/Python/Chromium/Git/gh/curl core files')
    libraries=template['libraries'];need(type(libraries) is list and 1<=len(libraries)<=128 and libraries==sorted(set(libraries)) and
         set(libraries)<=set(template['files']),'explicit finite selected library role; no complete loader closure claim')
    empty_python_policy(template['emptyPythonSources'],template['files'],template['aliases'],template['directoryAliases'])
    return template


def finite_inventory_body_template(body,expected):
    need(type(body) is str and body.count(FINITE_INVENTORY_BEGIN)==body.count(FINITE_INVENTORY_END)==1,'one immutable finite v4 body wrapper')
    begin=body.index(FINITE_INVENTORY_BEGIN)+len(FINITE_INVENTORY_BEGIN);end=body.index(FINITE_INVENTORY_END)
    need(begin<end,'ordered finite v4 body wrapper')
    raw=body[begin:end].encode();need(raw.startswith(b'\n'),'canonical finite v4 wrapper separator')
    wrapper=decode(raw[1:]);fields(wrapper,'schema sha256 templateBase64')
    need(encode(wrapper)==raw[1:] and wrapper['schema']=='bw.gui-hdd.finite-inventory-transport.v1' and wrapper['sha256']==expected,'canonical externally pinned finite v4 transport')
    encoded=wrapper['templateBase64'];need(type(encoded) is str and encoded.isascii() and 0<len(encoded)<=4*((FINITE_INVENTORY_TEMPLATE_CAP+2)//3),'bounded finite v4 template encoding')
    template=base64.b64decode(encoded,validate=True)
    need(base64.b64encode(template).decode()==encoded,'canonical finite v4 template encoding')
    finite_inventory_template(template,expected);return template


def bind_finite_inventory_event(raw,head,expected,env):
    need(type(raw) is bytes and 0<len(raw)<=256<<10,'finite v4 exact event original cap')
    digest(head,40);digest(expected);event=decode(raw);pr=event.get('pull_request',{})
    need(event.get('action')=='labeled' and event.get('label',{}).get('name')=='x86-hdd-gui-finite-inventory-v4' and
         event.get('sender',{}).get('login')=='CrispStrobe' and event.get('repository',{}).get('full_name')==REPOSITORY,'owned distinct finite v4 inventory event')
    integer(event.get('number'),1,2**31-1)
    need(type(pr.get('number')) is int and event['number']==pr['number'] and pr.get('state')=='open' and
         pr.get('head',{}).get('sha')==head and pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY,'exact own finite v4 source event')
    template=finite_inventory_body_template(pr.get('body'),expected)
    need(decode(template)['sourceHead']==head,'finite v4 body source head join')
    need(env.get('GITHUB_REPOSITORY')==REPOSITORY and env.get('GITHUB_EVENT_NAME')=='pull_request' and
         env.get('GITHUB_ACTOR')=='CrispStrobe' and env.get('GITHUB_RUN_ATTEMPT')=='1' and
         env.get('GITHUB_JOB')=='finite-inventory-v4' and re.fullmatch('[1-9][0-9]{0,19}',env.get('GITHUB_RUN_ID','')) and
         env.get('BW_EXPECTED_HEAD')==head,'first official finite v4 platform observations')
    digest(env.get('GITHUB_WORKFLOW_SHA'),40)
    need(env.get('GITHUB_WORKFLOW_REF')==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(pr['number'])+'/merge','finite v4 executing workflow/event reference')
    return template


def finite_inventory_guard_original(raw,template_raw,event_raw,env):
    value=decode(raw);fields(value,'schema pass templateSha256 eventSha256 source platform setupTrustBoundary fontSelectionProved browserFontSelectionProved guestApproved firstFailure secondary')
    need(encode(value)==raw and value['schema']=='bw.gui-hdd.finite-inventory-guard.v1' and value['pass'] is True and
         value['templateSha256']==sha(template_raw) and value['eventSha256']==sha(event_raw) and
         value['firstFailure'] is None and value['secondary']==[] and
         all(value[key] is False for key in ('fontSelectionProved','browserFontSelectionProved','guestApproved')),'successful finite pre-setup source/event admission only')
    need(value['platform']=={key:env.get(key) for key in ('GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB','GITHUB_REPOSITORY','GITHUB_WORKFLOW_SHA','BW_EXPECTED_HEAD')},'same finite pre/post-setup producing platform')
    need(value['setupTrustBoundary']=={'bootstrapGitTrusted':True,'packageInstallerTrusted':True,'completeRuntimeBeforeSetupProved':False},'explicit bootstrap/setup trust boundary')
    source=value['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40);rows(source['files'])
    need(source['head']==decode(template_raw)['sourceHead'] and set(source['files'])==SOURCE,'finite guard exact source21 at selected head')
    return value


FINITE_V5_BEGIN = '<!-- BW_GUI_HDD_FINITE_INVENTORY_V5_BEGIN -->'
FINITE_V5_END = '<!-- BW_GUI_HDD_FINITE_INVENTORY_V5_END -->'
FINITE_V6_BEGIN = '<!-- BW_GUI_HDD_FINITE_INVENTORY_V6_SHA256_BEGIN -->'
FINITE_V6_END = '<!-- BW_GUI_HDD_FINITE_INVENTORY_V6_SHA256_END -->'


def finite_v5_scope():
    return dict(finite_inventory_scope(),installedEmptyRegularScoped=True)


def finite_v5_template(raw,expected):
    digest(expected)
    need(type(raw) is bytes and 0<len(raw)<=FINITE_INVENTORY_TEMPLATE_CAP and sha(raw)==expected,
         'selected finite v5 template bytes')
    template=decode(raw)
    fields(template,'schema sourceHead files aliases directoryAliases node python chromium tools emptyPythonSources libraries scope')
    need(encode(template)==raw and template['schema']=='bw.gui-hdd.inventory-template.v5' and
         encode(template['scope'])==encode(finite_v5_scope()),'explicit canonical finite v5 scope')
    digest(template['sourceHead'],40)
    for role,cap in (('files',512),('aliases',256),('directoryAliases',256)):
        roster=template[role]
        need(type(roster) is list and len(roster)<=cap and roster==sorted(set(roster)),
             'finite v5 sorted unique '+role)
        for path in roster:finite_inventory_path(path)
    need(1<=len(template['files']) and len(template['aliases'])+len(template['directoryAliases'])<=256 and
         len(set(template['files']+template['aliases']+template['directoryAliases']))==
         sum(len(template[k]) for k in ('files','aliases','directoryAliases')),
         'disjoint finite v5 core runtime roles')
    fields(template['tools'],'git gh')
    need(template['tools']=={'git':'/usr/bin/git','gh':'/usr/bin/gh'} and
         template['python']==PYTHON_EXECUTABLE and
         all(path in template['files'] for path in
         (template['node'],template['python'],template['chromium'],'/usr/bin/git','/usr/bin/gh','/usr/bin/curl')),
         'selected v5 bootstrap and executable files')
    libraries=template['libraries']
    need(type(libraries) is list and 1<=len(libraries)<=128 and libraries==sorted(set(libraries)) and
         set(libraries)<=set(template['files']),'selected v5 library subset')
    empty_python_policy(template['emptyPythonSources'],template['files'],template['aliases'],template['directoryAliases'])
    return template


def finite_v5_body_template(body,expected):
    need(type(body) is str and body.count(FINITE_V5_BEGIN)==body.count(FINITE_V5_END)==1,
         'one immutable finite v5 body wrapper')
    begin=body.index(FINITE_V5_BEGIN)+len(FINITE_V5_BEGIN);end=body.index(FINITE_V5_END)
    need(begin<end,'ordered finite v5 body wrapper')
    raw=body[begin:end].encode();need(raw.startswith(b'\n'),'canonical finite v5 wrapper separator')
    wrapper=decode(raw[1:]);fields(wrapper,'schema sha256 templateBase64')
    need(encode(wrapper)==raw[1:] and wrapper['schema']=='bw.gui-hdd.finite-inventory-transport.v5' and
         wrapper['sha256']==expected,'canonical externally pinned finite v5 transport')
    encoded=wrapper['templateBase64']
    need(type(encoded) is str and encoded.isascii() and 0<len(encoded)<=4*((FINITE_INVENTORY_TEMPLATE_CAP+2)//3),
         'bounded finite v5 template encoding')
    template=base64.b64decode(encoded,validate=True)
    need(base64.b64encode(template).decode()==encoded,'canonical finite v5 template encoding')
    finite_v5_template(template,expected)
    return template


def bind_finite_v5_event(raw,head,expected,env):
    need(type(raw) is bytes and 0<len(raw)<=INVENTORY_FAILURE_EVENT_CAP,'finite v5 exact event original cap')
    digest(head,40);digest(expected);event=decode(raw);pr=event.get('pull_request',{})
    need(event.get('action')=='labeled' and event.get('label',{}).get('name')=='x86-hdd-gui-finite-inventory-v5' and
         event.get('sender',{}).get('login')=='CrispStrobe' and event.get('repository',{}).get('full_name')==REPOSITORY,
         'owned distinct finite v5 inventory event')
    integer(event.get('number'),1,2**31-1)
    need(type(pr.get('number')) is int and event['number']==pr['number'] and pr.get('state')=='open' and
         pr.get('head',{}).get('sha')==head and pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY,'exact own finite v5 source event')
    template=finite_v5_body_template(pr.get('body'),expected)
    need(decode(template)['sourceHead']==head,'finite v5 body source head join')
    need(env.get('GITHUB_REPOSITORY')==REPOSITORY and env.get('GITHUB_EVENT_NAME')=='pull_request' and
         env.get('GITHUB_ACTOR')=='CrispStrobe' and env.get('GITHUB_RUN_ATTEMPT')=='1' and
         env.get('GITHUB_JOB')=='finite-inventory-five' and re.fullmatch('[1-9][0-9]{0,19}',env.get('GITHUB_RUN_ID','')) and
         env.get('BW_EXPECTED_HEAD')==head,'first official finite v5 platform observations')
    digest(env.get('GITHUB_WORKFLOW_SHA'),40)
    need(env.get('GITHUB_WORKFLOW_REF')==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(pr['number'])+'/merge',
         'finite v5 executing workflow/event reference')
    return template


def finite_v5_guard_original(raw,template_raw,event_raw,env):
    value=decode(raw)
    fields(value,'schema pass templateSha256 eventSha256 source platform setupTrustBoundary fontSelectionProved browserFontSelectionProved guestApproved firstFailure secondary')
    need(encode(value)==raw and value['schema']=='bw.gui-hdd.finite-inventory-guard.v5' and value['pass'] is True and
         value['templateSha256']==sha(template_raw) and value['eventSha256']==sha(event_raw) and
         value['firstFailure'] is None and value['secondary']==[] and
         all(value[key] is False for key in ('fontSelectionProved','browserFontSelectionProved','guestApproved')),
         'successful finite v5 pre-setup admission only')
    need(value['platform']=={key:env.get(key) for key in
         ('GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB','GITHUB_REPOSITORY','GITHUB_WORKFLOW_SHA','BW_EXPECTED_HEAD')},
         'same finite v5 pre/post-setup producing platform')
    need(value['setupTrustBoundary']=={'bootstrapGitTrusted':True,'packageInstallerTrusted':True,
         'completeRuntimeBeforeSetupProved':False},'explicit v5 setup trust boundary')
    source=value['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files'])
    need(source['head']==decode(template_raw)['sourceHead'] and set(source['files'])==SOURCE,
         'finite v5 guard exact source21')
    return value

def finite_v6_template(raw,expected):
    digest(expected)
    need(type(raw) is bytes and 0<len(raw)<=FINITE_INVENTORY_TEMPLATE_CAP and sha(raw)==expected,
         'selected finite v6 template bytes')
    template=decode(raw)
    fields(template,'schema sourceHead files aliases directoryAliases node python chromium tools emptyPythonSources libraries scope')
    need(encode(template)==raw and template['schema']=='bw.gui-hdd.inventory-template.v6' and
         encode(template['scope'])==encode(finite_v5_scope()),'explicit canonical finite v6 scope')
    digest(template['sourceHead'],40)
    for role,cap in (('files',512),('aliases',256),('directoryAliases',256)):
        roster=template[role]
        need(type(roster) is list and len(roster)<=cap and roster==sorted(set(roster)),
             'finite v6 sorted unique '+role)
        for path in roster:finite_inventory_path(path)
    need(1<=len(template['files']) and len(template['aliases'])+len(template['directoryAliases'])<=256 and
         len(set(template['files']+template['aliases']+template['directoryAliases']))==
         sum(len(template[k]) for k in ('files','aliases','directoryAliases')),
         'disjoint finite v6 core runtime roles')
    fields(template['tools'],'git gh')
    need(template['tools']=={'git':'/usr/bin/git','gh':'/usr/bin/gh'} and
         template['python']==PYTHON_EXECUTABLE and
         all(path in template['files'] for path in
         (template['node'],template['python'],template['chromium'],'/usr/bin/git','/usr/bin/gh','/usr/bin/curl')),
         'selected v5 bootstrap and executable files')
    libraries=template['libraries']
    need(type(libraries) is list and 1<=len(libraries)<=128 and libraries==sorted(set(libraries)) and
         set(libraries)<=set(template['files']),'selected v5 library subset')
    empty_python_policy(template['emptyPythonSources'],template['files'],template['aliases'],template['directoryAliases'])
    return template


def finite_v6_transport(body,expected,env):
    digest(expected)
    need(type(body) is str and len(body.encode('utf-8'))<=65536 and
         body.count(FINITE_V6_BEGIN)==body.count(FINITE_V6_END)==1,
         'one bounded finite v6 SHA-only body wrapper')
    begin=body.index(FINITE_V6_BEGIN)+len(FINITE_V6_BEGIN);end=body.index(FINITE_V6_END)
    need(begin<end and body[begin:end]=='\n'+expected+'\n',
         'canonical finite v6 body digest only')
    need(env.get('BW_FINITE_INVENTORY_V6_SHA256')==expected,
         'selected finite v6 repository SHA variable')
    encoded=env.get('BW_FINITE_INVENTORY_V6_TEMPLATE_B64')
    need(type(encoded) is str and encoded.isascii() and
         0<len(encoded)<=4*((FINITE_INVENTORY_TEMPLATE_CAP+2)//3),
         'bounded finite v6 template variable')
    template=base64.b64decode(encoded,validate=True)
    need(base64.b64encode(template).decode()==encoded,
         'canonical finite v6 template Base64 variable')
    finite_v6_template(template,expected)
    return template


def bind_finite_v6_event(raw,head,expected,env):
    need(type(raw) is bytes and 0<len(raw)<=INVENTORY_FAILURE_EVENT_CAP,'finite v6 exact event original cap')
    digest(head,40);digest(expected);event=decode(raw);pr=event.get('pull_request',{})
    need(event.get('action')=='labeled' and event.get('label',{}).get('name')=='x86-hdd-gui-finite-inventory-v6' and
         event.get('sender',{}).get('login')=='CrispStrobe' and event.get('repository',{}).get('full_name')==REPOSITORY,
         'owned distinct finite v6 inventory event')
    integer(event.get('number'),1,2**31-1)
    need(type(pr.get('number')) is int and event['number']==pr['number'] and pr.get('state')=='open' and
         pr.get('head',{}).get('sha')==head and pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY,'exact own finite v6 source event')
    template=finite_v6_transport(pr.get('body'),expected,env)
    need(decode(template)['sourceHead']==head,'finite v6 body source head join')
    need(env.get('GITHUB_REPOSITORY')==REPOSITORY and env.get('GITHUB_EVENT_NAME')=='pull_request' and
         env.get('GITHUB_ACTOR')=='CrispStrobe' and env.get('GITHUB_RUN_ATTEMPT')=='1' and
         env.get('GITHUB_JOB')=='finite-inventory-six' and re.fullmatch('[1-9][0-9]{0,19}',env.get('GITHUB_RUN_ID','')) and
         env.get('BW_EXPECTED_HEAD')==head,'first official finite v6 platform observations')
    digest(env.get('GITHUB_WORKFLOW_SHA'),40)
    need(env.get('GITHUB_WORKFLOW_REF')==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(pr['number'])+'/merge',
         'finite v6 executing workflow/event reference')
    return template


def finite_v6_guard_original(raw,template_raw,event_raw,env):
    value=decode(raw)
    fields(value,'schema pass templateSha256 eventSha256 source platform setupTrustBoundary fontSelectionProved browserFontSelectionProved guestApproved firstFailure secondary')
    need(encode(value)==raw and value['schema']=='bw.gui-hdd.finite-inventory-guard.v6' and value['pass'] is True and
         value['templateSha256']==sha(template_raw) and value['eventSha256']==sha(event_raw) and
         value['firstFailure'] is None and value['secondary']==[] and
         all(value[key] is False for key in ('fontSelectionProved','browserFontSelectionProved','guestApproved')),
         'successful finite v6 pre-setup admission only')
    need(value['platform']=={key:env.get(key) for key in
         ('GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB','GITHUB_REPOSITORY','GITHUB_WORKFLOW_SHA','BW_EXPECTED_HEAD')},
         'same finite v6 pre/post-setup producing platform')
    need(value['setupTrustBoundary']=={'bootstrapGitTrusted':True,'packageInstallerTrusted':True,
         'completeRuntimeBeforeSetupProved':False},'explicit v5 setup trust boundary')
    source=value['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files'])
    need(source['head']==decode(template_raw)['sourceHead'] and set(source['files'])==SOURCE,
         'finite v6 guard exact source21')
    return value


def actual_inventory_reference(reference):
    """External prior-observation reference, never an automatic metadata approval."""
    fields(reference,'schema metadataAdmission jobId artifactId artifactSha256 workflow')
    finite=reference['schema'] in ('bw.gui-hdd.actual-finite-inventory-reference.v1',
                                   'bw.gui-hdd.actual-finite-inventory-reference.v2',
                                   'bw.gui-hdd.actual-finite-inventory-reference.v3')
    need(finite or reference['schema']=='bw.gui-hdd.actual-inventory-reference.v1','explicit versioned actual inventory reference')
    selected_version=6 if reference['schema']=='bw.gui-hdd.actual-finite-inventory-reference.v3' else 5 if reference['schema']=='bw.gui-hdd.actual-finite-inventory-reference.v2' else 4 if finite else 3
    for name in ('jobId','artifactId'):integer(reference[name],1,2**63-1)
    digest(reference['artifactSha256']);fields(reference['workflow'],'commit path sha256')
    digest(reference['workflow']['commit'],40);digest(reference['workflow']['sha256'])
    need(reference['workflow']['path']=='.github/workflows/i80386-hdd-gui-actual.yml','prior metadata producer workflow')
    selected=reference['metadataAdmission'];fields(selected,'schema source template original runId workflowSha'+(' repositoryVariables' if selected_version==6 else ''))
    need(selected['schema']=='bw.gui-hdd.inventory-admission.v'+str(selected_version),
         'versioned independently selected metadata descriptor')
    integer(selected['runId'],1,2**63-1);digest(selected['workflowSha'],40)
    source=selected['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files']);need(set(source['files'])==SOURCE,'separately reviewed prior metadata source21')
    for name in ('template','original'):
        fields(selected[name],'byteLength sha256');integer(selected[name]['byteLength'],1,JSON_CAP);digest(selected[name]['sha256'])
    if selected_version==6:
        finite_v6_variables(selected['repositoryVariables'],selected['template']['sha256'])
        template=base64.b64decode(selected['repositoryVariables']['BW_FINITE_INVENTORY_V6_TEMPLATE_B64'],validate=True)
        need(len(template)==selected['template']['byteLength'] and decode(template)['sourceHead']==source['head'],
             'selected finite v6 reference template extent and source head')
    need(selected['workflowSha']==reference['workflow']['commit'] and
         reference['workflow']['sha256']==source['files'][reference['workflow']['path']]['sha256'],'prior observation/executing workflow/content join')
    return selected


# A separately reviewed native observation is a finite input, never a host lease
# or browser-font equivalence proof. The current GUI job rereads its selected
# files through the existing before/after runtime observer.
NATIVE_FONT_SOURCE = frozenset((
 'scripts/i80386-native-font-selection/run.py',
 'scripts/i80386-native-font-selection/reader.py',
 'scripts/i80386-native-font-selection/controls.py',
 'scripts/i80386-native-font-selection/README.md',
 '.github/workflows/i80386-native-font-selection.yml'))
NATIVE_FONT_ROLES = frozenset(('request','event','original','service','expectation','readerReport','run','job','artifact'))


def native_font_layout(reference):
    font=Path(reference['font']['path']);stage=font.parent.parent
    need(font.name=='selected.ttf' and font.parent.name=='fonts' and
         reference['font']['licensePath']==str(stage/'NOTICE'),'fixed owned font input layout')
    need(re.fullmatch(r'/[A-Za-z0-9_./-]+',str(stage)),'XML-safe selected owned font root')
    raw=('<?xml version="1.0"?>\n<fontconfig>\n  <dir>'+str(stage/'fonts')+
         '</dir>\n  <cachedir>'+str(stage/'cache')+'</cachedir>\n</fontconfig>\n').encode()
    return stage,raw


GOOGLE_FONTS_RAW = 'https://raw.githubusercontent.com/google/fonts/'


def google_fonts_raw_url(url):
    need(type(url) is str and len(url)<=512 and url.startswith(GOOGLE_FONTS_RAW),
         'fixed Google Fonts raw origin')
    commit,separator,path=url[len(GOOGLE_FONTS_RAW):].partition('/')
    need(separator=='/' and re.fullmatch(r'[0-9a-f]{40}',commit) is not None and path,
         'full immutable Google Fonts commit and nonempty path')
    need(all(part not in ('','.','..') and
             re.fullmatch(r'(?:[A-Za-z0-9._~-]|%5[Bb]|%5[Dd])+',part) is not None
             for part in path.split('/')),
         'canonical safe Google Fonts path without query or traversal')
    return url


def native_font_fetch_argv(url,seconds,size):
    google_fonts_raw_url(url)
    return ['/usr/bin/curl','--fail','--silent','--show-error','--proto','=https',
            '--max-time',str(seconds),'--max-filesize',str(size),'--url',url]


def actual_native_font_reference(reference, runtime):
    fields(reference,'schema source workflow runId jobId artifactId artifactName artifactBytes artifactSha256 originals files font tool')
    need(reference['schema'] in ('bw.gui-hdd.actual-native-font-reference.v1','bw.gui-hdd.actual-native-font-reference.v2'),'explicit separately reviewed native-font reference')
    version=2 if reference['schema'].endswith('.v2') else 1
    source=reference['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    need(type(source['files']) is dict and set(source['files'])==NATIVE_FONT_SOURCE,'exact separate native-font source closure')
    for row in source['files'].values():fields(row,'sha256');digest(row['sha256'])
    workflow=reference['workflow'];fields(workflow,'commit path sha256');digest(workflow['commit'],40);digest(workflow['sha256'])
    need(workflow['path']=='.github/workflows/i80386-native-font-selection.yml' and workflow['sha256']==source['files'][workflow['path']]['sha256'],'native executing workflow/content selection')
    for key in ('runId','jobId','artifactId'):integer(reference[key],1,2**63-1)
    integer(reference['artifactBytes'],1,32<<20);digest(reference['artifactSha256'])
    need(reference['artifactName']==('i80386-native-font-selection-' if version==1 else 'i80386-native-font-selection-v2-')+str(reference['runId'])+'-1','new native-font original delivery identity')
    need(type(reference['originals']) is dict and set(reference['originals'])==NATIVE_FONT_ROLES,'closed separately reviewed native original roles')
    for row in reference['originals'].values():
        fields(row,'byteLength sha256');integer(row['byteLength'],1,JSON_CAP);digest(row['sha256'])
    files=reference['files'];need(type(files) is dict and 3<=len(files)<=128,'finite selected native files')
    for path,row in files.items():
        runtime_path(path);fields(row,'byteLength sha256');integer(row['byteLength'],1,256<<20);digest(row['sha256'])
        need(encode(row)==encode(runtime['files'].get(path)),'native file joins current GUI runtime readback selection')
    font=reference['font'];fields(font,'url path byteLength sha256 licenseUrl licensePath licenseBytes licenseSha256')
    runtime_path(font['path']);runtime_path(font['licensePath']);digest(font['licenseSha256']);integer(font['licenseBytes'],1,128<<10)
    for key in ('url','licenseUrl'):
        google_fonts_raw_url(font[key])
    integer(font['byteLength'],1,16<<20);digest(font['sha256'])
    need(files.get(font['path'])=={'byteLength':font['byteLength'],'sha256':font['sha256']} and
         files.get(font['licensePath'])=={'byteLength':font['licenseBytes'],'sha256':font['licenseSha256']},'selected native font and separately reviewed notice bytes')
    tool=reference['tool'];fields(tool,'path byteLength sha256');runtime_path(tool['path']);integer(tool['byteLength'],1,FILE_CAP);digest(tool['sha256'])
    need(files.get(tool['path'])=={'byteLength':tool['byteLength'],'sha256':tool['sha256']},'selected native tool current-job identity')
    stage,config=native_font_layout(reference)
    need(runtime['files'].get(str(stage/'fontconfig.xml'))=={'byteLength':len(config),'sha256':sha(config)} and
         '/usr/bin/curl' in runtime['files'],'selected current font config and acquisition tool graph')
    need(not any(path==str(stage) or path.startswith(str(stage)+'/') for role in ('aliases','directoryAliases') for path in runtime[role]),'owned font input has no admitted aliases')
    return reference


def native_source_git_v6(value,reference,inventory_reference,current_head):
    fields(value,'observed finite current')
    for label,head in (('observed',reference['source']['head']),
                       ('finite',inventory_reference['metadataAdmission']['source']['head']),
                       ('current',current_head)):
        selected=value[label];fields(selected,'head files')
        need(selected['head']==head,'native Git source head binding')
        manifest=selected['files']
        need(type(manifest) is dict and set(manifest)==NATIVE_FONT_SOURCE,
             'exact five native Git source files')
        for name,row in manifest.items():
            fields(row,'mode gitBlob bytes sha256')
            need(row['mode']=='100644','fixed regular native Git source mode')
            digest(row['gitBlob'],40);integer(row['bytes'],1,FILE_CAP);digest(row['sha256'])
            if label=='observed':
                need(row['sha256']==reference['source']['files'][name]['sha256'],
                     'native observation/Git source bytes join')
    need(value['observed']['files']==value['finite']['files']==value['current']['files'],
         'five native Git mode/blob/bytes/SHA unchanged across H0/H1/A')
    return value


def parse_request(raw, expected):
    digest(expected); need(type(raw) is bytes and 0 < len(raw) <= JSON_CAP and sha(raw) == expected,
                           'independently selected request digest')
    request = decode(raw)
    version=8 if request.get('schema')=='bw.gui-hdd.actual-request.v8' else 7 if request.get('schema')=='bw.gui-hdd.actual-request.v7' else 6 if request.get('schema')=='bw.gui-hdd.actual-request.v6' else 5 if request.get('schema')=='bw.gui-hdd.actual-request.v5' else 4 if request.get('schema')=='bw.gui-hdd.actual-request.v4' else 3
    fields(request, 'schema repository pullRequest source build criticalFiles installedFiles runtime inventoryAdmission inputs pythonStartup'+(' nativeFontAdmission' if version>=5 else '')+(' nativeSourceGit' if version>=6 else '')+(' dispatch' if version>=8 else ''))
    need(encode(request) == raw and request['schema'] == 'bw.gui-hdd.actual-request.v'+str(version) and
         request['repository'] == REPOSITORY, 'canonical owned approval request')
    need(encode(request['pythonStartup'])==encode(startup_policy()) and request['runtime']['python']==PYTHON_EXECUTABLE,'explicit v3 startup policy and selected CPython')
    integer(request['pullRequest'], 1, 2**31-1)
    source = request['source']; fields(source, 'head tree files'); digest(source['head'], 40); digest(source['tree'], 40)
    rows(source['files']); need(set(source['files']) == SOURCE, 'exact tracked source closure')
    if version == 8:
        dispatch=request['dispatch'];fields(dispatch,'tagName tagRef workflow')
        need(dispatch['tagName']=='bw-gui-hdd-actual-v8-'+source['head'] and
             dispatch['tagRef']=='refs/tags/'+dispatch['tagName'],
             'exact source-head tag name and full ref')
        fields(dispatch['workflow'],'path sha256');digest(dispatch['workflow']['sha256'])
        path='.github/workflows/i80386-hdd-gui-actual.yml'
        need(dispatch['workflow']['path']==path and
             dispatch['workflow']['sha256']==source['files'][path]['sha256'],
             'selected exact workflow source row')
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
    if version>=5:
        need(build['head']==source['head'] and prior['checkoutTree']==source['tree'],'current Build head and complete checkout tree match selected GUI source')
    installed_rows_v5(request['installedFiles'],INSTALLED_V6_CRITICAL) if version>=6 else rows(request['installedFiles'])
    if version>=5:need('node_modules/bw-circuit-ui/package.json' in request['installedFiles'],'complete selected Circuit UI inventory required for current actual')
    need(any(x.startswith('node_modules/bw-board/') for x in request['installedFiles']) and
         any(x.startswith('node_modules/playwright-core/') for x in request['installedFiles']), 'complete selected supplier/browser package inventories required')
    runtime = request['runtime']; fields(runtime, 'files aliases directoryAliases node python chromium tools resources'+(' emptyPythonSources' if version>=4 else ''))
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
    if version>=4:empty_python_policy(runtime['emptyPythonSources'],runtime['files'],runtime['aliases'],runtime['directoryAliases'])
    prior_inventory=request['inventoryAdmission']
    if version>=4:
        actual_inventory_reference(prior_inventory)
        need(prior_inventory['schema']==('bw.gui-hdd.actual-finite-inventory-reference.v3' if version>=6 else 'bw.gui-hdd.actual-finite-inventory-reference.v1' if version==5 else 'bw.gui-hdd.actual-inventory-reference.v1'),'distinct finite and historical actual inventory bases')
    else:
        fields(prior_inventory,'schema sourceHead runId jobId artifactId artifactSha256 original templateSha256 workflow')
        need(prior_inventory['schema']=='bw.gui-hdd.inventory-admission.v2','separately reviewed prior inventory admission')
        digest(prior_inventory['sourceHead'],40);digest(prior_inventory['artifactSha256']);digest(prior_inventory['templateSha256'])
        for key in ('runId','jobId','artifactId'):integer(prior_inventory[key],1,2**63-1)
        fields(prior_inventory['original'],'byteLength sha256');integer(prior_inventory['original']['byteLength'],1,JSON_CAP);digest(prior_inventory['original']['sha256'])
        fields(prior_inventory['workflow'],'commit path sha256');digest(prior_inventory['workflow']['commit'],40);digest(prior_inventory['workflow']['sha256'])
        need(prior_inventory['workflow']['path']=='.github/workflows/i80386-hdd-gui-actual.yml','prior inventory producer workflow')
    if version>=5:actual_native_font_reference(request['nativeFontAdmission'],runtime)
    if version>=6:native_source_git_v6(request['nativeSourceGit'],request['nativeFontAdmission'],
                                       request['inventoryAdmission'],source['head'])
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
    version=request['schema']
    selected_label='x86-hdd-gui-actual-v7' if version=='bw.gui-hdd.actual-request.v7' else 'x86-hdd-gui-actual-v6' if version=='bw.gui-hdd.actual-request.v6' else LABEL
    selected_marker='BW_GUI_HDD_ACTUAL_V7_REQUEST_SHA256' if version=='bw.gui-hdd.actual-request.v7' else 'BW_GUI_HDD_ACTUAL_V6_REQUEST_SHA256' if version=='bw.gui-hdd.actual-request.v6' else 'BW_GUI_HDD_REQUEST_SHA256'
    need(event.get('action') == 'labeled' and event.get('label', {}).get('name') == selected_label and
         event.get('sender', {}).get('login') == 'CrispStrobe' and repo.get('full_name') == REPOSITORY,
         'owned operator labeled event')
    need(type(event.get('number')) is int and event['number'] == request['pullRequest'] and
         type(pr.get('number')) is int and pr.get('number') == request['pullRequest'] and pr.get('state') == 'open' and
         pr.get('head', {}).get('sha') == request['source']['head'] and
         pr.get('head', {}).get('repo', {}).get('full_name') == REPOSITORY and
         pr.get('head', {}).get('repo', {}).get('fork') is False and
         pr.get('base', {}).get('repo', {}).get('full_name') == REPOSITORY and
         pr.get('base', {}).get('ref') == 'main', 'exact own PR source event')
    marker = '<!-- '+selected_marker+'='+expected+' -->'
    need(type(pr.get('body')) is str and pr['body'].count('<!-- '+selected_marker+'=') == 1 and
         pr['body'].count(marker) == 1, 'immutable event request pin transport')
    need(env.get('GITHUB_REPOSITORY') == REPOSITORY and env.get('GITHUB_EVENT_NAME') == 'pull_request' and
         env.get('GITHUB_ACTOR') == 'CrispStrobe' and env.get('GITHUB_RUN_ATTEMPT') == '1' and
         re.fullmatch('[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', '')) and
         env.get('GITHUB_JOB') == ('actual-v7' if version=='bw.gui-hdd.actual-request.v7' else 'actual') and
         env.get('BW_EXPECTED_HEAD') == request['source']['head'], 'official platform observations')
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
    installed=prior_inventory['installedFiles']
    if request['schema']=='bw.gui-hdd.actual-request.v5' and metadata['schema']=='bw.gui-hdd.inventory-admission.v3':
        # The separately frozen current request extends the historical census
        # with the complete installed CUI package. No held package row changes.
        selected={path:row for path,row in request['installedFiles'].items() if path.startswith('node_modules/bw-circuit-ui/')}
        for path,row in selected.items():need(path not in installed or encode(installed[path])==encode(row),'current CUI extension preserves prior installed rows')
        installed=dict(installed,**selected)
    need(encode(installed)==encode(request['installedFiles']),'actual installed graph joins reviewed prior observation')
    for role in ('files','aliases','directoryAliases','node','python','chromium','tools','resources'):
        current=request['runtime'][role];prior=prior_inventory['runtime'][role]
        if request['schema'] in ('bw.gui-hdd.actual-request.v5','bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8') and role in ('files','aliases','directoryAliases'):
            native=decode(expected_embedded_original(expected['nativeFontOriginals']['request']))['selection']['runtime'][role]
            extension=dict(request['nativeFontAdmission']['files']) if role=='files' else native
            if role=='files':
                stage,_=native_font_layout(request['nativeFontAdmission'])
                for path in (str(stage/'fontconfig.xml'),'/usr/bin/curl'):extension[path]=current[path]
            for path,row in extension.items():
                need(path not in prior or encode(prior[path])==encode(row),'native extension preserves held metadata '+role)
            prior=dict(prior,**extension)
        need(encode(prior)==encode(current),'actual positive runtime graph joins reviewed metadata '+role)
    need(encode(template['emptyPythonSources'])==encode(request['runtime']['emptyPythonSources']),'actual typed selection joins independently pinned metadata template')


def join_native_v2_identity(observed, service, reference):
    """Join the externally reviewed v2 invoker/proc and terminal witnesses."""
    platform=observed['platform'];identity=None
    need(observed.get('servicePartial') is None,'complete v2 has no partial service observation')
    unit='bw-native-font-v2-'+str(reference['runId'])+'-1.service';cg='/system.slice/'+unit
    for phase in ('before','after'):
        snapshot=observed.get('service',{}).get(phase)
        need(type(snapshot) is dict and snapshot.get('unit')==unit and snapshot.get('cgroupPath')==cg,
             'native v2 selected service observation')
        selected=snapshot.get('processIdentity');fields(selected,'uid gid resuid resgid')
        for name in ('uid','gid'):
            integer(selected[name],1,2**31-1)
            need(type(platform.get('BW_NATIVE_V2_INVOKER_'+name.upper())) is str and
                 platform['BW_NATIVE_V2_INVOKER_'+name.upper()]==str(selected[name]) and
                 selected['res'+name]==[selected[name]]*3 and
                 all(type(x) is int for x in selected['res'+name]),'native v2 source-configured actual process identity')
        if identity is None:identity=selected
        need(selected==identity,'native v2 before/after invoker identity')
        witness=snapshot.get('selfProc')
        fields(witness,'path role before after named bytesRead prefixBytes prefixSha256 prefixBase64 closeAttempted closed complete')
        raw=('0::'+cg+'\n').encode()
        need(witness['path']=='/proc/self/cgroup' and witness['role']=='self-proc' and
             witness['complete'] is True and witness['closeAttempted'] is True and witness['closed'] is True and
             type(witness['bytesRead']) is int and witness['bytesRead']==len(raw) and
             type(witness['prefixBytes']) is int and witness['prefixBytes']==len(raw) and
             witness['prefixSha256']==sha(raw) and witness['prefixBase64']==base64.b64encode(raw).decode(),
             'native v2 exact closed self-proc membership bytes')
        first=witness['before'];fields(first,'dev ino mode uid gid')
        for key in ('dev','ino','mode','uid','gid'):integer(first[key],0,2**63-1)
        need(first==witness['after']==witness['named'] and stat.S_ISREG(first['mode']) and
             first['uid']==identity['uid'] and first['gid']==identity['gid'],
             'native v2 stable self-proc owner identity')
    fields(service,'schema unit cgroupPath serviceExitCode originalPresent pre cleanup post outsideFiniteCleanupProved firstFailure secondary invokerIdentity innerComplete innerBeforeObserved innerFirstFailure')
    need(service['schema']=='bw.gui-hdd.native-font-service.v2' and service['unit']==unit and
         service['cgroupPath']==cg and type(service['serviceExitCode']) is int and service['serviceExitCode']==0 and
         service['originalPresent'] is True and service['outsideFiniteCleanupProved'] is True and
         service['firstFailure'] is None and service['secondary']==[] and service['invokerIdentity']==identity and
         service['innerComplete'] is True and service['innerBeforeObserved'] is True and service['innerFirstFailure'] is None,
         'native v2 complete independently reviewed outer original')
    post=service.get('post');fields(post,'unit cgroup')
    terminal=post['unit'];fields(terminal,'LoadState ActiveState SubState Result ExecMainCode ExecMainStatus ControlGroup MainPID ControlPID KillMode')
    need(terminal['ActiveState']=='inactive' and terminal['LoadState'] in ('loaded','not-found') and
         terminal['MainPID']=='0' and terminal['ControlPID']=='0' and terminal['ControlGroup'] in ('',cg),
         'native v2 terminal process census')
    census=post['cgroup'];fields(census,'exists populated procs threads nrDescendants nrDyingDescendants')
    need(type(census['exists']) is bool and
         (all(census[k] is None for k in census if k!='exists') if not census['exists'] else
          type(census['populated']) is int and census['populated']==0 and census['procs']==[] and census['threads']==[] and
          type(census['nrDescendants']) is int and census['nrDescendants']==0 and
          type(census['nrDyingDescendants']) is int and census['nrDyingDescendants']==0),
         'native v2 finite outside descendant census')


def join_actual_native_font(request, expected):
    """Join an externally frozen independent native review; do not execute it."""
    reference=actual_native_font_reference(request['nativeFontAdmission'],request['runtime'])
    need(sha(encode(reference))==expected['nativeFontReferenceSha256'],'independently selected native-font reference')
    version=2 if reference['schema'].endswith('.v2') else 1
    suffix='.v'+str(version)
    job_name='native-font-selection' if version==1 else 'native-font-selection-v2'
    marker_name='BW_NATIVE_FONT_REQUEST_SHA256' if version==1 else 'BW_NATIVE_FONT_V2_REQUEST_SHA256'
    selected=expected['nativeFontOriginals']
    need(type(selected) is dict and set(selected)==NATIVE_FONT_ROLES,'closed external native original roles')
    originals={}
    for role,row in selected.items():
        raw=expected_embedded_original(row)
        need({'byteLength':len(raw),'sha256':sha(raw)}==reference['originals'][role],'external native original exact reference '+role)
        originals[role]=decode(raw)
    native=originals['request'];prior=originals['expectation'];observed=originals['original'];report=originals['readerReport']
    need(native.get('schema')=='bw.gui-hdd.native-font-request'+suffix and native.get('repository')==REPOSITORY and
         encode(native.get('source'))==encode(reference['source']),'separate native request/source join')
    source=reference['source'];need(prior.get('schema')=='bw.gui-hdd.native-font-expectation'+suffix and
         prior.get('head')==source['head'] and prior.get('tree')==source['tree'] and
         encode(prior.get('sourceFiles'))==encode(source['files']) and prior.get('conclusion')=='success' and
         prior.get('workflowSha')==reference['workflow']['commit'] and prior.get('runId')==str(reference['runId']) and type(prior.get('jobId')) is int and prior['jobId']==reference['jobId'],
         'independent native expectation/source/official identity')
    for role,key in (('request','requestSha256'),('event','eventSha256'),('original','originalSha256')):
        need(prior.get(key)==reference['originals'][role]['sha256'],'native independent expectation original join')
    need(type(prior.get('originalBytes')) is int and prior['originalBytes']==reference['originals']['original']['byteLength'],'native original byte count')
    need(type(prior.get('serviceBytes')) is int and prior['serviceBytes']==reference['originals']['service']['byteLength'] and prior.get('serviceSha256')==reference['originals']['service']['sha256'],'native outside service original exact reference')
    for role in ('request','event'):
        need(observed.get(role)=={'bytes':reference['originals'][role]['byteLength'],'sha256':reference['originals'][role]['sha256']},'native original input bytes '+role)
    observed_source=observed.get('source');need(type(observed_source) is dict and set(observed_source)==NATIVE_FONT_SOURCE,'native original separate source roster')
    for path,row in observed_source.items():
        fields(row,'bytes sha256');integer(row['bytes'],1,1<<20)
        need(row['sha256']==source['files'][path]['sha256'],'native original separate source digest')
    selection=native.get('selection',{});font=selection.get('font',{});tool=selection.get('tool',{})
    need(all(font.get(key)==reference['font'][key] for key in ('url','sha256','licenseUrl','licenseBytes','licenseSha256')) and
         type(font.get('bytes')) is int and font['bytes']==reference['font']['byteLength'] and
         tool=={'path':reference['tool']['path'],'bytes':reference['tool']['byteLength'],'sha256':reference['tool']['sha256']},
         'native selected font/license/tool joins current-job file identities')
    need(selection.get('query')=={'pattern':'monospace:lang=en','format':'%{file}\t%{family}\t%{style}\t%{index}\n'},'explicit native monospace query')
    need(observed.get('schema')=='bw.gui-hdd.native-font-original'+suffix and observed.get('observationOnly') is True and
         observed.get('systemFallbackExcluded') is False and observed.get('complete') is True and
         observed.get('firstFailure') is None and observed.get('secondary')==[] and
         observed.get('selectedNativeRuntimeReadbackProved') is True,'independently reviewed complete finite native observation')
    for key in ('nativeLibraryClosureProved','wholeHostAttested','browserFontSelectionProved','actualRequestSupported','guestApproved'):
        need(observed.get(key) is False and report.get(key) is False,'preserved native observation boundary '+key)
    need(report.get('schema')=='bw.gui-hdd.native-font-reader'+suffix and report.get('nativeSelectionObserved') is True and
         report.get('selectedNativeRuntimeReadbackProved') is True and report.get('sourceHead')==source['head'] and
         report.get('runId')==str(reference['runId']) and type(report.get('jobId')) is int and report['jobId']==reference['jobId'] and
         report.get('selectedFontSha256')==reference['font']['sha256'],'separately frozen independent native-reader result')
    # Exact selected files are a finite trusted-loader boundary. A different job
    # inode, native cache result or a report Boolean cannot supply current bytes.
    native_runtime=selection.get('runtime');need(type(native_runtime) is dict,'selected finite native runtime')
    witnessed=observed.get('nativeRuntime');fields(witnessed,'files aliases directoryAliases loadedLibraries version environment after selectedReadback')
    need(witnessed['selectedReadback'] is True and witnessed['loadedLibraries']==[] and witnessed['version'] is None and
         encode(witnessed['after'])==encode(native_runtime),'finite native readback preserves unknown loader/version boundary')
    for role in ('files','aliases','directoryAliases'):
        value=native_runtime.get(role);need(type(value) is dict,'finite selected native runtime '+role)
        need(encode(witnessed[role])==encode(value),'native before/after selected runtime '+role)
        report_key={'files':'nativeRuntimeFiles','aliases':'nativeRuntimeAliases','directoryAliases':'nativeRuntimeDirectoryAliases'}[role]
        need(encode(report.get(report_key))==encode(value),'independent native report finite runtime '+role)
        for path,row in value.items():
            if role=='files':
                fields(row,'bytes sha256');integer(row['bytes'],1,256<<20);digest(row['sha256'])
                row={'byteLength':row['bytes'],'sha256':row['sha256']}
            need(encode(request['runtime'][role].get(path))==encode(row),'native selected runtime joins current-job '+role)
    merged={path:{'byteLength':row['bytes'],'sha256':row['sha256']} for path,row in native_runtime['files'].items()}
    for path in (reference['font']['path'],reference['font']['licensePath'],reference['tool']['path']):merged[path]=reference['files'][path]
    need(encode(merged)==encode(reference['files']),'exact native finite file reference without omissions')
    run,job,artifact=(originals[key] for key in ('run','job','artifact'));typed_metadata(run,job,artifact)
    need(run.get('id')==reference['runId'] and run.get('run_attempt')==1 and run.get('event')=='pull_request' and
         run.get('head_sha')==source['head'] and run.get('repository',{}).get('full_name')==REPOSITORY and
         run.get('path')=='.github/workflows/i80386-native-font-selection.yml' and
         run.get('status')=='completed' and run.get('conclusion')=='success' and
         run.get('actor',{}).get('login')=='CrispStrobe','separately admitted official native run')
    need(job.get('id')==reference['jobId'] and job.get('run_id')==reference['runId'] and
         job.get('name')==job_name and job.get('status')=='completed' and job.get('conclusion')=='success','official native producing job')
    need(artifact.get('id')==reference['artifactId'] and artifact.get('name')==reference['artifactName'] and
         artifact.get('expired') is False and artifact.get('size_in_bytes')==reference['artifactBytes'] and
         artifact.get('digest')=='sha256:'+reference['artifactSha256'] and
         artifact.get('workflow_run',{}).get('id')==reference['runId'] and artifact.get('workflow_run',{}).get('head_sha')==source['head'],
         'official new native original artifact')
    steps=job.get('steps');need(type(steps) is list and len(steps)<=64,'bounded native official steps')
    positions=[]
    for name in ('Refuse until selected font, tool, cache and event review','Retain bounded original only after separately reviewed activation'):
        matches=[i for i,step in enumerate(steps) if step.get('name')==name and step.get('status')=='completed' and step.get('conclusion')=='success']
        need(len(matches)==1,'unique successful official native producing step');positions.append(matches[0])
    need(positions==sorted(set(positions)),'native observation precedes original retention')
    event=originals['event'];pr=event.get('pull_request',{});platform=observed.get('platform',{})
    marker='<!-- '+marker_name+'='+reference['originals']['request']['sha256']+' -->'
    need(type(pr.get('body')) is str and pr['body'].count('<!-- '+marker_name+'=')==1 and pr['body'].count(marker)==1,'native immutable request event transport')
    need(event.get('action')=='labeled' and event.get('label',{}).get('name')=='x86-native-font-selection-v'+str(version) and
         event.get('sender',{}).get('login')=='CrispStrobe' and event.get('repository',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('sha')==source['head'] and pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY and pr.get('state')=='open' and
         type(event.get('number')) is int and type(pr.get('number')) is int and type(native.get('pullRequest')) is int and
         event['number']==pr['number']==native['pullRequest'] and
         platform.get('GITHUB_RUN_ID')==str(reference['runId']) and platform.get('GITHUB_RUN_ATTEMPT')=='1' and
         platform.get('GITHUB_JOB')==job_name and platform.get('GITHUB_WORKFLOW_SHA')==prior.get('workflowSha'),
         'separate native event/source/platform join')

    if version==2:
        join_native_v2_identity(observed,originals['service'],reference)


def expected_policy(expected):
    version=8 if expected.get('schema')=='bw.gui-hdd.actual-expectation.v8' else 7 if expected.get('schema')=='bw.gui-hdd.actual-expectation.v7' else 6 if expected.get('schema')=='bw.gui-hdd.actual-expectation.v6' else 5 if expected.get('schema')=='bw.gui-hdd.actual-expectation.v5' else 4 if expected.get('schema')=='bw.gui-hdd.actual-expectation.v4' else 3
    fields(expected,'requestSha256 buildSourceAdmissionSha256 inventoryOriginal sourceHead runId jobId artifactId artifactName artifactBytes artifactSha256 run job artifact'+(' schema inventoryTemplate inventoryReferenceSha256' if version>=4 else '')+(' nativeFontReferenceSha256 nativeFontOriginals' if version>=5 else '')+(' nativeSourceGitSha256' if version>=6 else '')+(' dispatchProof' if version>=8 else ''))
    if version == 8:
        fields(expected['dispatchProof'],'pullRequest tagRef')
        for row in expected['dispatchProof'].values():
            fields(row,'byteLength sha256');integer(row['byteLength'],1,JSON_CAP);digest(row['sha256'])
    if version>=4:
        digest(expected['inventoryReferenceSha256']);expected_embedded_original(expected['inventoryTemplate'])
    if version>=5:
        digest(expected['nativeFontReferenceSha256'])
        need(type(expected['nativeFontOriginals']) is dict and set(expected['nativeFontOriginals'])==NATIVE_FONT_ROLES,'externally selected native original roles')
        for row in expected['nativeFontOriginals'].values():expected_embedded_original(row)
    if version>=6:digest(expected['nativeSourceGitSha256'])
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
    top={'python-startup.original.txt','python-startup.before.json','python-startup.after.json','inventory.json','result.json','request.original.json','event.original.json','dispatch-pr.original.json','dispatch-tag.original.json','source.before.json','source.after.json',
      'runtime.before.json','runtime.after.json','installed.before.json','installed.after.json','native-source-git.before.json','build-run.original.json',
      'build-job.original.json','build-artifact.original.json','frontend.original.zip','frontend.partial.zip',
      'frontend.members.json','build.inventory.json','probe-admission.json','frontend-acquisition.stderr','frontend-acquisition.process.json'}
    if name in top:return True
    if name in {'native-font.stage.json','native-font.config.original.xml','native-font.cache.before.json','native-font.cache.after.json','native-font.cache.partial.json'}:return True
    if name in {'native-font.'+role+'.'+suffix for role in ('font','notice') for suffix in ('stdout','stderr','process.json')}:return True
    if re.fullmatch(r'git-[0-9]+\.(stdout|stderr|process\.json)',name):
        number=int(name.split('-')[1].split('.')[0]);return 0<=number<=len(SOURCE)+16
    if re.fullmatch(r'git-[0-9]+\.original\.json',name):
        number=int(name.split('-')[1].split('.')[0]);return 0<=number<=len(SOURCE)+16
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
        need(len(archive.infolist())<=16384,'frontend ZIP census cap');members={};total=0;names=set();selected=[]
        for item in archive.infolist():
            need(item.orig_filename==item.filename and '\x00' not in item.orig_filename,'untruncated frontend ZIP name')
            need(not item.flag_bits&1 and item.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED),'unencrypted stored/deflated frontend ZIP')
            directory=item.is_dir();name=relative(item.filename[:-1] if directory else item.filename)
            need(name not in names,'unique frontend ZIP header path');names.add(name)
            mode=stat.S_IFMT(item.external_attr>>16)
            need(mode in ((0,stat.S_IFDIR) if directory else (0,stat.S_IFREG)),'regular frontend ZIP file/directory types')
            if directory:need(item.file_size==0,'empty frontend ZIP directory');continue
            need(0<item.file_size<=(BUILD_CAP if name=='artifact.tar' else FILE_CAP),'frontend ZIP bound before inflate')
            total+=item.file_size;need(total<=BUILD_CAP,'frontend aggregate bound');selected.append((name,item))
        # The standalone reader also closes the entire header census first.
        for name,item in selected:members[name]=archive.read(item)
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
    files = {}; total = 0; names=set(); selected=[]
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        need(len(archive.infolist()) <= 160, 'closed original artifact census')
        for item in archive.infolist():
            need(item.orig_filename==item.filename and '\x00' not in item.orig_filename,'untruncated original ZIP name')
            need(not item.flag_bits&1 and item.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED),'unencrypted stored/deflated original ZIP')
            directory=item.is_dir();name=relative(item.filename[:-1] if directory else item.filename)
            need(name not in names,'unique original ZIP header path');names.add(name)
            mode=stat.S_IFMT(item.external_attr>>16)
            need(mode in ((0,stat.S_IFDIR) if directory else (0,stat.S_IFREG)),'regular original ZIP file/directory types')
            if directory:need(item.file_size==0,'empty original ZIP directory');continue
            inner=name.removeprefix('originals/')
            need(allowed_role(inner) or name in ('controller.stdout','controller.stderr'),'fixed original role BEFORE inflate')
            cap = ARCHIVE_CAP if name.endswith('frontend.original.zip') else FILE_CAP
            need(0 <= item.file_size <= cap, 'original member size before inflate')
            total += item.file_size; need(total <= 384 << 20, 'aggregate original extent')
            selected.append((name,item))
        # A late invalid header must not allow any earlier original to inflate.
        for name,item in selected:files[name]=archive.read(item)
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


def git_envelope_v8(raw):
    """Parse one physical envelope at the unchanged original-member cap."""
    need(type(raw) is bytes and 0<len(raw)<=FILE_CAP,'bounded physical V8 Git envelope')
    def pairs(items):
        out={}
        for key,value in items:
            need(key not in out,'duplicate Git envelope JSON field');out[key]=value
        return out
    def constant(value):raise ValueError('nonfinite Git envelope number')
    def number(token):
        value=float(token);need(-float('inf')<value<float('inf'),'finite Git envelope number');return value
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=constant,parse_float=number)


def unpack_git_originals_v8(physical):
    """Authenticate physical Git envelopes, then return a separate logical view."""
    need(len(NATIVE_FONT_SOURCE)==5,'fixed Native2 Git source roster')
    shift=2*len(NATIVE_FONT_SOURCE)
    indices=list(range(len(SOURCE)+2+shift))+[len(SOURCE)+5+shift,len(SOURCE)+6+shift]
    expected={'git-'+str(index)+'.original.json' for index in indices}
    observed={name for name in physical if name.startswith('git-')}
    need(observed==expected,'exact V8 physical Git envelope roster, no loose triplets')
    logical={name:raw for name,raw in physical.items() if not name.startswith('git-')}
    decoded_total=0
    for index in indices:
        role='git-'+str(index);name=role+'.original.json'
        raw=physical[name];envelope=git_envelope_v8(raw)
        fields(envelope,'schema role complete members firstFailure secondary')
        need(encode(envelope)==raw and envelope['schema']=='bw.gui-hdd.git-triplet.v8' and
             envelope['role']==role,'canonical exact V8 Git call envelope and role')
        members=envelope['members'];fields(members,'stdout stderr process.json')
        need(type(envelope['complete']) is bool and
             envelope['complete']==all(members[k] is not None for k in members),
             'truthful complete or partial retained Git call')
        for suffix in ('stdout','stderr','process.json'):
            row=members[suffix]
            if row is None:continue
            fields(row,'byteLength sha256 base64')
            cap=JSON_CAP if suffix=='process.json' else STREAM_CAP
            integer(row['byteLength'],1 if suffix=='process.json' else 0,cap)
            digest(row['sha256'])
            encoded=row['base64']
            need(type(encoded) is str and len(encoded)<=(cap+2)//3*4,
                 'bounded raw Git member encoding')
            member=base64.b64decode(encoded,validate=True)
            need(len(member)==row['byteLength'] and sha(member)==row['sha256'] and
                 base64.b64encode(member).decode()==encoded,
                 'exact retained Git stdout/stderr/process bytes')
            if suffix=='process.json':
                need(encode(decode(member))==member,'canonical retained Git process original')
            decoded_total+=len(member)
            need(decoded_total<=384<<20,'bounded decoded logical Git aggregate')
            logical[role+'.'+suffix]=member
        secondary=envelope['secondary']
        need(type(secondary) is list and len(secondary)<=16,'bounded Git attempt secondary failures')
        if envelope['complete']:
            need(envelope['firstFailure'] is None and secondary==[],
                 'complete retained Git call has no retention failure')
        else:
            first=envelope['firstFailure']
            need(type(first) is dict,'incomplete Git call retains first failure')
            for error in (first,*secondary):
                fields(error,'phase name message')
                for key,cap in (('phase',64),('name',64),('message',256)):
                    need(type(error[key]) is str and len(error[key].encode('utf-8'))<=cap,
                         'bounded Git attempt error text')
            need(len(encode({'firstFailure':first,'secondary':secondary}))<=4096,
                 'bounded canonical Git attempt error section')
            need(False,'incomplete physical V8 Git envelope cannot grade positive')
    return logical


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
    version=8 if request['schema']=='bw.gui-hdd.actual-request.v8' else 7 if request['schema']=='bw.gui-hdd.actual-request.v7' else 6 if request['schema']=='bw.gui-hdd.actual-request.v6' else 5 if request['schema']=='bw.gui-hdd.actual-request.v5' else 4 if request['schema']=='bw.gui-hdd.actual-request.v4' else 3
    initial=len(arguments)
    if version>=6:
        for path in sorted(NATIVE_FONT_SOURCE):
            arguments.extend((['ls-tree','-z',request['source']['head'],'--',path],
                              ['cat-file','blob',request['source']['head']+':'+path]))
    arguments+=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]
    shift=10 if version>=6 else 0
    indices=list(range(initial+shift))+[len(SOURCE)+5+shift,len(SOURCE)+6+shift]
    prefix=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false',
        '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']
    expected_roles={f'git-{index}.{suffix}' for index in indices for suffix in ('stdout','stderr','process.json')}
    need({name for name in files if name.startswith('git-')}==expected_roles,'exact finite tracked Git original census')
    for position,(index,args) in enumerate(zip(indices,arguments)):
        role='git-'+str(index);process_original(files,role,prefix+args,15);raw=files[role+'.stdout']
        if args[0]=='rev-parse':need(raw.decode().strip()==request['source']['head' if args[1]=='HEAD' else 'tree'],'original Git source head/tree')
        elif args[0]=='ls-tree':
            path=args[-1];row=request['nativeSourceGit']['current']['files'][path]
            need(raw==('100644 blob '+row['gitBlob']+'\t'+path+'\0').encode(),
                 'current native Git tree mode/blob/path original')
        elif position>=initial:
            path=args[-1].split(':',1)[1];row=request['nativeSourceGit']['current']['files'][path]
            need(len(raw)==row['bytes'] and sha(raw)==row['sha256'] and
                 hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\x00'+raw).hexdigest()==row['gitBlob'],
                 'current native Git blob bytes original')
        else:
            row=request['source']['files'][sorted(SOURCE)[position-2]]
            need(len(raw)==row['byteLength'] and sha(raw)==row['sha256'],'original tracked source blob extent/hash')
    if version>=6:
        current=request['nativeSourceGit']['current']
        need(decode(files['native-source-git.before.json'])=={'schema':'bw.gui-hdd.native-source-git.v6',
             'head':current['head'],'tree':request['source']['tree'],'files':current['files']},
             'current native source Git/live file readback')


def official_joins(request, originals, expected):
    prior_inventory=expected_policy(expected)
    version=7 if request['schema']=='bw.gui-hdd.actual-request.v7' else 6 if request['schema']=='bw.gui-hdd.actual-request.v6' else 5 if request['schema']=='bw.gui-hdd.actual-request.v5' else 4 if request['schema']=='bw.gui-hdd.actual-request.v4' else 3
    need(expected.get('schema')=='bw.gui-hdd.actual-expectation.v'+str(version) if version>=4 else expected.get('schema') is None,'explicit request/reader expectation version agreement')
    if version>=5:join_actual_native_font(request,expected)
    if version>=6:
        need(sha(encode(request['nativeSourceGit']))==expected['nativeSourceGitSha256'],
             'externally selected immutable Native2/current-Git identity projection')
    if version>=4:join_actual_typed_inventory(request,prior_inventory,expected)
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
         job.get('name') == ('actual-v7' if version==7 else 'actual') and job.get('status') == 'completed' and job.get('conclusion') == 'success', 'official actual job')
    steps=job.get('steps');need(type(steps) is list and len(steps)<=64,'bounded official startup steps')
    positions=[]
    for name in STARTUP_STEPS_V7 if version==7 else STARTUP_STEPS:
        matches=[(i,item) for i,item in enumerate(steps) if item.get('name')==name]
        need(len(matches)==1 and matches[0][1].get('status')=='completed' and matches[0][1].get('conclusion')=='success','successful unique official startup/preflight/actual steps')
        positions.append(matches[0][0])
    need(positions==sorted(set(positions)),'outside startup precedes preflight and actual')
    need(artifact.get('id') == expected['artifactId'] and artifact.get('name') == expected['artifactName'] ==
         ('i80386-hdd-gui-actual-v7-' if version==7 else 'i80386-hdd-gui-')+str(expected['runId'])+'-1' and artifact.get('expired') is False and
         artifact.get('size_in_bytes') == expected['artifactBytes'] and artifact.get('workflow_run',{}).get('id') == expected['runId'] and
         artifact.get('workflow_run',{}).get('head_sha') == expected['sourceHead'] and
         artifact.get('digest') == 'sha256:'+expected['artifactSha256'], 'official original artifact join')
    event = decode(originals['event.original.json']); env = {
        'GITHUB_REPOSITORY':REPOSITORY,'GITHUB_EVENT_NAME':'pull_request','GITHUB_ACTOR':'CrispStrobe',
        'GITHUB_RUN_ID':str(expected['runId']),'GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'actual-v7' if version==7 else 'actual','BW_EXPECTED_HEAD':expected['sourceHead']}
    bind_event(originals['event.original.json'], request, expected['requestSha256'], env)
    need(event.get('sender',{}).get('login') == run.get('actor',{}).get('login') == 'CrispStrobe', 'official actor/event join')


def dispatch_platform_v8(platform, request, expected):
    """Grade the V8 result's observed runner map, captured before dispatch admission."""
    fields(platform,'schema GITHUB_REPOSITORY GITHUB_EVENT_NAME GITHUB_ACTOR GITHUB_RUN_ID '
           'GITHUB_RUN_ATTEMPT GITHUB_JOB GITHUB_REF GITHUB_REF_TYPE GITHUB_REF_NAME '
           'GITHUB_SHA GITHUB_WORKFLOW_REF GITHUB_WORKFLOW_SHA BW_EXPECTED_HEAD')
    tag=request['dispatch']
    selected={'schema':'bw.gui-hdd.actual-v8-platform.v1',
              'GITHUB_REPOSITORY':REPOSITORY,'GITHUB_EVENT_NAME':'workflow_dispatch',
              'GITHUB_ACTOR':'CrispStrobe','GITHUB_RUN_ID':str(expected['runId']),
              'GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'actual-v8',
              'GITHUB_REF':tag['tagRef'],'GITHUB_REF_TYPE':'tag',
              'GITHUB_REF_NAME':tag['tagName'],'GITHUB_SHA':request['source']['head'],
              'GITHUB_WORKFLOW_REF':REPOSITORY+'/'+tag['workflow']['path']+'@'+tag['tagRef'],
              'GITHUB_WORKFLOW_SHA':request['source']['head'],
              'BW_EXPECTED_HEAD':request['source']['head']}
    need(platform==selected,
         'exact observed V8 tag/commit/workflow/job platform original')
    return platform


def dispatch_authority_v8(originals,request,expected):
    """Join two bounded raw API readbacks to separately selected bytes."""
    proof=expected['dispatchProof'];tag=request['dispatch'];head=request['source']['head']
    for role,name in (('pullRequest','dispatch-pr.original.json'),
                      ('tagRef','dispatch-tag.original.json')):
        raw=originals[name];row=proof[role]
        need(len(raw)==row['byteLength'] and sha(raw)==row['sha256'],
             'externally reviewed retained V8 API response bytes')
    pr=decode(originals['dispatch-pr.original.json'])
    tag_response=decode(originals['dispatch-tag.original.json'])
    integer(pr.get('number'),1,2**31-1)
    need(pr['number']==request['pullRequest'] and pr.get('state')=='open' and
         pr.get('draft') is False and pr.get('head',{}).get('sha')==head and
         pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and
         pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY,
         'retained owned open ready nonfork PR source')
    marker='<!-- BW_GUI_HDD_ACTUAL_V8_REQUEST_SHA256='+expected['requestSha256']+' -->'
    body=pr.get('body')
    need(type(body) is str and body.count('<!-- BW_GUI_HDD_ACTUAL_V8_REQUEST_SHA256=')==1 and
         body.count(marker)==1,'single immutable V8 request marker in retained PR')
    need(tag_response.get('ref')==tag['tagRef'] and
         tag_response.get('object',{}).get('type')=='commit' and
         tag_response['object'].get('sha')==head,
         'retained exact lightweight selected source tag')
    return pr,tag_response


def dispatch_event_v8(raw,request,expected,platform,run):
    event=decode(raw);tag=request['dispatch'];head=request['source']['head']
    inputs=event.get('inputs')
    need(type(inputs) is dict and set(inputs)=={'pull_request','source_head','request_sha256','tag_name'} and
         inputs=={'pull_request':str(request['pullRequest']),'source_head':head,
                  'request_sha256':expected['requestSha256'],'tag_name':tag['tagName']},
         'closed exact V8 dispatch inputs')
    need(event.get('ref') in (tag['tagName'],tag['tagRef']) and
         event.get('repository',{}).get('full_name')==REPOSITORY and
         event.get('sender',{}).get('login')=='CrispStrobe' and
         type(event.get('workflow')) is str and 0<len(event['workflow'])<=512,
         'owned selected tag dispatch event')
    need(run.get('repository',{}).get('full_name')==event['repository']['full_name'] and
         platform['GITHUB_REF']==tag['tagRef'] and
         platform['GITHUB_SHA']==head,
         'raw event/runner/official repository, ref and head')
    return event


def official_joins_v8(request,originals,expected,observed_platform):
    """Distinct official dispatch admission; old PR-event readers stay historical."""
    need(request['schema']=='bw.gui-hdd.actual-request.v8' and
         expected['schema']=='bw.gui-hdd.actual-expectation.v8',
         'distinct V8 request and externally selected expectation')
    prior_inventory=expected_policy(expected)
    join_actual_native_font(request,expected)
    need(sha(encode(request['nativeSourceGit']))==expected['nativeSourceGitSha256'],
         'externally selected Native2/current Git projection')
    join_actual_typed_inventory(request,prior_inventory,expected)
    need(sha(encode(request['build']['sourceAdmission']))==expected['buildSourceAdmissionSha256'],
         'separately admitted exact Build source original')
    need(expected['sourceHead']==request['source']['head'],
         'external V8 source head equals request and exact Build head')
    run,job,artifact=expected['run'],expected['job'],expected['artifact']
    typed_metadata(run,job,artifact)
    need(run.get('id')==expected['runId'] and run.get('run_attempt')==1 and
         run.get('status')=='completed' and run.get('conclusion')=='success' and
         run.get('event')=='workflow_dispatch' and
         run.get('head_sha')==expected['sourceHead'] and
         run.get('path')==request['dispatch']['workflow']['path'] and
         run.get('repository',{}).get('full_name')==REPOSITORY and
         run.get('actor',{}).get('login')=='CrispStrobe',
         'independently admitted first-attempt owned V8 dispatch run')
    need(job.get('id')==expected['jobId'] and job.get('run_id')==expected['runId'] and
         job.get('name')=='actual-v8' and job.get('status')=='completed' and
         job.get('conclusion')=='success','official exact V8 selected job')
    steps=job.get('steps');need(type(steps) is list and len(steps)<=64,
                                'bounded official V8 steps')
    positions=[]
    for name in STARTUP_STEPS_V8:
        matches=[(i,item) for i,item in enumerate(steps) if item.get('name')==name]
        need(len(matches)==1 and matches[0][1].get('status')=='completed' and
             matches[0][1].get('conclusion')=='success',
             'unique successful official V8 startup/preflight/actual step')
        positions.append(matches[0][0])
    need(positions==sorted(set(positions)),'ordered V8 startup/preflight/actual')
    need(artifact.get('id')==expected['artifactId'] and
         artifact.get('name')==expected['artifactName']==
         'i80386-hdd-gui-actual-v8-'+str(expected['runId'])+'-1' and
         artifact.get('expired') is False and
         artifact.get('size_in_bytes')==expected['artifactBytes'] and
         artifact.get('digest')=='sha256:'+expected['artifactSha256'] and
         artifact.get('workflow_run',{}).get('id')==expected['runId'] and
         artifact.get('workflow_run',{}).get('head_sha')==expected['sourceHead'],
         'sole selected original V8 artifact identity')
    platform=dispatch_platform_v8(observed_platform,request,expected)
    dispatch_authority_v8(originals,request,expected)
    dispatch_event_v8(originals['event.original.json'],request,expected,platform,run)


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


def verify_gui_font_stage(files,request,checkout,expected):
    reference=request['nativeFontAdmission'];stage,config=native_font_layout(reference)
    need(stage==Path(checkout)/'gui-inputs/native-font','font stage bound to actual current checkout')
    value=decode(files['native-font.stage.json']);fields(value,'schema requestSha256 referenceSha256 source eventSha256 platform root files fontUrl licenseUrl cache')
    need(value['schema']=='bw.gui-hdd.native-font-stage.v1' and value['requestSha256']==expected['requestSha256'] and
         value['referenceSha256']==expected['nativeFontReferenceSha256'] and value['source']==request['source'] and
         value['root']==str(stage) and value['fontUrl']==reference['font']['url'] and value['licenseUrl']==reference['font']['licenseUrl'],
         'current staged font source/request/URL identity')
    need(value['eventSha256']==sha(files['event.original.json']) and value['platform']=={'GITHUB_RUN_ID':str(expected['runId']),'GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'actual-v8' if request['schema']=='bw.gui-hdd.actual-request.v8' else 'actual-v7' if request['schema']=='bw.gui-hdd.actual-request.v7' else 'actual','GITHUB_REPOSITORY':REPOSITORY},'staged font current producing event/job')
    directory_roster={str(stage):sorted(('fonts','cache','NOTICE','fontconfig.xml','staging.original.json')),str(stage/'fonts'):['selected.ttf']}
    before_dirs=decode(files['runtime.before.json'])['nativeFontDirectories'];after_dirs=decode(files['runtime.after.json'])['nativeFontDirectories']
    need(encode(before_dirs)==encode(after_dirs) and type(before_dirs) is dict and set(before_dirs)==set(directory_roster),'owned font directory before/after identity')
    for path,row in before_dirs.items():
        fields(row,'identity names');need(row['names']==directory_roster[path],'closed owned font directory census')
        info=row['identity'];fields(info,'dev ino mode uid gid nlink size mtime_ns')
        for key in info:integer(info[key],0,2**63-1)
        need(info['ino']>0 and info['mode']==stat.S_IFDIR|0o555,'readonly owned font directory type')
    need(files['native-font.config.original.xml']==config,'standalone expected owned fontconfig semantic template')
    paths={reference['font']['path'],reference['font']['licensePath'],str(stage/'fontconfig.xml')}
    need(type(value['files']) is dict and set(value['files'])==paths,'closed font/notice/config staged roster')
    for path,row in value['files'].items():
        fields(row,'byteLength sha256 identity');need({key:row[key] for key in ('byteLength','sha256')}==request['runtime']['files'][path],'staged input/runtime file join')
        info=row['identity'];fields(info,'dev ino mode uid gid nlink size mtime_ns')
        for key in info:integer(info[key],0,2**63-1)
        need(info['ino']>0 and info['nlink']==1 and info['size']==row['byteLength'] and info['mode']==stat.S_IFREG|0o444,'exclusive readonly staged file identity')
        for phase in ('before','after'):
            need(decode(files['runtime.'+phase+'.json'])['identities'].get(path)=={'dev':info['dev'],'ino':info['ino']},'actual staged file inode before/after readback')
    acquisitions=[]
    for role,url,row,seconds in (
      ('native-font.font',reference['font']['url'],reference['files'][reference['font']['path']],30),
      ('native-font.notice',reference['font']['licenseUrl'],reference['files'][reference['font']['licensePath']],15)):
        child=process_original(files,role,native_font_fetch_argv(url,seconds,row['byteLength']),seconds);acquisitions.append(child)
        need({'byteLength':len(files[role+'.stdout']),'sha256':sha(files[role+'.stdout'])}==row,'one staged immutable font/notice body')
        need(child['environment']=={'LANG':'C.UTF-8','HOME':'/nonexistent','PATH':'/usr/bin:/bin',
             'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_NO_LAZY_FETCH':'1','GIT_TERMINAL_PROMPT':'0'},'closed font acquisition environment')
    first_browser=decode(files[SCENARIOS[0]+'.process.json'])
    need(acquisitions[0]['endedNs']<=acquisitions[1]['startedNs'] and acquisitions[1]['endedNs']<first_browser['startedNs'],'font inputs acquired serially before browser')
    def cache(row):
        fields(row,'path identity entries totalBytes byteCap entryCap quotaEnforced')
        need(row['path']==str(stage/'cache') and type(row['entries']) is dict and len(row['entries'])<=128 and
             type(row['byteCap']) is int and row['byteCap']==8<<20 and type(row['entryCap']) is int and row['entryCap']==128 and
             row['quotaEnforced'] is False,'owned bounded cache census; no quota claim')
        info=row['identity'];fields(info,'dev ino mode uid gid nlink size mtime_ns')
        for key in info:integer(info[key],0,2**63-1)
        need(info['ino']>0 and info['mode']==stat.S_IFDIR|0o700,'owned writable cache directory')
        total=0
        for path,item in row['entries'].items():
            relative(path);need(len(PurePosixPath(path).parts)<=5,'cache depth bound')
            need(type(item) is dict and item.get('kind') in ('directory','file'),'typed cache entry')
            fields(item,'kind identity'+(' byteLength sha256' if item['kind']=='file' else ''))
            selected=item['identity'];fields(selected,'dev ino mode uid gid nlink size mtime_ns')
            for key in selected:integer(selected[key],0,2**63-1)
            need(selected['uid']==info['uid'] and selected['ino']>0 and not selected['mode']&0o022,'owned cache entry identity')
            if item['kind']=='file':
                integer(item['byteLength'],0,8<<20);digest(item['sha256']);total+=item['byteLength']
                need(stat.S_ISREG(selected['mode']) and selected['size']==item['byteLength'] and selected['nlink']==1,'regular bounded cache file')
            else:need(stat.S_ISDIR(selected['mode']),'cache directory type')
        integer(row['totalBytes'],0,8<<20);need(total==row['totalBytes'],'font cache aggregate posthoc extent')
        return row
    original=cache(value['cache']);before=cache(decode(files['native-font.cache.before.json']));after=cache(decode(files['native-font.cache.after.json']))
    need(original['entries']==before['entries']=={} and original['totalBytes']==before['totalBytes']==0,'font cache fresh and empty before scenarios')
    for key in ('dev','ino','uid','gid','mode'):
        need(original['identity'][key]==before['identity'][key]==after['identity'][key],'retained owned cache root identity')
    need('native-font.cache.partial.json' not in files,'positive packet has no partial cache failure')


def audit(files, expected):
    expected_policy(expected);request = parse_request(files['request.original.json'], expected['requestSha256'])
    version=request['schema']
    if version=='bw.gui-hdd.actual-request.v8':
        result=decode(files['result.json'])
        official_joins_v8(request,files,expected,result.get('dispatchPlatform'))
    else:official_joins(request,files,expected)
    dispatch_roles={'dispatch-pr.original.json','dispatch-tag.original.json'}
    need((dispatch_roles <= set(files)) if version=='bw.gui-hdd.actual-request.v8' else
         not (dispatch_roles & set(files)),'distinct retained V8 dispatch authority roles')
    need('dispatch-platform.original.json' not in files,'V8 platform is retained inside distinct result schema')
    tracked_source_originals(unpack_git_originals_v8(files) if version=='bw.gui-hdd.actual-request.v8' else files,request)
    if version not in ('bw.gui-hdd.actual-request.v5','bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8'):need(not any(name.startswith('native-font.') for name in files),'historical native original roles remain closed')
    if version not in ('bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8'):need('native-source-git.before.json' not in files,'historical native Git original role remains closed')
    role_policy(set(files));need(not any('failure' in name or name=='frontend.partial.zip' for name in files),'no hidden failed original in positive packet')
    if version!='bw.gui-hdd.actual-request.v8':result=decode(files['result.json'])
    fields(result,'schema pass requestSha256 scenarios firstFailure secondary'+
           (' dispatchPlatform' if version=='bw.gui-hdd.actual-request.v8' else ''))
    need(result['schema'] == ('bw.gui-hdd.result.v8' if version=='bw.gui-hdd.actual-request.v8' else 'bw.gui-hdd.result.v7' if version=='bw.gui-hdd.actual-request.v7' else 'bw.gui-hdd.result.v1') and result['pass'] is True and result['firstFailure'] is None and
         result['secondary'] == [] and result['requestSha256'] == expected['requestSha256'] and
         result['scenarios'] == list(SCENARIOS), 'authoritative terminal attempt result')
    for stage in ('before','after'):
        need(encode(decode(files['source.'+stage+'.json'])) == encode(request['source']), 'source original external expectation')
        need(encode(decode(files['installed.'+stage+'.json'])) == encode(request['installedFiles']), 'installed graph original external expectation')
        runtime = decode(files['runtime.'+stage+'.json']);need(runtime['files'] == request['runtime']['files'] and
             runtime['aliases'] == request['runtime']['aliases'] and runtime['directoryAliases']==request['runtime']['directoryAliases'] and runtime['resources'] == request['runtime']['resources'] and
             runtime['aggregateContainmentQualified'] is False, 'runtime external graph/caps and honest containment boundary')
        if version in ('bw.gui-hdd.actual-request.v4','bw.gui-hdd.actual-request.v5','bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8'):
            fields(runtime,'schema files aliases directoryAliases directoryIdentities identities resources availableCpus rlimits aggregateContainmentQualified emptyPythonSources'+(' nativeFontDirectories' if version in ('bw.gui-hdd.actual-request.v5','bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8') else ''))
            for role in ('files','aliases','directoryAliases','resources'):
                need(encode(runtime[role])==encode(request['runtime'][role]),'strict actual v4 runtime external graph/cap types')
            cpus=runtime['availableCpus'];need(type(cpus) is list and cpus,'observed nonempty CPU affinity list')
            for cpu in cpus:integer(cpu,0,2**31-1)
            need(cpus==sorted(set(cpus)),'observed sorted unique CPU affinity')
            fields(runtime['rlimits'],'1 4 7')  # Existing Linux FSIZE, CORE and NOFILE observations only.
            for pair in runtime['rlimits'].values():
                need(type(pair) is list and len(pair)==2,'observed rlimit pair')
                for limit in pair:integer(limit,-1,2**64-1)
            need(runtime.get('schema')==('bw.gui-hdd.runtime-observation.v5' if version in ('bw.gui-hdd.actual-request.v5','bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8') else 'bw.gui-hdd.runtime-observation.v4'),'explicit typed actual runtime observation version')
            selected=runtime.get('emptyPythonSources');need(type(selected) is dict and set(selected)==set(request['runtime']['emptyPythonSources']),'runtime typed roster joins independent actual request')
            for row in selected.values():
                fields(row,'attempted status source');need(row['attempted'] is True and row['status']=='observed','actual typed source observed')
                verify_empty_python_source(row['source'])
        targets={row['target'] for row in request['runtime']['directoryAliases'].values()}
        need(type(runtime.get('directoryIdentities')) is dict and set(runtime['directoryIdentities'])==targets,'exact observed directory target census')
        for target,row in runtime['directoryIdentities'].items():
            fields(row,'dev ino mode');integer(row['dev'],0,2**63-1);integer(row['ino'],1,2**63-1);integer(row['mode'],0,2**32-1)
            need(stat.S_ISDIR(row['mode']),'observed selected directory target is directory')
    if version in ('bw.gui-hdd.actual-request.v4','bw.gui-hdd.actual-request.v5','bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8'):
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
    for stage in ('before','after'):validate_startup(decode(files['python-startup.'+stage+'.json']),installed,
         'actual-v8' if version=='bw.gui-hdd.actual-request.v8' else 'actual-v7' if version=='bw.gui-hdd.actual-request.v7' else 'actual',startup_arguments)
    need(files['python-startup.before.json']==files['python-startup.after.json'],'unchanged startup observations across both scenarios')
    if version in ('bw.gui-hdd.actual-request.v5','bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8'):verify_gui_font_stage(files,request,checkout,expected)
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
        if version in ('bw.gui-hdd.actual-request.v5','bw.gui-hdd.actual-request.v6','bw.gui-hdd.actual-request.v7','bw.gui-hdd.actual-request.v8'):
            stage,_=native_font_layout(request['nativeFontAdmission'])
            need(env.get('FONTCONFIG_FILE')==str(stage/'fontconfig.xml') and env.get('XDG_CACHE_HOME')==str(stage/'cache'),'selected staged fontconfig and owned cache reach actual browser parent')
        launch=decode(files[scenario+'/browser-launch.json']);need(launch['executablePath']==request['runtime']['chromium'] and
             launch['sha256']==env['PROOF_BROWSER_SHA256'] and launch['byteLength']==request['runtime']['files'][request['runtime']['chromium']]['byteLength'],
             'admitted browser launch executable witness')
        identity_before=decode(files['runtime.before.json'])['identities'][request['runtime']['chromium']]
        need(any(item.get('executable')==request['runtime']['chromium'] and item.get('executableIdentity')==identity_before
             for sample in child['descendantSamples'] for item in sample['descendants']), 'actual observed browser process executable identity')
    return {'pass':True,'schema':'bw.gui-hdd.reader.v'+('8' if version=='bw.gui-hdd.actual-request.v8' else '7' if version=='bw.gui-hdd.actual-request.v7' else '6' if version=='bw.gui-hdd.actual-request.v6' else '5' if version=='bw.gui-hdd.actual-request.v5' else '4' if version=='bw.gui-hdd.actual-request.v4' else '3'),'sourceHead':request['source']['head'],
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
    fields(expected,'schema source template failure runId workflowSha'+(' repositoryVariables' if expected.get('schema')=='bw.gui-hdd.inventory-failure-expectation.v6' else ''))
    need(expected['schema'] in ('bw.gui-hdd.inventory-failure-expectation.v2','bw.gui-hdd.inventory-failure-expectation.v3','bw.gui-hdd.inventory-failure-expectation.v4','bw.gui-hdd.inventory-failure-expectation.v5','bw.gui-hdd.inventory-failure-expectation.v6'),'explicit externally selected failure audit policy')
    integer(expected['runId'],1,2**63-1);digest(expected['workflowSha'],40)
    source=expected['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files']);need(set(source['files'])==SOURCE,'separately selected source21')
    for name in ('template','failure'):
        fields(expected[name],'byteLength sha256');integer(expected[name]['byteLength'],1,JSON_CAP);digest(expected[name]['sha256'])
    if expected['schema']=='bw.gui-hdd.inventory-failure-expectation.v6':
        finite_v6_variables(expected['repositoryVariables'],expected['template']['sha256'])


def finite_v6_variables(selected,expected):
    fields(selected,'BW_FINITE_INVENTORY_V6_SHA256 BW_FINITE_INVENTORY_V6_TEMPLATE_B64')
    need(selected['BW_FINITE_INVENTORY_V6_SHA256']==expected,'externally selected finite v6 SHA variable')
    encoded=selected['BW_FINITE_INVENTORY_V6_TEMPLATE_B64']
    need(type(encoded) is str and encoded.isascii() and
         0<len(encoded)<=4*((FINITE_INVENTORY_TEMPLATE_CAP+2)//3),
         'bounded finite v6 Base64 variable')
    raw=base64.b64decode(encoded,validate=True)
    need(base64.b64encode(raw).decode()==encoded and sha(raw)==expected,
         'canonical externally selected finite v6 template variable')
    finite_v6_template(raw,expected)
    return raw


def verify_inventory_failure(failure_raw,template_raw,expected):
    """Audit a retained failed observation; never runtime or official approval.

    The caller independently selects these original extents/digests and source,
    run and workflow facts after official artifact metadata admission.
    """
    inventory_failure_expected(expected)
    for raw,name in ((failure_raw,'failure'),(template_raw,'template')):
        need(type(raw) is bytes and len(raw)==expected[name]['byteLength'] and sha(raw)==expected[name]['sha256'],'independently selected '+name+' original')
    version=6 if expected['schema']=='bw.gui-hdd.inventory-failure-expectation.v6' else 5 if expected['schema']=='bw.gui-hdd.inventory-failure-expectation.v5' else 4 if expected['schema']=='bw.gui-hdd.inventory-failure-expectation.v4' else 3 if expected['schema']=='bw.gui-hdd.inventory-failure-expectation.v3' else 2
    template=decode(template_raw);fields(template,'schema sourceHead files aliases directoryAliases node python chromium tools'+(' emptyPythonSources' if version>=3 else '')+(' libraries scope' if version>=4 else ''))
    need(encode(template)==template_raw and template['schema']=='bw.gui-hdd.inventory-template.v'+str(version) and template['sourceHead']==expected['source']['head'],'retained canonical template/source binding')
    for role,cap in (('files',512),('aliases',256),('directoryAliases',256)):
        roster=template[role];need(type(roster) is list and len(roster)<=cap and len(set(roster))==len(roster),'bounded unique selected failure roster')
        for path in roster:runtime_path(path)
    need(template['files'] and len(template['aliases'])+len(template['directoryAliases'])<=256 and
         len(set(template['files']+template['aliases']+template['directoryAliases']))==sum(len(template[k]) for k in ('files','aliases','directoryAliases')),'disjoint complete selected failure roles')
    if version>=3:empty_python_policy(template['emptyPythonSources'],template['files'],template['aliases'],template['directoryAliases'])
    if version==4:finite_inventory_template(template_raw,expected['template']['sha256'])
    if version==5:finite_v5_template(template_raw,expected['template']['sha256'])
    if version==6:finite_v6_template(template_raw,expected['template']['sha256'])
    if version==6:need(finite_v6_variables(expected['repositoryVariables'],expected['template']['sha256'])==template_raw,'finite v6 selected repository template matches original')
    value=decode(failure_raw);fields(value,'schema observationOnly candidate qualified template event platform diagnostic files aliases directoryAliases gitSource firstFailure secondary'+(' emptyPythonSources' if version>=3 else '')+(' scope fontSelectionProved browserFontSelectionProved guestApproved' if version>=4 else '')+(' installedProgress' if version in (5,6) else ''))
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
    if version==4:need(bind_finite_inventory_event(event_raw,expected['source']['head'],expected['template']['sha256'],platform)==template_raw,'finite failure event/template join')
    elif version==5:need(bind_finite_v5_event(event_raw,expected['source']['head'],expected['template']['sha256'],platform)==template_raw,'finite v5 failure event/template join')
    elif version==6:need(bind_finite_v6_event(event_raw,expected['source']['head'],expected['template']['sha256'],dict(platform,**expected['repositoryVariables']))==template_raw,'finite v6 failure event/template join')
    else:bind_inventory_event(event_raw,expected['source']['head'],expected['template']['sha256'],platform)
    pr=decode(event_raw)['pull_request']
    need(platform['GITHUB_WORKFLOW_REF']==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(pr['number'])+'/merge','raw event/executing workflow ref join')
    diagnostic=value['diagnostic'];fields(diagnostic,'pathBytes limitBytes complete');integer(diagnostic['pathBytes'],0,JSON_CAP);integer(diagnostic['limitBytes'],1,JSON_CAP)
    need(diagnostic['complete'] is True and diagnostic['pathBytes']<=diagnostic['limitBytes'],'complete bounded failure path observations, no hidden truncation')
    frame=decode(encode(value));frame.update(files={},aliases={},directoryAliases={},firstFailure=None,secondary=[],gitSource={'reached':False,'head':None,'tree':None,'files':{}},diagnostic={'pathBytes':0,'limitBytes':0,'complete':False})
    if version>=3:frame['emptyPythonSources']={}
    if version in (5,6):frame['installedProgress']={'package':None,'path':None,'file':None,'completedPrefixes':[],
      'entryStat':None,'completedRows':0,'totalBytes':0}
    need(diagnostic['limitBytes']==JSON_CAP-len(encode(frame))-8192,'independent event/frame reservation before path diagnostic budget')
    errors=[];counts={};path_cost=0
    roles=('files','emptyPythonSources','aliases','directoryAliases') if version>=3 else ('files','aliases','directoryAliases')
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
    if version==4:
        need(encode(value['scope'])==encode(finite_inventory_scope()) and all(value[key] is False for key in ('fontSelectionProved','browserFontSelectionProved','guestApproved')),'finite failure grants no font/browser/guest authority')
    if version in (5,6):
        need(encode(value['scope'])==encode(finite_v5_scope()) and all(value[key] is False for key in
             ('fontSelectionProved','browserFontSelectionProved','guestApproved')),
             'finite v5 failure grants no font/browser/guest authority')
        installed_progress_v5(value['installedProgress'])
    need(type(value['secondary']) is list and len(value['secondary'])<=770,'bounded secondary failure observations')
    all_errors=[value['firstFailure']]+value['secondary']
    for error in all_errors:
        need(type(error) is dict and {'phase','name','message'}<=set(error)<=set('phase name message path'.split()),'closed retained error observation')
        for name,cap in (('phase',128),('name',128),('message',1024)):need(type(error[name]) is str and error[name].isascii() and len(error[name])<=cap,'capped error fact')
        if 'path' in error:
            (relative if version in (5,6) and error['phase'].startswith('inventory-installed') else runtime_path)(error['path'])
    if version>=3:
        path_errors=[error for error in all_errors if error['phase'] in ('inventory-file','inventory-empty-python-source','inventory-alias')]
        need(path_errors==errors and (not errors or all_errors[0]==errors[0]),'typed first path refusal and ordered secondary observations preserved')
    else:need(all_errors[:len(errors)]==errors,'first selected-path error and ordered secondary observations preserved')
    source=value['gitSource'];fields(source,'reached head tree files');need(type(source['reached']) is bool and type(source['files']) is dict,'explicit unavailable/partial source observation')
    if not source['reached']:need(source=={'reached':False,'head':None,'tree':None,'files':{}},'source not invented before held Git gate')
    else:
        for name in ('head','tree'):need(source[name] is None or source[name]==expected['source'][name],'reported source identity joins external selection')
        need(set(source['files'])<=SOURCE and all(row==expected['source']['files'][path] for path,row in source['files'].items()),'reported partial source file identities')
    if version in (5,6):
        progress=value['installedProgress']
        installed_errors=[row for row in all_errors if row['phase']=='inventory-installed']
        need(not installed_errors or (source['reached'] is True and
             installed_errors[0].get('path')==progress['path'] and
             progress['package'] is not None),
             'finite v5 first installed error binds attempted package/path')
    return {'schema':'bw.gui-hdd.inventory-failure-reader.v'+str(version),'failureObserved':True,'eventJoined':True,'candidate':False,'qualified':False,
      'templateSha256':expected['template']['sha256'],'sourceHead':expected['source']['head'],'runId':expected['runId'],'counts':counts,
      'gitSourceReached':source['reached'],'firstFailure':value['firstFailure']}


def inventory_admission_expected(expected):
    fields(expected,'schema source template original runId workflowSha'+(' repositoryVariables' if expected.get('schema')=='bw.gui-hdd.inventory-admission.v6' else ''))
    version=6 if expected['schema']=='bw.gui-hdd.inventory-admission.v6' else 5 if expected['schema']=='bw.gui-hdd.inventory-admission.v5' else 4 if expected['schema']=='bw.gui-hdd.inventory-admission.v4' else 3
    need(expected['schema']=='bw.gui-hdd.inventory-admission.v'+str(version),'versioned external metadata admission; no actual authority')
    inventory_failure_expected({'schema':'bw.gui-hdd.inventory-failure-expectation.v'+str(version),'source':expected['source'],
      'template':expected['template'],'failure':expected['original'],'runId':expected['runId'],'workflowSha':expected['workflowSha'],
      **({'repositoryVariables':expected['repositoryVariables']} if version==6 else {})})


def verify_inventory_original(original_raw,template_raw,expected):
    """Validate externally pinned metadata only, never create approval or actual input."""
    inventory_admission_expected(expected);version=6 if expected['schema']=='bw.gui-hdd.inventory-admission.v6' else 5 if expected['schema']=='bw.gui-hdd.inventory-admission.v5' else 4 if expected['schema']=='bw.gui-hdd.inventory-admission.v4' else 3
    for raw,name in ((original_raw,'original'),(template_raw,'template')):
        need(type(raw) is bytes and len(raw)==expected[name]['byteLength'] and sha(raw)==expected[name]['sha256'],'independently selected '+name+' original')
    template=decode(template_raw);fields(template,'schema sourceHead files aliases directoryAliases node python chromium tools emptyPythonSources'+(' libraries scope' if version>=4 else ''))
    need(encode(template)==template_raw and template['schema']=='bw.gui-hdd.inventory-template.v'+str(version) and template['sourceHead']==expected['source']['head'],'explicit canonical metadata template v3')
    if version==4:finite_inventory_template(template_raw,expected['template']['sha256'])
    if version==5:finite_v5_template(template_raw,expected['template']['sha256'])
    if version==6:finite_v6_template(template_raw,expected['template']['sha256'])
    if version==6:need(finite_v6_variables(expected['repositoryVariables'],expected['template']['sha256'])==template_raw,'finite v6 selected repository template matches original')
    for role,cap in (('files',512),('aliases',256),('directoryAliases',256)):
        roster=template[role];need(type(roster) is list and len(roster)<=cap and len(set(roster))==len(roster),'bounded selected metadata roster')
        for path in roster:runtime_path(path)
    need(template['files'] and len(template['aliases'])+len(template['directoryAliases'])<=256 and
         len(set(template['files']+template['aliases']+template['directoryAliases']))==sum(len(template[k]) for k in ('files','aliases','directoryAliases')),'disjoint metadata role roster')
    empty_python_policy(template['emptyPythonSources'],template['files'],template['aliases'],template['directoryAliases'])
    value=decode(original_raw);fields(value,'schema observationOnly templateSha256 source installedFiles runtime event commands platform emptyPythonSources'+(' scope libraries guardAdmission fontSelectionProved browserFontSelectionProved guestApproved' if version>=4 else ''))
    need(encode(value)==original_raw and value['schema']=='bw.gui-hdd.inventory-original.v'+str(version) and value['observationOnly'] is True and
         value['templateSha256']==expected['template']['sha256'] and encode(value['source'])==encode(expected['source']),'externally selected canonical metadata/source original')
    if version==4:
        need(encode(value['scope'])==encode(finite_inventory_scope()) and value['libraries']==template['libraries'] and
             all(value[key] is False for key in ('fontSelectionProved','browserFontSelectionProved','guestApproved')),'finite original grants no font/browser/guest authority')
    if version in (5,6):
        need(encode(value['scope'])==encode(finite_v5_scope()) and value['libraries']==template['libraries'] and
             all(value[key] is False for key in ('fontSelectionProved','browserFontSelectionProved','guestApproved')),
             'finite v5 original grants no font/browser/guest authority')
    runtime=value['runtime'];fields(runtime,'files aliases directoryAliases node python chromium tools resources')
    for role in ('files','aliases','directoryAliases'):need(type(runtime[role]) is dict and set(runtime[role])==set(template[role]),'positive runtime roster joins selected template')
    for path,row in runtime['files'].items():
        fields(row,'byteLength sha256');integer(row['byteLength'],1,256<<20);digest(row['sha256'])
    runtime_alias_policy(runtime)
    if version>=4:
        for role in ('aliases','directoryAliases'):
            for row in runtime[role].values():finite_inventory_path(row['target'])
    for key in ('node','python','chromium'):need(runtime[key]==template[key] and runtime[key] in runtime['files'],'positive selected executable')
    need(runtime['files'][runtime['node']]=={'byteLength':124827920,'sha256':'fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48'},'held independently admitted Node identity')
    need(runtime['tools']==template['tools']=={'git':'/usr/bin/git','gh':'/usr/bin/gh'} and all(path in runtime['files'] for path in runtime['tools'].values()),'held positive bootstrap tool closure')
    need(encode(runtime['resources'])==encode({'jobMinutes':35,'controllerSeconds':1800,'scenarioSeconds':{'freedos-hdd-persistence':1250,'forward-debug':180},
      'perProcessCoreBytes':0,'perProcessFileBytes':FILE_CAP,'perProcessOpenFiles':256,'aggregateContainmentQualified':False}),'held finite metadata envelope')
    selected=value['emptyPythonSources'];need(type(selected) is dict and set(selected)==set(template['emptyPythonSources']),'exact typed source observation roster')
    for row in selected.values():
        fields(row,'attempted status source');need(row['attempted'] is True and row['status']=='observed','typed source actually observed')
        verify_empty_python_source(row['source'])
    installed_rows_v5(value['installedFiles'],INSTALLED_V6_CRITICAL if version==6 else INSTALLED_V5_CRITICAL) if version in (5,6) else rows(value['installedFiles'])
    if version==4:need(all(prefix+'/package.json' in value['installedFiles'] for prefix in ('node_modules/bw-board','node_modules/bw-circuit-ui','node_modules/playwright','node_modules/playwright-core')),'finite original includes complete selected supplier/browser/CUI census')
    event=value['event'];fields(event,'byteLength sha256 base64');integer(event['byteLength'],1,JSON_CAP);digest(event['sha256'])
    need(type(event['base64']) is str and len(event['base64'])==4*((event['byteLength']+2)//3),'bounded exact event original')
    raw=base64.b64decode(event['base64'],validate=True)
    need(len(raw)==event['byteLength'] and sha(raw)==event['sha256'] and base64.b64encode(raw).decode()==event['base64'],'raw metadata event identity')
    platform=value['platform'];fields(platform,'GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB GITHUB_REPOSITORY GITHUB_WORKFLOW_SHA GITHUB_WORKFLOW_REF GITHUB_EVENT_NAME GITHUB_ACTOR BW_EXPECTED_HEAD')
    need(platform['GITHUB_RUN_ID']==str(expected['runId']) and platform['GITHUB_WORKFLOW_SHA']==expected['workflowSha'],'external metadata run/workflow join')
    if version==4:
        need(bind_finite_inventory_event(raw,expected['source']['head'],expected['template']['sha256'],platform)==template_raw,'finite original immutable body/template identity')
        guard_raw=expected_embedded_original(value['guardAdmission']);guard=finite_inventory_guard_original(guard_raw,template_raw,raw,platform)
        need(encode(guard['source'])==encode(expected['source']),'finite pre/post-setup exact source closure')
    elif version==5:
        need(bind_finite_v5_event(raw,expected['source']['head'],expected['template']['sha256'],platform)==template_raw,
             'finite v5 original immutable body/template identity')
        guard_raw=expected_embedded_original(value['guardAdmission'])
        guard=finite_v5_guard_original(guard_raw,template_raw,raw,platform)
        need(encode(guard['source'])==encode(expected['source']),
             'finite v5 pre/post-setup exact source closure')
    elif version==6:
        need(bind_finite_v6_event(raw,expected['source']['head'],expected['template']['sha256'],dict(platform,**expected['repositoryVariables']))==template_raw,
             'finite v6 original immutable body/template identity')
        guard_raw=expected_embedded_original(value['guardAdmission'])
        guard=finite_v6_guard_original(guard_raw,template_raw,raw,platform)
        need(encode(guard['source'])==encode(expected['source']),
             'finite v6 pre/post-setup exact source closure')
    else:bind_inventory_event(raw,expected['source']['head'],expected['template']['sha256'],platform)
    need(platform['GITHUB_WORKFLOW_REF']==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(decode(raw)['pull_request']['number'])+'/merge','metadata event/workflow ref join')
    commands=value['commands'];need(type(commands) is list and len(commands)==2+len(SOURCE),'finite read-only source command observations')
    arguments=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]+[['cat-file','blob',expected['source']['head']+':'+path] for path in sorted(SOURCE)]
    outputs=[{'byteLength':41,'sha256':sha((expected['source'][key]+'\n').encode())} for key in ('head','tree')]+[expected['source']['files'][path] for path in sorted(SOURCE)]
    prefix=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']
    for command,args,out in zip(commands,arguments,outputs):
        fields(command,'argv stdout stderr exitCode')
        need(command['argv']==prefix+args and type(command['exitCode']) is int and command['exitCode']==0 and command['stdout']==out and
             command['stderr']=={'byteLength':0,'sha256':EMPTY_PYTHON_SHA256},'fixed successful source command output observations')
    return {'schema':'bw.gui-hdd.inventory-reader.v'+str(version),'observationOnly':True,'candidate':False,'qualified':False,
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



# A deliberately separate passive route. No discovery/delivery v1 is reinterpreted.
FONT_CHAIN_HOPS = 8
FONT_CHAIN_ROOTS = ('/usr/share/fonts/','/usr/local/share/fonts/')


def font_chain_request(raw,expected):
    digest(expected);need(sha(raw)==expected,'selected chain request digest')
    value=decode(raw);fields(value,'schema source baseline entry')
    need(encode(value)==raw and value['schema']=='bw.gui-hdd.font-chain-request.v1','explicit canonical chain request version')
    legacy={key:value[key] for key in ('source','baseline')};legacy['schema']='bw.gui-hdd.font-discovery-request.v1'
    font_request(encode(legacy),sha(encode(legacy)))
    runtime_path(value['entry']);need(value['entry'].startswith(FONT_CHAIN_ROOTS),'selected original font-root entry')
    return value


def font_chain_next(path,text):
    import posixpath
    need(type(text) is str and 0<len(text)<=512 and re.fullmatch('[A-Za-z0-9_./@+-]+',text),'bounded literal chain link')
    need(not text.startswith('//') and all(part not in ('','.','..') for part in text.lstrip('/').split('/')),'no unobserved lexical traversal components')
    target=posixpath.normpath(text if text.startswith('/') else posixpath.dirname(path)+'/'+text)
    runtime_path(target)
    need(target.startswith(FONT_CHAIN_ROOTS) or target.startswith('/etc/alternatives/'),'finite font or alternatives bridge')
    need(not target.startswith('/etc/alternatives/') or target.count('/')==3,'single alternatives child')
    return target

def font_chain_event(raw,request_sha,head,env):
    event=decode(raw);pr=event.get('pull_request',{})
    need(event.get('action')=='labeled' and event.get('label',{}).get('name')=='x86-hdd-gui-font-chain' and
         event.get('sender',{}).get('login')=='CrispStrobe' and event.get('repository',{}).get('full_name')==REPOSITORY,'owned discovery event')
    integer(event.get('number'),1,2**31-1)
    need(type(pr.get('number')) is int and event['number']==pr['number'] and pr.get('state')=='open' and
         pr.get('head',{}).get('sha')==head and pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY,'exact own discovery source event')
    marker='<!-- BW_GUI_HDD_FONT_CHAIN_SHA256='+request_sha+' -->'
    need(type(pr.get('body')) is str and pr['body'].count('<!-- BW_GUI_HDD_FONT_CHAIN_SHA256=')==1 and pr['body'].count(marker)==1,'event transports selected discovery pin only')
    need(env.get('GITHUB_REPOSITORY')==REPOSITORY and env.get('GITHUB_EVENT_NAME')=='pull_request' and env.get('GITHUB_ACTOR')=='CrispStrobe' and
         env.get('GITHUB_RUN_ATTEMPT')=='1' and env.get('GITHUB_JOB')=='font-chain' and re.fullmatch('[1-9][0-9]{0,19}',env.get('GITHUB_RUN_ID','')) and
         env.get('BW_EXPECTED_HEAD')==head,'first discovery platform observations')
    digest(env.get('GITHUB_WORKFLOW_SHA'),40)
    need(env.get('GITHUB_WORKFLOW_REF')==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(pr['number'])+'/merge','discovery workflow/event reference')



def font_chain_expected(expected):
    fields(expected,'schema source request original runId workflowSha')
    need(expected['schema']=='bw.gui-hdd.font-chain-expectation.v1','explicit chain expectation version')
    font_expected(dict(expected,schema='bw.gui-hdd.font-discovery-expectation.v1'))


def font_chain_witness_row(row,complete):
    fields(row,'path kind namedBefore heldBefore heldAfter namedAfter linkBefore linkAfter close')
    if row['path']!='/':runtime_path(row['path'])
    need(row['kind'] in ('link','parent'),'closed typed chain witness')
    for key in ('namedBefore','heldBefore','heldAfter','namedAfter'):
        if row[key] is not None:font_stat(row[key])
    for key in ('linkBefore','linkAfter'):
        if row[key] is not None:need(type(row[key]) is str and 0<len(row[key])<=512,'bounded observed link text')
    fields(row['close'],'attempted succeeded');need(all(type(x) is bool for x in row['close'].values()),'strict chain close booleans')
    if complete:
        before=row['namedBefore'];need(before is not None and before['uid']==0,'root-owned completed witness')
        need(all(encode(row[k])==encode(before) for k in ('heldBefore','heldAfter','namedAfter')),'chain identity readback')
        need(row['close']=={'attempted':True,'succeeded':True},'chain witness successful close')
        if row['kind']=='parent':
            need(stat.S_ISDIR(before['mode']) and before['mode']&0o6022==0 and row['linkBefore'] is None and row['linkAfter'] is None,'typed nonwritable parent')
        else:
            need(stat.S_ISLNK(before['mode']) and type(row['linkBefore']) is str and row['linkBefore']==row['linkAfter'] and len(row['linkBefore'].encode())==before['size'],'stable held symlink text and extent')


def verify_font_chain(original_raw,request_raw,expected):
    font_chain_expected(expected)
    for name,raw in (('original',original_raw),('request',request_raw)):
        need(len(raw)==expected[name]['byteLength'] and sha(raw)==expected[name]['sha256'],'selected chain '+name)
    request=font_chain_request(request_raw,expected['request']['sha256']);need(encode(request['source'])==encode(expected['source']),'chain external source21 request join')
    value=decode(original_raw);fields(value,'schema observationOnly candidate qualified activeFontSelectionProved sourceRuntimeObserved request event platform tool sourceCommands parents links terminal complete firstFailure secondary commands packages')
    need(encode(value)==original_raw and value['schema']=='bw.gui-hdd.font-chain-original.v1','canonical explicit chain original version')
    need(value['observationOnly'] is True and all(value[k] is False for k in ('candidate','qualified','activeFontSelectionProved','sourceRuntimeObserved')),'chain no runtime/selection authority')
    need(type(value['complete']) is bool and value['commands']==[] and value['packages'] is None,'passive chain only, no package probes')
    need(font_original_blob(value['request'],JSON_CAP)==request_raw,'chain retained request')
    platform=value['platform'];fields(platform,'GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB GITHUB_REPOSITORY GITHUB_WORKFLOW_SHA GITHUB_WORKFLOW_REF GITHUB_EVENT_NAME GITHUB_ACTOR BW_EXPECTED_HEAD')
    need(platform['GITHUB_RUN_ID']==str(expected['runId']) and platform['GITHUB_WORKFLOW_SHA']==expected['workflowSha'],'chain external run/workflow join')
    font_chain_event(font_original_blob(value['event'],256<<10),expected['request']['sha256'],expected['source']['head'],platform)
    need(type(value['secondary']) is list and len(value['secondary'])<=128,'bounded chain secondary failures')
    errors=([value['firstFailure']] if value['firstFailure'] is not None else [])+value['secondary']
    for error in errors:
        fields(error,'phase path name message')
        need(error['phase'] in ('chain','close','source-retention') and all(type(error[k]) is str and len(error[k])<=512 for k in ('name','message')),'typed retained chain refusal')
        if error['path'] is not None:runtime_path(error['path'])
    need(value['complete'] is (value['firstFailure'] is None) and (not value['secondary'] or value['firstFailure'] is not None),'chain success and first failure consistency')
    arguments=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]+[['cat-file','blob',request['source']['head']+':'+p] for p in sorted(SOURCE)]
    commands=value['sourceCommands'];need(type(commands) is list and len(commands)<=len(arguments),'bounded chain source commands')
    if value['complete']:need(len(commands)==len(arguments),'complete chain source21 observations')
    need(type(value['tool']) is dict and set(value['tool'])<=set('namedBefore heldBefore heldAfter namedAfter file close'.split()),'closed chain tool observation role')
    font_file_row(value['tool'],bool(commands),bool(commands))
    failed=False
    for index,command in enumerate(commands):
        fields(command,'argv stdout stderr exitCode');need(not failed,'ordered chain source prefix')
        argv=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null',*arguments[index]]
        need(command['argv']==argv,'exact chain Git arguments')
        for key in ('stdout','stderr'):
            if command[key] is not None:
                fields(command[key],'byteLength sha256');integer(command[key]['byteLength'],0,STREAM_CAP);digest(command[key]['sha256'])
        if any(command[k] is None for k in ('stdout','stderr','exitCode')):
            need(not value['complete'] and index==len(commands)-1,'incomplete source attempt only terminal failure');failed=True;continue
        integer(command['exitCode'],-255,255)
        failed=command['exitCode']!=0
        if failed:need(not value['complete'] and index==len(commands)-1,'failed source attempt terminal only');continue
        output={'byteLength':41,'sha256':sha((request['source']['head' if index==0 else 'tree']+'\n').encode())} if index<2 else request['source']['files'][sorted(SOURCE)[index-2]]
        need(encode(command['stdout'])==encode(output) and encode(command['stderr'])==encode({'byteLength':0,'sha256':sha(b'')}),'chain exact source Git/live/external descriptors')
    parents=value['parents'];links=value['links']
    if parents or links or value['terminal'] is not None:need(len(commands)==len(arguments) and not failed,'all source21 before chain witnesses')
    need(type(parents) is list and len(parents)<=128 and type(links) is list and len(links)<=min(FONT_CHAIN_HOPS,256),'combined chain parent/alias caps')
    need(len({x['path'] for x in parents})==len(parents),'unique parent witnesses')
    for row in parents:font_chain_witness_row(row,value['complete']);need(row['kind']=='parent','parent role')
    for row in links:
        font_chain_witness_row(row,value['complete']);need(row['kind']=='link','link role')
    current=request['entry'];visited=set();required={str(parent) for parent in Path(current).parents}
    for index,row in enumerate(links):
        need(current not in visited and row['path']==current,'ordered chain links and cycle refusal');visited.add(current)
        required.update(str(p) for p in Path(current).parents)
        try:font_chain_witness_row(row,True)
        except ValueError:
            need(not value['complete'] and index==len(links)-1 and value['terminal'] is None,'failed chain link witness ends observation before following hop');break
        if row['linkBefore'] is None:
            need(not value['complete'] and index==len(links)-1 and value['terminal'] is None,'missing link text ends failed chain with no ignored suffix or terminal');break
        try:current=font_chain_next(current,row['linkBefore'])
        except ValueError:
            need(not value['complete'] and index==len(links)-1 and value['terminal'] is None,'invalid next link ends failed chain with no ignored suffix or terminal');break
        required.update(str(parent) for parent in Path(current).parents)
    need({row['path'] for row in parents}<=required,'every retained parent belongs to derived chain ancestry')
    terminal=value['terminal']
    if terminal is not None:
        fields(terminal,'path observation');runtime_path(terminal['path'])
        need(links and current not in visited and terminal['path']==current and current.startswith(FONT_CHAIN_ROOTS),'retained terminal always follows ordered original-root chain')
        need(type(terminal['observation']) is dict and set(terminal['observation'])<=set('namedBefore heldBefore heldAfter namedAfter file close'.split()),'closed chain terminal observation role')
        required.update(str(p) for p in Path(terminal['path']).parents)
        font_file_row(terminal['observation'],value['complete'])
    needed_parents={str(parent) for row in links for parent in Path(row['path']).parents}
    if terminal is not None:needed_parents.update(str(parent) for parent in Path(terminal['path']).parents)
    parentmap={row['path']:row for row in parents}
    need(needed_parents<=set(parentmap),'all parents consumed by retained chain witnesses are present')
    for path in needed_parents:font_chain_witness_row(parentmap[path],True)
    for index,row in enumerate(parents):
        try:font_chain_witness_row(row,True)
        except ValueError:need(not value['complete'] and index==len(parents)-1 and row['path'] not in needed_parents,'failed parent ends unconsumed chain observation prefix')
    if value['complete']:
        need(links and terminal is not None and current not in visited and terminal['path']==current and current.startswith(FONT_CHAIN_ROOTS),'complete regular terminal ordered original-root path')
        need({x['path'] for x in parents}==required,'exact ancestor witnesses, no omitted intermediate parent')
        info=terminal['observation']['namedBefore'];need(info['uid']==0 and info['mode']&0o6022==0 and info['size']>0,'positive nonwritable root-owned terminal')
    return {'schema':'bw.gui-hdd.font-chain-reader.v1','observationOnly':True,'candidate':False,'qualified':False,'activeFontSelectionProved':False,'actualRequestSupported':False,
      'actual':False,'sourceRuntimeObserved':False,'complete':value['complete'],'firstFailure':value['firstFailure'],'links':len(links),'sourceHead':request['source']['head']}



# Separate prior-reference mode: historical alias bytes select a question only.
FONT_BRIDGE_ENABLED = False


def font_bridge_blob(row):
    fields(row,'byteLength sha256 base64');integer(row['byteLength'],1,JSON_CAP//4);digest(row['sha256'])
    need(type(row['base64']) is str and len(row['base64'])==4*((row['byteLength']+2)//3),'bounded prior encoding before decode')
    raw=base64.b64decode(row['base64'],validate=True)
    need(len(raw)==row['byteLength'] and sha(raw)==row['sha256'] and base64.b64encode(raw).decode()==row['base64'],'exact prior original bytes')
    return raw


def font_bridge_prior(prior,entry):
    fields(prior,'schema sourceEntry request original expectation')
    need(prior['schema']=='bw.gui-hdd.font-bridge-prior.v1','explicit immutable prior version')
    runtime_path(prior['sourceEntry']);runtime_path(entry)
    need(prior['sourceEntry'].startswith(FONT_CHAIN_ROOTS) and entry.startswith('/etc/alternatives/') and entry.count('/')==3,'historical font entry and single-child bridge question')
    selected=prior['expectation'];fields(selected,'schema source request original runId workflowSha')
    need(selected['schema']=='bw.gui-hdd.font-discovery-expectation.v1','explicit prior discovery expectation')
    source=selected['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files']);need(set(source['files'])==SOURCE,'exact prior source21')
    integer(selected['runId'],1,2**63-1);digest(selected['workflowSha'],40)
    for role in ('request','original'):
        fields(selected[role],'byteLength sha256');integer(selected[role]['byteLength'],1,JSON_CAP//4);digest(selected[role]['sha256'])
        need(encode(selected[role])==encode({key:prior[role][key] for key in ('byteLength','sha256')}),'externally selected prior pin join')
    request_raw=font_bridge_blob(prior['request']);original_raw=font_bridge_blob(prior['original'])
    request,baseline=font_request(request_raw,selected['request']['sha256'])
    need(encode(request['source'])==encode(source),'prior request/source selection join')
    value=decode(original_raw)
    fields(value,'schema observationOnly candidate qualified activeFontSelectionProved perPackageManifestBoundariesProved request event platform sourceCommands tools directories files aliases configs configReferences baselineMissing commands packages complete firstFailure secondary')
    need(encode(value)==original_raw and value['schema']=='bw.gui-hdd.font-discovery-original.v1' and value['observationOnly'] is True and value['complete'] is False and
      all(value[k] is False for k in ('candidate','qualified','activeFontSelectionProved','perPackageManifestBoundariesProved')),'canonical failed historical discovery only')
    need(font_bridge_blob(value['request'])==request_raw,'prior retained request bytes')
    platform=value['platform'];fields(platform,'GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB GITHUB_REPOSITORY GITHUB_WORKFLOW_SHA GITHUB_WORKFLOW_REF GITHUB_EVENT_NAME GITHUB_ACTOR BW_EXPECTED_HEAD')
    need(platform['GITHUB_RUN_ID']==str(selected['runId']) and platform['GITHUB_WORKFLOW_SHA']==selected['workflowSha'],'prior externally selected run/workflow')
    need(type(value['event']) is dict and type(value['event'].get('byteLength')) is int and value['event']['byteLength']<=256<<10,'bounded prior event before decode')
    font_event(font_bridge_blob(value['event']),selected['request']['sha256'],source['head'],platform)
    need(type(value['aliases']) is dict and len(value['aliases'])<=256 and prior['sourceEntry'] in value['aliases'],'bounded recorded prior alias')
    alias=value['aliases'][prior['sourceEntry']];fields(alias,'namedBefore namedAfter linkText')
    for snapshot in ('namedBefore','namedAfter'):
        info=alias[snapshot];fields(info,'dev ino mode uid gid nlink size mtime_ns')
        for key,item in info.items():integer(item,-2**63 if key=='mtime_ns' else 0,2**63-1 if key=='mtime_ns' else 2**64-1)
        need(info['uid']==0 and stat.S_ISLNK(info['mode']),'root-owned historical symlink')
    need(encode(alias['namedBefore'])==encode(alias['namedAfter']) and alias['linkText']==entry and type(alias['linkText']) is str and
      alias['namedBefore']['size']==len(entry.encode()),'stable incomplete prior alias with exact literal bridge text/extent')
    error=value['firstFailure'];fields(error,'phase path name message')
    need(error['phase']=='directory' and error['path']==str(Path(prior['sourceEntry']).parent) and error['name']=='ValueError' and error['message']=='font alias canonical allowed regular target','recorded alias boundary refusal')
    need(entry not in value['aliases'] and entry not in value['files'] and entry not in value['directories'],'bridge hop previously unobserved')
    return request,original_raw


def font_bridge_reference(prior,entry):
    selected=prior['expectation']
    return {'schema':'bw.gui-hdd.font-bridge-prior-reference.v1','sourceEntry':prior['sourceEntry'],'entry':entry,'source':selected['source'],
      'runId':selected['runId'],'workflowSha':selected['workflowSha'],'request':selected['request'],'original':selected['original']}


def font_bridge_request(raw,expected):
    digest(expected);need(type(raw) is bytes and len(raw)<=JSON_CAP//4 and sha(raw)==expected,'bounded selected bridge request')
    value=decode(raw);fields(value,'schema source baseline entry prior')
    need(encode(value)==raw and value['schema']=='bw.gui-hdd.font-bridge-request.v1','explicit canonical bridge request version')
    legacy={key:value[key] for key in ('source','baseline')};legacy['schema']='bw.gui-hdd.font-discovery-request.v1'
    font_request(encode(legacy),sha(encode(legacy)))
    font_expected(value['prior']['expectation'])
    previous,original=font_bridge_prior(value['prior'],value['entry'])
    verify_font_discovery(original,font_bridge_blob(value['prior']['request']),value['prior']['expectation'])
    need(encode(value['baseline'])==encode(previous['baseline']),'unchanged prior baseline descriptor')
    return value


def font_bridge_event(raw,request_sha,head,env):
    event=decode(raw);pr=event.get('pull_request',{})
    need(event.get('action')=='labeled' and event.get('label',{}).get('name')=='x86-hdd-gui-font-bridge' and
         event.get('sender',{}).get('login')=='CrispStrobe' and event.get('repository',{}).get('full_name')==REPOSITORY,'owned discovery event')
    integer(event.get('number'),1,2**31-1)
    need(type(pr.get('number')) is int and event['number']==pr['number'] and pr.get('state')=='open' and
         pr.get('head',{}).get('sha')==head and pr.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         pr.get('head',{}).get('repo',{}).get('fork') is False and pr.get('base',{}).get('ref')=='main' and
         pr.get('base',{}).get('repo',{}).get('full_name')==REPOSITORY,'exact own discovery source event')
    marker='<!-- BW_GUI_HDD_FONT_BRIDGE_SHA256='+request_sha+' -->'
    need(type(pr.get('body')) is str and pr['body'].count('<!-- BW_GUI_HDD_FONT_BRIDGE_SHA256=')==1 and pr['body'].count(marker)==1,'event transports selected discovery pin only')
    need(env.get('GITHUB_REPOSITORY')==REPOSITORY and env.get('GITHUB_EVENT_NAME')=='pull_request' and env.get('GITHUB_ACTOR')=='CrispStrobe' and
         env.get('GITHUB_RUN_ATTEMPT')=='1' and env.get('GITHUB_JOB')=='font-bridge' and re.fullmatch('[1-9][0-9]{0,19}',env.get('GITHUB_RUN_ID','')) and
         env.get('BW_EXPECTED_HEAD')==head,'first discovery platform observations')
    digest(env.get('GITHUB_WORKFLOW_SHA'),40)
    need(env.get('GITHUB_WORKFLOW_REF')==REPOSITORY+'/.github/workflows/i80386-hdd-gui-actual.yml@refs/pull/'+str(pr['number'])+'/merge','discovery workflow/event reference')


def font_bridge_expected(expected):
    fields(expected,'schema source request original runId workflowSha prior')
    need(expected['schema']=='bw.gui-hdd.font-bridge-expectation.v1','explicit bridge expectation version')
    font_expected({**{key:expected[key] for key in ('source','request','original','runId','workflowSha')},'schema':'bw.gui-hdd.font-discovery-expectation.v1'})
    prior=expected['prior'];fields(prior,'schema sourceEntry entry source runId workflowSha request original')
    need(prior['schema']=='bw.gui-hdd.font-bridge-prior-reference.v1','explicit separately selected prior reference')
    font_expected({**{key:prior[key] for key in ('source','request','original','runId','workflowSha')},'schema':'bw.gui-hdd.font-discovery-expectation.v1'})
    runtime_path(prior['sourceEntry']);runtime_path(prior['entry'])

def verify_font_bridge(original_raw,request_raw,expected):
    font_bridge_expected(expected)
    for name,raw in (('original',original_raw),('request',request_raw)):
        need(len(raw)==expected[name]['byteLength'] and sha(raw)==expected[name]['sha256'],'selected chain '+name)
    request=font_bridge_request(request_raw,expected['request']['sha256']);need(encode(font_bridge_reference(request['prior'],request['entry']))==encode(expected['prior']),'independently selected prior reference');need(encode(request['source'])==encode(expected['source']),'chain external source21 request join')
    value=decode(original_raw);fields(value,'schema observationOnly candidate qualified activeFontSelectionProved sourceRuntimeObserved sourceEntryReobserved currentEntryAssociationObserved request event platform tool sourceCommands parents links terminal complete firstFailure secondary commands packages')
    need(encode(value)==original_raw and value['schema']=='bw.gui-hdd.font-bridge-original.v1','canonical explicit chain original version')
    need(value['observationOnly'] is True and all(value[k] is False for k in ('candidate','qualified','activeFontSelectionProved','sourceRuntimeObserved','sourceEntryReobserved','currentEntryAssociationObserved')),'chain no runtime/selection authority')
    need(type(value['complete']) is bool and value['commands']==[] and value['packages'] is None,'passive chain only, no package probes')
    need(font_original_blob(value['request'],JSON_CAP)==request_raw,'chain retained request')
    platform=value['platform'];fields(platform,'GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_JOB GITHUB_REPOSITORY GITHUB_WORKFLOW_SHA GITHUB_WORKFLOW_REF GITHUB_EVENT_NAME GITHUB_ACTOR BW_EXPECTED_HEAD')
    need(platform['GITHUB_RUN_ID']==str(expected['runId']) and platform['GITHUB_WORKFLOW_SHA']==expected['workflowSha'],'chain external run/workflow join')
    font_bridge_event(font_original_blob(value['event'],256<<10),expected['request']['sha256'],expected['source']['head'],platform)
    need(type(value['secondary']) is list and len(value['secondary'])<=128,'bounded chain secondary failures')
    errors=([value['firstFailure']] if value['firstFailure'] is not None else [])+value['secondary']
    for error in errors:
        fields(error,'phase path name message')
        need(error['phase'] in ('chain','close','source-retention') and all(type(error[k]) is str and len(error[k])<=512 for k in ('name','message')),'typed retained chain refusal')
        if error['path'] is not None:runtime_path(error['path'])
    need(value['complete'] is (value['firstFailure'] is None) and (not value['secondary'] or value['firstFailure'] is not None),'chain success and first failure consistency')
    arguments=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]+[['cat-file','blob',request['source']['head']+':'+p] for p in sorted(SOURCE)]
    commands=value['sourceCommands'];need(type(commands) is list and len(commands)<=len(arguments),'bounded chain source commands')
    if value['complete']:need(len(commands)==len(arguments),'complete chain source21 observations')
    need(type(value['tool']) is dict and set(value['tool'])<=set('namedBefore heldBefore heldAfter namedAfter file close'.split()),'closed chain tool observation role')
    font_file_row(value['tool'],bool(commands),bool(commands))
    failed=False
    for index,command in enumerate(commands):
        fields(command,'argv stdout stderr exitCode');need(not failed,'ordered chain source prefix')
        argv=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null',*arguments[index]]
        need(command['argv']==argv,'exact chain Git arguments')
        for key in ('stdout','stderr'):
            if command[key] is not None:
                fields(command[key],'byteLength sha256');integer(command[key]['byteLength'],0,STREAM_CAP);digest(command[key]['sha256'])
        if any(command[k] is None for k in ('stdout','stderr','exitCode')):
            need(not value['complete'] and index==len(commands)-1,'incomplete source attempt only terminal failure');failed=True;continue
        integer(command['exitCode'],-255,255)
        failed=command['exitCode']!=0
        if failed:need(not value['complete'] and index==len(commands)-1,'failed source attempt terminal only');continue
        output={'byteLength':41,'sha256':sha((request['source']['head' if index==0 else 'tree']+'\n').encode())} if index<2 else request['source']['files'][sorted(SOURCE)[index-2]]
        need(encode(command['stdout'])==encode(output) and encode(command['stderr'])==encode({'byteLength':0,'sha256':sha(b'')}),'chain exact source Git/live/external descriptors')
    parents=value['parents'];links=value['links']
    if parents or links or value['terminal'] is not None:need(len(commands)==len(arguments) and not failed,'all source21 before chain witnesses')
    need(type(parents) is list and len(parents)<=128 and type(links) is list and len(links)<=min(FONT_CHAIN_HOPS,256),'combined chain parent/alias caps')
    need(len({x['path'] for x in parents})==len(parents),'unique parent witnesses')
    for row in parents:font_chain_witness_row(row,value['complete']);need(row['kind']=='parent','parent role')
    for row in links:
        font_chain_witness_row(row,value['complete']);need(row['kind']=='link','link role')
    current=request['entry'];visited=set();required={str(parent) for parent in Path(current).parents}
    for index,row in enumerate(links):
        need(current!=request['prior']['sourceEntry'],'historical source entry cannot have current link witness')
        need(current not in visited and row['path']==current,'ordered chain links and cycle refusal');visited.add(current)
        required.update(str(p) for p in Path(current).parents)
        try:font_chain_witness_row(row,True)
        except ValueError:
            need(not value['complete'] and index==len(links)-1 and value['terminal'] is None,'failed bridge link witness ends observation before following hop');break
        if row['linkBefore'] is None:
            need(not value['complete'] and index==len(links)-1 and value['terminal'] is None,'missing link text ends failed chain with no ignored suffix or terminal');break
        try:current=font_chain_next(current,row['linkBefore'])
        except ValueError:
            need(not value['complete'] and index==len(links)-1 and value['terminal'] is None,'invalid next link ends failed chain with no ignored suffix or terminal');break
        if current==request['prior']['sourceEntry']:
            need(not value['complete'] and index==len(links)-1 and value['terminal'] is None,'forbidden rebound stops before any newly derived parent witness');break
        required.update(str(parent) for parent in Path(current).parents)
    need({row['path'] for row in parents}<=required,'every retained parent belongs to derived chain ancestry')
    terminal=value['terminal']
    if terminal is not None:
        fields(terminal,'path observation');runtime_path(terminal['path'])
        need(terminal['path']!=request['prior']['sourceEntry'],'historical source entry cannot have terminal observation')
        need(links and current not in visited and terminal['path']==current and current.startswith(FONT_CHAIN_ROOTS),'retained terminal always follows ordered original-root chain')
        need(type(terminal['observation']) is dict and set(terminal['observation'])<=set('namedBefore heldBefore heldAfter namedAfter file close'.split()),'closed chain terminal observation role')
        required.update(str(p) for p in Path(terminal['path']).parents)
        font_file_row(terminal['observation'],value['complete'])
    needed_parents={str(parent) for row in links for parent in Path(row['path']).parents}
    if terminal is not None:needed_parents.update(str(parent) for parent in Path(terminal['path']).parents)
    parentmap={row['path']:row for row in parents}
    need(needed_parents<=set(parentmap),'all parents consumed by retained bridge witnesses are present')
    for path in needed_parents:font_chain_witness_row(parentmap[path],True)
    for index,row in enumerate(parents):
        try:font_chain_witness_row(row,True)
        except ValueError:need(not value['complete'] and index==len(parents)-1 and row['path'] not in needed_parents,'failed parent ends unconsumed observation prefix')
    if value['complete']:
        need(links and terminal is not None and current not in visited and terminal['path']==current and current.startswith(FONT_CHAIN_ROOTS),'complete regular terminal ordered original-root path')
        need({x['path'] for x in parents}==required,'exact ancestor witnesses, no omitted intermediate parent')
        info=terminal['observation']['namedBefore'];need(info['uid']==0 and info['mode']&0o6022==0 and info['size']>0,'positive nonwritable root-owned terminal')
    return {'schema':'bw.gui-hdd.font-bridge-reader.v1','observationOnly':True,'candidate':False,'qualified':False,'activeFontSelectionProved':False,'actualRequestSupported':False,
      'actual':False,'sourceRuntimeObserved':False,'sourceEntryReobserved':False,'currentEntryAssociationObserved':False,'complete':value['complete'],'firstFailure':value['firstFailure'],'links':len(links),'sourceHead':request['source']['head']}




FONT_BRIDGE_PROCESS_ROOT = 'font-bridge-original-process-originals/'
FONT_BRIDGE_TOP = ('guard.stdout','guard.stderr','npm.stdout','npm.stderr','chromium-install.stdout','chromium-install.stderr','input-install.stdout','input-install.stderr','request.json','controller.stdout','controller.stderr','font-bridge-original.json')

def font_bridge_delivery_expected(expected):
    fields(expected,'schema source request archive runId jobId artifactId prNumber workflow metadata prior')
    need(expected['schema']=='bw.gui-hdd.font-bridge-delivery-expectation.v1','explicit observation delivery policy')
    for key in ('runId','jobId','artifactId','prNumber'):integer(expected[key],1,2**63-1)
    source=expected['source'];fields(source,'head tree files');digest(source['head'],40);digest(source['tree'],40)
    rows(source['files']);need(set(source['files'])==SOURCE,'externally selected delivery source21')
    for key,cap in (('request',JSON_CAP//4),('archive',FONT_DELIVERY_CAP)):
        fields(expected[key],'byteLength sha256');integer(expected[key]['byteLength'],1,cap);digest(expected[key]['sha256'])
    metadata=expected['metadata'];fields(metadata,'run job artifact workflowProof')
    for row in metadata.values():fields(row,'byteLength sha256');integer(row['byteLength'],1,JSON_CAP);digest(row['sha256'])
    workflow=expected['workflow'];fields(workflow,'commit base tree blob byteLength sha256')
    for key in ('commit','base','tree','blob'):digest(workflow[key],40)
    integer(workflow['byteLength'],1,65536);digest(workflow['sha256'])
    need(workflow['commit']!=source['head'] and workflow['base']!=source['head'],'separate executing merge workflow and selected source/base')
    need(encode(source['files'][FONT_WORKFLOW_PATH])==encode({k:workflow[k] for k in ('byteLength','sha256')}),'bridge executing workflow content joins reviewed source21 workflow')

    prior=expected['prior'];fields(prior,'schema sourceEntry entry source runId workflowSha request original')
    need(prior['schema']=='bw.gui-hdd.font-bridge-prior-reference.v1','explicit independently selected historical prior reference')
    font_expected({**{key:prior[key] for key in ('source','request','original','runId','workflowSha')},'schema':'bw.gui-hdd.font-discovery-expectation.v1'})
    runtime_path(prior['sourceEntry']);runtime_path(prior['entry'])

def font_bridge_delivery_official(metadata,expected):
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
    need(job['run_id']==expected['runId'] and job.get('head_sha')==expected['source']['head'] and job.get('name')=='font-bridge' and job.get('status')=='completed' and job.get('conclusion') in ('success','failure'),'selected producing job terminal')
    need(artifact.get('name')=='i80386-hdd-gui-font-bridge-'+str(expected['runId'])+'-1' and artifact.get('expired') is False and
         artifact['size_in_bytes']==expected['archive']['byteLength'] and artifact.get('digest')=='sha256:'+expected['archive']['sha256'] and
         artifact['workflow_run']['id']==expected['runId'] and artifact['workflow_run'].get('head_sha')==expected['source']['head'],'official artifact/run/source/name/extent/digest joins; no job-ID field inferred')
    began=font_delivery_time(job.get('started_at'));ended=font_delivery_time(job.get('completed_at'));need(began<=ended,'official terminal job chronology')
    steps=job.get('steps');need(type(steps) is list and len(steps)<=64,'bounded official producing steps');numbers=[]
    for step in steps:integer(step.get('number'),1,128);numbers.append(step['number'])
    need(numbers==sorted(set(numbers)),'strict unique ordered official step numbers')
    required=['Run actions/checkout@11d5960a326750d5838078e36cf38b85af677262','Refuse unreviewed bridge before setup or input retrieval',
      'Run actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020','Install unchanged selected packages and Chromium for bridge observation',
      'Install externally selected immutable bridge request','Record bounded read-only font bridge without credentials',
      'Run actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02']
    previous=began;positions=[]
    for name in required:
        matches=[(index,step) for index,step in enumerate(steps) if step.get('name')==name];need(len(matches)==1,'one official producing step for each reviewed role')
        index,step=matches[0];need(step.get('status')=='completed' and step.get('conclusion')==(job['conclusion'] if name.startswith('Record bounded') else 'success'),'terminal official guard/setup/input/collector/upload step')
        start=font_delivery_time(step.get('started_at'));end=font_delivery_time(step.get('completed_at'));need(previous<=start<=end<=ended,'official producing step chronology');previous=end;positions.append(index)
    need(positions==sorted(set(positions)),'official guard precedes setup, input, collection and upload')
    return job['conclusion']

def font_bridge_delivery_archive(raw):
    need(type(raw) is bytes and 0<len(raw)<=FONT_DELIVERY_CAP,'bounded font delivery ZIP')
    top=set(FONT_BRIDGE_TOP)
    required=top|{FONT_BRIDGE_PROCESS_ROOT+'git-'+str(i)+'.'+suffix for i in range(2+len(SOURCE)) for suffix in ('stdout','stderr','process.json')}
    headers=[];names=set();total=0;prefix=None;directories=set()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        items=archive.infolist();need(len(items)<=96,'bounded delivery ZIP entry census')
        for item in items:
            name=item.filename;need(item.orig_filename==name and '\x00' not in name,'exact untruncated ZIP member name');relative(name.rstrip('/') if item.is_dir() else name)
            need(name not in names and not item.flag_bits&1 and item.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED),'unique unencrypted stored/deflated ZIP entries');names.add(name)
            mode=stat.S_IFMT(item.external_attr>>16)
            need(mode in ((0,stat.S_IFDIR) if item.is_dir() else (0,stat.S_IFREG)),'regular font delivery members; no links or special files')
            if item.is_dir():
                need(item.file_size==0,'known directory roles carry no ignored payload')
                need(name in ('gui-font-bridge/',FONT_BRIDGE_PROCESS_ROOT,'gui-font-bridge/'+FONT_BRIDGE_PROCESS_ROOT),'fixed delivery directory roles');directories.add(name);continue
            current='gui-font-bridge/' if name.startswith('gui-font-bridge/') else ''
            if prefix is None:prefix=current
            need(current==prefix,'one uniform upload root');inner=name.removeprefix(current)
            if inner in top:
                cap=JSON_CAP//4 if inner=='request.json' else JSON_CAP if inner in ('font-bridge-original.json','npm.stdout','npm.stderr','chromium-install.stdout','chromium-install.stderr') else 16384
            else:
                need(inner.startswith(FONT_BRIDGE_PROCESS_ROOT),'fixed delivery raw-process root');leaf=inner[len(FONT_BRIDGE_PROCESS_ROOT):]
                match=re.fullmatch(r'git-([0-9]+)\.(stdout|stderr|process\.json)',leaf)
                need(match is not None and 0<=int(match[1])<2+len(SOURCE) and str(int(match[1]))==match[1],'fixed bridge Git roles before inflate')
                cap=JSON_CAP if match[2]=='process.json' else STREAM_CAP
            need(type(item.file_size) is int and 0<=item.file_size<=cap,'delivery role extent before inflate');total+=item.file_size
            need(total<=FONT_DELIVERY_CAP and len(headers)<96,'inflated delivery aggregate/file cap before inflate');headers.append((inner,item))
        need(required=={name for name,item in headers},'exact bridge delivery role closure; unsupported early/source failures refuse')
        allowed_directories={FONT_BRIDGE_PROCESS_ROOT} if prefix=='' else {'gui-font-bridge/','gui-font-bridge/'+FONT_BRIDGE_PROCESS_ROOT}
        need(directories<=allowed_directories,'bridge directory records belong to selected file layout')
        # No member is inflated until the ENTIRE role/extent census has passed.
        return {name:archive.read(item) for name,item in headers}

def font_bridge_delivery_raw(value,files,request):
    commands=value['sourceCommands'];need(type(commands) is list and len(commands)==2+len(SOURCE) and value['commands']==[] and value['packages'] is None,'bridge profile requires complete source prefix and no package probes')
    prior_end=0;first_start=None;parent=None;identities=set()
    for index,command in enumerate(commands):
        role=FONT_BRIDGE_PROCESS_ROOT+'git-'+str(index);stdout=files[role+'.stdout'];stderr=files[role+'.stderr']
        process=font_delivery_process(files[role+'.process.json'],stdout,stderr,command['argv'])
        need(process['startedNs']>=prior_end,'serial bridge raw source chronology');prior_end=process['endedNs']
        if first_start is None:first_start=process['startedNs']
        need(prior_end-first_start<=200*10**9,'bridge raw source span profile at most200s; not controller duration or preemption')
        current=process['identity'];need(parent is None or parent==current['parentPid'],'same observed bridge controller parent');parent=current['parentPid']
        identity_=(current['pid'],current['startTicks']);need(identity_ not in identities,'distinct bridge child identities');identities.add(identity_)
        need(process['exitCode']==0 and process['firstFailure'] is None and process['secondaryFailures']==[] and process['remainingDescendants']==[] and process['overflowObservedBytes']=={} and not stderr,'successful bridge raw Git profile only')
        need(encode(command['stdout'])==encode(process['streams']['stdout']) and encode(command['stderr'])==encode(process['streams']['stderr']) and type(command['exitCode']) is int and command['exitCode']==0,'bridge descriptor/raw source join')
        selected={'byteLength':41,'sha256':sha((request['source']['head' if index==0 else 'tree']+'\n').encode())} if index<2 else request['source']['files'][sorted(SOURCE)[index-2]]
        need(encode(process['streams']['stdout'])==encode(selected),'bridge raw source/external bytes join')


def admit_font_bridge_metadata(request_raw,expected,metadata,workflow_raw):
    # API origin is externally trusted; consistency here never authorizes GET.
    font_bridge_delivery_expected(expected);fields(metadata,'run job artifact workflowProof');font_delivery_pin(request_raw,expected['request'])
    request=font_bridge_request(request_raw,expected['request']['sha256'])
    need(encode(request['source'])==encode(expected['source']) and encode(font_bridge_reference(request['prior'],request['entry']))==encode(expected['prior']),'bridge current source and historical prior independently selected')
    conclusion=font_bridge_delivery_official(metadata,expected);font_delivery_workflow(metadata['workflowProof'],workflow_raw,expected)
    return {'schema':'bw.gui-hdd.font-bridge-metadata-reader.v1','metadataConsistent':True,'producingConclusion':conclusion,'archiveObserved':False,'eventObserved':False,'rawOriginalsAudited':False,
      'acquisitionAuthorized':False,'eventAuthorized':False,'candidate':False,'qualified':False,'actual':False,'sourceRuntimeObserved':False,'sourceEntryReobserved':False,'currentEntryAssociationObserved':False}


def verify_font_bridge_delivery(archive_raw,request_raw,expected,metadata,workflow_raw):
    admission=admit_font_bridge_metadata(request_raw,expected,metadata,workflow_raw)
    font_delivery_pin(archive_raw,expected['archive']);files=font_bridge_delivery_archive(archive_raw)
    need(files['request.json']==request_raw,'exact installed bridge request original')
    original=files['font-bridge-original.json'];value=decode(original)
    inner={'schema':'bw.gui-hdd.font-bridge-expectation.v1','source':expected['source'],'request':expected['request'],'original':{'byteLength':len(original),'sha256':sha(original)},'runId':expected['runId'],'workflowSha':expected['workflow']['commit'],'prior':expected['prior']}
    verdict=verify_font_bridge(original,request_raw,inner);request=font_bridge_request(request_raw,expected['request']['sha256'])
    event=decode(font_original_blob(value['event'],256<<10));need(event['number']==expected['prNumber'],'bridge retained event/official PR join')
    font_bridge_delivery_raw(value,files,request)
    need(all(files[name]==b'' for name in ('guard.stdout','guard.stderr','input-install.stderr','controller.stdout','controller.stderr')),'bridge supported normal control streams; retention/early failures refuse')
    installed={'byteLength':len(request_raw),'sha256':sha(request_raw),'gitBlob':hashlib.sha1(b'blob '+str(len(request_raw)).encode()+b'\0'+request_raw).hexdigest()}
    need(files['input-install.stdout']==encode(installed),'exact immutable bridge installer witness')
    conclusion=admission['producingConclusion']
    if conclusion=='failure':
        need(type(value['firstFailure']) is dict and value['firstFailure']['phase']=='chain' and type(value['firstFailure']['path']) is str,'bridge delivery supports only filesystem chain failures after source admission')
        need(all(row['phase']=='close' and row['path']==value['firstFailure']['path'] for row in value['secondary']),'source-retention or diagnostic secondary failures unsupported by bridge delivery')
        attempted=request['entry']
        for row in value['links']:
            try:font_chain_witness_row(row,True);following=font_chain_next(attempted,row['linkBefore'])
            except ValueError:break
            attempted=following
        need(value['firstFailure']['path']==attempted,'failed bridge primary joins admitted pending path prefix')
    need(value['complete'] is (conclusion=='success') and (value['firstFailure'] is None) is (conclusion=='success'),'official bridge conclusion preserves collection failure')
    return {'schema':'bw.gui-hdd.font-bridge-delivery-reader.v1','observationOnly':True,'candidate':False,'qualified':False,'activeFontSelectionProved':False,'actualRequestSupported':False,'actual':False,
      'sourceRuntimeObserved':False,'sourceEntryReobserved':False,'currentEntryAssociationObserved':False,'producingConclusion':conclusion,'complete':value['complete'],'firstFailure':value['firstFailure'],
      'sourceHead':expected['source']['head'],'workflowCommit':expected['workflow']['commit'],'runId':expected['runId'],'jobId':expected['jobId'],'artifactId':expected['artifactId'],'observation':verdict}


ACTUAL_V6_PART_FILES = {
    'inventoryOriginal': 'inventory-original.json',
    'inventoryTemplate': 'inventory-template.json',
    'nativeFontOriginals.request': 'native-request.json',
    'nativeFontOriginals.event': 'native-event.json',
    'nativeFontOriginals.original': 'native-original.json',
    'nativeFontOriginals.service': 'native-service.json',
    'nativeFontOriginals.expectation': 'native-expectation.json',
    'nativeFontOriginals.readerReport': 'native-reader-report.json',
    'nativeFontOriginals.run': 'native-run.json',
    'nativeFontOriginals.job': 'native-job.json',
    'nativeFontOriginals.artifact': 'native-artifact.json',
}
ACTUAL_V6_PART_EXPECTED = ('schema requestSha256 buildSourceAdmissionSha256 sourceHead runId jobId artifactId '
                           'artifactName artifactBytes artifactSha256 run job artifact inventoryReferenceSha256 '
                           'nativeFontReferenceSha256 nativeSourceGitSha256')


class ActualV6PartsFailure(ValueError):
    def __init__(self, first, secondary=()):
        self.firstFailure=first
        self.secondary=list(secondary)
        super().__init__(first['message'])


def actual_v6_part_error(phase,error):
    message=str(error)
    return {'phase':phase,'name':type(error).__name__,'message':message[:256]}


def actual_v6_part_identity(value):
    return tuple(getattr(value,key) for key in
                 ('st_dev','st_ino','st_size','st_mode','st_uid','st_gid','st_nlink','st_mtime_ns'))


def actual_v6_part_read(path,cap,phase,dirfd=None):
    """Read one named original once; retain read and close failures in order."""
    descriptor=None;first=None;secondary=[];raw=bytearray()
    try:
        if dirfd is None:
            named=Path(path).absolute();before=named.lstat()
            need(named.resolve(strict=True)==named,'canonical external parts input')
        else:
            need(type(path) is str and path in ACTUAL_V6_PART_FILES.values(),'source-fixed parts filename')
            before=os.stat(path,dir_fd=dirfd,follow_symlinks=False)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and 0<before.st_size<=cap,
             'bounded single-link regular parts input')
        if dirfd is None:
            descriptor=os.open(named,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
        else:
            descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=dirfd)
        need(actual_v6_part_identity(os.fstat(descriptor))==actual_v6_part_identity(before),
             'held parts input identity')
        while len(raw)<=cap:
            part=os.read(descriptor,min(65536,cap+1-len(raw)))
            if not part:break
            raw.extend(part)
        after=(named.lstat() if dirfd is None else os.stat(path,dir_fd=dirfd,follow_symlinks=False))
        need(len(raw)==before.st_size and actual_v6_part_identity(os.fstat(descriptor))==
             actual_v6_part_identity(before)==actual_v6_part_identity(after),
             'complete stable parts input readback')
    except BaseException as error:first=actual_v6_part_error(phase,error)
    finally:
        if descriptor is not None:
            try:os.close(descriptor)
            except BaseException as error:
                record=actual_v6_part_error(phase+'-close',error)
                if first is None:first=record
                else:secondary.append(record)
    if first is not None:raise ActualV6PartsFailure(first,secondary)
    return bytes(raw)


def actual_v6_parts_expected(manifest_path,parts_path):
    """New bounded transport; all old expectation and actual graders stay unchanged."""
    manifest_raw=actual_v6_part_read(manifest_path,65536,'manifest')
    manifest=decode(manifest_raw)
    fields(manifest,'schema expected parts')
    need(encode(manifest)==manifest_raw and manifest['schema']=='bw.gui-hdd.actual-v6-parts-manifest.v1',
         'canonical closed actual v6 parts manifest')
    selected=manifest['expected'];fields(selected,ACTUAL_V6_PART_EXPECTED)
    need(selected['schema']=='bw.gui-hdd.actual-expectation.v6','distinct v6 expectation parts')
    parts=manifest['parts'];need(type(parts) is dict and set(parts)==set(ACTUAL_V6_PART_FILES),
                                 'exact eleven external original roles')
    total=len(manifest_raw)
    for role in ACTUAL_V6_PART_FILES:
        row=parts[role];fields(row,'byteLength sha256');integer(row['byteLength'],1,JSON_CAP);digest(row['sha256'])
        total+=row['byteLength'];need(total<=JSON_CAP,'bounded manifest and raw parts aggregate')
    directory=Path(parts_path).absolute();descriptor=None;first=None;secondary=[];expected=None
    try:
        before=directory.lstat()
        need(directory.resolve(strict=True)==directory and stat.S_ISDIR(before.st_mode),
             'canonical parts directory without alias')
        descriptor=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
        need(actual_v6_part_identity(os.fstat(descriptor))==actual_v6_part_identity(before),
             'held parts directory identity')
        names=[]
        with os.scandir(descriptor) as children:
            for child in children:
                need(len(names)<len(ACTUAL_V6_PART_FILES) and len(os.fsencode(child.name))<=128,
                     'bounded closed parts directory census')
                names.append(child.name)
        need(len(names)==len(ACTUAL_V6_PART_FILES) and set(names)==set(ACTUAL_V6_PART_FILES.values()),
             'closed eleven-file parts directory census')
        expected=dict(selected);expected['nativeFontOriginals']={};observed_total=len(manifest_raw)
        for role,name in ACTUAL_V6_PART_FILES.items():
            raw=actual_v6_part_read(name,parts[role]['byteLength'],role,descriptor)
            need(len(raw)==parts[role]['byteLength'] and sha(raw)==parts[role]['sha256'],
                 'selected parts extent and digest')
            observed_total+=len(raw);need(observed_total<=JSON_CAP,'observed raw parts aggregate')
            embedded={'byteLength':len(raw),'sha256':sha(raw),'base64':base64.b64encode(raw).decode()}
            if role.startswith('nativeFontOriginals.'):
                expected['nativeFontOriginals'][role.split('.',1)[1]]=embedded
            else:expected[role]=embedded
        after=directory.lstat()
        need(actual_v6_part_identity(os.fstat(descriptor))==actual_v6_part_identity(before)==
             actual_v6_part_identity(after),'stable parts directory readback')
    except ActualV6PartsFailure as error:
        first=error.firstFailure;secondary.extend(error.secondary)
    except BaseException as error:first=actual_v6_part_error('parts-directory',error)
    finally:
        if descriptor is not None:
            try:os.close(descriptor)
            except BaseException as error:
                record=actual_v6_part_error('parts-directory-close',error)
                if first is None:first=record
                else:secondary.append(record)
    if first is not None:raise ActualV6PartsFailure(first,secondary)
    return expected


def actual_v7_parts_expected(manifest_path,parts_path):
    """New bounded transport; all old expectation and actual graders stay unchanged."""
    manifest_raw=actual_v6_part_read(manifest_path,65536,'manifest')
    manifest=decode(manifest_raw)
    fields(manifest,'schema expected parts')
    need(encode(manifest)==manifest_raw and manifest['schema']=='bw.gui-hdd.actual-v7-parts-manifest.v1',
         'canonical closed actual v7 parts manifest')
    selected=manifest['expected'];fields(selected,ACTUAL_V6_PART_EXPECTED)
    need(selected['schema']=='bw.gui-hdd.actual-expectation.v7','distinct v7 expectation parts')
    parts=manifest['parts'];need(type(parts) is dict and set(parts)==set(ACTUAL_V6_PART_FILES),
                                 'exact eleven external original roles')
    total=len(manifest_raw)
    for role in ACTUAL_V6_PART_FILES:
        row=parts[role];fields(row,'byteLength sha256');integer(row['byteLength'],1,JSON_CAP);digest(row['sha256'])
        total+=row['byteLength'];need(total<=JSON_CAP,'bounded manifest and raw parts aggregate')
    directory=Path(parts_path).absolute();descriptor=None;first=None;secondary=[];expected=None
    try:
        before=directory.lstat()
        need(directory.resolve(strict=True)==directory and stat.S_ISDIR(before.st_mode),
             'canonical parts directory without alias')
        descriptor=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
        need(actual_v6_part_identity(os.fstat(descriptor))==actual_v6_part_identity(before),
             'held parts directory identity')
        names=[]
        with os.scandir(descriptor) as children:
            for child in children:
                need(len(names)<len(ACTUAL_V6_PART_FILES) and len(os.fsencode(child.name))<=128,
                     'bounded closed parts directory census')
                names.append(child.name)
        need(len(names)==len(ACTUAL_V6_PART_FILES) and set(names)==set(ACTUAL_V6_PART_FILES.values()),
             'closed eleven-file parts directory census')
        expected=dict(selected);expected['nativeFontOriginals']={};observed_total=len(manifest_raw)
        for role,name in ACTUAL_V6_PART_FILES.items():
            raw=actual_v6_part_read(name,parts[role]['byteLength'],role,descriptor)
            need(len(raw)==parts[role]['byteLength'] and sha(raw)==parts[role]['sha256'],
                 'selected parts extent and digest')
            observed_total+=len(raw);need(observed_total<=JSON_CAP,'observed raw parts aggregate')
            embedded={'byteLength':len(raw),'sha256':sha(raw),'base64':base64.b64encode(raw).decode()}
            if role.startswith('nativeFontOriginals.'):
                expected['nativeFontOriginals'][role.split('.',1)[1]]=embedded
            else:expected[role]=embedded
        after=directory.lstat()
        need(actual_v6_part_identity(os.fstat(descriptor))==actual_v6_part_identity(before)==
             actual_v6_part_identity(after),'stable parts directory readback')
    except ActualV6PartsFailure as error:
        first=error.firstFailure;secondary.extend(error.secondary)
    except BaseException as error:first=actual_v6_part_error('parts-directory',error)
    finally:
        if descriptor is not None:
            try:os.close(descriptor)
            except BaseException as error:
                record=actual_v6_part_error('parts-directory-close',error)
                if first is None:first=record
                else:secondary.append(record)
    if first is not None:raise ActualV6PartsFailure(first,secondary)
    return expected


def actual_v8_parts_expected(manifest_path,parts_path):
    """New bounded transport; all old expectation and actual graders stay unchanged."""
    manifest_raw=actual_v6_part_read(manifest_path,65536,'manifest')
    manifest=decode(manifest_raw)
    fields(manifest,'schema expected parts')
    need(encode(manifest)==manifest_raw and manifest['schema']=='bw.gui-hdd.actual-v8-parts-manifest.v1',
         'canonical closed actual v8 parts manifest')
    selected=manifest['expected'];fields(selected,ACTUAL_V6_PART_EXPECTED+' dispatchProof')
    need(selected['schema']=='bw.gui-hdd.actual-expectation.v8','distinct v8 expectation parts')
    parts=manifest['parts'];need(type(parts) is dict and set(parts)==set(ACTUAL_V6_PART_FILES),
                                 'exact eleven external original roles')
    total=len(manifest_raw)
    for role in ACTUAL_V6_PART_FILES:
        row=parts[role];fields(row,'byteLength sha256');integer(row['byteLength'],1,JSON_CAP);digest(row['sha256'])
        total+=row['byteLength'];need(total<=JSON_CAP,'bounded manifest and raw parts aggregate')
    directory=Path(parts_path).absolute();descriptor=None;first=None;secondary=[];expected=None
    try:
        before=directory.lstat()
        need(directory.resolve(strict=True)==directory and stat.S_ISDIR(before.st_mode),
             'canonical parts directory without alias')
        descriptor=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
        need(actual_v6_part_identity(os.fstat(descriptor))==actual_v6_part_identity(before),
             'held parts directory identity')
        names=[]
        with os.scandir(descriptor) as children:
            for child in children:
                need(len(names)<len(ACTUAL_V6_PART_FILES) and len(os.fsencode(child.name))<=128,
                     'bounded closed parts directory census')
                names.append(child.name)
        need(len(names)==len(ACTUAL_V6_PART_FILES) and set(names)==set(ACTUAL_V6_PART_FILES.values()),
             'closed eleven-file parts directory census')
        expected=dict(selected);expected['nativeFontOriginals']={};observed_total=len(manifest_raw)
        for role,name in ACTUAL_V6_PART_FILES.items():
            raw=actual_v6_part_read(name,parts[role]['byteLength'],role,descriptor)
            need(len(raw)==parts[role]['byteLength'] and sha(raw)==parts[role]['sha256'],
                 'selected parts extent and digest')
            observed_total+=len(raw);need(observed_total<=JSON_CAP,'observed raw parts aggregate')
            embedded={'byteLength':len(raw),'sha256':sha(raw),'base64':base64.b64encode(raw).decode()}
            if role.startswith('nativeFontOriginals.'):
                expected['nativeFontOriginals'][role.split('.',1)[1]]=embedded
            else:expected[role]=embedded
        after=directory.lstat()
        need(actual_v6_part_identity(os.fstat(descriptor))==actual_v6_part_identity(before)==
             actual_v6_part_identity(after),'stable parts directory readback')
    except ActualV6PartsFailure as error:
        first=error.firstFailure;secondary.extend(error.secondary)
    except BaseException as error:first=actual_v6_part_error('parts-directory',error)
    finally:
        if descriptor is not None:
            try:os.close(descriptor)
            except BaseException as error:
                record=actual_v6_part_error('parts-directory-close',error)
                if first is None:first=record
                else:secondary.append(record)
    if first is not None:raise ActualV6PartsFailure(first,secondary)
    return expected


def main(argv=None):
    raw_args=list(sys.argv[1:] if argv is None else argv)
    if raw_args[:1]==['--actual-v8-parts']:
        need(ACTUAL_V8_READER_ENABLED is True,'actual v8 original reader disabled pending source review')
        parser=argparse.ArgumentParser(description='Independent bounded actual v8 parts audit',allow_abbrev=False)
        parser.add_argument('--actual-v8-parts',action='store_true')
        for name in ('manifest','parts','artifact'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==7 and raw_args[0]=='--actual-v8-parts' and
             raw_args[1]=='--manifest' and raw_args[3]=='--parts' and raw_args[5]=='--artifact',
             'exact seven-token actual v8 parts entry')
        args=parser.parse_args(raw_args)
        try:expected=actual_v8_parts_expected(args.manifest,args.parts)
        except ActualV6PartsFailure as error:
            print(encode({'pass':False,'firstFailure':error.firstFailure,'secondary':error.secondary}).decode(),
                  end='',file=sys.stderr)
            return 1
        expected_policy(expected)
        raw=bounded_input(args.artifact,expected['artifactBytes'])
        need(len(raw)==expected['artifactBytes'] and sha(raw)==expected['artifactSha256'],
             'external actual artifact digest')
        print(encode(audit(archive_originals(raw),expected)).decode(),end='');return 0
    if raw_args[:1]==['--actual-v7-parts']:
        need(ACTUAL_V7_READER_ENABLED is True,'actual v7 original reader disabled pending source review')
        parser=argparse.ArgumentParser(description='Independent bounded actual v7 parts audit',allow_abbrev=False)
        parser.add_argument('--actual-v7-parts',action='store_true')
        for name in ('manifest','parts','artifact'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==7 and raw_args[0]=='--actual-v7-parts' and
             raw_args[1]=='--manifest' and raw_args[3]=='--parts' and raw_args[5]=='--artifact',
             'exact seven-token actual v7 parts entry')
        args=parser.parse_args(raw_args)
        try:expected=actual_v7_parts_expected(args.manifest,args.parts)
        except ActualV6PartsFailure as error:
            print(encode({'pass':False,'firstFailure':error.firstFailure,'secondary':error.secondary}).decode(),
                  end='',file=sys.stderr)
            return 1
        expected_policy(expected)
        raw=bounded_input(args.artifact,expected['artifactBytes'])
        need(len(raw)==expected['artifactBytes'] and sha(raw)==expected['artifactSha256'],
             'external actual artifact digest')
        print(encode(audit(archive_originals(raw),expected)).decode(),end='');return 0
    if raw_args[:1]==['--actual-v6-parts']:
        parser=argparse.ArgumentParser(description='Independent bounded actual v6 parts audit',allow_abbrev=False)
        parser.add_argument('--actual-v6-parts',action='store_true')
        for name in ('manifest','parts','artifact'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==7 and raw_args[0]=='--actual-v6-parts' and
             raw_args[1]=='--manifest' and raw_args[3]=='--parts' and raw_args[5]=='--artifact',
             'exact seven-token actual v6 parts entry')
        args=parser.parse_args(raw_args)
        try:expected=actual_v6_parts_expected(args.manifest,args.parts)
        except ActualV6PartsFailure as error:
            print(encode({'pass':False,'firstFailure':error.firstFailure,'secondary':error.secondary}).decode(),
                  end='',file=sys.stderr)
            return 1
        expected_policy(expected)
        raw=bounded_input(args.artifact,expected['artifactBytes'])
        need(len(raw)==expected['artifactBytes'] and sha(raw)==expected['artifactSha256'],
             'external actual artifact digest')
        print(encode(audit(archive_originals(raw),expected)).decode(),end='');return 0
    if raw_args[:1] in (['--inventory-original-v5'],['--inventory-failure-v5'],
                        ['--inventory-original-v6'],['--inventory-failure-v6']):
        mode=raw_args[0]
        selected_version=6 if mode.endswith('-v6') else 5
        parser=argparse.ArgumentParser(description='Independent finite installed original audit',allow_abbrev=False)
        parser.add_argument(mode,action='store_true')
        for name in ('original','template','expected'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==7 and raw_args.count(mode)==1 and
             all(raw_args.count('--'+name)==1 for name in ('original','template','expected')),
             'exact versioned finite seven-token audit inputs')
        args=parser.parse_args(raw_args)
        expected=decode(bounded_input(args.expected,JSON_CAP))
        if mode.startswith('--inventory-original-'):
            inventory_admission_expected(expected)
            need(expected['schema']=='bw.gui-hdd.inventory-admission.v'+str(selected_version),'distinct finite positive expectation')
            original=bounded_input(args.original,expected['original']['byteLength'])
            template=bounded_input(args.template,expected['template']['byteLength'])
            verdict=verify_inventory_original(original,template,expected)
        else:
            inventory_failure_expected(expected)
            need(expected['schema']=='bw.gui-hdd.inventory-failure-expectation.v'+str(selected_version),'distinct finite failure expectation')
            original=bounded_input(args.original,expected['failure']['byteLength'])
            template=bounded_input(args.template,expected['template']['byteLength'])
            verdict=verify_inventory_failure(original,template,expected)
        print(encode(verdict).decode(),end='');return 0
    if raw_args[:1] in (['--font-bridge-delivery'],['--font-bridge-metadata']):
        mode=raw_args[0];parser=argparse.ArgumentParser(description='Independent bridge official metadata/delivery admission',allow_abbrev=False)
        names=('request','expected','run','job','artifact','workflow-proof','workflow')
        for name in names:parser.add_argument('--'+name,required=True)
        if mode=='--font-bridge-delivery':parser.add_argument('--font-bridge-delivery',required=True);names=('font-bridge-delivery',*names)
        else:parser.add_argument('--font-bridge-metadata',action='store_true');names=('font-bridge-metadata',*names)
        need(len(raw_args)==(16 if mode=='--font-bridge-delivery' else 15) and all(raw_args.count('--'+name)==1 for name in names),'exact bridge metadata/delivery audit inputs')
        args=parser.parse_args(raw_args);expected=decode(bounded_input(args.expected,JSON_CAP));font_bridge_delivery_expected(expected)
        request=bounded_input(args.request,expected['request']['byteLength'])
        metadata={key:bounded_input(getattr(args,'workflow_proof' if key=='workflowProof' else key),expected['metadata'][key]['byteLength']) for key in ('run','job','artifact','workflowProof')}
        workflow=bounded_input(args.workflow,expected['workflow']['byteLength'])
        admission=admit_font_bridge_metadata(request,expected,metadata,workflow)
        if mode=='--font-bridge-metadata':print(encode(admission).decode(),end='');return 0
        archive=bounded_input(args.font_bridge_delivery,expected['archive']['byteLength'])
        print(encode(verify_font_bridge_delivery(archive,request,expected,metadata,workflow)).decode(),end='');return 0
    if raw_args[:1]==['--font-bridge']:
        parser=argparse.ArgumentParser(description='Independent prior-referenced font bridge observation',allow_abbrev=False)
        for name in ('font-bridge','request','expected'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==6 and all(raw_args.count('--'+name)==1 for name in ('font-bridge','request','expected')),'exact bridge audit inputs')
        args=parser.parse_args(raw_args);expected=decode(bounded_input(args.expected,JSON_CAP));font_bridge_expected(expected)
        original=bounded_input(args.font_bridge,expected['original']['byteLength']);request=bounded_input(args.request,expected['request']['byteLength'])
        print(encode(verify_font_bridge(original,request,expected)).decode(),end='');return 0
    if raw_args[:1]==['--font-chain']:
        parser=argparse.ArgumentParser(description='Independent passive font chain observation',allow_abbrev=False)
        for name in ('font-chain','request','expected'):parser.add_argument('--'+name,required=True)
        need(len(raw_args)==6 and all(raw_args.count('--'+name)==1 for name in ('font-chain','request','expected')),'exact chain audit inputs')
        args=parser.parse_args(raw_args);expected=decode(bounded_input(args.expected,JSON_CAP));font_chain_expected(expected)
        original=bounded_input(args.font_chain,expected['original']['byteLength']);request=bounded_input(args.request,expected['request']['byteLength'])
        print(encode(verify_font_chain(original,request,expected)).decode(),end='');return 0
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
    need(expected['schema']!='bw.gui-hdd.actual-expectation.v8',
         'V8 requires the distinct bounded parts manifest and observed dispatch roles')
    raw=bounded_input(args.artifact,expected['artifactBytes'])
    need(len(raw)==expected['artifactBytes'] and sha(raw)==expected['artifactSha256'],'external actual artifact digest')
    print(encode(audit(archive_originals(raw),expected)).decode(),end='');return 0


if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        print(json.dumps({'pass':False,'firstFailure':{'name':type(error).__name__,'message':str(error)}}),file=sys.stderr);sys.exit(1)
