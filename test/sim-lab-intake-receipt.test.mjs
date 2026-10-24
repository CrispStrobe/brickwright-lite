// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import vm from 'node:vm';
import {continueCompletedIntake} from '../scripts/lib/sim-lab-intake-continuation.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {writeIntakeReceipt,readIntakeReceipt,validateIntakeReceipt,intakeIdentity} from '../scripts/lib/sim-lab-intake-receipt.mjs';

test('each physical comparison binds its own model and the actual shared primary program',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'intake-identity-'));
 try{
  writeFileSync(resolve(dir,'brickwright-build.json'),'{"commit":"fixture"}');
  for(const primary of ['cascade','rise-ratio','wavemaker','cable-compass']){
   const a=intakeIdentity(primary,dir),b=intakeIdentity(primary+'-control',dir);
   assert.equal(a.source,b.source);assert.equal(a.frontend,b.frontend);
   assert.equal(a.program,b.program,'comparison uses registered shared program');
   assert.notEqual(a.model,b.model,'comparison still binds its distinct physical geometry');
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('partition reopens the exact exported saved-state project and refuses stale or corrupted evidence',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'intake-receipt-'));
 try{
  const id='atlas-six',path=resolve(dir,id+'-intake.json'),project=resolve(dir,id+'.sb3');
  const bytes=Buffer.from('actual project fixture bytes');writeFileSync(project,bytes);
  const identity={source:'a'.repeat(40),frontend:'b'.repeat(64),model:'c'.repeat(64),program:'d'.repeat(64)};
  const record={ldraw:'0 Author: CrispStrobe\n',variables:{targetA:100}};
  const expected=[{id:'hub'}],program=[{name:'Stage',operations:[['robotlab_runMotorDegrees',1]]}];
  writeIntakeReceipt(path,{id,identity,project,record,expected,program});
  const r=readIntakeReceipt(path,{id,identity});assert.deepEqual(r.record,record);assert.deepEqual(r.program,program);assert.equal(r.project,project);
  for(const field of Object.keys(identity))assert.throws(()=>readIntakeReceipt(path,{id,identity:{...identity,[field]:'wrong'}}),/same source/);
  assert.throws(()=>readIntakeReceipt(path,{id:'oblique',identity}),/original project basename/);
  writeFileSync(project,Buffer.from('different SB3'));assert.throws(()=>readIntakeReceipt(path,{id,identity}),/original exported project bytes/);writeFileSync(project,bytes);
  const original=JSON.parse(readFileSync(path,'utf8'));
  for(const mutate of [r=>r.record.variables.targetA=0,r=>r.expected.push({id:'extra'}),r=>r.program[0].operations[0][1]++]){
   const changed=structuredClone(original);mutate(changed);assert.throws(()=>validateIntakeReceipt(changed,{id,identity,projectBytes:bytes}),/saved state intact/);
  }
  assert.throws(()=>readIntakeReceipt(resolve(dir,'missing.json'),{id,identity}),/ENOENT/);
  assert.throws(()=>validateIntakeReceipt({...original,schema:2},{id,identity,projectBytes:bytes}),/supported intake receipt/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});


function continuationScene(status='paused') {
 const calls=[],runtime={threads:[],targets:[{variables:{completed:{name:'completed',value:1},failed:{name:'failed',value:0}}}]};
 const pane={props:{vm:{runtime}},session:{time:2000},hub:{motors:{_controllers:[{mode:'hold'}]}}};
 const record={start:0,finishedAt:null},window={__bwIntakeReopened:record};
 window.__bwSimLab={status,_pane:pane,api:{start:async()=>{calls.push('start');window.__bwSimLab.status='running';return{ok:true};}}};
 window.__bwCaptureIntakeReopened=()=>{calls.push('capture');record.finishedAt=pane.session.time;};
 return {window,calls,runtime,pane,record,run:()=>vm.runInNewContext('('+continueCompletedIntake.toString()+')()', {window})};
}
test('a completed paused program resumes only physics after an actual completion snapshot',async()=>{
 const s=continuationScene();const result=await s.run();assert.deepEqual(s.calls,['capture','start']);
 assert.equal(result.resumedPhysics,true);assert.equal(result.finishedAt,2000);assert.equal(s.pane.session.time,2000,'no invented advancement');
 assert.equal(s.runtime.targets[0].variables.completed.value,1);assert.equal(s.pane.hub.motors._controllers[0].mode,'hold');
});
test('a running completed scene needs a snapshot and no extra start command',async()=>{
 const s=continuationScene('running');s.runtime.threads=[{status:4}];const result=await s.run();assert.deepEqual(s.calls,['capture']);assert.equal(result.resumedPhysics,false);
});
test('an unfinished program or unavailable scene cannot be resumed as a completed experiment',async()=>{
 for(const status of ['paused','running']){const s=continuationScene(status);s.runtime.threads=[{status:1}];await assert.rejects(s.run(),/before the saved program finishes/);assert.deepEqual(s.calls,[]);}
 for(const status of ['ready','loading','failed']){const s=continuationScene(status);await assert.rejects(s.run(),/No completed/);assert.deepEqual(s.calls,[]);}
});
test('continuation refuses a missing completion boundary or refused start',async()=>{
 const s=continuationScene();s.window.__bwCaptureIntakeReopened=()=>{};await assert.rejects(s.run(),/completion snapshot/);assert.deepEqual(s.calls,[]);
 const t=continuationScene();t.window.__bwSimLab.api.start=async()=>({ok:false});await assert.rejects(t.run(),/continuation was refused/);
});
test('continuation detects accidental programme restart, state reset and motor command changes',async()=>{
 for(const change of [s=>s.runtime.threads.push({status:1}),s=>s.runtime.targets[0].variables.completed.value=0,s=>s.pane.hub.motors._controllers[0].mode='speed']){
  const s=continuationScene();s.window.__bwSimLab.api.start=async()=>{change(s);return{ok:true};};await assert.rejects(s.run(),/restarted a program or changed its commands/);
 }
});
