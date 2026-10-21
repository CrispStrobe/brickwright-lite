// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
export function judgeQuickstroke(id,r){
 const {mechanism:m,track}=r,B=new Map(m.bodies.map(b=>[b.id,b])),motor=m.joints.find(j=>j.motor),base=B.get(motor.body1),crank=B.get(motor.body2),slider=m.joints.find(j=>j.type==='slider'),pin=m.joints.find(j=>j.type==='hinge'&&j!==motor&&(j.body1===crank.id||j.body2===crank.id)),end=m.joints.find(j=>j.type==='hinge'&&(j.body1===slider.body2||j.body2===slider.body2));
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.equal(m.actuators.length,1);assert.ok(track.length>2000);
 const point=(f,id,p)=>rot(f.bodies[id].rotation,sub(p,B.get(id).position)).map((v,k)=>v+f.bodies[id].position[k]);
 const xAxis=slider.axis,eAxis=sub(end.point,motor.point).map((v,k)=>v-dot(sub(end.point,motor.point),xAxis)*xAxis[k]);eAxis[1]=0;const el=Math.hypot(...eAxis);for(let k=0;k<3;k++)eAxis[k]/=el;
 const samples=[];let lawErrorMm=0,pivotGapMm=0,radiusErrorMm=0,rodErrorMm=0,offsetErrorMm=0,encoderErrorDeg=0,orientationErrorDeg=0,theta=0,lastTheta=0;
 for(const f of track){for(const p of Object.values(f.bodies))assert.ok([...p.position,...p.rotation].every(Number.isFinite));const bp=f.bodies[base.id],local=p=>rot(conj(bp.rotation),sub(p,point(f,base.id,motor.point))),c=local(point(f,crank.id,pin.point)),s=local(point(f,slider.body2,end.point)),cx=dot(c,xAxis),ce=dot(c,eAxis),x=dot(s,xAxis),e=dot(s,eAxis),t=Math.atan2(ce,cx);theta+=wrap(t-lastTheta);lastTheta=t;
  const predicted=.024*Math.cos(theta)+Math.sqrt(.080**2-(.048-.024*Math.sin(theta))**2);lawErrorMm=Math.max(lawErrorMm,Math.abs(x-predicted)*1000);radiusErrorMm=Math.max(radiusErrorMm,Math.abs(Math.hypot(cx,ce)-.024)*1000);rodErrorMm=Math.max(rodErrorMm,Math.abs(Math.hypot(...sub(s,c))-.080)*1000);offsetErrorMm=Math.max(offsetErrorMm,Math.abs(e-.048)*1000);encoderErrorDeg=Math.max(encoderErrorDeg,Math.abs(theta+f.joints[motor.id].angle)*180/Math.PI);
  const q=mul(conj(bp.rotation),f.bodies[slider.body2].rotation);orientationErrorDeg=Math.max(orientationErrorDeg,2*Math.acos(Math.min(1,Math.abs(q[3])))*180/Math.PI);
  for(const j of m.joints.filter(j=>j.type==='hinge'))pivotGapMm=Math.max(pivotGapMm,Math.hypot(...sub(point(f,j.body1,j.point),point(f,j.body2,j.point)))*1000);
  assert.ok(rot(bp.rotation,[0,1,0])[1]>.999,'base stays upright');samples.push({t:f.t,x,theta});
 }
 const extrema=[];for(let i=1;i<samples.length-1;i++){const a=samples[i-1],b=samples[i],c=samples[i+1];if((b.x-a.x)*(c.x-b.x)>=0)continue;
  const curvature=a.x-2*b.x+c.x;if(Math.abs(curvature)<1e-12)continue;const offset=Math.max(-1,Math.min(1,.5*(a.x-c.x)/curvature)),dt=(c.t-a.t)/2;
  const at=b.theta+offset*(c.theta-a.theta)/2,forward=c.theta>a.theta;
  if(at>Math.PI/2&&at<5.5*Math.PI)extrema.push({t:b.t+offset*dt,theta:at,x:b.x,forward});
 }
 const ratios=[];for(const forward of [true,false]){const es=extrema.filter(e=>e.forward===forward);assert.ok(es.length>=5,'five complete interior reversals in each direction');for(let k=1;k<es.length;k++){const speed=Math.abs((es[k].theta-es[k-1].theta)/(es[k].t-es[k-1].t))*180/Math.PI*1000;assert.ok(Math.abs(speed-30)<.2,'actual crank speed is constant through each timed stroke');}const intervals=es.slice(1).map((e,k)=>(e.t-es[k].t)/1000),slow=intervals.filter(t=>t>6),fast=intervals.filter(t=>t<6);assert.equal(slow.length,2);assert.equal(fast.length,2);const ratio=(slow.reduce((s,x)=>s+x,0)/2)/(fast.reduce((s,x)=>s+x,0)/2);ratios.push(ratio);assert.ok(Math.abs(ratio-1.4244196373)<.015,'actual reversal timing agrees with predicted quick-return ratio');}
 const strokeMm=(Math.max(...samples.map(s=>s.x))-Math.min(...samples.map(s=>s.x)))*1000;assert.ok(Math.abs(strokeMm-63.41609)<.1);assert.ok(lawErrorMm<.1&&radiusErrorMm<.1&&rodErrorMm<.1&&offsetErrorMm<.1,'physical linkage dimensions and position equation');assert.ok(pivotGapMm<.1&&encoderErrorDeg<.1&&orientationErrorDeg<.1,'real pivots close and guides prevent carriage rotation');assert.ok(Math.abs(track.at(-1).joints[motor.id].angle)<2*Math.PI/180);
 return {strokeMm,lawErrorMm,pivotGapMm,radiusErrorMm,rodErrorMm,offsetErrorMm,encoderErrorDeg,orientationErrorDeg,timeRatios:ratios};
}
