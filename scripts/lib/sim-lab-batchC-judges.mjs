// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions judge observed, passive bodies; they never drive their poses.
// Batch C (2026-10-27): Final Squeeze, promoted from the experimental entries after review.
// Each law is derived from the model's documented mechanism and the compiled joint geometry,
// never fitted to the recorded motion. Failing assertions carry their measured values.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>scale(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const deg=x=>x*180/Math.PI,max=(s,k)=>Math.max(...s.map(k)),span=a=>Math.max(...a)-Math.min(...a);
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
const inPlane=(v,a)=>sub(v,scale(a,dot(v,a)));

function healthy(r,native){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
 assert.deepEqual(r.mechanism.couplings,[],'no imposed output coupling');
}
function foundation(r,o){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id];
 const frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=max(frames,f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000),tiltDeg=max(frames,f=>o.tilt(f));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});
 const gapMm=max(r.track,f=>o.gap(f)),axisDeg=max(r.track,f=>o.axisGap(f));
 check(gapMm<=.5&&axisDeg<=1,'true hinge closure and aligned axes',{gapMm,axisDeg});return{horizontalMm,tiltDeg,gapMm,axisDeg};
}
const vars=f=>f.extra.variables;

// ---------------------------------------------------------------------------------------------
// Final Squeeze: a knee (toggle) press. Motor A turns the input link (pivot O, length L1 = |K−O|) about a
// chassis hinge; a passive link (length L2 = |P−K|) pushes the platen pin P along its guide line u.
// With α the angle between the input link and u, and e the offset of O from the guide line, the slider-crank
// closure puts the platen at s(α) = L1·cos α + √(L2² − (L1·sin α − e)²) along u. All of O, K, P, u and the
// lengths are read from the compiled joints; α is read from the observed input-link body each frame.
// Moving frames lag the closure by up to 0.18 mm at the program's 8 deg/s; settled holds agree within microns.
const TOL_MM=.3;
const FS_BASE='hub',FS_INPUT='input_link',FS_OUTPUT='platen_crossbar';
function kneeGeometry(r){
 const m=r.mechanism,o=observeAddon(r,FS_BASE),inp=o.body(FS_INPUT),pl=o.body(FS_OUTPUT),base=o.base;
 const jO=m.joints.find(j=>j.type==='hinge'&&j.motor?.port==='A'&&[j.body1,j.body2].includes(inp.id));assert.ok(jO,'motor input hinge');
 const knee=m.joints.filter(j=>j.type==='hinge'&&!j.motor&&[j.body1,j.body2].includes(inp.id));assert.equal(knee.length,1,'one knee hinge on the input link');
 const link=[knee[0].body1,knee[0].body2].find(id=>id!==inp.id);
 const jP=m.joints.find(j=>j.type==='hinge'&&[j.body1,j.body2].includes(link)&&[j.body1,j.body2].includes(pl.id));assert.ok(jP,'link-to-platen hinge');
 const guide=m.joints.find(j=>j.type==='slider'&&[j.body1,j.body2].includes(pl.id)&&[j.body1,j.body2].includes(base.id));assert.ok(guide,'platen guide slides on the chassis');
 const a=unit(jO.axis),O=jO.point,K=knee[0].point,P=jP.point;
 let u=unit(inPlane(guide.axis,a));if(dot(u,sub(P,O))<0)u=scale(u,-1);
 const n=unit(cross(a,u)),L1=norm(inPlane(sub(K,O),a)),L2=norm(inPlane(sub(P,K),a)),e=dot(sub(P,O),n);
 check(Math.abs(dot(unit(guide.axis),a))<1e-6,'guide line lies in the linkage plane',{guideAxis:guide.axis,a});
 return{o,a,u,n,O,K,P,L1,L2,e,inp,pl};
}
const kneeS=(g,alpha)=>g.L1*Math.cos(alpha)+Math.sqrt(g.L2*g.L2-(g.L1*Math.sin(alpha)-g.e)**2);
function kneeRows(r,g){
 const {o,a,u,n,O,K}=g,r0=inPlane(sub(K,O),a),p0=o.initial(FS_OUTPUT);
 const alphaOf=v=>{const w=inPlane(v,a);return Math.atan2(dot(w,n),dot(w,u));};
 const alpha0=alphaOf(r0),s0=kneeS(g,alpha0);
 return r.track.map(f=>{const al=alphaOf(o.vector(f,FS_INPUT,r0));return{f,alphaDeg:deg(al),pred:(kneeS(g,al)-s0)*1000,meas:dot(sub(o.point(f,FS_OUTPUT),p0),u)*1000,cross:dot(sub(o.point(f,FS_OUTPUT),p0),n)*1000};});
}
export function judgeFinalSqueeze(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);
 const g=kneeGeometry(r),rows=kneeRows(r,g),prog=rows.filter(x=>x.f.phase!=='cold');
 const v=vars(r.track.at(-1));check(Number(v.completed)===1&&Number(v.fault)===0&&String(v.stage)==='12','program completes without fault',{completed:v.completed,fault:v.fault,stage:v.stage});
 check(Math.abs(g.L1-g.L2)<=.5e-3&&Math.abs(g.e)<=.5e-3,'equal knee links on the guide line',{L1mm:g.L1*1000,L2mm:g.L2*1000,eMm:g.e*1000});
 const alphaSpan=span(prog.map(x=>x.alphaDeg)),advance=max(prog,x=>x.meas),predAdvance=max(prog,x=>x.pred);
 check(alphaSpan>=24,'input sweeps its declared 40-to-15 degree sector',{alphaSpan});
 check(advance>=10,'passive platen advances',{advance});
 const err=max(prog,x=>Math.abs(x.meas-x.pred)),side=max(prog,x=>Math.abs(x.cross));
 check(err<=TOL_MM,'platen follows the knee closure s(α) = L1 cos α + √(L2² − (L1 sin α − e)²)',{err,advance,predAdvance});
 check(side<=.5,'platen stays on its guide line',{side});
 // The settled holds carry the toggle's signature: equal input steps give shrinking platen steps.
 const holds=[1,2,3,4,5,6].map(s=>{const h=prog.filter(x=>String(vars(x.f).stage)===String(s)&&Number(vars(x.f).settled)===1);assert.ok(h.length>0,'settled hold '+s);return h.at(-1);});
 const steps=holds.slice(1).map((h,i)=>h.meas-holds[i].meas),predSteps=holds.slice(1).map((h,i)=>h.pred-holds[i].pred);
 check(steps.every((s,i)=>i===0||s<steps[i-1]),'each equal input step advances the platen less',{steps});
 const heldErr=max(steps.map((s,i)=>[s,predSteps[i]]),([s,p])=>Math.abs(s-p));
 check(heldErr<=.05,'settled platen steps match the closure',{heldErrMm:heldErr,steps,predSteps});
 const last=rows.at(-1);check(Math.abs(last.meas)<=.3,'platen returns to its saved datum',{lastMm:last.meas});
 return{L1mm:g.L1*1000,L2mm:g.L2*1000,eMm:g.e*1000,alphaSpanDeg:alphaSpan,advanceMm:advance,predictedAdvanceMm:predAdvance,lawErrorMm:err,sideMm:side,steps,predSteps,stepRatio:steps[0]/steps.at(-1),heldStepErrorMm:heldErr,foundation:foundation(r,g.o)};
}

