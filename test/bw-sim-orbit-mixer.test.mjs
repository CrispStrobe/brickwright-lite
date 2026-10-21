// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeOrbitMixer} from '../scripts/lib/sim-lab-orbit-mixer-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),base='overlay/scratch-gui/static/sim-lab/',source=read(base+'models/orbit-mixer.ldr'),C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
test('Orbit Mixer: 161 connected placements, two motors and complete instructions without solid overlap',()=>{
 const p=prepareModel(source,C,{mat:'plain'});assert.deepEqual(p.issues,[]);assert.equal(p.model.parts.length,161);assert.equal((p.model.decor?.length||0),0);assert.deepEqual(p.mechanism.actuators.map(a=>a.port).sort(),['A','B']);
 for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);
 const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,161);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
});
for(const id of ['orbit-mixer','orbit-mixer-steps'])test(`${id}: native feedback drives measured passive planetary motion and returns home`,async()=>{
 const r=await runRobotLabProgram(read(base+'programs/'+id+'.bw'),{modelText:source,timeLimitMs:150000});assert.ok(r.finishedAt>10000&&r.finishedAt<150000);judgeOrbitMixer(id,r);
 const stopped=structuredClone(r),planet=r.mechanism.bodies.find(b=>b.parts.includes('planet_gear')).id;for(const f of stopped.track)f.bodies[planet]=structuredClone(stopped.track[0].bodies[planet]);assert.throws(()=>judgeOrbitMixer(id,stopped),'encoder completion cannot qualify a frozen passive paddle');
});
