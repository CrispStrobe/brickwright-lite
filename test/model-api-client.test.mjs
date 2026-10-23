// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

test('agent client submits explicit budgets and preserves the job before waiting for the result',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'model-api-client-')),token='T'.repeat(40);let submission,jobSavedBeforePoll=false,polls=0,submissions=0;
 const server=createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer '+token);
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;
   submissions++;submission=JSON.parse(body);res.statusCode=202;res.end(JSON.stringify({id:'signed-job-id',status:'queued'}));
  }else if(req.url.endsWith('/result'))res.end(JSON.stringify({status:'completed',qualification:{status:'not-evaluated'}}));
  else{jobSavedBeforePoll=JSON.parse(readFileSync(join(dir,'report.json.job.json'))).id==='signed-job-id';if(++polls===1){res.statusCode=404;res.end(JSON.stringify({error:{code:'not-found',message:'Initializing'}}));}else res.end(JSON.stringify({status:'completed'}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  writeFileSync(join(dir,'model.ldr'),'0 bounded test');writeFileSync(join(dir,'settings.json'),JSON.stringify({programMs:15000}));
  const run=()=>new Promise(resolve=>{const child=spawn(process.execPath,[new URL('../tools/model-api/client.mjs',import.meta.url).pathname,'--model='+join(dir,'model.ldr'),'--settings='+join(dir,'settings.json'),'--out='+join(dir,'report.json')],{env:{...process.env,MODEL_API_URL:'http://127.0.0.1:'+server.address().port+'/api/v1',MODEL_API_TOKEN:token},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('exit',code=>resolve({code,output}));});
  const first=await run();assert.equal(first.code,0,first.output);assert.equal(submission.settings.programMs,15000);assert.ok(jobSavedBeforePoll);assert.equal(submissions,1);assert.equal(polls,2);assert.equal(JSON.parse(readFileSync(join(dir,'report.json'))).qualification.status,'not-evaluated');assert.ok(!first.output.includes(token));
  const second=await run();assert.notEqual(second.code,0);assert.match(second.output,/Preserve existing reports/);
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
