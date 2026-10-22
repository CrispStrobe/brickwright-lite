// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {adaptRootBridgeModel,adaptRootBridgeProgram} from '../scripts/lib/root-bridge-source.mjs';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {judgeRootBridge} from '../scripts/lib/sim-lab-root-bridge-judge.mjs';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fixture='test/fixtures/model-files/root-bridge-source/',lab='overlay/scratch-gui/static/sim-lab/';
const model=read(lab+'models/root-bridge.ldr'),program=read(lab+'programs/root-bridge.bw');
test('Root Bridge: exact source provenance and reproducible physical clearance repair',()=>{
 const p=JSON.parse(read(fixture+'provenance.json'));
 for(const [file,hash]of Object.entries(p.files))assert.equal(createHash('sha256').update(read(fixture+file)).digest('hex'),hash);
 assert.equal(model,adaptRootBridgeModel(read(fixture+'models/root-bridge.ldr')));
 assert.equal(program,adaptRootBridgeProgram(read(fixture+'root-bridge.bw')));
 assert.match(model,/Author: CrispStrobe/);assert.match(read(lab+'licenses/root-bridge.txt'),/BSD 3-Clause/);
 const original=parseModel(read(fixture+'models/root-bridge.ldr')).model,patched=parseModel(model).model;
 assert.equal(patched.parts.length,443);assert.equal(original.parts.length,443);
 assert.deepEqual(patched.parts.map(p=>p.id),original.parts.map(p=>p.id));
 for(const p of patched.parts){const before=original.parts.find(x=>x.id===p.id);
  if(JSON.stringify(p)!==JSON.stringify(before))assert.match(p.id,/^b_(?:rail|spine|seat|seat_pin|outer_bush|stop_near|end_node|end_pin|end_cross|column|column_node|column_pin)_/);
 }
});
for(const autoPorts of [undefined,false])test(`Root Bridge ${autoPorts===false?'strict saved project':'ordinary'}: real shared SPIKE hub and passive geometric mean`,async()=>{
 const text=autoPorts===false?serializeModel(parseModel(model).model,{name:'root-reopened.mpd'}):model;
 const r=await runRobotLabProgram(program,{modelText:text,autoPorts,withSpike:true,timeLimitMs:125000,
  observeFrame:({vm})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value])))})});
 console.log(JSON.stringify(judgeRootBridge(r)));
 assert.equal(r.worldPaused,true);assert.equal(r.unsupportedPython,null);assert.deepEqual(r.vmErrors,[]);
 assert.equal(r.mechanism.joints.filter(j=>j.type==='ball').length,0,'All actual pin hinges retained');
 assert.ok(r.mechanism.joints.every(j=>!j.frictionNm),'No imported bearing resistance');
 assert.equal(r.mechanism.solver,undefined,'No implicit import solver profile');
 const frozen=structuredClone(r),output=frozen.mechanism.bodies.find(b=>b.parts.includes('height_marker'));
 for(const frame of frozen.track)frame.bodies[output.id]=structuredClone(frozen.track[0].bodies[output.id]);
 assert.throws(()=>judgeRootBridge(frozen),'Frozen passive output must fail the same geometric test');
});
