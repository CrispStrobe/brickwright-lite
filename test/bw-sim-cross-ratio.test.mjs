// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readCrossRatio,readCrossRatioLines} from '../scripts/verify-sim-cross-ratio.mjs';
import {judgeCrossRatio} from '../scripts/lib/sim-lab-cross-ratio-judge.mjs';
import {analyticRecord,ANALYTIC_IDENTITY} from './fixtures/bw-sim/cross-ratio/analytic.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),hash=x=>createHash('sha256').update(x).digest('hex');
const C=JSON.parse(read('test/fixtures/bw-sim/cross-ratio/contract.json'));
const check=r=>readCrossRatio(r,{expectedIdentity:ANALYTIC_IDENTITY});
// Synchronous independent consumer preflight precedes even importing the
// native harness. A failed negative control cannot continue into engine cases.
const good=analyticRecord(),cut=analyticRecord(true);
check(good);check(cut);judgeCrossRatio(good);judgeCrossRatio(cut,{control:true});
const corruptions={
 'missing row':r=>r.track.splice(40,1),
 'duplicate row':r=>r.track.splice(40,0,structuredClone(r.track[40])),
 'reordered row':r=>[r.track[40],r.track[41]]=[r.track[41],r.track[40]],
 'nonfinite quaternion':r=>r.track[30].bodies.output.rotation[0]=NaN,
 'nonunit quaternion':r=>r.track[30].bodies.output.rotation[3]=2,
 'wrong input':r=>r.input.program+='\n',
 'wrong CI tree':r=>r.identity.tree='4'.repeat(40),
 'edited summary':r=>r.summary={lawErrorDeg:0},
 'muted input':r=>{for(const f of r.track){f.bodies.input=structuredClone(r.track[0].bodies.input);}},
 'wrong output branch':r=>{r.track[30].bodies.output.rotation=[0,1,0,0];},
 'missing stage':r=>{for(const f of r.track)if(f.extra.variables.stage===5)f.extra.variables.arrived=0;},
 'whole assembly control':r=>{r.variant='remove-pivot-P';r.mechanism.bodies.pop();},
 'forged completion':r=>r.track.at(-1).extra.variables.failed=1,
 'early hold end':r=>r.track.pop(),
 'wrong control bytes':r=>{r.variant='remove-pivot-P';}
};
for(const [name,mutate]of Object.entries(corruptions)){
 const r=structuredClone(good);mutate(r);assert.throws(()=>check(r),undefined,name);
}
const signs=structuredClone(good);
for(const f of signs.track)for(const p of Object.values(f.bodies))p.rotation=p.rotation.map(x=>-x);
assert.deepEqual(check(signs),check(good),'quaternion sign is not a physical change');
const shifted=structuredClone(good);for(const f of shifted.track)for(const p of Object.values(f.bodies))p.position[0]+=.001;
// A global translation changes neither a relative law nor true hinge closure.
assert.ok(check(shifted).lawErrorDeg<1e-8);
assert.throws(()=>readCrossRatio(good),/external/);
assert.throws(()=>readCrossRatioLines('',{expectedIdentity:ANALYTIC_IDENTITY}));
test('Cross Ratio: independent circle fixtures, 15 corruptions, sign and translation controls',()=>assert.equal(Object.keys(corruptions).length,15));
const {runRobotLabProgram}=await import('./helpers/robot-lab-direct-vm.mjs');
const {catalogFrom,prepareModel}=await import('../overlay/scratch-gui/src/lib/bw-sim/sim-session.js');
const original=read('overlay/scratch-gui/static/sim-lab/models/cross-ratio.ldr'),program=read('overlay/scratch-gui/static/sim-lab/programs/cross-ratio.bw');
const removed=original.replace(/^0 !BW ID pivot_axle_P\n(?:0 [^\n]*\n)*1 [^\n]*\n/gm,'');
assert.equal(hash(original),C.modelSha256);assert.equal(hash(program),C.programSha256);assert.notEqual(original,removed);
const catalogue=read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'),catalog=catalogFrom(JSON.parse(catalogue));
const prepared=[original,removed].map(text=>prepareModel(text,catalog,{mat:'plain',autoPorts:false}));
assert.equal(prepared[0].mechanism.joints.length-prepared[1].mechanism.joints.length,1,'only one physical hinge removed');
assert.equal(prepared[0].mechanism.bodies.length,5);assert.equal(prepared[1].mechanism.bodies.length,5);
for(const p of prepared){assert.equal(p.mechanism.actuators.length,1);assert.equal(p.mechanism.actuators[0].port,'A');}
const identity={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),files:Object.fromEntries([
 'vendor-pins.json','package-lock.json','scripts/lib/gui-scope-allowed.json',
 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',
 'overlay/scratch-gui/src/lib/bw-sim/sim-session.js','overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',
 'test/helpers/robot-lab-direct-vm.mjs','test/bw-sim-cross-ratio.test.mjs',
 'test/fixtures/bw-sim/cross-ratio/contract.json','scripts/verify-sim-cross-ratio.mjs',
 'scripts/lib/sim-lab-cross-ratio-judge.mjs'].map(p=>[p,hash(readFileSync(new URL('../'+p,import.meta.url)))]))};
for(const coldMs of C.timing.coldMs)for(const control of [false,true])test(`Cross Ratio actual VM/Jolt: ${control?'remove P':'original'}, cold ${coldMs}ms`,{timeout:240000},async()=>{
 const vmErrors=[];let setup;
 const r=await runRobotLabProgram(program,{modelText:control?removed:original,catalog,autoPorts:false,frameMs:25,coldMs,afterMs:C.timing.afterMs,timeLimitMs:C.timing.timeLimitMs,
  observeSetup:({session,vm,prepared})=>{
   vm.runtime.on('ERROR',e=>vmErrors.push(String(e)));vm.runtime.on('BLOCKS_ERROR',e=>vmErrors.push(String(e)));vm.on('BLOCKS_ERROR',e=>vmErrors.push(String(e)));
   setup={t:0,phase:'cold',bodies:Object.fromEntries(prepared.mechanism.bodies.filter(b=>b.motion==='dynamic').map(b=>[b.id,session.core.bodyPose(b.id)])),busy:{A:false},extra:{variables:{},modes:{A:'idle'}}};
  },
  observeFrame:({vm,hub,session})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:{A:hub.motors._controllers[0].mode},sessionFailed:session.failed?String(session.failed):null})});
 if(r.track[0].t!==0)r.track.unshift(setup);
 // Keep raw failure records before any acceptance assertion. NDJSON avoids
 // one enormous log line; the existing unit artifact retains the original TAP.
 const record={...r,schema:1,kind:'cross-ratio-native',identity,contractSha256:hash(read('test/fixtures/bw-sim/cross-ratio/contract.json')),variant:control?'remove-pivot-P':'original',input:{originalModel:original,program,model:control?removed:original,modelSha256:hash(control?removed:original)},timing:{...C.timing,coldMs},vmErrors};
 const {track,...header}=record;console.log('CROSS_RATIO '+JSON.stringify({type:'header',record:header}));
 for(const frame of track)console.log('CROSS_RATIO '+JSON.stringify({type:'frame',frame}));
 console.log('CROSS_RATIO '+JSON.stringify({type:'end',record:{finishedAt:r.finishedAt}}));
 assert.ok(r.track.every(f=>!f.extra.sessionFailed));
 judgeCrossRatio(r,{control});
 const independent=readCrossRatio(record,{expectedIdentity:identity});
 console.log('Cross Ratio independently checked '+JSON.stringify({control,coldMs,...independent}));
});
