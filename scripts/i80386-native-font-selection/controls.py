#!/usr/bin/env python3
"""Pure injected-edge controls; never run a native font command."""
import copy
import importlib.util
import json
import sys
import stat
from types import SimpleNamespace
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
DIRECTORY=Path(__file__).resolve().parent

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value

producer=module('native_font_producer',DIRECTORY/'run.py')
reader=module('native_font_independent_reader',DIRECTORY/'reader.py')
FONT=b'authored-font-fixture-only'
NOTICE=b'authored-notice-fixture-only'
TOOL=b'authored-tool-fixture-only'
RUN='123456789'
HEAD='a'*40
TREE='b'*40
WORKFLOW_SHA='c'*40
PATH='/run/bw-native-font-fixture-123'
FONT_PATH=PATH+'/font/selected.ttf'
CACHE_PATH=PATH+'/cache'
CONFIG_PATH=PATH+'/fontconfig.xml'


def fixture_request():
    source={path:{'sha256':producer.sha((ROOT/path).read_bytes())} for path in producer.SOURCE}
    return {'schema':producer.SCHEMA,'repository':producer.REPOSITORY,'pullRequest':1315,
        'source':{'head':HEAD,'tree':TREE,'files':source},
        'selection':{'font':{'url':producer.FONT_URL,'bytes':producer.FONT_BYTES,
            'sha256':producer.FONT_SHA,'licenseUrl':producer.LICENSE_URL,
            'licenseBytes':producer.LICENSE_BYTES,'licenseSha256':producer.LICENSE_SHA,
            'family':'Roboto Mono'},
            'tool':{'path':'/usr/bin/fc-match','bytes':len(TOOL),'sha256':producer.sha(TOOL)},
            'runtime':{'files':{'/usr/bin/fc-match':{'bytes':len(TOOL),'sha256':producer.sha(TOOL)},
                                '/usr/lib/libfontconfig-fixture.so':{'bytes':1,'sha256':producer.sha(b'L')}},
                       'aliases':{},'directoryAliases':{}},
            'query':{'pattern':producer.PATTERN,'format':producer.FORMAT}},
        'limits':copy.deepcopy(producer.LIMITS)}


def fixture_env():
    return {'GITHUB_REPOSITORY':producer.REPOSITORY,'GITHUB_EVENT_NAME':'pull_request',
        'GITHUB_ACTOR':'CrispStrobe','GITHUB_JOB':'native-font-selection',
        'GITHUB_RUN_ATTEMPT':'1','GITHUB_RUN_ID':RUN,'GITHUB_WORKFLOW_SHA':WORKFLOW_SHA,
        'GITHUB_WORKFLOW_REF':producer.REPOSITORY+'/'+producer.WORKFLOW+'@refs/pull/1315/merge',
        'BW_EXPECTED_HEAD':HEAD,'BW_EXPECTED_TREE':TREE}


def fixture_event(pin):
    return producer.encode({'action':'labeled','label':{'name':producer.LABEL},
        'sender':{'login':'CrispStrobe'},'repository':{'full_name':producer.REPOSITORY},
        'number':1315,'pull_request':{'number':1315,'state':'open',
        'head':{'sha':HEAD,'repo':{'full_name':producer.REPOSITORY,'fork':False}},
        'base':{'ref':'main','repo':{'full_name':producer.REPOSITORY}},
        'body':'<!-- BW_NATIVE_FONT_REQUEST_SHA256='+pin+' -->'}})


