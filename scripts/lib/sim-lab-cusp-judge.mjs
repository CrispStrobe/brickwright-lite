// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),unit=a=>a.map(v=>v/norm(a));
const span=a=>Math.max(...a)-Math.min(...a),DEG=180/Math.PI;
const length=points=>points.slice(1).reduce((s,p,i)=>s+norm(sub(p,points[i])),0);
export function measureCusp(r){
 const o=observeAddon(r),x=unit(sub(o.initial('hub',[1,0,0]),o.initial('hub'))),z=unit(sub(o.initial('hub',[0,0,1]),o.initial('hub')));
 const center=o.initial('drive_pinion'),origin=center.map((v,i)=>v+25.6*x[i]/1000),j=r.mechanism.joints.find(j=>j.motor?.port==='A');
 let previous=0,total=0;
 return r.track.map(f=>{
  const point=(id,local)=>{const p=sub(o.point(f,id,local),origin);return [dot(p,x)*1000,dot(p,z)*1000];};
  const C=point('witness_arm',[0,0,-20]),P=point('marker_r20'),Q=point('marker_r40'),arm=point('witness_arm',[0,0,0]);
  const radial=sub(arm,C),a=Math.atan2(radial[0],-radial[1]);total+=Math.atan2(Math.sin(a-previous),Math.cos(a-previous));previous=a;
  const theta=total,expected=(radius)=>[-25.6+8*theta+radius*Math.sin(theta),-radius*Math.cos(theta)];
  return {t:f.t,theta,C,P,Q,encoder:-f.joints[j.id].angle,
   predictionError:Math.max(norm(sub(C,[-25.6+8*theta,0])),norm(sub(P,expected(8))),norm(sub(Q,expected(16))))};
 });
}
export function judgeCusp(r){
 assert.ok(r.finishedAt>0&&r.finishedAt<80000,'Cusp: finite forward and return');
 assert.deepEqual(r.issues.filter(i=>i.severity==='error'),[]);assert.equal(r.mechanism.actuators.length,1);
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,3);
 const rows=measureCusp(r),worst=Math.max(...rows.map(s=>s.predictionError));
 assert.ok(worst<=.5,`Cusp: measured rolling paths, error ${worst} mm`);
 for(const f of rows)assert.ok(Math.abs(f.theta-f.encoder)*DEG<=.5,'Actual arm phase agrees with encoder sign');
 const peak=rows.reduce((best,f,i)=>f.theta>rows[best].theta?i:best,0),passes=[rows.slice(0,peak+1),rows.slice(peak)];
 const summaries=passes.map((pass,index)=>{
  assert.ok(pass.length>=1000);assert.ok(span(pass.map(s=>s.theta))*DEG>=359,'Complete turn in each direction');
  assert.ok(span(pass.map(s=>s.C[0]))>=49,'Actual carriage progress');
  assert.ok(span(pass.map(s=>s.P[1]))>=15&&span(pass.map(s=>s.Q[1]))>=31,'Both substantial marker paths');
  assert.ok(length(pass.map(s=>s.P))>=62&&length(pass.map(s=>s.Q))>=104);
  const cusp=pass.filter(s=>s.theta*DEG>=170&&s.theta*DEG<=190);
  assert.ok(cusp.length>=55&&span(cusp.map(s=>s.theta))*DEG>=19,'Complete fixed cusp window');
  const diagonal=Math.hypot(...[0,1].map(k=>span(cusp.map(s=>s.P[k])))),carriagePath=length(cusp.map(s=>s.C)),tipPath=length(cusp.map(s=>s.P));
  assert.ok(carriagePath>=2.5&&diagonal<=.35&&tipPath/carriagePath<=.25,'Velocity cancellation while carriage continues');
  const back=pass.filter(s=>s.theta*DEG>=120&&s.theta*DEG<=240),direction=index===0?1:-1;
  assert.ok(back.length>=350&&span(back.map(s=>s.theta))*DEG>=119);
  assert.ok((back.at(-1).C[0]-back[0].C[0])*direction>=16,'Carriage continues through full backtracking window');
  const backward=-(back.at(-1).Q[0]-back[0].Q[0])*direction;assert.ok(backward>=9,'Outer point moves against carriage');
  const crossing=[71.3962,288.6038].map(want=>pass.reduce((best,s)=>Math.abs(s.theta*DEG-want)<Math.abs(best.theta*DEG-want)?s:best));
  crossing.forEach((s,i)=>assert.ok(Math.abs(s.theta*DEG-[71.3962,288.6038][i])<=.5));
  const loopGap=norm(sub(crossing[0].Q,crossing[1].Q));assert.ok(loopGap<=.5,'Two declared phases meet at measured loop crossing');
  return {cuspDiagonalMm:diagonal,tipToCarriagePath:tipPath/carriagePath,backwardMm:backward,loopCrossingMm:loopGap};
 });
 assert.ok(norm(sub(rows.at(-1).C,rows[0].C))<=1,'Carriage returns home');
 return {predictionErrorMm:worst,passes:summaries};
}
