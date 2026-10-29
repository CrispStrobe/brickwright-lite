// SPDX-License-Identifier: BSD-3-Clause
// Synthetic contract controls only; no model, VM or Jolt execution.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {judgeDoorProgrammeOutcome as judge} from '../scripts/lib/sim-lab-paired-door-outcome.mjs';
const ids=['rack_front','rack_back','door_front_0','door_front_1','door_back_0','door_back_1'];
const fixture=(count=40)=>{
    const frames=[];
    for(const [stage,targetA]of [[1,150],[2,0],[3,-150],[4,0]])for(let i=0;i<count;i++)frames.push({t:20*(frames.length+1),variables:{stage,targetA,settled:1,failed:0,correctionAttempts:0},encoderAngleDeg:targetA,markers:Object.fromEntries(ids.map(id=>[id,[0,0,0]]))});
    return {schema:'bw.paired-door.outcome.v1',complete:true,flagDatumEncoderAngleDeg:0,nonfinite:0,vmErrors:[],fixedRows:1,nativeStartSeconds:0,nativeEndSeconds:1,final:{completed:1,failed:0,stage:5},finishedAt:3220,programmeElapsedMs:3220,frames,bindings:ids.map(part=>({part,body:'synthetic'}))};
};
test('minimal synthetic contract passes only programme boundary, never mechanical law',()=>{const r=judge(fixture());assert.equal(r.mechanicalLaw,'NOT_JUDGED');assert.equal(r.promotion,'UNCHANGED_EXPERIMENTAL');});
test('missing stage refuses',()=>{const r=fixture();r.frames.forEach(f=>{if(f.variables.stage===3)f.variables.stage=0;});assert.throws(()=>judge(r),/targetA|settled stage3|one contiguous/);});
test('empty, short, nonfinite and non-array marker vectors refuse',()=>{for(const bad of [[],[0],[0,0],[0,0,NaN],{},null]){const r=fixture();r.frames[0].markers.rack_front=bad;assert.throws(()=>judge(r),/finite3D/);}});
test('negative, nonfinite and nonnumeric programme duration refuse',()=>{for(const bad of [-1,NaN,Infinity,'100']){const r=fixture();r.programmeElapsedMs=bad;assert.throws(()=>judge(r),/nonnegative authored55s/);}});
test('native row count must be positive bounded integer',()=>{for(const bad of [0,-1,.5,12501,NaN]){const r=fixture();r.fixedRows=bad;assert.throws(()=>judge(r),/integer native/);}});
test('correction attempts must be nonnegative bounded integer',()=>{for(const bad of [-1,.5,3,NaN]){const r=fixture();r.frames[0].variables.correctionAttempts=bad;assert.throws(()=>judge(r),/integer correction/);}});
test('39 samples span760ms, plus20ms cannot certify authored800ms',()=>assert.throws(()=>judge(fixture(39)),/800ms hold/));
test('one held frame is not an800ms hold',()=>assert.throws(()=>judge(fixture(1)),/800ms hold/));
test('a missing or repeated frame cannot enlarge edge allowance',()=>{for(const offset of [20,-20]){const r=fixture();r.frames[5].t+=offset;assert.throws(()=>judge(r),/20ms cadence/);}});
test('failed, partial or incomplete outcome refuses',()=>{for(const mutate of [r=>r.complete=false,r=>r.final.failed=1,r=>r.final.completed=0,r=>r.final.stage=4]){const r=fixture();mutate(r);assert.throws(()=>judge(r));}});
test('bad encoder, missing output binding or nonprogressing native clock refuses',()=>{for(const mutate of [r=>r.frames[0].encoderAngleDeg=149,r=>r.bindings.pop(),r=>r.nativeEndSeconds=0]){const r=fixture();mutate(r);assert.throws(()=>judge(r));}});

test('flag datum is distinct from setup and obeys authored2degree bound',()=>{const raw=fixture();raw.setupEncoderAngleDeg=0;raw.flagDatumEncoderAngleDeg=3;assert.throws(()=>judge(raw),/flag-time datum/);});
test('recorded Scratch variables are canonical decimal strings; other strings refuse',()=>{
    const r=fixture();const text=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,String(x)]));
    r.final=text(r.final);r.frames.forEach(f=>{f.variables=text(f.variables);});judge(r);
    for(const bad of ['01','1.0',' 1','','one']){const b=fixture();b.final.completed=bad;assert.throws(()=>judge(b));}
    for(const bad of ['0.0','-0','']){const b=fixture();b.frames[0].variables.correctionAttempts=bad;assert.throws(()=>judge(b),/integer correction/);}
});
