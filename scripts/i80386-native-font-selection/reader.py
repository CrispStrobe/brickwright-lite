#!/usr/bin/env python3
"""Independent original-byte reader for the disabled native-font candidate."""
import argparse
import base64
import hashlib
import json
import re
from pathlib import PurePosixPath

SCHEMA = 'bw.gui-hdd.native-font-request.v1'
ORIGINAL = 'bw.gui-hdd.native-font-original.v1'
EXPECTATION = 'bw.gui-hdd.native-font-expectation.v1'
SERVICE_ORIGINAL = 'bw.gui-hdd.native-font-service.v1'
REPOSITORY = 'CrispStrobe/brickwright-lite'
WORKFLOW = '.github/workflows/i80386-native-font-selection.yml'
SOURCE = ('scripts/i80386-native-font-selection/run.py',
          'scripts/i80386-native-font-selection/reader.py',
          'scripts/i80386-native-font-selection/controls.py',
          'scripts/i80386-native-font-selection/README.md', WORKFLOW)
LIMITS = {'fontBytes':2097152,'configBytes':16384,'cacheBytes':8388608,
          'cacheEntries':128,'streamBytes':131072,'originalBytes':2097152,
          'processWallSeconds':30,'processCpuSeconds':30,
          'processAddressSpaceBytes':536870912,'processFileBytes':8388608,
          'processOpenFiles':64}
SERVICE = {'cpuQuotaPercent':100,'memoryMaxBytes':1073741824,
           'memorySwapMaxBytes':0,'tasksMax':64,'runtimeMaxSeconds':90,
           'killMode':'control-group'}
PATTERN = 'monospace:lang=en'
FORMAT = '%{file}\t%{family}\t%{style}\t%{index}\n'
FONT_URL = ('https://raw.githubusercontent.com/google/fonts/'
            '90d7886db9000c893b9559828bf028aaed5f9c10/apache/robotomono/RobotoMono%5Bwght%5D.ttf')
FONT_BYTES = 184768
FONT_SHA = '7d933841c1086c47dad91b2f249b1f8ecabce0d78469242e8bb52ef43cdc925b'
LICENSE_URL = ('https://raw.githubusercontent.com/google/fonts/'
               '90d7886db9000c893b9559828bf028aaed5f9c10/apache/robotomono/LICENSE.txt')
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

class Refusal(ValueError): pass

def need(ok, message):
    if not ok: raise Refusal(message)

def sha(raw): return hashlib.sha256(raw).hexdigest()

def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(',',':'),
                      ensure_ascii=False,allow_nan=False).encode()

def parse(raw, cap, lf=False):
    need(type(raw) is bytes and 0<len(raw)<=cap,'bounded JSON original')
    body=raw[:-1] if lf and raw.endswith(b'\n') else raw
    def pairs(rows):
        obj={}
        for key,val in rows:
            need(key not in obj,'duplicate JSON key');obj[key]=val
        return obj
    try:obj=json.loads(body.decode(),object_pairs_hook=pairs,
                       parse_constant=lambda _:need(False,'nonfinite JSON'))
    except (UnicodeError,json.JSONDecodeError) as error:raise Refusal('invalid JSON') from error
    need(type(obj) is dict and canonical(obj)==body,'canonical JSON object')
    return obj

def fields(value,names,role):
    need(type(value) is dict and set(value)==set(names.split()),'closed '+role)

def hexhash(value,length=64):
    need(type(value) is str and re.fullmatch(r'[0-9a-f]{'+str(length)+r'}',value),'lowercase digest')

def number(value,lo,hi):need(type(value) is int and lo<=value<=hi,'bounded integer')

def rel(path):
    need(type(path) is str and 0<len(path)<=240 and not path.startswith('/') and
         '\\' not in path and '\0' not in path and
         all(p not in ('','.','..') for p in path.split('/')) and
         str(PurePosixPath(path))==path,'canonical relative path')

def abs_path(path):
    need(type(path) is str and path.startswith('/') and 1<len(path)<=512 and
         '\\' not in path and '\0' not in path and
         all(p not in ('','.','..') for p in path[1:].split('/')),
         'canonical absolute path')

