// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {githubBackend} from '../tools/model-api/lib/github.mjs';
import {dispatchTag,TERMINAL,isBeforeDispatchRefusal} from '../tools/model-api/lib/job-identity.mjs';
import {createAdmission,initialAdmissionDocument} from '../tools/model-api/lib/admission.mjs';
import {gitBlobSha} from '../tools/model-api/lib/github-admission-store.mjs';
import {ARTIFACT_BYTES} from '../tools/model-api/lib/bounded-http.mjs';
const requireApi=createRequire(new URL('../tools/model-api/package.json',import.meta.url)),JSZip=requireApi('jszip'),master=Buffer.alloc(32,7),revision='a'.repeat(40),repository='owner/worker',workflow='model-measurements.yml';
const job=(extra={})=>{const j={id:'11111111-1111-4111-8111-111111111111',owner:'f'.repeat(32),nonce:'b'.repeat(32),createdAt:Date.now(),runId:123,repository,workflow,workerRevision:revision,...extra};return{...j,correlation:dispatchTag(master,j)};};
async function fixture(j=job()){
 const z=new JSZip();z.file('result.enc','owned encrypted bytes\n');const bytes=await z.generateAsync({type:'nodebuffer',compression:'DEFLATE',streamFiles:true});
 const s={bytes,calls:[],dispatches:0,dispatchStatus:200,dispatchError:null,tagRevision:revision,branchCollision:false,artifactSize:bytes.length,zipGets:0,opened:0,redirect:null,secondRedirect:false,
 run:{id:123,event:'workflow_dispatch',path:'.github/workflows/'+workflow,display_title:'model-measure:'+j.id+':'+j.correlation,status:'completed',conclusion:'success',head_sha:revision,repository:{full_name:repository},head_repository:{full_name:repository}}};
 s.fetch=async(input,options={})=>{
  const u=new URL(String(input));s.calls.push({url:u.href,options});
  if(u.hostname!=='api.github.com'){
   assert.equal(options.headers,undefined,'no credential reaches the artifact host');assert.equal(options.redirect,'error');
   return s.secondRedirect?new Response(null,{status:302,headers:{location:'https://unreviewed.invalid/file'}}):new Response(bytes,{headers:{'content-length':String(bytes.length)}});
  }
  assert.equal(options.headers.Authorization,'Bearer server-fixture-token');
  if(u.pathname.endsWith('/git/ref/tags/qualified-worker'))return Response.json({ref:'refs/tags/qualified-worker',object:{type:'commit',sha:s.tagRevision}});
  if(u.pathname.endsWith('/git/ref/heads/qualified-worker'))return s.branchCollision?Response.json({ref:'refs/heads/qualified-worker'}):new Response('missing',{status:404});
  if(u.pathname.endsWith('/dispatches')){s.dispatches++;if(s.dispatchError)throw s.dispatchError;if(s.moveAfterPost)s.run.head_sha='c'.repeat(40);return s.dispatchStatus===204?new Response(null,{status:204}):Response.json({workflow_run_id:123});}
  if(u.pathname.endsWith('/actions/runs/123'))return Response.json(s.run);
  if(u.pathname.endsWith('/workflows/'+workflow+'/runs'))return Response.json({workflow_runs:s.noRun?[]:[s.run]});
  if(u.pathname.endsWith('/actions/runs/123/artifacts'))return Response.json({artifacts:[{id:7,name:'model-measure-'+j.id,expired:false,size_in_bytes:s.artifactSize,workflow_run:{id:123,head_sha:s.run.head_sha}}]});
  if(u.pathname.endsWith('/actions/artifacts/7/zip')){
   s.zipGets++;assert.equal(options.redirect,'manual');if(s.redirect)return new Response(null,{status:302,headers:{location:s.redirect}});
   const response=new Response(bytes,{headers:{'content-length':String(s.declaredLength??bytes.length)}}),read=response.body.getReader.bind(response.body);response.body.getReader=(...args)=>{s.opened++;return read(...args);};response.arrayBuffer=()=>assert.fail('whole-body arrayBuffer is forbidden');return response;
  }
  throw Error('Unexpected fake route '+u.pathname);
 };
 s.backend=githubBackend({repository,workflow,ref:'qualified-worker',workerRevision:revision,token:'server-fixture-token',master,fetchImpl:s.fetch});return s;
}
function admission(){const options={epoch:'qualified-github-test-epoch',repository,workflow,global:2,perOwner:1};let bytes=initialAdmissionDocument({master,...options});return createAdmission({master,...options,store:{async read(){return{sha:gitBlobSha(bytes),bytes:Buffer.from(bytes)};},async write(sha,next){if(sha!==gitBlobSha(bytes))return false;bytes=Buffer.from(next);return true;}}});}

