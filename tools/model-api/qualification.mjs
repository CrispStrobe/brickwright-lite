#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Fixed public fixture only. This manufactured key has no production authority.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {seal,open,sha256} from './lib/crypto.mjs';
import {dispatchTag,REVISION} from './lib/job-identity.mjs';
import {validateSubmission,submissionPayload} from './lib/protocol.mjs';
const key=Buffer.from(sha256('brickwright-public-model-worker-qualification-only-v1'),'hex');
const[mode,dir]=process.argv.slice(2),revision=process.env.MODEL_API_QUALIFICATION_SOURCE;
assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request');assert.equal(process.env.MODEL_API_QUALIFICATION_ONLY,'1');assert.ok(REVISION.test(revision));
assert.equal(process.env.MODEL_API_MASTER_KEY,undefined);
const git=(...args)=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),revision,'actual checkout must equal qualified source');
const write=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
const read=name=>JSON.parse(readFileSync(join(dir,name),'utf8'));
if(mode==='prepare'){
 mkdirSync(dir,{recursive:true});
 const model=readFileSync('overlay/scratch-gui/static/sim-lab/models/sine-shuttle.ldr','utf8');
 const input=submissionPayload(validateSubmission({model:{name:'sine-shuttle.ldr',text:model},program:{name:'fixed-qualification.bw',text:'DEVICE SPIKE\nWHEN flag clicked:\n  lab run motor A for 360 degrees at 90 degrees per second\n  lab stop motor A hold\n'},settings:{programMs:7000,coldMs:250,afterMs:250,sampleMs:25},measurements:[{id:'angle',kind:'jointAngle',port:'A'},{id:'mass',kind:'mass',targets:['hub']}]}));
 const job={id:'12345678-1234-4123-8123-123456789abc',owner:'1'.repeat(32),nonce:sha256(revision).slice(0,32),createdAt:Date.now(),inputSha256:sha256(JSON.stringify(input)),repository:process.env.GITHUB_REPOSITORY,workflow:'model-measurements.yml',workerRevision:revision};
 job.correlation=dispatchTag(key,job);
 write('event.json',{inputs:{request_id:job.id,request_tag:job.correlation,envelope:seal(key,'request:'+job.id,{...job,submission:input})}});
 write('expected.json',{...job,modelSha256:sha256(model),programSha256:sha256(input.program.text)});
 const paths=git('ls-files','tools/model-api','test/model-api-*.test.mjs','test/helpers/robot-lab-direct-vm.mjs','scripts/lib/gui-scope-allowed.json','overlay/scratch-gui/src/lib/bw-sim','overlay/scratch-gui/static/sim-lab/models','.github/workflows/model-measurements.yml').split('\n').filter(Boolean);
 write('source.json',{version:1,source:revision,tree:git('rev-parse','HEAD^{tree}'),eventSha:process.env.GITHUB_SHA,event:process.env.GITHUB_EVENT_NAME,repository:job.repository,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,files:Object.fromEntries(paths.map(path=>[path,sha256(readFileSync(path))]))});
}else if(mode==='verify'){
 const expected=read('expected.json'),bytes=readFileSync(join(dir,'result.enc'));assert.equal(bytes.at(-1),10);assert.ok(bytes.length<=8*1024*1024);
 const result=open(key,'result:'+expected.id,bytes.toString('utf8').trimEnd());
 assert.equal(result.requestId,expected.id);for(const field of ['owner','nonce','createdAt','inputSha256','repository','workflow','workerRevision','correlation'])assert.equal(result[field],expected[field]);
 const r=result.report;assert.equal(r.status,'completed');assert.equal(r.runtime.revision,revision);assert.equal(r.runtime.engine,'Jolt');assert.equal(r.runtime.vmFrameMs,25);assert.equal(r.runtime.physicsStepMs,5);assert.equal(r.input.modelSha256,expected.modelSha256);assert.equal(r.input.programSha256,expected.programSha256);assert.equal(r.qualification.status,'not-evaluated');assert.equal(r.completion.programFinished,true);assert.ok(r.samples.length>100);assert.ok(r.summary[0].span>350);assert.ok(r.summary[1].min>0);assert.equal(r.construction.overlapCount,0);
 const source=read('source.json');for(const[path,hash]of Object.entries(source.files))assert.equal(sha256(readFileSync(path)),hash,'source changed: '+path);
 write('qualification.json',{version:1,boundary:'Fixed public-model Docker/Jolt worker and encrypted artifact; no installed firmware, private ledger or deployed API acceptance',source:revision,tree:source.tree,inputSha256:expected.inputSha256,reportSha256:sha256(JSON.stringify(r)),resultSha256:sha256(bytes),resultBytes:bytes.length,samples:r.samples.length,status:'passed'});
}else throw Error('Unknown qualification operation');
