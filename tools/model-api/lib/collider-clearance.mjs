// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Primitive envelope observations only; never a substitute for actual mesh checks.
import {sub,dot,rot,inv,norm} from './rigid-poses.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
export function pointColliderDistanceLdu(point,collider){
 need(vector(point,3)&&collider,'Missing finite collider point/definition');
 const position=collider.position??[0,0,0];need(vector(position,3),'Invalid collider offset');let p=sub(point,position);
 if(collider.rotation){need(vector(collider.rotation,4)&&Math.abs(norm(collider.rotation)-1)<1e-6,'Collider rotation must be a unit quaternion');p=rot(inv(collider.rotation),p);}
 const positive=(v)=>Number.isFinite(v)&&v>0;
 if(collider.shape==='box'){need(vector(collider.halfExtents,3)&&collider.halfExtents.every(positive),'Invalid box dimensions');return Math.hypot(...p.map((v,i)=>Math.max(0,Math.abs(v)-collider.halfExtents[i])));}
 if(collider.shape==='sphere'){need(positive(collider.radius),'Invalid sphere radius');return Math.max(0,norm(p)-collider.radius);}
 if(collider.shape==='cylinder'){need(positive(collider.radius)&&positive(collider.halfHeight),'Invalid cylinder dimensions');return Math.hypot(Math.max(0,Math.hypot(p[0],p[2])-collider.radius),Math.max(0,Math.abs(p[1])-collider.halfHeight));}
 if(collider.shape==='capsule'){need(positive(collider.radius)&&Number.isFinite(collider.halfHeight)&&collider.halfHeight>=0,'Invalid capsule dimensions');return Math.max(0,Math.hypot(p[0],Math.max(0,Math.abs(p[1])-collider.halfHeight),p[2])-collider.radius);}
 throw Error('Unsupported collider shape: '+collider.shape);
}
export function partLocalPointLdu(worldPointM,placement){
 need(vector(worldPointM,3)&&vector(placement?.position,3)&&vector(placement?.rotation,9),'Missing prepared part transform');
 const R=placement.rotation;
 for(let i=0;i<3;i++)for(let j=i;j<3;j++)need(Math.abs(dot(R.slice(3*i,3*i+3),R.slice(3*j,3*j+3))-(i===j?1:0))<1e-4,'Part transform must be orthonormal; scaled placements need explicit geometry handling');
 const worldLdu=worldPointM.map((v,i)=>v/(i===0?.0004:-.0004)),d=sub(worldLdu,placement.position);
 return [0,1,2].map(i=>dot([R[i],R[3+i],R[6+i]],d));
}
export function spherePartClearanceMm(worldCenterM,radiusMm,placement,partMeta){
 need(Number.isFinite(radiusMm)&&radiusMm>0,'Missing sphere radius in millimetres');
 need(partMeta?.part===placement?.part&&Array.isArray(partMeta.colliders)&&partMeta.colliders.length>0,'Missing or mismatched part collider metadata');
 const p=partLocalPointLdu(worldCenterM,placement);
 return .4*Math.min(...partMeta.colliders.map(c=>pointColliderDistanceLdu(p,c)))-radiusMm;
}
