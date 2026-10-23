// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {randomUUID} from 'node:crypto';import {ApiError,LIMITS,KINDS,validateSubmission} from './protocol.mjs';import {authenticate,ownerTag,seal,open,signJob,readJob} from './crypto.mjs';
export function createGateway({tokens,master,backend,now=Date.now}){
 if(!Array.isArray(tokens)||!tokens.length||!Buffer.isBuffer(master)||master.length!==32)throw new ApiError(503,'configuration','Service authentication is not configured');
 return async({method,path,authorization,body})=>{
  try{const owner=authenticate(authorization,tokens),tag=ownerTag(master,owner);
   if(method==='GET'&&path==='/v1/capabilities')return{status:200,body:{version:1,formats:['ldr','mpd','bw'],measurements:KINDS,limits:LIMITS,execution:'asynchronous GitHub Actions; fixed worker code',qualification:'not automatic library admission'}};
   if(method==='POST'&&path==='/v1/runs'){
    if(body===undefined)throw new ApiError(400,'invalid-json','A JSON submission is required');
    const raw=typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body);if(Buffer.byteLength(raw)>LIMITS.bodyBytes)throw new ApiError(413,'too-large','Submission exceeds body limit');let input;try{input=validateSubmission(typeof body==='object'&&!Buffer.isBuffer(body)?body:JSON.parse(raw));}catch(e){if(e instanceof SyntaxError)throw new ApiError(400,'invalid-json','Invalid JSON');throw e;}
    const job={id:randomUUID(),owner:tag,createdAt:now(),runId:null},envelope=seal(master,'request:'+job.id,{owner:tag,submission:{model:input.model,...(input.program?{program:input.program}:{}),settings:input.settings,measurements:input.measurements}});if(Buffer.byteLength(envelope)>LIMITS.compressedBytes)throw new ApiError(413,'compressed-too-large','Compressed submission exceeds the dispatch limit');
    job.runId=await backend.submit(job,envelope);const id=signJob(master,job);return{status:202,body:{id,status:'queued',statusUrl:'/api/v1/runs/'+id,resultUrl:'/api/v1/runs/'+id+'/result'}};
   }
   const match=/^\/v1\/runs\/([^/]+)(\/result)?$/.exec(path);if(method==='GET'&&match){const job=readJob(master,match[1],tag,now());if(match[2]){const envelope=await backend.result(job),report=open(master,'result:'+job.id,envelope,4*1024*1024);if(report.requestId!==job.id||report.owner!==tag)throw new ApiError(404,'not-found','Job result identity mismatch');return{status:200,body:report.report};}return{status:200,body:{id:match[1],...await backend.status(job)}};}
   throw new ApiError(404,'not-found','Endpoint not found');
  }catch(e){return{status:e instanceof ApiError?e.status:503,body:{error:{code:e instanceof ApiError?e.code:'service-unavailable',message:e instanceof ApiError?e.message:'Measurement service unavailable'}}};}
 };
}
