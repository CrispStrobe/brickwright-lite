// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createRecordedPoseReader,sub,dot,unit} from '../tools/model-api/lib/rigid-poses.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Keep the import-only dependency control separate from real native execution.
const measureSubmission=async(...args)=>(await import('../tools/model-api/native-runner.mjs')).measureSubmission(...args);
const text=readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/sine-shuttle.ldr',import.meta.url),'utf8');
const observerModelText=readFileSync(new URL('./fixtures/bw-sim/machines/gears-idler-24-24-24.ldr',import.meta.url),'utf8');
test('submitted LDR/BW executes in real VM/Jolt and records passive marker motion through the PR1255 reader',async t=>{
 const r=await measureSubmission({model:{name:'sine-shuttle.ldr',text},program:{name:'turn.bw',text:'DEVICE SPIKE\nGLOBAL stage = 1\nWHEN flag clicked:\n  set stage to 2\n  lab start\n  lab run motor A for 360 degrees at 90 degrees per second\n  lab stop motor A hold\n  set stage to 3\n'},settings:{programMs:7000,coldMs:250,afterMs:250,sampleMs:25},measurements:[{id:'x',kind:'pointCoordinate',point:{part:'yoke_end_-100'},reference:{part:'hub'},axis:'x'},{id:'angle',kind:'jointAngle',port:'A'},{id:'mass',kind:'mass',targets:['hub']},{id:'missing',kind:'distance',targets:['hub','absent']},{id:'closure',kind:'hingeGap'},{id:'stage',kind:'programVariable',variable:'stage'}]});
 assert.equal(r.status,'completed');assert.equal(r.input.settings.sampleMs,25);assert.equal(r.measurementDefinitions[0].point.part,'yoke_end_-100');assert.equal(r.measurementDefinitions[0].reference.part,'hub');assert.match(r.input.normalizedMeasurementsSha256,/^[a-f0-9]{64}$/);assert.equal(r.construction.overlapCount,0);assert.equal(r.qualification.status,'not-evaluated');assert.equal(r.topology.parts,105);assert.equal(r.completion.programFinished,true);assert.ok(r.samples.length>100);assert.ok(r.summary[0].span>31&&r.summary[0].span<33);assert.ok(r.summary[1].span>350);assert.ok(r.summary[2].min>0);assert.equal(r.summary[3].min,null);assert.equal(r.availability.find(x=>x.id==='missing').available,false);assert.ok(r.summary[4].max<.5);assert.equal(r.columns[0].unit,'mm');assert.equal(r.summary[5].min,1);assert.equal(r.summary[5].max,3);assert.ok(['cold','program','after'].every(p=>r.samples.some(s=>s.phase===p)));t.diagnostic(JSON.stringify({samples:r.samples.length,summary:r.summary}));
});
test('a submitted idler fixture exposes its actual inferred gear connections without declaring them qualified',async()=>{
 const text=readFileSync(new URL('./fixtures/bw-sim/machines/gears-idler-24-24-24.ldr',import.meta.url),'utf8');
 const r=await measureSubmission({model:{name:'idler.ldr',text},settings:{programMs:500,coldMs:0,afterMs:0,sampleMs:25}});
 assert.equal(r.couplings.count,2);assert.equal(r.couplings.truncated,false);assert.deepEqual(r.couplings.items.map(c=>c.parts.slice().sort()).sort(),[['gIdler','gIn'],['gIdler','gOut']]);assert.equal(r.qualification.status,'not-evaluated');
});
test('5 ms scalar and rigid-pose capture observes every existing physics step with identical 25 ms VM commands',async()=>{
 const text=readFileSync(new URL('./fixtures/bw-sim/machines/gears-idler-24-24-24.ldr',import.meta.url),'utf8');
 const input={model:{name:'idler.ldr',text},program:{name:'turn.bw',text:'DEVICE SPIKE\nWHEN flag clicked:\n  lab run motor A for 90 degrees at 90 degrees per second\n  lab stop motor A hold\n'},settings:{programMs:2500,coldMs:250,afterMs:250,sampleMs:25},measurements:[{id:'input',kind:'jointAngle',port:'A'},{id:'output',kind:'signedAngle',point:{part:'gOut'},reference:{part:'frame'},axis:'y',vectorLdu:[1,0,0]},{id:'tip_x',kind:'pointCoordinate',point:{part:'gOut',localLdu:[20,0,0]},reference:{part:'frame'},axis:'x'}]};
 const regular=await measureSubmission(input),dense=await measureSubmission({...input,settings:{...input.settings,physicsSamples:true,sampleMs:5,poseParts:['frame','gIdler','gOut']}});
 const asset=dense.runtime.engineAsset;assert.equal(asset.available,true);assert.equal(asset.package,'jolt-physics');assert.equal(asset.versionMatchesLock,true);assert.match(asset.lockIntegrity,/^sha512-/);assert.match(asset.entrySha256,/^[a-f0-9]{64}$/);assert.deepEqual(asset,regular.runtime.engineAsset);
 assert.equal(dense.runtime.vmFrameMs,25);assert.equal(dense.runtime.actualSampleMs,5);assert.deepEqual(dense.completion,regular.completion);assert.ok(dense.samples.length>regular.samples.length*4);assert.equal(dense.samples[0].timeMs,0);assert.equal(dense.samples.at(-1).timeMs,dense.completion.sceneTimeMs);
 for(let i=1;i<dense.samples.length;i++)assert.equal(dense.samples[i].timeMs-dense.samples[i-1].timeMs,5);
 const byTime=new Map(dense.samples.map(s=>[s.timeMs,s]));for(const s of regular.samples){const d=byTime.get(s.timeMs);assert.ok(d);for(let i=0;i<s.values.length;i++)assert.ok(Math.abs(d.values[i]-s.values[i])<1e-4,'read-only capture preserves actual native dynamics');}
 assert.equal(dense.poseRecording.completePhysicsSteps,true);assert.equal(dense.poseRecording.frames.length,dense.samples.length);assert.equal(dense.poseRecording.bodyIds.length,3);assert.equal(dense.poseRecording.frames[0].positions.length,3);assert.ok(dense.topology.bodies.every(b=>b.initialPositionM.length===3&&b.initialRotationQuat.length===4));
 const replay=createRecordedPoseReader(dense);assert.ok(replay.parts.has('gOut'));assert.match(dense.poseRecording.placementFrame,/prepared runModel/);
 for(let i=0;i<replay.frames.length;i++){
  const f=replay.frames[i],origin=replay.point(f,'frame'),axis=unit(sub(replay.point(f,'frame',[1,0,0]),origin));
  const x=dot(sub(replay.point(f,'gOut',[20,0,0]),origin),axis)*1000;
  assert.ok(Math.abs(x-dense.samples[i].values[2])<1e-6,'self-contained replay reproduces independent live semantic marker coordinates');
 }
 await assert.rejects(()=>measureSubmission({...input,settings:{...input.settings,poseParts:['absent']}}),e=>e.code==='pose-target-unavailable');
});
test('the same uploaded root MPD produces the same bounded native output law',async()=>{
 const r=await measureSubmission({model:{name:'shuttle.mpd',text:'0 FILE shuttle.ldr\n'+text+'\n0 NOFILE\n'},settings:{programMs:500,coldMs:250,afterMs:0,sampleMs:25},measurements:[{id:'mass',kind:'mass',targets:['hub']} ]});assert.equal(r.status,'completed');assert.equal(r.topology.parts,105);assert.ok(r.summary[0].min>0);
});