def runtime_selection(value):
    fields(value,'files aliases directoryAliases','runtime selection')
    need(type(value['files']) is dict and 1<=len(value['files'])<=64 and
         '/usr/bin/fc-match' in value['files'],'finite selected runtime files')
    for path,row in value['files'].items():
        abs_path(path);fields(row,'bytes sha256','runtime file')
        number(row['bytes'],1,32<<20);hexhash(row['sha256'])
    for role,cap in (('aliases',32),('directoryAliases',16)):
        need(type(value[role]) is dict and len(value[role])<=cap,'finite runtime aliases')
        for path,row in value[role].items():
            abs_path(path);fields(row,'linkText target','runtime alias')
            abs_path(row['target'])
            need(row['target'] in value['files'] and type(row['linkText']) is str and
                 0<len(row['linkText'].encode())<=512,'selected alias terminal')
    need(not (set(value['files']) & (set(value['aliases'])|set(value['directoryAliases']))) and
         not (set(value['aliases'])&set(value['directoryAliases'])),'disjoint runtime names')

def config_text(fontdir,cachedir):
    for path in (fontdir,cachedir):
        abs_path(path);need(re.fullmatch(r'/[A-Za-z0-9_./-]+',path),'XML-safe path')
    return ('<?xml version="1.0"?>\n<fontconfig>\n  <dir>'+fontdir+
            '</dir>\n  <cachedir>'+cachedir+'</cachedir>\n</fontconfig>\n')

def service_snapshot(v,phase):
    fields(v,'unit cgroupPath selfPid cpuMax memoryMax swapMax pidsMax memoryCurrent pidsCurrent populated frozen procs threads childCgroups nrDescendants nrDyingDescendants oomKill pidsLimitEvents','service '+phase)
    need(type(v['unit']) is str and re.fullmatch(r'bw-native-font-[1-9][0-9]{0,19}-1\.service',v['unit']) and
         v['cgroupPath']=='/system.slice/'+v['unit'],'exact native service path')
    number(v['selfPid'],1,2**31-1)
    need(v['cpuMax']==[100000,100000] and v['memoryMax']==SERVICE['memoryMaxBytes'] and
         v['swapMax']==0 and v['pidsMax']==SERVICE['tasksMax'],'effective service limits')
    number(v['memoryCurrent'],0,SERVICE['memoryMaxBytes']);number(v['pidsCurrent'],1,64)
    need(v['populated']==1 and v['frozen']==0,'active service')
    for role in ('procs','threads'):
        need(type(v[role]) is list and 1<=len(v[role])<=64 and
             all(type(x) is int and 0<x<2**31 for x in v[role]) and
             v[role]==sorted(set(v[role])),'finite service '+role)
    need(v['procs']==[v['selfPid']] and v['childCgroups']==[] and
         v['nrDescendants']==0 and v['nrDyingDescendants']==0,
         'exclusive native service and no live/dying descendants')
    number(v['oomKill'],0,2**63-1);number(v['pidsLimitEvents'],0,2**63-1)

def request(raw):
    v=parse(raw,65536)
    fields(v,'schema repository pullRequest source selection limits','request')
    need(v['schema']==SCHEMA and v['repository']==REPOSITORY,'request identity')
    number(v['pullRequest'],1,2**31-1)
    s=v['source'];fields(s,'head tree files','source');hexhash(s['head'],40);hexhash(s['tree'],40)
    need(type(s['files']) is dict and set(s['files'])==set(SOURCE),'exact source five')
    for item in s['files'].values():fields(item,'sha256','source file');hexhash(item['sha256'])
    fields(v['selection'],'font tool query runtime','selection')
    f=v['selection']['font'];fields(f,'url bytes sha256 licenseUrl licenseBytes licenseSha256 family','font')
    google_fonts_raw_url(f['url']);google_fonts_raw_url(f['licenseUrl'])
    need(f=={'url':FONT_URL,'bytes':FONT_BYTES,'sha256':FONT_SHA,
             'licenseUrl':LICENSE_URL,'licenseBytes':LICENSE_BYTES,
             'licenseSha256':LICENSE_SHA,'family':'Roboto Mono'},'reviewed immutable font and notice')
    t=v['selection']['tool'];fields(t,'path bytes sha256','tool')
    need(t['path']=='/usr/bin/fc-match','one native endpoint')
    number(t['bytes'],1,8<<20);hexhash(t['sha256'])
    runtime_selection(v['selection']['runtime'])
    need(v['selection']['runtime']['files']['/usr/bin/fc-match']==
         {'bytes':t['bytes'],'sha256':t['sha256']},'runtime/tool join')
    fields(v['selection']['query'],'pattern format','query')
    need(v['selection']['query']=={'pattern':PATTERN,'format':FORMAT},'one query')
    fields(v['limits'],'fontBytes configBytes cacheBytes cacheEntries streamBytes originalBytes processWallSeconds processCpuSeconds processAddressSpaceBytes processFileBytes processOpenFiles','limits')
    for key,selected in LIMITS.items():number(v['limits'][key],selected,selected)
    return v