class FakeOps:
    def __init__(self,event_raw, fault=None):
        self.event_raw=event_raw;self.fault=fault;self.events=[]
    def event(self):self.events.append('event');return self.event_raw
    def git(self):self.events.append('git');return {'head':HEAD,'tree':TREE}
    def source(self,path):self.events.append('source');return (ROOT/path).read_bytes()
    def service(self,phase):
        self.events.append('service-'+phase)
        return {'unit':'bw-native-font-'+RUN+'-1.service',
            'cgroupPath':'/system.slice/bw-native-font-'+RUN+'-1.service',
            'selfPid':1234,'cpuMax':[100000,100000],
            'memoryMax':producer.SERVICE['memoryMaxBytes'],
            'swapMax':0,'pidsMax':64,'memoryCurrent':1024,'pidsCurrent':1,
            'populated':1,'frozen':0,'procs':[1234],'threads':[1234],
            'childCgroups':[],'nrDescendants':0,'nrDyingDescendants':0,
            'oomKill':0,'pidsLimitEvents':0}
    def input(self,path,cap):
        self.events.append('input')
        if path==producer.FONT_URL:
            return FONT+b'X' if self.fault=='font-drift' else FONT
        return NOTICE
    def tool(self,path,cap):self.events.append('tool');return TOOL
    def runtime(self,selected):
        self.events.append('runtime')
        result=copy.deepcopy(selected)
        if self.fault=='runtime-drift-before' and self.events.count('runtime')==1:
            result['files']['/usr/lib/libfontconfig-fixture.so']['sha256']='0'*64
        if self.fault=='runtime-drift' and self.events.count('runtime')==2:
            result['files']['/usr/lib/libfontconfig-fixture.so']['sha256']='0'*64
        return result
    def stage(self,font):
        self.events.append('stage')
        return {'fontPath':FONT_PATH,'fontDir':PATH+'/font','cacheDir':CACHE_PATH,
                'configPath':CONFIG_PATH,'owned':True,'exclusive':True,'stable':True}
    def write_config(self,path,raw):
        self.events.append('config')
        return {'bytes':len(raw),'sha256':producer.sha(raw),'stable':True}
    def cache(self,phase,path):
        self.events.append('cache-'+phase)
        entries=[] if phase=='before' else [{'path':CACHE_PATH+'/cache-0','bytes':1,'sha256':producer.sha(b'X')}]
        if self.fault=='escaped-cache' and phase=='after':entries[0]['path']='/usr/share/fonts/escaped'
        return {'root':CACHE_PATH,'owned':True,'exclusive':True,'entries':entries,
                'totalBytes':sum(x['bytes'] for x in entries)}
    def process(self,argv,env,stream_cap,timeout):
        self.events.append('process')
        if self.fault=='child-uncertain':
            exc=OSError('selector failed');exc.native_child_uncertain=True
            exc.native_partial={'phase':'native-process','pid':777,'reaped':False,
                'stdoutPrefixBytes':0,'stdoutPrefixSha256':producer.sha(b''),
                'stdoutPrefixBase64':'',
                'stderrPrefixBytes':0,'stderrPrefixSha256':producer.sha(b''),
                'stderrPrefixBase64':'',
                'wallMilliseconds':1}
            exc.native_secondary=[{'phase':'reap','name':'TimeoutError','message':'uncertain'}]
            raise exc
        return {'argv':argv,'environment':env,
            'stdout':FONT_PATH+'\tRoboto Mono\tRegular\t0\n',
            'stderr':'','exitCode':1 if self.fault=='process-exit' else 0,
            'timedOut':False,'wallMilliseconds':12,'firstFailure':None,'secondary':[],
            'resourceLimits':{'cpuSeconds':producer.LIMITS['processCpuSeconds'],
                'addressSpaceBytes':producer.LIMITS['processAddressSpaceBytes'],
                'fileBytes':producer.LIMITS['processFileBytes'],
                'openFiles':producer.LIMITS['processOpenFiles'],
                'coreBytes':0,'appliedBeforeExec':True}}
    def cleanup(self,stage):
        self.events.append('cleanup')
        if self.fault=='cleanup':raise OSError('FIRST_CLEANUP')
        return {'removedExactOwnedStage':True,'removedExactOwnedCache':True}


