// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateSubmission,LIMITS} from '../tools/model-api/lib/protocol.mjs';import {authenticate,sha256,ownerTag,seal,open,signJob,readJob} from '../tools/model-api/lib/crypto.mjs';import {createGateway} from '../tools/model-api/lib/gateway.mjs';import {applyCors} from '../tools/model-api/lib/http.mjs';import {githubBackend} from '../tools/model-api/lib/github.mjs';
const master=Buffer.alloc(32,7),token='x'.repeat(43),other='y'.repeat(43),tokens=[{id:'a',sha256:sha256(token)},{id:'b',sha256:sha256(other)}],model={name:'model.ldr',text:'0 model\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n'},input={model},authorization='Bearer '+token;
test('typed file, time and measurement limits reject executable or oversized submissions',()=>{
 assert.equal(validateSubmission(input).model.name,'model.ldr');for(const v of [{model:{...model,name:'../x.ldr'}},{model:{...model,name:'x.js'}},{model:{...model,text:'x'.repeat(LIMITS.modelBytes+1)}},{...input,ref:'attacker'},{...input,settings:{programMs:LIMITS.programMs+1}},{...input,measurements:[{id:'x',kind:'torque',targets:['a']}]},{...input,program:{name:'x.bw',text:'DEVICE SPIKE\nIMPORT "https://example.com/evil.js"'}},{...input,program:{name:'x.bw',text:'DEVICE SPIKE\nWHEN flag clicked:\n  lab reset'}}])assert.throws(()=>validateSubmission(v));
});
test('tokens, authenticated encryption, ownership and expiry fail closed',()=>{
 assert.equal(authenticate(authorization,tokens),'a');assert.throws(()=>authenticate('Bearer '+other,[tokens[0]]));assert.throws(()=>authenticate(undefined,tokens));
 const e=seal(master,'request:id',{data:'hello'});assert.deepEqual(open(master,'request:id',e),{data:'hello'});assert.throws(()=>open(master,'request:other',e));const b=Buffer.from(e,'base64url');b[b.length-1]^=1;assert.throws(()=>open(master,'request:id',b.toString('base64url')));
 const tag=ownerTag(master,'a'),job={id:'11111111-1111-4111-8111-111111111111',owner:tag,createdAt:100000,runId:12},id=signJob(master,job);assert.deepEqual(readJob(master,id,tag,100001),job);assert.throws(()=>readJob(master,id,ownerTag(master,'b'),100001));assert.throws(()=>readJob(master,id,tag,100000+86400001));assert.throws(()=>readJob(master,id+'x',tag,100001));
});
test('a data-only submission yields an owned job; unauthorized, altered and foreign jobs cannot dispatch or read results',async()=>{
 let submitted,seen=0;const backend={submit:async(j,e)=>{seen++;submitted={j,e};return 42;},status:async()=>({status:'completed'}),result:async j=>seal(master,'result:'+j.id,{requestId:j.id,owner:j.owner,report:{status:'completed',samples:[1]}})},api=createGateway({tokens,master,backend,now:()=>100000});
 assert.equal((await api({method:'POST',path:'/v1/runs',body:input})).status,401);assert.equal(seen,0);
 assert.equal((await api({method:'POST',path:'/v1/runs',authorization,body:{...input,workflow:'arbitrary'}})).status,422);assert.equal(seen,0);
 const response=await api({method:'POST',path:'/v1/runs',authorization,body:input});assert.equal(response.status,202);assert.equal(seen,1);const payload=open(master,'request:'+submitted.j.id,submitted.e);assert.equal(payload.submission.model.text,model.text);assert.equal(payload.owner,ownerTag(master,'a'));
 const path='/v1/runs/'+response.body.id;assert.equal((await api({method:'GET',path,authorization:'Bearer '+other})).status,404);assert.equal((await api({method:'GET',path:path+'/result',authorization})).body.status,'completed');assert.equal((await api({method:'GET',path:path+'x',authorization})).status,404);
});
test('worker failures never become fabricated measurements or successful qualification',async()=>{
 const backend={submit:async()=>{throw Error('secret credential must not escape');}},api=createGateway({tokens,master,backend});const r=await api({method:'POST',path:'/v1/runs',authorization,body:input});assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('secret credential'));
});
test('GitHub backend accepts 200 and legacy 204 dispatch without caller-selected code or refs',async()=>{
 for(const status of [200,204]){const calls=[],backend=githubBackend({repository:'owner/repo',workflow:'model-measurements.yml',ref:'trusted',token:'private-server-token',fetchImpl:async(url,options)=>{calls.push({url,options});return{ok:true,status,json:async()=>({workflow_run_id:123})};}});const id=await backend.submit({id:'owned'},'encrypted');assert.equal(id,status===200?123:null);const body=JSON.parse(calls[0].options.body);assert.equal(body.ref,'trusted');assert.deepEqual(Object.keys(body.inputs).sort(),['envelope','request_id']);assert.ok(calls[0].url.endsWith('/actions/workflows/model-measurements.yml/dispatches'));}
});
test('an initializing GitHub run stays queued until its exact request name is visible',async()=>{
 const job={id:'request',runId:123,createdAt:Date.now()},run={event:'workflow_dispatch',path:'.github/workflows/model-measurements.yml',display_title:'Submitted model measurements',status:'queued',id:123,head_sha:'fixed'};
 const backend=githubBackend({repository:'owner/repo',workflow:'model-measurements.yml',ref:'main',token:'server-only',fetchImpl:async()=>({ok:true,json:async()=>({...run})})});
 assert.deepEqual(await backend.status(job),{status:'queued'});
 run.display_title='model-measure:request';assert.equal((await backend.status(job)).runId,123);
 run.display_title='another-request';await assert.rejects(()=>backend.status(job),e=>e.status===404);
 run.display_title='Submitted model measurements';run.status='completed';await assert.rejects(()=>backend.status(job),e=>e.status===404);
 run.status='queued';run.path='.github/workflows/other.yml';await assert.rejects(()=>backend.status(job),e=>e.status===404);
});
test('hosted worker has no credential/network channel and preserves failures as encrypted artifacts',()=>{
 const s=readFileSync(new URL('../.github/workflows/model-measurements.yml',import.meta.url),'utf8'),run=s.slice(s.indexOf('      - name: Run bounded'),s.indexOf('      - name: Encrypt'));
 assert.match(run,/--network=none/);assert.match(run,/--read-only/);assert.match(run,/--pids-limit=128/);assert.match(run,/--memory=2g/);assert.match(run,/timeout --signal=TERM/);assert.match(run,/node@sha256:[a-f0-9]{64}/);assert.ok(!/secrets\.|GITHUB_TOKEN|MODEL_API_MASTER_KEY/.test(run));assert.match(s,/persist-credentials: false/);assert.match(s,/retention-days: 1/);assert.ok(!s.includes('concurrency:'));assert.ok(!s.includes('${{ inputs.envelope }}'),'payload is read from event data, never expanded into shell code');
});

test('a Pages client receives only explicitly allowed CORS origins',()=>{
 const headers={},res={setHeader:(k,v)=>headers[k]=v,end:()=>{res.ended=true;}};
 assert.equal(applyCors({method:'OPTIONS',headers:{origin:'https://crispstrobe.github.io'}},res,['https://crispstrobe.github.io']),true);assert.equal(res.statusCode,204);assert.equal(headers['Access-Control-Allow-Origin'],'https://crispstrobe.github.io');assert.throws(()=>applyCors({method:'OPTIONS',headers:{origin:'https://other.invalid'}},res,['https://crispstrobe.github.io']));
});
