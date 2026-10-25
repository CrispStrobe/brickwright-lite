// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';import {createBatchObserver} from '../tools/model-api/lib/observations.mjs';
const I=[1,0,0,0,1,0,0,0,1],q=deg=>[0,Math.sin(deg*Math.PI/360),0,Math.cos(deg*Math.PI/360)];
function scene(initial=0){let angle=initial;const mechanism={gravity:[0,-9.81,0],bodies:[{id:'b',parts:['p'],position:[0,0,0],rotation:q(initial),massKg:.1,motion:'dynamic'}],joints:[],couplings:[]},core={bodyPose:()=>({position:[0,0,0],rotation:q(angle)}),bodyLinearVelocity:()=>[0,0,0],bodyAngularVelocity:()=>[0,0,0]};return{session:{mechanism,core,runModel:{parts:[{id:'p',position:[0,0,0],rotation:I}]}},angle:v=>{angle=v;}};}
test('local markers preserve the initial body frame and use actual rotating part axes',()=>{
 const s=scene(90),reader=createBatchObserver(s.session,[{id:'x',kind:'pointCoordinate',point:{part:'p',localLdu:[10,0,0]},axis:'x'},{id:'z',kind:'pointCoordinate',point:{part:'p',localLdu:[10,0,0]},axis:'z'},{id:'local',kind:'pointCoordinate',point:{part:'p',localLdu:[10,0,0]},reference:{part:'p'},axis:'x'}]);let r=reader.read();assert.ok(Math.abs(r[0].value-4)<1e-9);assert.ok(Math.abs(r[1].value)<1e-9);s.angle(180);r=reader.read();assert.ok(Math.abs(r[0].value)<1e-9);assert.ok(Math.abs(r[1].value+4)<1e-9);assert.ok(Math.abs(r[2].value-4)<1e-9);
});
test('signed observed rotation unwraps across complete turns; degenerate and missing targets are unavailable',()=>{
 const s=scene(),reader=createBatchObserver(s.session,[{id:'phase',kind:'signedAngle',point:{part:'p'},axis:'y',vectorLdu:[1,0,0]},{id:'bad-axis',kind:'signedAngle',point:{part:'p'},axis:'y',vectorLdu:[0,1,0]},{id:'missing',kind:'pointCoordinate',point:{part:'absent'},axis:'x'}]);let r;for(let d=0;d<=450;d+=45){s.angle(d);r=reader.read();}assert.ok(Math.abs(r[0].value-450)<1e-9);assert.equal(r[1].available,false);assert.equal(r[1].value,null);assert.equal(r[2].available,false);assert.equal(r[2].reason,'missing-target');
});