test('dispatch uses a reviewed tag name and bound correlation, preserving 200 and legacy204 replies',async()=>{
 for(const status of [200,204]){const j=job({runId:null}),s=await fixture(j);s.dispatchStatus=status;assert.equal(await s.backend.submit(j,'encrypted'),status===200?123:null);assert.equal(s.dispatches,1);const call=s.calls.find(x=>x.options.method==='POST'),body=JSON.parse(call.options.body);assert.equal(body.ref,'qualified-worker');assert.deepEqual(Object.keys(body.inputs).sort(),['envelope','request_id','request_tag']);assert.equal(body.inputs.request_tag,j.correlation);assert.equal(body.inputs.request_id,j.id);}
});
test('wrong/missing immutable tag or ambiguous branch is proved pre-dispatch refusal and releases capacity',async()=>{
 for(const mode of ['wrong','ambiguous']){const j=job({runId:null}),s=await fixture(j),a=admission();if(mode==='wrong')s.tagRevision='c'.repeat(40);else s.branchCollision=true;
  await assert.rejects(a.submit(j,()=>s.backend.submit(j,'encrypted')),isBeforeDispatchRefusal);assert.equal(s.dispatches,0);assert.equal((await a.acceptedJobs()).length,0);}
});
test('dispatch network uncertainty and mutable-ref worker mismatch never release a possibly accepted slot',async()=>{
 for(const mode of ['lost','moved']){const j=job({runId:null}),s=await fixture(j),a=admission();if(mode==='lost')s.dispatchError=new Error('response lost after acceptance');else s.moveAfterPost=true;
  if(mode==='lost')await assert.rejects(a.submit(j,()=>s.backend.submit(j,'encrypted')),e=>e===s.dispatchError&&!isBeforeDispatchRefusal(e));else assert.equal(await a.submit(j,()=>s.backend.submit(j,'encrypted')),123);
  if(mode==='lost')s.noRun=true;await a.reconcile(s.backend);assert.equal((await a.acceptedJobs()).length,1);assert.equal(s.dispatches,1);}
});
test('trusted terminal proof requires repository, workflow, nonce/owner correlation and actual worker revision',async()=>{
 const j=job(),s=await fixture(j),ok=await s.backend.status(j);assert.ok(ok[TERMINAL]);assert.equal(ok[TERMINAL].nonce,j.nonce);assert.equal(ok[TERMINAL].owner,j.owner);assert.equal(ok[TERMINAL].workerRevision,revision);assert.ok(!JSON.stringify(ok).includes(j.nonce));
 for(const change of [run=>{run.repository.full_name='other/repo';},run=>{run.head_repository.full_name='other/repo';},run=>{run.path='.github/workflows/other.yml';},run=>{run.event='push';},run=>{run.head_sha='c'.repeat(40);},run=>{run.display_title+='different';}]){const f=await fixture(j);change(f.run);await assert.rejects(f.backend.status(j),e=>e.status===404);}
 const context={deadline:Date.now()+20000,runs:new Map()};await s.backend.status(j,context);const foreign=job({nonce:'d'.repeat(32)});await assert.rejects(s.backend.status(foreign,context),e=>e.status===404,'cached terminal cannot cross nonce/owner identity');
});
test('initializing exact job remains queued and missing/expired runs never fabricate terminal release',async()=>{
 const j=job(),s=await fixture(j);s.run.status='queued';s.run.conclusion=null;s.run.display_title='Submitted model measurements';assert.deepEqual(await s.backend.status(j),{status:'queued'});s.run.status='completed';await assert.rejects(s.backend.status(j),e=>e.status===404);
 const unknown=job({runId:null}),f=await fixture(unknown);f.noRun=true;assert.deepEqual(await f.backend.status(unknown),{status:'queued'});
});
test('oversized metadata refuses archive retrieval; excessive declared bytes refuses its body before allocation',async()=>{
 const j=job(),s=await fixture(j);s.artifactSize=ARTIFACT_BYTES+1;await assert.rejects(s.backend.result(j),e=>e.code==='result-too-large');assert.equal(s.zipGets,0);assert.equal(s.opened,0);
 const f=await fixture(j);f.declaredLength=ARTIFACT_BYTES+1;await assert.rejects(f.backend.result(j),e=>e.code==='result-too-large');assert.equal(f.zipGets,1);assert.equal(f.opened,0);
});
test('bounded real archive returns exact bytes/newline and allowed redirects receive no credentials',async()=>{
 const j=job(),s=await fixture(j);assert.equal(await s.backend.result(j),'owned encrypted bytes\n');assert.equal(s.opened,1);
 const f=await fixture(j);f.redirect='https://fixture.blob.core.windows.net/original';assert.equal(await f.backend.result(j),'owned encrypted bytes\n');assert.equal(f.calls.filter(c=>new URL(c.url).hostname!=='api.github.com').length,1);
});
test('unreviewed redirect targets and secondary redirects cannot be followed',async()=>{
 for(const url of ['http://fixture.blob.core.windows.net/a','https://unreviewed.invalid/a','https://fixture.blob.core.windows.net:444/a','https://user:pass@fixture.blob.core.windows.net/a']){const s=await fixture();s.redirect=url;await assert.rejects(s.backend.result(job()),e=>e.status===503);assert.equal(s.calls.filter(c=>new URL(c.url).hostname!=='api.github.com').length,0);}
 const s=await fixture();s.redirect='https://fixture.blob.core.windows.net/a';s.secondRedirect=true;await assert.rejects(s.backend.result(job()),e=>e.status===503);assert.equal(s.calls.filter(c=>new URL(c.url).hostname!=='api.github.com').length,1);
});