def service_fixture(raw):
    selected=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
    unit='bw-native-font-'+RUN+'-1.service'
    empty={'exists':False,'populated':None,'procs':None,'threads':None,
           'nrDescendants':None,'nrDyingDescendants':None}
    unit_state={key:'' for key in ('LoadState','ActiveState','SubState','Result',
        'ExecMainCode','ExecMainStatus','ControlGroup','MainPID','ControlPID','KillMode')}
    unit_state.update({'LoadState':'not-found','ActiveState':'inactive'})
    value={'schema':reader.SERVICE_ORIGINAL,'unit':unit,
        'cgroupPath':'/system.slice/'+unit,'serviceExitCode':0,
        'originalPresent':True,'pre':{'unit':unit_state,'cgroup':empty},
        'cleanup':{'stopAttempted':False,'stopExitCode':None,
                   'resetAttempted':False,'resetExitCode':None},
        'post':{'unit':unit_state,'cgroup':empty},
        'outsideFiniteCleanupProved':True,'firstFailure':None,'secondary':[]}
    return reader.canonical(value)+b'\n'

def expectation(raw,request_raw,event_raw,request):
    service_raw=service_fixture(raw)
    return {'schema':reader.EXPECTATION,'requestSha256':reader.sha(request_raw),
        'eventSha256':reader.sha(event_raw),'originalSha256':reader.sha(raw),
        'originalBytes':len(raw),'serviceSha256':reader.sha(service_raw),
        'serviceBytes':len(service_raw),'runId':RUN,'jobId':987654321,
        'head':HEAD,'tree':TREE,'workflowSha':WORKFLOW_SHA,
        'sourceFiles':request['source']['files'],'conclusion':'success'}

def grade(raw,request_raw,event_raw,request):
    return reader.original(raw,request_raw,event_raw,
                           expectation(raw,request_raw,event_raw,request),service_fixture(raw))


