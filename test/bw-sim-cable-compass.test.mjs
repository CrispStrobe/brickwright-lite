// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {catalogFrom,prepareModel,MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeCableCompass,evaluateCableCompass} from '../scripts/lib/sim-lab-cable-compass-judge.mjs';
import {installRopeForceObserver} from '../scripts/lib/sim-lab-rope-impulses.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const lab='overlay/scratch-gui/static/sim-lab/',fixture='test/fixtures/model-files/cable-compass-source/';
const catalog=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'))),program=read(lab+'programs/cable-compass.bw');
let ordinaryMain;
const observe=withForces=>{let observer;return({vm,session,hub})=>{
 if(withForces&&!observer)observer=installRopeForceObserver(session,vm);
 return {variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),ropes:session.core.ropeState(),
  ...(withForces?{forceSteps:observer.drain()}:{}),modes:Object.fromEntries(session.mechanism.actuators.map(a=>[a.port,hub.motors._controllers[a.port.charCodeAt(0)-65].mode])),sessionFailed:session.failed?String(session.failed):null};
};};
for(const id of ['cable-compass','cable-compass-control']){
 const control=id.endsWith('control'),source=read(lab+'models/'+id+'.ldr'),count=control?174:175;
 test(id+': source identity, retained shafts, actual disconnection, clearance and connected instructions',()=>{
  const provenance=JSON.parse(read(fixture+'source.json'));assert.equal(provenance.license,'BSD-3-Clause');
  for(const [file,{sha256}]of Object.entries(provenance.sourceFiles))assert.equal(createHash('sha256').update(read(fixture+file)).digest('hex'),sha256,file);
  assert.equal(program,read(fixture+'program.bw'));assert.equal(JSON.parse(read(fixture+'native-r1-failed.json')).status,'FAIL');assert.equal(JSON.parse(read(fixture+'native-r2-failed.json')).status,'FAIL');
  const p=prepareModel(source,catalog);assert.deepEqual(p,prepareModel(source,catalog,{autoPorts:false}));assert.deepEqual(p.issues,[]);
  assert.equal(p.model.parts.length,count);assert.equal(p.model.ropes.length,4);assert.deepEqual(p.mechanism.actuators.map(a=>a.port).sort(),['A','B']);
  assert.equal(p.mechanism.couplings.filter(c=>c.kind==='worm').length,control?1:2);
  const main=prepareModel(read(lab+'models/cable-compass.ldr'),catalog).model;
  if(control){assert.deepEqual(p.model.parts,main.parts.filter(part=>part.id!=='left_worm'));assert.deepEqual(p.model.ropes,main.ropes);}
  else assert.equal(source,read(fixture+'model.ldr').replace('see ../LICENSE.txt','see ../licenses/cable-compass.txt'));
  for(const side of ['left','right'])for(const part of ['worm_bearing','worm_axle','worm_thrust_spacer','worm_bush_-175','worm_bush_-145','worm_bush_-75','output_axle','output_inner_bush_-1','output_inner_bush_1','output_outer_bush_-1','output_outer_bush_1'])assert.ok(p.model.parts.some(p=>p.id===side+'_'+part),'retained support '+side+'_'+part);
  assert.equal(MODELS.find(m=>m.file===id+'.ldr').example,'cable-compass.bw');assert.match(read(lab+'licenses/'+id+'.txt'),/CrispStrobe/);
  for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,catalog,part),[],part.id);
  const plan=buildSteps(p.model,catalog),placed=plan.steps.flatMap(s=>s.parts);assert.equal(placed.length,count);assert.equal(new Set(placed).size,count);assert.ok(plan.steps.every(s=>!s.loose));
  assert.ok(buildSteps({...p.model,ropes:[]},catalog).steps.some(s=>s.loose),'removing the actual cord attachments restores the loose-payload construction failure');
 });
 for(const [mode,autoPorts,frameMs]of [['ordinary',undefined,25],['strict',false,25],['browser-cadence',false,1000/30]]){
  test(id+': complete '+mode+' route, passive output, full-rate forces and physical comparison',async t=>{
   const r=await runRobotLabProgram(program,{modelText:source,autoPorts,frameMs,coldMs:1000,afterMs:1000,timeLimitMs:160000,observeFrame:observe(true)});
   if(!control&&mode==='ordinary')ordinaryMain=r;
   if(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR){mkdirSync(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR,{recursive:true});writeFileSync(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR+'/'+id+'-'+mode+'.json.gz',gzipSync(Buffer.from(JSON.stringify(r))));}
   t.diagnostic(JSON.stringify(judgeCableCompass(r,{control,native:true})));assert.ok(r.track.every(f=>!f.extra.sessionFailed));assert.deepEqual(r.track.at(-1).extra.modes,{A:'hold',B:'hold'});
   const shifted=structuredClone(r);for(const f of shifted.track)for(const p of Object.values(f.bodies))p.position[0]+=.01;
   assert.throws(()=>judgeCableCompass(shifted,{control,native:true}),/foundation/);
   const frozen=structuredClone(r),part=control?'left_worm_axle':'payload_tie',body=r.mechanism.bodies.find(b=>b.parts.includes(part));
   for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);
   assert.throws(()=>judgeCableCompass(frozen,{control,native:true}),control?/input shaft/:undefined);
   if(control)assert.throws(()=>judgeCableCompass(r,{native:true}),'successful encoders cannot pass the main payload-position oracle');
   else{
    const zero=structuredClone(r);for(const f of zero.track)for(const step of f.extra.forceSteps)step.tensionsN=step.tensionsN.map(()=>0);
    const failed=evaluateCableCompass(zero,{native:true});
    for(const gate of ['agrees with observed payload momentum','vertical rope impulse supplies','both winch sides supply'])assert.ok(failed.failures.some(f=>f.includes(gate)),gate);
   }
  });
 }
}
test('full-rate force observer preserves the identical current native trajectory',async()=>{
 assert.ok(ordinaryMain,'ordinary positive already measured');
 const plain=await runRobotLabProgram(program,{modelText:read(lab+'models/cable-compass.ldr'),frameMs:25,coldMs:1000,afterMs:1000,timeLimitMs:160000,observeFrame:observe(false)});
 const physical=r=>r.track.map(({t,phase,bodies,joints})=>({t,phase,bodies,joints}));
 assert.deepEqual(physical(plain),physical(ordinaryMain),'same source, controls and conditioning; every native body and joint matches exactly');
});
