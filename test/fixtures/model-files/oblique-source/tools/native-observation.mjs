// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Independent observation of physical points carried by recorded native bodies.
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const scale=(a,s)=>a.map(x=>x*s);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const norm=a=>Math.hypot(...a);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>{const n=norm(a);if(n<1e-12)throw new Error('Degenerate measurement axis');return scale(a,1/n);};
export const qmul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
export const qconj=([x,y,z,w])=>[-x,-y,-z,w];
export const qrot=(q,v)=>qmul(qmul(q,[...v,0]),qconj(q)).slice(0,3);
export const matVec=(R,p)=>[0,3,6].map(i=>dot(R.slice(i,i+3),p));
export const trans=R=>[R[0],R[3],R[6],R[1],R[4],R[7],R[2],R[5],R[8]];
export const matMul=(A,B)=>[0,3,6].flatMap(i=>[0,1,2].map(j=>A[i]*B[j]+A[i+1]*B[j+3]+A[i+2]*B[j+6]));
export const eye=[1,0,0,0,1,0,0,0,1];
export const degrees=r=>r*180/Math.PI;
export const clamp=x=>Math.max(-1,Math.min(1,x));
export const rotationAngleDeg=R=>degrees(Math.acos(clamp((R[0]+R[4]+R[8]-1)/2)));
export const rotationVectorDeg=R=>{
  const v=[R[7]-R[5],R[2]-R[6],R[3]-R[1]],s=norm(v)/2,c=clamp((R[0]+R[4]+R[8]-1)/2),a=Math.atan2(s,c);
  return s<1e-10?scale(v,90/Math.PI):scale(v,degrees(a)/(2*s));
};
export const variables=f=>Object.assign({},...(f.variables || []).map(t=>t.variables));
export const triangleFrame=points=>{
  const x=unit(sub(points[1],points[0])),v=sub(points[2],points[0]),y=unit(sub(v,scale(x,dot(v,x)))),z=cross(x,y);
  return trans([...x,...y,...z]);
};

export function nativeObservation(record,basePart) {
  const m=record.mechanism,bodyById=new Map(m.bodies.map(b=>[b.id,b])),parts=new Map(record.runModel.parts.map(p=>[p.id,p])),sourceParts=new Map(record.model.parts.map(p=>[p.id,p]));
  const bodyOf=part=>{
    const matches=m.bodies.filter(b=>b.parts.includes(part));
    if(matches.length!==1)throw new Error(`Marker ${part} belongs to ${matches.length} native bodies; an unambiguous physical part is required`);
    return matches[0];
  };
  const base=bodyOf(basePart),sourceBase=sourceParts.get(basePart),runBase=parts.get(basePart);
  const sourcePoint=mark=>{const p=sourceParts.get(mark.part);if(!p)throw new Error('Missing authored marker '+mark.part);return add(p.position,matVec(p.rotation,mark.local || [0,0,0]));};
  const initialPoint=mark=>{
    const p=parts.get(mark.part);if(!p)throw new Error('Missing run marker '+mark.part);
    return add(p.position,matVec(p.rotation,mark.local || [0,0,0])).map((x,i)=>x*(i===0?.0004:-.0004));
  };
  const pose=(frame,body)=>frame.bodies[body.id] || (body.motion==='static'?body:null);
  const carry=(frame,body,point)=>{const p=pose(frame,body);if(!p)throw new Error('Missing native body pose '+body.id);return add(p.position,qrot(p.rotation,qrot(qconj(body.rotation),sub(point,body.position))));};
  const sourceFromWorld=(frame,p)=>{
    const b=pose(frame,base);
    const rest=add(base.position,qrot(base.rotation,qrot(qconj(b.rotation),sub(p,b.position))));
    const ldu=rest.map((x,i)=>x/(i===0?.0004:-.0004));
    return add(sourceBase.position,matVec(sourceBase.rotation,matVec(trans(runBase.rotation),sub(ldu,runBase.position))));
  };
  const point=(frame,mark)=>sourceFromWorld(frame,carry(frame,bodyOf(mark.part),initialPoint(mark)));
  // Clearance consumers may select a genuine subbody for composite parts such
  // as the motor, whose stator and rotor deliberately share one stock part ID.
  // This merely carries source geometry on recorded poses; it creates no pose.
  const partTransform=(frame,partId,bodyId)=>{
    const body=bodyId?bodyById.get(bodyId):bodyOf(partId);
    if(!body?.parts.includes(partId))throw new Error(`Part ${partId} is not carried by native body ${bodyId}`);
    const carried=local=>sourceFromWorld(frame,carry(frame,body,initialPoint({part:partId,local})));
    const position=carried([0,0,0]);
    const columns=[[20,0,0],[0,20,0],[0,0,20]].map(local=>scale(sub(carried(local),position),1/20));
    return {part:partId,body:body.id,position,rotation:trans(columns.flat())};
  };
  const axis=(frame,body,initialAxis)=>qrot(pose(frame,body).rotation,qrot(qconj(body.rotation),initialAxis));
  return {bodyById,parts,sourceParts,base,bodyOf,sourcePoint,initialPoint,pose,carry,sourceFromWorld,point,partTransform,axis};
}

export function observePlatform(record,contract,observation=nativeObservation(record,contract.basePart)) {
  const platform=contract.platform,marks=platform.markers;
  if(marks.length<3)throw new Error('At least three platform markers are required');
  const saved=marks.map(observation.sourcePoint),savedFrame=triangleFrame(saved),origin=platform.savedOriginLdu;
  const B=trans((contract.basisLdu || [[1,0,0],[0,1,0],[0,0,1]]).flat()),BT=trans(B);
  const rows=record.track.map(frame=>{
    const points=marks.map(mark=>observation.point(frame,mark)),R=matMul(triangleFrame(points),trans(savedFrame));
    const centre=add(points[0],matVec(R,sub(origin,saved[0]))),translationMm=scale(matVec(BT,sub(centre,origin)),.4),rotationMatrix=matMul(matMul(BT,R),B);
    const rigidErrorMm=Math.max(...points.map((p,i)=>norm(sub(p,add(points[0],matVec(R,sub(saved[i],saved[0])))))*.4));
    return {t:frame.t,phase:frame.phase,stage:Number(variables(frame).stage),settled:Number(variables(frame).settled),translationMm,rotationMatrix,rotationVectorDeg:rotationVectorDeg(rotationMatrix),rigidErrorMm,pointsLdu:points};
  });
  return {rows,savedMarkersLdu:saved,markerBodies:marks.map(mark=>observation.bodyOf(mark.part).id),sourceFrame:savedFrame,basis:B};
}
