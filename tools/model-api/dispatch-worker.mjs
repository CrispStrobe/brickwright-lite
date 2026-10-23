#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Trusted controller. Production never falls back to a qualification key.
import {openSync,readSync,fstatSync,closeSync,writeFileSync,constants} from 'node:fs';
import {open,seal,sha256,masterFromHex} from './lib/crypto.mjs';
import {validateSubmission,submissionPayload,LIMITS,ApiError,object} from './lib/protocol.mjs';
import {UUID,REVISION,verifyDispatchTag} from './lib/job-identity.mjs';
const [requestedMode,...args]=process.argv.slice(2),qualification=requestedMode?.startsWith('qualification-');
const mode=qualification?requestedMode.slice('qualification-'.length):requestedMode;
if(!['prepare','seal'].includes(mode))throw Error('Unknown trusted controller operation');
if(qualification){
 if(process.env.GITHUB_EVENT_NAME!=='pull_request'||process.env.MODEL_API_QUALIFICATION_ONLY!=='1'||process.env.MODEL_API_MASTER_KEY)throw Error('Qualification controller context refused');
}else if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.MODEL_API_QUALIFICATION_ONLY||process.env.MODEL_API_QUALIFICATION_KEY)throw Error('Production controller context refused');
const master=masterFromHex(qualification?process.env.MODEL_API_QUALIFICATION_KEY:process.env.MODEL_API_MASTER_KEY);
const revision=qualification?process.env.MODEL_API_QUALIFICATION_SOURCE:process.env.GITHUB_SHA;
if(!REVISION.test(revision))throw Error('Missing actual worker source revision');
function boundedJson(path,limit){
 let fd,primary;
 try{
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const before=fstatSync(fd,{bigint:true});
  if(!before.isFile()||before.nlink!==1n||before.size>BigInt(limit))throw new ApiError(422,'worker-file-limit','Worker file exceeds its bound');
  const bytes=Buffer.alloc(Number(before.size));let at=0;
  while(at<bytes.length){const n=readSync(fd,bytes,at,bytes.length-at,null);if(!n)throw Error('Short worker file');at+=n;}
  if(readSync(fd,Buffer.alloc(1),0,1,null)!==0)throw Error('Growing worker file');
  const after=fstatSync(fd,{bigint:true});if(['dev','ino','size','mtimeNs','ctimeNs'].some(key=>before[key]!==after[key]))throw Error('Changing worker file');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }catch(error){primary=error;throw error;}finally{if(fd!==undefined){try{closeSync(fd);}catch(error){if(primary)primary.closeError=error;else throw error;}}}
}
function context(job){
 verifyDispatchTag(master,job);
 const repository=process.env.GITHUB_REPOSITORY,workflowRef=process.env.GITHUB_WORKFLOW_REF;
 if(typeof repository!=='string'||repository.toLowerCase()!==job.repository.toLowerCase()||job.workflow!=='model-measurements.yml'||
  typeof workflowRef!=='string'||!workflowRef.startsWith(repository+'/.github/workflows/'+job.workflow+'@')||job.workerRevision!==revision||
  !Number.isSafeInteger(job.createdAt)||job.createdAt<0||!/^[a-f0-9]{64}$/.test(job.inputSha256))throw Error('Worker request/source identity mismatch');
}
if(mode==='prepare'){
 const[eventPath,inputPath,metaPath]=args,event=boundedJson(eventPath,LIMITS.bodyBytes);object(event.inputs,['request_id','request_tag','envelope']);const id=event.inputs.request_id;
 if(!UUID.test(id)||typeof event.inputs?.envelope!=='string'||Buffer.byteLength(event.inputs.envelope)>LIMITS.compressedBytes||
  !/^[a-f0-9]{64}$/.test(event.inputs?.request_tag))throw Error('Invalid dispatch input');
 const payload=open(master,'request:'+id,event.inputs.envelope),job={id,owner:payload.owner,nonce:payload.nonce,createdAt:payload.createdAt,inputSha256:payload.inputSha256,
  repository:payload.repository,workflow:payload.workflow,workerRevision:payload.workerRevision,correlation:payload.correlation};
 context(job);if(job.correlation!==event.inputs.request_tag)throw Error('Dispatch correlation mismatch');
 const input=submissionPayload(validateSubmission(payload.submission)),bytes=Buffer.from(JSON.stringify(input));
 if(bytes.length>LIMITS.bodyBytes||sha256(bytes)!==job.inputSha256)throw Error('Normalized request identity mismatch');
 writeFileSync(inputPath,bytes,{flag:'wx',mode:0o600});writeFileSync(metaPath,JSON.stringify(job),{flag:'wx',mode:0o600});
}else{
 const[metaPath,reportPath,outputPath]=args,meta=boundedJson(metaPath,4096);context(meta);let report;
 try{
  report=boundedJson(reportPath,LIMITS.resultBytes-4096);
  if(!report||Array.isArray(report)||report.version!==1||!['completed','failed'].includes(report.status)||report.qualification?.status!=='not-evaluated'||
   (report.status==='completed'&&report.runtime?.revision!==meta.workerRevision))throw new ApiError(422,'worker-report-identity','Worker report source identity mismatch');
 }catch(error){report={version:1,status:'failed',error:{code:error instanceof ApiError?error.code:'worker-failed',message:'Bounded worker failed or produced an invalid report'},qualification:{status:'not-evaluated'}};}
 const envelope=seal(master,'result:'+meta.id,{requestId:meta.id,owner:meta.owner,nonce:meta.nonce,createdAt:meta.createdAt,inputSha256:meta.inputSha256,
  repository:meta.repository,workflow:meta.workflow,workerRevision:meta.workerRevision,correlation:meta.correlation,report})+'\n';
 if(Buffer.byteLength(envelope)>8*1024*1024)throw Error('Encrypted worker result exceeds its bound');
 writeFileSync(outputPath,envelope,{flag:'wx',mode:0o600});
}
