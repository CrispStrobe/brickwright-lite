// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(v,s)=>v.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w];
const rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),carry=(p,b,v)=>add(p.position,rot(mul(p.rotation,conj(b.rotation)),sub(v,b.position)));
export function judgeStraightEightRun(r){
 const {mechanism:m,track,hubId}=r;assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(track.length>150);
 const body=id=>{const b=m.bodies.find(b=>b.parts.includes(id));assert.ok(b,id);return b;};
 const base=m.bodies.find(b=>b.id===hubId),crank=body('crank'),marker=body('markerQ'),origin=body('origin_pivot_axle'),pbody=body('pivotP');
 const motor=m.joints.find(j=>j.motor),oj=m.joints.find(j=>[j.body1,j.body2].includes(base.id)&&[j.body1,j.body2].includes(origin.id));
 const pj=m.joints.find(j=>[j.body1,j.body2].includes(crank.id)&&[j.body1,j.body2].includes(pbody.id));
 const axis=motor.axis,os=sub(motor.point,oj.point),planar=sub(os,scale(axis,dot(os,axis))),a=Math.hypot(...planar),ex=scale(planar,1/a),ey=cross(axis,ex);
 assert.ok(Math.abs(a-.048)<1e-6,'48 mm fixed pivot distance');
 let straightness=0,equation=0,inversion=0,closure=0;const ys=[],angles=[];
 for(const f of track){
  const root=f.bodies[base.id],q=mul(root.rotation,conj(base.rotation)),x=rot(q,ex),y=rot(q,ey),o=carry(root,base,oj.point),s=carry(root,base,motor.point);
  const p=carry(f.bodies[crank.id],crank,pj.point),tip=carry(f.bodies[marker.id],marker,marker.position),sp=sub(p,s),oq=sub(tip,o),op=sub(p,o);
  const theta=Math.atan2(dot(sp,y),dot(sp,x)),qx=dot(oq,x),qy=dot(oq,y);
  straightness=Math.max(straightness,Math.abs(qx-.042666666667));equation=Math.max(equation,Math.abs(qy-.042666666667*Math.tan(theta/2)));
  inversion=Math.max(inversion,Math.abs(Math.hypot(dot(oq,x),dot(oq,y))*Math.hypot(dot(op,x),dot(op,y))-.004096));
  ys.push(qy);angles.push(theta);
  assert.ok(rot(q,[0,1,0])[1]>.995,'base stays upright');
  for(const b of Object.values(f.bodies)){assert.ok([...b.position,...b.rotation].every(Number.isFinite));assert.ok(Math.hypot(...sub(b.position,root.position))<.5,'assembly remains together');}
  for(const j of m.joints){const b1=m.bodies.find(b=>b.id===j.body1),b2=m.bodies.find(b=>b.id===j.body2);if(!b1||!b2||!f.bodies[b1.id]||!f.bodies[b2.id])continue;
   closure=Math.max(closure,Math.hypot(...sub(carry(f.bodies[b1.id],b1,j.point),carry(f.bodies[b2.id],b2,j.point))));}
 }
 assert.ok(straightness<.00025,'physical marker straightness');assert.ok(equation<.00035,'physical marker follows Peaucellier equation');assert.ok(inversion<.000035,'inversion product');assert.ok(closure<.00025,'closed physical hinge loops');
 assert.ok(Math.max(...angles)>1.03&&Math.min(...angles)<-1.03&&angles.every(x=>Math.abs(x)<1.065),'bounded physical +/-60 degree crank sweep');
 const stroke=Math.max(...ys)-Math.min(...ys);assert.ok(Math.abs(stroke-.049267223)<.0007,'physical marker stroke');
 assert.ok(Math.abs(ys.at(-1))<.00025&&Math.abs(angles.at(-1))<.01,'physical return home');assert.ok(!track.at(-1).busy.A,'program finishes');
 return {pieces:113,strokeMm:stroke*1000,straightnessMm:straightness*1000,equationErrorMm:equation*1000,closureMm:closure*1000,inversionErrorM2:inversion};
}
