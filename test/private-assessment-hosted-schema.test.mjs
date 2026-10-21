import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Ordinary controls prove only schema/policy and bounded no-follow collection.
// They never mount, create namespaces/cgroups, execute bwrap or claim isolation.
const source=fileURLToPath(new URL('../scripts/private-assessment/hosted-run.py',import.meta.url));
const check=body=>{
    const code=`import importlib.util,json,os,tempfile,pathlib\nspec=importlib.util.spec_from_file_location('owned_hosted_schema',${JSON.stringify(source)})\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\n${body}`;
    const result=spawnSync('/usr/bin/python3',['-I','-S','-B','-c',code],{encoding:'utf8',timeout:5000,maxBuffer:65536});
    assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
};
const fixture=`p={'mode':'boundary','workRoot':'/public-fixture/fresh','source':m.__file__,'sourceSHA256':'a'*64,'bwrap':'/usr/bin/bwrap','bwrapSHA256':'b'*64,'pythonSHA256':'c'*64,'limits':{'cpu':1,'term':2,'kill':3,'terminal':4},'marker':{'tcpPort':12345,'unixPath':'/public-fixture/socket','filePath':'/public-fixture/file','environmentName':'BW_PUBLIC_CREDENTIAL_SENTINEL'}}\n`;

test('hosted public schema retains a separate finite maximum and accepts only lower ordered limits',()=>{
    check(fixture+`assert m.validate(p) is p\nassert m.HOSTED_MAX=={'cpu':600.0,'term':900.0,'kill':903.0,'terminal':905.0}\nassert len(m.MODES)==9\nfor key in m.HOSTED_MAX:\n q=json.loads(json.dumps(p));q['limits'][key]=m.HOSTED_MAX[key]+1\n try:m.validate(q);raise AssertionError('raised maximum accepted')\n except m.Refused:pass\nq=json.loads(json.dumps(p));q['limits']['kill']=q['limits']['term']\ntry:m.validate(q);raise AssertionError('unordered accepted')\nexcept m.Refused:pass`);
});
test('hosted public schema refuses LIVE arbitrary executables unknown fields and missing pins before kernel work',()=>{
    check(fixture+`for key,value in [('mode','live'),('source','/arbitrary/converter.py'),('bwrap','/bin/true'),('sourceSHA256',''),('workRoot','relative')]:\n q=json.loads(json.dumps(p));q[key]=value\n try:m.validate(q);raise AssertionError('bad schema accepted')\n except m.Refused:pass\np['argv']=['/bin/sh']\ntry:m.validate(p);raise AssertionError('arbitrary argv accepted')\nexcept m.Refused:pass\nassert m.LIBC is None,'schema validation did not call libc'`);
});
test('real local no-follow inventory retains regular bytes and refuses symlink and FIFO without opening them',()=>{
    check(`root=pathlib.Path(tempfile.mkdtemp(prefix='public-hosted-schema-',dir=os.environ.get('TMPDIR')))\n(root/'regular').write_bytes(b'public')\nos.symlink('regular',root/'link');os.mkfifo(root/'fifo')\nrows={r['name']:r for r in m.inventory(root)}\nassert rows['regular']['bytes']==6 and rows['regular']['sha256']==m.hashlib.sha256(b'public').hexdigest()\nassert rows['link']['refusal']=='NONREGULAR' and rows['link']['link']=='regular'\nassert rows['fifo']['refusal']=='NONREGULAR'\nassert m.LIBC is None,'collector used only genuine local filesystem operations'`);
});