def selected_event(raw,req,request_sha,platform):
    e=parse(raw,256<<10);p=e.get('pull_request',{})
    marker='<!-- BW_NATIVE_FONT_REQUEST_SHA256='+request_sha+' -->'
    body=p.get('body')
    need(e.get('action')=='labeled' and e.get('label',{}).get('name')=='x86-native-font-selection-v1' and
         e.get('sender',{}).get('login')=='CrispStrobe' and e.get('repository',{}).get('full_name')==REPOSITORY and
         type(e.get('number')) is int and e['number']==req['pullRequest'] and
         type(p.get('number')) is int and p['number']==req['pullRequest'] and p.get('state')=='open' and
         p.get('head',{}).get('sha')==req['source']['head'] and
         p.get('head',{}).get('repo',{}).get('full_name')==REPOSITORY and
         p['head']['repo'].get('fork') is False and p.get('base',{}).get('ref')=='main' and
         p['base'].get('repo',{}).get('full_name')==REPOSITORY and
         type(body) is str and body.count('<!-- BW_NATIVE_FONT_REQUEST_SHA256=')==1 and body.count(marker)==1,
         'exact owned font event')
    fixed={'GITHUB_REPOSITORY':REPOSITORY,'GITHUB_EVENT_NAME':'pull_request',
           'GITHUB_ACTOR':'CrispStrobe','GITHUB_JOB':'native-font-selection',
           'GITHUB_RUN_ATTEMPT':'1','BW_EXPECTED_HEAD':req['source']['head'],
           'BW_EXPECTED_TREE':req['source']['tree'],
           'GITHUB_WORKFLOW_REF':REPOSITORY+'/'+WORKFLOW+'@refs/pull/'+str(req['pullRequest'])+'/merge'}
    need(all(platform.get(k)==x for k,x in fixed.items()),'actual platform/source binding')
    need(type(platform.get('GITHUB_RUN_ID')) is str and
         re.fullmatch(r'[1-9][0-9]{0,19}',platform['GITHUB_RUN_ID']) and
         type(platform.get('GITHUB_WORKFLOW_SHA')) is str and
         re.fullmatch(r'[0-9a-f]{40}',platform['GITHUB_WORKFLOW_SHA']),
         'actual run/workflow binding')

def cache(value,root):
    fields(value,'root owned exclusive entries totalBytes','cache')
    abs_path(value['root']);need(value['root']==root and value['owned'] is True and
         value['exclusive'] is True and type(value['entries']) is list and
         len(value['entries'])<=LIMITS['cacheEntries'],'owned finite cache')
    number(value['totalBytes'],0,LIMITS['cacheBytes']);names=set();total=0
    for row in value['entries']:
        fields(row,'path bytes sha256','cache entry');abs_path(row['path'])
        need(row['path'].startswith(root+'/') and row['path'] not in names,'owned cache entry')
        names.add(row['path']);number(row['bytes'],0,LIMITS['cacheBytes']);hexhash(row['sha256']);total+=row['bytes']
    need(total==value['totalBytes'],'cache byte count')

