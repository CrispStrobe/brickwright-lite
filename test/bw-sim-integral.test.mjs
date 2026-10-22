// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeIntegral} from '../scripts/lib/sim-lab-integral-judge.mjs';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const base='overlay/scratch-gui/static/sim-lab/',source='test/fixtures/model-files/integral-source/';
const C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'))),text=read(base+'models/integral.ldr'),program=read(base+'programs/integral.bw');
test('Integral: exact original placements and operations, authored default/strict/import/save equivalence, connected manual',()=>{
 const provenance=JSON.parse(read(source+'provenance.json'));
 for(const[n,hash]of Object.entries(provenance.files))assert.equal(createHash('sha256').update(read(source+n)).digest('hex'),hash);
 assert.equal(text,read(source+'integral.ldr').replace('0 Author: OpenAI / ChatGPT, with reused modules by CrispStrobe','0 Author: CrispStrobe'));
 assert.equal(program,read(source+'integral.bw').replace('Copyright (c) 2026 OpenAI','Copyright (c) 2026 CrispStrobe'));
 const p=prepareModel(text,C),strict=prepareModel(text,C,{autoPorts:false}),original=prepareModel(read(source+'integral.ldr'),C,{autoPorts:false});
 assert.deepEqual(p.model.parts,original.model.parts);assert.deepEqual(p.mechanism,strict.mechanism);assert.deepEqual(p.mechanism,original.mechanism);
 const saved=serializeModel(p.model,{name:'integral.ldr'}),reopened=prepareModel(saved,C);
 assert.match(saved,/^0 Author: CrispStrobe$/m);
 assert.deepEqual(reopened.mechanism,prepareModel(saved,C,{autoPorts:false}).mechanism);
 assert.equal(p.model.parts.length,154);assert.deepEqual(p.mechanism.actuators.map(a=>a.port),['A','B']);
 const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,154);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
});
for(const autoPorts of [undefined,false])test(`Integral ${autoPorts===false?'strict':'ordinary'}: real VM signed friction drive, load and frozen-output refusal`,async t=>{
 const r=await runRobotLabProgram(program,{modelText:text,timeLimitMs:45000,autoPorts,observeFrame:({session,vm,prepared})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value]))),rolling:Object.fromEntries(prepared.mechanism.bodies.filter(b=>b.rollingResistance>0).map(b=>[b.id,session.core.rollingWheel(b.id)]))})});
 t.diagnostic(JSON.stringify(judgeIntegral('integral',r,{contact:true})));
 const frozen=structuredClone(r),wheel=r.mechanism.bodies.find(b=>b.parts.includes('outputWheel'));
 for(const f of frozen.track)f.bodies[wheel.id]=structuredClone(frozen.track[0].bodies[wheel.id]);
 assert.throws(()=>judgeIntegral('integral',frozen,{contact:true}),/signed radius/);
});
test('Integral: zero output friction removes sustained drive while physical contact remains',async t=>{
 const p=prepareModel(text,C,{mat:'plain'}),J=await loadJolt(),results=[];
 for(const friction of [1,0]){
  const m=structuredClone(p.mechanism),wheel=m.bodies.find(b=>b.parts.includes('outputWheel')),disc=m.bodies.find(b=>b.parts.includes('platter')),frame=m.bodies.find(b=>b.parts.includes('hub'));
  assert.equal(wheel.friction,1);wheel.friction=friction;
  const A=m.actuators.find(a=>a.port==='A'),B=m.actuators.find(a=>a.port==='B'),core=createPhysicsCore(J,m,{stepHz:200,recordContacts:true});
  let ds=0,ws=0,n=0,contacts;
  try{
   core.setMotor(A.joint,{mode:'position',rad:0});core.setMotor(B.joint,{mode:'position',rad:0});
   for(let i=0;i<=2000;i++){
    if(i===200)core.setMotor(B.joint,{mode:'position',rad:4.666666666666667*B.sign,radPerSec:2*Math.PI/3});
    if(i===800)core.setMotor(A.joint,{mode:'velocity',radPerSec:Math.PI*A.sign});
    if(i>=1000&&i%10===0){const f=core.bodyAngularVelocity(frame.id);ds+=core.bodyAngularVelocity(disc.id)[1]-f[1];ws+=core.bodyAngularVelocity(wheel.id)[2]-f[2];n++;}
    if(i<2000)core.step(.005);
   }
   contacts=core.contactPairs().pairs[[disc.id,wheel.id].sort().join('|')]||0;
  }finally{core.destroy();}
  results.push({friction,ratio:ws/ds,discSpeed:ds/n,contacts});
 }
 t.diagnostic(JSON.stringify(results));
 assert.ok(results.every(r=>r.discSpeed>.5&&r.contacts>0),'both cases retain turning platter and real contact');
 assert.ok(results[0].ratio>.8&&Math.abs(results[1].ratio)<.1,'zero friction removes sustained rolling response');
});
