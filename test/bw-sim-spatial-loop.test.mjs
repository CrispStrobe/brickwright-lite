// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';
import {spatialLoopSliders} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/spatial-loop.js';
const fixture=()=>({bodies:Array.from({length:6},(_,i)=>({id:'b'+i,massKg:i===0?1:.01,position:[i,0,0]})),joints:Array.from({length:6},(_,i)=>({id:'j'+i,type:'hinge',body1:'b'+i,body2:'b'+((i+1)%6),axis:i<3?[1,0,0]:[0,0,1],point:[i,0,0]}))});
test('only two orthogonal three-parallel-hinge chains receive the exact passive platform constraint',()=>{
 const {joints,bodies}=fixture(),out=spatialLoopSliders(joints,bodies);assert.equal(out.length,1);assert.equal(out[0].body1,'b0');assert.equal(out[0].body2,'b3');assert.deepEqual(out[0].axis,[0,-1,0]);assert.equal(out[0].relaxed.type,'ball');assert.equal(out[0].closureOf.length,6);assert.equal(out[0].motor,undefined);assert.equal(out[0].limits,undefined);
 for(const mutate of [js=>js.pop(),js=>js[2].type='ball',js=>js[1].axis=[0,1,0],js=>js.forEach(j=>j.axis=[1,0,0]),js=>js[1].axis=[Math.cos(.001),Math.sin(.001),0],js=>js.push({id:'chord',type:'hinge',body1:'b0',body2:'b3',axis:[1,0,0],point:[0,0,0]})]){const f=fixture();mutate(f.joints);assert.deepEqual(spatialLoopSliders(f.joints,f.bodies),[]);}
});
test('a driven or coupled elbow is retained; no eligible closure means no relaxation',()=>{
 const {joints,bodies}=fixture();const protectedJoints=new Set(['j1','j4']);assert.deepEqual(spatialLoopSliders(joints,bodies,{coupled:protectedJoints}),[]);joints[1].motor={port:'A'};joints[4].limits=[-.1,.1];assert.deepEqual(spatialLoopSliders(joints,bodies),[]);
});
