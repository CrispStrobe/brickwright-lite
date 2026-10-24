#!/usr/bin/env python3
"""Disabled, bounded native-font selection source candidate.

Pure controls inject operations. The live provider is unreachable while both
the producer and workflow guards remain false.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import resource
import selectors
import signal
import stat
import subprocess
import sys
import time
import urllib.request
from pathlib import Path, PurePosixPath

ENABLED = True
SCHEMA = 'bw.gui-hdd.native-font-request.v1'
ORIGINAL = 'bw.gui-hdd.native-font-original.v1'
SERVICE_ORIGINAL = 'bw.gui-hdd.native-font-service.v1'
REPOSITORY = 'CrispStrobe/brickwright-lite'
LABEL = 'x86-native-font-selection-v1'
WORKFLOW = '.github/workflows/i80386-native-font-selection.yml'
SOURCE = ('scripts/i80386-native-font-selection/run.py',
          'scripts/i80386-native-font-selection/reader.py',
          'scripts/i80386-native-font-selection/controls.py',
          'scripts/i80386-native-font-selection/README.md', WORKFLOW)
LIMITS = {'fontBytes': 2097152, 'configBytes': 16384,
          'cacheBytes': 8388608, 'cacheEntries': 128,
          'streamBytes': 131072, 'originalBytes': 2097152,
          'processWallSeconds': 30, 'processCpuSeconds': 30,
          'processAddressSpaceBytes': 536870912, 'processFileBytes': 8388608,
          'processOpenFiles': 64}
SERVICE = {'cpuQuotaPercent':100,'memoryMaxBytes':1073741824,
           'memorySwapMaxBytes':0,'tasksMax':64,'runtimeMaxSeconds':90,
           'killMode':'control-group'}
PATTERN = 'monospace:lang=en'
FORMAT = '%{file}\t%{family}\t%{style}\t%{index}\n'
FONT_URL = ('https://raw.githubusercontent.com/google/fonts/'
            '90d7886db9000c893b9559828bf028aaed5f9c10/'
            'apache/robotomono/RobotoMono%5Bwght%5D.ttf')
FONT_BYTES = 184768
FONT_SHA = '7d933841c1086c47dad91b2f249b1f8ecabce0d78469242e8bb52ef43cdc925b'
LICENSE_URL = ('https://raw.githubusercontent.com/google/fonts/'
               '90d7886db9000c893b9559828bf028aaed5f9c10/'
               'apache/robotomono/LICENSE.txt')
LICENSE_BYTES = 11358
LICENSE_SHA = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'
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

HEX40 = re.compile(r'[0-9a-f]{40}\Z')
HEX64 = re.compile(r'[0-9a-f]{64}\Z')
POSINT = re.compile(r'[1-9][0-9]{0,19}\Z')


def need(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=False, allow_nan=False).encode('utf-8')


def parse(raw, cap):
    need(type(raw) is bytes and 0 < len(raw) <= cap, 'bounded JSON bytes')
    def pairs(rows):
        result = {}
        for key, value in rows:
            need(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                       parse_constant=lambda _: need(False, 'nonfinite JSON'))
    need(type(value) is dict and encode(value) == raw, 'canonical JSON object')
    return value


def parse_event(raw):
    """Decode exact runner bytes without imposing request canonicalization."""
    need(type(raw) is bytes and 0<len(raw)<=256<<10,'bounded raw event bytes')
    def pairs(rows):
        value={}
        for key,item in rows:
            need(key not in value,'duplicate raw event key');value[key]=item
        return value
    def finite(token):
        value=float(token)
        need(-float('inf')<value<float('inf'),'finite raw event number')
        return value
    try:
        value=json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_float=finite,
            parse_constant=lambda _:need(False,'nonfinite raw event number'))
    except (ValueError,UnicodeError,RecursionError) as error:
        raise ValueError('invalid raw event JSON') from error
    need(type(value) is dict,'raw event object')
    return value


def keys(value, expected, name):
    need(type(value) is dict and set(value) == set(expected.split()), 'closed '+name)


def digest(value, length=64):
    need(type(value) is str and (HEX64 if length == 64 else HEX40).fullmatch(value),
         'lowercase digest')


def integer(value, low, high):
    need(type(value) is int and low <= value <= high, 'bounded integer')


def relative(path):
    need(type(path) is str and 0 < len(path) <= 240 and '\x00' not in path and
         not path.startswith('/') and '\\' not in path and
         all(part not in ('', '.', '..') for part in path.split('/')) and
         str(PurePosixPath(path)) == path, 'canonical relative path')


def absolute(path):
    need(type(path) is str and 1 < len(path) <= 512 and path.startswith('/') and
         '\x00' not in path and '\\' not in path and
         all(part not in ('', '.', '..') for part in path[1:].split('/')),
         'canonical absolute path')


def runtime_selection(value):
    keys(value, 'files aliases directoryAliases', 'selected runtime')
    need(type(value['files']) is dict and 1 <= len(value['files']) <= 64 and
         '/usr/bin/fc-match' in value['files'], 'finite runtime files and tool')
    for path, item in value['files'].items():
        absolute(path); keys(item, 'bytes sha256', 'runtime file')
        integer(item['bytes'], 1, 32<<20); digest(item['sha256'])
    for role, cap in (('aliases',32), ('directoryAliases',16)):
        rows = value[role]
        need(type(rows) is dict and len(rows) <= cap, 'finite runtime aliases')
        for path, item in rows.items():
            absolute(path); keys(item, 'linkText target', role+' row')
            absolute(item['target'])
            need(item['target'] in value['files'] and type(item['linkText']) is str and
                 0 < len(item['linkText'].encode()) <= 512, 'selected alias terminal')
    need(not (set(value['files']) & (set(value['aliases']) | set(value['directoryAliases']))) and
         not (set(value['aliases']) & set(value['directoryAliases'])),
         'disjoint runtime file and alias names')


def admitted_request(raw, expected_sha):
    digest(expected_sha)
    need(sha(raw) == expected_sha, 'externally selected request SHA')
    value = parse(raw, 65536)
    keys(value, 'schema repository pullRequest source selection limits', 'request')
    need(value['schema'] == SCHEMA and value['repository'] == REPOSITORY,
         'owned native-font request')
    integer(value['pullRequest'], 1, 2**31-1)
    source = value['source']; keys(source, 'head tree files', 'source')
    digest(source['head'], 40); digest(source['tree'], 40)
    need(type(source['files']) is dict and set(source['files']) == set(SOURCE),
         'exact five source files')
    for item in source['files'].values():
        keys(item, 'sha256', 'source file'); digest(item['sha256'])
    selection = value['selection']; keys(selection, 'font tool query runtime', 'selection')
    font = selection['font']
    keys(font, 'url bytes sha256 licenseUrl licenseBytes licenseSha256 family', 'font')
    google_fonts_raw_url(font['url']);google_fonts_raw_url(font['licenseUrl'])
    need(font['url']==FONT_URL and font['bytes']==FONT_BYTES and font['sha256']==FONT_SHA and
         font['licenseUrl']==LICENSE_URL and font['licenseBytes']==LICENSE_BYTES and
         font['licenseSha256']==LICENSE_SHA,
         'reviewed immutable Apache-2.0 mono font and notice')
    need(font['family'] == 'Roboto Mono', 'selected font family')
    tool = selection['tool']; keys(tool, 'path bytes sha256', 'tool')
    need(tool['path'] == '/usr/bin/fc-match', 'one absolute native endpoint')
    integer(tool['bytes'], 1, 8 << 20); digest(tool['sha256'])
    runtime_selection(selection['runtime'])
    need(selection['runtime']['files']['/usr/bin/fc-match'] ==
         {'bytes':tool['bytes'],'sha256':tool['sha256']}, 'selected runtime tool join')
    keys(selection['query'], 'pattern format', 'query')
    need(selection['query'] == {'pattern': PATTERN, 'format': FORMAT}, 'fixed one native query')
    keys(value['limits'], 'fontBytes configBytes cacheBytes cacheEntries streamBytes originalBytes processWallSeconds processCpuSeconds processAddressSpaceBytes processFileBytes processOpenFiles', 'limits')
    for name, expected in LIMITS.items():
        integer(value['limits'][name], expected, expected)
    return value


def admitted_event(raw, request, env, expected_sha):
    event = parse_event(raw)
    pr = event.get('pull_request', {})
    need(event.get('action') == 'labeled' and
         event.get('label', {}).get('name') == LABEL and
         event.get('sender', {}).get('login') == 'CrispStrobe' and
         event.get('repository', {}).get('full_name') == REPOSITORY and
         type(event.get('number')) is int and event['number'] == request['pullRequest'] and
         type(pr.get('number')) is int and pr['number'] == request['pullRequest'] and
         pr.get('state') == 'open' and
         pr.get('head', {}).get('sha') == request['source']['head'] and
         pr.get('head', {}).get('repo', {}).get('full_name') == REPOSITORY and
         pr['head']['repo'].get('fork') is False and
         pr.get('base', {}).get('ref') == 'main' and
         pr['base'].get('repo', {}).get('full_name') == REPOSITORY,
         'owned first-attempt font event')
    marker = '<!-- BW_NATIVE_FONT_REQUEST_SHA256='+expected_sha+' -->'
    body = pr.get('body')
    need(type(body) is str and body.count('<!-- BW_NATIVE_FONT_REQUEST_SHA256=') == 1 and
         body.count(marker) == 1, 'one selected request marker')
    fixed = {'GITHUB_REPOSITORY': REPOSITORY, 'GITHUB_EVENT_NAME': 'pull_request',
             'GITHUB_ACTOR': 'CrispStrobe', 'GITHUB_JOB': 'native-font-selection',
             'GITHUB_RUN_ATTEMPT': '1', 'BW_EXPECTED_HEAD': request['source']['head'],
             'BW_EXPECTED_TREE': request['source']['tree'],
             'GITHUB_WORKFLOW_REF': REPOSITORY+'/'+WORKFLOW+'@refs/pull/'+str(request['pullRequest'])+'/merge'}
    need(all(env.get(name) == selected for name, selected in fixed.items()),
         'selected platform and workflow context')
    need(type(env.get('GITHUB_RUN_ID')) is str and POSINT.fullmatch(env['GITHUB_RUN_ID']) and
         type(env.get('GITHUB_WORKFLOW_SHA')) is str and HEX40.fullmatch(env['GITHUB_WORKFLOW_SHA']),
         'actual run and workflow identity')
    return event


def config_bytes(font_dir, cache_dir):
    absolute(font_dir); absolute(cache_dir)
    need(re.fullmatch(r'/[A-Za-z0-9_./-]+', font_dir) and
         re.fullmatch(r'/[A-Za-z0-9_./-]+', cache_dir), 'XML-safe owned directory')
    raw = ('<?xml version="1.0"?>\n<fontconfig>\n  <dir>'+font_dir+
           '</dir>\n  <cachedir>'+cache_dir+'</cachedir>\n</fontconfig>\n').encode()
    need(len(raw) <= LIMITS['configBytes'], 'bounded authored configuration')
    return raw


def error_row(exc, phase):
    return {'phase': phase, 'name': type(exc).__name__[:80], 'message': str(exc)[:512]}


def cache_snapshot(value, label):
    keys(value, 'root owned exclusive entries totalBytes', label+' cache')
    absolute(value['root'])
    need(value['owned'] is True and value['exclusive'] is True and
         type(value['entries']) is list and len(value['entries']) <= LIMITS['cacheEntries'],
         'exclusive bounded cache')
    integer(value['totalBytes'], 0, LIMITS['cacheBytes'])
    seen = set(); total = 0
    for entry in value['entries']:
        keys(entry, 'path bytes sha256', 'cache entry')
        absolute(entry['path'])
        need(entry['path'].startswith(value['root']+'/') and entry['path'] not in seen,
             'unique owned cache entry')
        seen.add(entry['path'])
        integer(entry['bytes'], 0, LIMITS['cacheBytes']); digest(entry['sha256'])
        total += entry['bytes']
    need(total == value['totalBytes'], 'exact cache aggregate')


def process_result(value, stage, selection):
    keys(value, 'argv environment stdout stderr exitCode timedOut wallMilliseconds firstFailure secondary resourceLimits', 'process')
    need(value['resourceLimits'] == {'cpuSeconds':LIMITS['processCpuSeconds'],
         'addressSpaceBytes':LIMITS['processAddressSpaceBytes'],
         'fileBytes':LIMITS['processFileBytes'],'openFiles':LIMITS['processOpenFiles'],
         'coreBytes':0,'appliedBeforeExec':True}, 'pre-exec finite process limits')
    need(value['argv'] == ['/usr/bin/fc-match', '--format', FORMAT, PATTERN], 'one fixed tool invocation')
    expected = {'LANG': 'C.UTF-8', 'HOME': '/nonexistent', 'PATH': '/usr/bin:/bin',
                'FONTCONFIG_FILE': stage['configPath'], 'XDG_CACHE_HOME': stage['cacheDir']}
    need(value['environment'] == expected, 'fixed native process environment')
    for stream in ('stdout', 'stderr'):
        need(type(value[stream]) is str and len(value[stream].encode()) <= LIMITS['streamBytes'],
             'bounded native stream')
    integer(value['wallMilliseconds'], 0, LIMITS['processWallSeconds']*1000)
    need(value['exitCode'] == 0 and type(value['exitCode']) is int and value['timedOut'] is False and
         value['firstFailure'] is None and value['secondary'] == [] and value['stderr'] == '',
         'terminal native process')
    lines = value['stdout'].splitlines(keepends=True)
    need(len(lines) == 1 and lines[0].endswith('\n'), 'one complete native selection')
    parts = lines[0][:-1].split('\t')
    need(len(parts) == 4 and parts[0] == stage['fontPath'] and
         selection['font']['family'] in parts[1].split(',') and parts[3] == '0' and
         0 < len(parts[2]) <= 80, 'selected exact staged face/index')
    return {'file': parts[0], 'family': parts[1], 'style': parts[2], 'index': 0}


def service_snapshot(value, phase):
    keys(value, 'unit cgroupPath selfPid cpuMax memoryMax swapMax pidsMax memoryCurrent pidsCurrent populated frozen procs threads childCgroups nrDescendants nrDyingDescendants oomKill pidsLimitEvents', phase+' service')
    need(type(value['unit']) is str and re.fullmatch(r'bw-native-font-[1-9][0-9]{0,19}-1\.service',value['unit']),
         'selected transient service unit')
    need(type(value['cgroupPath']) is str and
         value['cgroupPath']=='/system.slice/'+value['unit'], 'selected service cgroup')
    integer(value['selfPid'],1,2**31-1)
    need(value['cpuMax']==[100000,100000] and value['memoryMax']==SERVICE['memoryMaxBytes'] and
         value['swapMax']==SERVICE['memorySwapMaxBytes'] and value['pidsMax']==SERVICE['tasksMax'],
         'effective service cgroup resource caps')
    integer(value['memoryCurrent'],0,SERVICE['memoryMaxBytes'])
    integer(value['pidsCurrent'],1,SERVICE['tasksMax'])
    need(value['populated'] == 1 and value['frozen'] == 0, 'active unfrozen service')
    for name in ('procs','threads'):
        need(type(value[name]) is list and 1<=len(value[name])<=SERVICE['tasksMax'] and
             all(type(item) is int and 0<item<2**31 for item in value[name]) and
             value[name]==sorted(set(value[name])), 'bounded service '+name)
    need(value['procs']==[value['selfPid']] and value['childCgroups']==[] and
         value['nrDescendants']==0 and value['nrDyingDescendants']==0,
         'exclusive service process and no live/dying descendant cgroups')
    integer(value['oomKill'],0,2**63-1)
    integer(value['pidsLimitEvents'],0,2**63-1)


def collect(request_raw, expected_sha, env, ops):
    """Pure orchestration over injected edges; all source controls use fakes."""
    need(ENABLED is True, 'native font producer disabled before any observation')
    value = {'schema': ORIGINAL, 'request': None, 'event': None, 'platform': None,
             'source': None, 'input': None, 'stage': None, 'config': None,
             'cacheBefore': None, 'process': None, 'cacheAfter': None,
             'selection': None, 'nativeRuntime': None, 'service':{'before':None,'after':None},
             'cleanup': None, 'failurePartial':None, 'complete': False,
             'firstFailure': None, 'secondary': [], 'observationOnly': True,
             'systemFallbackExcluded': False, 'nativeLibraryClosureProved': False,
             'selectedNativeRuntimeReadbackProved': False, 'wholeHostAttested': False,
             'browserFontSelectionProved': False, 'actualRequestSupported': False,
             'guestApproved': False}
    first = None; secondary = []; stage = None; child_uncertain = False
    try:
        request = admitted_request(request_raw, expected_sha)
        value['request'] = {'bytes': len(request_raw), 'sha256': sha(request_raw)}
        event_raw = ops.event()
        admitted_event(event_raw, request, env, expected_sha)
        value['event'] = {'bytes': len(event_raw), 'sha256': sha(event_raw)}
        value['platform'] = {name: env[name] for name in (
            'GITHUB_REPOSITORY','GITHUB_EVENT_NAME','GITHUB_ACTOR','GITHUB_JOB',
            'GITHUB_RUN_ATTEMPT','GITHUB_RUN_ID','GITHUB_WORKFLOW_SHA',
            'GITHUB_WORKFLOW_REF','BW_EXPECTED_HEAD','BW_EXPECTED_TREE')}
        need(ops.git() == {'head': request['source']['head'], 'tree': request['source']['tree']},
             'exact checkout source identity')
        observed = {}
        for path in SOURCE:
            raw = ops.source(path)
            need(type(raw) is bytes and len(raw) <= 1<<20 and
                 sha(raw) == request['source']['files'][path]['sha256'], 'exact source byte')
            observed[path] = {'bytes': len(raw), 'sha256': sha(raw)}
        value['source'] = observed
        value['service']['before'] = ops.service('before')
        service_snapshot(value['service']['before'], 'before')
        tool = ops.tool('/usr/bin/fc-match', 8<<20)
        need(type(tool) is bytes and len(tool) == request['selection']['tool']['bytes'] and
             sha(tool) == request['selection']['tool']['sha256'], 'exact selected native tool before input GET')
        runtime_before = ops.runtime(request['selection']['runtime'])
        need(runtime_before == request['selection']['runtime'],
             'exact selected native runtime before input GET')
        value['input']={'fontUrl':FONT_URL,'fontBytes':None,'fontSha256':None,
                        'licenseUrl':LICENSE_URL,'licenseBytes':None,'licenseSha256':None,
                        'toolBytes':len(tool),'toolSha256':sha(tool)}
        font = ops.input(FONT_URL, FONT_BYTES)
        value['input']['fontBytes']=len(font);value['input']['fontSha256']=sha(font)
        notice = ops.input(LICENSE_URL, LICENSE_BYTES)
        value['input']['licenseBytes']=len(notice);value['input']['licenseSha256']=sha(notice)
        need(type(font) is bytes and len(font) == request['selection']['font']['bytes'] and
             sha(font) == request['selection']['font']['sha256'] and
             type(notice) is bytes and len(notice)==LICENSE_BYTES and
             sha(notice) == request['selection']['font']['licenseSha256'],
             'exact selected font and notice')
        stage = ops.stage(font)
        keys(stage, 'fontPath fontDir cacheDir configPath owned exclusive stable', 'stage')
        for name in ('fontPath','fontDir','cacheDir','configPath'): absolute(stage[name])
        need(stage['owned'] is True and stage['exclusive'] is True and stage['stable'] is True and
             stage['fontPath'].startswith(stage['fontDir']+'/') and
             len({stage['fontDir'],stage['cacheDir'],stage['configPath']}) == 3,
             'exclusive stable staged font')
        value['stage'] = stage
        config = config_bytes(stage['fontDir'], stage['cacheDir'])
        written = ops.write_config(stage['configPath'], config)
        need(written == {'bytes': len(config), 'sha256': sha(config), 'stable': True},
             'authored config write/readback')
        value['config'] = {'bytes': len(config), 'sha256': sha(config), 'text': config.decode()}
        value['cacheBefore'] = ops.cache('before', stage['cacheDir'])
        cache_snapshot(value['cacheBefore'], 'before')
        need(value['cacheBefore']['entries'] == [], 'empty exclusive cache before process')
        argv = ['/usr/bin/fc-match', '--format', FORMAT, PATTERN]
        environment = {'LANG': 'C.UTF-8', 'HOME': '/nonexistent', 'PATH': '/usr/bin:/bin',
                       'FONTCONFIG_FILE': stage['configPath'], 'XDG_CACHE_HOME': stage['cacheDir']}
        value['nativeRuntime'] = {'files': runtime_before['files'],
                                  'aliases': runtime_before['aliases'],
                                  'directoryAliases': runtime_before['directoryAliases'],
                                  'loadedLibraries': [], 'version': None,
                                  'environment': environment, 'after': None,
                                  'selectedReadback': False}
        value['process'] = ops.process(argv, environment, LIMITS['streamBytes'],
                                       LIMITS['processWallSeconds'])
        value['selection'] = process_result(value['process'], stage, request['selection'])
        runtime_after = ops.runtime(request['selection']['runtime'])
        need(runtime_after == runtime_before, 'stable selected runtime after process')
        value['nativeRuntime']['after'] = runtime_after
        value['nativeRuntime']['selectedReadback'] = True
        value['selectedNativeRuntimeReadbackProved'] = True
        value['cacheAfter'] = ops.cache('after', stage['cacheDir'])
        cache_snapshot(value['cacheAfter'], 'after')
        need(value['cacheAfter']['root'] == stage['cacheDir'], 'same owned cache after process')
        value['service']['after'] = ops.service('after')
        service_snapshot(value['service']['after'], 'after')
        need(value['service']['after']['cgroupPath']==value['service']['before']['cgroupPath'] and
             value['service']['after']['unit']==value['service']['before']['unit'] and
             value['service']['after']['selfPid']==value['service']['before']['selfPid'] and
             value['service']['after']['oomKill']==value['service']['before']['oomKill'] and
             value['service']['after']['pidsLimitEvents']==value['service']['before']['pidsLimitEvents'],
             'stable bounded service and no OOM/task-cap event')
    except BaseException as exc:
        first = error_row(exc, 'native-font-observation')
        secondary.extend(getattr(exc, 'native_secondary', []))
        child_uncertain = getattr(exc, 'native_child_uncertain', False)
        value['failurePartial']=getattr(exc,'native_partial',None)
    finally:
        if stage is not None and child_uncertain:
            secondary.append(error_row(ValueError('owned stage cleanup deferred: child lifetime unknown'),
                                       'native-font-cleanup-deferred'))
        elif stage is not None:
            try:
                value['cleanup'] = ops.cleanup(stage)
                need(value['cleanup'] == {'removedExactOwnedStage': True,
                     'removedExactOwnedCache': True}, 'exact owned terminal cleanup')
            except BaseException as exc:
                row = error_row(exc, 'native-font-cleanup')
                if first is None: first = row
                else: secondary.append(row)
        elif hasattr(ops, 'cleanup_partial'):
            try: ops.cleanup_partial()
            except BaseException as exc:
                row = error_row(exc, 'native-font-partial-cleanup')
                if first is None: first = row
                else: secondary.append(row)
    value['firstFailure'], value['secondary'] = first, secondary
    value['complete'] = first is None and not secondary and value['selection'] is not None
    raw = encode(value)
    need(len(raw)+1 <= LIMITS['originalBytes'], 'entire canonical original output cap')
    return raw+b'\n'


class LiveOps:
    """Bounded selected host edges behind the admitted event and source gates."""
    def __init__(self, env):
        self.env = dict(env)
        self.root = None
        self.root_identity = None
        self.owned = {}

    @staticmethod
    def identity(info):
        return (info.st_dev,info.st_ino,info.st_mode,info.st_uid,info.st_gid,
                info.st_nlink,info.st_size,info.st_mtime_ns)

    @staticmethod
    def directory_identity(info):
        need(stat.S_ISDIR(info.st_mode), 'owned stage object remains a directory')
        return (info.st_dev,info.st_ino,info.st_mode,info.st_uid,info.st_gid)

    def regular(self, path, cap):
        descriptor = os.open(path, os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
        first = None; chunks = []; count = 0
        try:
            before = os.fstat(descriptor)
            need(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= cap and
                 before.st_nlink == 1, 'selected bounded regular file')
            while True:
                part = os.read(descriptor, min(65536, cap+1-count))
                if not part: break
                count += len(part); need(count <= cap, 'bounded regular read')
                chunks.append(part)
            after = os.fstat(descriptor); named = os.lstat(path)
            need(count == before.st_size and self.identity(before) == self.identity(after) ==
                 self.identity(named), 'held and named regular file unchanged')
        except BaseException as error: first = error
        try: os.close(descriptor)
        except BaseException as error:
            if first is None: first = error
            else: first.native_secondary = getattr(first,'native_secondary',[])+[error_row(error,'close')]
        if first is not None: raise first
        return b''.join(chunks)

    def event(self):
        path = self.env.get('GITHUB_EVENT_PATH','')
        absolute(path)
        return self.regular(path,256<<10)

    def pseudo(self,path,cap=8192):
        descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
        first=None;parts=[];count=0
        try:
            before=os.fstat(descriptor)
            need(stat.S_ISREG(before.st_mode) and before.st_uid==0,
                 'root-owned cgroup or proc text')
            while True:
                part=os.read(descriptor,min(4096,cap+1-count))
                if not part:break
                count+=len(part);need(count<=cap,'bounded cgroup text')
                parts.append(part)
            after=os.fstat(descriptor);named=os.lstat(path)
            stable=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid,x.st_gid)
            need(stable(before)==stable(after)==stable(named),'same cgroup/proc text object')
        except BaseException as exc:first=exc
        try:os.close(descriptor)
        except BaseException as exc:
            if first is None:first=exc
            else:first.native_secondary=getattr(first,'native_secondary',[])+[error_row(exc,'pseudo-close')]
        if first is not None:raise first
        return b''.join(parts).decode('ascii','strict')

    def service(self,phase):
        need(phase in ('before','after'),'finite service observation phase')
        run=self.env.get('GITHUB_RUN_ID','')
        need(type(run) is str and POSINT.fullmatch(run),'selected service run ID')
        unit='bw-native-font-'+run+'-1.service'
        lines=self.pseudo('/proc/self/cgroup',4096).splitlines()
        need(len(lines)==1 and lines[0].startswith('0::'),'unified service cgroup')
        path=lines[0][3:]
        need(path=='/system.slice/'+unit,'exact selected transient service cgroup')
        base='/sys/fs/cgroup'+path
        def one(name):return self.pseudo(base+'/'+name,8192).strip()
        def scalar(name):
            raw=one(name);need(re.fullmatch(r'[0-9]+',raw),'numeric cgroup '+name)
            return int(raw)
        def kv(name):
            values={}
            for line in one(name).splitlines():
                bits=line.split(' ')
                need(len(bits)==2 and bits[0] not in values and re.fullmatch(r'[0-9]+',bits[1]),
                     'bounded cgroup '+name+' row')
                values[bits[0]]=int(bits[1])
            return values
        def ids(name):
            text=one(name)
            return sorted(set(int(x) for x in text.splitlines())) if text else []
        cpu=one('cpu.max').split(' ')
        need(len(cpu)==2 and all(re.fullmatch(r'[0-9]+',x) for x in cpu),'numeric cpu quota')
        events=kv('cgroup.events');memory=kv('memory.events');pids=kv('pids.events')
        cstat=kv('cgroup.stat')
        with os.scandir(base) as scan:
            child_cgroups=sorted(entry.name for entry in scan if entry.is_dir(follow_symlinks=False))
        need(len(child_cgroups)<=64,'finite child cgroup census')
        return {'unit':unit,'cgroupPath':path,'selfPid':os.getpid(),
            'cpuMax':[int(x) for x in cpu],'memoryMax':scalar('memory.max'),
            'swapMax':scalar('memory.swap.max'),'pidsMax':scalar('pids.max'),
            'memoryCurrent':scalar('memory.current'),'pidsCurrent':scalar('pids.current'),
            'populated':events.get('populated'),'frozen':events.get('frozen'),
            'procs':ids('cgroup.procs'),'threads':ids('cgroup.threads'),
            'childCgroups':child_cgroups,'nrDescendants':cstat.get('nr_descendants'),
            'nrDyingDescendants':cstat.get('nr_dying_descendants'),
            'oomKill':memory.get('oom_kill'),'pidsLimitEvents':pids.get('max')}

    def git(self):
        clean={'LANG':'C.UTF-8','HOME':'/nonexistent','PATH':'/usr/bin:/bin'}
        def command(args):
            item = subprocess.run(['/usr/bin/git','--no-replace-objects','-c','gc.auto=0',
                '-c','maintenance.auto=false',*args],cwd=Path.cwd(),env=clean,
                stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                timeout=10,check=False)
            need(item.returncode == 0 and len(item.stdout) == 41 and
                 item.stderr == b'' and item.stdout.endswith(b'\n'),
                 'bounded exact Git source identity')
            return item.stdout.decode().strip()
        head = command(['rev-parse','HEAD'])
        tree = command(['rev-parse','HEAD^{tree}'])
        for args in (['diff','--quiet'],['diff','--cached','--quiet']):
            result=subprocess.run(['/usr/bin/git','--no-replace-objects','-c','gc.auto=0',
                '-c','maintenance.auto=false',*args],cwd=Path.cwd(),env=clean,
                stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                timeout=10,check=False)
            need(result.returncode==0 and result.stdout==b'' and result.stderr==b'',
                 'clean selected checkout')
        return {'head':head,'tree':tree}

    def source(self,path):
        relative(path)
        return self.regular(str(Path.cwd()/path),1<<20)

    def input(self,path,cap):
        google_fonts_raw_url(path)
        selected={FONT_URL:(FONT_BYTES,FONT_SHA),LICENSE_URL:(LICENSE_BYTES,LICENSE_SHA)}
        need(path in selected and cap == selected[path][0], 'one immutable selected font/notice URL')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs):
                raise ValueError('selected immutable font redirect refused')
        request=urllib.request.Request(path,headers={'Accept-Encoding':'identity',
            'User-Agent':'bw-native-font-selection/1'})
        with urllib.request.build_opener(NoRedirect).open(request,timeout=10) as reply:
            need(reply.status==200 and reply.headers.get('Content-Encoding') in (None,'identity') and
                 reply.headers.get('Content-Length')==str(cap), 'exact immutable font response')
            parts=[];received=0;start=time.monotonic()
            while True:
                need(time.monotonic()-start<20,'bounded immutable font transfer')
                chunk=reply.read(min(65536,cap+1-received))
                if not chunk:break
                received+=len(chunk);need(received<=cap,'font response cap')
                parts.append(chunk)
        data=b''.join(parts)
        need(len(data)==cap and sha(data)==selected[path][1],
             'exact immutable font/notice bytes')
        return data

    def tool(self,path,cap):
        need(path == '/usr/bin/fc-match','selected absolute native endpoint')
        return self.regular(path,cap)

    def runtime(self,selected):
        runtime_selection(selected)
        result = {'files':{},'aliases':{},'directoryAliases':{}}
        total = 0
        for path,expected in selected['files'].items():
            raw = self.regular(path,min(expected['bytes'],32<<20))
            total += len(raw); need(total <= 64<<20,'finite selected runtime aggregate')
            result['files'][path] = {'bytes':len(raw),'sha256':sha(raw)}
        for role in ('aliases','directoryAliases'):
            for path,expected in selected[role].items():
                info = os.lstat(path)
                need(stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and info.st_gid == 0,
                     'selected root-owned alias')
                link = os.readlink(path); target = str(Path(path).resolve(strict=True))
                after = os.lstat(path)
                need(self.identity(info) == self.identity(after) and os.readlink(path) == link,
                     'stable selected alias')
                result[role][path] = {'linkText':link,'target':target}
        return result

    def _new_file(self,path,data,mode=0o600):
        descriptor = os.open(path,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,mode)
        self.owned[str(path)] = None  # Returned O_EXCL fd owns path even if fstat fails.
        first = None
        try:
            need(os.write(descriptor,data) == len(data),'complete exclusive write')
            os.lseek(descriptor,0,os.SEEK_SET)
            readback = bytearray()
            while len(readback) <= len(data):
                part = os.read(descriptor,min(65536,len(data)+1-len(readback)))
                if not part:break
                readback.extend(part)
            held=os.fstat(descriptor);named=os.lstat(path)
            need(bytes(readback)==data and self.identity(held)==self.identity(named),
                 'held named exclusive readback')
            self.owned[str(path)] = self.identity(held)
        except BaseException as error:first=error
        try:os.close(descriptor)
        except BaseException as error:
            if first is None:first=error
            else:first.native_secondary=getattr(first,'native_secondary',[])+[error_row(error,'close')]
        if first is not None:raise first
        return {'bytes':len(data),'sha256':sha(data),'stable':True}

    def stage(self,font):
        run = self.env.get('GITHUB_RUN_ID','')
        need(type(run) is str and POSINT.fullmatch(run),'selected run before stage')
        parent=self.env.get('RUNNER_TEMP','')
        absolute(parent)
        root=Path(parent)/('bw-native-font-'+run+'-1')
        os.mkdir(root,0o700);self.root=root
        self.root_identity=self.directory_identity(root.lstat())
        font_dir=root/'font';cache_dir=root/'cache'
        os.mkdir(font_dir,0o700)
        self.owned[str(font_dir)]=self.directory_identity(font_dir.lstat())
        os.mkdir(cache_dir,0o700)
        self.owned[str(cache_dir)]=self.directory_identity(cache_dir.lstat())
        font_path=font_dir/'selected.ttf'
        self._new_file(font_path,font)
        return {'fontPath':str(font_path),'fontDir':str(font_dir),
                'cacheDir':str(cache_dir),'configPath':str(root/'fontconfig.xml'),
                'owned':True,'exclusive':True,'stable':True}

    def write_config(self,path,raw):
        need(self.root is not None and path == str(self.root/'fontconfig.xml'),
             'owned exact authored config path')
        return self._new_file(path,raw)

    def cache(self,phase,path):
        need(phase in ('before','after') and self.root is not None and
             path == str(self.root/'cache'),'owned cache only')
        entries=[];total=0
        with os.scandir(path) as scan:
            for entry in scan:
                need(entry.is_file(follow_symlinks=False),'regular flat owned cache')
                raw=self.regular(entry.path,LIMITS['cacheBytes'])
                total+=len(raw);need(total<=LIMITS['cacheBytes'] and
                    len(entries)<LIMITS['cacheEntries'],'bounded cache contents')
                entries.append({'path':entry.path,'bytes':len(raw),'sha256':sha(raw)})
                self.owned[entry.path]=self.identity(os.lstat(entry.path))
        entries.sort(key=lambda row:row['path'])
        return {'root':path,'owned':True,'exclusive':True,'entries':entries,'totalBytes':total}

    def process(self,argv,environment,stream_cap,timeout):
        need(argv == ['/usr/bin/fc-match','--format',FORMAT,PATTERN] and
             timeout == LIMITS['processWallSeconds'] and stream_cap == LIMITS['streamBytes'],
             'one bounded selected native process')
        def limits_before_exec():
            selected=((resource.RLIMIT_CPU,LIMITS['processCpuSeconds']),
                      (resource.RLIMIT_AS,LIMITS['processAddressSpaceBytes']),
                      (resource.RLIMIT_FSIZE,LIMITS['processFileBytes']),
                      (resource.RLIMIT_NOFILE,LIMITS['processOpenFiles']),
                      (resource.RLIMIT_CORE,0))
            for kind,maximum in selected:
                resource.setrlimit(kind,(maximum,maximum))
                if resource.getrlimit(kind)!=(maximum,maximum):os._exit(126)
        child=subprocess.Popen(argv,env=environment,cwd=Path.cwd(),stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,close_fds=True,
            preexec_fn=limits_before_exec)
        selector=None;output={'stdout':bytearray(),'stderr':bytearray()}
        start=time.monotonic();failure=None;timed_out=False
        try:
            selector=selectors.DefaultSelector()
            for name,stream in (('stdout',child.stdout),('stderr',child.stderr)):
                os.set_blocking(stream.fileno(),False)
                selector.register(stream,selectors.EVENT_READ,name)
            while selector.get_map() or child.poll() is None:
                if time.monotonic()-start >= timeout:
                    timed_out=True;raise TimeoutError('native process wall bound')
                for key,_ in selector.select(.05):
                    data=os.read(key.fileobj.fileno(),65536)
                    if data:
                        available=stream_cap-sum(map(len,output.values()))
                        output[key.data].extend(data[:available])
                        need(len(data)<=available,'combined native output cap')
                    else:selector.unregister(key.fileobj)
            child.wait(timeout=2)
        except BaseException as error:
            failure=error
            try:os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            except BaseException as secondary:
                error.native_secondary=getattr(error,'native_secondary',[])+[error_row(secondary,'killpg')]
                error.native_child_uncertain=True
            try:child.wait(timeout=5)
            except BaseException as secondary:
                error.native_secondary=getattr(error,'native_secondary',[])+[error_row(secondary,'reap')]
                error.native_child_uncertain=True
        finally:
            for name,close in (('selector-close',selector.close if selector is not None else None),
                               ('stdout-close',child.stdout.close),
                               ('stderr-close',child.stderr.close)):
                if close is None:continue
                try:close()
                except BaseException as secondary:
                    if failure is None:failure=secondary
                    else:failure.native_secondary=getattr(failure,'native_secondary',[])+[
                        error_row(secondary,name)]
        if failure is not None:
            failure.native_partial={'phase':'native-process','pid':child.pid,
                'reaped':child.poll() is not None,
                'stdoutPrefixBytes':len(output['stdout']),
                'stdoutPrefixSha256':sha(bytes(output['stdout'])),
                'stdoutPrefixBase64':base64.b64encode(bytes(output['stdout'])).decode('ascii'),
                'stderrPrefixBytes':len(output['stderr']),
                'stderrPrefixSha256':sha(bytes(output['stderr'])),
                'stderrPrefixBase64':base64.b64encode(bytes(output['stderr'])).decode('ascii'),
                'wallMilliseconds':int((time.monotonic()-start)*1000)}
        if failure is not None:raise failure
        return {'argv':argv,'environment':environment,
            'stdout':bytes(output['stdout']).decode('utf-8','strict'),
            'stderr':bytes(output['stderr']).decode('utf-8','strict'),
            'exitCode':child.returncode,'timedOut':timed_out,
            'wallMilliseconds':int((time.monotonic()-start)*1000),
            'resourceLimits':{'cpuSeconds':LIMITS['processCpuSeconds'],
                'addressSpaceBytes':LIMITS['processAddressSpaceBytes'],
                'fileBytes':LIMITS['processFileBytes'],'openFiles':LIMITS['processOpenFiles'],
                'coreBytes':0,'appliedBeforeExec':True},
            'firstFailure':None,'secondary':[]}

    def cleanup(self,stage):
        need(self.root is not None and stage['fontPath'] == str(self.root/'font/selected.ttf'),
             'known owned stage cleanup')
        for path in sorted(self.owned,key=len,reverse=True):
            info=os.lstat(path)
            current=self.directory_identity(info) if stat.S_ISDIR(info.st_mode) else self.identity(info)
            need(self.owned[path] is not None and current == self.owned[path],
                 'same exact known owned cleanup object')
            if stat.S_ISDIR(info.st_mode):os.rmdir(path)
            else:os.unlink(path)
        need(self.directory_identity(self.root.lstat()) == self.root_identity,
             'same exact owned stage root')
        os.rmdir(self.root);self.root=None
        return {'removedExactOwnedStage':True,'removedExactOwnedCache':True}

    def cleanup_partial(self):
        if self.root is None:return
        for path in sorted(self.owned,key=len,reverse=True):
            info=os.lstat(path)
            current=self.directory_identity(info) if stat.S_ISDIR(info.st_mode) else self.identity(info)
            need(self.owned[path] is not None and current==self.owned[path],
                 'same exact known partial stage object')
            if stat.S_ISDIR(info.st_mode):os.rmdir(path)
            else:os.unlink(path)
        need(self.directory_identity(self.root.lstat())==self.root_identity,
             'same exact partial stage root')
        os.rmdir(self.root);self.root=None


def finalize_service(original_path, output_path, service_exit, env):
    """Outside-service finite terminal facts; called once after systemd-run exits."""
    need(ENABLED is True,'disabled service finalizer before any IO')
    integer(service_exit,0,255)
    run=env.get('GITHUB_RUN_ID','')
    need(type(run) is str and POSINT.fullmatch(run),'selected outside service run')
    unit='bw-native-font-'+run+'-1.service';cgpath='/system.slice/'+unit
    ops=LiveOps(env)
    result={'schema':SERVICE_ORIGINAL,'unit':unit,'cgroupPath':cgpath,
            'serviceExitCode':service_exit,'originalPresent':False,
            'pre':None,'cleanup':None,'post':None,
            'outsideFiniteCleanupProved':False,'firstFailure':None,'secondary':[]}
    first=None;secondary=[]
    def record(exc,phase):
        nonlocal first
        row=error_row(exc,phase)
        if first is None:first=row
        else:secondary.append(row)
        secondary.extend(getattr(exc,'native_secondary',[]))
    try:
        try:
            original=ops.regular(original_path,LIMITS['originalBytes'])
            body=parse(original[:-1] if original.endswith(b'\n') else original,LIMITS['originalBytes'])
            result['originalPresent']=True
            need(body['service']['before']['unit']==unit and
                 body['service']['before']['cgroupPath']==cgpath,
                 'outside selected original service join')
        except FileNotFoundError:
            pass
        except BaseException as exc:
            record(exc,'outside-original-join')
        def command(args):
            proc=subprocess.run(['/usr/bin/sudo','-n','/usr/bin/systemctl',*args],
                env={'LANG':'C.UTF-8','PATH':'/usr/bin:/bin'},stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10,check=False)
            need(len(proc.stdout)<=16384 and len(proc.stderr)<=4096,
                 'bounded outside service control output')
            return proc
        def show():
            selected=('LoadState','ActiveState','SubState','Result','ExecMainCode',
                      'ExecMainStatus','ControlGroup','MainPID','ControlPID','KillMode')
            args=['show',unit,'--no-pager']
            for key in selected:args+=['-p',key]
            proc=command(args)
            need(proc.returncode==0,'selected transient unit show')
            out={}
            for line in proc.stdout.decode('utf-8','strict').splitlines():
                key,sep,value=line.partition('=')
                need(sep and key in selected and key not in out and len(value)<=512,
                     'bounded selected unit property')
                out[key]=value
            need(set(out)==set(selected),'complete selected unit properties')
            return out
        def terminal():
            base='/sys/fs/cgroup'+cgpath
            try:info=os.lstat(base)
            except FileNotFoundError:
                return {'exists':False,'populated':None,'procs':None,'threads':None,
                        'nrDescendants':None,'nrDyingDescendants':None}
            need(stat.S_ISDIR(info.st_mode),'selected cgroup terminal type')
            def one(name):return ops.pseudo(base+'/'+name,8192).strip()
            events=dict(line.split(' ',1) for line in one('cgroup.events').splitlines())
            census=dict(line.split(' ',1) for line in one('cgroup.stat').splitlines())
            ids=lambda name:sorted(set(int(x) for x in one(name).splitlines()))
            return {'exists':True,'populated':int(events['populated']),
                'procs':ids('cgroup.procs'),'threads':ids('cgroup.threads'),
                'nrDescendants':int(census['nr_descendants']),
                'nrDyingDescendants':int(census['nr_dying_descendants'])}
        try:result['pre']={'unit':show(),'cgroup':terminal()}
        except BaseException as exc:record(exc,'outside-before-census')
        state=result['pre']['unit']['ActiveState'] if result['pre'] is not None else None
        pre_cgroup=result['pre']['cgroup'] if result['pre'] is not None else None
        populated=(pre_cgroup is not None and pre_cgroup['exists'] and
            (pre_cgroup['populated']!=0 or pre_cgroup['procs']!=[] or
             pre_cgroup['threads']!=[] or pre_cgroup['nrDescendants']!=0 or
             pre_cgroup['nrDyingDescendants']!=0))
        stop_attempted=state in ('active','activating','deactivating') or state is None or populated
        stop_rc=None
        if stop_attempted:
            try:stop_rc=command(['stop',unit]).returncode
            except BaseException as exc:record(exc,'outside-stop')
        reset_attempted=state=='failed' or state is None
        reset_rc=None
        if reset_attempted:
            try:reset_rc=command(['reset-failed',unit]).returncode
            except BaseException as exc:record(exc,'outside-reset-failed')
        result['cleanup']={'stopAttempted':stop_attempted,'stopExitCode':stop_rc,
                           'resetAttempted':reset_attempted,'resetExitCode':reset_rc}
        try:
            result['post']={'unit':show(),'cgroup':terminal()}
            cgroup=result['post']['cgroup'];post_state=result['post']['unit']
            terminal_cgroup=(not cgroup['exists'] or
                (cgroup['populated']==0 and cgroup['procs']==[] and cgroup['threads']==[] and
                 cgroup['nrDescendants']==0 and cgroup['nrDyingDescendants']==0))
            need(terminal_cgroup and post_state['ActiveState']=='inactive' and
                 post_state['LoadState'] in ('not-found','loaded') and
                 (stop_rc is None or stop_rc==0) and (reset_rc is None or reset_rc==0),
                 'outside finite service and descendant terminal cleanup')
            result['outsideFiniteCleanupProved']=True
        except BaseException as exc:record(exc,'outside-after-census')
    except BaseException as exc:
        record(exc,'outside-service-finalize')
    result['firstFailure']=first;result['secondary']=secondary
    wire=encode(result)
    need(len(wire)+1<=65536,'bounded outside service original')
    descriptor=os.open(output_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600)
    try:need(os.write(descriptor,wire+b'\n')==len(wire)+1,'complete outside service original')
    finally:os.close(descriptor)
    return 0 if first is None else 1


def retain_event(event_path, output_path):
    """Retain one bounded byte-exact event before the service reads this copy."""
    absolute(event_path);absolute(output_path)
    need(Path(event_path).resolve(strict=True)==Path(event_path),'canonical runner event path')
    output=Path(output_path)
    need(output.name=='event.original.json' and output.parent.resolve(strict=True)==output.parent,
         'canonical retained event destination')
    raw=LiveOps({}).regular(event_path,256<<10)
    directory=None;descriptor=None;first=None
    try:
        directory=os.open(output.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
        before=os.fstat(directory)
        need(before.st_uid==os.geteuid() and before.st_mode==stat.S_IFDIR|0o700,
             'exclusive owned event directory')
        descriptor=os.open(output.name,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,
                           0o600,dir_fd=directory)
        need(os.write(descriptor,raw)==len(raw),'complete retained event write')
        os.fsync(descriptor);written=os.fstat(descriptor)
        need(written.st_mode==stat.S_IFREG|0o600 and written.st_uid==os.geteuid() and
             written.st_nlink==1 and written.st_size==len(raw),'owned exact event file')
        os.lseek(descriptor,0,os.SEEK_SET)
        need(os.read(descriptor,(256<<10)+1)==raw,'retained event byte readback')
        need(LiveOps.identity(written)==LiveOps.identity(os.fstat(descriptor))==
             LiveOps.identity(os.stat(output.name,dir_fd=directory,follow_symlinks=False)),
             'held and named retained event unchanged')
        need(LiveOps.directory_identity(before)==LiveOps.directory_identity(os.fstat(directory))==
             LiveOps.directory_identity(output.parent.lstat()) and
             output.parent.resolve(strict=True)==output.parent,'retained event directory unchanged')
        os.fsync(directory)
    except BaseException as error:first=error
    for descriptor_to_close in (descriptor,directory):
        if descriptor_to_close is None:continue
        try:os.close(descriptor_to_close)
        except BaseException as error:
            if first is None:first=error
            else:first.native_secondary=getattr(first,'native_secondary',[])+[error_row(error,'event-close')]
    if first is not None:raise first
    return {'bytes':len(raw),'sha256':sha(raw)}


def main(argv=None):
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--observe', action='store_true')
    parser.add_argument('--finalize', action='store_true')
    parser.add_argument('--retain-event', action='store_true')
    parser.add_argument('--event-out')
    parser.add_argument('--request')
    parser.add_argument('--expected-sha256')
    parser.add_argument('--original')
    parser.add_argument('--service-out')
    parser.add_argument('--service-exit',type=int)
    args = parser.parse_args(argv)
    need(ENABLED is True,'disabled producer refuses before any IO')
    if args.retain_event:
        need(args.event_out and not any((args.observe,args.finalize,args.request,args.expected_sha256,
             args.original,args.service_out,args.service_exit is not None)), 'exact event retention arguments')
        try:retain_event(os.environ.get('GITHUB_EVENT_PATH',''),args.event_out)
        except Exception as error:
            diagnostic={'firstFailure':error_row(error,'event-retention'),
                        'secondary':getattr(error,'native_secondary',[])}
            wire=encode(diagnostic);need(len(wire)+1<=4096,'bounded event retention diagnostic')
            sys.stderr.write(wire.decode()+'\n')
            return 1
        return 0
    need(args.event_out is None,'event output only for pre-service retention')
    if args.finalize:
        need(not args.observe and args.original and args.service_out and
             args.service_exit is not None,'exact finalizer arguments')
        return finalize_service(args.original,args.service_out,args.service_exit,dict(os.environ))
    need(args.observe and not args.finalize,'selected inner observer')
    need(args.request and args.expected_sha256, 'exact external request path and hash')
    digest(args.expected_sha256)
    request_path = Path(args.request)
    descriptor = os.open(request_path, os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
    try:
        info = os.fstat(descriptor)
        need(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= 65536,
             'bounded admitted request file')
        raw = os.read(descriptor,65537)
        need(len(raw) == info.st_size and os.read(descriptor,1) == b'' and
             LiveOps.identity(info) == LiveOps.identity(os.fstat(descriptor)) ==
             LiveOps.identity(request_path.lstat()),
             'stable exact admitted request bytes')
    finally:os.close(descriptor)
    original = collect(raw,args.expected_sha256,dict(os.environ),LiveOps(os.environ))
    need(sys.stdout.buffer.write(original) == len(original), 'complete bounded original output')
    sys.stdout.buffer.flush()
    return 0 if parse(original[:-1],LIMITS['originalBytes'])['complete'] else 1


if __name__ == '__main__':
    try: sys.exit(main())
    except Exception as exc:
        sys.stderr.write(str(exc)[:512]+'\n'); sys.exit(1)
