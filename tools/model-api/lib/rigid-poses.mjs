// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Shared live/replay transforms. A body origin is not a semantic part origin.
export const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),scale=(a,n)=>a.map(x=>x*n),norm=a=>Math.hypot(...a),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/norm(a));
export const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],inv=q=>[-q[0],-q[1],-q[2],q[3]],rot=(q,v)=>mul(mul(q,[...v,0]),inv(q)).slice(0,3);
export const world=p=>p.map((v,i)=>v*(i===0?.0004:-.0004));
const fromWorld=p=>p.map((v,i)=>v/(i===0?.0004:-.0004));
const need=(ok,message)=>{if(!ok)throw Error(message);};
export function createRecordedPoseReader(report,placedParts=report.poseRecording?.initialPartPlacements){
 const recording=report.poseRecording;need(recording&&Array.isArray(recording.bodyIds)&&Array.isArray(recording.frames),'Report has no native pose recording');
 need(Array.isArray(placedParts),'Missing prepared runModel part placements; raw authored LDraw coordinates are not sufficient');
 const parts=new Map(placedParts.map(p=>[p.id,p])),bodies=new Map(report.topology.bodies.map(b=>[b.id,b]));
 const frame=f=>{const v=Number.isInteger(f)?recording.frames[f]:f;need(v&&Array.isArray(v.positions)&&Array.isArray(v.rotations),'Missing recorded frame');return v;};
 const bodyOf=(part,preferred)=>{
  const found=[...bodies.values()].filter(b=>b.parts.includes(part));
  const selected=preferred??recording.targets.find(t=>t.part===part)?.body;
  const b=selected?found.find(b=>b.id===selected):(found.length===1?found[0]:null);
  need(b,'Missing or ambiguous body for '+part+'; explicitly select housing versus rotor');
  need(b.initialPositionM?.length===3&&b.initialRotationQuat?.length===4,'Missing initial body transform');return b;
 };
 const pose=(f,id)=>{const b=bodies.get(id),i=recording.bodyIds.indexOf(id);need(b,'Unknown body '+id);if(i<0){need(b.motion==='static','Dynamic body not recorded: '+id);return{position:b.initialPositionM,rotation:b.initialRotationQuat};}const v=frame(f);need(v.positions[i]?.length===3&&v.rotations[i]?.length===4,'Incomplete recorded body pose');return{position:v.positions[i],rotation:v.rotations[i]};};
 const point=(f,id,local=[0,0,0],preferred)=>{
  const p=parts.get(id);need(p&&p.position?.length===3&&p.rotation?.length===9,'Missing authored placement '+id);const b=bodyOf(id,preferred),actual=pose(f,b.id);
  const initial=world(add(p.position,[0,1,2].map(i=>dot(p.rotation.slice(3*i,3*i+3),local))));
  return add(actual.position,rot(actual.rotation,rot(inv(b.initialRotationQuat),sub(initial,b.initialPositionM))));
 };
 const placement=(f,id,preferred)=>{
  const p=parts.get(id),origin=point(f,id,[0,0,0],preferred),columns=[[1,0,0],[0,1,0],[0,0,1]].map(v=>fromWorld(sub(point(f,id,v,preferred),origin)));
  return{...p,position:fromWorld(origin),rotation:[0,1,2].flatMap(i=>columns.map(c=>c[i]))};
 };
 return{parts,bodies,bodyOf,pose,point,placement,frames:recording.frames};
}
