// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';import {judgeScaleEcho,judgeTurnwise,steeringPrediction} from '../scripts/lib/sim-lab-scaling-steering-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),base='overlay/scratch-gui/static/sim-lab/',C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
for(const [name,n,motors,judge,output,minTime]of [['scale-echo',148,2,judgeScaleEcho,'outputlong_main',65000],['turnwise',127,1,judgeTurnwise,'kingpin_right',80000]]){
 const source=read(base+'models/'+name+'.ldr');
 test(`${name}: original placements, connected instructions and no solid overlaps`,()=>{
  assert.equal(read(base+'programs/'+name+'.bw'),read('test/fixtures/model-files/'+name+'-source/'+name+'.bw'));
  const p=prepareModel(source,C),original=prepareModel(read('test/fixtures/model-files/'+name+'-source/'+name+'.ldr'),C);assert.equal(p.model.parts.length,n);assert.deepEqual(p.issues,[]);assert.equal(p.mechanism.actuators.length,motors);assert.equal(JSON.stringify(p.model.parts),JSON.stringify(original.model.parts));
  for(const part of p.model.parts)assert.deepEqual(solidOverlaps(p.model,C,part),[],part.id);
  const plan=buildSteps(p.model,C);assert.equal(plan.steps.flatMap(s=>s.parts).length,n);assert.ok(plan.steps.every(s=>!s.loose&&s.parts.length<=6));
 });
 for(const autoPorts of [undefined,false])test(`${name} (${autoPorts===false?'strict':'ordinary'}): actual VM and physical output, including frozen-output refusal`,async()=>{
  const r=await runRobotLabProgram(read(base+'programs/'+name+'.bw'),{modelText:source,timeLimitMs:110000,autoPorts});assert.ok(r.finishedAt>minTime&&r.finishedAt<110000);judge(name,r);
  const frozen=structuredClone(r),body=r.mechanism.bodies.find(b=>b.parts.includes(output)).id;for(const f of frozen.track)f.bodies[body]=structuredClone(frozen.track[0].bodies[body]);assert.throws(()=>judge(name,frozen));
 });
}
test('steering prediction is the unequal-angle four-bar, rather than exact Ackermann or equal-angle steering',()=>{
 const rad=Math.PI/180;assert.ok(Math.abs(steeringPrediction(25*rad)/rad-17.255153515384)<1e-8);assert.ok(Math.abs(steeringPrediction(-17.255153515384*rad)/rad+25)<1e-8);assert.ok(Math.abs(steeringPrediction(0))<1e-12);
});
