// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const DEG=180/Math.PI;
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const scale=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const conj=([x,y,z,w])=>[-x,-y,-z,w];
const rotate=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const carry=(pose,initial,p)=>add(pose.position,rotate(mul(pose.rotation,conj(initial.rotation)),sub(p,initial.position)));
const local=(pose,p)=>rotate(conj(pose.rotation),sub(p,pose.position));
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const body=(m,id)=>{const b=m.bodies.find(b=>b.parts.includes(id));assert.ok(b,id);return b;};
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
const beamTip=(m,part,j)=>{
 const b=body(m,part),c=b.colliders.find(c=>c.part===part&&c.shape==='box');assert.ok(c);
 const center=add(b.position,rotate(b.rotation,c.position||[0,0,0]));
 const pivot=add(j.point,scale(j.axis,dot(sub(center,j.point),j.axis)));
 return {b,tip:add(center,sub(center,pivot))};
};
export const judgeDynamicsRun=(id,r)=>{
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);
 const {mechanism:m,track,hubId}=r;assert.ok(track.length>100);
 const base=body(m,'hub');assert.equal(base.id,hubId);
 for(const f of track){
  const p=f.bodies[hubId];
  for(const b of Object.values(f.bodies)){assert.ok([...b.position,...b.rotation].every(Number.isFinite));assert.ok(Math.hypot(...sub(b.position,p.position))<.7);}
  assert.ok(rotate(mul(p.rotation,conj(base.rotation)),[0,1,0])[1]>.985,'upright base');
 }
 assert.ok(Object.values(track.at(-1).busy).every(x=>!x),'program finishes');
 const drive=m.actuators[0].joint;
 if(id==='pulse-percussion'){
  assert.ok(Math.abs(track.at(-1).joints[drive].angle/(2*Math.PI)-6)<.02,'six shaft revolutions');
  const results={};const phases=[];
  for(let lane=0;lane<3;lane++){
   const b=body(m,`beater${lane}`);const hinge=m.joints.find(j=>[j.body1,j.body2].includes(b.id));
   const {tip}=beamTip(m,`beater${lane}`,hinge);const start=local(base,tip)[1];
   const heights=track.map(f=>local(f.bodies[hubId],carry(f.bodies[b.id],b,tip))[1]-start);
   const strikes=[];let lifted=false;
   for(let i=1;i<track.length;i++){
    if(heights[i]>.004)lifted=true;
    if(lifted&&heights[i]<.001&&heights[i]<heights[i-1]){strikes.push({time:track[i].t,phase:track[i].joints[drive].angle});lifted=false;}
   }
   const max=Math.max(...heights);assert.ok(max>.015&&max<.025,`beater ${lane} physical lift ${max}`);
   assert.ok(strikes.length>=5&&strikes.length<=7,`beater ${lane} physical strikes ${strikes.length}`);
   const gaps=strikes.slice(1).map((s,i)=>s.phase-strikes[i].phase);
   assert.ok(gaps.every(g=>Math.abs(g-2*Math.PI)<.6),'one strike per shaft turn');
   const phase=mean(strikes.slice(1).map(s=>Math.atan2(Math.sin(s.phase),Math.cos(s.phase))));
   phases.push(((phase*DEG)%360+360)%360);
   results[`beater${lane}`]={liftMm:max*1000,strikes:strikes.length,meanCycleDeg:mean(gaps)*DEG};
  }
  phases.sort((a,b)=>a-b);const gaps=[phases[1]-phases[0],phases[2]-phases[1],360+phases[0]-phases[2]].sort((a,b)=>a-b);
  assert.ok(gaps.every((x,i)=>Math.abs(x-[90,90,180][i])<20),`mechanical phase pattern: ${gaps}`);
  return {...results,strikeGapsDeg:gaps};
 }
 assert.equal(id,'centrifugal-governor');
 assert.ok(Math.abs(track.at(-1).joints[drive].angle/(2*Math.PI)-16)<.03,'rotor completes all four runs');
 const moving=[0,1].map(i=>{
  const b=body(m,`arm${i}`),j=m.joints.find(j=>j.type==='hinge'&&[j.body1,j.body2].includes(b.id));
  return {j,...beamTip(m,`arm${i}`,j)};
 });
 const input=m.joints.find(j=>j.id===drive);const rotor=m.bodies.find(b=>b.id===(input.body1===base.id?input.body2:input.body1));
 let residual=0;
 for(const f of track){
  const q=mul(f.bodies[rotor.id].rotation,conj(rotor.rotation));const axis=rotate(q,input.axis),o=carry(f.bodies[rotor.id],rotor,input.point);
  moving.forEach(({j,b,tip},i)=>{
   const p=carry(f.bodies[b.id],b,tip),v=sub(p,o);
   const radial=Math.hypot(...sub(v,scale(axis,dot(v,axis))));
   const theta=angle(f.joints[j.id].angle*(i===0?1:-1));
   const expected=Math.hypot(.136+.064*Math.sin(theta),.008);
   residual=Math.max(residual,Math.abs(radial-expected));
  });
 }
 assert.ok(residual<.0025,`physical arm radial motion: ${residual}`);
 const stages=[];
 for(const [name,lo,hi,sign] of [['slow',0,8*Math.PI,1],['medium',8*Math.PI,24*Math.PI,1],['fast',24*Math.PI,48*Math.PI,1],['reverse',0,1000,-1]]){
  let fs=track.filter(f=>f.joints[drive].angle>lo&&f.joints[drive].angle<hi&&f.joints[drive].velocity*sign>1);
  assert.ok(fs.length>50,name);const last=fs.at(-1).t;fs=fs.filter(f=>f.t>=last-2500);
  const tilts=moving.map(({j},i)=>mean(fs.map(f=>angle(f.joints[j.id].angle*(i===0?1:-1))))*DEG);
  const speed=mean(fs.map(f=>f.joints[drive].velocity));
  stages.push({name,speedRadPerSec:speed,meanTiltDeg:mean(tilts),armsDeg:tilts});
 }
 assert.ok(stages[0].meanTiltDeg>3&&stages[0].meanTiltDeg<16);
 assert.ok(stages[1].meanTiltDeg>stages[0].meanTiltDeg*2.5&&stages[1].meanTiltDeg<40);
 assert.ok(stages[2].meanTiltDeg>stages[1].meanTiltDeg+12&&stages[2].meanTiltDeg<75);
 assert.ok(Math.abs(stages[3].meanTiltDeg-stages[1].meanTiltDeg)<8,'reverse has comparable steady outward tilt');
 return {stages,radialResidualMm:residual*1000};
};
