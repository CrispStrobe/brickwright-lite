// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {qualificationContracts,QUALIFICATION_JUDGES,disconnectedSource} from '../scripts/lib/robot-lab-qualification.mjs';
import {catalogFrom,prepareModel,MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {observeAddon} from '../scripts/lib/sim-lab-addon-judge.mjs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),lab='overlay/scratch-gui/static/sim-lab/',catalog=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const selected=process.env.BW_MODEL_QUALIFY_MODELS?.split(',');
test('qualification refuses unknown principles, missing models and incomplete disconnections',()=>{
 assert.throws(()=>qualificationContracts(['invented-pass']));assert.throws(()=>qualificationContracts([]));assert.throws(()=>disconnectedSource('0 model\n',['missing']));
});
const run=async(c,modelText,autoPorts,label=autoPorts===false?'strict':'ordinary')=>{
 const errors=[];let hooked=false;const r=await runRobotLabProgram(read(lab+'programs/'+c.id+'.bw'),{...c,modelText,autoPorts,observeFrame:({session,vm,hub})=>{
  if(!hooked){vm.runtime.on('ERROR',e=>errors.push(String(e)));vm.runtime.on('BLOCKS_ERROR',e=>errors.push(String(e)));hooked=true;}
  for(const b of vm.runtime.targets.flatMap(t=>Object.values(t.blocks._blocks))){const literal=Object.keys(b.fields||{}).length===1&&Object.keys(b.inputs||{}).length===0;assert.ok(b.opcode in vm.runtime._primitives||b.opcode in vm.runtime._hats||literal,'actual registered opcode: '+b.opcode);}
  return{variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:hub.motors._controllers.map(c=>c.mode),sessionFailed:session.failed?String(session.failed):null};
 }});if(process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR){const dir=process.env.BW_MODEL_QUALIFY_EVIDENCE_DIR;mkdirSync(dir,{recursive:true});writeFileSync(dir+'/'+c.id+'-'+label+'.json',JSON.stringify(r)+'\n');}assert.deepEqual(errors,[]);assert.ok(r.track.every(f=>!f.extra.sessionFailed));return r;
};
for(const c of qualificationContracts(selected).filter(c=>!c.nativeSuite)){
 const source=read(lab+'models/'+c.id+'.ldr'),program=read(lab+'programs/'+c.id+'.bw'),judge=r=>QUALIFICATION_JUDGES[c.judge](r,{native:true});
 test(c.id+': exact source, licence, topology, compiler, unassisted equality and complete registration',()=>{
  const dir='test/fixtures/model-files/'+c.id+'-source/',provenance=JSON.parse(read(dir+'provenance.json'));
  for(const [file,hash]of Object.entries(provenance.files))assert.equal(createHash('sha256').update(read(dir+file)).digest('hex'),hash);
  assert.equal(source,read(dir+(c.id==='quartermaster'?'quartermaster.ldr':'models/sine-shuttle.ldr')));assert.equal(program,read(dir+(c.id==='quartermaster'?'quartermaster.bw':'programs/sine-shuttle.bw')));
  assert.match(source,/^0 Author: CrispStrobe$/m);assert.match(read(lab+'licenses/'+c.id+'.txt'),/BSD 3-Clause License/);
  const entry=MODELS.find(m=>m.file===c.id+'.ldr');assert.ok(entry);assert.equal(entry.example,c.id+'.bw');assert.ok(entry.manualJog);
  const p=prepareModel(source,catalog),strict=prepareModel(source,catalog,{autoPorts:false});assert.deepEqual(p,strict);assert.deepEqual(p.issues,[]);assert.equal(p.model.parts.length,c.parts);assert.deepEqual(p.mechanism.actuators.map(a=>a.port).sort(),c.ports);
  const creator=new Creator();creator.parse(program);assert.deepEqual(creator.errors||[],[]);assert.deepEqual(creator.warnings||[],[]);
 });
 for(const autoPorts of [undefined,false])test(c.id+': '+(autoPorts===false?'strict':'ordinary')+' real VM, passive laws, frozen-output and world-drift controls',async t=>{
  const r=await run(c,source,autoPorts);t.diagnostic(JSON.stringify({id:c.id,result:judge(r)}));
  const last=r.track.at(-1);for(const port of c.ports){assert.equal(last.busy[port],false);assert.equal(last.extra.modes[port.charCodeAt(0)-65],'hold');}
  const frozen=structuredClone(r),body=r.mechanism.bodies.find(b=>b.parts.includes(c.frozenOutput));for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);assert.throws(()=>judge(frozen),'a stationary output cannot pass');
  const shifted=structuredClone(r);for(const b of Object.values(shifted.track.at(-1).bodies))b.position[0]+=.01;assert.throws(()=>judge(shifted),/stationary chassis/,'relative output laws do not hide world drift');
 });
 test(c.id+': physical disconnection destroys the intended output while the real input still completes',async t=>{
  const r=await run(c,disconnectedSource(source,c.disconnect),false,'disconnected'),o=observeAddon(r),input=r.mechanism.joints.find(j=>j.motor?.port==='A'),travel=Math.max(...r.track.map(f=>f.joints[input.id].angle))*180/Math.PI;
  assert.ok(r.finishedAt>0);assert.ok(travel>(c.id==='sine-shuttle'?1070:1430),'input genuinely still turns');
  let motion;
  if(c.id==='sine-shuttle'){
   const v=o.initial('guide_x_-100',[20,0,0]).map((x,i)=>x-o.initial('guide_x_-100')[i]),len=Math.hypot(...v),axis=v.map(x=>x/len),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
   const points=r.track.map(f=>dot(o.point(f,c.frozenOutput).map((x,i)=>x-o.point(f,'crank')[i]),axis)*1000);
   motion=Math.max(...points)-Math.min(...points);
   // A detached carriage can drift or hit something. The causal requirement is
   // loss of the declared 31..33 mm cosine stroke, not an invented frozen pose.
   assert.ok(motion<31,'disconnection loses the original minimum useful stroke');
   assert.ok(Math.max(...r.track.map((f,i)=>Math.abs(points[i]-16*Math.cos(f.joints[input.id].angle))))>.5,'the original cosine-law bound rejects the disconnected mechanism');
  }
  else{const j=r.mechanism.joints.find(j=>!j.motor&&j.body2===o.body(c.frozenOutput).id);const angles=r.track.map(f=>o.angle(f,c.frozenOutput,j.axis,[0,0,1]));motion=(Math.max(...angles)-Math.min(...angles))*180/Math.PI;assert.ok(motion<1,'wheel loses indexing without the roller');}
  assert.throws(()=>judge(r));t.diagnostic(JSON.stringify({id:c.id,inputTravelDeg:travel,disconnectedOutputMotion:motion}));
 });
}
