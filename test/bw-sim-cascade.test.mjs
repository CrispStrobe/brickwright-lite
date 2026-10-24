// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel,MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {adaptCascadeProgram} from '../scripts/lib/cascade-program.mjs';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {judgeCascade} from '../scripts/lib/sim-lab-cascade-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),lab='overlay/scratch-gui/static/sim-lab/',fixture='test/fixtures/model-files/cascade-source/',catalog=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'))),program=read(lab+'programs/cascade.bw');
for(const id of ['cascade','cascade-control']){
 const control=id.endsWith('control'),count=control?76:70,source=read(lab+'models/'+id+'.ldr');
 test(id+': frozen source, physical topology, license and connected instructions',()=>{
  for(const [file,sha]of Object.entries(JSON.parse(read(fixture+'provenance.json')).files))assert.equal(createHash('sha256').update(read(fixture+file)).digest('hex'),sha);
  assert.equal(source,read(fixture+'models/'+id+'.ldr').replace('see ../LICENSE.txt','see ../licenses/'+id+'.txt'));assert.equal(program,adaptCascadeProgram(read(fixture+'programs/cascade.bw')));
  const p=prepareModel(source,catalog),strict=prepareModel(source,catalog,{autoPorts:false});assert.deepEqual(p,strict);assert.deepEqual(p.issues,[]);assert.equal(p.model.parts.length,count);assert.deepEqual(p.mechanism.actuators.map(a=>a.port),['A']);assert.equal(p.mechanism.couplings.length,0);assert.equal(p.mechanism.bodies.filter(b=>b.motion==='dynamic').length,4);assert.equal(p.mechanism.joints.filter(j=>j.type==='hinge').length,3);
  assert.equal(MODELS.find(m=>m.file===id+'.ldr').example,'cascade.bw');const license=read(lab+'licenses/'+id+'.txt');assert.match(license,/BSD 3-Clause License/);assert.match(license,/original Cascade model/);assert.doesNotMatch(license,/original Concertina model/);
  const body=part=>p.mechanism.bodies.find(b=>b.parts.includes(part));assert.equal(body('upper_link').id===body('lower_link').id,control);
  for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,catalog,part),[],part.id);
  const plan=buildSteps(p.model,catalog),placed=plan.steps.flatMap(s=>s.parts);assert.equal(placed.length,count);assert.equal(new Set(placed).size,count);assert.ok(plan.steps.every(s=>!s.loose),'every authored building stage connects');
  if(control){const original=prepareModel(read(lab+'models/cascade.ldr'),catalog).model.parts;assert.deepEqual(p.model.parts.slice(0,original.length),original,'the control preserves every original placement');assert.equal(p.model.parts.length-original.length,6);}
 });
 for(const autoPorts of [undefined,false])test(id+': '+(autoPorts===false?'strict':'ordinary')+' complete registered program, passive motion, hold and negative observers',async t=>{
  const r=await runRobotLabProgram(program,{modelText:source,autoPorts,frameMs:25,coldMs:500,afterMs:500,timeLimitMs:32000,observeFrame:({vm,session,hub})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:hub.motors._controllers.map(c=>c.mode),sessionFailed:session.failed?String(session.failed):null})});
  if(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR){mkdirSync(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR,{recursive:true});writeFileSync(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR+'/'+id+'-'+(autoPorts===false?'strict':'ordinary')+'.json',JSON.stringify(r)+'\n');}
  const judge=r=>judgeCascade(r,{control,native:true});t.diagnostic(JSON.stringify(judge(r)));assert.equal(r.track.at(-1).extra.modes[0],'hold');assert.ok(r.track.every(f=>!f.extra.sessionFailed));
  const frozen=structuredClone(r),part=control?'upper_link':'lower_link',body=r.mechanism.bodies.find(b=>b.parts.includes(part));for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);assert.throws(()=>judge(frozen),'a frozen passive pendulum cannot pass');
  const shifted=structuredClone(r);for(const f of shifted.track)for(const p of Object.values(f.bodies))p.position[0]+=.01;assert.throws(()=>judge(shifted),/stationary chassis/,'relative angles cannot hide foundation translation');
 });
}

test('Cascade pulse adaptation refuses changed originals and retains the physical experiment guards',()=>{
 assert.throws(()=>adaptCascadeProgram(read(fixture+'programs/cascade.bw')+'\n'),/differs/);
 assert.match(program,/set stage to 1\n  set targetA to 90\n  set speedA to 30/);assert.match(program,/set stage to 2\n  set targetA to 0\n  set speedA to 180/);
 const contract=JSON.parse(read('docs/data/cascade-app-contract.json'));assert.equal(contract.program.observationSeconds,12);assert.equal(contract.program.arrivalToleranceDeg,.5);assert.deepEqual(contract.gates,JSON.parse(read(fixture+'build/acceptance-contract.json')).gates);
});
