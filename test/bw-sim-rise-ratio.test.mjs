// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel,MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeRiseRatio} from '../scripts/lib/sim-lab-rise-ratio-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const lab='overlay/scratch-gui/static/sim-lab/',fixture='test/fixtures/model-files/rise-ratio-source/';
const catalog=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'))),program=read(lab+'programs/rise-ratio.bw');

for(const id of ['rise-ratio','rise-ratio-control']){
 const control=id.endsWith('control'),source=read(lab+'models/'+id+'.ldr'),count=control?181:182;
 test(id+': frozen source, real disconnected drive, retained shaft and connected instructions',()=>{
  for(const [file,sha]of Object.entries(JSON.parse(read(fixture+'provenance.json')).files))assert.equal(createHash('sha256').update(read(fixture+file)).digest('hex'),sha,file);
  assert.equal(program,read(fixture+'programs/rise-ratio.bw'));
  const p=prepareModel(source,catalog);assert.deepEqual(p,prepareModel(source,catalog,{autoPorts:false}));assert.deepEqual(p.issues,[]);
  assert.equal(p.model.parts.length,count);assert.deepEqual(p.mechanism.actuators.map(a=>a.port),['A']);assert.equal(p.mechanism.couplings.length,control?0:1);
  const owner=id=>p.mechanism.bodies.find(b=>b.parts.includes(id)).id;
  for(const bush of ['pinion_bush_front','pinion_bush_rear','drive_bearing_bush_front','drive_bearing_bush_rear']){
   assert.ok(p.model.parts.some(part=>part.id===bush),'required retained collar '+bush);assert.equal(owner(bush),owner('drive_axle'));
  }
  const main=prepareModel(read(lab+'models/rise-ratio.ldr'),catalog).model.parts;
  if(control)assert.deepEqual(p.model.parts,main.filter(part=>part.id!=='pinion'),'only the transmission pinion is removed; supports and collars remain');
  else assert.equal(source,read(fixture+'models/rise-ratio.ldr').replace('see ../LICENSE.txt','see ../licenses/rise-ratio.txt'));
  assert.equal(MODELS.find(m=>m.file===id+'.ldr').example,'rise-ratio.bw');assert.match(read(lab+'licenses/'+id+'.txt'),/Copyright \(c\) 2026 CrispStrobe/);
  for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,catalog,part),[],part.id);
  const plan=buildSteps(p.model,catalog),placed=plan.steps.flatMap(s=>s.parts);assert.equal(placed.length,count);assert.equal(new Set(placed).size,count);assert.ok(plan.steps.every(s=>!s.loose));
 });
 for(const [mode,autoPorts,frameMs]of [['ordinary',undefined,25],['strict',false,25],['browser-cadence',false,1000/30]]){
  test(id+': complete '+mode+' VM route and independent passive/control observations',async t=>{
   const r=await runRobotLabProgram(program,{modelText:source,autoPorts,frameMs,coldMs:1000,afterMs:1000,timeLimitMs:90000,
    observeFrame:({vm,session,hub})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:hub.motors._controllers.map(c=>c.mode),sessionFailed:session.failed?String(session.failed):null})});
   if(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR){mkdirSync(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR,{recursive:true});writeFileSync(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR+'/'+id+'-'+mode+'.json',JSON.stringify(r)+'\n');}
   t.diagnostic(JSON.stringify(judgeRiseRatio(r,{control,native:true})));assert.ok(r.track.every(f=>!f.extra.sessionFailed));assert.equal(r.track.at(-1).extra.modes[0],'hold');
   const shifted=structuredClone(r);for(const f of shifted.track)for(const p of Object.values(f.bodies))p.position[0]+=.01;
   assert.throws(()=>judgeRiseRatio(shifted,{control,native:true}),/stationary chassis/,'relative output coordinates cannot hide world-frame drift');
   const frozen=structuredClone(r),part=control?'drive_axle':'top_fork_front',body=r.mechanism.bodies.find(b=>b.parts.includes(part));
   for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);
   assert.throws(()=>judgeRiseRatio(frozen,{control,native:true}),control?/input shaft/:undefined,'encoders alone cannot pass a frozen physical output/input');
   if(control)assert.throws(()=>judgeRiseRatio(r,{native:true}),'the physically disconnected experiment must fail the main lift oracle');
  });
 }
}
