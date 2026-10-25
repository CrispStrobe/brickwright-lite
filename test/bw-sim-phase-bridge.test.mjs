// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {buildSteps,STEP_MAX} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgePhaseBridge} from '../scripts/lib/sim-lab-phase-bridge-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),base='overlay/scratch-gui/static/sim-lab/';
const C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
for(const id of ['phase-bridge','phase-bridge-misphased']){
 const source=read(base+'models/'+id+'.ldr');
 test(`${id}: original connected geometry, two crosses, native port and complete instructions`,()=>{
  const p=prepareModel(source,C,{mat:'plain'});assert.deepEqual(p.issues,[]);assert.equal(p.model.parts.length,144);assert.equal(p.model.decor?.length||0,0);assert.deepEqual(p.mechanism.actuators.map(a=>a.port),['A']);
  assert.equal(p.mechanism.couplings.filter(c=>c.kind==='universalJoint').length,2);
  const original=parseModel(read(`test/fixtures/model-files/phase-bridge-source/${id}.ldr`),{catalog:C}).model;
  assert.deepEqual(p.model.parts,JSON.parse(JSON.stringify(original.parts)));assert.match(source,/Author: CrispStrobe/);assert.match(source,/BSD-3-Clause/);
  for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);
  const plan=buildSteps(p.model,C);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=STEP_MAX));assert.deepEqual(plan.steps.flatMap(s=>s.parts).sort(),p.model.parts.map(p=>p.id).sort());
  for(const text of [serializeModel(p.model),`0 FILE root.mpd\n${source}\n0 NOFILE\n`])assert.deepEqual(parseModel(text,{catalog:C}).model.parts,p.model.parts);
 });
 test(`${id}: 60 percent motor stress keeps the real shafts and frame together`,async()=>{
  const {mechanism:m}=prepareModel(source,C,{mat:'plain'}),core=createPhysicsCore(await loadJolt(),m,{stepHz:200});
  const a=m.actuators[0],base=m.bodies.find(b=>b.parts.includes('hub'));
  try{
   core.setMotor(a.joint,{mode:'velocity',radPerSec:.6*a.maxSpeedRadPerSec});
   for(let i=0;i<440;i++){core.step(.005);const p=core.bodyPose(base.id);assert.ok(1-2*(p.rotation[0]**2+p.rotation[2]**2)>.995);
    for(const b of m.bodies.filter(b=>b.motion==='dynamic')){const q=core.bodyPose(b.id);assert.ok([...q.position,...q.rotation].every(Number.isFinite));assert.ok(Math.hypot(...q.position.map((v,k)=>v-p.position[k]))<.4);}
   }
   assert.ok(core.jointState(a.joint).angle>5,'motor turns at the stress speed');
  }finally{core.destroy();}
 });
 for(const program of ['phase-bridge','phase-bridge-steps'])test(`${id}/${program}: native VM drives measured Cardan motion; frozen output rejected`,async t=>{
  const r=await runRobotLabProgram(read(base+'programs/'+program+'.bw'),{modelText:source,timeLimitMs:45000});assert.ok(r.finishedAt);t.diagnostic(JSON.stringify(judgePhaseBridge(id,r)));
  const out=r.mechanism.bodies.find(b=>b.parts.includes('output_axle')).id;
  const track=r.track.map(f=>({...f,bodies:{...f.bodies,[out]:r.track[0].bodies[out]}}));assert.throws(()=>judgePhaseBridge(id,{...r,track}),/physical output follows/);
 });
}
