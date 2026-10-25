// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {magneticForce} from '../overlay/scratch-gui/src/lib/bw-sim/physics/magnet.js';
import {DEFAULT_MAGNET_FIELD as P} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/magnet.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
const I=[1,0,0,0,1,0,0,0,1];
test('declared attraction is finite, capped, central, smoothly range-limited and vanishes on retraction',()=>{
 const force=d=>magneticForce([0,0,0],[0,d,0],[0,1,0],[0,-1,0],P);
 assert.ok(Math.abs(force(.0028)[1]+.3)<1e-12);assert.ok(Math.abs(force(.004)[1])<.3);
 for(const d of [1e-9,.0001,.001,.005,.008,.0139]){const f=force(d);assert.ok(f.every(Number.isFinite));assert.ok(Math.hypot(...f)<=P.maxForceN+1e-12);assert.ok(f[0]===0&&f[2]===0);}
 assert.ok(Math.abs(force(.0139)[1])<1e-6);assert.deepEqual(force(.0348),[0,0,0]);assert.deepEqual(force(0),[0,0,0]);
 assert.deepEqual(magneticForce([0,0,0],[0,.0028,0],[0,-1,0],[0,1,0],P),[0,0,0],'back faces do not couple');
});
const fixture=(gap=.006,enabled=true)=>{
 const meta=(part,role,axis)=>({part,name:part,category:'fixture',massGrams:100,colliders:[{shape:'box',halfExtents:[2,2,2]}],connectors:[{id:'face',type:'magnet-face',position:[0,0,0],axis,data:{role,field:{referenceForceN:enabled?.02:0}}}]});
 const catalog=new Map([['source.dat',meta('source.dat','emitter',[1,0,0])],['target.dat',meta('target.dat','target',[-1,0,0])]]);
 const model={version:1,parts:[{id:'a',part:'source.dat',position:[-gap/2/.0004,-2500,0],rotation:I},{id:'b',part:'target.dat',position:[gap/2/.0004,-2500,0],rotation:I}]};
 const m=compile(model,catalog,{ground:false,version:2});return {m,a:m.bodies.find(b=>b.parts.includes('a')).id,b:m.bodies.find(b=>b.parts.includes('b')).id};
};
test('Jolt applies equal/opposite forces to independent colliding bodies and replays deterministically',async()=>{
 const {m,a,b}=fixture();assert.equal(m.couplings.filter(c=>c.kind==='magneticField').length,1);assert.deepEqual(m.noCollide,[],'a magnetic field never disables contact');assert.equal(m.joints.length,0,'no welded or prescribed-position pickup');
 const core=createPhysicsCore(await loadJolt(),m,{stepHz:200});try{
  core.checkpoint();for(let i=0;i<20;i++)core.step(.005);const end=[core.bodyPose(a),core.bodyPose(b)],gap=end[1].position[0]-end[0].position[0];assert.ok(gap<.006-1e-5&&gap>.002,'finite force closes the physical gap');
  assert.ok(Math.abs(end[0].position[0]+end[1].position[0])<1e-9,'reaction preserves horizontal centre of mass');assert.ok(Math.abs(core.bodyLinearVelocity(a)[0]+core.bodyLinearVelocity(b)[0])<1e-9,'reaction preserves horizontal momentum');
  core.rollback();for(let i=0;i<20;i++)core.step(.005);assert.deepEqual([core.bodyPose(a),core.bodyPose(b)],end);
 }finally{core.destroy();}
 for(const [gap,enabled]of [[.0348,true],[.006,false]]){const f=fixture(gap,enabled),c=createPhysicsCore(await loadJolt(),f.m,{stepHz:200});try{for(let i=0;i<20;i++)c.step(.005);assert.ok(Math.abs(c.bodyPose(f.b).position[0]-c.bodyPose(f.a).position[0]-gap)<1e-9,'retraction or zero field leaves objects free');}finally{c.destroy();}}
});
