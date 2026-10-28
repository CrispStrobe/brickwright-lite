// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Development only. Hosted jobs use a credential-free Docker worker instead.
import {spawn,execFileSync} from 'node:child_process';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {ApiError,LIMITS} from './protocol.mjs';import {open,seal} from './crypto.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export function localBackend(master){const jobs=new Map();let active=0;return{
 async submit(job,envelope){if(active>=1)throw new ApiError(429,'busy','The local worker is busy');const payload=open(master,'request:'+job.id,envelope),state={status:'in_progress',result:null};if(payload.owner!==job.owner)throw Error('owner mismatch');jobs.set(job.id,state);active++;
  const dir=mkdtempSync(join(tmpdir(),'bw-model-job-')),input=join(dir,'input.json'),result=join(dir,'report.json');writeFileSync(input,JSON.stringify(payload.submission));
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()+(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()?'+dirty':''),child=spawn(process.execPath,['--import',resolve(root,'scripts/lib/register-gui-scope.mjs'),resolve(root,'tools/model-api/worker.mjs'),input,result],{cwd:root,detached:process.platform!=='win32',env:{PATH:process.env.PATH,TMPDIR:process.platform==='darwin'?'/private/tmp':tmpdir(),MODEL_API_RUNTIME_REVISION:revision},stdio:['ignore','ignore','ignore']});
  const kill=()=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGTERM');}catch{}};const timer=setTimeout(()=>{state.status='failed';state.result=seal(master,'result:'+job.id,{requestId:job.id,owner:job.owner,report:{status:'failed',error:{code:'wall-time-limit',message:'Worker wall-time budget exceeded'},qualification:{status:'not-evaluated'}}});kill();},LIMITS.wallMs);timer.unref();
  child.on('close',code=>{clearTimeout(timer);try{if(state.result===null){const report=JSON.parse(readFileSync(result,'utf8'));state.result=seal(master,'result:'+job.id,{requestId:job.id,owner:job.owner,report});state.status=code===0?'completed':'failed';}}catch{state.status='failed';state.result=seal(master,'result:'+job.id,{requestId:job.id,owner:job.owner,report:{status:'failed',error:{code:'worker-failed',message:'Worker did not produce a report'}}});}finally{active--;rmSync(dir,{recursive:true,force:true});}});
  child.on('error',()=>{state.status='failed';});return null;
 },
 async status(job){const r=jobs.get(job.id);if(!r)throw new ApiError(404,'not-found','Job not found');return{status:r.status};},
 async result(job){const r=jobs.get(job.id);if(!r)throw new ApiError(404,'not-found','Job not found');if(r.result===null)throw new ApiError(409,'not-ready','Job has not completed');return r.result;}
};}
