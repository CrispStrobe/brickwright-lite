// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
import {createPhysicalHingeObserver} from './sim-lab-rise-ratio-hinges.mjs';

const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=v=>Math.hypot(...v);
const unit=v=>{const n=norm(v);assert.ok(n>0&&Number.isFinite(n));return v.map(x=>x/n);};
const span=xs=>Math.max(...xs)-Math.min(...xs),deg=x=>x*180/Math.PI;
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const route=[64,60,56,52,48,52,56,60,64];

export function measureRiseRatio(r){
 const o=observeAddon(r,'hub'),physical=createPhysicalHingeObserver(r),joint=r.mechanism.joints.find(j=>j.motor?.port==='A');
 assert.ok(joint,'motor A must be an actual native hinge');
 const owners=id=>r.mechanism.bodies.filter(b=>b.parts.includes(id));
 for(const id of ['bottom_housing','bottom_fork_front','bottom_rack','top_fork_front','top_rack','drive_axle'])assert.equal(owners(id).length,1,'unique physical marker '+id);
 assert.equal(o.body('bottom_housing').id,o.base.id);
 const zero=o.initial('bottom_housing'),axis=v=>unit(sub(o.initial('bottom_housing',v),zero));
 const horizontal=axis([1,0,0]),up=axis([0,-1,0]),lateral=axis([0,0,-1]);
 assert.ok([dot(horizontal,up),dot(horizontal,lateral),dot(up,lateral)].every(x=>Math.abs(x)<1e-8));
 const rotor=o.body('drive_axle'),q0=mul(conj(o.base.rotation),rotor.rotation),shaftAxis=unit(rot(conj(o.base.rotation),joint.axis));
 return r.track.map(f=>{
  const O=o.point(f,'bottom_fork_front'),B=o.point(f,'bottom_rack',[130,0,0]),D=o.point(f,'top_fork_front'),T=o.point(f,'top_rack',[130,0,0]);
  const w=dot(sub(B,O),horizontal)*1000,h=dot(sub(D,O),up)*1000,original=physical.measure(f);
  const q=mul(mul(conj(f.bodies[o.base.id].rotation),f.bodies[rotor.id].rotation),conj(q0));
  return {t:f.t,phase:f.phase,variables:f.extra?.variables||{},widthMm:w,heightMm:h,lawErrorMm:h-Math.sqrt(Math.max(0,80**2-w*w)),
   topWidthMm:dot(sub(T,D),horizontal)*1000,xMm:dot(sub(D,O),horizontal)*1000,zMm:dot(sub(D,O),lateral)*1000,
   encoderDeg:deg(f.joints[joint.id].angle),shaftObservedDeg:deg(2*Math.atan2(dot(q.slice(0,3),shaftAxis),q[3])),
   gapMm:Math.max(o.gap(f),original.gapMm),axisDeg:Math.max(o.axisGap(f),original.axisMismatchDeg),
   frameDriftMm:norm(sub(f.bodies[o.base.id].position,o.base.position))*1000,frameTiltDeg:o.tilt(f),
   deckTiltDeg:deg(Math.acos(Math.max(-1,Math.min(1,dot(o.vector(f,'top_fork_front',up),up))))),
   finite:Object.values(f.bodies).every(p=>[...p.position,...p.rotation].every(Number.isFinite))};
 });
}

