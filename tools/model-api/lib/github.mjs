// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {ApiError} from './protocol.mjs';
export function githubBackend({repository,workflow,ref,token,master,fetchImpl=fetch}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!/^[A-Za-z0-9_.-]+\.yml$/.test(workflow)||!ref||!token)throw new ApiError(503,'configuration','Worker configuration is incomplete');
 const root='https://api.github.com/repos/'+repository,headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'};
 const request=async(path,options={})=>{const r=await fetchImpl(root+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new ApiError(503,'worker-unavailable','GitHub worker request failed');return r;};
 const runFor=async job=>{
  let run;if(job.runId)run=await(await request('/actions/runs/'+job.runId)).json();
  else{const after=new Date(job.createdAt-60000).toISOString(),q=new URLSearchParams({event:'workflow_dispatch',branch:ref,per_page:'100',created:'>='+after}),page=await(await request('/actions/workflows/'+workflow+'/runs?'+q)).json();run=page.workflow_runs.find(r=>r.display_title==='model-measure:'+job.id);}
  if(!run)return null;
  if(run.event!=='workflow_dispatch'||run.path!=='.github/workflows/'+workflow)throw new ApiError(404,'not-found','Job not found');
  if(run.display_title!=='model-measure:'+job.id){
   // GitHub can expose the dispatch run ID before evaluating run-name. Do not
   // return an uncorrelated run; let the caller keep its existing queued job.
   if(run.status!=='completed'&&run.display_title==='Submitted model measurements'&&Date.now()-job.createdAt<60000)return null;
   throw new ApiError(404,'not-found','Job not found');
  }
  return run;
 };
 return{
  async submit(job,envelope){const r=await request('/actions/workflows/'+workflow+'/dispatches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref,inputs:{request_id:job.id,envelope}})});if(r.status===204)return null;const data=await r.json();return Number.isSafeInteger(data.workflow_run_id)?data.workflow_run_id:null;},
  async status(job){const run=await runFor(job);if(!run)return{status:'queued'};return{status:run.status==='completed'?(run.conclusion==='success'?'completed':'failed'):run.status,runId:run.id,conclusion:run.conclusion??null,workerWorkflowRevision:run.head_sha};},
  async result(job){const run=await runFor(job);if(!run||run.status!=='completed')throw new ApiError(409,'not-ready','Job has not completed');const data=await(await request('/actions/runs/'+run.id+'/artifacts?per_page=100')).json(),artifact=data.artifacts.find(a=>a.name==='model-measure-'+job.id&&!a.expired);if(!artifact)throw new ApiError(410,'result-unavailable','No retained measurement artifact');
   const first=await fetchImpl(root+'/actions/artifacts/'+artifact.id+'/zip',{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});let bytes;
   if(first.status===302){const url=new URL(first.headers.get('location'));if(url.protocol!=='https:'||!/(?:\.blob\.core\.windows\.net|\.actions\.githubusercontent\.com|\.githubusercontent\.com)$/.test(url.hostname))throw new ApiError(503,'worker-unavailable','Unexpected artifact location');const r=await fetchImpl(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new ApiError(503,'worker-unavailable','Artifact download failed');bytes=Buffer.from(await r.arrayBuffer());}
   else if(first.ok)bytes=Buffer.from(await first.arrayBuffer());else throw new ApiError(503,'worker-unavailable','Artifact download failed');
   if(bytes.length>8*1024*1024)throw new ApiError(503,'result-too-large','Artifact exceeds the result limit');const {default:JSZip}=await import('jszip'),zip=await JSZip.loadAsync(bytes,{checkCRC32:true}),entry=zip.file('result.enc');if(!entry)throw new ApiError(503,'invalid-result','Missing encrypted result');return entry.async('string');
  }
 };
}
