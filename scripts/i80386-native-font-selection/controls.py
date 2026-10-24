#!/usr/bin/env python3
"""Pure injected-edge controls; never run a native font command."""
import copy
import ast
import importlib.util
import io
import json
import os
import sys
import stat
import tempfile
from types import SimpleNamespace
import unittest
from contextlib import ExitStack
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


def fixture_request(version=1):
    source={path:{'sha256':producer.sha((ROOT/path).read_bytes())} for path in producer.SOURCE}
    return {'schema':producer.SCHEMA if version==1 else producer.SCHEMA_V2,'repository':producer.REPOSITORY,'pullRequest':1315,
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


def fixture_env(version=1):
    result={'GITHUB_REPOSITORY':producer.REPOSITORY,'GITHUB_EVENT_NAME':'pull_request',
        'GITHUB_ACTOR':'CrispStrobe','GITHUB_JOB':'native-font-selection' if version==1 else 'native-font-selection-v2',
        'GITHUB_RUN_ATTEMPT':'1','GITHUB_RUN_ID':RUN,'GITHUB_WORKFLOW_SHA':WORKFLOW_SHA,
        'GITHUB_WORKFLOW_REF':producer.REPOSITORY+'/'+producer.WORKFLOW+'@refs/pull/1315/merge',
        'BW_EXPECTED_HEAD':HEAD,'BW_EXPECTED_TREE':TREE}
    if version==2:result.update(BW_NATIVE_V2_INVOKER_UID='1001',BW_NATIVE_V2_INVOKER_GID='1002')
    return result


def fixture_event(pin,version=1):
    return producer.encode({'action':'labeled','label':{'name':producer.LABEL if version==1 else 'x86-native-font-selection-v2'},
        'sender':{'login':'CrispStrobe'},'repository':{'full_name':producer.REPOSITORY},
        'number':1315,'pull_request':{'number':1315,'state':'open',
        'head':{'sha':HEAD,'repo':{'full_name':producer.REPOSITORY,'fork':False}},
        'base':{'ref':'main','repo':{'full_name':producer.REPOSITORY}},
        'body':'<!-- '+('BW_NATIVE_FONT_REQUEST_SHA256' if version==1 else 'BW_NATIVE_FONT_V2_REQUEST_SHA256')+'='+pin+' -->'}})


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
    def produce(self,fault=None,event_transform=None):
        request=fixture_request();request_raw=producer.encode(request);pin=producer.sha(request_raw)
        event_raw=fixture_event(pin)
        if event_transform is not None:event_raw=event_transform(event_raw)
        ops=FakeOps(event_raw,fault)
        raw=producer.collect(request_raw,pin,fixture_env(),ops)
        return raw,request_raw,event_raw,request,ops
    def test_raw_event_formats_traverse_real_producer_and_independent_reader(self):
        def reverse(value):
            if isinstance(value,dict):return {key:reverse(item) for key,item in reversed(list(value.items()))}
            return value
        formats=(lambda raw:json.dumps(json.loads(raw),indent=2).encode()+b'\n',
            lambda raw:b' \r\n'+json.dumps(reverse(json.loads(raw)),ensure_ascii=True).encode()+b'\r\n\t ',
            lambda raw:raw+b'\n',
            lambda raw:raw+b' '*((256<<10)-len(raw)))
        for transform in formats:
            with self.subTest(format=transform):
                raw,request_raw,event_raw,request,ops=self.produce(event_transform=transform)
                self.assertNotEqual(event_raw,producer.encode(json.loads(event_raw)))
                verdict=grade(raw,request_raw,event_raw,request)
                self.assertTrue(verdict['nativeSelectionObserved'])
                value=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
                self.assertEqual(value['event'],{'bytes':len(event_raw),'sha256':producer.sha(event_raw)})
                self.assertEqual(ops.events.count('process'),1)
                self.assertFalse(verdict['browserFontSelectionProved']);self.assertFalse(verdict['guestApproved'])
                with self.assertRaises(reader.Refusal):
                    grade(raw,request_raw,producer.encode(json.loads(event_raw)),request)

    def test_raw_event_parser_bounds_duplicates_numbers_and_types_independently(self):
        good=b' \r\n{ "nested": {"finite": [0.25, -12, 1e2]}, "label": "test" }\n'
        parsed=json.loads(good)
        invalid=(b'',b'[]',b'null',b'true',b'"text"',b'{}{}',b'{bad}',b'{"x":1,}',
            b'\xff',b'\xef\xbb\xbf{}',b'{"x":1,"x":2}',b'{"x":1,"\\u0078":2}',
            b'{"nested":{"x":1,"x":2}}',b'{"nested":[{"x":1,"x":2}]}',
            b'{"nested":[NaN]}',b'{"nested":{"x":Infinity}}',b'{"nested":-Infinity}',
            b'{"nested":[1e999]}',b'{"nested":{"x":-1e999}}',
            b'{"nested":'+b'['*20+b'0'+b']'*19+b'}',
            b'{}'+b' '*((256<<10)-1))
        for parse in (producer.parse_event,reader.event_json):
            self.assertEqual(parse(good),parsed)
            self.assertEqual(parse(b'{}'+b' '*((256<<10)-2)),{})
            for raw in invalid:
                with self.subTest(parser=parse.__name__,raw=raw[:50]),self.assertRaises(ValueError):parse(raw)
            for raw in ('{}',bytearray(b'{}'),None):
                with self.assertRaises(ValueError):parse(raw)

    def test_invalid_raw_events_stop_before_source_tool_or_input(self):
        for transform in (lambda raw:raw[:-1]+b',"nested":{"x":1,"x":2}}',
                          lambda raw:raw[:-1]+b',"nested":[1e999]}'):
            raw,request_raw,event_raw,request,ops=self.produce(event_transform=transform)
            value=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
            self.assertFalse(value['complete']);self.assertIsNotNone(value['firstFailure'])
            self.assertEqual(ops.events,['event'])
            with self.assertRaises(reader.Refusal):grade(raw,request_raw,event_raw,request)

    def test_canonical_request_original_and_service_policies_unchanged(self):
        raw,request_raw,event_raw,request,_=self.produce()
        pretty_request=json.dumps(json.loads(request_raw),indent=2).encode()+b'\n'
        pretty_original=json.dumps(json.loads(raw),indent=2).encode()+b'\n'
        with self.assertRaises(ValueError):producer.admitted_request(pretty_request,producer.sha(pretty_request))
        with self.assertRaises(reader.Refusal):reader.request(pretty_request)
        with self.assertRaises(reader.Refusal):grade(pretty_original,request_raw,event_raw,request)
        service=json.dumps(json.loads(service_fixture(raw)),indent=2).encode()+b'\n'
        expected=expectation(raw,request_raw,event_raw,request)
        expected.update(serviceBytes=len(service),serviceSha256=producer.sha(service))
        with self.assertRaises(reader.Refusal):reader.original(raw,request_raw,event_raw,expected,service)

    def test_raw_event_source_mutants_are_nonvacuous(self):
        def mutated(module,name,change):
            tree=ast.parse(Path(module.__file__).read_text())
            node=next(row for row in tree.body if isinstance(row,ast.FunctionDef) and row.name==name)
            source=ast.get_source_segment(Path(module.__file__).read_text(),node)
            rewritten=change(source);self.assertNotEqual(source,rewritten)
            space=dict(module.__dict__);exec(compile(rewritten,'<inert-event-parser-mutant>','exec'),space)
            return space[name]
        request=fixture_request();request_raw=producer.encode(request);pin=producer.sha(request_raw)
        raw=json.dumps(json.loads(fixture_event(pin)),indent=2).encode()+b'\n';env=fixture_env()
        producer.admitted_event(raw,request,env,pin);reader.selected_event(raw,request,pin,env)
        # Replacing the new event-only entry with the old canonical parser kills
        # a valid raw event in each real admission function.
        old_producer=mutated(producer,'admitted_event',lambda s:s.replace('event = parse_event(raw)','event = parse(raw, 256 << 10)'))
        old_reader=mutated(reader,'selected_event',lambda s:s.replace('e=event_json(raw)','e=parse(raw,256<<10)'))
        with self.assertRaises(ValueError):old_producer(raw,request,env,pin)
        with self.assertRaises(reader.Refusal):old_reader(raw,request,pin,env)
        for module,name,duplicate_hook,float_hook in (
                (producer,'parse_event','object_pairs_hook=pairs,','parse_float=finite,'),
                (reader,'event_json','object_pairs_hook=unique,','parse_float=number,')):
            parse=getattr(module,name)
            for token,bad in ((duplicate_hook,b'{"nested":{"x":1,"x":2}}'),
                              (float_hook,b'{"nested":[1e999]}')):
                with self.subTest(module=module.__name__,guard=token):
                    with self.assertRaises(ValueError):parse(bad)
                    mutant=mutated(module,name,lambda s:s.replace(token,''))
                    self.assertIsInstance(mutant(bad),dict)

    def test_retained_event_exact_bytes_and_cap_boundary(self):
        for raw in (b' {\r\n "not-normalized" : true }\r\n',b'x'*(256<<10)):
            with tempfile.TemporaryDirectory(dir=DIRECTORY) as directory:
                root=Path(directory);source=root/'source.json';source.write_bytes(raw)
                out=root/'native-font-originals';out.mkdir(mode=0o700);target=out/'event.original.json'
                with patch.object(producer.subprocess,'Popen',side_effect=AssertionError('native process')) as process:
                    result=producer.retain_event(str(source),str(target))
                process.assert_not_called();self.assertEqual(target.read_bytes(),raw)
                self.assertEqual(result,{'bytes':len(raw),'sha256':producer.sha(raw)})
                self.assertEqual(stat.S_IMODE(target.stat().st_mode),0o600)
    def test_retained_event_missing_overflow_and_source_alias_refuse(self):
        for case in ('missing','empty','overflow','symlink','hardlink','parent-alias'):
            with self.subTest(case=case),tempfile.TemporaryDirectory(dir=DIRECTORY) as directory:
                root=Path(directory);source=root/'source.json';out=root/'owned';out.mkdir(mode=0o700)
                if case!='missing':
                    other=root/'other';other.write_bytes(b'held')
                    if case=='symlink':source.symlink_to(other)
                    elif case=='hardlink':os.link(other,source)
                    elif case=='parent-alias':
                        real=root/'real';real.mkdir();(real/'event.json').write_bytes(b'genuine')
                        alias=root/'alias';alias.symlink_to(real,target_is_directory=True);source=alias/'event.json'
                    else:source.write_bytes(b'' if case=='empty' else b'x'*((256<<10)+1))
                with self.assertRaises((ValueError,OSError)):producer.retain_event(str(source),str(out/'event.original.json'))
                self.assertFalse((out/'event.original.json').exists())
    def test_retained_event_exclusive_destination_and_parent_policy(self):
        for case in ('existing','symlink','parent-mode','parent-alias'):
            with self.subTest(case=case),tempfile.TemporaryDirectory(dir=DIRECTORY) as directory:
                root=Path(directory);source=root/'source';source.write_bytes(b'genuine')
                real=root/'owned';real.mkdir(mode=0o700);out=real
                sentinel=root/'sentinel';sentinel.write_bytes(b'unchanged')
                if case=='existing':(out/'event.original.json').write_bytes(b'first original')
                elif case=='symlink':(out/'event.original.json').symlink_to(sentinel)
                elif case=='parent-mode':out.chmod(0o755)
                else:out=root/'alias';out.symlink_to(real,target_is_directory=True)
                with self.assertRaises((ValueError,OSError)):producer.retain_event(str(source),str(out/'event.original.json'))
                self.assertEqual(sentinel.read_bytes(),b'unchanged')
                if case=='existing':self.assertEqual((out/'event.original.json').read_bytes(),b'first original')
    def test_retained_event_short_write_and_first_secondary_are_retained(self):
        actual_write=os.write;actual_close=os.close
        for short in (True,False):
            with tempfile.TemporaryDirectory(dir=DIRECTORY) as directory:
                root=Path(directory);source=root/'source';source.write_bytes(b'genuine bytes')
                out=root/'owned';out.mkdir(mode=0o700);target=out/'event.original.json';state={'writing':False,'closed':False}
                def write(fd,raw):
                    state['writing']=True
                    if short:return actual_write(fd,raw[:4])
                    raise OSError('primary event write')
                def close(fd):
                    actual_close(fd)
                    if state['writing'] and not state['closed']:
                        state['closed']=True;raise OSError('secondary event close')
                with patch.object(producer.os,'write',side_effect=write),patch.object(producer.os,'close',side_effect=close):
                    with self.assertRaisesRegex((ValueError,OSError),'complete retained event write' if short else 'primary event write') as seen:
                        producer.retain_event(str(source),str(target))
                self.assertEqual(target.read_bytes(),b'genu' if short else b'')
                self.assertEqual(len(seen.exception.native_secondary),1)
                self.assertEqual(seen.exception.native_secondary[0]['message'],'secondary event close')
    def test_retained_event_different_readback_refuses(self):
        write=os.write
        with tempfile.TemporaryDirectory(dir=DIRECTORY) as directory:
            root=Path(directory);source=root/'source';source.write_bytes(b'genuine bytes');out=root/'owned';out.mkdir(mode=0o700)
            def changed(fd,raw):
                count=write(fd,raw);os.lseek(fd,0,os.SEEK_SET);write(fd,b'!');return count
            with patch.object(producer.os,'write',side_effect=changed),self.assertRaisesRegex(ValueError,'byte readback'):
                producer.retain_event(str(source),str(out/'event.original.json'))
            self.assertEqual((out/'event.original.json').read_bytes(),b'!enuine bytes')
    def test_retained_event_cli_and_workflow_before_service(self):
        with patch.dict(producer.os.environ,{'GITHUB_EVENT_PATH':'/genuine/event.json'}),patch.object(producer,'retain_event') as retain:
            self.assertEqual(producer.main(['--retain-event','--event-out','/owned/event.original.json']),0)
            retain.assert_called_once_with('/genuine/event.json','/owned/event.original.json')
        with patch.object(producer,'ENABLED',False),patch.object(producer,'retain_event') as retain:
            with self.assertRaisesRegex(ValueError,'disabled'):producer.main(['--retain-event','--event-out','/owned/event.original.json'])
            retain.assert_not_called()
        failure=OSError('first event write');failure.native_secondary=[producer.error_row(OSError('second close'),'event-close')]
        with patch.object(producer,'retain_event',side_effect=failure),patch.object(producer.sys,'stderr',new_callable=io.StringIO) as stderr:
            self.assertEqual(producer.main(['--retain-event','--event-out','/owned/event.original.json']),1)
            diagnostic=json.loads(stderr.getvalue());self.assertEqual(diagnostic['firstFailure']['message'],'first event write')
            self.assertEqual(diagnostic['secondary'][0]['message'],'second close')
            self.assertLessEqual(len(stderr.getvalue().encode()),4096)
        workflow=(ROOT/producer.WORKFLOW).read_text()
        self.assertLess(workflow.index('--retain-event'),workflow.index('set +e'))
        self.assertIn('NATIVE_EVENT="$GITHUB_WORKSPACE/native-font-originals/event.original.json"',workflow)
        self.assertIn('--setenv="GITHUB_EVENT_PATH=$NATIVE_EVENT"',workflow)
        self.assertNotIn('--setenv="GITHUB_EVENT_PATH=$GITHUB_EVENT_PATH"',workflow)
    def test_independent_reader_refuses_reformatted_event_bytes(self):
        raw,request_raw,event_raw,request,_=self.produce()
        self.assertTrue(grade(raw,request_raw,event_raw,request)['nativeSelectionObserved'])
        with self.assertRaises(reader.Refusal):grade(raw,request_raw,event_raw+b'\n',request)
    def test_disabled_refuses_before_every_provider_edge(self):
        class NoEdges:
            def __getattr__(self,name):raise AssertionError('disabled touched '+name)
        with patch.object(producer,'ENABLED',False):
            with self.assertRaisesRegex(ValueError,'disabled'):
                producer.collect(b'bad','0'*64,{},NoEdges())
            with self.assertRaisesRegex(ValueError,'disabled'):
                producer.main(['--observe'])
            with self.assertRaisesRegex(ValueError,'disabled'):
                producer.main(['--finalize'])
    def test_workflow_outer_service_contract_is_gated_and_bounded(self):
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
        self.assertEqual(workflow.count('false && github.event.action'),2)
        self.assertIn('  native-font-selection-v2:',workflow)
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
    def test_google_fonts_urls_require_full_commit_and_safe_path_before_get(self):
        for selected in (producer.FONT_URL,producer.LICENSE_URL):
            self.assertEqual(producer.google_fonts_raw_url(selected),selected)
            self.assertEqual(reader.google_fonts_raw_url(selected),selected)
        root='https://raw.githubusercontent.com/google/fonts/'
        bad=(root+'main/apache/robotomono/RobotoMono%5Bwght%5D.ttf',
             root+'90d7886/apache/robotomono/RobotoMono%5Bwght%5D.ttf',
             root+'A'*40+'/font.ttf',root+'a'*40+'/',
             root+'a'*40+'/../font.ttf',root+'a'*40+'/%2e%2e/font.ttf',
             root+'a'*40+'/font%2Fother.ttf',root+'a'*40+'/font\\name.ttf',
             root+'a'*40+'/font.ttf?branch=main',root+'a'*40+'/font.ttf#part',
             root+'a'*40+'/font\n.ttf')
        with patch.object(producer.urllib.request,'build_opener') as network:
            for url in bad:
                with self.subTest(url=url),self.assertRaises(ValueError):producer.google_fonts_raw_url(url)
                with self.subTest(url=url),self.assertRaises(reader.Refusal):reader.google_fonts_raw_url(url)
                with self.subTest(url=url),self.assertRaises(ValueError):producer.LiveOps({}).input(url,1)
            network.assert_not_called()
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


class KernelV2:
    """Only mocked selected kernel endpoints; no host proc/cgroup is read."""
    UID=1001;GID=1002;PID=1234
    def __init__(self,fault=None):
        self.fault=fault;self.fds={};self.opens=[];self.reads=[];self.closes=[]
        self.unit='bw-native-font-v2-'+RUN+'-1.service'
        self.base='/sys/fs/cgroup/system.slice/'+self.unit
        self.data={'/proc/self/cgroup':('0::/system.slice/'+self.unit+'\n').encode(),
            **{self.base+'/'+k:v.encode() for k,v in {
                'cpu.max':'100000 100000\n','memory.max':'1073741824\n',
                'memory.swap.max':'0\n','pids.max':'64\n','memory.current':'1024\n',
                'pids.current':'1\n','cgroup.events':'populated 1\nfrozen 0\n',
                'memory.events':'oom_kill 0\n','pids.events':'max 0\n',
                'cgroup.stat':'nr_descendants 0\nnr_dying_descendants 0\n',
                'cgroup.procs':'1234\n','cgroup.threads':'1234\n'}.items()}}
        if fault=='overflow':self.data['/proc/self/cgroup']=b'X'*4097
    def info(self,path,after=False,named=False):
        self_role=path=='/proc/self/cgroup';uid=self.UID if self_role else 0
        gid=self.GID if self_role else 0;mode=stat.S_IFREG|0o444
        if self_role and self.fault=='foreign-proc':uid+=1
        if self_role and self.fault=='root-proc':uid=0
        if self_role and self.fault=='foreign-gid':gid+=1
        if self_role and self.fault=='nonregular':mode=stat.S_IFIFO|0o444
        if not self_role and self.fault=='user-cgroup':uid=self.UID
        ino=100+list(self.data).index(path)
        if self_role and ((after and self.fault=='held-drift') or (named and self.fault=='named-drift')):ino+=1
        return SimpleNamespace(st_dev=2 if self_role else 3,st_ino=ino,
            st_mode=mode,st_uid=uid,st_gid=gid)
    def open(self,path,flags):
        assert path in self.data,'unexpected host endpoint '+str(path)
        self.opens.append((path,flags));fd=40+len(self.opens)
        self.fds[fd]={'path':path,'offset':0,'stats':0};return fd
    def fstat(self,fd):
        row=self.fds[fd];row['stats']+=1
        return self.info(row['path'],after=row['stats']>1)
    def read(self,fd,size):
        row=self.fds[fd];path=row['path'];self.reads.append((path,size))
        if path=='/proc/self/cgroup' and self.fault in ('read','read-close'):raise OSError('FIRST_READ')
        data=self.data[path][row['offset']:row['offset']+size];row['offset']+=len(data);return data
    def close(self,fd):
        self.closes.append(fd)
        if self.fds[fd]['path']=='/proc/self/cgroup' and self.fault in ('close','read-close'):raise OSError('SECOND_CLOSE')
    def scandir(self,path):
        assert str(path)==self.base,'unexpected directory census'
        return SimpleNamespace(__enter__=lambda:iter(()))
    def __enter__(self):
        self.stack=ExitStack()
        class EmptyScan:
            def __enter__(self):return iter(())
            def __exit__(self,*args):return False
        def scan(path):assert str(path)==self.base;return EmptyScan()
        patches={'open':self.open,'fstat':self.fstat,'read':self.read,
            'lstat':lambda p:self.info(str(p),named=True),'close':self.close,
            'getpid':lambda:self.PID,
            'getresuid':lambda:(self.UID+1,)*3 if self.fault=='process-uid' else (self.UID,)*3,
            'getresgid':lambda:(self.GID+1,)*3 if self.fault=='process-gid' else (self.GID,)*3,
            'scandir':scan}
        for name,value in patches.items():self.stack.enter_context(patch.object(producer.os,name,value))
        return self
    def __exit__(self,*args):return self.stack.__exit__(*args)

class GenuineServiceV2Ops(FakeOps):
    def __init__(self,event):
        super().__init__(event);self.live=producer.LiveOps(fixture_env(2),2);self.service_partial=None
    def service(self,phase):
        self.events.append('service-'+phase)
        try:return self.live.service(phase)
        finally:self.service_partial=self.live.service_partial

def finalized_v2(raw,service_exit=None,original_error=None,post_changes=None,census_error=None,cleanup_error=None):
    """Real finalizer, fake syscall/control edges, captured canonical output."""
    if service_exit is None:
        body=reader.parse(raw,reader.LIMITS['originalBytes'],lf=True)
        service_exit=0 if body['complete'] else 1
    calls=[];writes=[]
    selected=('LoadState','ActiveState','SubState','Result','ExecMainCode',
              'ExecMainStatus','ControlGroup','MainPID','ControlPID','KillMode')
    def command(argv,**kwargs):
        assert argv[:3]==['/usr/bin/sudo','-n','/usr/bin/systemctl']
        assert 'bw-native-font-v2-'+RUN+'-1.service' in argv
        action=argv[3];calls.append(action)
        if cleanup_error and action=='reset-failed':raise OSError('SECOND_CLEANUP')
        values={key:'' for key in selected}
        failed=service_exit!=0 and calls.count('show')==1
        values.update(LoadState='loaded' if failed else 'not-found',
            ActiveState='failed' if failed else 'inactive',SubState='failed' if failed else 'dead',
            Result='exit-code' if failed else 'success',ExecMainCode='1' if failed else '0',
            ExecMainStatus='1' if failed else '0',MainPID='0',ControlPID='0',KillMode='control-group')
        if post_changes and action=='show' and calls.count('show')==2:values.update(post_changes)
        return SimpleNamespace(returncode=0,stdout=(''.join(k+'='+values[k]+'\n' for k in selected).encode() if action=='show' else b''),stderr=b'')
    with patch.object(producer,'V2_ENABLED',True),\
         patch.object(producer.LiveOps,'regular',side_effect=original_error,return_value=raw),\
         patch.object(producer.subprocess,'run',side_effect=command),\
         patch.object(producer.os,'getresuid',return_value=(1001,)*3),\
         patch.object(producer.os,'getresgid',return_value=(1002,)*3),\
         patch.object(producer.os,'lstat',side_effect=census_error or FileNotFoundError),\
         patch.object(producer.os,'open',return_value=99),\
         patch.object(producer.os,'write',side_effect=lambda fd,b:(writes.append(b),len(b))[1]),\
         patch.object(producer.os,'close') as closed:
        rc=producer.finalize_service('/mock/original','/mock/service',service_exit,fixture_env(2),2)
        closed.assert_called_once_with(99)
    assert len(writes)==1
    return writes[0],rc,calls

class V2Controls(unittest.TestCase):
    setUp=Controls.setUp
    def produce(self,fault=None):
        request=fixture_request(2);request_raw=producer.encode(request);pin=producer.sha(request_raw)
        event=fixture_event(pin,2);ops=GenuineServiceV2Ops(event)
        with patch.object(producer,'V2_ENABLED',True),KernelV2(fault) as kernel:
            raw=producer.collect(request_raw,pin,fixture_env(2),ops,2)
        return raw,request_raw,event,request,ops,kernel
    def grade(self,values):
        raw,request_raw,event,request,*_=values;service,rc,_=finalized_v2(raw);self.assertEqual(rc,0)
        expected=expectation(raw,request_raw,event,request)
        expected.update(schema=reader.EXPECTATION_V2,serviceBytes=len(service),serviceSha256=reader.sha(service))
        return reader.original(raw,request_raw,event,expected,service,2),service,expected
    def test_genuine_service_edges_full_v2_producer_finalizer_and_reader(self):
        values=self.produce();raw,*_=values;packet=reader.parse(raw,2<<20,lf=True)
        self.assertTrue(packet['complete']);self.assertIsNone(packet['servicePartial'])
        self.assertEqual(packet['service']['before']['processIdentity']['resuid'],[1001]*3)
        self.assertEqual(packet['service']['before']['selfProc']['before']['uid'],1001)
        verdict,service,expected=self.grade(values)
        self.assertEqual(verdict['schema'],'bw.gui-hdd.native-font-reader.v2')
        self.assertTrue(verdict['nativeSelectionObserved']);self.assertFalse(verdict['guestApproved'])
        self.assertEqual(values[4].events.count('process'),1)
        self.assertEqual(len(values[5].opens),len(values[5].closes))
        files={'original':raw,'request':values[1],'event':values[2],
               'expected':reader.canonical(expected),'service':service}
        def opened(path,*args,**kwargs):
            self.assertIn(str(path),files);return io.BytesIO(files[str(path)])
        stream=io.StringIO()
        with patch('builtins.open',side_effect=opened),patch.object(sys,'stdout',stream):
            reader.main(['--protocol-v2','--original','original','--request','request',
                         '--event','event','--expected','expected','--service','service'])
        self.assertEqual(json.loads(stream.getvalue()),verdict)
    def test_exact_proc_owner_group_type_and_cgroup_owner_precede_reads(self):
        for fault in ('foreign-proc','root-proc','foreign-gid','nonregular','user-cgroup'):
            with self.subTest(fault=fault):
                raw,*_,ops,kernel=self.produce(fault);packet=reader.parse(raw,2<<20,lf=True)
                self.assertFalse(packet['complete']);self.assertIsNotNone(packet['servicePartial'])
                self.assertNotIn('tool',ops.events);self.assertNotIn('input',ops.events)
                forbidden='/proc/self/cgroup' if fault!='user-cgroup' else kernel.base+'/cpu.max'
                self.assertEqual([p for p,n in kernel.reads if p==forbidden],[])
                self.assertEqual(len(kernel.closes),len(kernel.opens))
                sidecar,rc,_=finalized_v2(raw);self.assertEqual(rc,1)
                report=reader.failed_attempt(raw,sidecar,2)
                self.assertFalse(report['nativeSelectionObserved']);self.assertFalse(report['guestApproved'])
    def test_configured_ids_are_checked_against_actual_process_before_open(self):
        for fault in ('process-uid','process-gid'):
            raw,*_,ops,kernel=self.produce(fault);packet=reader.parse(raw,2<<20,lf=True)
            self.assertFalse(packet['complete']);self.assertEqual(kernel.opens,[])
            self.assertNotIn('tool',ops.events)
            self.assertIsNotNone(packet['servicePartial']['processIdentity'])
    def test_read_close_drift_and_overflow_partial_is_truthful(self):
        for fault in ('read','close','read-close','held-drift','named-drift','overflow'):
            with self.subTest(fault=fault):
                raw,*_,ops,kernel=self.produce(fault);p=reader.parse(raw,2<<20,lf=True)
                self.assertFalse(p['complete']);self.assertNotIn('tool',ops.events)
                witness=p['servicePartial']['selfProc'];self.assertTrue(witness['closeAttempted'])
                self.assertEqual(len(kernel.closes),len(kernel.opens))
                if fault=='read-close':
                    self.assertIn('FIRST_READ',p['firstFailure']['message'])
                    self.assertEqual(p['secondary'][0]['phase'],'pseudo-close')
                    self.assertIn('SECOND_CLOSE',p['secondary'][0]['message'])
                if fault=='overflow':
                    self.assertEqual(witness['bytesRead'],4097)
                    self.assertEqual(witness['prefixBytes'],4096)
                    self.assertFalse(witness['complete'])
                sidecar,rc,_=finalized_v2(raw);self.assertEqual(rc,1)
                self.assertFalse(reader.failed_attempt(raw,sidecar,2)['nativeSelectionObserved'])
    def test_missing_before_finalizer_retains_original_primary_and_finite_cleanup(self):
        raw,*_=self.produce('foreign-proc');body=reader.parse(raw,2<<20,lf=True)
        self.assertIsNone(body['service']['before'])
        service,rc,calls=finalized_v2(raw);self.assertEqual(rc,1)
        outside=reader.parse(service,65536,lf=True)
        self.assertEqual(outside['firstFailure'],body['firstFailure'])
        self.assertFalse(outside['innerBeforeObserved']);self.assertFalse(outside['innerComplete'])
        self.assertTrue(outside['outsideFiniteCleanupProved']);self.assertEqual(calls,['show','reset-failed','show'])
        self.assertNotEqual(outside['firstFailure']['name'],'TypeError')
    def test_finalizer_missing_malformed_inner_and_secondary_failures_are_retained(self):
        raw,*_=self.produce('foreign-proc');original=reader.parse(raw,2<<20,lf=True)
        for wire,error in ((b'',FileNotFoundError('MISSING_ORIGINAL')),(b'not-json',None)):
            outside,rc,calls=finalized_v2(wire,1,original_error=error)
            value=reader.parse(outside,65536,lf=True)
            self.assertEqual(rc,1);self.assertEqual(value['firstFailure']['phase'],'outside-original-join')
            self.assertTrue(value['outsideFiniteCleanupProved']);self.assertEqual(calls,['show','reset-failed','show'])
            self.assertFalse(value['innerBeforeObserved']);self.assertFalse(value['innerComplete'])
            if not wire:
                self.assertFalse(reader.failed_attempt(wire,outside,2)['nativeSelectionObserved'])
        outside,rc,_=finalized_v2(raw,cleanup_error=True)
        value=reader.parse(outside,65536,lf=True)
        self.assertEqual(value['firstFailure'],original['firstFailure']);self.assertEqual(rc,1)
        self.assertIn('SECOND_CLEANUP',value['secondary'][0]['message'])
        self.assertFalse(value['outsideFiniteCleanupProved'])
        self.assertFalse(reader.failed_attempt(raw,outside,2)['nativeSelectionObserved'])
    def test_finalizer_terminal_pid_and_unknown_census_never_supply_cleanup(self):
        raw,*_=self.produce('foreign-proc')
        for kwargs in ({'post_changes':{'MainPID':'42'}},{'post_changes':{'ControlPID':'42'}},
                       {'post_changes':{'ControlGroup':'/foreign'}},{'census_error':PermissionError('UNKNOWN_CGROUP')}):
            outside,rc,_=finalized_v2(raw,**kwargs);value=reader.parse(outside,65536,lf=True)
            self.assertEqual(rc,1);self.assertFalse(value['outsideFiniteCleanupProved'])
            self.assertFalse(reader.failed_attempt(raw,outside,2)['nativeSelectionObserved'])
            value['outsideFiniteCleanupProved']=True
            with self.assertRaises(reader.Refusal):reader.failed_attempt(raw,reader.canonical(value)+b'\n',2)
    def test_failed_reader_rederives_coherent_sidecar_truth_and_error_grammar(self):
        raw,*_=self.produce('foreign-proc');service,_,_=finalized_v2(raw)
        for cut in ('pid','populated','unknown','cleanup','failure'):
            value=reader.parse(service,65536,lf=True)
            if cut=='pid':value['post']['unit']['MainPID']='42'
            elif cut=='populated':value['post']['cgroup']=dict(exists=True,populated=1,procs=[42],threads=[42],nrDescendants=1,nrDyingDescendants=0)
            elif cut=='unknown':value['post']=None
            elif cut=='cleanup':value['cleanup']['resetExitCode']=1
            else:value['firstFailure']={'phase':'','name':'ValueError','message':'bad'}
            with self.subTest(cut=cut),self.assertRaises(reader.Refusal):reader.failed_attempt(raw,reader.canonical(value)+b'\n',2)
    def test_coherent_identity_and_v1_route_mutations_refuse(self):
        values=self.produce();raw,request_raw,event,request,*_=values
        verdict,service,expected=self.grade(values)
        for mutate in ('owner','identity','role','schema','job','partial'):
            packet=reader.parse(raw,2<<20,lf=True)
            if mutate=='owner':packet['service']['before']['selfProc']['before']['uid']=9999
            elif mutate=='identity':packet['service']['before']['processIdentity']['resuid']=[1002]*3
            elif mutate=='role':packet['service']['before']['selfProc']['path']='/proc/1/cgroup'
            elif mutate=='schema':packet['schema']=producer.ORIGINAL
            elif mutate=='job':packet['platform']['GITHUB_JOB']='native-font-selection'
            else:packet['servicePartial']={'invented':True}
            bad=reader.canonical(packet)+b'\n';selected=dict(expected,originalBytes=len(bad),originalSha256=reader.sha(bad))
            with self.subTest(mutation=mutate),self.assertRaises(reader.Refusal):
                reader.original(bad,request_raw,event,selected,service,2)
        bad=copy.deepcopy(request);bad['schema']=producer.SCHEMA
        with self.assertRaises(ValueError):producer.admitted_request(producer.encode(bad),producer.sha(producer.encode(bad)),2)
        old_event=fixture_event(producer.sha(request_raw),1)
        with self.assertRaises(ValueError):producer.admitted_event(old_event,request,fixture_env(2),producer.sha(request_raw),2)
    def test_owner_guard_mutants_have_observable_forbidden_read_effect(self):
        real_need=producer.need
        for fault,message in [('foreign-proc','self proc owner matches configured process identity'),
                              ('user-cgroup','root-owned cgroup or proc text'),
                              ('process-uid','actual service identities match configured unprivileged invoker')]:
            def weakened(value,reason):
                if reason!=message:real_need(value,reason)
            live=producer.LiveOps(fixture_env(2),2)
            with KernelV2(fault) as kernel,patch.object(producer,'need',side_effect=weakened):
                observed=live.service('before')
            forbidden=kernel.base+'/cpu.max' if fault=='user-cgroup' else '/proc/self/cgroup'
            self.assertTrue(any(p==forbidden for p,n in kernel.reads))
            if fault!='user-cgroup':
                with self.assertRaises(ValueError):producer.service_snapshot(observed,'before',2)
            else:
                # Without the root-file guard, the same fabricated resource
                # values pass the positive snapshot validator: the no-read
                # negative controls are necessary, not a mirrored assertion.
                producer.service_snapshot(observed,'before',2)
    def test_v2_pseudo_scope_refuses_other_proc_and_user_selected_cgroups_before_open(self):
        live=producer.LiveOps(fixture_env(2),2)
        with KernelV2() as kernel:
            live.service_partial={'phase':'before','unit':'bw-native-font-v2-'+RUN+'-1.service',
                                  'processIdentity':live.process_identity(),'lastPath':None,'selfProc':None}
            for path,role in (('/proc/1/cgroup','self-proc'),('/proc/self/status','self-proc'),
                              ('/proc/self/cgroup','cgroup'),(kernel.base+'/cpu.stat','cgroup'),
                              ('/sys/fs/cgroup/other/cpu.max','cgroup')):
                with self.subTest(path=path),self.assertRaises(ValueError):live.pseudo(path,4096,role)
            self.assertEqual(kernel.opens,[])
    def test_v2_raw_pretty_event_joins_exact_bytes_without_v1_projection(self):
        req=fixture_request(2);raw=producer.encode(req);pin=producer.sha(raw)
        for event in (json.dumps(json.loads(fixture_event(pin,2)),indent=2).encode()+b'\n',
                      b' \n'+fixture_event(pin,2)+b' \n'):
            ops=GenuineServiceV2Ops(event)
            with patch.object(producer,'V2_ENABLED',True),KernelV2():wire=producer.collect(raw,pin,fixture_env(2),ops,2)
            self.assertTrue(reader.parse(wire,2<<20,lf=True)['complete'])
            report,_,_=self.grade((wire,raw,event,req));self.assertTrue(report['nativeSelectionObserved'])
    def test_v2_disabled_modes_refuse_before_all_factories_and_kernel_edges(self):
        self.assertFalse(producer.V2_ENABLED)
        class NoEdges:
            def __getattr__(self,name):raise AssertionError('inactive touched '+name)
        with self.assertRaisesRegex(ValueError,'disabled'):
            producer.collect(b'bad','0'*64,{},NoEdges(),2)
        for mode in (['--observe'],['--finalize'],['--retain-event','--event-out','/mock/event']):
            with patch.object(producer,'LiveOps') as factory,patch.object(producer.os,'open') as opened:
                with self.assertRaisesRegex(ValueError,'disabled'):producer.main(mode+['--protocol-v2'])
                factory.assert_not_called();opened.assert_not_called()
    def test_workflow_v1_and_v2_are_separate_inactive_source_bound_routes(self):
        text=(ROOT/producer.WORKFLOW).read_text();v1=text.split('  native-font-selection:\n',1)[1].split('  native-font-selection-v2:\n',1)[0]
        v2=text.split('  native-font-selection-v2:\n',1)[1]
        for block in (v1,v2):self.assertIn('false && github.event.action',block)
        self.assertIn("'x86-native-font-selection-v2'",v2)
        for marker in ('vars.BW_NATIVE_FONT_V2_REQUEST_SHA256','vars.BW_NATIVE_FONT_V2_REQUEST_B64',
                       'BW_NATIVE_V2_INVOKER_UID="$(/usr/bin/id -u)"',
                       'BW_NATIVE_V2_INVOKER_GID="$(/usr/bin/id -g)"',
                       '--property="User=$BW_NATIVE_V2_INVOKER_UID"',
                       '--property="Group=$BW_NATIVE_V2_INVOKER_GID"',
                       '--observe --protocol-v2','--finalize --protocol-v2','--retain-event --protocol-v2'):
            self.assertIn(marker,v2)
        self.assertNotIn('vars.BW_NATIVE_FONT_REQUEST_SHA256',v2)

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromTestCase(Controls),
        unittest.defaultTestLoader.loadTestsFromTestCase(V2Controls)]))
    if not result.wasSuccessful():sys.exit(1)
    print(json.dumps({'testOnly':True,'methods':result.testsRun,'nativeCalls':0,
                      'actualApproved':False,'pass':True},sort_keys=True))
