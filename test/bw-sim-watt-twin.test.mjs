// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {adaptWattLine} from '../scripts/lib/watt-line-source.mjs';
import {judgeWatt} from '../scripts/lib/sim-lab-watt-judge.mjs';
import {judgeTwinTempo} from '../scripts/lib/sim-lab-twin-tempo-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),lab='overlay/scratch-gui/static/sim-lab/';
const catalog=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
for(const [id,judge,parts,coldMs,frameMs,timeLimitMs,output] of [['watt-line',judgeWatt,148,2000,1000/60,45000,'coupler'],['twin-tempo',judgeTwinTempo,81,500,25,62000,'payload_fast']]){
 test(`${id}: frozen source identity, truthful author and explicit physical ports`,()=>{
  const dir='test/fixtures/model-files/'+id+'-source/',p=JSON.parse(read(dir+'provenance.json'));
  for(const [file,hash]of Object.entries(p.files))assert.equal(createHash('sha256').update(read(dir+file)).digest('hex'),hash);
  const source=read(lab+'models/'+id+'.ldr');
  assert.equal(source,id==='watt-line'?adaptWattLine(read(dir+'models/'+id+'.ldr')):read(dir+'models/'+id+'.ldr'));
  assert.equal(read(lab+'programs/'+id+'.bw'),read(dir+'programs/'+id+'.bw'));assert.match(source,/^0 Author:.*CrispStrobe/m);
  const a=prepareModel(source,catalog),b=prepareModel(source,catalog,{autoPorts:false});assert.deepEqual(a,b);assert.equal(a.model.parts.length,parts);assert.deepEqual(a.issues,[]);
  assert.equal(a.mechanism.actuators.length,1);assert.equal(a.mechanism.actuators[0].port,'A');
 });
 for(const autoPorts of [undefined,false])test(`${id}: ${autoPorts===false?'strict':'ordinary'} actual VM, passive output law, frozen-output refusal`,async t=>{
  const r=await runRobotLabProgram(read(lab+'programs/'+id+'.bw'),{modelText:read(lab+'models/'+id+'.ldr'),autoPorts,timeLimitMs,coldMs,frameMs,afterMs:1000,
   observeFrame:({session,vm})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),rope:session.core.ropeState()})});
  const result=judge(r,{native:true});t.diagnostic(JSON.stringify({id,result:result.metrics||result}));
  const frozen=structuredClone(r),body=frozen.mechanism.bodies.find(b=>b.parts.includes(output));
  for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);assert.throws(()=>judge(frozen,{native:true}));
 });
}

test('Watt: real brick backstops satisfy the original ±26° stress bounds; removing only rails permits further travel',async t=>{
 const model=read(lab+'models/watt-line.ldr'),program=read('test/fixtures/model-files/watt-line-source/stop-probe.bw');
 const removed=['stop_rail_-1','stop_rail_1',...[-1,1].flatMap(s=>[120,160].map(x=>'stop_rail_pin_'+s+'_'+x))];
 const control=model.split(/(?=^0 !BW ID )/m).filter(block=>!removed.some(id=>block.startsWith('0 !BW ID '+id+'\n'))).join('');
 for(const [name,modelText] of [['delivered',model],['rails removed',control]]){
  const r=await runRobotLabProgram(program,{modelText,autoPorts:false,timeLimitMs:35000,coldMs:2000,afterMs:500,frameMs:1000/60,
   observeFrame:({vm})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value])))})});
  assert.deepEqual(r.issues,[]);assert.ok(r.finishedAt>0&&r.finishedAt<32000);
  const v=r.track.at(-1).extra.variables;assert.equal(Number(v.probeDone),1);assert.equal(Number(v.probeFailed),0);
  const joint=r.mechanism.joints.find(j=>j.motor),a=r.track.filter(f=>[1,3].includes(Number(f.extra.variables.probeStage))).map(f=>f.joints[joint.id].angle*180/Math.PI);
  const max=Math.max(...a),min=Math.min(...a);t.diagnostic(JSON.stringify({name,max,min}));
  if(name==='delivered'){assert.ok(max>=23.5&&max<=26);assert.ok(min<=-23.5&&min>=-26);}
  else{assert.ok(max>28.5&&min<-28.5,'the rail assembly actually limits motion');}
 }
});

test('TwinTempo: remove only the slow cord; driven shafts still turn but the slow tag loses its lifting law',async()=>{
 const source=read(lab+'models/twin-tempo.ldr').replace(/^0 !BW ROPE cord_slow[^\n]*\n/m,'');
 const r=await runRobotLabProgram(read(lab+'programs/twin-tempo.bw'),{modelText:source,autoPorts:false,timeLimitMs:62000,coldMs:500,frameMs:25,afterMs:500,
  observeFrame:({session,vm})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),rope:session.core.ropeState()})});
 const joint=r.mechanism.joints.find(j=>j.motor);assert.ok(Math.max(...r.track.map(f=>f.joints[joint.id].angle))*180/Math.PI>719,'input still completes its two turns');
 const {observeAddon}=await import('../scripts/lib/sim-lab-addon-judge.mjs');const o=observeAddon(r),start=o.point(r.track[0],'payload_slow',[0,0,-29])[1];
 const mismatch=Math.max(...r.track.map(f=>Math.abs((o.point(f,'payload_slow',[0,0,-29])[1]-start)*1000-2.8*f.joints[joint.id].angle/3)));
 assert.ok(mismatch>5,'physical cord removal destroys the independent tag law');assert.throws(()=>judgeTwinTempo(r,{native:true}));
});