def outside_service(raw,expected,v):
    need(type(raw) is bytes and len(raw)==expected['serviceBytes'] and
         sha(raw)==expected['serviceSha256'],'official outside-service bytes')
    s=parse(raw,65536,lf=True)
    fields(s,'schema unit cgroupPath serviceExitCode originalPresent pre cleanup post outsideFiniteCleanupProved firstFailure secondary','outside service')
    before=v['service']['before'];unit=before['unit']
    need(s['schema']==SERVICE_ORIGINAL and s['unit']==unit and
         s['cgroupPath']==before['cgroupPath'] and type(s['serviceExitCode']) is int and
         s['serviceExitCode']==0 and
         s['originalPresent'] is True and s['outsideFiniteCleanupProved'] is True and
         s['firstFailure'] is None and s['secondary']==[],'selected outside service success')
    for phase in ('pre','post'):
        row=s[phase];fields(row,'unit cgroup','outside '+phase)
        fields(row['unit'],'LoadState ActiveState SubState Result ExecMainCode ExecMainStatus ControlGroup MainPID ControlPID KillMode','outside unit')
        for key,value in row['unit'].items():
            need(type(value) is str and len(value)<=512,'bounded outside unit '+key)
        cgroup=row['cgroup']
        fields(cgroup,'exists populated procs threads nrDescendants nrDyingDescendants','outside cgroup')
        need(type(cgroup['exists']) is bool,'cgroup existence')
        if cgroup['exists']:
            need(cgroup['populated']==0 and cgroup['procs']==[] and cgroup['threads']==[] and
                 cgroup['nrDescendants']==0 and cgroup['nrDyingDescendants']==0,
                 'empty terminal service cgroup')
        else:
            need(all(cgroup[k] is None for k in ('populated','procs','threads',
                 'nrDescendants','nrDyingDescendants')),'absent terminal cgroup')
    cleanup=s['cleanup'];fields(cleanup,'stopAttempted stopExitCode resetAttempted resetExitCode','service cleanup')
    for name in ('stop','reset'):
        attempted=cleanup[name+'Attempted'];code=cleanup[name+'ExitCode']
        need(type(attempted) is bool and (code==0 if attempted else code is None),
             'complete exact-unit '+name+' cleanup')
    need(s['post']['unit']['ActiveState']=='inactive' and
         s['pre']['unit']['ActiveState']=='inactive' and
         s['post']['unit']['LoadState'] in ('loaded','not-found') and
         (s['pre']['unit']['LoadState']=='not-found' or
          s['pre']['unit']['KillMode']=='control-group'),
         'terminal selected systemd unit')

