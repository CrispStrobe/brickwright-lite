// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {buildSteps,STEP_MAX} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';
import {judgeArmLiftRun} from '../scripts/lib/sim-lab-arm-lift-judge.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
for(const [id,pieces,hash]of [['atlas-arm',237,'ffd577c3ceef64c462cb4b0769003b13adf711a765bff0f5f9e6e3766e367b16'],['switchback-lift',341,'534868be6444c0d47c98e3ca3defe441e7f91272605b9c2ed76c60b231053647']]){
 const text=read(`overlay/scratch-gui/static/sim-lab/models/${id}.ldr`);
 test(`${id}: clear assembly, complete instructions and exact original fixture`,()=>{
  const {model,mechanism,issues}=prepareModel(text,C,{mat:'plain'});assert.equal(model.parts.length,pieces);assert.equal(model.decor?.length||0,0);
  assert.equal(issues.length,id==='atlas-arm'?6:7);assert.ok(issues.every(i=>i.code==='locked-hinges'));
  assert.deepEqual(mechanism.actuators.map(a=>a.port).sort(),['A','B','D']);for(const p of model.parts)assert.deepEqual(solidOverlaps(model,C,p),[],p.id);
  const original=readFileSync(new URL(`test/fixtures/model-files/${id}-source/original.ldr`,root));assert.equal(createHash('sha256').update(original).digest('hex'),hash);
  const plan=buildSteps(model,C);assert.ok(plan.steps.every(s=>s.parts.length<=STEP_MAX));
  assert.ok(plan.steps.filter(s=>s.loose).every(s=>s.parts.every(id=>model.parts.find(p=>p.id===id).load)),'only declared payload may be unattached');
  assert.deepEqual(plan.steps.flatMap(s=>s.parts).sort(),model.parts.map(p=>p.id).sort());assert.match(text,/Author: CrispStrobe/);assert.match(text,/BSD-3-Clause/);
 });
 test(`${id}: native three-motor program moves real output and returns; frozen output fails`,async t=>{
  const r=await runOnSimLab(read(`overlay/scratch-gui/static/sim-lab/programs/${id}.bw`),{modelText:text,mat:'plain',timeLimitMs:30000});
  const result={...r,unsupported:r.run.unsupported};t.diagnostic(JSON.stringify(judgeArmLiftRun(id,result)));
  const output=r.mechanism.bodies.find(b=>b.parts.includes(id==='atlas-arm'?'p167':'p340')).id;
  const track=r.track.map(f=>({...f,bodies:{...f.bodies,[output]:r.track[0].bodies[output]}}));
  assert.throws(()=>judgeArmLiftRun(id,{...result,track}),id==='atlas-arm'?/physical motor pose|physical worm output/:/free ball rises|physical ball traverses/);
 });
 test(`${id}: every motor at 60% both ways stays finite, together and upright`,async t=>{
  const {mechanism:m}=prepareModel(text,C,{mat:'plain'}),J=await loadJolt(),hub=m.bodies.find(b=>b.parts.includes('hub')).id;
  for(const a of m.actuators)for(const sign of [-1,1]){const core=createPhysicsCore(J,m,{stepHz:200});try{
   for(const motor of m.actuators)core.setMotor(motor.joint,{mode:'position',rad:0});
   for(let i=0;i<40;i++)core.step(.005);core.setMotor(a.joint,{mode:'velocity',radPerSec:sign*.6*a.maxSpeedRadPerSec});
   for(let i=0;i<400;i++){core.step(.005);const p=core.bodyPose(hub);assert.ok(1-2*(p.rotation[0]**2+p.rotation[2]**2)>.985,'upright base');
    for(const b of m.bodies.filter(b=>b.motion==='dynamic')){const q=core.bodyPose(b.id);assert.ok([...q.position,...q.rotation].every(Number.isFinite));assert.ok(Math.hypot(...q.position.map((x,i)=>x-p.position[i]))<.8,'nothing flung');}}
   t.diagnostic(JSON.stringify({port:a.port,sign,state:core.jointState(a.joint),sliders:m.joints.filter(j=>j.type==='slider').map(j=>core.jointState(j.id))}));
   if(id==='switchback-lift'&&a.port==='A'&&sign>0){
    const state=core.jointState(a.joint),s=m.joints.find(j=>j.type==='slider');
    assert.ok(Math.abs(state.velocity)<.002,'downward drive stalls at the molded lower stop');
    assert.ok(Math.abs(core.jointState(s.id).position)<.0003,'lower stop holds carriage at its datum');
   }else assert.ok(Math.abs(core.jointState(a.joint).angle)>.03,`${a.port} physically responds`);
  }finally{core.destroy();}}
 });
}
test('LOAD survives flat and nested MPD round trips and cannot conceal structural detachment or a hub',()=>{
 const text=read('overlay/scratch-gui/static/sim-lab/models/switchback-lift.ldr');
 const {model}=parseModel(text,{catalog:C});assert.deepEqual(model.parts.filter(p=>p.load).map(p=>p.id),['p340']);
 for(const source of [serializeModel(model),`0 FILE root.mpd\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr\n0 FILE child.ldr\n${text}\n0 NOFILE\n`]){
  const p=prepareModel(source,C);assert.deepEqual(p.model.parts.filter(p=>p.load).map(p=>p.id),['p340']);assert.ok(!p.issues.some(i=>i.code==='loose-part'));}
 const hub=model.parts.find(p=>p.id==='hub');hub.load=true;
 const rejected=prepareModel(serializeModel(model),C);assert.ok(rejected.issues.some(i=>i.code==='bad-load'&&i.parts.includes('hub')));
 const beam=model.parts.find(p=>p.id==='p1');beam.load=true;
 assert.ok(prepareModel(serializeModel(model),C).issues.some(i=>i.code==='bad-load'&&i.parts.includes('p1')));
 const ball=model.parts.find(p=>p.id==='p340');delete ball.load;
 assert.ok(prepareModel(serializeModel(model),C).issues.some(i=>i.code==='loose-part'&&i.parts.includes('p340')),'undeclared loose part still warns');
});

test('a rack guide admits its matching slide and refuses lateral or angular misalignment',()=>{
 const source=parseModel(read('overlay/scratch-gui/static/sim-lab/models/switchback-lift.ldr'),{catalog:C}).model;
 const model={...source,parts:source.parts.filter(p=>['p57','p58'].includes(p.id))};delete model.steps;delete model.groups;
 assert.equal(prepareModel(serializeModel(model),C).mechanism.joints.filter(j=>j.type==='slider').length,1);
 const rack=model.parts.find(p=>p.id==='p58');rack.position=[rack.position[0]+5,...rack.position.slice(1)];
 assert.equal(prepareModel(serializeModel(model),C).mechanism.joints.filter(j=>j.type==='slider').length,0);
 rack.position[0]-=5;rack.rotation=[1,0,0,0,1,0,0,0,1];
 assert.equal(prepareModel(serializeModel(model),C).mechanism.joints.filter(j=>j.type==='slider').length,0);
});