test('native provider factory imports use the declared GUI boundary without starting physics',async()=>{
 const providers=await Promise.all([import('jolt-physics/wasm-compat'),import('jolt-physics/wasm-simd-compat')]);
 assert.ok(providers.every(provider=>typeof provider.default==='function'));
 // No provider factory, world, worker, VM or simulation is constructed in this control.
});

test('optional setup observation preserves actual VM commands, 25ms cadence and every native snapshot',async()=>{
 const {runRobotLabProgram}=await import('./helpers/robot-lab-direct-vm.mjs');
 const modelText=observerModelText;
 const source='DEVICE SPIKE\nWHEN flag clicked:\n  lab run motor A for 90 degrees at 90 degrees per second\n  lab stop motor A hold\n';
 const options={modelText,timeLimitMs:2500,frameMs:25,coldMs:250,afterMs:250};
 const baseline=await runRobotLabProgram(source,options),repeat=await runRobotLabProgram(source,options);
 assert.deepEqual(repeat.track,baseline.track,'default native runs establish exact repeatability before attributing an observer difference');
 assert.equal(repeat.finishedAt,baseline.finishedAt);let installed=0;const observations=[];
 const observed=await runRobotLabProgram(source,{...options,observeSetup:({session,prepared})=>{
  installed++;assert.equal(session.bridge.stepMs,5);const bridge=session.bridge,original=bridge.step.bind(bridge);
  const body=prepared.mechanism.bodies.find(b=>b.motion==='dynamic'),joint=prepared.mechanism.joints.find(j=>j.type==='hinge'&&j.motor?.port==='A');assert.ok(body&&joint);
  // The existing API's dense observer shape: one original step, only reads afterward, identical return value.
  bridge.step=(...args)=>{const value=original(...args);assert.ok(observations.length<2048);observations.push({time:bridge.timeMs,pose:session.core.bodyPose(body.id),joint:session.core.jointState(joint.id)});return value;};
 }});
 assert.equal(installed,1);assert.ok(observations.length>observed.track.length*4,'the observer really sampled existing bridge steps');
 for(let i=1;i<observations.length;i++)assert.equal(observations[i].time-observations[i-1].time,5);
 assert.equal(observed.finishedAt,baseline.finishedAt);assert.deepEqual(observed.track,baseline.track,'no extra clock/VM/physics advancement or drive changes');
 assert.ok(baseline.finishedAt>0);assert.ok(observations.some(r=>Math.abs(r.joint.angle)>0.01),'the same real commanded joint moved');
});
