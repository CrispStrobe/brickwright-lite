// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=v=>v.map(x=>x/Math.hypot(...v)),deg=x=>x*180/Math.PI;
const max=(s,k)=>Math.max(...s.map(k)),span=a=>Math.max(...a)-Math.min(...a);
const distance=(a,b)=>Math.hypot(...sub(a,b));
function prediction(theta){
 const B=[40*Math.cos(theta),40*Math.sin(theta)],d=[80-B[0],32-B[1]],q=Math.hypot(...d);
 const u=(32**2-40**2+q*q)/(2*q),h=Math.sqrt(32**2-u*u);
 const C=[B[0]+u*d[0]/q-h*d[1]/q,B[1]+u*d[1]/q+h*d[0]/q];
 return B.map((v,i)=>(v+C[i])/2);
}
function measure(r){
 const o=observeAddon(r),j=r.mechanism.joints.find(j=>j.motor),origin=o.initial('motor_A',[0,-40,0]);
 const rawX=sub(o.initial('input_arm',[0,0,60]),origin);rawX[1]=0;
 const rawZ=sub(o.initial('coupler',[0,0,40]),o.initial('coupler',[0,0,-40]));rawZ[1]=0;
 const ux=norm(rawX),uz=norm(rawZ),xy=p=>[dot(sub(p,origin),ux)*1000,dot(sub(p,origin),uz)*1000];
 return r.track.map(f=>{
  const B=xy(o.point(f,'input_arm',[0,0,60])),P=xy(o.point(f,'coupler')),C=xy(o.point(f,'output_arm',[0,0,60]));
  const theta=Math.atan2(B[1],B[0]),encoder=deg(f.joints[j.id].angle);
  return {tMs:f.t,phase:f.phase,stage:Number(f.extra.variables.stage),completed:Number(f.extra.variables.completed),
   failed:Number(f.extra.variables.failed),encoderDeg:encoder,thetaDeg:deg(theta),B,C,P,
   predictedP:prediction(theta),predictionErrorMm:distance(P,prediction(theta)),
   hingeGapMm:o.gap(f),axisMismatchDeg:o.axisGap(f),baseTiltDeg:o.tilt(f)};
 });
}
export function judgeWatt(r,{native=false}={}){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);
 const s=measure(r),last=s.at(-1),cold=s.filter(x=>x.phase==='cold'&&x.tMs>=200);
 if(!native)cold.push(s[0]);
 assert.ok(r.finishedAt>(native?2000:0)&&r.finishedAt<42000,'VM finite completion before watchdog');
 assert.ok(s.length>=(native?600:30),'nonempty dense actual trajectory');
 assert.equal(last.completed,1,'completed=1');assert.equal(last.failed,0,'failed=0');assert.equal(last.stage,7);
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 const endpoints=[20,-20,0,20,-20,0].map((target,i)=>{
  const rows=s.filter(x=>x.stage===i+1);assert.ok(rows.length>0);
  const error=Math.abs(rows.at(-1).encoderDeg-target);assert.ok(error<1,`stage ${i+1} arrival and settling`);
  return {stage:i+1,targetDeg:target,settledDeg:rows.at(-1).encoderDeg,errorDeg:error};
 });
 const metrics={finishedAtMs:r.finishedAt,programDurationMs:r.finishedAt-(native?2000:0),samples:s.length,
  programSamples:s.filter(x=>x.phase!=='cold'&&x.phase!=='after').length,
  longitudinalTravelMm:span(s.map(x=>x.P[1])),lateralDeviationMm:max(s,x=>Math.abs(x.P[0]-40)),
  predictionErrorMm:max(s,x=>x.predictionErrorMm),encoderSignErrorDeg:max(s,x=>Math.abs(x.thetaDeg+x.encoderDeg)),
  hingeGapMm:max(s,x=>x.hingeGapMm),axisMismatchDeg:max(s,x=>x.axisMismatchDeg),baseTiltDeg:max(s,x=>x.baseTiltDeg),
  coldOutputDriftMm:max(cold,x=>distance(x.P,cold[0].P)),coldBaseTiltDeg:max(cold,x=>x.baseTiltDeg),
  returnErrorMm:distance(last.P,[40,16]),finalEncoderDeg:last.encoderDeg,
  encoderRangeDeg:[Math.min(...s.map(x=>x.encoderDeg)),Math.max(...s.map(x=>x.encoderDeg))],endpoints};
 assert.ok(metrics.longitudinalTravelMm>=26&&metrics.longitudinalTravelMm<=29,'useful travel');
 assert.ok(metrics.lateralDeviationMm<.35,'near-straight measured midpoint');
 assert.ok(metrics.predictionErrorMm<.5,'independent circle-intersection prediction');
 assert.ok(metrics.encoderSignErrorDeg<.5,'measured angle and encoder sign');
 assert.ok(metrics.hingeGapMm<.5&&metrics.axisMismatchDeg<2,'hinge closure and orientation');
 assert.ok(metrics.baseTiltDeg<.3&&metrics.coldBaseTiltDeg<.3,'free base remains upright');
 assert.ok(metrics.coldOutputDriftMm<.15,'unpowered drift');
 assert.ok(metrics.returnErrorMm<.8&&Math.abs(metrics.finalEncoderDeg)<1,'return to datum');
 return {metrics,samples:s};
}