/** Measured loss of each batch-C law after its physical disconnection (the judge itself must also refuse). */
export function batchCDisconnectionLoss(id,r){
 if(id==='final-squeeze'){
  // passive_link removed: nothing reaches the platen. The documented knee (two equal 80 LDU = 32 mm links,
  // saved at 40 degrees, model header) predicts the advance for the input travel actually measured.
  const o=observeAddon(r,FS_BASE),m=r.mechanism,jO=m.joints.find(j=>j.motor?.port==='A'),a=unit(jO.axis),ref=unit(inPlane([1,0,0],a));
  const pl=o.body(FS_OUTPUT),guide=m.joints.find(j=>j.type==='slider'&&[j.body1,j.body2].includes(pl.id)&&[j.body1,j.body2].includes(o.base.id));assert.ok(guide,'platen guide');
  const u=unit(guide.axis),p0=o.initial(FS_OUTPUT),r0=o.angle(r.track[0],FS_INPUT,a,ref);
  const travelDeg=max(r.track,f=>Math.abs(deg(o.angle(f,FS_INPUT,a,ref)-r0))),L=32,alpha0=40*Math.PI/180;
  const predictedMm=2*L*(Math.cos(alpha0-Math.min(travelDeg,40)*Math.PI/180)-Math.cos(alpha0));
  const advanceMm=max(r.track,f=>Math.abs(dot(sub(o.point(f,FS_OUTPUT),p0),u))*1000);
  return{metric:'platenAdvanceMm',value:advanceMm,predictedMm,travelDeg,lost:travelDeg>=20&&advanceMm<predictedMm/4};
 }
 assert.fail('no batch-C disconnection measure for '+id);
}
