// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRecordedPoseReader} from '../tools/model-api/lib/rigid-poses.mjs';
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-10,JSON.stringify({a,b})));
test('recorded poses carry semantic origins and local markers through the inverse initial body rotation',()=>{
 const s=Math.SQRT1_2,report={topology:{bodies:[{id:'b',motion:'dynamic',parts:['p'],initialPositionM:[.01,.02,.03],initialRotationQuat:[0,0,s,s]}]},poseRecording:{bodyIds:['b'],targets:[{part:'p',body:'b'}],frames:[{positions:[[.05,.06,.07]],rotations:[[0,0,1,0]]}]}},p={id:'p',part:'part.dat',position:[25,-50,-75],rotation:[1,0,0,0,1,0,0,0,1]},reader=createRecordedPoseReader(report,[p]);
 near(reader.point(0,'p'),[.05,.06,.07]);near(reader.point(0,'p',[10,0,0]),[.05,.064,.07]);const placement=reader.placement(0,'p');near(placement.position,[125,-150,-175]);near(placement.rotation,[0,1,0,-1,0,0,0,0,1]);
});
test('a missing dynamic pose or ambiguous split part is refused rather than treated as stationary',()=>{
 const b={id:'a',motion:'dynamic',parts:['p'],initialPositionM:[0,0,0],initialRotationQuat:[0,0,0,1]},p={id:'p',position:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1]},r={topology:{bodies:[b,{...b,id:'b'}]},poseRecording:{bodyIds:['a'],targets:[],frames:[{positions:[[0,0,0]],rotations:[[0,0,0,1]]}]}};
 const reader=createRecordedPoseReader(r,[p]);assert.throws(()=>reader.point(0,'p'),/ambiguous/);near(reader.point(0,'p',[0,0,0],'a'),[0,0,0]);assert.throws(()=>reader.point(0,'p',[0,0,0],'b'),/not recorded/);
});

test('replay uses embedded prepared placements and refuses unavailable import transforms',()=>{
 const p={id:'p',part:'part.dat',position:[100,-50,25],rotation:[0,1,0,1,0,0,0,0,-1]};
 const report={topology:{bodies:[{id:'b',motion:'dynamic',parts:['p'],initialPositionM:[.01,.02,.03],initialRotationQuat:[0,0,0,1]}]},poseRecording:{bodyIds:['b'],targets:[],initialPartPlacements:[p],frames:[{positions:[[.01,.02,.03]],rotations:[[0,0,0,1]]}]}};
 const reader=createRecordedPoseReader(report);near(reader.point(0,'p'),[.04,.02,-.01]);near(reader.placement(0,'p').position,p.position);near(reader.placement(0,'p').rotation,p.rotation);
 delete report.poseRecording.initialPartPlacements;assert.throws(()=>createRecordedPoseReader(report),/prepared runModel/);
});
