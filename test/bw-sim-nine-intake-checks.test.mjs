// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {checkIntakeStructure,checkIntakeProgramOutcome} from '../scripts/lib/robot-lab-intake-checks.mjs';
const catalog=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const contracts={helixgate:{A:'worm_1start'},looprelay:{A:'chain_input16'},paritydial:{A:'gear_drive'},counterslide:{A:'drive_pinion_8t'},'toggle-press':{A:'crank'},footfall:{A:'input_crank_OM'},phasekeeper:{A:'joint_1_input_yoke'},vectorsum:{A:'side_gear_A',B:'side_gear_B'},pointweaver:{A:'left_input_arm',B:'right_input_arm'}};
const check=(source,id)=>checkIntakeStructure(prepareModel(source,catalog,{mat:'plain',autoPorts:false}),catalog,{fixedMotorPorts:Object.keys(contracts[id]),drivenParts:contracts[id],fixedParts:id==='footfall'?['fixed_bearing_P']:[]});
for(const id of Object.keys(contracts))test(`${id}: the candidate has supported fixed motors, keyed input, engaged retainers and no overlapping solids`,()=>{
 const source=readFileSync(new URL(`../overlay/scratch-gui/static/sim-lab/models/${id}.ldr`,import.meta.url),'utf8');
 const r=check(source,id);assert.deepEqual(r.errors,[],JSON.stringify(r.errors));
});
for(const id of ['toggle-press','footfall','phasekeeper','vectorsum','pointweaver'])test(`${id}: unchanged original assembly is rejected with concrete counterexamples`,()=>{
 const source=readFileSync(new URL(`./fixtures/model-files/nine-technic-source/${id}/original.ldr`,import.meta.url),'utf8');
 const r=check(source,id);assert.equal(r.ok,false);assert.ok(r.errors.length>0);
 if(id==='pointweaver')assert.ok(r.errors.some(e=>e.code==='drive-not-keyed'),'Round holes cannot key the input arms to their motor axles');
});
test('program termination alone cannot pass a fault, an unset success flag, a non-finite pose or a short hold',()=>{
 const body={position:[0,0,0],rotation:[0,0,0,1]},frame=(phase,t,variables)=>({phase,t,bodies:{chassis:structuredClone(body)},extra:{variables}});
 const good={finishedAt:1000,track:[frame('program',1000,{done:1,fault:0}),frame('after',3000,{done:1,fault:0})]};
 assert.equal(checkIntakeProgramOutcome(good,{successVariable:'done'}).ok,true);
 for(const change of [r=>{r.track[0].extra.variables.fault=1;},r=>{r.track[0].extra.variables.done=0;},r=>{r.track[1].bodies.chassis.position[0]=NaN;},r=>{r.track[1].t=1500;},r=>{r.finishedAt=null;},r=>{delete r.track[0].extra.variables;},r=>{r.track[0].bodies={};},r=>{delete r.track[0].bodies.chassis.position;},r=>{r.track[0].bodies.chassis.rotation=[0,0,0,0];},r=>{r.track[0].t=4000;}]){
  const bad=structuredClone(good);change(bad);assert.equal(checkIntakeProgramOutcome(bad,{successVariable:'done'}).ok,false);
 }
});

test('an overlong output-shaft insertion is rejected even when its own gear and both bearings engage',()=>{
 const source=readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/vectorsum.ldr',import.meta.url),'utf8');
 const unsafe=source.replace(/(0 !BW ID output_axle\n1 \S+ )(-?\d+(?:\.\d+)?)/,(_,prefix,x)=>prefix+(Number(x)-10));
 assert.notEqual(unsafe,source);
 const r=check(unsafe,'vectorsum');
 assert.ok(r.errors.some(e=>e.code==='shaft-tip-in-gear'&&e.parts.includes('output_axle')&&e.parts.includes('satellite_2')),JSON.stringify(r.errors));
});

test('a pivot supported only through moving links cannot masquerade as the fixed foundation',()=>{
 const source=readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/footfall.ldr',import.meta.url),'utf8');
 const unmounted=source.replace(/0 !BW ID fixed_bearing_P\n1 [^\n]+\n/,'');
 assert.notEqual(source,unmounted);
 assert.ok(check(unmounted,'footfall').errors.some(e=>e.code==='fixed-part-not-mounted'));
});

test('a declared powered input cannot disappear behind a different motor port',()=>{
 const source=readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/helixgate.ldr',import.meta.url),'utf8');
 assert.ok(check(source.replace('0 !BW PORT A','0 !BW PORT B'),'helixgate').errors.some(e=>e.code==='missing-or-ambiguous-drive'));
});