class Controls(unittest.TestCase):
    def setUp(self):
        for module in (producer,reader):
            for name,value in (('FONT_BYTES',len(FONT)),('FONT_SHA',producer.sha(FONT)),
                               ('LICENSE_BYTES',len(NOTICE)),('LICENSE_SHA',producer.sha(NOTICE))):
                selected=patch.object(module,name,value);selected.start();self.addCleanup(selected.stop)
    def produce(self,fault=None):
        request=fixture_request();request_raw=producer.encode(request);pin=producer.sha(request_raw)
        event_raw=fixture_event(pin);ops=FakeOps(event_raw,fault)
        with patch.object(producer,'ENABLED',True):
            raw=producer.collect(request_raw,pin,fixture_env(),ops)
        return raw,request_raw,event_raw,request,ops
    def test_disabled_refuses_before_every_provider_edge(self):
        class NoEdges:
            def __getattr__(self,name):raise AssertionError('disabled touched '+name)
        with self.assertRaisesRegex(ValueError,'disabled'):
            producer.collect(b'bad','0'*64,{},NoEdges())
        with self.assertRaisesRegex(ValueError,'disabled'):
            producer.main(['--observe'])
        with self.assertRaisesRegex(ValueError,'disabled'):
            producer.main(['--finalize'])
    def test_workflow_outer_service_contract_is_disabled_and_bounded(self):
        workflow=(ROOT/producer.WORKFLOW).read_text()
        selected=('if: ${{ false && github.event.action == \'labeled\'',
                  'timeout --signal=TERM --kill-after=5s 130s',
                  '--system --wait --pipe --quiet --same-dir',
                  '--property=CPUQuota=100%',
                  '--property=CPUQuotaPeriodSec=100ms',
                  '--property=MemoryMax=1073741824',
                  '--property=MemorySwapMax=0',
                  '--property=TasksMax=64',
                  '--property=RuntimeMaxSec=90s',
                  '--property=KillMode=control-group',
                  '--service-exit "$SERVICE_EXIT"')
        for marker in selected:self.assertIn(marker,workflow)
        self.assertNotIn('--collect',workflow)
        self.assertLess(workflow.index('set +e'),workflow.index('systemd-run'))
        self.assertLess(workflow.index('SERVICE_EXIT=$?'),workflow.index('--finalize'))
        self.assertLess(workflow.index('--finalize'),workflow.index('test "$SERVICE_EXIT" -eq 0'))
    def test_positive_real_orchestrator_independent_reader(self):
        raw,request_raw,event_raw,request,ops=self.produce()
        verdict=grade(raw,request_raw,event_raw,request)
        self.assertTrue(verdict['nativeSelectionObserved'])
        self.assertFalse(verdict['browserFontSelectionProved'])
        self.assertEqual(ops.events[:2],['event','git'])
        self.assertEqual(ops.events[-1],'cleanup')
        self.assertEqual(ops.events.count('process'),1)
        self.assertEqual(ops.events.count('runtime'),2)
        self.assertEqual(ops.events.count('service-before'),1)
        self.assertEqual(ops.events.count('service-after'),1)
    def test_request_wrong_hash_duplicate_bool_limit_and_tool_refuse(self):
        request=fixture_request();raw=producer.encode(request)
        with self.assertRaisesRegex(ValueError,'request SHA'):producer.admitted_request(raw,'0'*64)
        with self.assertRaisesRegex(ValueError,'duplicate'):
            producer.admitted_request(raw[:-1]+b',"schema":"duplicate"}',producer.sha(raw[:-1]+b',"schema":"duplicate"}'))
        for mutate in (lambda x:x['limits'].__setitem__('cacheEntries',True),
                       lambda x:x['selection']['tool'].__setitem__('path','/usr/bin/env'),
                       lambda x:x['selection']['font'].__setitem__('url','https://example.invalid/escape.ttf')):
            bad=copy.deepcopy(request);mutate(bad);candidate=producer.encode(bad)
            with self.assertRaises(ValueError):producer.admitted_request(candidate,producer.sha(candidate))
    def test_input_drift_before_stage_and_cleanup_failure_are_retained(self):
        raw,*_,ops=self.produce('font-drift')
        v=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
        self.assertIsNotNone(v['firstFailure']);self.assertIsNone(v['stage'])
        self.assertNotIn('process',ops.events)
        raw,*_,ops=self.produce('cleanup');v=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
        self.assertEqual(v['firstFailure']['message'],'FIRST_CLEANUP')
        self.assertFalse(v['complete'])
        self.assertIn('process',ops.events)
    def test_tool_runtime_admitted_before_first_input_get(self):
        raw,*_,ops=self.produce()
        self.assertEqual(ops.events.index('tool')+1,ops.events.index('runtime'))
        self.assertLess(ops.events.index('runtime'),ops.events.index('input'))
        raw,*_,ops=self.produce('runtime-drift-before')
        self.assertNotIn('input',ops.events)
    def test_owned_directory_cleanup_ignores_own_content_stat_changes(self):
        def row(mode,ino,size=0,nlink=1,mtime=1):
            return SimpleNamespace(st_dev=1,st_ino=ino,st_mode=mode,st_uid=1000,st_gid=1000,
                                   st_nlink=nlink,st_size=size,st_mtime_ns=mtime)
        root=row(stat.S_IFDIR|0o700,10,10,2,1)
        fontdir=row(stat.S_IFDIR|0o700,11,20,2,2)
        cachedir=row(stat.S_IFDIR|0o700,12,30,2,3)
        font=row(stat.S_IFREG|0o600,13,4,1,4)
        config=row(stat.S_IFREG|0o600,14,5,1,5)
        names={PATH:root,PATH+'/font':fontdir,CACHE_PATH:cachedir,
               FONT_PATH:font,CONFIG_PATH:config}
        ops=producer.LiveOps({'GITHUB_RUN_ID':RUN});ops.root=Path(PATH)
        ops.root_identity=ops.directory_identity(root)
        ops.owned={PATH+'/font':ops.directory_identity(fontdir),
                   CACHE_PATH:ops.directory_identity(cachedir),
                   FONT_PATH:ops.identity(font),CONFIG_PATH:ops.identity(config)}
        # Valid owned writes change parent size, link count and mtime.
        for selected in (root,fontdir,cachedir):
            selected.st_size+=100;selected.st_nlink+=1;selected.st_mtime_ns+=100
        def lookup(path):return names[str(path)]
        def remove(path):names.pop(str(path))
        stage={'fontPath':FONT_PATH}
        with patch.object(producer.os,'lstat',side_effect=lookup),\
             patch.object(producer.os,'stat',side_effect=lambda path,**kw:lookup(path)),\
             patch.object(producer.os,'unlink',side_effect=remove),\
             patch.object(producer.os,'rmdir',side_effect=remove):
            self.assertEqual(ops.cleanup(stage),{'removedExactOwnedStage':True,
                                                  'removedExactOwnedCache':True})
        self.assertEqual(names,{})
        self.assertIsNone(ops.root)
        # An unknown identity after mkdir is never silently removed.
        ops.root=Path(PATH);ops.root_identity=ops.directory_identity(root)
        ops.owned={PATH+'/font':None}
        with patch.object(producer.os,'lstat',side_effect=lambda path:fontdir),\
             patch.object(producer.os,'stat',side_effect=lambda path,**kw:fontdir),\
             patch.object(producer.os,'rmdir') as remove_dir:
            with self.assertRaisesRegex(ValueError,'same exact known partial'):
                ops.cleanup_partial()
            remove_dir.assert_not_called()
    def test_preexec_limits_are_set_and_read_back_before_native_spawn(self):
        ops=producer.LiveOps({});captured={}
        def capture(*args,**kwargs):
            captured.update(kwargs);raise RuntimeError('mocked Popen edge')
        with patch.object(producer.subprocess,'Popen',side_effect=capture):
            with self.assertRaisesRegex(RuntimeError,'mocked Popen'):
                ops.process(['/usr/bin/fc-match','--format',producer.FORMAT,producer.PATTERN],
                            {},producer.LIMITS['streamBytes'],producer.LIMITS['processWallSeconds'])
        setvalues={}
        def set_limit(kind,limits):setvalues[kind]=limits
        with patch.object(producer.resource,'setrlimit',side_effect=set_limit),\
             patch.object(producer.resource,'getrlimit',side_effect=lambda kind:setvalues[kind]):
            captured['preexec_fn']()
        self.assertEqual(setvalues[producer.resource.RLIMIT_CPU],(30,30))
        self.assertEqual(setvalues[producer.resource.RLIMIT_AS],(536870912,536870912))
        self.assertEqual(setvalues[producer.resource.RLIMIT_FSIZE],(8388608,8388608))
        self.assertEqual(setvalues[producer.resource.RLIMIT_NOFILE],(64,64))
    def test_outside_finalizer_stops_exact_unit_after_bad_original(self):
        calls=[];written=[]
        selected=('LoadState','ActiveState','SubState','Result','ExecMainCode',
                  'ExecMainStatus','ControlGroup','MainPID','ControlPID','KillMode')
        def command(argv,**kwargs):
            action=argv[3];calls.append(action)
            if action=='show':
                state='active' if calls.count('show')==1 else 'inactive'
                values={key:'' for key in selected}
                values.update({'LoadState':'loaded','ActiveState':state,
                               'KillMode':'control-group'})
                out=''.join(key+'='+values[key]+'\n' for key in selected).encode()
                return SimpleNamespace(returncode=0,stdout=out,stderr=b'')
            return SimpleNamespace(returncode=0,stdout=b'',stderr=b'')
        with patch.object(producer,'ENABLED',True),\
             patch.object(producer.LiveOps,'regular',return_value=b'bad-original'),\
             patch.object(producer.subprocess,'run',side_effect=command),\
             patch.object(producer.os,'lstat',side_effect=FileNotFoundError),\
             patch.object(producer.os,'open',return_value=99),\
             patch.object(producer.os,'write',side_effect=lambda fd,raw:(written.append(raw),len(raw))[1]),\
             patch.object(producer.os,'close'):
            rc=producer.finalize_service('/mock/original','/mock/service',1,{'GITHUB_RUN_ID':RUN})
        self.assertEqual(rc,1)
        self.assertEqual(calls,['show','stop','show'])
        sidecar=reader.parse(written[0],65536,lf=True)
        self.assertEqual(sidecar['firstFailure']['phase'],'outside-original-join')
        self.assertTrue(sidecar['outsideFiniteCleanupProved'])
        self.assertFalse(reader.failed_attempt(b'',written[0])['nativeSelectionObserved'])
    def test_service_and_outside_mutations_refuse(self):
        raw,request_raw,event_raw,request,_=self.produce()
        v=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
        v['service']['before']['pidsMax']=65
        bad=reader.canonical(v)+b'\n'
        with self.assertRaises(reader.Refusal):grade(bad,request_raw,event_raw,request)
        sidecar=reader.parse(service_fixture(raw),65536,lf=True)
        sidecar['outsideFiniteCleanupProved']=False
        changed=reader.canonical(sidecar)+b'\n'
        expected=expectation(raw,request_raw,event_raw,request)
        expected['serviceSha256']=reader.sha(changed);expected['serviceBytes']=len(changed)
        with self.assertRaises(reader.Refusal):reader.original(
            raw,request_raw,event_raw,expected,changed)
    def test_selector_fault_reap_uncertainty_defers_stage_cleanup(self):
        class Stream:
            def close(self):pass
        class Child:
            pid=777;stdout=Stream();stderr=Stream()
            def poll(self):return None
            def wait(self,timeout):raise TimeoutError('reap uncertain')
        ops=producer.LiveOps({})
        with patch.object(producer.subprocess,'Popen',return_value=Child()),\
             patch.object(producer.selectors,'DefaultSelector',side_effect=OSError('selector ctor')),\
             patch.object(producer.os,'killpg',side_effect=OSError('kill uncertain')):
            with self.assertRaisesRegex(OSError,'selector ctor') as observed:
                ops.process(['/usr/bin/fc-match','--format',producer.FORMAT,producer.PATTERN],
                            {},producer.LIMITS['streamBytes'],producer.LIMITS['processWallSeconds'])
        self.assertTrue(observed.exception.native_child_uncertain)
        self.assertFalse(observed.exception.native_partial['reaped'])
        self.assertEqual(len(observed.exception.native_secondary),2)
        raw,_,_,_,fake=self.produce('child-uncertain')
        value=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
        self.assertIsNone(value['cleanup'])
        self.assertNotIn('cleanup',fake.events)
        self.assertEqual(value['failurePartial']['pid'],777)
        self.assertEqual(value['secondary'][-1]['phase'],'native-font-cleanup-deferred')
        failed=reader.failed_attempt(raw,service_fixture(raw))
        self.assertFalse(failed['nativeSelectionObserved'])
        changed=copy.deepcopy(value)
        changed['failurePartial']['stdoutPrefixBase64']='eA=='
        bad=reader.canonical(changed)+b'\n'
        with self.assertRaises(reader.Refusal):reader.failed_attempt(bad,service_fixture(bad))
    def test_stream_overflow_retains_only_rehashable_combined_prefix(self):
        class Stream:
            def fileno(self):return 8
            def close(self):pass
        class Child:
            pid=778;stdout=Stream();stderr=Stream();returncode=0
            def poll(self):return 0
            def wait(self,timeout):return 0
        class Selector:
            def register(self,*args):pass
            def get_map(self):return [1]
            def select(self,*args):return [(SimpleNamespace(fileobj=Child.stdout,data='stdout'),None)]
            def close(self):pass
        ops=producer.LiveOps({})
        with patch.object(producer.subprocess,'Popen',return_value=Child()),\
             patch.object(producer.selectors,'DefaultSelector',return_value=Selector()),\
             patch.object(producer.os,'set_blocking'),\
             patch.object(producer.os,'read',side_effect=[b'x'*65536,b'y'*65536,b'z']),\
             patch.object(producer.os,'killpg'):
            with self.assertRaisesRegex(ValueError,'combined native output cap') as observed:
                ops.process(['/usr/bin/fc-match','--format',producer.FORMAT,producer.PATTERN],
                            {},producer.LIMITS['streamBytes'],producer.LIMITS['processWallSeconds'])
        partial=observed.exception.native_partial
        self.assertEqual(partial['stdoutPrefixBytes'],131072)
        self.assertEqual(partial['stderrPrefixBytes'],0)
        self.assertEqual(producer.sha(b'x'*65536+b'y'*65536),partial['stdoutPrefixSha256'])
        raw,*_=self.produce('child-uncertain')
        packet=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
        packet['failurePartial']=partial
        changed=reader.canonical(packet)+b'\n'
        self.assertFalse(reader.failed_attempt(changed,service_fixture(changed))['nativeSelectionObserved'])
    def test_process_failure_cache_escape_never_positive(self):
        for fault in ('process-exit','escaped-cache','runtime-drift'):
            raw,request_raw,event_raw,request,_=self.produce(fault)
            v=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
            self.assertIsNotNone(v['firstFailure']);self.assertFalse(v['complete'])
            with self.assertRaises(reader.Refusal):grade(raw,request_raw,event_raw,request)
    def test_independent_rehashed_mutations_refuse(self):
        raw,request_raw,event_raw,request,_=self.produce();original=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
        for mutate in (lambda x:x['process'].__setitem__('stdout','/other/font.ttf\tRoboto Mono\tRegular\t0\n'),
                       lambda x:x['cacheAfter']['entries'][0].__setitem__('path','/usr/share/fonts/escape'),
                       lambda x:x.__setitem__('browserFontSelectionProved',True),
                       lambda x:x['nativeRuntime'].__setitem__('selectedReadback',False),
                       lambda x:x['nativeRuntime']['files']['/usr/bin/fc-match'].__setitem__('sha256','0'*64),
                       lambda x:x['config'].__setitem__('text','<fontconfig/>'),
                       lambda x:x['cleanup'].__setitem__('removedExactOwnedCache',False)):
            bad=copy.deepcopy(original);mutate(bad);changed=reader.canonical(bad)+b'\n'
            with self.assertRaises(reader.Refusal):grade(changed,request_raw,event_raw,request)
    def test_event_and_source_context_refuse_before_inputs(self):
        request=fixture_request();request_raw=producer.encode(request);pin=producer.sha(request_raw)
        for event in (producer.encode({'action':'labeled'}),fixture_event('0'*64)):
            ops=FakeOps(event)
            with patch.object(producer,'ENABLED',True):raw=producer.collect(request_raw,pin,fixture_env(),ops)
            v=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
            self.assertIsNotNone(v['firstFailure']);self.assertNotIn('input',ops.events)
        env=fixture_env();env['BW_EXPECTED_HEAD']='f'*40;ops=FakeOps(fixture_event(pin))
        with patch.object(producer,'ENABLED',True):raw=producer.collect(request_raw,pin,env,ops)
        self.assertNotIn('git',ops.events)

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Controls))
    if not result.wasSuccessful():sys.exit(1)
    print(json.dumps({'testOnly':True,'methods':result.testsRun,'nativeCalls':0,
                      'actualApproved':False,'pass':True},sort_keys=True))
