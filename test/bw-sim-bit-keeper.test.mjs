// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{catalogFrom,prepareModel}from'../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import{solidOverlaps}from'../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import{buildSteps}from'../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import{adaptAddonProgram}from'../scripts/lib/physics-addon-program.mjs';
import{judgeBit,measureBit}from'../scripts/lib/sim-lab-bit-keeper-judge.mjs';
import{observeAddon}from'../scripts/lib/sim-lab-addon-judge.mjs';
import{runRobotLabProgram}from'./helpers/robot-lab-direct-vm.mjs';
const base=new URL('../overlay/scratch-gui/static/sim-lab/',import.meta.url),modelText=readFileSync(new URL('models/bit-keeper.ldr',base),'utf8'),program=readFileSync(new URL('programs/bit-keeper.bw',base),'utf8'),C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
for(const autoPorts of[undefined,false])test(`Bit Keeper ${autoPorts===false?'strict':'ordinary'}: physical retained states, original geometry and frozen-output rejection`,async t=>{
 const original=readFileSync(new URL('./fixtures/model-files/bit-keeper-source/bit-keeper.ldr',import.meta.url),'utf8'),p=prepareModel(modelText,C);assert.deepEqual(p.model.parts,prepareModel(original,C).model.parts);assert.equal(p.model.parts.length,133);assert.equal(p.model.belts.length,1);
 assert.equal(program,adaptAddonProgram('bit-keeper',readFileSync(new URL('./fixtures/model-files/bit-keeper-source/bit-keeper.bw',import.meta.url))));
 for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);
 const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,133);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
 const r=await runRobotLabProgram(program,{modelText,timeLimitMs:85000,autoPorts});assert.ok(r.finishedAt&&r.finishedAt<75000);t.diagnostic(JSON.stringify(judgeBit('bit-keeper',r)));
 const frozen=structuredClone(r),body=r.mechanism.bodies.find(b=>b.parts.includes('bob_gear'));for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);assert.throws(()=>judgeBit('bit-keeper',frozen));
});
test('Bit Keeper: removing only the elastic loop loses retained memory',async t=>{
 const withoutBand=modelText.split('\n').filter(l=>!/^0 !BW BELT /.test(l)).join('\n'),r=await runRobotLabProgram(program,{modelText:withoutBand,timeLimitMs:85000});assert.ok(r.finishedAt);const result=measureBit(r);
 for(const w of result.windows){assert.ok(w.crossings>=2&&Math.abs(w.mean)<=5,JSON.stringify(result));}assert.throws(()=>judgeBit('bit-keeper',r));t.diagnostic(JSON.stringify(result));
});
test('Bit Keeper: independent ten-second coast preserves its saved state without an active hold',async t=>{
 const r=await runRobotLabProgram('DEVICE SPIKE\nWHEN flag clicked:\n  lab start\n  lab stop motor A coast\n  wait 10 seconds\n',{modelText,timeLimitMs:12000});assert.ok(r.finishedAt);const o=observeAddon(r),angle=f=>{const p=o.point(f,'bob_gear'),q=o.point(f,'pivot');return Math.atan2(p[2]-q[2],q[1]-p[1])*180/Math.PI;},initial=angle(r.track[0]),drift=Math.max(...r.track.map(f=>Math.abs(angle(f)-initial)));assert.ok(drift<=1);t.diagnostic('Coast-only output drift '+drift+' degrees');
});
