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
import contextlib
from types import SimpleNamespace
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
      '/usr/bin/python3.12':ROW(b'python'),'/usr/lib/libselected.so':ROW(b'selected-library'),'/chrome':ROW(b'chrome'),'/usr/bin/git':ROW(b'git'),'/usr/bin/gh':ROW(b'gh')},
      'aliases':{'/python-link':{'linkText':'/usr/bin/python3.12','target':'/usr/bin/python3.12'}},'directoryAliases':{'/runtime-lib':{'linkText':'usr/lib','target':'/usr/lib'}},'node':'/node','python':'/usr/bin/python3.12','chromium':'/chrome',
      'tools':{'git':'/usr/bin/git','gh':'/usr/bin/gh'},'resources':{'jobMinutes':35,'controllerSeconds':1800,
       'scenarioSeconds':{'freedos-hdd-persistence':1250,'forward-debug':180},'perProcessCoreBytes':0,
       'perProcessFileBytes':r.FILE_CAP,'perProcessOpenFiles':256,'aggregateContainmentQualified':False}}
    prior={'schema':'bw.gui-hdd.inventory-original.v2','observationOnly':True,'templateSha256':'9'*64,'source':source,
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
    request={'schema':'bw.gui-hdd.actual-request.v3','repository':r.REPOSITORY,'pullRequest':123,'source':source,'build':build,
      'pythonStartup':r.startup_policy(),'criticalFiles':critical,'installedFiles':installed,'runtime':runtime,'inventoryAdmission':{
       'schema':'bw.gui-hdd.inventory-admission.v2','sourceHead':'a'*40,'runId':90,'jobId':91,'artifactId':92,'artifactSha256':'7'*64,
       'original':ROW(prior_raw),'templateSha256':'9'*64,'workflow':{'commit':'d'*40,'path':'.github/workflows/i80386-hdd-gui-actual.yml','sha256':'6'*64}},
      'inputs':{name:dict(ROW(b'ignored'),path='gui-inputs/'+name) for name in r.INPUTS}}
    for name,(size,digest) in r.INPUTS.items():request['inputs'][name]={'path':{'floppy':'gui-inputs/floppy.img','hdd':'gui-inputs/hdd.img','bios':'gui-inputs/bios.bin','vgaRom':'gui-inputs/vga.bin'}[name],'byteLength':size,'sha256':digest}
    raw=E(request);pin=H(raw);repo={'full_name':r.REPOSITORY,'fork':False}
    event={'action':'labeled','label':{'name':r.LABEL},'sender':{'login':'CrispStrobe'},'repository':repo,'number':123,
      'pull_request':{'number':123,'state':'open','head':{'sha':'a'*40,'repo':repo},'base':{'ref':'main','repo':repo},
       'body':'<!-- BW_GUI_HDD_REQUEST_SHA256='+pin+' -->'}}
    observed=dict(runtime,identities={'/chrome':{'dev':4,'ino':5}},directoryIdentities={'/usr/lib':{'dev':4,'ino':6,'mode':stat.S_IFDIR|0o755}},aggregateContainmentQualified=False)
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
    installed_stat={'dev':4,'ino':123,'mode':stat.S_IFDIR|0o555,'uid':1001,'gid':1001,'nlink':2,'size':4096,'mtimeNs':1700000000000000000,'empty':True}
    install=('bw.gui-hdd.python-startup-install.v1\n'+r.PYTHON_CACHE+'\ncreated-exclusive\nempty-before-entry\n4 123 416d 1001 1001 2 4096 1700000000\n').encode()
    startup={'schema':'bw.gui-hdd.python-startup-observation.v1','options':r.PYTHON_OPTIONS,
      'arguments':['scripts/run-i80386-hdd-gui-actual.py','actual','--request','/checkout/gui-inputs/request.json','--expected-sha256',pin,'--output','/checkout/gui-originals/originals'],
      'flags':{'isolated':1,'no_site':1,'no_user_site':1,'dont_write_bytecode':1,'ignore_environment':1,'safe_path':True,'optimize':0},
      'dontWriteBytecode':True,'path':r.PYTHON_PATH,'cachePrefix':r.PYTHON_CACHE,'xoptions':{'pycache_prefix':r.PYTHON_CACHE},'prefix':installed_stat,'zipAbsent':True}
    files['python-startup.original.txt']=install
    for stage in ('before','after'):files['python-startup.'+stage+'.json']=E(startup)
    expected={'requestSha256':pin,'buildSourceAdmissionSha256':H(E(admission)),
      'inventoryOriginal':dict(ROW(prior_raw),base64=base64.b64encode(prior_raw).decode()),'sourceHead':'a'*40,'runId':200,'jobId':201,'artifactId':202,
      'artifactName':'i80386-hdd-gui-200-1','artifactBytes':1,'artifactSha256':'0'*64,
      'run':{'id':200,'run_attempt':1,'status':'completed','conclusion':'success','event':'pull_request','head_sha':'a'*40,
       'repository':repo,'path':'.github/workflows/i80386-hdd-gui-actual.yml','actor':{'login':'CrispStrobe'}},
      'job':{'id':201,'run_id':200,'name':'actual','status':'completed','conclusion':'success','steps':[{'name':name,'status':'completed','conclusion':'success'} for name in r.STARTUP_STEPS]},
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
            trace=D(f['forward-debug/forward-trace.json'])
            for item in trace[5:]:item['regs']['eax']-=1
            trace[6]['renderedRegisters']='EAX '+format(trace[5]['regs']['eax'],'08X')+' EDI 89ABCDEF'
            f['forward-debug/forward-trace.json']=E(trace)
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
        for args in (['guard'],['actual','--request','missing','--expected-sha256','0'*64,'--output','missing'],['preflight']):
            with patch.object(c,'regular',side_effect=AssertionError('read edge')),patch.object(c,'Hosted',side_effect=AssertionError('child edge')):
                with self.assertRaisesRegex(ValueError,'disabled'):c.main(args)
        with patch.object(c,'INVENTORY_ENABLED',False):
            for args in (['inventory-guard'],['inventory']):
                with patch.object(c,'regular',side_effect=AssertionError('read edge')),patch.object(c,'Hosted',side_effect=AssertionError('child edge')):
                    with self.assertRaisesRegex(ValueError,'disabled'):c.main(args)
    def test_enabled_inventory_guard_has_no_edges_or_actual_authority(self):
        self.assertIs(c.INVENTORY_ENABLED,True);self.assertIs(c.ACTUAL_ENABLED,False)
        with patch.object(c,'regular',side_effect=AssertionError('read edge')),patch.object(c,'Hosted',side_effect=AssertionError('child edge')),patch.object(c,'inventory_observation',side_effect=AssertionError('inventory edge')):
            self.assertEqual(c.main(['inventory-guard']),0)
            with self.assertRaisesRegex(ValueError,'fixed independent digest'):c.main(['inventory'])
            for mode in ('guard','preflight','actual'):
                with self.assertRaisesRegex(ValueError,'disabled'):c.main([mode])
    def test_held_nofollow_bounded_read(self):
        with tempfile.TemporaryDirectory(dir=root.parent) as temporary:
            path=pathlib.Path(temporary)/'original';path.write_bytes(b'ok');link=path.with_name('alias');link.symlink_to(path.name)
            for module,read in ((r,r.bounded_input),(c,c.regular)):
                self.assertEqual(read(path,2),b'ok')
                with self.assertRaises(ValueError):read(path,1)
                with self.assertRaises(ValueError):read(link,2)
    def test_startup_v3_explicit_policy_and_old_actual_schema_refusal(self):
        request=D(self.files['request.original.json'])
        for module in (c,r):
            self.assertEqual(module.startup_policy(),request['pythonStartup'])
            for version in ('v1','v2'):
                changed=copy.deepcopy(request);changed['schema']='bw.gui-hdd.actual-request.'+version;raw=E(changed)
                with self.assertRaises(ValueError):module.parse_request(raw,H(raw))
            changed=copy.deepcopy(request);changed['pythonStartup']['sourceImportClosureQualified']=True;raw=E(changed)
            with self.assertRaises(ValueError):module.parse_request(raw,H(raw))
    def test_rehashed_startup_observations_do_not_replace_fixed_expectation(self):
        mutations=(('options',r.PYTHON_OPTIONS[:2]+['-B']),('cachePrefix','/different'),('path',r.PYTHON_PATH+['/checkout']),
          ('flags',dict(D(self.files['python-startup.before.json'])['flags'],no_site=0)),('dontWriteBytecode',False),
          ('zipAbsent',False),('xoptions',{'pycache_prefix':'/different'}),('arguments',['invented','actual']))
        self.assertTrue(r.audit(*sealed(*self.fresh()))['pass'])
        for key,value in mutations:
            files,expected=self.fresh()
            for stage in ('before','after'):
                row=D(files['python-startup.'+stage+'.json']);row[key]=value;files['python-startup.'+stage+'.json']=E(row)
            with self.assertRaisesRegex(ValueError,'startup'):r.audit(*sealed(files,expected))
    def test_rehashed_nonempty_replaced_prefix_and_original_stat_refuse(self):
        for key,value in (('empty',False),('ino',999),('mode',stat.S_IFDIR|0o755),('mtimeNs',1800000000000000000)):
            files,expected=self.fresh()
            for stage in ('before','after'):
                row=D(files['python-startup.'+stage+'.json']);row['prefix'][key]=value;files['python-startup.'+stage+'.json']=E(row)
            with self.assertRaises(ValueError):r.audit(*sealed(files,expected))
        for raw in (self.files['python-startup.original.txt'].replace(b'created-exclusive',b'adopted-existing'),
          self.files['python-startup.original.txt'].replace(b'4 123',b'04 123'),b'x'*4097):
            for module in (c,r):
                with self.assertRaises(ValueError):module.startup_installation(raw)
    def test_official_startup_steps_are_external_ordered_successful_joins(self):
        for action in ('missing','order','failed','duplicate'):
            files,expected=self.fresh();steps=expected['job']['steps']
            if action=='missing':steps.pop(0)
            elif action=='order':steps.reverse()
            elif action=='failed':steps[0]['conclusion']='failure'
            else:steps.append(copy.deepcopy(steps[0]))
            with self.assertRaisesRegex(ValueError,'startup'):r.audit(*sealed(files,expected))
    def test_startup_capture_executes_real_validator_with_mocked_host_edges(self):
        row=D(self.files['python-startup.before.json']);arguments=row['arguments'][2:]
        class Flags:
            isolated=1;no_site=1;no_user_site=1;dont_write_bytecode=1;ignore_environment=1;safe_path=True;optimize=0
        with patch.object(c,'regular',return_value=self.files['python-startup.original.txt']),patch.object(c,'empty_python_prefix',return_value=row['prefix']),patch.object(c.sys,'orig_argv',row['options']+row['arguments']),patch.object(c.sys,'executable',c.PYTHON_EXECUTABLE),patch.object(c.sys,'flags',Flags()),patch.object(c.sys,'dont_write_bytecode',True),patch.object(c.sys,'path',c.PYTHON_PATH),patch.object(c.sys,'pycache_prefix',c.PYTHON_CACHE),patch.object(c.sys,'_xoptions',{'pycache_prefix':c.PYTHON_CACHE}),patch.object(c.Path,'resolve',return_value=pathlib.Path(c.PYTHON_EXECUTABLE)),patch.object(c.os.path,'lexists',return_value=False):
            self.assertEqual(c.observe_python_startup('/checkout','actual',arguments)[1],row)
            with patch.object(c.sys,'dont_write_bytecode',False):
                with self.assertRaises(ValueError):c.observe_python_startup('/checkout','actual',arguments)
    def test_empty_prefix_real_helper_held_checks_and_close_first_failure(self):
        class Info:
            st_dev=4;st_ino=123;st_mode=stat.S_IFDIR|0o555;st_uid=1001;st_gid=1001;st_nlink=2;st_size=4096;st_mtime_ns=1700000000000000000
            st_ctime_ns=1700000000000000000
        class Entries:
            def __init__(self,items):self.items=iter(items)
            def __enter__(self):return self.items
            def __exit__(self,*args):pass
        with patch.object(c.Path,'resolve',return_value=pathlib.Path(c.PYTHON_CACHE)),patch.object(c.os,'lstat',return_value=Info()),patch.object(c.os,'open',return_value=77) as opened,patch.object(c.os,'fstat',return_value=Info()),patch.object(c.os,'scandir',return_value=Entries([])),patch.object(c.os,'close') as closed:
            self.assertTrue(c.empty_python_prefix()['empty']);self.assertEqual(opened.call_args.args[1],c.os.O_RDONLY|c.os.O_NOFOLLOW|c.os.O_NONBLOCK|c.os.O_DIRECTORY);closed.assert_called_once_with(77)
            with patch.object(c.Path,'resolve',return_value=pathlib.Path('/different')):
                with self.assertRaisesRegex(ValueError,'canonical'):c.empty_python_prefix()
            changed=Info();changed.st_ino=999
            with patch.object(c.os,'lstat',side_effect=[Info(),changed]),patch.object(c.os,'scandir',return_value=Entries([])):
                with self.assertRaisesRegex(ValueError,'readback'):c.empty_python_prefix()
            with patch.object(c.os,'scandir',return_value=Entries(['unexpected'])),patch.object(c.os,'close',side_effect=OSError('close-secondary')):
                with self.assertRaisesRegex(ValueError,'remain empty'):c.empty_python_prefix()
            with patch.object(c.os,'scandir',return_value=Entries([])),patch.object(c.os,'close',side_effect=OSError('close-only')):
                with self.assertRaisesRegex(OSError,'close-only'):c.empty_python_prefix()
    def test_actual_shell_startup_is_before_first_python_and_inventory_is_held(self):
        workflow=(root/'.github/workflows/i80386-hdd-gui-actual.yml').read_text();actual=workflow.split('  actual:',1)[1]
        self.assertIn('if: >-\n      '+chr(36)+'{{ false &&',actual)
        self.assertLess(actual.index('mkdir -m 0555 "$prefix"'),actual.index('/usr/bin/python3.12 -I -S -B -X'))
        self.assertNotIn('/usr/bin/python3 -B',actual)
        self.assertEqual(actual.count('/usr/bin/python3.12 -I -S -B -X pycache_prefix='+r.PYTHON_CACHE),3)
        self.assertIn('test "$(realpath -e "$parent")" = "$parent"',actual)
        self.assertNotIn('rm ',actual)
    @contextlib.contextmanager
    def inventory_edges(self,files=None,aliases=None,directories=None,faults=None,clock=None):
        faults=faults or {};events=[];request=D(self.files['request.original.json']);original_sha=c.sha
        class NodeBytes(bytes):
            def __len__(self):return 124827920
        node=NodeBytes(b'node');default=['/node','/usr/bin/python3.12','/chrome','/usr/bin/git','/usr/bin/gh']
        template={'schema':'bw.gui-hdd.inventory-template.v2','sourceHead':'a'*40,'files':default if files is None else files,
          'aliases':aliases or [],'directoryAliases':directories or [],'node':'/node','python':'/usr/bin/python3.12','chromium':'/chrome',
          'tools':{'git':'/usr/bin/git','gh':'/usr/bin/gh'}}
        raw=E(template);pin=H(raw);event=D(base64.b64decode(self.expected['inventoryOriginal']['base64']))['event']
        event=D(base64.b64decode(event['base64']));event['pull_request']['body']='<!-- BW_GUI_HDD_INVENTORY_SHA256='+pin+' -->';event_raw=E(event)
        env={'GITHUB_EVENT_PATH':'/event','GITHUB_RUN_ID':'90','GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'inventory','GITHUB_REPOSITORY':c.REPOSITORY,
          'GITHUB_WORKFLOW_SHA':'d'*40,'GITHUB_WORKFLOW_REF':'workflow-ref','GITHUB_EVENT_NAME':'pull_request','GITHUB_ACTOR':'CrispStrobe','BW_EXPECTED_HEAD':'a'*40}
        saved={}
        def regular(path,cap):
            path=str(path);events.append(('read',path))
            if ('read',path) in faults:raise faults['read',path]
            if path=='/event':return event_raw
            if path in saved:return saved[path]
            if path=='/node':return node
            if path.startswith('/checkout/'):return ('source:'+path.removeprefix('/checkout/')).encode()
            return path.encode()
        def lstat(path):
            path=str(path);events.append(('lstat',path))
            if ('lstat',path) in faults:raise faults['lstat',path]
            mode=stat.S_IFLNK|0o777 if path in template['aliases']+template['directoryAliases'] else stat.S_IFREG|0o444
            return SimpleNamespace(st_dev=1,st_ino=2,st_mode=mode,st_uid=0,st_gid=0,st_nlink=1,st_size=10,st_mtime_ns=1)
        def readlink(path):
            events.append(('readlink',path))
            if ('readlink',path) in faults:raise faults['readlink',path]
            return '/node'
        class Capture:
            def __init__(self,path):events.append(('capture',str(path)));self.root=path;self.files={}
        class Hosted:
            def __init__(self,where,capture,environment):events.append(('Hosted',None));self.capture=capture;self.attempts=set();self.deadline=1800
            def git(self,args):
                events.append(('git',args));role='git-'+str(len(self.attempts));self.attempts.add(role)
                if args[0]=='rev-parse':body=(request['source']['head' if args[1]=='HEAD' else 'tree']+'\n').encode()
                else:body=('source:'+args[2].split(':',1)[1]).encode()
                process={'argv':['/usr/bin/git']+args,'exitCode':0};saved[str(self.capture.root/(role+'.process.json'))]=E(process)
                self.capture.files[role+'.stdout']=ROW(body);self.capture.files[role+'.stderr']=ROW(b'');return body
        def inventory(path):
            events.append(('installed',str(path)));prefix=str(path).removeprefix('/checkout/')+'/'
            return {name.removeprefix(prefix):row for name,row in request['installedFiles'].items() if name.startswith(prefix)}
        def runtime(value):events.append(('runtime',None));return {}
        with patch.object(c,'regular',side_effect=regular),patch.object(c.os,'lstat',side_effect=lstat),patch.object(c.os,'readlink',side_effect=readlink),patch.object(c,'sha',side_effect=lambda raw:'fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48' if raw is node else original_sha(raw)),patch.object(c,'observe_runtime',side_effect=runtime),patch.object(c,'Originals',Capture),patch.object(c,'Hosted',Hosted),patch.object(c,'inventory',side_effect=inventory),patch.object(c.time,'monotonic',side_effect=clock or (lambda:10)):
            yield raw,pin,env,events
    def test_failed_inventory_collects_all_required_files_and_aliases_without_tools(self):
        selected=['/missing-font','/denied-font','/good-font','/node','/usr/bin/python3.12','/chrome','/usr/bin/git','/usr/bin/gh']
        faults={('lstat','/missing-font'):FileNotFoundError('FIRST_FONT'),('read','/denied-font'):PermissionError('SECOND_FONT'),('readlink','/bad-link'):OSError('THIRD_LINK')}
        with self.inventory_edges(selected,['/bad-link','/good-link'],faults=faults) as (raw,pin,env,events):
            value=c.inventory_observation(raw,pin,pathlib.Path('/checkout'),env,'/out/inventory.original.json')
        self.assertEqual(value['schema'],'bw.gui-hdd.inventory-failure.v1');self.assertFalse(value['candidate']);self.assertFalse(value['qualified'])
        self.assertEqual(value['firstFailure']['message'],'FIRST_FONT');self.assertEqual([x['message'] for x in value['secondary']],['SECOND_FONT','THIRD_LINK'])
        self.assertEqual(set(value['files']),set(selected));self.assertEqual(value['files']['/good-font']['status'],'observed');self.assertIn('file',value['files']['/node'])
        self.assertEqual(value['aliases']['/good-link']['status'],'observed');self.assertFalse(value['gitSource']['reached']);self.assertIsNone(value['gitSource']['head'])
        self.assertTrue(value['template']['bindingVerified']);self.assertEqual(value['template']['sha256'],pin);self.assertTrue(value['event']['bindingVerified'])
        self.assertFalse(any(row[0] in ('runtime','Hosted','git','installed','capture') for row in events));self.assertLess(len(E(value)),c.JSON_CAP)
    def test_successful_inventory_keeps_exact_v2_shape_and_existing_source_gate(self):
        with self.inventory_edges() as (raw,pin,env,events):value=c.inventory_observation(raw,pin,pathlib.Path('/checkout'),env,'/out/inventory.original.json')
        self.assertEqual(set(value),set('schema observationOnly templateSha256 source installedFiles runtime event commands platform'.split()))
        self.assertEqual(value['schema'],'bw.gui-hdd.inventory-original.v2');self.assertEqual(value['source'],D(self.files['source.before.json']))
        self.assertTrue(value['observationOnly']);self.assertEqual(value['templateSha256'],pin)
        self.assertLess(next(i for i,x in enumerate(events) if x[0]=='runtime'),next(i for i,x in enumerate(events) if x[0]=='Hosted'))
        self.assertEqual(len([x for x in events if x[0]=='git']),len(c.SOURCE)+2)
    def test_inventory_deadline_stops_later_reads_but_reports_entire_roster(self):
        ticks=iter([0,1,181,182,183,184])
        with self.inventory_edges(['/first','/second','/third'],['/late-link'],clock=lambda:next(ticks)) as (raw,pin,env,events):
            value=c.inventory_observation(raw,pin,pathlib.Path('/checkout'),env,'/out/inventory.original.json')
        self.assertIn('deadline',value['firstFailure']['message']);self.assertEqual(set(value['files']),{'/first','/second','/third'})
        self.assertEqual([path for operation,path in events if operation=='read' and path!='/event'],['/first'])
        self.assertFalse(value['files']['/second']['attempted']);self.assertEqual(value['files']['/second']['status'],'unvisited-deadline')
        self.assertFalse(value['files']['/third']['attempted']);self.assertEqual(value['files']['/third']['status'],'unvisited-deadline')
        self.assertTrue(value['files']['/first']['attempted']);self.assertEqual(value['files']['/first']['status'],'failed')
        self.assertFalse(value['aliases']['/late-link']['attempted']);self.assertEqual(value['aliases']['/late-link']['status'],'unvisited-deadline')
        self.assertFalse(any(operation=='runtime' for operation,path in events))
    def test_inventory_roster_caps_and_mismatched_template_stop_before_selected_reads(self):
        for files in (['/x']*2,['/x'+str(i) for i in range(513)]):
            with self.inventory_edges(files) as (raw,pin,env,events):value=c.inventory_observation(raw,pin,pathlib.Path('/checkout'),env,'/out/a.json')
            self.assertIsNotNone(value['firstFailure']);self.assertFalse(value['files']);self.assertFalse(any(x[0]=='lstat' for x in events))
        with self.inventory_edges() as (raw,pin,env,events):value=c.inventory_observation(raw,'0'*64,pathlib.Path('/checkout'),env,'/out/a.json')
        self.assertFalse(value['template']['bindingVerified']);self.assertIsNone(value['event']);self.assertEqual(events,[])
    def test_maximal_failed_inventory_unicode_errors_remain_capped_and_canonical(self):
        files=['/selected/file-'+str(i) for i in range(512)];aliases=['/selected/alias-'+str(i) for i in range(256)]
        faults={('lstat',name):OSError('\U00010348'*5000) for name in files+aliases}
        with self.inventory_edges(files,aliases,faults=faults) as (raw,pin,env,events):value=c.inventory_observation(raw,pin,pathlib.Path('/checkout'),env,'/out/a.json')
        self.assertEqual(len(value['files']),512);self.assertEqual(len(value['aliases']),256);self.assertEqual(len(value['secondary']),767)
        self.assertLess(len(E(value)),c.JSON_CAP);self.assertEqual(E(D(E(value))),E(value));self.assertLessEqual(len(value['firstFailure']['message'].encode()),1024)
        self.assertFalse(any(row[0] in ('runtime','Hosted','git') for row in events))
    def test_failed_inventory_cli_saves_only_failure_original_and_returns_nonzero(self):
        with self.inventory_edges(['/missing'],faults={('lstat','/missing'):FileNotFoundError('FIRST')}) as (raw,pin,env,events):value=c.inventory_observation(raw,pin,pathlib.Path('/checkout'),env,'/out/a.json')
        with tempfile.TemporaryDirectory(dir=root.parent) as temporary:
            output=pathlib.Path(temporary)/'inventory.original.json'
            with patch.object(c,'regular',return_value=raw),patch.object(c,'inventory_observation',return_value=value),patch.dict(c.os.environ,env,clear=True):
                self.assertEqual(c.main(['inventory','--request','/request','--expected-sha256',pin,'--output',str(output)]),1)
            self.assertFalse(output.exists());saved=output.with_name('inventory-failure.json');self.assertEqual(saved.read_bytes(),E(value))
            with patch.object(c.sys,'stderr',io.StringIO()) as stderr:self.assertEqual(c.retain_inventory_observation(value,output),1)
            self.assertEqual(value['firstFailure']['message'],'FIRST');self.assertEqual(D(stderr.getvalue().encode())['secondary'][-1]['phase'],'inventory-failure-retention')
    def test_inventory_failure_write_and_close_do_not_replace_first_refusal(self):
        for fault in ('write','close','both'):
            value={'schema':'bw.gui-hdd.inventory-failure.v1','candidate':False,'qualified':False,'firstFailure':{'phase':'inventory-file','name':'FileNotFoundError','message':'ORIGINAL_MISSING'},'secondary':[]}
            class Output:
                def __enter__(self):return self
                def write(self,raw):
                    if fault in ('write','both'):raise OSError('WRITE_FAILED')
                    return len(raw)
                def close(self):
                    if fault in ('close','both'):raise OSError('CLOSE_FAILED')
            with patch.object(c.Path,'open',return_value=Output()),patch.object(c.sys,'stderr',io.StringIO()) as stderr:
                self.assertEqual(c.retain_inventory_observation(value,'/out/success.json'),1)
            diagnostic=D(stderr.getvalue().encode());self.assertEqual(diagnostic['firstFailure']['message'],'ORIGINAL_MISSING')
            self.assertEqual([row['message'] for row in diagnostic['secondary']],['WRITE_FAILED','CLOSE_FAILED'] if fault=='both' else [fault.upper()+'_FAILED'])
    def test_inventory_success_retention_is_original_path_and_status_zero(self):
        with self.inventory_edges() as (raw,pin,env,events):value=c.inventory_observation(raw,pin,pathlib.Path('/checkout'),env,'/out/a.json')
        with tempfile.TemporaryDirectory(dir=root.parent) as temporary:
            path=pathlib.Path(temporary)/'inventory.original.json';self.assertEqual(c.retain_inventory_observation(value,path),0)
            self.assertEqual(path.read_bytes(),E(value));self.assertFalse(path.with_name('inventory-failure.json').exists())
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
            def startup(where,mode,args):
                observation=D(files['python-startup.before.json']);observation['arguments']=['scripts/run-i80386-hdd-gui-actual.py',mode]+args
                return files['python-startup.original.txt'],observation
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
            with patch.object(c,'regular',side_effect=regular),patch.object(c,'check_file',side_effect=check_file),patch.object(c,'inventory',side_effect=inventory),patch.object(c,'observe_runtime',side_effect=runtime),patch.object(c,'observe_python_startup',side_effect=startup):
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
                def startup(where,mode,args):
                    observation=D(files['python-startup.before.json']);observation['arguments']=['scripts/run-i80386-hdd-gui-actual.py',mode]+args
                    return files['python-startup.original.txt'],observation
                with patch.object(c,'regular',side_effect=regular),patch.object(c,'check_file',side_effect=lambda path,row:('source:'+str(path).removeprefix(str(checkout)+'/')).encode()),patch.object(c,'inventory',side_effect=inventory),patch.object(c,'observe_runtime',side_effect=runtime),patch.object(c.Originals,'seal',autospec=True,side_effect=seal),patch.object(c.sys,'stderr',io.StringIO()),patch.object(c,'observe_python_startup',side_effect=startup):
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
    def test_explicit_v2_schema_and_independent_directory_originals(self):
        request=D(self.files['request.original.json']);self.assertEqual(request['schema'],'bw.gui-hdd.actual-request.v3')
        request['schema']='bw.gui-hdd.actual-request.v1';raw=E(request)
        for module in (r,c):
            with self.assertRaises(ValueError):module.parse_request(raw,H(raw))
        def cut(f,e):
            observed=D(f['runtime.after.json']);observed['directoryIdentities']['/usr/lib']['mode']=stat.S_IFREG|0o644;f['runtime.after.json']=E(observed)
        self.rejects(cut)
    def test_declared_alias_relative_directory_chain_and_cycles(self):
        aliases={'/lib':{'linkText':'usr/lib','target':'/usr/lib'},'/usr/lib/selected':{'linkText':'libselected.so','target':'/usr/lib/libselected.so'}}
        for module in (r,c):
            self.assertEqual(module.declared_alias_resolution('/lib/selected',aliases),'/usr/lib/libselected.so')
            cycle={'/a':{'linkText':'b','target':'/b'},'/b':{'linkText':'a','target':'/a'}}
            with self.assertRaisesRegex(ValueError,'acyclic'):module.declared_alias_resolution('/a',cycle)
            with self.assertRaises(ValueError):module.declared_alias_resolution('/a',{'/a':{'linkText':'../escape','target':'/escape'}})
    def test_directory_alias_requires_selected_descendants_and_combined_cap(self):
        runtime=D(self.files['request.original.json'])['runtime']
        for module in (r,c):
            module.runtime_alias_policy(runtime)
            changed=copy.deepcopy(runtime);changed['directoryAliases']['/runtime-lib']={'linkText':'unselected','target':'/unselected'}
            with self.assertRaisesRegex(ValueError,'descendants'):module.runtime_alias_policy(changed)
            changed=copy.deepcopy(runtime);changed['aliases']={'/a'+str(i):{'linkText':'/usr/bin/python3.12','target':'/usr/bin/python3.12'} for i in range(255)}
            changed['directoryAliases']['/second']={'linkText':'usr/lib','target':'/usr/lib'}
            with self.assertRaisesRegex(ValueError,'bounded'):module.runtime_alias_policy(changed)
    def test_observed_alias_walk_refuses_undeclared_links_and_cycles(self):
        aliases={'/lib':{'linkText':'usr/lib','target':'/usr/lib'},'/usr/lib/selected':{'linkText':'libselected.so','target':'/usr/lib/libselected.so'}}
        def info(mode,ino=3):return SimpleNamespace(st_dev=1,st_ino=ino,st_mode=mode,st_uid=0,st_gid=0,st_nlink=1,st_size=0,st_mtime_ns=1)
        def lstat(path):
            if path in aliases:return info(stat.S_IFLNK|0o777)
            return info(stat.S_IFREG|0o444 if path.endswith('.so') else stat.S_IFDIR|0o755)
        with patch.object(c.os,'lstat',side_effect=lstat),patch.object(c.os,'readlink',side_effect=lambda name:aliases[name]['linkText']):
            self.assertEqual(c.observed_alias_resolution('/lib/selected',aliases),'/usr/lib/libselected.so')
            with self.assertRaisesRegex(ValueError,'declared'):c.observed_alias_resolution('/lib/selected',{'/lib':aliases['/lib']})
        cycle={'/a':{'linkText':'a','target':'/a'}}
        with patch.object(c.os,'lstat',return_value=info(stat.S_IFLNK|0o777)),patch.object(c.os,'readlink',return_value='a'):
            with self.assertRaisesRegex(ValueError,'finite'):c.observed_alias_resolution('/a',cycle)
    def test_directory_target_nofollow_readback_and_close(self):
        def info(mode=stat.S_IFDIR|0o755,ino=3):return SimpleNamespace(st_dev=1,st_ino=ino,st_mode=mode,st_uid=0,st_gid=0,st_nlink=1,st_size=0,st_mtime_ns=1)
        for scenario in ('positive','file','changed','close'):
            held=info(stat.S_IFREG|0o644) if scenario=='file' else info()
            fstats=[held,info(ino=4) if scenario=='changed' else held]
            with patch.object(c.os,'lstat',return_value=held),patch.object(c.os,'open',return_value=91) as opened,patch.object(c.os,'fstat',side_effect=fstats),patch.object(c.os,'close',side_effect=OSError('close-only') if scenario=='close' else None) as closed:
                if scenario=='positive':self.assertEqual(c.directory_identity('/usr/lib')['ino'],3)
                else:
                    with self.assertRaises((ValueError,OSError)):c.directory_identity('/usr/lib')
                self.assertTrue(opened.call_args.args[1]&os.O_DIRECTORY);self.assertTrue(opened.call_args.args[1]&os.O_NOFOLLOW);closed.assert_called_once_with(91)
    def test_proc_stat_zero_size_bounded_held_identity_and_pid(self):
        raw=b'400 (owned ) name) '+b' '.join([b'R',b'1',b'400',b'400']+[b'0']*15+[b'8'])
        info=SimpleNamespace(st_dev=1,st_ino=2,st_mode=stat.S_IFREG|0o444,st_size=0)
        position=0
        def read(fd,count):
            nonlocal position
            value=raw[position:position+count];position+=len(value);return value
        with patch.object(c.os,'open',return_value=92) as opened,patch.object(c.os,'fstat',return_value=info),patch.object(c.os,'read',side_effect=read),patch.object(c.os,'close') as closed:
            self.assertEqual(c.process_identity(400)['startTicks'],8);closed.assert_called_once_with(92)
            self.assertTrue(opened.call_args.args[1]&os.O_NOFOLLOW)
        with patch.object(c,'proc_stat',return_value=raw):
            with self.assertRaisesRegex(ValueError,'PID'):c.process_identity(401)
    def test_proc_stat_overflow_retains_primary_on_close_error(self):
        info=SimpleNamespace(st_dev=1,st_ino=2,st_mode=stat.S_IFREG|0o444,st_size=0);remaining=5000;reads=[]
        def read(fd,count):
            nonlocal remaining
            reads.append(count);amount=min(count,remaining);remaining-=amount;return b'x'*amount
        with patch.object(c.os,'open',return_value=92),patch.object(c.os,'fstat',return_value=info),patch.object(c.os,'read',side_effect=read),patch.object(c.os,'close',side_effect=OSError('close-secondary')) as closed:
            with self.assertRaisesRegex(ValueError,'cap'):c.proc_stat(400)
            self.assertEqual(sum(reads),4097);closed.assert_called_once_with(92)
    def test_both_proc_censuses_are_lazy_capped_and_close(self):
        for operation in (lambda:c.descendants(400),lambda:c.remaining_processes(400,{})):
            consumed=[];closed=[]
            class Entries:
                def __enter__(self):return self
                def __exit__(self,*args):closed.append(True)
                def __iter__(self):
                    for i in range(9000):consumed.append(i);yield SimpleNamespace(name='non-pid')
            with patch.object(c.os,'scandir',return_value=Entries()),patch.object(c,'process_identity',side_effect=AssertionError('nonpid must not read stat')):
                with self.assertRaisesRegex(ValueError,'census'):operation()
            self.assertEqual(len(consumed),8193);self.assertEqual(closed,[True])
    def test_remaining_escaped_descendant_keeps_start_identity(self):
        row={'pid':450,'state':'R','parentPid':1,'pgid':999,'sessionId':999,'startTicks':7}
        with patch.object(c,'proc_pids',return_value=iter([450])),patch.object(c,'process_identity',return_value=row):
            self.assertEqual(c.remaining_processes(400,{450:dict(row)}),[row])
        with patch.object(c,'proc_pids',return_value=iter([450])),patch.object(c,'process_identity',return_value=dict(row,startTicks=8)):
            self.assertEqual(c.remaining_processes(400,{450:dict(row)}),[])
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
const extract=name=>{
    const declaration=probe.indexOf(`function ${name} (`);
    assert.ok(declaration>=0,`probe declaration ${name}`);
    const start=probe.slice(declaration-6,declaration)==='async ' ? declaration-6 : declaration;
    return probe.slice(start,probe.indexOf('\n}',declaration)+2);
};
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

// The product handlers run verbatim against delayed browser File/prompt and
// React commit boundaries. No target, session or guest behavior is simulated.
const manager=fs.readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/machine-manager.jsx',import.meta.url),'utf8');
const drawer=fs.readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/debug-drawer.jsx',import.meta.url),'utf8');
const between=(source,start,end)=>{
    const from=source.indexOf(start);assert.ok(from>=0);
    const to=source.indexOf(end,from);assert.ok(to>from);return source.slice(from,to);
};
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('forward Boot waits for actual MachineManager asynchronous conf state, without blocking File selection',async()=>{
    const inputHandler=between(manager,'const file = e.target.files?.[0];','}} />');
    let rendered='',pending='',bootText=null,changed,release;
    const scope=vm.createContext({assert,Buffer,setText:value=>{pending=value;},document:{querySelector:()=>({value:rendered})}});
    vm.runInContext(`const actualConfChange=async e=>{${inputHandler}};${extract('forwardLocalMedia')}`,scope);
    const page={
        getByTestId:name=>({
            setInputFiles:async input=>{
                if(name==='bw-mm-local-conf'){
                    release=deferred();changed=scope.actualChange({target:{files:[{text:()=>release.promise}]}});
                    // A real input's dispatched event does not await its async listener.
                    assert.equal(rendered,'');
                } else assert.equal(name,'bw-mm-local-disk');
            },
            click:async()=>{assert.equal(name,'bw-mm-local-run');bootText=rendered;},
            waitFor:async()=>{assert.equal(name,'bw-machine-manager');}
        }),
        waitForFunction:async(predicate,expected,options)=>{
            assert.equal(options.timeout,10000);assert.equal(bootText,null);
            assert.equal(vm.runInContext('('+predicate.toString()+')(expected)',Object.assign(scope,{expected})),false);
            release.resolve(expected);await changed;
            assert.equal(rendered,'');assert.equal(bootText,null);rendered=pending;
            assert.equal(vm.runInContext('('+predicate.toString()+')(expected)',scope),true);
        }
    };
    scope.actualChange=vm.runInContext('actualConfChange',scope);scope.page=page;
    await vm.runInContext('forwardLocalMedia(page,Buffer.alloc(34816))',scope);
    assert.match(bootText,/imgmount c "forward-owned.img" -t hdd -size 512,17,4,1/);
    // The pre-fix ordering demonstrably booted while the actual handler was pending.
    rendered='';pending='';bootText=null;
    await page.getByTestId('bw-mm-local-conf').setInputFiles({});await page.getByTestId('bw-mm-local-run').click();
    assert.equal(bootText,'');release.resolve('eventually-read');await changed;assert.equal(pending,'eventually-read');
});

test('physical memory waits for actual async jump and rendered address, not the preexisting read-only label',async()=>{
    const {memoryJump,memorySessionCurrent}=await import('../overlay/scratch-gui/src/lib/bw-debug/memory-view.js');
    const jumpHandler=between(drawer,"const raw = await promptAsync('Memory address (hex)', address(start));",'}}>Go to address');
    const answer=deferred(),committed=deferred();let listener,renderedPage=0,pendingPage,handler,done=false;
    const capabilities={},runner={},session={runner,capabilities,spacesDeclared:true};
    const scope=vm.createContext({assert,Promise,promptAsync:()=>answer.promise,address:()=> '00000000',start:0,
        memorySessionCurrent,session,current:()=>({...session,mounted:true}),memoryJump,
        spec:{id:'mem',addressMin:0,addressMax:0xffffffff,maxReadBytes:1048576},
        component:{setState:state=>{pendingPage=state.page;}}});
    vm.runInContext(`const actualJump=async function(){${jumpHandler}};${extract('forwardMemoryPage')}`,scope);
    const panel={getByRole:()=>({click:async()=>{
        handler=vm.runInContext('actualJump.call(component)',scope);
        listener({type:()=> 'prompt',message:()=> 'Memory address (hex)',accept:async value=>{assert.equal(value,'7C00');answer.resolve(value);}});
    }}),locator:selector=>({waitFor:async options=>{
        assert.equal(selector,'[title="00007C00 — read-only"]');assert.equal(options.timeout,10000);
        await handler;assert.equal(pendingPage,0x7c00/128);assert.equal(renderedPage,0);
        // The old Read-only label has remained visible, while count() for the
        // requested cell would still be zero until this separate commit.
        await committed.promise;assert.equal(renderedPage,pendingPage);
    }})};
    scope.page={waitForEvent:async name=>{assert.equal(name,'dialog');return new Promise(resolve=>{listener=resolve;});}};scope.panel=panel;
    const operation=vm.runInContext('forwardMemoryPage(page,panel)',scope).then(()=>{done=true;});
    await tick();assert.equal(done,false);assert.equal(renderedPage,0);assert.equal(pendingPage,248);
    renderedPage=pendingPage;committed.resolve();await operation;assert.equal(done,true);
});

test('drawer and register readiness follow actual React toggle and full-width formatting before inspection',async()=>{
    const toggle=between(drawer,'toggle () {','\n\n    /**');
    let pendingOpen,open=false,opened=false,registersReady=false,rendered='EAX 12345677 EDI 89ABCDEF';
    const drawerCommit=deferred(),registerCommit=deferred();
    const scope=vm.createContext({assert,component:{state:{open:false},setState:update=>{pendingOpen=update({open:false}).open;}},
        document:{querySelector:()=>({innerText:rendered})}});
    vm.runInContext(`const actualToggle={${toggle}};${extract('forwardOpenDrawer')}\n${extract('forwardRegistersReady')}`,scope);
    const panel={getByRole:(role,options)=>({
        click:async()=>{assert.match(String(options.name),/Under the hood/);vm.runInContext('actualToggle.toggle.call(component)',scope);},
        waitFor:async settings=>{
            assert.equal(options.name,'Step instruction');assert.equal(settings.timeout,10000);
            assert.equal(pendingOpen,true);assert.equal(open,false);await drawerCommit.promise;assert.equal(open,true);
        }
    })};
    scope.panel=panel;
    const opening=vm.runInContext('forwardOpenDrawer(panel)',scope).then(()=>{opened=true;});
    await tick();assert.equal(opened,false);open=pendingOpen;drawerCommit.resolve();await opening;
    const formatExpression=between(drawer,"{typeof v === 'boolean' ?",'\n                            </span>').trim();
    const format=new Function('v','k','hex8','hex16','WIDE','return '+formatExpression.slice(1,-1));
    const eax=format(0x12345678,'eax');const edi=format(0x89abcdef,'edi');
    assert.equal(eax,'12345678');assert.equal(edi,'89ABCDEF');
    scope.page={waitForFunction:async(predicate,expected,options)=>{
        assert.equal(expected,0x12345678);assert.equal(options.timeout,10000);scope.expected=expected;
        const check=()=>vm.runInContext('('+predicate.toString()+')(expected)',scope);
        assert.equal(check(),false);await registerCommit.promise;
        rendered='EAX '+eax+' EDI '+edi;assert.equal(check(),true);
    }};
    const reading=vm.runInContext('forwardRegistersReady(page,0x12345678)',scope).then(()=>{registersReady=true;});
    await tick();assert.equal(registersReady,false);registerCommit.resolve();await reading;
});

test('metadata diagnostic step and job budgets contain the collector without widening actual',()=>{
    const workflow=fs.readFileSync(new URL('../.github/workflows/i80386-hdd-gui-actual.yml',import.meta.url),'utf8');
    const inventory=workflow.split('  inventory:')[1].split('  actual:')[0];
    const controller=fs.readFileSync(new URL('../scripts/run-i80386-hdd-gui-actual.py',import.meta.url),'utf8');
    const collectorSeconds=Number(controller.match(/deadline=time\.monotonic\(\)\+(\d+)/)[1]);
    const setupMinutes=Number(inventory.split('name: Install unchanged selected packages')[1].match(/timeout-minutes: (\d+)/)[1]);
    const recordMinutes=Number(inventory.split('name: Install externally selected immutable template')[1].match(/timeout-minutes: (\d+)/)[1]);
    const jobMinutes=Number(inventory.match(/timeout-minutes: (\d+)/)[1]);
    assert.ok(recordMinutes*60>=collectorSeconds+60,'diagnostic record step cannot preempt the collector budget');
    assert.ok(jobMinutes>=setupMinutes+recordMinutes+1,'metadata job includes setup, record and finite overhead margin');
    assert.match(workflow.split('  actual:')[1],/false &&/);assert.match(workflow.split('  actual:')[1],/timeout-minutes: 35/);
    assert.match(controller,/ACTUAL_ENABLED = False/);
});
