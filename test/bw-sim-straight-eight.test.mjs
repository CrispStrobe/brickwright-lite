// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {buildSteps,STEP_MAX} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';
import {judgeStraightEightRun} from '../scripts/lib/sim-lab-straight-eight-judge.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const text=read('overlay/scratch-gui/static/sim-lab/models/straight-eight.ldr');
test('Straight Eight: 113 connected, clear pieces, original geometry and complete instructions',()=>{
 const {model,mechanism,issues}=prepareModel(text,C,{mat:'plain'});assert.deepEqual(issues,[]);assert.equal(model.parts.length,113);assert.equal(model.decor?.length||0,0);
 assert.deepEqual(mechanism.actuators.map(a=>a.port),['A']);for(const p of model.parts)assert.deepEqual(solidOverlaps(model,C,p),[],p.id);
 const source=readFileSync(new URL('test/fixtures/model-files/straight-eight-source/original.ldr',root));assert.equal(createHash('sha256').update(source).digest('hex'),'20a42809c7eb9a089c68020998f0fb61d0ef436e1ccfe9bbfe5a16f347a0fbab');
 const original=parseModel(source.toString(),{catalog:C}).model;
 for(let i=0;i<model.parts.length;i++){
  const a=model.parts[i],b=original.parts[i];assert.equal(a.part,b.part);assert.equal(a.color,b.color);
  for(const key of ['position','rotation'])assert.ok(a[key].every((v,j)=>Math.abs(v-b[key][j])<=.000000501),'LDraw export retains placements to six decimals');
 }
 const plan=buildSteps(model,C);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=STEP_MAX));assert.deepEqual(plan.steps.flatMap(s=>s.parts).sort(),model.parts.map(p=>p.id).sort());
 assert.match(text,/Author: CrispStrobe/);assert.match(text,/BSD-3-Clause/);
});
test('Straight Eight: native VM traces a physical straight line and returns home; frozen marker fails',async t=>{
 const r=await runOnSimLab(read('overlay/scratch-gui/static/sim-lab/programs/straight-eight.bw'),{modelText:text,mat:'plain',timeLimitMs:14000});
 const result={...r,unsupported:r.run.unsupported};t.diagnostic(JSON.stringify(judgeStraightEightRun(result)));
 const marker=r.mechanism.bodies.find(b=>b.parts.includes('markerQ')).id;
 const track=r.track.map(f=>({...f,bodies:{...f.bodies,[marker]:r.track[0].bodies[marker]}}));
 assert.throws(()=>judgeStraightEightRun({...result,track}),/physical marker follows|closed physical hinge|physical marker stroke/);
});
