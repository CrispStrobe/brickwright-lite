// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';
import {judgeDynamicsRun} from '../scripts/lib/sim-lab-dynamics-judge.mjs';
const GUI=new URL('../overlay/scratch-gui/',import.meta.url);
const C=catalogFrom(JSON.parse(readFileSync(new URL('src/lib/bw-sim/part-meta/parts.json',GUI))));
for(const [id,count,time] of [['pulse-percussion',130,36000],['centrifugal-governor',34,48000]]){
 const text=readFileSync(new URL(`static/sim-lab/models/${id}.ldr`,GUI),'utf8');
 test(`${id}: connected pieces, clear colliders, complete instructions and original credit`,()=>{
  const {model,mechanism,issues}=prepareModel(text,C,{mat:'plain'});
  assert.deepEqual(issues,[]);assert.equal(model.parts.length,count);assert.equal(model.decor?.length||0,0);
  assert.deepEqual(mechanism.actuators.map(a=>a.port),['A']);
  for(const p of model.parts)assert.deepEqual(solidOverlaps(model,C,p),[],p.id);
  const plan=buildSteps(model,C);assert.ok(plan.steps.every(s=>!s.loose));
  for(const step of plan.steps) assert.ok(step.parts.length<=6,'manual pages contain at most six parts');
  assert.deepEqual(plan.steps.flatMap(s=>s.parts).sort(),model.parts.map(p=>p.id).sort());
  assert.match(text,/Author: CrispStrobe/);assert.match(text,/BSD-3-Clause/);
 });
 test(`${id}: 60% motor stress remains finite and upright`,async()=>{
  const {mechanism:m}=prepareModel(text,C,{mat:'plain'});const core=createPhysicsCore(await loadJolt(),m,{stepHz:200});
  const b=m.bodies.find(b=>b.parts.includes('hub')).id;
  try{
   for(let i=0;i<40;i++)core.step(.005);
   for(const a of m.actuators)core.setMotor(a.joint,{mode:'velocity',radPerSec:.6*a.maxSpeedRadPerSec});
   for(let i=0;i<400;i++){
    core.step(.005);const root=core.bodyPose(b);assert.ok(1-2*(root.rotation[0]**2+root.rotation[2]**2)>.985);
    for(const body of m.bodies.filter(x=>x.motion==='dynamic')){const p=core.bodyPose(body.id);assert.ok([...p.position,...p.rotation].every(Number.isFinite));assert.ok(Math.hypot(...p.position.map((x,i)=>x-root.position[i]))<.7);}
   }
   assert.ok(Math.abs(core.jointState(m.actuators[0].joint).angle)>10);
  }finally{core.destroy();}
 });
 test(`${id}: actual VM program produces the intended physical dynamics`,async t=>{
  const r=await runOnSimLab(readFileSync(new URL(`static/sim-lab/programs/${id}.bw`,GUI),'utf8'),{modelText:text,mat:'plain',timeLimitMs:time});
  const result={...r,unsupported:r.run.unsupported};t.diagnostic(JSON.stringify(judgeDynamicsRun(id,result)));
  const output=r.mechanism.bodies.find(b=>b.parts.includes(id==='pulse-percussion'?'beater0':'arm0')).id;
  const track=r.track.map(f=>({...f,bodies:{...f.bodies,[output]:r.track[0].bodies[output]}}));
  assert.throws(()=>judgeDynamicsRun(id,{...result,track}),id==='pulse-percussion'?/physical lift/:/physical arm radial motion/,'motor turns alone cannot replace output motion');
 });
}
