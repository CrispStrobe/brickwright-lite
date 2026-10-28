// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Finite equal/opposite central forces at the two actual face points. The
// softened inverse-fourth curve is an explicit approximation, not measured
// LEGO magnet strength. Retraction beyond the range releases the piece.
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const rotate=([x,y,z,w],v)=>{
 const t=[2*(y*v[2]-z*v[1]),2*(z*v[0]-x*v[2]),2*(x*v[1]-y*v[0])];
 return [v[0]+w*t[0]+y*t[2]-z*t[1],v[1]+w*t[1]+z*t[0]-x*t[2],v[2]+w*t[2]+x*t[1]-y*t[0]];
};
export const magneticForce = (a,b,na,nb,p) => {
 const delta=b.map((v,k)=>v-a[k]),d=Math.hypot(...delta);
 if(d<1e-10||d>=p.rangeM||dot(na,nb)>-.5||dot(delta,na)<=0||dot(delta,nb)>=0)return [0,0,0];
 const reference=p.referenceGapM**2+p.softeningM**2;
 let force=Math.min(p.maxForceN,p.referenceForceN*(reference/(d*d+p.softeningM**2))**2);
 if(d>p.taperStartM){const t=(p.rangeM-d)/(p.rangeM-p.taperStartM);force*=t*t*(3-2*t);}
 return delta.map(v=>-v*force/d);
};
export const createMagnets=({J,couplings,bodyInterface,bodyIdOf})=>{
 const pose=id=>{const p=bodyInterface.GetPosition(id),q=bodyInterface.GetRotation(id);return {position:[p.GetX(),p.GetY(),p.GetZ()],rotation:[q.GetX(),q.GetY(),q.GetZ(),q.GetW()]};};
 const local=(p,point,normal)=>{const q=p.rotation.map((v,k)=>k<3?-v:v);return {point:rotate(q,point.map((v,k)=>v-p.position[k])),normal:rotate(q,normal)};};
 const pairs=couplings.map(c=>{const a=bodyIdOf(c.body1),b=bodyIdOf(c.body2);return {a,b,la:local(pose(a),c.point1,c.normal1),lb:local(pose(b),c.point2,c.normal2),field:c.field};});
 const f=new J.Vec3(0,0,0),at=new J.RVec3(0,0,0);
 const world=(p,l)=>({point:rotate(p.rotation,l.point).map((v,k)=>v+p.position[k]),normal:rotate(p.rotation,l.normal)});
 return {beforeStep(){for(const pair of pairs){
  const a=world(pose(pair.a),pair.la),b=world(pose(pair.b),pair.lb),force=magneticForce(a.point,b.point,a.normal,b.normal,pair.field);
  if(!force.some(v=>v!==0))continue;
  f.Set(...force);at.Set(...b.point);bodyInterface.AddForce(pair.b,f,at,J.EActivation_Activate);
  f.Set(...force.map(v=>-v));at.Set(...a.point);bodyInterface.AddForce(pair.a,f,at,J.EActivation_Activate);
 }},destroy(){J.destroy(f);J.destroy(at);}};
};
