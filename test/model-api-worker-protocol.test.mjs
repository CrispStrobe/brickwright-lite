// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,openSync,ftruncateSync,closeSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {seal,open,sha256} from '../tools/model-api/lib/crypto.mjs';
import {dispatchTag} from '../tools/model-api/lib/job-identity.mjs';
import {validateSubmission,submissionPayload,LIMITS} from '../tools/model-api/lib/protocol.mjs';
const controller=fileURLToPath(new URL('../tools/model-api/dispatch-worker.mjs',import.meta.url)),master=Buffer.alloc(32,7),revision='a'.repeat(40);
const normalized=submissionPayload(validateSubmission({model:{name:'fixture.ldr',text:'0 fixture\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n'}}));
function fixture(){
 const dir=mkdtempSync(path.join(tmpdir(),'model-api-controller-')),j={id:'11111111-1111-4111-8111-111111111111',owner:'f'.repeat(32),nonce:'b'.repeat(32),createdAt:100000,inputSha256:sha256(JSON.stringify(normalized)),repository:'owner/worker',workflow:'model-measurements.yml',workerRevision:revision};j.correlation=dispatchTag(master,j);
 const payload={...j,submission:normalized};delete payload.id;
 const paths={event:path.join(dir,'event.json'),input:path.join(dir,'input.json'),meta:path.join(dir,'meta.json'),report:path.join(dir,'report.json'),result:path.join(dir,'result.enc')};
 const event={inputs:{request_id:j.id,request_tag:j.correlation,envelope:seal(master,'request:'+j.id,payload)}};writeFileSync(paths.event,JSON.stringify(event));
 const env={PATH:process.env.PATH,LANG:'C.UTF-8',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:revision,GITHUB_REPOSITORY:j.repository,GITHUB_WORKFLOW_REF:j.repository+'/.github/workflows/'+j.workflow+'@refs/tags/qualified-fixture',MODEL_API_MASTER_KEY:master.toString('hex')};
 return{dir,j,payload,paths,event,env,run(mode,args,overrides={}){const childEnv={...env,...overrides};for(const k of Object.keys(childEnv))if(childEnv[k]===undefined)delete childEnv[k];return spawnSync(process.execPath,['--max-old-space-size=128',controller,mode,...args],{env:childEnv,encoding:'utf8',timeout:5000,maxBuffer:65536});},cleanup(){rmSync(dir,{recursive:true,force:true});}};
}
const report=j=>({version:1,status:'completed',qualification:{status:'not-evaluated'},runtime:{revision:j.workerRevision},marker:'manufactured protocol fixture; no native simulation'});

