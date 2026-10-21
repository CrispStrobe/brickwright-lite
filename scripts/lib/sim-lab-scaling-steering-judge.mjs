// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Read actual native bodies. Predicted points never replace observed output.
import assert from 'node:assert/strict';
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),norm=v=>Math.hypot(...v),deg=a=>a*180/Math.PI;
const range=a=>Math.max(...a)-Math.min(...a);
function observer(r){
 const m=r.mechanism,B=new Map(m.bodies.map(b=>[b.id,b])),base=m.bodies.find(b=>b.parts.includes('hub'));
 const body=id=>m.bodies.find(b=>b.parts.includes(id));
 const carry=(f,b,p)=>add(f.bodies[b.id].position,rot(f.bodies[b.id].rotation,rot(conj(b.rotation),sub(p,b.position))));
 const local=(f,p)=>add(base.position,rot(base.rotation,rot(conj(f.bodies[base.id].rotation),sub(p,f.bodies[base.id].position))));
 const point=(f,b,p)=>local(f,carry(f,b,p));
 const gap=f=>Math.max(...m.joints.filter(j=>j.type==='hinge').map(j=>norm(sub(carry(f,B.get(j.body1),j.point),carry(f,B.get(j.body2),j.point)))))*1000;
 return {m,B,base,body,point,gap};
}
function healthy(r,n){assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.equal(r.mechanism.actuators.length,n);assert.ok(r.track.length>1800);for(const f of r.track)for(const p of Object.values(f.bodies))assert.ok([...p.position,...p.rotation].every(Number.isFinite));}
export function measureScaleEcho(r){
 const {m,body,point,gap}=observer(r),base=body('hub'),long=body('longbar_main'),input=body('inputlink_main'),output=body('outputlong_main'),tie=body('tie_main');
 const ja=m.joints.find(j=>j.motor?.port==='A'),jb=m.joints.find(j=>j.motor?.port==='B'),jB=m.joints.find(j=>[j.body1,j.body2].includes(long.id)&&[j.body1,j.body2].includes(output.id)),jC=m.joints.find(j=>[j.body1,j.body2].includes(tie.id)&&[j.body1,j.body2].includes(input.id)),jH=m.joints.find(j=>[j.body1,j.body2].includes(tie.id)&&[j.body1,j.body2].includes(output.id));
 const tip=add(output.position,output.colliders.find(c=>c.part==='tip_D').position),savedU=sub(jb.point,ja.point).map((v,k)=>k===1?0:v);
 return r.track.map(f=>{
  const O=point(f,base,ja.point),P={};for(const [key,b,p]of [['a',long,jb.point],['b',long,jB.point],['c',input,jC.point],['h',output,jH.point],['d',output,tip]])P[key]=sub(point(f,b,p),O).map((v,k)=>k===1?0:v);
  const u=P.a,v=sub(P.c,P.a),thetaA=Math.atan2(dot(ja.axis,cross(savedU,u)),dot(savedU,u)),thetaB=wrap(Math.atan2(dot(jb.axis,cross(u,v)),dot(u,v))+Math.PI/2);
  return {t:f.t,...P,thetaA,thetaB,encoderA:f.joints[ja.id].angle,encoderB:f.joints[jb.id].angle,gapMm:gap(f)};
 });
}
export function judgeScaleEcho(id,r){
 healthy(r,2);assert.equal(r.mechanism.joints.filter(j=>j.type==='hinge').length,5);
 const samples=measureScaleEcho(r);let scalingErrorMm=0,branchErrorMm=0,encoderErrorDeg=0,gapMm=0;
 for(const s of samples){scalingErrorMm=Math.max(scalingErrorMm,norm(sub(s.d,scale(s.c,2)))*1000);branchErrorMm=Math.max(branchErrorMm,norm(sub(sub(s.h,s.b),sub(s.c,s.a)))*1000,norm(sub(sub(s.h,s.c),sub(s.b,s.a)))*1000);encoderErrorDeg=Math.max(encoderErrorDeg,Math.abs(deg(wrap(s.thetaA-s.encoderA))),Math.abs(deg(wrap(s.thetaB-s.encoderB))));gapMm=Math.max(gapMm,s.gapMm);}
 const spans=Object.fromEntries(['c','d'].map(key=>[key,[0,2].map(k=>range(samples.map(s=>s[key][k]))*1000)]));
 assert.ok(scalingErrorMm<.1&&branchErrorMm<.1&&gapMm<.1,'actual pantograph output, branch and hinge closure');
 assert.ok(encoderErrorDeg<.2,'both actual driven arms agree with encoders');
 assert.ok(range(samples.map(s=>s.thetaA))>35*Math.PI/180&&range(samples.map(s=>s.thetaB))>55*Math.PI/180,'both physical inputs move');
 for(let k=0;k<2;k++){assert.ok(spans.c[k]>45);assert.ok(Math.abs(spans.d[k]-2*spans.c[k])<.1);}
 const returnErrorMm=norm(sub(samples.at(-1).d,samples[0].d))*1000;assert.ok(returnErrorMm<.5,'actual output returns home');
 return {scalingErrorMm,branchErrorMm,encoderErrorDeg,gapMm,spans,returnErrorMm};
}
export function steeringPrediction(left){
 const W=.08,k=.016,d=.032,t=.048,r=Math.hypot(k,d),P=[k*Math.cos(left)+d*Math.sin(left),k*Math.sin(left)-d*Math.cos(left)],delta=[P[0]-W,P[1]],distance=norm(delta),a=(r*r-t*t+distance*distance)/(2*distance),h=Math.sqrt(Math.max(0,r*r-a*a)),e=scale(delta,1/distance),foot=[W+a*e[0],a*e[1]],neutral=Math.atan2(-d,-k);
 assert.ok(distance>Math.abs(r-t)&&distance<r+t,'steering circles intersect away from tangency');
 const choices=[-1,1].map(sign=>{const p=[foot[0]-sign*h*e[1],foot[1]+sign*h*e[0]];return wrap(Math.atan2(p[1],p[0]-W)-neutral);});
 return choices.sort((x,y)=>Math.abs(x)-Math.abs(y))[0];
}
export function measureTurnwise(r){
 const {m,body,point,gap}=observer(r),base=body('hub'),left=body('kingpin_left'),right=body('kingpin_right'),motor=m.joints.find(j=>j.motor),jl=m.joints.find(j=>j.type==='hinge'&&j.body1===base.id&&j.body2===left.id),jr=m.joints.find(j=>j.type==='hinge'&&j.body1===base.id&&j.body2===right.id),axis=scale(sub(jr.point,jl.point).map((v,k)=>k===1?0:v),1/.08),front=cross([0,1,0],axis);
 const heading=(f,b,j)=>{const u=sub(point(f,b,add(j.point,scale(axis,.04))),point(f,b,j.point));return Math.atan2(dot(u,front),dot(u,axis));};
 return r.track.map(f=>({t:f.t,left:heading(f,left,jl),right:heading(f,right,jr),encoder:f.joints[motor.id].angle,gapMm:gap(f),busy:f.busy.A}));
}
export function judgeTurnwise(id,r){
 healthy(r,1);assert.equal(r.mechanism.joints.filter(j=>j.type==='hinge').length,6);
 const samples=measureTurnwise(r);let predictionErrorDeg=0,encoderErrorDeg=0,gapMm=0;
 for(const s of samples){predictionErrorDeg=Math.max(predictionErrorDeg,Math.abs(deg(wrap(s.right-steeringPrediction(s.left)))));encoderErrorDeg=Math.max(encoderErrorDeg,Math.abs(deg(wrap(s.left+s.encoder))));gapMm=Math.max(gapMm,s.gapMm);assert.ok(Math.max(Math.abs(deg(s.left)),Math.abs(deg(s.right)))<26,'bounded locks stay away from toggle');}
 assert.ok(predictionErrorDeg<.1&&encoderErrorDeg<.2&&gapMm<.1,'actual passive wheel follows physical four-bar closure');
 const targets=[[-10,10,8.690066],[-20,20,15.000550],[-25,25,17.255154],[8.690066,-8.690066,-10],[15.000550,-15.000550,-20],[17.255154,-17.255154,-25]];
 for(const [encoder,left,right]of targets)assert.ok(samples.some(s=>!s.busy&&Math.abs(deg(s.encoder)-encoder)<.2&&Math.abs(deg(s.left)-left)<.2&&Math.abs(deg(s.right)-right)<.2),'actual held teaching pose '+encoder);
 assert.ok(Math.min(...samples.map(s=>deg(s.left)))> -19.930177680+1.5,'at least 1.5 degrees from the negative-input toggle');
 const last=samples.at(-1);assert.ok(Math.max(Math.abs(deg(last.left)),Math.abs(deg(last.right)))<.2,'both wheels return straight');
 return {predictionErrorDeg,encoderErrorDeg,gapMm,leftRangeDeg:samples.reduce((a,s)=>[Math.min(a[0],deg(s.left)),Math.max(a[1],deg(s.left))],[Infinity,-Infinity]),rightRangeDeg:samples.reduce((a,s)=>[Math.min(a[0],deg(s.right)),Math.max(a[1],deg(s.right))],[Infinity,-Infinity])};
}
