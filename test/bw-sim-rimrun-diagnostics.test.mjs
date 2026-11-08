// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// RimRun (Q5) measurements: the supplier's own catch and watchdog-hold checks are not in this repository,
// so these runs measure the two behaviours they named, on the real VM and engine, and report the values.
// Diagnostic only: it asserts that the runs happen, not a pass/fail verdict on the supplier's gates.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {actuatorState} from '../scripts/lib/robot-lab-qualification.mjs';
const lab='overlay/scratch-gui/static/sim-lab/',read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const observeFrame=({session,vm,hub})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:hub.motors._controllers.map(c=>c.mode),actuators:actuatorState(session)});
const round=o=>JSON.parse(JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(5):v));
function summarize(r){
 const m=r.mechanism,gate=m.joints.find(j=>j.motor?.port==='A'),roll=m.bodies.filter(b=>b.parts.some(p=>/_wheel_/.test(p))),shoes=m.joints.filter(j=>j.type==='slider');
 const tr=r.track,deg=x=>x*180/Math.PI,speed=(i,id)=>{const a=tr[i-1].bodies[id].position,b=tr[i].bodies[id].position;return Math.hypot(...a.map((x,k)=>b[k]-x))/((tr[i].t-tr[i-1].t)||1e-9);};
 const rows=[];for(let i=1;i<tr.length;i+=Math.max(1,Math.floor(tr.length/60)))rows.push({t:tr[i].t,phase:tr[i].phase,gateDeg:deg(tr[i].joints[gate.id].angle),gateVel:deg(tr[i].joints[gate.id].velocity??NaN),
  rollers:roll.map(b=>({id:b.id,pos:tr[i].bodies[b.id].position,speed:speed(i,b.id)})),shoes:shoes.map(j=>tr[i].joints[j.id].position??tr[i].joints[j.id].angle),stage:tr[i].extra?.variables?.stage,failed:tr[i].extra?.variables?.failed,modes:tr[i].extra?.modes});
 const after=tr.filter(f=>f.phase==='after');
 return round({finishedAt:r.finishedAt,frames:tr.length,last:tr.at(-1).extra?.variables,rollerBodies:roll.map(b=>b.id),
  afterMaxRollerSpeed:after.length>1?Math.max(...roll.flatMap(b=>after.slice(1).map((f,i)=>Math.hypot(...f.bodies[b.id].position.map((x,k)=>x-after[i].bodies[b.id].position[k]))/(f.t-after[i].t)))):null,rows});
}
const base={coldMs:500,timeLimitMs:16000,afterMs:3000,frameMs:20,autoPorts:false,observeFrame};
for(const id of ['rimrun','rimrun-swapped'])test(id+': post-finish catch and settling, measured',async t=>{
 const r=await runRobotLabProgram(read(lab+'programs/rimrun.bw'),{...base,modelText:read(lab+'models/'+id+'.ldr')});
 assert.deepEqual(r.issues,[]);assert.ok(r.track.length>100);t.diagnostic(JSON.stringify({id,...summarize(r)}));
});
// Fault-stop hold: lower the watchdog's upper angle limit in a test-only copy so the fault fires during the 400 deg/s release.
test('rimrun: watchdog fault-stop hold during the fast release, measured',async t=>{
 const src=read(lab+'programs/rimrun.bw');assert.ok(src.includes('(lab motor A angle) > 108'));
 const r=await runRobotLabProgram(src.replace('(lab motor A angle) > 108','(lab motor A angle) > 50'),{...base,timeLimitMs:8000,afterMs:2000,modelText:read(lab+'models/rimrun.ldr')});
 assert.ok(r.track.length>100);t.diagnostic(JSON.stringify({id:'rimrun-fault',...summarize(r)}));
});
