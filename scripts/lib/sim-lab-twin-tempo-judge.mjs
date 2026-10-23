// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const deg=x=>x*180/Math.PI,sub=(a,b)=>a.map((v,i)=>v-b[i]);
const unwrap=xs=>{let prev=xs[0],total=0;return xs.map(x=>{total+=Math.atan2(Math.sin(x-prev),Math.cos(x-prev));prev=x;return total;});};
export function judgeTwinTempo(r,{native=false}={}){
 assert.deepEqual(r.issues||[],[]);assert.deepEqual(r.unsupported||[],[]);
 assert.ok(r.finishedAt>0&&r.finishedAt<61000,'finite native program');
 const o=observeAddon(r),j=r.mechanism.joints.find(j=>j.motor),ref=Math.abs(j.axis[1])>.8?[1,0,0]:[0,1,0];
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,6);
 assert.equal(r.mechanism.joints.length,3);assert.equal(r.mechanism.couplings.filter(c=>c.kind==='gear').length,2);assert.equal(r.mechanism.couplings.filter(c=>c.kind==='rope').length,2);
 const angles=['shaft_fast','shaft_idler','shaft_slow'].map(id=>unwrap(r.track.map(f=>o.angle(f,id,j.axis,ref))));
 const marker=[0,0,-29],starts=['payload_fast','payload_slow'].map(id=>o.point(r.track[0],id,marker));
 const rows=r.track.map((f,i)=>{
  const rise=['payload_fast','payload_slow'].map((id,k)=>(o.point(f,id,marker)[1]-starts[k][1])*1000),angle=deg(f.joints[j.id].angle);
  for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
  return {t:f.t,phase:f.phase,angle,rise,law:[Math.abs(rise[0]-2.8*f.joints[j.id].angle),Math.abs(rise[1]-2.8*f.joints[j.id].angle/3)],
   ratio:Math.abs(rise[0]-3*rise[1]),idler:Math.abs(deg(angles[1][i]+angles[0][i]/3)),slow:Math.abs(deg(angles[2][i]-angles[0][i]/3)),gap:o.gap(f),axis:o.axisGap(f),tilt:o.tilt(f)};
 });
 const max=k=>Math.max(...rows.map(k)),peak=rows.reduce((a,b)=>b.rise[0]>a.rise[0]?b:a),last=rows.at(-1),v=r.track.at(-1).extra.variables;
 assert.equal(Number(v.completed),1);assert.equal(Number(v.failed),0);assert.equal(Number(v.stage),3);
 assert.ok(rows.length>(native?900:30));
 assert.ok(peak.rise[0]>=30&&peak.rise[1]>=9.5,'both real tags must rise');
 assert.ok(last.rise.every(x=>Math.abs(x)<1)&&Math.abs(last.angle)<2,'tags and input return');
 assert.ok(max(x=>Math.max(...x.law))<=1,'each independently observed tag obeys radius × angle');
 assert.ok(max(x=>x.ratio)<=1.5,'3:1 independent tag travel');
 assert.ok(max(x=>x.idler)<2&&max(x=>x.slow)<2,'physical intermediate/output shaft phases');
 assert.ok(max(x=>x.gap)<.5&&max(x=>x.axis)<1,'real hinge closure');assert.ok(max(x=>x.tilt)<2,'upright chassis');
 assert.ok(max(x=>x.angle)<=725&&Math.min(...rows.map(x=>x.angle))>=-5,'safe winding sector');
 if(native){
  const active=r.track.filter(f=>f.phase==='program');
  for(let k=0;k<2;k++){
   const tensions=active.map(f=>f.extra.rope[k].tension);
   assert.ok(Math.min(...tensions.slice(0,-3).map((_,i)=>tensions.slice(i,i+4).reduce((s,x)=>s+x,0)/4))>.001,'positive 100 ms mean rope support');
   for(const f of active){const distance=Math.hypot(...sub(o.point(f,['payload_fast','payload_slow'][k],marker),o.point(f,['drum_fast','drum_slow'][k])));
    assert.ok(Math.abs(f.extra.rope[k].free-distance)*1000<=.5,'physical free cord length');}
  }
 }
 return {peakFastMm:peak.rise[0],peakSlowMm:peak.rise[1],ratio:peak.rise[0]/peak.rise[1],maxLawErrorMm:max(x=>Math.max(...x.law)),returnMm:last.rise,finishedAt:r.finishedAt};
}
