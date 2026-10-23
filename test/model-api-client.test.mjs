// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,readFileSync,renameSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

test('agent client submits explicit budgets and preserves the job before waiting for the result',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'model-api-client-')),token='T'.repeat(40);let submission,jobSavedBeforePoll=false,polls=0,submissions=0;
 const server=createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer '+token);
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;
   submissions++;submission=JSON.parse(body);res.statusCode=202;res.end(JSON.stringify({id:'signed-job-id',status:'queued'}));
  }else if(req.url.endsWith('/result'))res.end(JSON.stringify({status:'completed',input:{modelSha256:createHash('sha256').update(submission.model.text).digest('hex'),programSha256:null},qualification:{status:'not-evaluated'}}));
  else{jobSavedBeforePoll=JSON.parse(readFileSync(join(dir,'report.json.job.json'))).id==='signed-job-id';if(++polls===1){res.statusCode=404;res.end(JSON.stringify({error:{code:'not-found',message:'Initializing'}}));}else res.end(JSON.stringify({status:'completed'}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  writeFileSync(join(dir,'model.ldr'),'0 bounded test');writeFileSync(join(dir,'settings.json'),JSON.stringify({programMs:15000}));
  const run=(resume=false)=>new Promise(resolve=>{const child=spawn(process.execPath,[new URL('../tools/model-api/client.mjs',import.meta.url).pathname,...(resume?['--resume='+join(dir,'report.json.job.json'),'--out='+join(dir,'resumed.json')]:['--model='+join(dir,'model.ldr'),'--settings='+join(dir,'settings.json'),'--out='+join(dir,'report.json')])],{env:{...process.env,MODEL_API_URL:'http://127.0.0.1:'+server.address().port+'/api/v1',MODEL_API_TOKEN:token},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('exit',code=>resolve({code,output}));});
  const first=await run();assert.equal(first.code,0,first.output);assert.equal(submission.settings.programMs,15000);assert.ok(jobSavedBeforePoll);assert.equal(submissions,1);assert.equal(polls,2);assert.equal(JSON.parse(readFileSync(join(dir,'report.json'))).qualification.status,'not-evaluated');assert.ok(!first.output.includes(token));
  assert.equal(JSON.parse(readFileSync(join(dir,'report.json.input.json'))).model.text,submission.model.text);assert.ok(first.output.includes('"inputIdentityVerified":true'));
  const second=await run();assert.notEqual(second.code,0);assert.match(second.output,/Preserve existing reports/);
  writeFileSync(join(dir,'resumed.json.job.json'),JSON.stringify({id:'another-job'}));const mismatched=await run(true);assert.notEqual(mismatched.code,0);assert.match(mismatched.output,/another job/);renameSync(join(dir,'resumed.json.job.json'),join(dir,'rejected-receipt.json'));
  const receipt=readFileSync(join(dir,'report.json.job.json'),'utf8'),resumed=await run(true);assert.equal(resumed.code,0,resumed.output);assert.equal(submissions,1);assert.equal(readFileSync(join(dir,'report.json.job.json'),'utf8'),receipt);assert.equal(JSON.parse(readFileSync(join(dir,'resumed.json'))).status,'completed');
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
