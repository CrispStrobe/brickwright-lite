// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {buildSimScene} from '../overlay/scratch-gui/src/lib/bw-sim/view/sim-scene3d.js';
import {parseLDConfig} from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {judgeSarrusLift} from '../scripts/lib/sim-lab-sarrus-lift-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),base='overlay/scratch-gui/static/sim-lab/',source=read(base+'models/sarrus-lift.ldr'),C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
test('Sarrus: 144 physical parts, one motor, connected instructions and clearance under the deck',()=>{
 const p=prepareModel(source,C);assert.equal(p.model.parts.length,144);assert.ok(p.issues.every(i=>i.code==='locked-hinges'));assert.equal(p.mechanism.actuators.length,1);for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,144);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
});
test('Sarrus: native worm drive lifts the physical deck, keeps the spatial loop closed and returns home',async t=>{
 const r=await runRobotLabProgram(read(base+'programs/sarrus-lift.bw'),{modelText:source,timeLimitMs:45000});assert.ok(r.finishedAt>25000&&r.finishedAt<45000);judgeSarrusLift('sarrus-lift',r);
 // The floor texture must stay below the real thin plate throughout the lift.
 const reader=part=>{try{return read('overlay/scratch-gui/static/ldraw/'+part);}catch{return undefined;}},built=buildSimScene({model:prepareModel(source,C,{mat:'plain'}).runModel,mechanism:r.mechanism,read:reader,colors:parseLDConfig(read('overlay/scratch-gui/static/ldraw/LDConfig.ldr')),catalog:C});
 try{const body=r.mechanism.bodies.find(b=>b.parts.includes('baseplate')),mesh=built.partMeshes.get('baseplate'),group=built.bodyGroups.get(body.id);let clearance=Infinity;
  assert.ok(built.matMesh,'the plain mat is drawn');
  assert.equal(built.matMesh.position.y,r.mechanism.bodies.find(b=>b.id==='ground').position[1]+.01,'paint stays on the physical floor');
  assert.ok(built.ground.material.polygonOffsetFactor>built.matMesh.material.polygonOffsetFactor,'floor layers are ordered in depth, not raised through parts');
  for(const f of r.track){const pose=f.bodies[body.id];group.position.set(...pose.position);group.quaternion.set(...pose.rotation);built.scene.updateMatrixWorld(true);
   for(const x of [-316,316])for(const z of [-316,316]){const point=mesh.localToWorld(mesh.position.clone().set(x*.0004,0,z*.0004));clearance=Math.min(clearance,point.y-built.matMesh.position.y);}}
  assert.ok(clearance>.000001,'plain mat must not cut into the baseplate: minimum clearance '+clearance*1000+' mm');
  t.diagnostic('Minimum moving baseplate clearance above painted floor: '+clearance*1000+' mm');
 }finally{built.dispose();}

 const frozen=structuredClone(r),deck=r.mechanism.bodies.find(b=>b.parts.includes('deck_plate')).id;for(const f of frozen.track)f.bodies[deck]=structuredClone(frozen.track[0].bodies[deck]);assert.throws(()=>judgeSarrusLift('sarrus-lift',frozen));
});

test('Sarrus spatial-loop worm phase survives rollback exactly',async()=>{
 const p=prepareModel(source,C),J=await loadJolt(),core=createPhysicsCore(J,p.mechanism,{stepHz:200}),joint=p.mechanism.actuators[0].joint;
 try{core.setMotor(joint,{mode:'velocity',radPerSec:1});for(let i=0;i<100;i++)core.step(.005);core.checkpoint();
  const go=()=>{core.setMotor(joint,{mode:'velocity',radPerSec:-1});for(let i=0;i<100;i++)core.step(.005);const s=core.snapshot();return [Array.from(s.bodies),Array.from(s.joints)];};const first=go();core.rollback();assert.deepEqual(go(),first);
 }finally{core.destroy();}
});
