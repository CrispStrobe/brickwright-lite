// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {executeQualification,qualificationStageIds} from '../scripts/lib/robot-lab-qualification-runner.mjs';
test('a failed stage stops subsequent work, retains its failure and cannot become an admission',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bw-model-harness-'));try{const calls=[];const r=await executeQualification(qualificationStageIds('full').map(id=>({id})),{directory:join(dir,'evidence'),identity:'same',execute:async s=>{calls.push(s.id);return{code:s.id==='native-motion-and-negatives'?1:0,log:s.id+'.log'};}});assert.deepEqual(calls,['catalogue','lessons-generated','registrations-lessons-search','construction','native-motion-and-negatives']);assert.equal(r.status,'FAIL');assert.equal(r.admitted,false);assert.equal(JSON.parse(readFileSync(join(dir,'evidence/qualification.json'))).steps.at(-1).status,'FAIL');await assert.rejects(()=>executeQualification([],{directory:join(dir,'evidence'),identity:'same',execute:async()=>({code:0})}),/EEXIST/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('partial evidence and changed identities fail closed; only the complete plan admits',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bw-model-harness-'));try{let calls=0;const execute=async()=>{calls++;return{code:0,log:'ok.log'};};
 const changed=await executeQualification(qualificationStageIds('full').map(id=>({id})),{directory:join(dir,'changed'),identity:'new',requiredIdentity:'old',execute});assert.equal(changed.status,'FAIL');assert.equal(calls,0);
 const partial=await executeQualification(qualificationStageIds('native').map(id=>({id})),{directory:join(dir,'partial'),identity:'same',mode:'native',execute});assert.equal(partial.status,'PARTIAL');assert.equal(partial.admitted,false);
 const full=await executeQualification(qualificationStageIds('full').map(id=>({id})),{directory:join(dir,'full'),identity:'same',execute});assert.equal(full.status,'PASS');assert.equal(full.admitted,true);assert.equal(full.steps.length,11);
 const empty=await executeQualification([],{directory:join(dir,'empty'),identity:'same',execute});assert.equal(empty.status,'FAIL');assert.equal(empty.admitted,false);
 const missing=await executeQualification(qualificationStageIds('full').filter(id=>id!=='construction').map(id=>({id})),{directory:join(dir,'missing'),identity:'same',execute});assert.equal(missing.status,'FAIL');assert.equal(missing.admitted,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
