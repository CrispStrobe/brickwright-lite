// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Measure explicitly named, body-carried vectors. Expected ratios never create
// or repair an observed pose, angle, or unwrapped revolution count.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const unit=a=>{const n=norm(a);assert.ok(Number.isFinite(n)&&n>1e-10,'Finite nonzero marker vector');return a.map(v=>v/n);};
const degrees=a=>a*180/Math.PI;
const clamp=a=>Math.max(-1,Math.min(1,a));
const unwrap=angles=>{
 assert.ok(angles.length>0,'Nonempty angle samples required');
 let prev=angles[0],total=prev;
 return angles.map(a=>{total+=Math.atan2(Math.sin(a-prev),Math.cos(a-prev));prev=a;return total;});
};

export async function measureRotations(run,markers,{repo}){
 const {observeAddon}=await import(pathToFileURL(path.join(repo,'scripts/lib/sim-lab-addon-judge.mjs')).href);
 assert.ok(run.track.length>1,'Actual recorded native frames required');
 const unique=id=>{
  const owners=run.mechanism.bodies.filter(b=>b.parts.includes(id));
  assert.equal(owners.length,1,'Marker must have exactly one body owner: '+id);
  return owners[0];
 };
 const base=unique(markers.basePart),defs=markers.rotationMarkers;
 assert.ok(defs&&Object.keys(defs).length>=4,'Input, both branches, and carrier markers required');
 const owners={};
 const data=Object.fromEntries(Object.entries(defs).map(([name,m])=>{
  const body=unique(m.part),relative=unique(m.relativeTo||markers.basePart);
  assert.notEqual(body.id,relative.id,'Rotating marker must be independent from its reference frame: '+name);
  for(const key of ['pivotLocal','tipLocal','axisLocal'])assert.ok(Array.isArray(m[key])&&m[key].length===3&&m[key].every(Number.isFinite),name+'.'+key+' must be explicit');
  const o=observeAddon(run,m.relativeTo||markers.basePart),p0=o.initial(m.part,m.pivotLocal),r0=sub(o.initial(m.part,m.tipLocal),p0),axis=unit(sub(o.initial(m.part,m.axisLocal),o.initial(m.part))),ref=unit(r0);
  assert.ok(norm(r0)>.0003,'Marker radius must exceed 0.3 mm: '+name);
  assert.ok(Math.abs(dot(ref,axis))<1e-7,'Marker radial vector must be perpendicular to its declared axis: '+name);
  owners[name]={part:m.part,body:body.id,relativePart:m.relativeTo||markers.basePart,relativeBody:relative.id,pivotLocal:m.pivotLocal,tipLocal:m.tipLocal,axisLocal:m.axisLocal,initialRadiusMm:norm(r0)*1000};
  const frames=run.track.map(f=>{
   const pivot=o.point(f,m.part,m.pivotLocal),tip=o.point(f,m.part,m.tipLocal),r=sub(tip,pivot),u=unit(r),carriedAxis=unit(o.vector(f,m.part,axis));
   return {wrappedRad:Math.atan2(dot(axis,cross(ref,u)),dot(ref,u)),pivotMm:pivot.map(v=>v*1000),tipMm:tip.map(v=>v*1000),radiusMm:norm(r)*1000,axisMismatchDeg:degrees(Math.acos(clamp(dot(carriedAxis,axis)))),centerDriftMm:norm(sub(pivot,p0))*1000};
  });
  const angles=unwrap(frames.map(f=>f.wrappedRad));
  return[name,frames.map((f,i)=>({...f,angleDeg:degrees(angles[i]),stepDeg:i?degrees(angles[i]-angles[i-1]):0}))];
 }));
 const o=observeAddon(run,markers.basePart),motor=run.mechanism.actuators.find(a=>a.port==='A');
 assert.ok(motor,'One explicit motor A required');
 const rows=run.track.map((f,i)=>{
  const rotations=Object.fromEntries(Object.entries(data).map(([name,frames])=>[name,frames[i]]));
  const baseRotationDeg=degrees(2*Math.acos(clamp(Math.abs(dot(f.bodies[base.id].rotation,base.rotation)))));
  const baseTranslationMm=norm(sub(f.bodies[base.id].position,base.position))*1000;
  return {t:f.t,phase:f.phase,encoderDeg:degrees(f.joints[motor.joint].angle),rotations,baseTiltDeg:o.tilt(f),baseRotationDeg,baseTranslationMm,compiledHingeGapMm:o.gap(f),compiledAxisMismatchDeg:o.axisGap(f),variables:f.extra?.variables||{},busy:f.busy||{},finite:Object.values(f.bodies).every(p=>[...p.position,...p.rotation].every(Number.isFinite))&&Object.values(f.joints).every(j=>Object.values(j).filter(x=>typeof x==='number').every(Number.isFinite))&&Object.values(rotations).every(r=>Object.values(r).filter(x=>typeof x==='number').every(Number.isFinite))};
 });
 return{rows,owners,baseBody:base.id,motorJoint:motor.joint};
}
