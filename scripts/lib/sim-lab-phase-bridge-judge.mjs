// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,k)=>x-b[k]),add=(a,b)=>a.map((x,k)=>x+b[k]);
const rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const unwrap=xs=>{let last=xs[0],t=last;return xs.map(x=>{t+=wrap(x-last);last=x;return t;});};
export function judgePhaseBridge(id,r){
 const {mechanism:m,track}=r,misphased=id==='phase-bridge-misphased';
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(track.length>100);
 const base=m.bodies.find(b=>b.parts.includes('hub')),body=part=>m.bodies.find(b=>b.parts.includes(part));
 const angles=['input_axle','middle_axle','output_axle'].map(part=>{
  const b=body(part),j=m.joints.find(j=>[j.body1,j.body2].includes(b.id));
  return unwrap(track.map(f=>{const q=mul(conj(f.bodies[base.id].rotation),f.bodies[b.id].rotation);return 2*Math.atan2(dot(q.slice(0,3),j.axis),q[3]);}));
 });
 const [input,middle,output]=angles;let middleError=0,outputError=0,lead=0,outputLead=0,closure=0;
 const carry=(f,b,p)=>add(f.bodies[b.id].position,rot(f.bodies[b.id].rotation,sub(p,b.position)));
 const pairs=m.couplings.filter(c=>c.kind==='universalJoint');assert.equal(pairs.length,2);
 for(let i=0;i<track.length;i++){
  const f=track[i],theta=input[i];
  middleError=Math.max(middleError,Math.abs(wrap(middle[i]-Math.atan2(Math.sin(theta),.8*Math.cos(theta)))));
  outputError=Math.max(outputError,Math.abs(wrap(output[i]-(misphased?Math.atan2(Math.sin(theta),.64*Math.cos(theta)):theta))));
  lead=Math.max(lead,Math.abs(middle[i]-theta));outputLead=Math.max(outputLead,Math.abs(output[i]-theta));
  assert.ok(rot(f.bodies[base.id].rotation,[0,1,0])[1]>.995,'base stays upright');
  for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite),'finite poses');
  for(const c of pairs){const a=m.bodies.find(b=>b.id===c.body1),b=m.bodies.find(b=>b.id===c.body2);closure=Math.max(closure,Math.hypot(...sub(carry(f,a,c.point),carry(f,b,c.point))));}
 }
 const deg=180/Math.PI;
 assert.ok(Math.max(...input)>6.2,'input makes complete turns');assert.ok(Math.abs(input.at(-1))<2/deg,'input returns home');
 assert.ok(middleError*deg<.2,'physical middle shaft follows the Cardan angle law');assert.ok(outputError*deg<.2,'physical output follows the correct phase law');
 assert.ok(lead*deg>6.2&&lead*deg<6.6,'physical intermediate speed ripple');
 assert.ok(misphased?outputLead*deg>12.5&&outputLead*deg<12.9:outputLead*deg<.2,'fork phase changes physical output ripple');
 assert.ok(closure<.0002,'universal-joint pivots stay together');
 return {middleAngleErrorDeg:middleError*deg,outputAngleErrorDeg:outputError*deg,middleLeadDeg:lead*deg,outputLeadDeg:outputLead*deg,pivotGapMm:closure*1000};
}
