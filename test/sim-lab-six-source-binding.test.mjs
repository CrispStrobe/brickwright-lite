// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindSixBrowserSource} from '../scripts/lib/sim-lab-six-browser-judge.mjs';
import {SIX_INTAKES,intakeRead} from '../scripts/lib/sim-lab-six-intake-contracts.mjs';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
const catalog=catalogFrom(JSON.parse(intakeRead('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
for(const id of SIX_INTAKES)test(id+': bind exact original and canonical saved geometry; reject changed input and compiled shapes',()=>{
 const source=intakeRead('overlay/scratch-gui/static/sim-lab/models/'+id+'.ldr').toString();
 const original=prepareModel(source,catalog,{autoPorts:false,mat:'plain'});
 const saved=prepareModel(serializeModel(original.model,{precision:12}),catalog,{autoPorts:false,mat:'plain'});
 for(const candidate of [original,saved]){
  bindSixBrowserSource(id,candidate);
  const different=structuredClone(candidate);different.model.parts[0].position[0]+=.001;
  assert.throws(()=>bindSixBrowserSource(id,different),/actual model is exactly/);
  const altered=structuredClone(candidate);altered.mechanism.bodies.find(b=>b.massKg>0).massKg+=.0001;
  assert.throws(()=>bindSixBrowserSource(id,altered),/massKg/);
 }
});

test('project precision preserves Vernier independent marker geometry that the six-decimal export loses',async()=>{
 const {measureRotations}=await import('./fixtures/model-files/vernier-drive-source/checks/rotational-observer.mjs');
 const {INTAKE_ROOT}=await import('../scripts/lib/sim-lab-six-intake-contracts.mjs');
 const markers=JSON.parse(intakeRead('test/fixtures/model-files/vernier-drive-source/markers.json'));
 const original=prepareModel(intakeRead('overlay/scratch-gui/static/sim-lab/models/vernier-drive.ldr').toString(),catalog,{autoPorts:false,mat:'plain'});
 const observe=precision=>{
  const p=prepareModel(serializeModel(original.model,{precision}),catalog,{autoPorts:false,mat:'plain'});
  // Exact compiled initial placements, not a claimed simulated trajectory.
  const bodies=Object.fromEntries(p.mechanism.bodies.map(b=>[b.id,{position:b.position,rotation:b.rotation}]));
  const joints=Object.fromEntries(p.mechanism.joints.filter(j=>j.type==='hinge').map(j=>[j.id,{angle:0}]));
  const frame={t:0,bodies,joints};
  return measureRotations({...p,track:[frame,{...frame,t:1}]},markers,{repo:INTAKE_ROOT});
 };
 await assert.rejects(()=>observe(6),/perpendicular.*spider/);
 const precise=await observe(12);assert.equal(Object.keys(precise.owners).length,8);
});

test('actual LDR, MPD and Studio file exports retain precise authored placement matrices',async()=>{
 const {saveModelFile,openModelFile}=await import('../overlay/scratch-gui/src/lib/bw-sim/model/model-file.js');
 const original=prepareModel(intakeRead('overlay/scratch-gui/static/sim-lab/models/vernier-drive.ldr').toString(),catalog,{autoPorts:false,mat:'plain'});
 for(const format of ['ldr','mpd','io']){
  const saved=await saveModelFile(original.model,format,{name:'vernier-drive.ldr'});
  const bytes=typeof saved.data==='string'?new TextEncoder().encode(saved.data):saved.data;
  const opened=await openModelFile(saved.filename,bytes);
  const prepared=prepareModel(opened.text,catalog,{autoPorts:false,mat:'plain'});
  bindSixBrowserSource('vernier-drive',prepared);
  const expected=prepareModel(serializeModel(original.model,{precision:12}),catalog,{autoPorts:false,mat:'plain'});
  assert.deepEqual(prepared.model,expected.model);
 }
});

test('sampled hold boundaries use integer ticks without admitting a physically short hold',async()=>{
 const {withinSampledFrame}=await import('../scripts/lib/sim-lab-sampled-time.mjs');
 const frame=1000/30;
 for(const start of [0,1000,40000,1000000])for(const required of [500,1000,1500]){
  const ticks=Math.round(required/frame)-1,end=start+ticks*frame;
  assert.equal(withinSampledFrame(start,end,frame,required),true,'exact one-frame boundary');
  assert.equal(withinSampledFrame(start,end-.000001,frame,required),false,'one nanosecond below the boundary');
  assert.equal(withinSampledFrame(start,end-5,frame,required),false,'one actual physics step short');
  assert.equal(withinSampledFrame(start,end-frame,frame,required),false,'one more observation frame short');
 }
 assert.equal(withinSampledFrame(0,475,25,500),true);
 assert.equal(withinSampledFrame(0,470,25,500),false);
});
