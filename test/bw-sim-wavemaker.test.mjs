// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel,MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {judgeWaveMaker,cardanPointerDegrees} from '../scripts/lib/sim-lab-wavemaker-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),lab='overlay/scratch-gui/static/sim-lab/',fixture='test/fixtures/model-files/wavemaker-source/',catalog=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const source=id=>read(lab+'models/'+id+'.ldr'),program=read(lab+'programs/wavemaker.bw');
test('WaveMaker: independently derived 48-64-80 Cardan geometry has the predicted extrema',()=>{
 const theta=Math.atan(.8)*180/Math.PI;assert.ok(Math.abs(cardanPointerDegrees(theta)-12.68038349181982)<1e-8);assert.equal(cardanPointerDegrees(0),0);assert.ok(Math.abs(cardanPointerDegrees(90))<1e-8);
});
for(const id of ['wavemaker','wavemaker-control']){
 test(id+': original geometry, explicit wiring, unassisted topology and connected instructions',()=>{
  const provenance=JSON.parse(read(fixture+'provenance.json'));for(const [file,sha]of Object.entries(provenance.files))assert.equal(createHash('sha256').update(read(fixture+file)).digest('hex'),sha);
  assert.equal(source(id),read(fixture+id+'.ldr').replace('see ../LICENSE.txt','see ../licenses/'+id+'.txt'));assert.equal(program,read(fixture+'wavemaker.bw'));
  const p=prepareModel(source(id),catalog),strict=prepareModel(source(id),catalog,{autoPorts:false});assert.deepEqual(p,strict);assert.deepEqual(p.issues,[]);assert.equal(p.model.parts.length,298);assert.deepEqual(p.mechanism.actuators.map(a=>a.port),['A']);
  assert.equal(MODELS.find(m=>m.file===id+'.ldr').example,'wavemaker.bw');assert.match(read(lab+'licenses/'+id+'.txt'),/BSD 3-Clause License/);
  for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,catalog,part),[],part.id);
  const plan=buildSteps(p.model,catalog),placed=plan.steps.flatMap(s=>s.parts);assert.equal(placed.length,298);assert.equal(new Set(placed).size,298);assert.ok(plan.steps.every(s=>!s.loose),'construction stages connect');
 });
 for(const autoPorts of [undefined,false])test(id+': '+(autoPorts===false?'strict':'ordinary')+' registered VM, passive laws and negative observers',async t=>{
  const r=await runRobotLabProgram(program,{modelText:source(id),autoPorts,frameMs:25,coldMs:500,afterMs:500,timeLimitMs:80000,observeFrame:({vm,session,hub})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:hub.motors._controllers.map(c=>c.mode),sessionFailed:session.failed?String(session.failed):null})});
  if(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR){mkdirSync(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR,{recursive:true});writeFileSync(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR+'/'+id+'-'+(autoPorts===false?'strict':'ordinary')+'.json',JSON.stringify(r)+'\n');}
  const judge=r=>judgeWaveMaker(r,{control:id.endsWith('control')});t.diagnostic(JSON.stringify(judge(r)));assert.equal(r.track.at(-1).extra.modes[0],'hold');assert.ok(r.track.every(f=>!f.extra.sessionFailed));
  const frozen=structuredClone(r),part=id.endsWith('control')?'reference_side_axle':'pointer_beam',body=r.mechanism.bodies.find(b=>b.parts.includes(part));for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);assert.throws(()=>judge(frozen),'frozen passive transmission cannot pass');
  const shifted=structuredClone(r);for(const f of shifted.track)for(const p of Object.values(f.bodies))p.position[0]+=.01;assert.throws(()=>judge(shifted),/stationary chassis/,'relative angles cannot hide a displaced base');
 });
}
