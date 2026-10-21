import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Policy and genuine local-file controls only. No root, cgroup, mount, bwrap,
// namespaces, network or workflow execution, and no conditional isolation PASS.
const source=fileURLToPath(new URL('../scripts/private-assessment/hosted-public-outer.py',import.meta.url));
const check=body=>{
    const code=`import importlib.util,json,pathlib,tempfile,os\ns=importlib.util.spec_from_file_location('public_outer',${JSON.stringify(source)})\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n${body}`;
    const r=spawnSync('/usr/bin/python3',['-I','-S','-B','-c',code],{encoding:'utf8',timeout:5000,maxBuffer:65536});
    assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);
};
const fixture=`o={'platform':{'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','GITHUB_REPOSITORY':'CrispStrobe/brickwright-lite','GITHUB_SHA':'a'*40},'runner':{'imageOS':'ubuntu24','imageVersion':'public-fixture','kernel':'fixture','machine':'x86_64'},'tools':{'python':{'available':True,'path':'/usr/bin/python3','realpath':'/usr/bin/python3.12','bytes':128,'sha256':'a'*64,'permissions':493,'uid':0,'gid':0},'bwrap':{'available':True,'path':'/usr/bin/bwrap','realpath':'/usr/bin/bwrap','bytes':128,'sha256':'b'*64,'permissions':493,'uid':0,'gid':0}},'packages':{'bubblewrap':{'Version':'public-fixture','Architecture':'amd64','Status':'install ok installed'},'python3.12-minimal':{'Version':'public-fixture','Architecture':'amd64','Status':'install ok installed'}}}\np={'schema':'brickwright/public-hosted-tool-admission/v1','profiles':[{k:o[k] for k in ('runner','tools','packages')}]}\n`;

test('empty public tool policy fails before privileged setup and makes no availability claim',()=>{
    check(fixture+`try:m.admit(o,{'schema':p['schema'],'profiles':[]});raise AssertionError('unknown accepted')\nexcept m.Refused as e:assert str(e)=='ISOLATION_UNAVAILABLE_UNADMITTED_IMAGE_OR_TOOLS'\nassert m.MAX=={'cpu':25,'term':30,'kill':33,'terminal':35,'leaf':8388608,'owned':67108864}\nassert len(m.MODES)==9`);
});
test('tool image package and own-repository identities must match an explicitly admitted profile',()=>{
    check(fixture+`assert m.admit(o,p)==p['profiles'][0]\nfor section,key,value in [('runner','imageVersion','other'),('runner','machine','arm64'),('tools','bwrap',{'available':False}),('packages','bubblewrap',{'Version':'other','Architecture':'amd64','Status':'install ok installed'}),('platform','GITHUB_REPOSITORY','foreign/repo')]:\n q=json.loads(json.dumps(o));q[section][key]=value\n try:m.admit(q,p);raise AssertionError('mismatch accepted')\n except m.Refused:pass\nq=json.loads(json.dumps(o));q['tools']['bwrap']['sha256']='c'*64\ntry:m.admit(q,p);raise AssertionError('wrong hash accepted')\nexcept m.Refused:pass`);
});
test('the outer aggregate adds kernel inclusive descendant CPU once and never wait4 again',()=>{
    check(`assert m.aggregate(2.5,.25)==2.75\nassert m.aggregate(0,.1)==.1\nassert m.aggregate(2.5,.25,.03125)==2.78125\nassert m.launch_prefix(m.struct.pack('!d',.03125))==.03125\nfor raw in [b'',b'123456789',m.struct.pack('!d',-1.),m.struct.pack('!d',float('nan')),m.struct.pack('!d',float('inf'))]:\n try:m.launch_prefix(raw);raise AssertionError('bad launch receipt accepted')\n except m.Refused:pass\nfor a,b in [(-1,0),(0,-1),(float('inf'),0),(float('nan'),0),(True,0)]:\n try:m.aggregate(a,b);raise AssertionError('counter accepted')\n except m.Refused:pass`);
});
test('all nine original mounts plus public artifact copies have a finite kernel storage contract',()=>{
    check(`r=m.storage_maximum()\nassert r['originalBytes']==m.DATA_BYTES+m.STREAM_BYTES+9*(65536+262144)\nassert r['originalPlusCopies']==2*r['originalBytes']\nassert r['within64MiB'] and r['originalPlusCopies']+m.RESERVE<m.MAX['owned']\nassert (m.DATA_BYTES,m.DATA_INODES,m.STREAM_BYTES,m.STREAM_INODES)==(25165824,2048,1048576,16)`);
});
test('public work and artifact paths must be fresh literal siblings without ancestor links',()=>{
    check(`root=pathlib.Path(tempfile.mkdtemp(prefix='public-outer-schema-'))\nm.fixed_paths(root/'volatile',root/'originals')\nfor a,b in [(root/'arbitrary',root/'originals'),(root/'volatile',root/'nested/originals')]:\n try:m.fixed_paths(a,b);raise AssertionError('bad paths accepted')\n except m.Refused:pass\n(root/'volatile').mkdir()\ntry:m.fixed_paths(root/'volatile',root/'originals');raise AssertionError('existing accepted')\nexcept m.Refused:pass`);
});
test('real local original collection copies exact regular bytes and records FIFO and link without reading',()=>{
    check(`root=pathlib.Path(tempfile.mkdtemp(prefix='public-outer-collector-'));src=root/'source';src.mkdir()\n(src/'regular').write_bytes(b'public-original')\nos.symlink('regular',src/'link');os.mkfifo(src/'fifo')\nrows=[];m.copy_originals(src,root/'copies',rows)\nr={x['path']:x for x in rows}\nassert (root/'copies/regular').read_bytes()==b'public-original'\nassert r['regular']['sha256']==m.sha(b'public-original')\nassert r['link']['link']=='regular' and r['link']['refusal']=='NONREGULAR_NOT_READ'\nassert r['fifo']['refusal']=='NONREGULAR_NOT_READ'\nassert not (root/'copies/link').exists() and not (root/'copies/fifo').exists()`);
});

test('the trusted episode seam rejects genuine unrelated local directory descriptors before libc work',()=>{
    check(`spec=importlib.util.spec_from_file_location('public_kernel',pathlib.Path(m.__file__).with_name('hosted-run.py'))
k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k)
root=pathlib.Path(tempfile.mkdtemp(prefix='public-episode-origin-'));fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
try:
 try:k.episode_parent(fd);raise AssertionError('caller directory enrolled')
 except k.Refused as error:assert str(error)=='EPISODE_FD_ORIGIN'
finally:os.close(fd)
assert k.LIBC is None,'unrelated fd refused before namespace/cgroup libc work'`);
});
