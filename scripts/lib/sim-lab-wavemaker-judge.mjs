// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reviewer-owned: predict Cardan motion; never impose the output or its poses.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v));
const span=v=>Math.max(...v)-Math.min(...v),deg=v=>v*180/Math.PI;
const qm=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const qi=([x,y,z,w])=>[-x,-y,-z,w],qr=(q,v)=>qm(qm(q,[...v,0]),qi(q)).slice(0,3);
const carry=(f,b,p)=>f.bodies[b.id].position.map((v,i)=>v+qr(qm(f.bodies[b.id].rotation,qi(b.rotation)),sub(p,b.position))[i]);
export const cardanPointerDegrees=theta=>{const t=theta*Math.PI/180,c2=.64;return deg(Math.atan2((1-c2)*Math.sin(t)*Math.cos(t),c2*Math.cos(t)**2+Math.sin(t)**2));};
export function judgeWaveMaker(r,{control=false}={}){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported||[],[]);assert.ok(r.finishedAt>0,'finite registered program finishes');
 assert.deepEqual(r.mechanism.actuators.map(a=>a.port),['A']);
 assert.equal(r.runModel.parts.length,298);assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,12);
 const uj=r.mechanism.couplings.filter(c=>c.kind==='universalJoint');assert.equal(uj.length,2,'two real fork pairs require two inferred crosses');
 assert.ok(r.track.length>100,'complete trajectory required');
 for(const f of r.track)for(const p of Object.values(f.bodies))assert.ok([...p.position,...p.rotation].every(Number.isFinite),'finite actual body poses');
 const o=observeAddon(r),axis=unit(sub(o.initial('hub',[0,0,1]),o.initial('hub'))),spec={reference:['reference_side_axle',[0,1,0]],input:['joint1_input_fork',[1,0,0]],ripple:['ripple_side_axle',[0,1,0]],carrier:['differential_housing',[1,0,0]],pointer:['pointer_beam',[0,0,1]]};
 const angles={};for(const [key,[id,local]]of Object.entries(spec)){
  const ref=unit(sub(o.initial(id,local),o.initial(id)));let prev=0,total=0;
  angles[key]=r.track.map(f=>{const v=o.angle(f,id,axis,ref);total+=Math.atan2(Math.sin(v-prev),Math.cos(v-prev));prev=v;return deg(total);});
 }
 const motor=r.mechanism.joints.find(j=>j.motor?.port==='A'),rows=r.track.map((f,i)=>({t:f.t,...Object.fromEntries(Object.entries(angles).map(([k,v])=>[k,v[i]])),motor:deg(f.joints[motor.id].angle),variables:f.extra?.variables||{}}));
 const max=v=>Math.max(...v),absMax=v=>max(v.map(Math.abs));
 assert.ok(max(rows.map(p=>p.motor))>1438,'both forward legs genuinely turn the input');
 assert.ok(Math.abs(rows.at(-1).motor)<1.5,'motor returns within its saved-datum allowance');
 const final=rows.at(-1).variables;assert.equal(Number(final.completed),1);assert.equal(Number(final.failed),0);assert.equal(Number(final.homed),1);assert.equal(Number(final.settled),1);assert.equal(Number(final.stage),4);
 for(const phase of [1,2,3])assert.ok(rows.filter(p=>Number(p.variables.stage)===phase).length>20,'slow, fast and reverse stages are all observed');
 const errors={referenceInput:absMax(rows.map(p=>p.reference-p.motor)),reversedBranch:absMax(rows.map(p=>p.input+p.motor)),differential:absMax(rows.map(p=>2*p.carrier-p.reference-p.ripple)),takeoff:absMax(rows.map(p=>p.pointer+2*p.carrier)),geometricLaw:absMax(rows.map(p=>p.pointer-(control?0:cardanPointerDegrees(p.reference))))};
 for(const [key,value]of Object.entries(errors))assert.ok(value<(key==='geometricLaw'?3.28125:.5),key+': independent observed transmission law');
 const stroke=span(rows.map(p=>p.pointer));assert.ok(control?stroke<1:stroke>24&&stroke<27,'physical phasing control cancels useful passive rocking');
 if(!control)for(const phase of [1,2,3])assert.ok(span(rows.filter(p=>Number(p.variables.stage)===phase).map(p=>p.pointer))>24,'useful stroke survives speed change and reversal');
 let gap=0,axisError=0,drift=0,tilt=0;
 for(const f of r.track){gap=Math.max(gap,o.gap(f));axisError=Math.max(axisError,o.axisGap(f));drift=Math.max(drift,norm(sub(f.bodies[o.base.id].position,o.base.position))*1000);tilt=Math.max(tilt,o.tilt(f));
  for(const c of uj){const a=r.mechanism.bodies.find(b=>b.id===c.body1),b=r.mechanism.bodies.find(b=>b.id===c.body2);gap=Math.max(gap,norm(sub(carry(f,a,c.point),carry(f,b,c.point)))*1000);}
 }
 assert.ok(gap<.5&&axisError<.5,'original hinges and Cardan centres stay closed');assert.ok(drift<1&&tilt<1,'stationary chassis in world coordinates');
 return{control,explicitPlacements:298,physicalPieces:300,strokeDeg:stroke,maxErrorsDeg:errors,maxAnchorGapMm:gap,maxAxisErrorDeg:axisError,maxFrameDriftMm:drift,maxFrameTiltDeg:tilt};
}
