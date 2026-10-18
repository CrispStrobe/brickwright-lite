import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));

// These are manufactured original-byte controls, never a browser/guest replay.
// The independent reader is loaded directly; no producer grading helper is used.
const controls = String.raw`
import ast,base64,copy,hashlib,importlib.util,io,json,os,pathlib,stat,sys,tarfile,tempfile,unittest,zipfile
from unittest.mock import patch
root=pathlib.Path(sys.argv[1])
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,root/path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
r=load('original_reader','scripts/read-i80386-hdd-gui-originals.py')
c=load('actual_controller','scripts/run-i80386-hdd-gui-actual.py')
E=r.encode;H=r.sha;D=r.decode
ROW=lambda raw:{'byteLength':len(raw),'sha256':H(raw)}
PNG=b'\x89PNG\r\n\x1a\nmanufactured'
def zip_(files):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name,raw in sorted(files.items()):archive.writestr(name,raw)
    return out.getvalue()
def packet(files):
    files={k:v for k,v in files.items() if k!='inventory.json'}
    return zip_(dict(files,**{'inventory.json':E({'schema':'bw.gui-hdd.originals.v1','files':{k:ROW(v) for k,v in files.items()}})}))
def image_():
    image=bytearray(r.INPUTS['hdd'][0]);image[510:512]=b'\x55\xaa';image[454:458]=(17).to_bytes(4,'little');p=17*512
    image[p+510:p+512]=b'\x55\xaa';image[p+11:p+13]=(512).to_bytes(2,'little');image[p+13]=2
    image[p+14:p+16]=(1).to_bytes(2,'little');image[p+16]=2;image[p+17:p+19]=(512).to_bytes(2,'little');image[p+22:p+24]=(41).to_bytes(2,'little')
    fat=p+512;root_=fat+82*512;data=root_+512*32
    for at in (fat,fat+41*512):image[at+4:at+6]=b'\xff\xff'
    image[root_:root_+11]=b'BWKEEP  TXT';image[root_+11]=0x20;image[root_+26:root_+28]=(2).to_bytes(2,'little');marker=b'bw-hdd-persist-ok\r\n'
    image[root_+28:root_+32]=len(marker).to_bytes(4,'little');image[data:data+len(marker)]=marker
    return bytes(image)
def proc(argv,stdout=b'',stderr=b'',env=None,seconds=1):
    return {'argv':argv,'environment':env or {},'identity':{'pid':400,'pgid':400,'sessionId':400,'startTicks':8},
      'descendantSamples':[],'remainingDescendants':[],'startedNs':1,'endedNs':int(seconds*1e9)+1,'exitCode':0,
      'streams':{'stdout':ROW(stdout),'stderr':ROW(stderr)},'overflowObservedBytes':{},'firstFailure':None,'secondaryFailures':[],
      'sameProcessGroupCleanupContinuousOwnershipQualified':False}
def fixture():
    contents={name:('source:'+name).encode() for name in r.SOURCE};source={'head':'a'*40,'tree':'b'*40,'files':{name:ROW(raw) for name,raw in contents.items()}}
    critical={name:source['files'].get(name,ROW(name.encode())) for name in r.CRITICAL}
    installed={name+'/package.json':ROW(name.encode()) for name in ('node_modules/bw-board','node_modules/playwright','node_modules/playwright-core')}
    runtime={'files':{'/node':{'byteLength':124827920,'sha256':'fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48'},
      '/python':ROW(b'python'),'/chrome':ROW(b'chrome'),'/usr/bin/git':ROW(b'git'),'/usr/bin/gh':ROW(b'gh')},
      'aliases':{'/python-link':{'linkText':'python','target':'/python'}},'node':'/node','python':'/python','chromium':'/chrome',
      'tools':{'git':'/usr/bin/git','gh':'/usr/bin/gh'},'resources':{'jobMinutes':35,'controllerSeconds':1800,
       'scenarioSeconds':{'freedos-hdd-persistence':1250,'forward-debug':180},'perProcessCoreBytes':0,
       'perProcessFileBytes':r.FILE_CAP,'perProcessOpenFiles':256,'aggregateContainmentQualified':False}}
    prior={'schema':'bw.gui-hdd.inventory-original.v1','observationOnly':True,'templateSha256':'9'*64,'source':source,
      'installedFiles':installed,'runtime':runtime,'commands':[],'platform':{'GITHUB_RUN_ID':'90','GITHUB_RUN_ATTEMPT':'1',
       'GITHUB_JOB':'inventory','GITHUB_REPOSITORY':r.REPOSITORY,'GITHUB_WORKFLOW_SHA':'d'*40,'GITHUB_EVENT_NAME':'pull_request','GITHUB_ACTOR':'CrispStrobe','BW_EXPECTED_HEAD':'a'*40}}
    prior_event=E({'action':'labeled','label':{'name':'x86-hdd-gui-inventory'},'sender':{'login':'CrispStrobe'},'repository':{'full_name':r.REPOSITORY},'number':123,
      'pull_request':{'number':123,'state':'open','head':{'sha':'a'*40,'repo':{'full_name':r.REPOSITORY,'fork':False}},
        'base':{'ref':'main','repo':{'full_name':r.REPOSITORY}},'body':'<!-- BW_GUI_HDD_INVENTORY_SHA256='+'9'*64+' -->'}})
    prior['event']=dict(ROW(prior_event),base64=base64.b64encode(prior_event).decode())
    prior_raw=E(prior)
    frontend=zip_({'index.html':b'<html>manufactured</html>','brickwright-build.json':E({'commit':'a'*7})})
    admission={'schema':'bw.gui-hdd.frontend-source-admission.v1','checkoutHead':'a'*40,'checkoutTree':'b'*40,
      'sourceFiles':source['files'],'checkoutLog':ROW(b'independently retained checkout original'),
      'workflow':{'commit':'a'*40,'path':'.github/workflows/build.yml','sha256':'8'*64}}
    build={'runId':100,'attempt':1,'head':'a'*40,'jobId':101,'jobName':'build','artifactId':102,'name':'github-pages',
      'metadataBytes':len(frontend),'zipBytes':len(frontend),'sha256':H(frontend),'checkoutHead':'a'*40,'sourceFiles':source['files'],'sourceAdmission':admission}
    request={'schema':'bw.gui-hdd.actual-request.v1','repository':r.REPOSITORY,'pullRequest':123,'source':source,'build':build,
      'criticalFiles':critical,'installedFiles':installed,'runtime':runtime,'inventoryAdmission':{
       'schema':'bw.gui-hdd.inventory-admission.v1','sourceHead':'a'*40,'runId':90,'jobId':91,'artifactId':92,'artifactSha256':'7'*64,
       'original':ROW(prior_raw),'templateSha256':'9'*64,'workflow':{'commit':'d'*40,'path':'.github/workflows/i80386-hdd-gui-actual.yml','sha256':'6'*64}},
      'inputs':{name:dict(ROW(b'ignored'),path='gui-inputs/'+name) for name in r.INPUTS}}
    for name,(size,digest) in r.INPUTS.items():request['inputs'][name]={'path':{'floppy':'gui-inputs/floppy.img','hdd':'gui-inputs/hdd.img','bios':'gui-inputs/bios.bin','vgaRom':'gui-inputs/vga.bin'}[name],'byteLength':size,'sha256':digest}
    raw=E(request);pin=H(raw);repo={'full_name':r.REPOSITORY,'fork':False}
    event={'action':'labeled','label':{'name':r.LABEL},'sender':{'login':'CrispStrobe'},'repository':repo,'number':123,
      'pull_request':{'number':123,'state':'open','head':{'sha':'a'*40,'repo':repo},'base':{'ref':'main','repo':repo},
       'body':'<!-- BW_GUI_HDD_REQUEST_SHA256='+pin+' -->'}}
    observed=dict(runtime,identities={'/chrome':{'dev':4,'ino':5}},aggregateContainmentQualified=False)
    files={'request.original.json':raw,'event.original.json':E(event),'source.before.json':E(source),'source.after.json':E(source),
      'installed.before.json':E(installed),'installed.after.json':E(installed),'runtime.before.json':E(observed),'runtime.after.json':E(observed),
      'frontend.original.zip':frontend,'frontend.members.json':E(r.read_frontend(frontend)[0]),'build.inventory.json':E(r.read_frontend(frontend)[1]),
      'probe-admission.json':E({'schema':'bw.gui-hdd-persistence-admission.v1','boardPin':r.BOARD,'sourceHead':source['head'],
       'criticalFiles':critical,'buildRoot':'/checkout/gui-originals/originals-build','buildFiles':r.read_frontend(frontend)[1],
       'inputPaths':{name:'/checkout/'+row['path'] for name,row in request['inputs'].items()}}),'frontend-acquisition.stderr':b'',
      'result.json':E({'schema':'bw.gui-hdd.result.v1','pass':True,'requestSha256':pin,'scenarios':list(r.SCENARIOS),'firstFailure':None,'secondary':[]})}
    buildrun={'id':100,'run_attempt':1,'status':'completed','conclusion':'success','head_sha':'a'*40,
      'repository':repo,'path':'.github/workflows/build.yml'}
    buildjob={'id':101,'run_id':100,'name':'build','status':'completed','conclusion':'success'}
    buildartifact={'id':102,'name':'github-pages','expired':False,'size_in_bytes':len(frontend),'workflow_run':{'id':100,'head_sha':'a'*40},'digest':'sha256:'+H(frontend)}
    for role,value in (('build-run',buildrun),('build-job',buildjob),('build-artifact',buildartifact)):files[role+'.original.json']=E(value)
    acquisition=proc(['/usr/bin/gh','api','repos/'+r.REPOSITORY+'/actions/artifacts/102/zip'],frontend)
    files['frontend-acquisition.process.json']=E(acquisition)
    prefix=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']
    args=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]+[['cat-file','blob','a'*40+':'+name] for name in sorted(r.SOURCE)]
    args+=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}']]
    indices=list(range(len(r.SOURCE)+2))+[len(r.SOURCE)+5,len(r.SOURCE)+6]
    for position,(index,arguments) in enumerate(zip(indices,args)):
        stdout=((source['head' if arguments[1]=='HEAD' else 'tree']+'\n').encode() if arguments[0]=='rev-parse' else contents[sorted(r.SOURCE)[position-2]])
        role='git-'+str(index);files[role+'.stdout']=stdout;files[role+'.stderr']=b'';files[role+'.process.json']=E(proc(prefix+arguments,stdout))
    for scenario in r.SCENARIOS:
        env={'PROOF_ADMISSION':'/checkout/gui-originals/originals/probe-admission.json','PROOF_OUTPUT':'/checkout/gui-originals/originals/'+scenario,'PROOF_SCENARIO':scenario,'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH':'/chrome','PROOF_BROWSER_SHA256':H(b'chrome')}
        child=proc(['/node',r.PROBE],env=env);child['descendantSamples']=[{'atNs':2,'descendants':[{'executable':'/chrome','executableIdentity':{'dev':4,'ino':5}}]}]
        files[scenario+'.stdout']=b'';files[scenario+'.stderr']=b'';files[scenario+'.process.json']=E(child)
        files[scenario+'/browser-launch.json']=E({'executablePath':'/chrome','byteLength':6,'sha256':H(b'chrome'),'headless':True})
        files[scenario+'/admission.json']=files['probe-admission.json']
    image=image_();boundary={'cpuCycles':50,'machineCycles':100};paused=dict(boundary,timeNs=100,phase='paused',sameTarget=True)
    hdd='freedos-hdd-persistence/'
    files[hdd+'386-master-hdd.img']=image
    files[hdd+'386-master-hdd.json']=E({'schema':'bw.i80386-master-hdd-download.v1','snapshotSchema':'bw.i80386-master-hdd-copy.v1',
      'drive':'master','byteLength':len(image),'sha256':H(image),'geometry':{'cylinders':306,'heads':4,'sectors':17},'boundary':boundary,
      'boundaryMeaning':'settled-detached-copy','guestCompletionQualified':False,'crashDurabilityQualified':False})
    files[hdd+'proof.json']=E({'ok':True,'scenario':'freedos-hdd-persistence','downloadsSaved':2,'freshSessionReadback':True,
      'originalSessionRetained':True,'fullOsQualified':False,'crashDurabilityQualified':False,'exportSha256':H(image)})
    files[hdd+'observations.json']=E([{'page':page,'cpuCycles':30,'machineCycles':60,'timeNs':60,
      'text':'C:\\>type c:\\bwkeep.txt\nbw-hdd-persist-ok\nC:\\>'} for page in (1,2)])
    files[hdd+'session-witnesses.json']=E({'paused':paused,'downloaded':paused,'retained':paused,
      'reloaded':{'page':2,'sameAsOriginal':False},'actions':[{'action':name} for name in ('write-marker','read-original','pause','download','reload-export','read-reloaded','retain-original')]})
    files[hdd+'session-1.png']=PNG;files[hdd+'session-2.png']=PNG
    actions=['pause','align','breakpoint-add','breakpoint-hit','step-1','step-2','physical-memory','breakpoint-remove','resume','pause-after-resume','circuits','code-retained']
    trace=[]
    for i,action in enumerate(actions):
        pc=0x7c11 if i<3 else (0x7c11 if i==4 else 0x7c13)
        cycle=20 if i<3 else (30 if i==3 else (31 if i==4 else (32 if i<9 else 40)))
        eax=0x12345678+(i>=5)+(i>=9)
        trace.append({'action':action,'regs':{'eax':eax,'edi':0x89abcdef,'eip':pc,'pc':pc,'eflags':2},'cpuCycles':cycle,'machineCycles':cycle*2,
          'timeNs':cycle*2,'phase':'running' if i==8 else 'paused','sameTarget':True})
    trace[1]['stepPerformed']=False;trace[3]['breakpointAddress']=0x7c13
    trace[6].update(readOnly=True,space='mem',address=0x7c00,bytes=list(bytes.fromhex('fa31c08ed866b87856341266bfefcdab896640ebfc')),
      cells=[{'address':0x7c00+i,'text':format(byte,'02X'),'role':None} for i,byte in enumerate(bytes.fromhex('fa31c08ed866b87856341266bfefcdab896640ebfc'))],
      renderedRegisters='EAX '+format(trace[5]['regs']['eax'],'08X')+' EDI 89ABCDEF',unsupported={'stepOver':True,'stepOut':True,'reverseStep':True,'reverseCycle':True,'reverseContinue':True})
    files['forward-debug/forward-trace.json']=E(trace);files['forward-debug/forward-debug.png']=PNG
    files['forward-debug/proof.json']=E({'ok':True,'scenario':'forward-debug','reverseExecutionQualified':False,'modeAwareDisassemblyQualified':False})
    for scenario in r.SCENARIOS:
        proof=D(files[scenario+'/proof.json']);proof.update(sourceHead=source['head'],boardPin=r.BOARD,admissionSha256=H(files['probe-admission.json']));files[scenario+'/proof.json']=E(proof)
    expected={'requestSha256':pin,'buildSourceAdmissionSha256':H(E(admission)),
      'inventoryOriginal':dict(ROW(prior_raw),base64=base64.b64encode(prior_raw).decode()),'sourceHead':'a'*40,'runId':200,'jobId':201,'artifactId':202,
      'artifactName':'i80386-hdd-gui-200-1','artifactBytes':1,'artifactSha256':'0'*64,
      'run':{'id':200,'run_attempt':1,'status':'completed','conclusion':'success','event':'pull_request','head_sha':'a'*40,
       'repository':repo,'path':'.github/workflows/i80386-hdd-gui-actual.yml','actor':{'login':'CrispStrobe'}},
      'job':{'id':201,'run_id':200,'name':'actual','status':'completed','conclusion':'success'},
      'artifact':{'id':202,'name':'i80386-hdd-gui-200-1','expired':False,'size_in_bytes':1,
       'workflow_run':{'id':200,'head_sha':'a'*40},'digest':'sha256:'+'0'*64}}
    return files,expected

def sealed(files,expected):
    raw=packet(files);expected=copy.deepcopy(expected);expected['artifactBytes']=len(raw);expected['artifactSha256']=H(raw)
    expected['artifact']['size_in_bytes']=len(raw);expected['artifact']['digest']='sha256:'+H(raw)
    return r.archive_originals(raw),expected

class Originals(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.files,cls.expected=fixture()
    def fresh(self):return copy.deepcopy(self.files),copy.deepcopy(self.expected)
    def rejects(self,mutate):
        files,expected=self.fresh();mutate(files,expected)
        with self.assertRaises((ValueError,KeyError,TypeError)):r.audit(*sealed(files,expected))
    def test_complete_manufactured_positive(self):
        files,expected=sealed(*self.fresh());result=r.audit(files,expected);self.assertTrue(result['pass']);self.assertEqual(result['forwardDebug']['instructions'],2)
        self.assertEqual(c.parse_request(files['request.original.json'],expected['requestSha256']),r.parse_request(files['request.original.json'],expected['requestSha256']))
    def test_external_request_pin_survives_rehash(self):
        def cut(f,e):
            request=D(f['request.original.json']);request['pullRequest']=124;f['request.original.json']=E(request)
            event=D(f['event.original.json']);event['number']=124;event['pull_request']['number']=124;f['event.original.json']=E(event)
        self.rejects(cut)
    def test_build_admission_external_pin(self):self.rejects(lambda f,e:e.__setitem__('buildSourceAdmissionSha256','0'*64))
    def test_prior_inventory_external_original(self):self.rejects(lambda f,e:e['inventoryOriginal'].__setitem__('sha256','0'*64))
    def test_source_original_rehashed(self):self.rejects(lambda f,e:f.__setitem__('source.after.json',E(dict(D(f['source.after.json']),head='f'*40))))
    def test_full_width_register_mutation(self):
        def cut(f,e):
            trace=D(f['forward-debug/forward-trace.json']);trace[4]['regs']['edi']=0xcdef;f['forward-debug/forward-trace.json']=E(trace)
        self.rejects(cut)
    def test_step_mutation(self):
        def cut(f,e):
            trace=D(f['forward-debug/forward-trace.json']);trace[5]['regs']['eax']-=1;f['forward-debug/forward-trace.json']=E(trace)
        self.rejects(cut)
    def test_resumed_original_not_retained(self):
        def cut(f,e):
            witness=D(f['freedos-hdd-persistence/session-witnesses.json']);witness['retained']['cpuCycles']+=1;f['freedos-hdd-persistence/session-witnesses.json']=E(witness)
        self.rejects(cut)
    def test_fresh_chooser_missing_marker(self):
        def cut(f,e):
            observations=D(f['freedos-hdd-persistence/observations.json']);observations[1]['text']='C:\\>';f['freedos-hdd-persistence/observations.json']=E(observations)
        self.rejects(cut)
    def test_browser_actual_process_wrong_inode(self):
        def cut(f,e):
            process=D(f['forward-debug.process.json']);process['descendantSamples'][0]['descendants'][0]['executableIdentity']['ino']+=1;f['forward-debug.process.json']=E(process)
        self.rejects(cut)
    def test_rendered_memory_text_fully_rehashed(self):
        def cut(f,e):
            trace=D(f['forward-debug/forward-trace.json']);trace[6]['cells'][0]['text']='00';f['forward-debug/forward-trace.json']=E(trace)
        self.rejects(cut)
    def test_rendered_memory_address_and_interaction(self):
        for key,value in (('address',0x7c01),('role','button'),('text','fa'),('text','FAextra')):
            def cut(f,e):
                trace=D(f['forward-debug/forward-trace.json']);trace[6]['cells'][0][key]=value;f['forward-debug/forward-trace.json']=E(trace)
            self.rejects(cut)
    def test_rendered_full_width_registers_fully_rehashed(self):
        for rendered in ('EAX 5678 EDI CDEF','EAX 12345678 EDI 89ABCDEF','EAX 12345679 EDI 89ABCDEF0'):
            def cut(f,e):
                trace=D(f['forward-debug/forward-trace.json']);trace[6]['renderedRegisters']=rendered;f['forward-debug/forward-trace.json']=E(trace)
            self.rejects(cut)
    def test_remaining_escaped_descendant(self):
        def cut(f,e):
            process=D(f['forward-debug.process.json']);process['remainingDescendants']=[{'pid':900}];f['forward-debug.process.json']=E(process)
        self.rejects(cut)
    def test_boolean_job_identity(self):self.rejects(lambda f,e:e['job'].__setitem__('id',True))
    def test_official_artifact_size(self):
        files,expected=sealed(*self.fresh());expected['artifact']['size_in_bytes']+=1
        with self.assertRaises(ValueError):r.audit(files,expected)
    def test_unknown_original_role(self):
        with self.assertRaises(ValueError):r.archive_originals(packet(dict(self.files,unexpected=b'not admitted')))
    def test_tracked_git_stdout_rehashed(self):
        def cut(f,e):
            raw=b'f'*40+b'\n';f['git-0.stdout']=raw;process=D(f['git-0.process.json']);process['streams']['stdout']=ROW(raw);f['git-0.process.json']=E(process)
        self.rejects(cut)
    def test_duplicate_json_and_nonfinite(self):
        for raw in (b'{"x":1,"x":2}',b'{"x":NaN}',b'{"x":1e999}'):
            for module in (r,c):
                with self.assertRaises(ValueError):module.decode(raw)
    def test_fat_exact_extent_and_chain(self):
        original=image_();self.assertEqual(r.fat_marker(original)['clusters'],1)
        p=17*512;fat=p+512;directory=fat+82*512
        cuts=[]
        value=bytearray(original);value[directory+28:directory+32]=(20).to_bytes(4,'little');cuts.append(value)
        value=bytearray(original);value[directory+32:directory+64]=value[directory:directory+32];cuts.append(value)
        value=bytearray(original);value[directory+11]=0xf;cuts.append(value)
        value=bytearray(original)
        for at in (fat,fat+41*512):value[at+4:at+6]=(3).to_bytes(2,'little');value[at+6:at+8]=b'\xff\xff'
        cuts.append(value)
        for value in cuts:
            with self.assertRaises(ValueError):r.fat_marker(bytes(value))
    def test_traversal_and_symlink_archive(self):
        for name in ('../bad','/bad','originals/../bad'):
            with self.assertRaises(ValueError):r.archive_originals(zip_({name:b'bad'}))
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as archive:
            info=zipfile.ZipInfo('result.json');info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16;archive.writestr(info,b'target')
        with self.assertRaises(ValueError):r.archive_originals(out.getvalue())
    def test_frontend_nested_tar_safe(self):
        out=io.BytesIO()
        with tarfile.open(fileobj=out,mode='w') as archive:
            for name,raw in {'index.html':b'index','brickwright-build.json':b'{}'}.items():
                info=tarfile.TarInfo(name);info.size=len(raw);archive.addfile(info,io.BytesIO(raw))
        raw=zip_({'artifact.tar':out.getvalue()});self.assertEqual(c.frontend_files(raw)[:2],r.read_frontend(raw))
        with self.assertRaises(ValueError):r.read_frontend(zip_({'../index.html':b'escape'}))
    def test_closed_request_schemas_numeric_alias(self):
        request=D(self.files['request.original.json'])
        for field,value in (('attempt',True),('attempt',1.0),('runId',True)):
            changed=copy.deepcopy(request);changed['build'][field]=value;raw=E(changed)
            for module in (r,c):
                with self.assertRaises(ValueError):module.parse_request(raw,H(raw))
    def test_actual_guard_before_any_edge(self):
        for args in (['guard'],['actual','--request','missing','--expected-sha256','0'*64,'--output','missing'],['preflight'],['inventory-guard'],['inventory']):
            with patch.object(c,'regular',side_effect=AssertionError('read edge')),patch.object(c,'Hosted',side_effect=AssertionError('child edge')):
                with self.assertRaisesRegex(ValueError,'disabled'):c.main(args)
    def test_held_nofollow_bounded_read(self):
        with tempfile.TemporaryDirectory(dir=root.parent) as temporary:
            path=pathlib.Path(temporary)/'original';path.write_bytes(b'ok');link=path.with_name('alias');link.symlink_to(path.name)
            for module,read in ((r,r.bounded_input),(c,c.regular)):
                self.assertEqual(read(path,2),b'ok')
                with self.assertRaises(ValueError):read(path,1)
                with self.assertRaises(ValueError):read(link,2)
    def test_metadata_before_acquisition(self):
        request=D(self.files['request.original.json']);args=[D(self.files[name+'.original.json']) for name in ('build-run','build-job','build-artifact')]
        c.admit_build_metadata(request,*args)
        for index,key,value in ((0,'id',True),(1,'conclusion','failure'),(2,'digest','sha256:'+'0'*64)):
            mutated=copy.deepcopy(args);mutated[index][key]=value
            with self.assertRaises(ValueError):c.admit_build_metadata(request,*mutated)
    def test_controller_routes_complete_mocked_attempt_into_standalone_reader(self):
        files,expected=self.fresh();request=D(files['request.original.json']);order=[]
        original_regular=c.regular;original_inventory=c.inventory
        with tempfile.TemporaryDirectory(dir=root.parent) as temporary:
            checkout=pathlib.Path(temporary);(checkout/'gui-originals').mkdir()
            event=checkout/'event.json';event.write_bytes(files['event.original.json'])
            env={'GITHUB_EVENT_PATH':str(event),'GITHUB_REPOSITORY':r.REPOSITORY,'GITHUB_EVENT_NAME':'pull_request',
              'GITHUB_ACTOR':'CrispStrobe','GITHUB_RUN_ID':'200','GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'actual',
              'BW_EXPECTED_HEAD':'a'*40,'GH_TOKEN':'manufactured-not-a-credential'}
            def regular(path,cap):
                if str(path)==str(checkout/'vendor-pins.json'):return E({'bw-board':c.BOARD,'bw-circuit-ui':c.CUI,'sb3-creator':c.SB3})
                return original_regular(path,cap)
            def check_file(path,row):
                name=str(path).removeprefix(str(checkout)+'/')
                if name in request['source']['files']:return ('source:'+name).encode()
                return b'externally mocked installed/input bytes'
            def inventory(path,*args):
                name=str(path).removeprefix(str(checkout)+'/')
                if name.startswith('node_modules/'):
                    return {k.removeprefix(name+'/'):v for k,v in request['installedFiles'].items() if k.startswith(name+'/')}
                return original_inventory(path,*args)
            def runtime(request):order.append('runtime');return D(files['runtime.before.json'])
            class Fake:
                def __init__(self,where,output,environment):self.output=output;self.attempts=set()
                def git(self,args):
                    order.append('git');role='git-'+str(len(self.attempts));self.attempts.add(role)
                    if args[0]=='rev-parse':stdout=(request['source']['head' if args[1]=='HEAD' else 'tree']+'\n').encode()
                    else:stdout=('source:'+args[2].split(':',1)[1]).encode()
                    prefix=['/usr/bin/git','--no-replace-objects','-c','gc.auto=0','-c','maintenance.auto=false','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null']
                    self.output.save(role+'.stdout',stdout);self.output.save(role+'.stderr',b'');self.output.save(role+'.process.json',E(proc(prefix+args,stdout)))
                    return stdout
                def api(self,route):
                    order.append('api');role='build-run' if '/runs/' in route else ('build-job' if '/jobs/' in route else 'build-artifact')
                    return files[role+'.original.json']
                def run(self,role,argv,environment,seconds,*args):
                    order.append(role);self.attempts.add(role)
                    if role=='frontend-acquisition':
                        self.output.save(role+'.stderr',b'');self.output.save(role+'.process.json',E(proc(argv,files['frontend.original.zip'])))
                        return files['frontend.original.zip']
                    directory=pathlib.Path(environment['PROOF_OUTPUT']);directory.mkdir()
                    admission=(self.output.root/'probe-admission.json').read_bytes()
                    for name,raw in files.items():
                        if not name.startswith(role+'/'):continue
                        leaf=name.split('/',1)[1]
                        if leaf=='admission.json':raw=admission
                        if leaf=='proof.json':
                            proof=D(raw);proof['admissionSha256']=H(admission);raw=E(proof)
                        (directory/leaf).write_bytes(raw)
                    child=D(files[role+'.process.json']);child['argv']=argv;child['environment']=environment
                    for stream in ('stdout','stderr'):self.output.save(role+'.'+stream,b'')
                    self.output.save(role+'.process.json',E(child));return b''
            with patch.object(c,'regular',side_effect=regular),patch.object(c,'check_file',side_effect=check_file),patch.object(c,'inventory',side_effect=inventory),patch.object(c,'observe_runtime',side_effect=runtime):
                status=c.execute(files['request.original.json'],expected['requestSha256'],checkout,checkout/'gui-originals/originals',env,factory=Fake)
            self.assertEqual(status,0);self.assertEqual(order[0],'runtime');self.assertEqual(order.count('frontend-acquisition'),1)
            self.assertLess(order.index('api'),order.index('frontend-acquisition'));self.assertLess(order.index(r.SCENARIOS[0]),order.index(r.SCENARIOS[1]))
            observed={str(path.relative_to(checkout/'gui-originals/originals')):path.read_bytes() for path in (checkout/'gui-originals/originals').rglob('*') if path.is_file()}
            self.assertTrue(r.audit(*sealed(observed,expected))['pass'])
    def test_child_retention_preserves_primary_and_independent_secondary_closes(self):
        saved={};attempts=[];closes=[]
        class Stream:
            def close(self):closes.append(self);raise OSError('close-secondary')
        class Child:
            pid=400;returncode=1;stdout=Stream();stderr=Stream()
            def poll(self):return 1
        class Output:
            def save(self,name,raw):
                attempts.append(name)
                if name.endswith('.stdout'):raise OSError('save-secondary')
                saved[name]=raw
        edge=c.Hosted(root,Output(),{})
        with patch.object(c.subprocess,'Popen',return_value=Child()),patch.object(c.signal,'signal'),patch.object(c,'process_identity',side_effect=ValueError('identity-primary')),patch.object(c,'remaining_processes',side_effect=OSError('census-secondary')),patch.object(c.sys,'stderr',io.StringIO()):
            with self.assertRaisesRegex(ValueError,'identity-primary'):edge.run('fake',['fake'],{},1)
        self.assertEqual(len(closes),2);self.assertEqual(attempts,['fake.stdout','fake.stderr','fake.process.json'])
        process=D(saved['fake.process.json']);self.assertEqual(process['firstFailure'],'identity-primary')
        self.assertEqual([x['phase'] for x in process['secondaryFailures']],['terminal-census','stream-close','stream-close','retain-stdout'])
    def test_close_only_child_failure_cannot_pass(self):
        saved={}
        class Stream:
            def fileno(self):return 7
            def close(self):raise OSError('close-only')
        class Child:
            pid=400;returncode=0;stdout=Stream();stderr=Stream()
            def poll(self):return 0
            def wait(self,**kwargs):return 0
        class Selector:
            def register(self,*args):pass
            def get_map(self):return {}
            def close(self):pass
        class Output:
            def save(self,name,raw):saved[name]=raw
        identity={'pid':400,'pgid':400,'sessionId':400,'startTicks':8,'parentPid':os.getpid()}
        edge=c.Hosted(root,Output(),{})
        with patch.object(c.subprocess,'Popen',return_value=Child()),patch.object(c.signal,'signal'),patch.object(c,'process_identity',return_value=identity),patch.object(c,'remaining_processes',return_value=[]),patch.object(c.os,'set_blocking'),patch.object(c.selectors,'DefaultSelector',return_value=Selector()):
            with self.assertRaisesRegex(OSError,'close-only'):edge.run('fake',['fake'],{},1)
        self.assertEqual(D(saved['fake.process.json'])['firstFailure'],'close-only')
    def test_preflight_positive_seal_only_failure_and_existing_primary(self):
        files,expected=self.fresh();request=D(files['request.original.json']);original_regular=c.regular;original_seal=c.Originals.seal
        with tempfile.TemporaryDirectory(dir=root.parent) as temporary:
            checkout=pathlib.Path(temporary);event=checkout/'event.json';event.write_bytes(files['event.original.json'])
            env={'GITHUB_EVENT_PATH':str(event),'GITHUB_REPOSITORY':r.REPOSITORY,'GITHUB_EVENT_NAME':'pull_request','GITHUB_ACTOR':'CrispStrobe',
              'GITHUB_RUN_ID':'200','GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'actual','BW_EXPECTED_HEAD':'a'*40}
            class Fake:
                def __init__(self,*args):pass
                def git(self,args):
                    if args[0]=='rev-parse':return (request['source']['head' if args[1]=='HEAD' else 'tree']+'\n').encode()
                    return ('source:'+args[2].split(':',1)[1]).encode()
                def api(self,*args):raise AssertionError('preflight must not acquire metadata/frontend')
                def run(self,*args):raise AssertionError('preflight must not generate or execute a guest')
            def regular(path,cap):
                if pathlib.Path(path).name=='vendor-pins.json':return E({'bw-board':c.BOARD,'bw-circuit-ui':c.CUI,'sb3-creator':c.SB3})
                return original_regular(path,cap)
            def inventory(path):
                prefix=str(path).removeprefix(str(checkout)+'/')+'/'
                return {name.removeprefix(prefix):row for name,row in request['installedFiles'].items() if name.startswith(prefix)}
            for number,(fail_seal,fail_runtime) in enumerate(((False,False),(True,False),(True,True))):
                captured=[]
                def seal(output,result):
                    captured.append(result)
                    if fail_seal:raise OSError('seal-secondary' if fail_runtime else 'seal-only')
                    return original_seal(output,result)
                def runtime(request):
                    if fail_runtime:raise ValueError('runtime-primary')
                    return D(files['runtime.before.json'])
                with patch.object(c,'regular',side_effect=regular),patch.object(c,'check_file',side_effect=lambda path,row:('source:'+str(path).removeprefix(str(checkout)+'/')).encode()),patch.object(c,'inventory',side_effect=inventory),patch.object(c,'observe_runtime',side_effect=runtime),patch.object(c.Originals,'seal',autospec=True,side_effect=seal),patch.object(c.sys,'stderr',io.StringIO()):
                    status=c.execute(files['request.original.json'],expected['requestSha256'],checkout,checkout/('preflight-'+str(number)),env,factory=Fake,preflight=True)
                self.assertEqual(status,1 if fail_seal or fail_runtime else 0);self.assertEqual(len(captured),1)
                if fail_runtime:
                    self.assertEqual(captured[0]['firstFailure']['message'],'runtime-primary');self.assertEqual(captured[0]['secondary'][0]['message'],'seal-secondary')
                elif fail_seal:self.assertEqual(captured[0]['firstFailure']['message'],'seal-only')
                else:self.assertTrue(captured[0]['pass'])
    def test_failed_frontend_prefix_uses_archive_cap_without_duplicate_success(self):
        with tempfile.TemporaryDirectory(dir=root.parent) as temporary,patch.object(c,'FILE_CAP',2),patch.object(c,'ARCHIVE_CAP',8):
            output=c.Originals(pathlib.Path(temporary)/'originals');output.save('frontend.partial.zip',b'123')
            self.assertEqual((output.root/'frontend.partial.zip').read_bytes(),b'123')
            with self.assertRaises(ValueError):output.save('ordinary.stdout',b'123')
    def test_reader_has_no_producer_or_execution_import(self):
        tree=ast.parse((root/'scripts/read-i80386-hdd-gui-originals.py').read_text());names=[]
        for node in ast.walk(tree):
            if isinstance(node,ast.Import):names.extend(x.name for x in node.names)
            if isinstance(node,ast.ImportFrom):names.append(node.module)
        self.assertFalse(any(name and any(x in name for x in ('subprocess','playwright','run_i80386','actual_controller')) for name in names))
    def test_capped_failed_frontend_prefix_policy(self):
        self.assertIn("frontend.partial.zip",(root/'scripts/run-i80386-hdd-gui-actual.py').read_text())
        with tempfile.TemporaryDirectory(dir=root.parent) as temporary:
            output=c.Originals(pathlib.Path(temporary)/'originals');output.save('frontend.partial.zip',b'prefix')
            with self.assertRaises(ValueError):output.save('frontend.partial.zip',b'retry')
            self.assertEqual((output.root/'frontend.partial.zip').read_bytes(),b'prefix')

suite=unittest.defaultTestLoader.loadTestsFromTestCase(Originals)
result=unittest.TextTestRunner(verbosity=2).run(suite)
print(json.dumps({'controls':result.testsRun,'failures':len(result.failures),'errors':len(result.errors)}))
sys.exit(not result.wasSuccessful())
`;