def original(raw,request_raw,event_raw,expected,service_raw):
    fields(expected,'schema requestSha256 eventSha256 originalSha256 originalBytes serviceSha256 serviceBytes runId jobId head tree workflowSha sourceFiles conclusion','expectation')
    need(expected['schema']==EXPECTATION and expected['conclusion']=='success','externally successful official metadata')
    for name in ('requestSha256','eventSha256','originalSha256','serviceSha256'):hexhash(expected[name])
    for name in ('head','tree','workflowSha'):hexhash(expected[name],40)
    number(expected['originalBytes'],1,LIMITS['originalBytes'])
    number(expected['serviceBytes'],1,65536)
    number(expected['jobId'],1,2**63-1)
    need(type(expected['runId']) is str and re.fullmatch(r'[1-9][0-9]{0,19}',expected['runId']),'run id')
    need(len(raw)==expected['originalBytes'] and sha(raw)==expected['originalSha256'] and
         sha(request_raw)==expected['requestSha256'] and sha(event_raw)==expected['eventSha256'],
         'external original/request/event bytes')
    req=request(request_raw);need(req['source']['head']==expected['head'] and
        req['source']['tree']==expected['tree'] and req['source']['files']==expected['sourceFiles'],
        'source/head/tree external join')
    v=parse(raw,LIMITS['originalBytes'],lf=True)
    fields(v,'schema request event platform source input stage config cacheBefore process cacheAfter selection nativeRuntime service cleanup failurePartial complete firstFailure secondary observationOnly systemFallbackExcluded nativeLibraryClosureProved selectedNativeRuntimeReadbackProved wholeHostAttested browserFontSelectionProved actualRequestSupported guestApproved','original')
    need(v['schema']==ORIGINAL and v['observationOnly'] is True and
         all(v[k] is False for k in ('systemFallbackExcluded','nativeLibraryClosureProved','wholeHostAttested',
             'browserFontSelectionProved','actualRequestSupported','guestApproved')),
         'bounded observation-only flags')
    for name,selected in (('request',request_raw),('event',event_raw)):
        fields(v[name],'bytes sha256',name+' bytes')
        need(v[name]=={'bytes':len(selected),'sha256':sha(selected)},'retained '+name+' identity')
    p=v['platform'];fields(p,'GITHUB_REPOSITORY GITHUB_EVENT_NAME GITHUB_ACTOR GITHUB_JOB GITHUB_RUN_ATTEMPT GITHUB_RUN_ID GITHUB_WORKFLOW_SHA GITHUB_WORKFLOW_REF BW_EXPECTED_HEAD BW_EXPECTED_TREE','platform')
    selected_event(event_raw,req,expected['requestSha256'],p)
    need(p['GITHUB_RUN_ID']==expected['runId'] and p['GITHUB_WORKFLOW_SHA']==expected['workflowSha'],
         'official run/workflow join')
    need(type(v['source']) is dict and set(v['source'])==set(SOURCE),'five observed source files')
    for path,row in v['source'].items():
        fields(row,'bytes sha256','source row');number(row['bytes'],1,1<<20)
        need(row['sha256']==req['source']['files'][path]['sha256'],'source file digest')
    service=v['service'];fields(service,'before after','service phases')
    service_snapshot(service['before'],'before');service_snapshot(service['after'],'after')
    need(service['before']['unit']=='bw-native-font-'+expected['runId']+'-1.service' and
         service['after']['cgroupPath']==service['before']['cgroupPath'] and
         service['after']['selfPid']==service['before']['selfPid'] and
         service['after']['oomKill']==service['before']['oomKill'] and
         service['after']['pidsLimitEvents']==service['before']['pidsLimitEvents'],
         'one bounded service and no OOM/task-cap event')
    f=req['selection']['font'];t=req['selection']['tool'];i=v['input']
    fields(i,'fontUrl fontBytes fontSha256 licenseUrl licenseBytes licenseSha256 toolBytes toolSha256','input')
    need(i['fontUrl']==f['url'] and i['fontBytes']==f['bytes'] and i['fontSha256']==f['sha256'] and
         i['licenseUrl']==f['licenseUrl'] and i['licenseBytes']==f['licenseBytes'] and
         i['licenseSha256']==f['licenseSha256'] and i['toolBytes']==t['bytes'] and
         i['toolSha256']==t['sha256'],
         'selected input/tool/license witness')
    s=v['stage'];fields(s,'fontPath fontDir cacheDir configPath owned exclusive stable','stage')
    for name in ('fontPath','fontDir','cacheDir','configPath'):abs_path(s[name])
    need(s['owned'] is True and s['exclusive'] is True and s['stable'] is True and
         s['fontPath'].startswith(s['fontDir']+'/') and
         len({s['fontDir'],s['cacheDir'],s['configPath']})==3,'exclusive stable stage')
    c=v['config'];fields(c,'bytes sha256 text','config')
    selected=config_text(s['fontDir'],s['cacheDir'])
    need(c=={'bytes':len(selected.encode()),'sha256':sha(selected.encode()),'text':selected},
         'authored selected configuration')
    cache(v['cacheBefore'],s['cacheDir']);need(v['cacheBefore']['entries']==[],'empty cache before')
    cache(v['cacheAfter'],s['cacheDir'])
    proc=v['process'];fields(proc,'argv environment stdout stderr exitCode timedOut wallMilliseconds firstFailure secondary resourceLimits','process')
    need(proc['resourceLimits']=={'cpuSeconds':LIMITS['processCpuSeconds'],
         'addressSpaceBytes':LIMITS['processAddressSpaceBytes'],
         'fileBytes':LIMITS['processFileBytes'],'openFiles':LIMITS['processOpenFiles'],
         'coreBytes':0,'appliedBeforeExec':True},'finite pre-exec process limits')
    need(proc['argv']==[t['path'],'--format',FORMAT,PATTERN] and
         proc['environment']=={'LANG':'C.UTF-8','HOME':'/nonexistent','PATH':'/usr/bin:/bin',
          'FONTCONFIG_FILE':s['configPath'],'XDG_CACHE_HOME':s['cacheDir']},'selected native command/env')
    for name in ('stdout','stderr'):
        need(type(proc[name]) is str and len(proc[name].encode())<=LIMITS['streamBytes'],'bounded '+name)
    runtime=v['nativeRuntime']
    fields(runtime,'files aliases directoryAliases loadedLibraries version environment after selectedReadback','native runtime')
    chosen=req['selection']['runtime']
    need(runtime=={'files':chosen['files'],'aliases':chosen['aliases'],
                   'directoryAliases':chosen['directoryAliases'],'loadedLibraries':[],
                   'version':None,'environment':proc['environment'],
                   'after':chosen,'selectedReadback':True} and
         v['selectedNativeRuntimeReadbackProved'] is True,
         'exact finite native runtime before/after readback; loaded set unknown')
    number(proc['wallMilliseconds'],0,LIMITS['processWallSeconds']*1000)
    need(proc['exitCode']==0 and type(proc['exitCode']) is int and proc['timedOut'] is False and
         proc['firstFailure'] is None and proc['secondary']==[] and proc['stderr']=='','terminal native command')
    lines=proc['stdout'].splitlines(keepends=True)
    need(len(lines)==1 and lines[0].endswith('\n'),'one selection line')
    parts=lines[0][:-1].split('\t')
    need(len(parts)==4 and parts[0]==s['fontPath'] and f['family'] in parts[1].split(',') and
         parts[3]=='0' and 0<len(parts[2])<=80 and
         v['selection']=={'file':parts[0],'family':parts[1],'style':parts[2],'index':0},
         'exact selected staged font face')
    need(v['cleanup']=={'removedExactOwnedStage':True,'removedExactOwnedCache':True} and
         v['complete'] is True and v['firstFailure'] is None and v['secondary']==[] and
         v['failurePartial'] is None,
         'complete owned cleanup and no failures')
    outside_service(service_raw,expected,v)
    return {'schema':'bw.gui-hdd.native-font-reader.v1','nativeSelectionObserved':True,
            'sourceHead':expected['head'],'runId':expected['runId'],'jobId':expected['jobId'],
            'selectedFontSha256':f['sha256'],'selectedNativeRuntimeReadbackProved':True,
            'nativeRuntimeFiles':chosen['files'],'nativeRuntimeAliases':chosen['aliases'],
            'nativeRuntimeDirectoryAliases':chosen['directoryAliases'],
            'nativeLibraryClosureProved':False,'wholeHostAttested':False,
            'browserFontSelectionProved':False,
            'actualRequestSupported':False,'guestApproved':False}

