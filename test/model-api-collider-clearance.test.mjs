// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';import assert from 'node:assert/strict';
import {pointColliderDistanceLdu,spherePartClearanceMm,partLocalPointLdu} from '../tools/model-api/lib/collider-clearance.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,JSON.stringify({a,b}));
test('beam end caps keep their collider-local offsets instead of moving to the part centre',()=>{
 const cap={shape:'cylinder',radius:9,halfHeight:10,position:[0,0,100]};near(pointColliderDistanceLdu([0,35,109],cap),25);
 const part={part:'beam.dat',position:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1]},meta={part:'beam.dat',colliders:[{shape:'box',halfExtents:[9,10,100]},cap]};
 near(spherePartClearanceMm([0,-.014,-.0436],9.6,part,meta),.4);
 assert.ok(spherePartClearanceMm([0,-.014,-.0436],9.6,part,{...meta,colliders:[{...cap,position:[0,0,0]}]})>20,'omitting the end-cap translation changes the result materially');
});
test('part matrices and collider quaternions are distinct transforms and both are applied',()=>{
 const p={part:'p.dat',position:[100,30,-50],rotation:[0,0,1,0,1,0,-1,0,0]},world=[.0836,-.026,.02];
 partLocalPointLdu(world,p).forEach((v,i)=>near(v,[0,35,109][i]));
 const s=Math.SQRT1_2,c={shape:'cylinder',radius:9,halfHeight:10,position:[10,20,30],rotation:[0,0,s,s]};near(pointColliderDistanceLdu([45,20,30],c),25);
});
test('clearance uses all three dimensions and refuses missing, wrong or unsupported geometry',()=>{
 const c={shape:'box',halfExtents:[9,10,49]},p=[29.4756,-19.9947,52.0348];near(pointColliderDistanceLdu(p,c),Math.hypot(20.4756,9.9947,3.0348));
 const part={part:'p.dat',position:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1]};assert.throws(()=>partLocalPointLdu([0,0,0],{...part,rotation:[2,0,0,0,1,0,0,0,1]}),/orthonormal/);assert.throws(()=>spherePartClearanceMm([0,0,0],9.6,part,{part:'wrong.dat',colliders:[c]}),/mismatched/);assert.throws(()=>pointColliderDistanceLdu([0,0,0],{shape:'mesh'}),/Unsupported/);assert.throws(()=>pointColliderDistanceLdu([0,0,0],{...c,rotation:[0,0,0,2]}),/unit quaternion/);
});