test('standalone original reader: complete manufactured packet and coherent negative controls', () => {
    const result = spawnSync('/usr/bin/python3',['-B','-c',controls,root],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
    assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
    const summary=JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.ok(summary.controls>=25); assert.equal(summary.failures,0); assert.equal(summary.errors,0);
});

const probe=fs.readFileSync(new URL('../scripts/verify-i80386-local-hdd-gui.mjs',import.meta.url),'utf8');
const extract=name=>probe.slice(probe.indexOf(`function ${name} (`),probe.indexOf('\n}',probe.indexOf(`function ${name} (`))+2);
const context=vm.createContext({assert,Buffer});
vm.runInContext(`${extract('forwardBootDisk')}\n${extract('forwardStepTransition')}`,context);
test('authored forward boot is finite and preserves full-width register setup',()=>{
    const disk=vm.runInContext('forwardBootDisk()',context);
    assert.equal(disk.length,34816);assert.equal(disk.subarray(0,21).toString('hex'),'fa31c08ed866b87856341266bfefcdab896640ebfc');
    assert.equal(disk.subarray(510,512).toString('hex'),'55aa');
});
test('actual probe step assertions reject truncated EDI, multi-step and no progress',()=>{
    const before={regs:{pc:0x7c11,eax:0xffffffff},cpuCycles:3};
    const after={regs:{pc:0x7c13,eax:0,edi:0x89abcdef},cpuCycles:4,phase:'paused'};
    context.before=before;context.after=after;vm.runInContext('forwardStepTransition(before,after)',context);
    for(const change of [{regs:{...after.regs,edi:0xcdef}},{cpuCycles:3},{regs:{...after.regs,pc:0x7c11}},{regs:{...after.regs,eax:1}}]){
        context.after={...after,...change};assert.throws(()=>vm.runInContext('forwardStepTransition(before,after)',context));
    }
});
test('selected browser path reaches both new Chromium launch descriptors',()=>{
    assert.equal((probe.match(/chromium\.launch\(\{headless:true,executablePath\}\)/g)||[]).length,1);
    assert.equal((probe.match(/await admittedBrowser\(/g)||[]).length,2);
    assert.match(probe,/PROOF_BROWSER_SHA256/);assert.match(probe,/sameAsOriginal:await second.evaluate/);
});
