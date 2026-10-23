// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdmission,initialAdmissionDocument} from '../tools/model-api/lib/admission.mjs';
import {githubAdmissionStore,gitBlobSha} from '../tools/model-api/lib/github-admission-store.mjs';
import {dispatchTag,TERMINAL,beforeDispatchRefusal} from '../tools/model-api/lib/job-identity.mjs';
import {createGateway} from '../tools/model-api/lib/gateway.mjs';
import {ownerTag,sha256,open} from '../tools/model-api/lib/crypto.mjs';
const master=Buffer.alloc(32,7),repository='owner/worker',workflow='model-measurements.yml',workerRevision='a'.repeat(40);
const policy={epoch:'qualification-test-epoch',repository,workflow,global:8,perOwner:2};
const job=(n,owner='agent',overrides={})=>{const j={id:`00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`,owner:ownerTag(master,owner),nonce:n.toString(16).padStart(32,'0'),createdAt:100000,runId:null,repository,workflow,workerRevision,...overrides};return Object.freeze({...j,correlation:dispatchTag(master,j)});};
const state=(j,overrides={})=>Object.defineProperty({status:'completed'},TERMINAL,{value:{source:'github-actions',...j,runId:100,conclusion:'success',...overrides}});
/** Fake provider explicitly supplies atomic compare-and-write; this is not a live GitHub CAS claim. */
const server=(quota=policy)=>{
 const s={bytes:initialAdmissionDocument({master,...quota}),private:true,push:true,owner:'owner',gets:0,puts:0,writes:0,peak:0,history:[],alwaysConflict:false,dropAck:false,failWrite:false,readBytes:null};
 s.fetch=async(input,options={})=>{
  assert.equal(options.headers.Authorization,'Bearer ledger-fixture-token');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  const url=new URL(String(input));assert.equal(url.origin,'https://api.github.com');
  if(url.pathname==='/repos/owner/state')return Response.json({private:s.private,full_name:'owner/state',owner:{login:s.owner},permissions:{push:s.push}});
  assert.equal(url.pathname,'/repos/owner/state/contents/model-api-admission.json');
  if(!options.method){s.gets++;if(s.bytes===null)return new Response('missing',{status:404});const b=s.readBytes||s.bytes;return Response.json({type:'file',path:'model-api-admission.json',encoding:'base64',size:b.length,sha:gitBlobSha(b),content:b.toString('base64')});}
  assert.equal(options.method,'PUT');s.puts++;const body=JSON.parse(options.body);assert.equal(body.branch,'state');assert.equal(typeof body.sha,'string');
  await Promise.resolve(); // Adversarial interleaving before the provider's atomic linearization point.
  if(s.failWrite)throw s.failWrite;
  if(s.alwaysConflict||s.bytes===null||body.sha!==gitBlobSha(s.bytes))return new Response('conflict',{status:409});
  const next=Buffer.from(body.content,'base64');s.bytes=next;s.writes++;s.history.push(JSON.parse(next));s.peak=Math.max(s.peak,JSON.parse(next).active.length);
  if(s.dropAck){s.dropAck=false;throw new Error('committed acknowledgement lost');}
  return Response.json({content:{sha:gitBlobSha(next)},commit:{sha:'b'.repeat(40)}});
 };
 s.store=()=>githubAdmissionStore({repository:'owner/state',owner:'owner',ref:'state',token:'ledger-fixture-token',fetchImpl:s.fetch});
 s.admission=()=>createAdmission({master,store:s.store(),...quota});
 return s;
};

