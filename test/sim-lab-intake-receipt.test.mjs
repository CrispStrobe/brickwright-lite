// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
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
