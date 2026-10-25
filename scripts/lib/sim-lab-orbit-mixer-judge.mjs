// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const conj=([x,y,z,w])=>[-x,-y,-z,w],wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const rotate=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const unwrap=xs=>{let last=xs[0],total=last;return xs.map(x=>{total+=wrap(x-last);last=x;return total;});};
export function judgeOrbitMixer(id,r){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.track.length>100);
 const {mechanism:m,track}=r,body=p=>m.bodies.find(b=>b.parts.includes(p)),base=body('hub');
 const angle=p=>{const a=unwrap(track.map(f=>{const q=mul(conj(f.bodies[base.id].rotation),f.bodies[body(p).id].rotation);return 2*Math.atan2(q[1],q[3]);}));return a.map(v=>(v-a[0])*180/Math.PI);};
 const [C,S,P]=['carrier_top','sun_gear','planet_gear'].map(angle);
 const planetaryErrorDeg=Math.max(...P.map((p,k)=>Math.abs(p-8/3*C[k]+5/3*S[k]))),carrierTravelDeg=Math.max(...C)-Math.min(...C),returnErrorDeg=Math.abs(P.at(-1));
 let radiusErrorMm=0,baseDriftMm=0;
 const centre=m.joints.find(j=>j.id===m.actuators.find(a=>a.port==='B').joint).point;
 const planet=m.joints.find(j=>j.body2===body('planet_gear').id&&j.body1===body('carrier_top').id).point;
 const point=(f,b,p)=>rotate(f.bodies[b.id].rotation,p.map((v,k)=>v-b.position[k])).map((v,k)=>v+f.bodies[b.id].position[k]);
 for(const f of track){
  for(const pose of Object.values(f.bodies))assert.ok([...pose.position,...pose.rotation].every(Number.isFinite));
  const a=point(f,base,centre),b=point(f,body('planet_gear'),planet);const delta=rotate(conj(f.bodies[base.id].rotation),b.map((v,k)=>v-a[k]));radiusErrorMm=Math.max(radiusErrorMm,Math.abs(Math.hypot(delta[0],delta[2])-.032)*1000);
  baseDriftMm=Math.max(baseDriftMm,Math.hypot(...f.bodies[base.id].position.map((v,k)=>v-track[0].bodies[base.id].position[k]))*1000);
  assert.ok(rotate(f.bodies[base.id].rotation,[0,1,0])[1]>.999,'upright base');
 }
 assert.ok(planetaryErrorDeg<.2,'physical paddle obeys the planetary relation');
 assert.ok(carrierTravelDeg>(id.endsWith('steps')?89:359),'physical carrier completes the experiment');
 assert.ok(returnErrorDeg<1,'physical paddle returns home');assert.ok(radiusErrorMm<.1,'planet shaft follows a 32 mm orbit');assert.ok(baseDriftMm<1,'stable base');
 return {planetaryErrorDeg,carrierTravelDeg,returnErrorDeg,radiusErrorMm,baseDriftMm};
}