test('simultaneous independent instances obey aggregate/per-agent caps at actual CAS, with successful dispatch ordering',async()=>{
 const s=server(),accepted=[],attempts=[];
 const submit=async j=>{const a=s.admission();try{await a.submit(j,async()=>{const active=JSON.parse(s.bytes).active;assert.ok(active.some(x=>x.id===j.id&&x.nonce===j.nonce));accepted.push(j);return 12;});return true;}catch(e){assert.ok([429,503].includes(e.status),String(e));return false;}};
 for(let n=1;n<=40;n++)attempts.push(submit(job(n,'agent-'+Math.floor((n-1)/4))));
 await Promise.all(attempts);assert.ok(accepted.length>0&&accepted.length<=8);assert.ok(s.peak<=8);
 for(const d of s.history){assert.ok(d.active.length<=8);for(const item of d.active)assert.ok(d.active.filter(x=>x.owner===item.owner).length<=2);}
 // Contention may refuse conservatively; serial capacity still works and cannot be implemented as deny-all.
 let n=100;while(JSON.parse(s.bytes).active.length<8)await submit(job(n++,'new-'+n));
 assert.equal(JSON.parse(s.bytes).active.length,8);assert.equal(accepted.length,8);
 await assert.rejects(s.admission().submit(job(999,'fresh'),async()=>assert.fail('over-global dispatch')),e=>e.status===429);
});
test('same-owner concurrent submissions cap at two and a revoked bearer never touches the store/backend',async()=>{
 const s=server();let submits=0;const backend={repository,workflow,workerRevision,status:async()=>({status:'queued'}),submit:async(j,e)=>{assert.equal(open(master,'request:'+j.id,e).nonce,j.nonce);submits++;return 5;}};
 const token='x'.repeat(43),tokens=[{id:'agent',sha256:sha256(token)}],input={model:{name:'x.ldr',text:'0 x\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n'}};
 const results=await Promise.all(Array.from({length:10},()=>createGateway({tokens,master,backend,admission:s.admission(),now:()=>100000})({method:'POST',path:'/v1/runs',authorization:'Bearer '+token,body:input})));
 assert.equal(results.filter(r=>r.status===202).length,2);assert.equal(submits,2);assert.equal(JSON.parse(s.bytes).active.length,2);
 const reads=s.gets;const revoked=createGateway({tokens:[{id:'other',sha256:sha256('y'.repeat(43))}],master,backend,admission:s.admission()});
 assert.equal((await revoked({method:'POST',path:'/v1/runs',authorization:'Bearer '+token,body:input})).status,401);assert.equal(s.gets,reads);assert.equal(submits,2);
});
test('dispatch ambiguity and age do not release a possibly accepted job; duplicate identity cannot dispatch twice',async()=>{
 const s=server({...policy,global:1,perOwner:1}),a=s.admission(),j=job(1);let calls=0;
 const network=new Error('dispatch response lost');await assert.rejects(a.submit(j,async()=>{calls++;throw network;}),e=>e===network);
 assert.equal(JSON.parse(s.bytes).active.length,1);await a.reconcile({status:async()=>({status:'queued',expired:true})});
 await assert.rejects(s.admission().submit(job(2),async()=>assert.fail('expiry cannot free live slot')),e=>e.status===429);
 await assert.rejects(s.admission().submit(j,async()=>{calls++;}),e=>e.status===409);assert.equal(calls,1);
});
test('trusted terminal release checks every ownership/nonce/repository/workflow/revision join and is idempotent',async()=>{
 const s=server(),a=s.admission(),j=job(1);await a.submit(j,async()=>null);const reads=s.gets;
 for(const change of [{owner:'0'.repeat(32)},{nonce:'e'.repeat(32)},{repository:'foreign/repo'},{workflow:'other.yml'},{workerRevision:'c'.repeat(40)},{correlation:'e'.repeat(64)},{id:job(2).id},{runId:0}])assert.equal(await a.releaseTerminal(j,state(j,change)),false);
 assert.equal(s.gets,reads,'foreign proof refuses before ledger mutation');assert.equal(JSON.parse(s.bytes).active.length,1);
 assert.equal(await a.releaseTerminal(j,state(j)),true);const writes=s.writes;assert.equal(await a.releaseTerminal(j,state(j)),false);assert.equal(s.writes,writes);assert.equal(JSON.parse(s.bytes).active.length,0);
});
test('trusted terminal success/failure/cancellation reconciles; string-shaped or missing observations cannot',async()=>{
 for(const conclusion of ['success','failure','cancelled','timed_out']){
  const s=server(),a=s.admission(),j=job(1);await a.submit(j,async()=>null);
  await a.reconcile({status:async()=>({status:'completed',terminal:{...j,conclusion}})});assert.equal(JSON.parse(s.bytes).active.length,1);
  await a.reconcile({status:async()=>{throw Error('unknown run');}});assert.equal(JSON.parse(s.bytes).active.length,1);
  await a.reconcile({status:async()=>state(j,{conclusion})});assert.equal(JSON.parse(s.bytes).active.length,0);
 }
});
test('proved pre-dispatch refusal releases exact reservation; cleanup failure preserves primary and secondary errors',async()=>{
 const s=server(),a=s.admission(),j=job(1),refusal=beforeDispatchRefusal(new Error('preflight refused'));
 await assert.rejects(a.submit(j,async()=>{throw refusal;}),e=>e===refusal);assert.equal(JSON.parse(s.bytes).active.length,0);
 const s2=server(),b=s2.admission(),primary=beforeDispatchRefusal(new Error('original preflight refusal'));
 await assert.rejects(b.submit(job(2),async()=>{s2.failWrite=new Error('cleanup CAS failure');throw primary;}),e=>e===primary&&e.admissionCleanupError?.message==='cleanup CAS failure');
 assert.equal(JSON.parse(s2.bytes).active.length,1);
});
test('lost CAS acknowledgement before any dispatch cleans only our nonce and never submits',async()=>{
 const s=server();s.dropAck=true;let called=0;
 await assert.rejects(s.admission().submit(job(1),async()=>{called++;}),e=>e.message==='committed acknowledgement lost');
 assert.equal(called,0);assert.equal(JSON.parse(s.bytes).active.length,0);
});
test('cold gateway restart cannot reset accepted work, and missing/changed epoch policy never auto-initializes',async()=>{
 const s=server({...policy,global:1,perOwner:1});await s.admission().submit(job(1),async()=>null);
 await assert.rejects(s.admission().submit(job(2),async()=>assert.fail('restart reset capacity')),e=>e.status===429);
 const puts=s.puts;s.bytes=null;await assert.rejects(s.admission().submit(job(3),async()=>assert.fail('missing ledger cannot initialize')),e=>e.status===503);assert.equal(s.puts,puts);
 s.bytes=initialAdmissionDocument({master,...policy});const wrong=createAdmission({master,store:s.store(),...policy,epoch:'a-different-reviewed-epoch'});
 await assert.rejects(wrong.submit(job(4),async()=>assert.fail('epoch mismatch')),e=>e.status===503);assert.equal(s.puts,puts);
});
test('public/unauthorized/foreign and corrupted backing stores fail before dispatch or write',async()=>{
 for(const mode of ['public','no-write','foreign','corrupt','duplicate-keys','oversize']){
  const s=server();if(mode==='public')s.private=false;if(mode==='no-write')s.push=false;if(mode==='foreign')s.owner='other';if(mode==='corrupt')s.readBytes=Buffer.from('{bad');
  if(mode==='duplicate-keys')s.readBytes=Buffer.from(s.bytes.toString().replace('"revision":0','"revision":0,"revision":0'));
  if(mode==='oversize')s.readBytes=Buffer.alloc(16385,120);
  await assert.rejects(s.admission().submit(job(1),async()=>assert.fail(mode)),e=>e.status===503);assert.equal(s.puts,0,mode);
 }
});
test('persistent conflict exhaustion is finite and never dispatches or weakens quota',async()=>{
 const s=server();s.alwaysConflict=true;await assert.rejects(s.admission().submit(job(1),async()=>assert.fail('unadmitted dispatch')),e=>e.code==='admission-contention');
 assert.equal(s.puts,4);assert.equal(s.writes,0);assert.equal(JSON.parse(s.bytes).active.length,0);
});
test('returned admission records are detached/frozen and cannot mutate owner/bounds',async()=>{
 const s=server(),a=s.admission();await a.submit(job(1),async()=>null);const records=await a.acceptedJobs();assert.throws(()=>{records[0].owner='forged';},TypeError);records.length=0;assert.equal((await a.acceptedJobs()).length,1);
});
