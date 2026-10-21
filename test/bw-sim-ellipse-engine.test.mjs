// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {judgeEllipseEngine} from '../scripts/lib/sim-lab-ellipse-engine-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),base='overlay/scratch-gui/static/sim-lab/',source=read(base+'models/ellipse-engine.ldr'),C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
test('Ellipse Engine: 169 physical parts, one motor, connected instructions and two perpendicular antiroll carriages',()=>{
 const p=prepareModel(source,C);assert.equal(p.model.parts.length,169);assert.ok(p.issues.every(i=>i.code==='locked-hinges'));assert.equal(p.mechanism.actuators.length,1);for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,169);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
});
for(const autoPorts of [true,false])test(`Ellipse Engine (${autoPorts?'ordinary':'strict'}): native moving motor drives measured perpendicular ellipses in both directions`,async()=>{
 const r=await runRobotLabProgram(read(base+'programs/ellipse-engine.bw'),{modelText:source,timeLimitMs:100000,autoPorts});assert.ok(r.finishedAt>70000&&r.finishedAt<100000);judgeEllipseEngine('ellipse-engine',r);
 const frozen=structuredClone(r),deck=r.mechanism.bodies.find(b=>b.parts.includes('coupler_main')).id;for(const f of frozen.track)f.bodies[deck]=structuredClone(frozen.track[0].bodies[deck]);assert.throws(()=>judgeEllipseEngine('ellipse-engine',frozen));
});