export function judgeRiseRatio(r,{control=false,native=false}={}){
 const rows=measureRiseRatio(r),m=r.mechanism;
 assert.equal(r.runModel.parts.length,control?181:182);assert.equal(m.hubs.length,1);assert.deepEqual(m.actuators.map(a=>a.port),['A']);
 assert.deepEqual(r.issues,[]);assert.deepEqual(m.diagnostics||[],[]);
 assert.ok(m.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'),'freestanding chassis');
 assert.ok(m.joints.every(j=>j.type!=='ball'),'physical revolute interfaces remain hinges');
 assert.equal(m.couplings.length,control?0:1,'the physical pinion determines the transmission');
 if(!control){assert.equal(m.couplings[0].kind,'rackAndPinion');assert.equal(m.couplings[0].ratio,-.006);}
 assert.ok(rows.length>200&&rows.every(s=>s.finite),'finite observed trajectory');
 assert.ok(Number.isFinite(r.finishedAt)&&r.finishedAt-(native?1000:r.start||0)<90000,'complete bounded VM program');
 const first=rows[0],last=rows.at(-1),max=k=>Math.max(...rows.map(s=>Math.abs(s[k])));
 assert.equal(Number(last.variables.completed),1);assert.equal(Number(last.variables.failed),0);assert.equal(Number(last.variables.stage),9);
 assert.ok(Math.abs(first.heightMm-48)<.5&&Math.abs(first.widthMm-64)<.5,'saved physical datum');
 assert.ok(rows.every(s=>s.widthMm>=46.4&&s.widthMm<=65.6),'original full width guard');
 assert.ok(max('lawErrorMm')<1,'independent 80 mm scissor law');
 assert.ok(rows.every(s=>Math.abs(s.topWidthMm-s.widthMm)<.5),'independent upper/lower widths');
 assert.ok(span(rows.map(s=>s.xMm))<1&&span(rows.map(s=>s.zMm))<1,'vertical deck path');
 assert.ok(max('deckTiltDeg')<2&&max('frameTiltDeg')<2,'level deck and stable foundation');
 assert.ok(max('gapMm')<.5&&max('axisDeg')<2,'all original physical and compiled hinges close');
 assert.ok(max('frameDriftMm')<1,'stationary chassis in the world frame');
 assert.ok(rows.every(s=>Math.abs(Math.abs(s.shaftObservedDeg)-Math.abs(s.encoderDeg))<1),'independent input shaft follows its encoder');
 assert.ok(Math.hypot(last.heightMm-first.heightMm,last.xMm-first.xMm,last.zMm-first.zMm)<1,'return to saved deck pose');
 assert.ok(Math.abs(last.encoderDeg)<1.5,'motor returns to datum');
 const after=rows.filter(s=>native?s.phase==='after':s.t>r.finishedAt);
 assert.ok(after.length>=30&&after.at(-1).t-r.finishedAt>=999.9,'full one-second observation after completion');
 if(native){
  const cold=rows.filter(s=>s.phase==='cold');
  assert.ok(cold.length>=31&&cold.at(-1).t-cold[0].t>=999.9,'full one-second unpowered cold interval');
  assert.ok(span(cold.map(s=>s.heightMm))<.5,'unpowered cold support');
 }
 const program=rows.filter(s=>native?s.phase==='program':s.t<=r.finishedAt),settled=program.filter(s=>Number(s.variables.arrived)===1&&Number(s.variables.stage)>=0&&Number(s.variables.stage)<=8);
 const order=settled.map(s=>Number(s.variables.stage)).filter((s,i,a)=>!i||s!==a[i-1]);assert.deepEqual(order,route.map((_,i)=>i),'complete chronological route');
 const stages=route.map((width,i)=>{
  const all=settled.filter(s=>Number(s.variables.stage)===i),end=all.at(-1)?.t,frames=all.filter(s=>s.t>=end-500.0001);
  assert.ok(frames.length>=15,'enough settled samples for stage '+i);
  const target=-(64-width)/6*180/Math.PI;
  assert.ok(frames.every(s=>Number(s.variables.direction)===-1&&Math.abs(Number(s.variables.target)-target)<1e-8&&Math.abs(s.encoderDeg-target)<=1.5),'independently declared encoder arrival '+i);
  if(!control)assert.ok(frames.every(s=>Math.abs(s.widthMm-width)<=.5),'independent rack arrival '+i);
  return {widthMm:frames.reduce((s,f)=>s+f.widthMm,0)/frames.length,heightMm:frames.reduce((s,f)=>s+f.heightMm,0)/frames.length};
 });
 const increments=stages.slice(1,5).map((s,i)=>s.heightMm-stages[i].heightMm),rise=span(rows.map(s=>s.heightMm)),travel=span(rows.map(s=>s.widthMm));
 if(control){assert.ok(rise<.5&&travel<.5,'disconnected drive cannot lift the supported deck');assert.ok(max('encoderDeg')>=150,'control still drives its real input');}
 else{assert.ok(rise>=15&&travel>=15&&stages[4].heightMm-stages[0].heightMm>=15,'useful passive lift');assert.ok(increments.every((x,i)=>x>0&&(!i||x<increments[i-1])),'equal rack steps give diminishing rises');}
 return {control,pieces:control?181:182,riseMm:rise,rackTravelMm:travel,heightIncrementsMm:increments,maxLawErrorMm:max('lawErrorMm'),maxHingeGapMm:max('gapMm'),maxAxisErrorDeg:max('axisDeg'),maxFrameDriftMm:max('frameDriftMm')};
}
