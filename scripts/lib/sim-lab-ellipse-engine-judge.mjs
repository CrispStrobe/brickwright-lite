// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
export function measureEllipseEngine(r){
 const {mechanism:m,track}=r,B=new Map(m.bodies.map(b=>[b.id,b])),base=m.bodies.find(b=>b.parts.includes('hub')),motor=m.joints.find(j=>j.motor),other=m.joints.find(j=>j.type==='hinge'&&j!==motor),sa=m.joints.find(j=>j.type==='slider'&&j.body2===motor.body1),sb=m.joints.find(j=>j.type==='slider'&&j.body2===other.body1),coupler=B.get(motor.body2);
 assert.equal(other.body2,coupler.id);assert.equal(new Set([base.id,motor.body1,other.body1,coupler.id]).size,4);
 const xAxis=sa.axis,zAxis=sb.axis,origin=sub(motor.point,xAxis.map(v=>v*.032));
 const carry=(f,id,p)=>add(f.bodies[id].position,rot(f.bodies[id].rotation,rot(conj(B.get(id).rotation),sub(p,B.get(id).position))));
 const savedMarker=id=>add(coupler.position,coupler.colliders.find(c=>c.part===id).position),red=savedMarker('tip_red'),blue=savedMarker('tip_blue'),baseOrigin=rot(conj(base.rotation),sub(origin,base.position));
 const local=(f,p)=>sub(rot(conj(f.bodies[base.id].rotation),sub(p,f.bodies[base.id].position)),baseOrigin),coords=p=>[dot(p,xAxis),dot(p,zAxis)];
 let previous=0,unwrapped=0;return track.map(f=>{
  const a=coords(local(f,carry(f,motor.body1,motor.point))),b=coords(local(f,carry(f,other.body1,other.point))),v=sub(a,b),angle=Math.atan2(v[1],v[0]);unwrapped+=wrap(angle-previous);previous=angle;
  let pivotGapMm=0;for(const j of [motor,other])pivotGapMm=Math.max(pivotGapMm,Math.hypot(...sub(carry(f,j.body1,j.point),carry(f,j.body2,j.point)))*1000);
  return {t:f.t,phi:unwrapped,encoder:f.joints[motor.id].angle,a,b,red:coords(local(f,carry(f,coupler.id,red))),blue:coords(local(f,carry(f,coupler.id,blue))),pivotGapMm,base:f.bodies[base.id],carriages:[motor.body1,other.body1].map(id=>mul(conj(f.bodies[base.id].rotation),f.bodies[id].rotation))};
 });
}
export function judgeEllipseEngine(id,r){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.equal(r.mechanism.actuators.length,1);assert.equal(r.mechanism.joints.filter(j=>j.type==='slider').length,2);assert.ok(r.track.length>2000);
 for(const f of r.track)for(const p of Object.values(f.bodies))assert.ok([...p.position,...p.rotation].every(Number.isFinite));
 const samples=measureEllipseEngine(r),first=samples[0];let predictionErrorMm=0,pivotGapMm=0,linkErrorMm=0,encoderErrorDeg=0,baseTravelMm=0,carriageRollDeg=0,forward=0,reverse=0,last=0;
 const ideal=phi=>({a:[.032*Math.cos(phi),0],b:[0,-.032*Math.sin(phi)],red:[-.024*Math.cos(phi),-.056*Math.sin(phi)],blue:[.056*Math.cos(phi),.024*Math.sin(phi)]});
 for(const s of samples){const delta=s.phi-last;if(delta>0)forward+=delta;else reverse-=delta;last=s.phi;const expected=ideal(s.phi);
  for(const key of ['a','b','red','blue'])predictionErrorMm=Math.max(predictionErrorMm,Math.hypot(...sub(s[key],expected[key]))*1000);
  pivotGapMm=Math.max(pivotGapMm,s.pivotGapMm);linkErrorMm=Math.max(linkErrorMm,Math.abs(Math.hypot(...sub(s.a,s.b))-.032)*1000);encoderErrorDeg=Math.max(encoderErrorDeg,Math.abs(s.phi-s.encoder)*180/Math.PI);baseTravelMm=Math.max(baseTravelMm,Math.hypot(...sub(s.base.position,first.base.position))*1000);
  for(const q of s.carriages)carriageRollDeg=Math.max(carriageRollDeg,2*Math.acos(Math.min(1,Math.abs(q[3])))*180/Math.PI);
  assert.ok(rot(s.base.rotation,[0,1,0])[1]>.999,'freestanding base stays upright');
 }
 const range=(key,axis)=>{const values=samples.map(s=>s[key][axis]);return (Math.max(...values)-Math.min(...values))*1000;};const dimensions={red:[range('red',0),range('red',1)],blue:[range('blue',0),range('blue',1)],carriages:[range('a',0),range('b',1)]};
 for(const [actual,want]of [[dimensions.red,[48,112]],[dimensions.blue,[112,48]],[dimensions.carriages,[64,64]]])for(let k=0;k<2;k++)assert.ok(Math.abs(actual[k]-want[k])<.1,'actual marker axes and carriage strokes');
 assert.ok(forward>6*Math.PI-.03&&reverse>6*Math.PI-.03,'three physical turns in both directions');assert.ok(predictionErrorMm<.1&&linkErrorMm<.1&&pivotGapMm<.1,'measured output, rigid bar and hinges agree');assert.ok(encoderErrorDeg<.2&&carriageRollDeg<.2&&baseTravelMm<1,'encoder agreement, actual antiroll guides and stable frame');
 const end=samples.at(-1);assert.ok(Math.abs(end.encoder)<2*Math.PI/180);for(const key of ['a','b','red','blue'])assert.ok(Math.hypot(...sub(end[key],first[key]))*1000<.5,'physical output returns home');
 return {predictionErrorMm,pivotGapMm,linkErrorMm,encoderErrorDeg,baseTravelMm,carriageRollDeg,dimensions};
}
