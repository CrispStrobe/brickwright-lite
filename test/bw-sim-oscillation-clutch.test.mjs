// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {buildSteps,STEP_MAX} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';
import {judgeOscillationClutchRun} from '../scripts/lib/sim-lab-oscillation-clutch-judge.mjs';
const GUI=new URL('../overlay/scratch-gui/',import.meta.url);
const C=catalogFrom(JSON.parse(readFileSync(new URL('src/lib/bw-sim/part-meta/parts.json',GUI))));
for(const [id,pieces,ports,time] of [['pendulum-array',54,['A'],24000],['clutch-bench',26,['A','B'],16000]]){
 const text=readFileSync(new URL(`static/sim-lab/models/${id}.ldr`,GUI),'utf8');
 test(`${id}: original connected assembly, clear pieces and complete bounded instructions`,()=>{
  const {model,mechanism,issues}=prepareModel(text,C,{mat:'plain'});assert.deepEqual(issues,[]);
  assert.equal(model.parts.length,pieces);assert.equal(model.decor?.length||0,0);assert.deepEqual(mechanism.actuators.map(a=>a.port),ports);
  for(const p of model.parts)assert.deepEqual(solidOverlaps(model,C,p),[],p.id);
  const plan=buildSteps(model,C);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=STEP_MAX));
  assert.deepEqual(plan.steps.flatMap(s=>s.parts).sort(),model.parts.map(p=>p.id).sort());
  assert.match(text,/Author: CrispStrobe/);assert.match(text,/BSD-3-Clause/);
 });
 test(`${id}: each motor withstands 60% in either direction without flinging or tipping`,async()=>{
  const {mechanism:m}=prepareModel(text,C,{mat:'plain'}),J=await loadJolt();const hub=m.bodies.find(b=>b.parts.includes('hub')).id;
  for(const a of m.actuators)for(const sign of [-1,1]){
   const core=createPhysicsCore(J,m,{stepHz:200});
   try{
    for(let i=0;i<40;i++)core.step(.005);core.setMotor(a.joint,{mode:'velocity',radPerSec:sign*.6*a.maxSpeedRadPerSec});
    for(let i=0;i<400;i++){
     core.step(.005);const p=core.bodyPose(hub);assert.ok(1-2*(p.rotation[0]**2+p.rotation[2]**2)>.985,'upright chassis');
     for(const b of m.bodies.filter(b=>b.motion==='dynamic')){const q=core.bodyPose(b.id);assert.ok([...q.position,...q.rotation].every(Number.isFinite));assert.ok(Math.hypot(...q.position.map((x,i)=>x-p.position[i]))<.8);}
    }
    assert.ok(Math.abs(core.jointState(a.joint).angle)>8,'motor physically turns');
   }finally{core.destroy();}
  }
 });
 test(`${id}: native VM program produces measured physical output and rejects a frozen output`,async t=>{
  const r=await runOnSimLab(readFileSync(new URL(`static/sim-lab/programs/${id}.bw`,GUI),'utf8'),{modelText:text,mat:'plain',timeLimitMs:time});
  const result={...r,unsupported:r.run.unsupported};t.diagnostic(JSON.stringify(judgeOscillationClutchRun(id,result)));
  const output=r.mechanism.bodies.find(b=>b.parts.includes(id==='pendulum-array'?'arm0':'outputGear')).id;
  const track=r.track.map(f=>({...f,bodies:{...f.bodies,[output]:r.track[0].bodies[output]}}));
  assert.throws(()=>judgeOscillationClutchRun(id,{...result,track}),id==='pendulum-array'?/physical pendulum/:/output pose and encoder agree/);
 });
}
