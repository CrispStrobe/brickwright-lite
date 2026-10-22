// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {partDrivenJoints} from '../contracts.js';
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const phaseVector=(v,axis,degrees)=>{
 const t=degrees*Math.PI/180,c=Math.cos(t),s=Math.sin(t),dot=v.reduce((a,x,i)=>a+x*axis[i],0),k=cross(axis,v);
 return v.map((x,i)=>x*c+k[i]*s+axis[i]*dot*(1-c));
};
export const phasePoint=(v,joint,degrees)=>phaseVector(v.map((x,i)=>x-joint.point[i]),joint.axis,degrees).map((x,i)=>x+joint.point[i]);
export const motorPhaseMeta=(meta,degrees=0)=>{
 if(!degrees)return meta;
 const driven=partDrivenJoints(meta);if(driven.length!==1)return meta;
 const j=driven[0].joint,ids=new Set(j.movingConnectors),moving=new Set(j.movingColliders);
 const a=j.axis,half=degrees*Math.PI/360,q=[...a.map(x=>x*Math.sin(half)),Math.cos(half)];
 const mul=([x,y,z,w],[b,c,d,e])=>[w*b+x*e+y*d-z*c,w*c-x*d+y*e+z*b,w*d+x*c-y*b+z*e,w*e-x*b-y*c-z*d];
 return {...meta,connectors:meta.connectors.map(c=>ids.has(c.id)?{...c,position:phasePoint(c.position,j,degrees),axis:phaseVector(c.axis,j.axis,degrees)}:c),
  colliders:meta.colliders.map((c,i)=>moving.has(i)?{...c,position:phasePoint(c.position||[0,0,0],j,degrees),rotation:mul(q,c.rotation||[0,0,0,1])}:c)};
};
