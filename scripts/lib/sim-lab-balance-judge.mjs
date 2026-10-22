// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const span=a=>Math.max(...a)-Math.min(...a),DEG=180/Math.PI;
export function measureBalance(r){
 const carrier=observeAddon(r),base=observeAddon(r,'base_cross_-340');
 const motors=['A','B'].map(p=>r.mechanism.joints.find(j=>j.motor?.port===p));
 const slide=r.mechanism.joints.find(j=>j.type==='slider'&&r.mechanism.bodies.find(b=>b.id===j.body2)?.parts.includes('A_slider_cross'));
 const X=slide.axis,T=cross(motors[0].axis,X),start=dot(base.point(r.track[0],'hub'),X);
 return r.track.map(f=>({t:f.t,phase:f.phase,variables:f.extra?.variables||f.extra||{},
  carrierMm:(dot(base.point(f,'hub'),X)-start)*1000,gapMm:carrier.gap(f),axisDeg:carrier.axisGap(f),tiltDeg:base.tilt(f),
  engines:['A','B'].map((p,i)=>{
   const O=carrier.point(f,p+'_motor'),c=sub(carrier.point(f,p+'_crank_pin_axle'),O),s=sub(carrier.point(f,p+'_slider_cross'),O);
   const theta=Math.atan2(dot(c,T),dot(c,X)),x=dot(s,X),radius=Math.hypot(dot(c,X),dot(c,T));
   const expected=.016*Math.cos(theta)+Math.sqrt(.064**2-(.016*Math.sin(theta))**2);
   return {x,theta,encoder:f.joints[motors[i].id].angle*DEG,lawMm:(x-expected)*1000,radiusMm:radius*1000,transverseMm:dot(s,T)*1000};
  })}));
}
export function judgeBalance(r,{native=false}={}){
 const m=r.mechanism;assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);
 assert.equal(m.bodies.filter(b=>b.motion==='dynamic').length,8);assert.equal(m.joints.filter(j=>j.type==='hinge').length,6);
 assert.equal(m.joints.filter(j=>j.type==='slider').length,3);assert.equal(m.couplings.filter(c=>c.kind==='spring').length,2);
 assert.deepEqual(m.actuators.map(a=>a.port).sort(),['A','B']);
 assert.ok(r.finishedAt>55000&&r.finishedAt<95000,'Balance: finite complete program');
 const rows=measureBalance(r),peak=key=>Math.max(...rows.map(s=>s[key]));
 if(native){assert.ok(rows.length>=5000);assert.ok(rows.filter(s=>s.phase==='cold').length>=1000,'Ten unpowered seconds at 10 ms');}
 const error=Math.max(...rows.flatMap(s=>s.engines.map(e=>Math.abs(e.lawMm))));assert.ok(error<=.25,`Balance: actual slider-crank law ${error} mm`);
 assert.ok(Math.max(...rows.flatMap(s=>s.engines.map(e=>Math.abs(e.radiusMm-16))))<=.15);
 assert.ok(Math.max(...rows.flatMap(s=>s.engines.map(e=>Math.abs(e.transverseMm))))<=.2);
 assert.ok(peak('gapMm')<=.3&&peak('axisDeg')<=.5&&peak('tiltDeg')<=.1,'Balance: physical closure and stable base');
 assert.ok(Math.max(...rows.map(s=>Math.abs(s.carrierMm)))<30,'Carrier remains inside its working travel');
 const expected=[64,Math.sqrt(2)*32,2*(64-Math.sqrt(64**2-16**2))];
 const trials=[0,90,180].map((phase,i)=>{
  const full=rows.filter(s=>Number(s.variables.stage)===2&&Number(s.variables.phase)===phase);
  const samples=full.filter(s=>s.engines[0].encoder>90&&s.engines[0].encoder<1350);
  assert.ok(samples.length>=(native?500:100),`Balance phase ${phase}: useful forward observations`);
  const strokes=[0,1].map(k=>span(samples.map(s=>s.engines[k].x))*1000);
  assert.ok(strokes.every(s=>Math.abs(s-32)<=.5),'Both actual 32 mm piston strokes');
  const sum=span(samples.map(s=>s.engines[0].x+s.engines[1].x))*1000;
  assert.ok(Math.abs(sum-expected[i])<=.5,`Balance ${phase}: sum range ${sum} mm`);
  for(const s of samples){const e=(s.engines[1].encoder-s.engines[0].encoder-phase)/DEG;assert.ok(Math.abs(Math.atan2(Math.sin(e),Math.cos(e)))*DEG<=.5,'Actual coordinated phase');}
  for(const k of [0,1]){const travel=full.at(-1).engines[k].encoder-full[0].engines[k].encoder;assert.ok(travel>1439&&travel<1441,`Four complete turns: ${travel}°`);}
  return {phase,pistonStrokesMm:strokes,sumStrokeMm:sum,carrierSpanMm:span(samples.map(s=>s.carrierMm))};
 });
 const moving=rows.filter(s=>Number(s.variables.stage)===2);assert.ok(span(moving.map(s=>s.carrierMm))>.2,'The unmotorized carrier actually reacts');
 const final=rows.at(-1);assert.equal(Number(final.variables.completed),1);assert.equal(Number(final.variables.failed),0);
 assert.ok(final.engines.every(e=>Math.abs(e.encoder)<=.5),'Both inputs return to datum');
 return {sliderLawErrorMm:error,trials,finishedMs:r.finishedAt};
}
