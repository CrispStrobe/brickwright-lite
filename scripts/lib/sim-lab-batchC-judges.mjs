// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions judge observed, passive bodies; they never drive their poses.
// Batch C (2026-10-27): Final Squeeze, promoted from the experimental entries after review.
// Batch D (2026-10-28): High Select, promoted after its rest-stop repair (#1455); Final Squeeze's
// construction repair lets the batch C knee-closure judge run on the library model unchanged.
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

function healthy(r,native,couplings=null){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
 if(couplings)couplings(r.mechanism);else assert.deepEqual(r.mechanism.couplings,[],'no imposed output coupling');
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

// ---------------------------------------------------------------------------------------------
// High Select: a mechanical maximum. Motors A and B each lift a rack carriage on vertical guides; a separate
// passive bridge, on its own vertical guides, rests under gravity on whichever carriage pad is higher. With
// a, b the upward displacements of the two carriage pads and h that of the bridge feet, all from the saved
// pose (a tie at zero) and in the chassis frame, the ideal settled relation is h = max(a,b). It is checked at
// every settled hold of the program (stages 0-10, 'settled' = 1), from the observed pad and foot surfaces;
// the bridge is never read, assigned or actuated by the program. Moving frames lag; only holds are judged.
const HS_TOL_MM=.1,HS_BASE='hub',HS_A='input_A_pad',HS_B='input_B_pad',HS_FEET=['bridge_A_foot','bridge_B_foot'],HS_UP=[0,1,0];
function maxSelectRows(r){
 const o=observeAddon(r,HS_BASE),up=id=>{const p0=o.initial(id);return f=>dot(sub(o.point(f,id),p0),HS_UP)*1000;};
 const a=up(HS_A),b=up(HS_B),feet=HS_FEET.map(up);
 return{o,rows:r.track.map(f=>{const hf=feet.map(g=>g(f));return{f,a:a(f),b:b(f),h:(hf[0]+hf[1])/2,level:hf[0]-hf[1]};})};
}
function maxSelectHolds(rows){
 const prog=rows.filter(x=>x.f.phase==='program');
 return Array.from({length:11},(_,s)=>{const h=prog.filter(x=>String(vars(x.f).stage)===String(s)&&Number(vars(x.f).settled)===1);assert.ok(h.length>0,'settled hold '+s);return h.at(-1);});
}
export function judgeHighSelect(r,{native=false}={}){
 // The only couplings are the two motor pinions on their own input racks; nothing couples the bridge.
 healthy(r,native,m=>{const motorHinge=new Set(m.joints.filter(j=>j.motor).map(j=>j.id)),bridge=m.bodies.find(b=>b.parts.includes(HS_FEET[0])).id;
  const inputSliders=new Set(m.joints.filter(j=>j.type==='slider'&&j.body1!==bridge&&j.body2!==bridge).map(j=>j.id));
  check(m.couplings.length===2&&m.couplings.every(c=>c.kind==='rackAndPinion'&&motorHinge.has(c.hingeJoint)&&inputSliders.has(c.sliderJoint)),'only the two input rack drives; no imposed output coupling',{couplings:m.couplings});});
 assert.equal(r.mechanism.actuators.length,2);
 assert.deepEqual(r.mechanism.actuators.map(x=>x.port).sort(),['A','B']);
 const v=vars(r.track.at(-1));check(Number(v.complete)===1&&Number(v.fault)===0&&String(v.stage)==='10','program completes without fault',{complete:v.complete,fault:v.fault,stage:v.stage});
 const {o,rows}=maxSelectRows(r),holds=maxSelectHolds(rows);
 // The itinerary must really exercise the selector: each side leads, a tie above zero, and the full 16 mm range.
 const sel=holds.map(x=>({stage:vars(x.f).stage,a:x.a,b:x.b,h:x.h,max:Math.max(x.a,x.b),err:x.h-Math.max(x.a,x.b),level:x.level}));
 const range=Math.max(...sel.map(x=>x.max))-Math.min(...sel.map(x=>x.max));
 check(range>=15,'inputs cover the 0-16 mm range',{range});
 check(sel.some(x=>x.a>=x.b+2)&&sel.some(x=>x.b>=x.a+2)&&sel.some(x=>x.max>=4&&Math.abs(x.a-x.b)<=.5),'each side leads and the inputs tie above zero',{sel});
 const target=sel.map((x,i)=>({stage:x.stage,dA:x.a-Number(vars(holds[i].f).targetHeightA),dB:x.b-Number(vars(holds[i].f).targetHeightB)}));
 const targetErr=max(target,x=>Math.max(Math.abs(x.dA),Math.abs(x.dB)));
 check(targetErr<=.5,'the carriages reach their commanded heights at every hold',{targetErr,target});
 const err=max(sel,x=>Math.abs(x.err));
 check(err<=HS_TOL_MM,'settled bridge height h = max(a,b) at every hold',{errMm:err,sel});
 const level=max(sel,x=>Math.abs(x.level));
 check(level<=.5,'the bridge stays level on its guides',{levelMm:level});
 // The lower input has zero ideal gain: holds where only the lower side moved leave the bridge where it was.
 const lowerOnly=sel.slice(1).map((x,i)=>[sel[i],x]).filter(([p,q])=>{const lead=p.a>=p.b?'a':'b',lag=lead==='a'?'b':'a';return Math.abs(q[lead]-p[lead])<.5&&Math.abs(q[lag]-p[lag])>=2&&q[lag]<q[lead]-.5;});
 check(lowerOnly.length>=1,'the itinerary moves a lower input beneath the bridge',{lowerOnly:lowerOnly.length});
 const lowerGain=max(lowerOnly,([p,q])=>Math.abs(q.h-p.h));
 check(lowerGain<=HS_TOL_MM,'moving only the lower input leaves the bridge in place',{lowerGainMm:lowerGain});
 return{holds:sel,lawErrorMm:err,targetErrorMm:targetErr,levelMm:level,rangeMm:range,lowerOnlyHolds:lowerOnly.length,lowerGainMm:lowerGain,foundation:foundation(r,o)};
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
 if(id==='high-select'){
  // Both bridge feet removed: nothing carries the bridge on the pads. The inputs still run their itinerary,
  // and the bridge no longer follows the higher pad at the holds.
  const o=observeAddon(r,HS_BASE),up=pid=>{const p0=o.initial(pid);return f=>dot(sub(o.point(f,pid),p0),HS_UP)*1000;},a=up('input_A_rack'),b=up('input_B_rack'),h=up('bridge_spine_0');
  const holds=maxSelectHolds(r.track.map(f=>({f}))).map(x=>({a:a(x.f),b:b(x.f),h:h(x.f)}));
  const range=Math.max(...holds.map(x=>Math.max(x.a,x.b)))-Math.min(...holds.map(x=>Math.max(x.a,x.b)));
  const errMm=max(holds,x=>Math.abs(x.h-Math.max(x.a,x.b)));
  return{metric:'maxLawErrorMm',value:errMm,inputRangeMm:range,lost:range>=15&&errMm>2};
 }
 assert.fail('no batch-C disconnection measure for '+id);
}
