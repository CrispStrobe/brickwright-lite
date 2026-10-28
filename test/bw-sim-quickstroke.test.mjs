// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {judgeQuickstroke} from '../scripts/lib/sim-lab-quickstroke-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),base='overlay/scratch-gui/static/sim-lab/',source=read(base+'models/quickstroke.ldr'),C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
test('Quickstroke: 111 physical parts, one motor, connected instructions and two guide axles',()=>{
 const p=prepareModel(source,C);assert.equal(p.model.parts.length,111);assert.ok(p.issues.every(i=>i.code==='locked-hinges'));assert.equal(p.mechanism.actuators.length,1);for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,111);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
});
test('Quickstroke: native crank produces measured quick-return timing in both directions',async()=>{
 const r=await runRobotLabProgram(read(base+'programs/quickstroke.bw'),{modelText:source,timeLimitMs:100000});assert.ok(r.finishedAt>70000&&r.finishedAt<100000);judgeQuickstroke('quickstroke',r);
 const frozen=structuredClone(r),deck=r.mechanism.bodies.find(b=>b.parts.includes('slider_cross')).id;for(const f of frozen.track)f.bodies[deck]=structuredClone(frozen.track[0].bodies[deck]);assert.throws(()=>judgeQuickstroke('quickstroke',frozen));
});
