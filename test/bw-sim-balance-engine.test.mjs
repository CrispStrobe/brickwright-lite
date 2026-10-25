// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeBalance} from '../scripts/lib/sim-lab-balance-judge.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const lab='overlay/scratch-gui/static/sim-lab/',fixture='test/fixtures/model-files/balance-engine-source/';
test('Balance Engine: frozen source identity and complete license',()=>{
 const p=JSON.parse(read(fixture+'provenance.json'));
 for(const [file,hash]of Object.entries(p.files))assert.equal(createHash('sha256').update(read(fixture+file)).digest('hex'),hash);
 for(const file of ['models/balance-engine.ldr','programs/balance-engine.bw'])assert.equal(read(lab+file),read(fixture+file).split('\n').map(line=>line.trimEnd()).join('\n'),'Only comment trailing spaces are normalized');
 assert.match(read(lab+'licenses/balance-engine.txt'),/BSD 3-Clause/);
});
for(const autoPorts of [undefined,false])test(`Balance ${autoPorts===false?'strict':'ordinary'}: full native phasing, reaction and frozen-output refusals`,async()=>{
 const r=await runRobotLabProgram(read(lab+'programs/balance-engine.bw'),{modelText:read(lab+'models/balance-engine.ldr'),timeLimitMs:95000,frameMs:10,coldMs:10000,afterMs:1000,autoPorts,
 observeFrame:({vm})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value])))})});
 console.log(JSON.stringify(judgeBalance(r,{native:true})));
 for(const id of ['A_slider_cross','B_slider_cross','hub']){
  const frozen=structuredClone(r),body=frozen.mechanism.bodies.find(b=>b.parts.includes(id));
  for(const f of frozen.track)f.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);
  assert.throws(()=>judgeBalance(frozen,{native:true}),`An unmoving ${id} must fail the identical judge`);
 }
});
