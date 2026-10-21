// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{catalogFrom,prepareModel}from'../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import{solidOverlaps}from'../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import{buildSteps}from'../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import{adaptAddonProgram}from'../scripts/lib/physics-addon-program.mjs';
import{judgeEchoLingerCrossline,measureEcho}from'../scripts/lib/sim-lab-echo-linger-crossline-judge.mjs';
import{runRobotLabProgram}from'./helpers/robot-lab-direct-vm.mjs';
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const base=new URL('../overlay/scratch-gui/static/sim-lab/',import.meta.url),read=(id,kind,ext)=>readFileSync(new URL(kind+'/'+id+'.'+ext,base),'utf8');
for(const[id,n,limit,outputs]of [['echo-bridge',108,45000,['bob_wheel_right']],['linger',158,165000,['output_EP']],['crossline',147,65000,['marker_plus','marker_minus']]])for(const autoPorts of[undefined,false])test(`${id} ${autoPorts===false?'strict':'ordinary'}: actual VM useful output, connected construction and frozen-output rejection`,async t=>{
 const original=readFileSync(new URL('./fixtures/model-files/'+id+'-source/'+id+'.ldr',import.meta.url),'utf8'),modelText=read(id,'models','ldr'),program=read(id,'programs','bw'),p=prepareModel(modelText,C);
 assert.deepEqual(p.model.parts,prepareModel(original,C).model.parts);assert.deepEqual(p.issues,[]);
 assert.equal(program,adaptAddonProgram(id,readFileSync(new URL('./fixtures/model-files/'+id+'-source/'+id+'.bw',import.meta.url))));
 for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);
 const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,n);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
 const r=await runRobotLabProgram(program,{modelText,timeLimitMs:limit,autoPorts});assert.ok(r.finishedAt&&r.finishedAt<limit);t.diagnostic(JSON.stringify(judgeEchoLingerCrossline(id,r)));
 for(const part of outputs){const frozen=structuredClone(r),body=r.mechanism.bodies.find(b=>b.parts.includes(part));for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);assert.throws(()=>judgeEchoLingerCrossline(id,frozen),'frozen '+part+' must fail');}
});
test('Echo Bridge: removing only both real elastic loops prevents receiver motion',async t=>{
 const modelText=read('echo-bridge','models','ldr').split('\n').filter(l=>!/^0 !BW BELT /.test(l)).join('\n'),r=await runRobotLabProgram(read('echo-bridge','programs','bw'),{modelText,timeLimitMs:45000}),result=measureEcho(r);
 assert.ok(r.finishedAt);assert.ok(result.receiverSpanMm<=1,JSON.stringify(result));assert.throws(()=>judgeEchoLingerCrossline('echo-bridge',r));t.diagnostic(JSON.stringify(result));
});
test('Echo Bridge and Linger cold saved poses remain supported without motor commands',async t=>{
 for(const id of ['echo-bridge','linger']){const duration=id==='echo-bridge'?10000:1000,r=await runRobotLabProgram('DEVICE SPIKE\nWHEN flag clicked:\n  wait '+duration/1000+' seconds\n',{modelText:read(id,'models','ldr'),timeLimitMs:duration+1000});assert.ok(r.finishedAt);assert.deepEqual(r.issues,[]);
  const last=r.track.filter(f=>f.t>=duration-1000);let drift=0;for(const b of r.mechanism.bodies.filter(b=>b.motion==='dynamic')){const initial=last[0].bodies[b.id].position;drift=Math.max(drift,...last.map(f=>Math.hypot(...f.bodies[b.id].position.map((x,i)=>x-initial[i]))*1000));}assert.ok(drift<1,id+' unsupported drift '+drift);t.diagnostic(id+' cold drift '+drift+' mm');
 }
});