def failed_attempt(raw,service_raw):
    """Bounded independent failure receipt; it grants no event or native authority."""
    s=parse(service_raw,65536,lf=True)
    fields(s,'schema unit cgroupPath serviceExitCode originalPresent pre cleanup post outsideFiniteCleanupProved firstFailure secondary','failed service')
    if raw==b'':
        need(s['schema']==SERVICE_ORIGINAL and s['originalPresent'] is False and
             s['serviceExitCode']!=0,'empty original only for failed service start')
        return {'schema':'bw.gui-hdd.native-font-failed-reader.v1',
                'originalSha256':sha(raw),'serviceSha256':sha(service_raw),
                'originalFirstFailure':None,'originalSecondary':[],
                'serviceFirstFailure':s['firstFailure'],'serviceSecondary':s['secondary'],
                'failurePartial':None,'outsideFiniteCleanupProved':s['outsideFiniteCleanupProved'],
                'nativeSelectionObserved':False,'actualRequestSupported':False,
                'guestApproved':False,'officialMetadataBound':False}
    v=parse(raw,LIMITS['originalBytes'],lf=True)
    fields(v,'schema request event platform source input stage config cacheBefore process cacheAfter selection nativeRuntime service cleanup failurePartial complete firstFailure secondary observationOnly systemFallbackExcluded nativeLibraryClosureProved selectedNativeRuntimeReadbackProved wholeHostAttested browserFontSelectionProved actualRequestSupported guestApproved','failed original')
    need(v['schema']==ORIGINAL and s['schema']==SERVICE_ORIGINAL and
         v['complete'] is False and v['observationOnly'] is True and
         all(v[k] is False for k in ('systemFallbackExcluded','nativeLibraryClosureProved',
           'wholeHostAttested','browserFontSelectionProved','actualRequestSupported','guestApproved')),
         'failed observation-only original')
    def errors(value):
        need(type(value) is list and len(value)<=32,'bounded secondary errors')
        for row in value:
            fields(row,'phase name message','failure row')
            need(all(type(row[key]) is str and len(row[key])<=512 for key in row),
                 'bounded failure text')
    for packet in (v,s):
        if packet['firstFailure'] is not None:errors([packet['firstFailure']])
        errors(packet['secondary'])
    need(v['firstFailure'] is not None or s['firstFailure'] is not None or
         s['serviceExitCode']!=0,'genuine retained failure')
    partial=v['failurePartial']
    if partial is not None:
        fields(partial,'phase pid reaped stdoutPrefixBytes stdoutPrefixSha256 stdoutPrefixBase64 stderrPrefixBytes stderrPrefixSha256 stderrPrefixBase64 wallMilliseconds','bounded process partial')
        need(partial['phase']=='native-process' and type(partial['reaped']) is bool,
             'typed process partial')
        number(partial['pid'],1,2**31-1)
        for name in ('stdout','stderr'):
            number(partial[name+'PrefixBytes'],0,LIMITS['streamBytes'])
            hexhash(partial[name+'PrefixSha256'])
            encoded=partial[name+'PrefixBase64']
            need(type(encoded) is str and len(encoded)<=4*((LIMITS['streamBytes']+2)//3),
                 'bounded failure prefix base64')
            try:decoded=base64.b64decode(encoded,validate=True)
            except Exception as exc:raise Refusal('invalid failure prefix base64') from exc
            need(base64.b64encode(decoded).decode()==encoded and
                 len(decoded)==partial[name+'PrefixBytes'] and
                 sha(decoded)==partial[name+'PrefixSha256'],'exact failure prefix bytes')
        need(sum(partial[name+'PrefixBytes'] for name in ('stdout','stderr'))<=LIMITS['streamBytes'],
             'combined failure prefix cap')
        number(partial['wallMilliseconds'],0,600000)
    return {'schema':'bw.gui-hdd.native-font-failed-reader.v1',
            'originalSha256':sha(raw),'serviceSha256':sha(service_raw),
            'originalFirstFailure':v['firstFailure'],'originalSecondary':v['secondary'],
            'serviceFirstFailure':s['firstFailure'],'serviceSecondary':s['secondary'],
            'failurePartial':partial,'outsideFiniteCleanupProved':s['outsideFiniteCleanupProved'],
            'nativeSelectionObserved':False,'actualRequestSupported':False,
            'guestApproved':False,'officialMetadataBound':False}

def main(argv=None):
    parser=argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--failed',action='store_true')
    for name in ('original','service'):parser.add_argument('--'+name,required=True)
    for name in ('request','event','expected'):parser.add_argument('--'+name)
    args=parser.parse_args(argv)
    def load(path,cap):
        with open(path,'rb') as stream:return stream.read(cap+1)
    raw=load(args.original,LIMITS['originalBytes']);service_raw=load(args.service,65536)
    if args.failed:result=failed_attempt(raw,service_raw)
    else:
        need(args.request and args.event and args.expected,'positive reader external inputs')
        expectation=parse(load(args.expected,65536),65536)
        result=original(raw,load(args.request,65536),
                        load(args.event,256<<10),expectation,service_raw)
    print(canonical(result).decode())

if __name__=='__main__':main()
