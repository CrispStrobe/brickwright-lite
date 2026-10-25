// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const checkout = '1'.repeat(40), tree = '2'.repeat(40);
const model = '0 Example\n0 !BW PART hub\n';
const definitions = [{id:'m',kind:'distance',label:'Span',targets:['a','b'],visible:true}];
const fixture = async (change = () => {}) => {
    const saved = {ldraw:model,measurements:structuredClone(definitions)};
    change(saved);
    const zip = new JSZip();zip.file('project.json',JSON.stringify({targets:[]}));
    zip.file('brickwright/state.json',JSON.stringify({state:{simLab:saved}}));
    const bytes = await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
    const report = {source:{checkout,tree},project:{before:definitions,after:definitions,saved:definitions,
        modelBeforeSha256:sha(model),modelAfterSha256:sha(model),sb3:{file:'sim-lab-measurement-edit.sb3',bytes:bytes.length,sha256:sha(bytes)}}};
    return {bytes,report};
};
const audit = ({bytes,report}, expectedCheckout = checkout) => spawnSync('python3',['-B','-c',
    `import sys,json,base64,importlib.util\nspec=importlib.util.spec_from_file_location('reader','scripts/read-sim-lab-measurement-artifact.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\np=json.load(sys.stdin)\nprint(json.dumps(m.audit(base64.b64decode(p['bytes']),json.dumps(p['report']).encode(),p['checkout'],p['tree'])))`],
    {input:JSON.stringify({bytes:bytes.toString('base64'),report,checkout:expectedCheckout,tree}),encoding:'utf8'});

test('standalone stdlib reader admits actual ZIP bytes and joins source, model, sidecar and definitions',async()=>{
    const f=await fixture(),out=audit(f);assert.equal(out.status,0,out.stderr);const receipt=JSON.parse(out.stdout);
    assert.equal(receipt.result,'PASS');assert.equal(receipt.sb3Sha256,sha(f.bytes));assert.equal(receipt.definitions,1);
});
for (const [name,change] of [
    ['wrong expected source',(f)=>[f,'3'.repeat(40)]],
    ['wrong original hash',f=>{f.report.project.sb3.sha256='0'.repeat(64);return[f];}],
    ['changed saved model',async()=>[await fixture(s=>{s.ldraw+='0 changed\n';})]],
    ['changed saved definitions',async()=>[await fixture(s=>{s.measurements[0].targets=['a','c'];})]],
    ['unsupported quantity',async()=>{const f=await fixture(s=>{s.measurements[0].kind='inventedForce';});
        const defs=[{...definitions[0],kind:'inventedForce'}];Object.assign(f.report.project,{before:defs,after:defs,saved:defs});return[f];}],
    ['corrupt CRC with matching outer hash',f=>{const i=f.bytes.indexOf(Buffer.from('Example'));assert.ok(i>0);f.bytes[i]^=1;
        f.report.project.sb3.sha256=sha(f.bytes);return[f];}]
]) test(`standalone reader rejects ${name}`,async()=>{
    const args=await change(await fixture());const out=audit(...args);assert.notEqual(out.status,0,'negative original must refuse');
});

const recordingFixture = () => {
    const definition={id:'angle',kind:'jointAngle',label:'Input',targets:[],joint:'j0',rope:'',binding:'sha256:one'};
    const header=['run_id','model_sha256','measurement_id','label','kind','definition_json','unit','source','elapsed_ms','available','value','reason'];
    const rows=[header,...['run-1','run-2'].map((id,i)=>[id,sha(model),'angle','Input','jointAngle',JSON.stringify(definition),'°','jolt-joint',0,'true',i+1,''])];
    const encode = rows => Buffer.from(rows.map(row=>row.map(cell=> '"'+String(cell).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n');
    const make = () => {const bytes=encode(rows);return{bytes,report:{source:{checkout,tree},recording:{runCount:2,compatible:true,modelSha256:sha(model),definitions:[definition],sampleSets:[1,1],csv:{file:'sim-lab-measurement-runs.csv',bytes:bytes.length,sha256:sha(bytes),rows:2}}}};};
    return {rows,make};
};
const auditRecording = f => spawnSync('python3',['-B','-c',
    `import sys,json,base64,importlib.util\nspec=importlib.util.spec_from_file_location('reader','scripts/read-sim-lab-measurement-artifact.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\np=json.load(sys.stdin)\nprint(json.dumps(m.audit_recording(base64.b64decode(p['bytes']),json.dumps(p['report']).encode(),p['checkout'],p['tree'])))`],
    {input:JSON.stringify({bytes:f.bytes.toString('base64'),report:f.report,checkout,tree}),encoding:'utf8'});
test('independent CSV reader admits exact source, definitions, units and two shared-time runs',()=>{
    const {make}=recordingFixture(),out=auditRecording(make());assert.equal(out.status,0,out.stderr);assert.equal(JSON.parse(out.stdout).rows,2);
});
for(const [name,change] of [
    ['nonfinite observation',f=>{f.rows[1][10]='NaN';}],
    ['fabricated units',f=>{f.rows[1][6]='N';}],
    ['unavailable value presented as zero',f=>{f.rows[1][9]='false';f.rows[1][10]='0';f.rows[1][11]='missing-target';}],
    ['different source identity',()=>{}],
    ['no exact shared time',f=>{f.rows[2][8]=50;}]
]) test(`independent CSV reader refuses ${name}`,()=>{
    const f=recordingFixture();change(f);const input=f.make();
    if(name==='different source identity')input.report.source.checkout='4'.repeat(40);
    const out=auditRecording(input);assert.notEqual(out.status,0);
});