test('real trusted prepare/seal controller preserves nonce/owner/input/source and exact encrypted LF',()=>{
 const f=fixture();try{const prepared=f.run('prepare',[f.paths.event,f.paths.input,f.paths.meta]);assert.equal(prepared.status,0,prepared.stderr);assert.deepEqual(JSON.parse(readFileSync(f.paths.input)),normalized);
 const meta=JSON.parse(readFileSync(f.paths.meta));for(const key of Object.keys(f.j))assert.equal(meta[key],f.j[key]);
 writeFileSync(f.paths.report,JSON.stringify(report(f.j)));const sealed=f.run('seal',[f.paths.meta,f.paths.report,f.paths.result]);assert.equal(sealed.status,0,sealed.stderr);
 const raw=readFileSync(f.paths.result,'utf8');assert.ok(raw.endsWith('\n'));const result=open(master,'result:'+f.j.id,raw,LIMITS.resultBytes);assert.equal(result.requestId,f.j.id);for(const key of ['owner','nonce','createdAt','inputSha256','repository','workflow','workerRevision','correlation'])assert.equal(result[key],f.j[key]);assert.deepEqual(result.report,report(f.j));
 }finally{f.cleanup();}
});
test('foreign source/repository/workflow/correlation or changed normalized input refuses before writing worker data',()=>{
 for(const change of [f=>({GITHUB_SHA:'c'.repeat(40)}),f=>({GITHUB_REPOSITORY:'foreign/worker'}),f=>({GITHUB_WORKFLOW_REF:'owner/worker/.github/workflows/other.yml@refs/tags/fixture'}),f=>{f.event.inputs.request_tag='c'.repeat(64);return{};},f=>{f.payload.inputSha256='0'.repeat(64);f.event.inputs.envelope=seal(master,'request:'+f.j.id,f.payload);return{};},f=>{f.event.inputs.extra='caller-selected-code';return{};}]){
  const f=fixture();try{const env=change(f);writeFileSync(f.paths.event,JSON.stringify(f.event));const p=f.run('prepare',[f.paths.event,f.paths.input,f.paths.meta],env);assert.notEqual(p.status,0);assert.equal(existsSync(f.paths.input),false);assert.equal(existsSync(f.paths.meta),false);}finally{f.cleanup();}
 }
});
test('qualification-only key path is explicit and cannot become a production fallback',()=>{
 for(const [mode,eventName,flag,productionKey,expect] of [
  ['prepare','workflow_dispatch',undefined,undefined,false],['prepare','workflow_dispatch','1',master.toString('hex'),false],
  ['qualification-prepare','workflow_dispatch','1',undefined,false],['qualification-prepare','pull_request',undefined,undefined,false],
  ['qualification-prepare','pull_request','1',master.toString('hex'),false],['qualification-prepare','pull_request','1',undefined,true]
 ]){const f=fixture();try{const p=f.run(mode,[f.paths.event,f.paths.input,f.paths.meta],{GITHUB_EVENT_NAME:eventName,MODEL_API_QUALIFICATION_ONLY:flag,MODEL_API_MASTER_KEY:productionKey,MODEL_API_QUALIFICATION_KEY:master.toString('hex'),MODEL_API_QUALIFICATION_SOURCE:revision});assert.equal(p.status===0,expect,p.stderr);assert.equal(existsSync(f.paths.input),expect);}finally{f.cleanup();}}
});
test('oversized, missing and wrong-source reports remain explicit failures, never invented measurements',()=>{
 for(const mode of ['oversize','missing','source','qualification']){const f=fixture();try{assert.equal(f.run('prepare',[f.paths.event,f.paths.input,f.paths.meta]).status,0);
  if(mode==='oversize'){const fd=openSync(f.paths.report,'wx');ftruncateSync(fd,LIMITS.resultBytes);closeSync(fd);}else if(mode!=='missing'){const data=report(f.j);if(mode==='source')data.runtime.revision='c'.repeat(40);else data.qualification.status='qualified';writeFileSync(f.paths.report,JSON.stringify(data));}
  const p=f.run('seal',[f.paths.meta,f.paths.report,f.paths.result]);assert.equal(p.status,0,p.stderr);const result=open(master,'result:'+f.j.id,readFileSync(f.paths.result,'utf8'),LIMITS.resultBytes);assert.equal(result.report.status,'failed');assert.equal(result.report.qualification.status,'not-evaluated');assert.ok(result.report.error.code);assert.equal(result.report.samples,undefined);
 }finally{f.cleanup();}}
});
test('bounded controller refuses aliases and preserves unknown existing output rather than overwriting',()=>{
 const f=fixture();try{const link=path.join(f.dir,'alias-event');symlinkSync(f.paths.event,link);assert.notEqual(f.run('prepare',[link,f.paths.input,f.paths.meta]).status,0);assert.equal(existsSync(f.paths.input),false);
 writeFileSync(f.paths.input,'owned-existing-data');assert.notEqual(f.run('prepare',[f.paths.event,f.paths.input,f.paths.meta]).status,0);assert.equal(readFileSync(f.paths.input,'utf8'),'owned-existing-data');
 }finally{f.cleanup();}
});
