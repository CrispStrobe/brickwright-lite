// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions judge observed, passive bodies; they never drive their poses.
// Toggle Lever (dead-centre toggle) and Thirdline (neusis trisector), promoted from the
// experimental entries after independent native and browser review (2026-10-26).
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v)),deg=x=>x*180/Math.PI;
const span=a=>Math.max(...a)-Math.min(...a),max=(s,k)=>Math.max(...s.map(k));
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};
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
 assert.ok(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates');
 const gapMm=max(r.track,f=>o.gap(f)),axisDeg=max(r.track,f=>o.axisGap(f));
 assert.ok(gapMm<=.5&&axisDeg<=1,'true hinge closure and aligned axes');return{horizontalMm,tiltDeg,gapMm,axisDeg};
}
const passiveHinge=(r,o,part)=>{const id=o.body(part).id,j=r.mechanism.joints.find(j=>j.type==='hinge'&&!j.motor&&(j.body1===id||j.body2===id)&&[j.body1,j.body2].includes(o.base.id));assert.ok(j,'passive output hinged to the chassis: '+part);return j;};

// Toggle Lever: crank pin Y = (40 cos θ, 100) LDU drives a Scotch yoke; a 40 LDU link joins the yoke pin to the
// lever's input hole 20 LDU from its pivot P = (0, 120). Closure: |YL| = 40, |PL| = 20, continuous branch from
// φ(0) = atan2(12, 16). Lever rotation = φ − φ(0). Dead centre at θ = 90°: the program and jog stop at 85°.
export function toggleLeverRotationDeg(thetaRad,prev){
 const Y=[40*Math.cos(thetaRad),100],P=[0,120],dx=Y[0]-P[0],dz=Y[1]-P[1],d=Math.hypot(dx,dz);
 const a=Math.atan2(dz,dx),b=Math.acos(Math.max(-1,Math.min(1,(400+d*d-1600)/(40*d))));
 const near=x=>Math.abs(Math.atan2(Math.sin(x-prev),Math.cos(x-prev)));
 return near(a+b)<near(a-b)?a+b:a-b;
}
/** Largest |lever − closure prediction| (deg) over the recording, from body poses only; used by the disconnection control. */
export function toggleLeverLawErrorDeg(r){
 const o=observeAddon(r),lever=passiveHinge(r,o,'jaw_lever'),flat=v=>[v[0],0,v[2]];
 const ex=unit(flat(sub(o.initial('crank',[0,0,40]),o.initial('crank')))),ez=[ex[2],0,-ex[0]];
 const theta=unwrap(r.track.map(f=>{const v=flat(sub(o.point(f,'crank',[0,0,40]),o.point(f,'crank')));return Math.atan2(dot(v,ez),dot(v,ex));}));
 const s=Math.sign(theta[theta.reduce((k,x,i)=>Math.abs(x)>Math.abs(theta[k])?i:k,0)])||1,th=theta.map(x=>x*s);
 const ref=unit(flat(sub(o.initial('jaw_link_pin_lever'),o.initial('jaw_pivot_axle'))));
 const rot=unwrap(r.track.map(f=>o.angle(f,'jaw_lever',lever.axis,ref))).map(deg);
 let prev=Math.atan2(12,16);const phi0=prev,pred=th.map(t=>{prev=toggleLeverRotationDeg(t,prev);return deg(prev-phi0);});
 const k=th.reduce((a,x,i)=>x>th[a]?i:a,0),ls=Math.sign(rot[k])||1;
 return Math.max(...rot.map((x,i)=>Math.abs(x*ls-pred[i])));
}
export function judgeToggleLever(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,6);assert.equal(r.mechanism.joints.filter(j=>j.type==='slider').length,2);assert.equal(r.mechanism.joints.filter(j=>j.type==='hinge').length,5);
 const o=observeAddon(r),lever=passiveHinge(r,o,'jaw_lever'),input=r.mechanism.joints.find(j=>j.motor?.port==='A');assert.ok(input);
 assert.equal(new Set(['hub','crank','yoke_end_100','jaw_link','jaw_lever'].map(id=>o.body(id).id)).size,5,'crank, yoke, link and lever are distinct passive bodies');
 // Independent crank phase from the crank body itself (pin direction in the chassis frame), not the encoder.
 const flat=v=>[v[0],0,v[2]],ex=unit(flat(sub(o.initial('crank',[0,0,40]),o.initial('crank')))),ez=[ex[2],0,-ex[0]];
 const theta=unwrap(r.track.map(f=>{const v=flat(sub(o.point(f,'crank',[0,0,40]),o.point(f,'crank')));return Math.atan2(dot(v,ez),dot(v,ex));})).map(x=>Math.abs(x)<1e-9?0:x);
 const sign=Math.sign(theta[theta.reduce((k,x,i)=>Math.abs(x)>Math.abs(theta[k])?i:k,0)])||1,th=theta.map(x=>x*sign);
 const leverAxis=lever.axis,ref=unit(flat(sub(o.initial('jaw_link_pin_lever'),o.initial('jaw_pivot_axle'))));
 const rot=unwrap(r.track.map(f=>o.angle(f,'jaw_lever',leverAxis,ref)));
 let prev=Math.atan2(12,16);const phi0=prev;
 const pred=th.map(t=>{prev=toggleLeverRotationDeg(t,prev);return deg(prev-phi0);});
 const maxIdx=th.reduce((k,x,i)=>x>th[k]?i:k,0),lsign=Math.sign(rot[maxIdx])||1;
 const Y0=o.point(r.track[0],'yoke_end_100');
 const rows=r.track.map((f,i)=>{const Y=o.point(f,'yoke_end_100'),dy=sub(Y,Y0);
  return{t:f.t,phase:f.phase,stage:Number(f.extra.variables.stage),crankDeg:deg(th[i]),leverDeg:deg(rot[i])*lsign,predDeg:pred[i],
   yokeLawMm:Math.abs(dot(dy,ex)*1000-16*(Math.cos(th[i])-1)),yokeTransverseMm:norm(sub(dy,ex.map(x=>x*dot(dy,ex))))*1000};});
 const vars=r.track.at(-1).extra.variables;assert.equal(Number(vars.completed),1);assert.equal(Number(vars.failed),0);assert.equal(Number(vars.stage),4);
 const lo=rows.filter(x=>x.crankDeg<=60),hi=rows.filter(x=>x.crankDeg>60);
 const errLo=max(lo,x=>Math.abs(x.leverDeg-x.predDeg)),errHi=hi.length?max(hi,x=>Math.abs(x.leverDeg-x.predDeg)):0;
 const peakCrank=max(rows,x=>x.crankDeg),peakLever=max(rows,x=>x.leverDeg),last=rows.at(-1);
 assert.ok(peakCrank>=84&&peakCrank<=86.5,'crank reaches its 85° stop short of dead centre');
 assert.ok(peakLever>=44,'passive lever swings through the toggle');
 assert.ok(errLo<=.5,'lever follows the closed-loop law within 0.5° up to 60°');
 assert.ok(errHi<=2.5,'lever follows the law within 2.5° near dead centre (60–85°)');
 assert.ok(max(rows,x=>x.yokeLawMm)<=.5&&max(rows,x=>x.yokeTransverseMm)<=.5,'Scotch yoke follows 16 cos θ on its line');
 assert.ok(Math.abs(last.crankDeg)<=1.5&&Math.abs(last.leverDeg)<=.5,'crank and lever return to the saved pose');
 return{peakCrankDeg:peakCrank,peakLeverDeg:peakLever,lawErrorDeg:{toSixty:errLo,nearDeadCentre:errHi},foundation:foundation(r,o)};
}

// Thirdline: input heading θ (input arm), ruler heading φ. With the marked distance equal to the circle radius
// the closure sin(θ − 2φ) = (d/r) sin φ reduces to θ = 3φ on the selected branch. The saved pose is θ = 90°, φ = 30°.
export function judgeThirdline(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,6);assert.equal(r.mechanism.joints.filter(j=>j.type==='slider').length,2);assert.equal(r.mechanism.joints.filter(j=>j.type==='hinge').length,5);
 const o=observeAddon(r),input=r.mechanism.joints.find(j=>j.motor?.port==='A');assert.ok(input);
 const inputBody=o.body('input_arm'),rulerBody=o.body('ruler_cross_100');
 assert.equal(new Set([o.base.id,inputBody.id,rulerBody.id,o.body('circle_arm').id].map(String)).size,4,'input arm, circle arm and ruler are distinct passive bodies');
 const axis=[0,1,0],ref=[1,0,0];
 const din=unwrap(r.track.map(f=>o.angle(f,'input_arm',axis,ref))).map(deg),dru=unwrap(r.track.map(f=>o.angle(f,'ruler_cross_100',axis,ref))).map(deg);
 const rows=r.track.map((f,i)=>({t:f.t,phase:f.phase,stage:Number(f.extra.variables.stage),inputDeg:din[i]-din[0],rulerDeg:dru[i]-dru[0]}));
 const vars=r.track.at(-1).extra.variables;assert.equal(Number(vars.completed),1);assert.equal(Number(vars.failed),0);assert.equal(Number(vars.stage),7);
 const inputSpan=span(rows.map(x=>x.inputDeg)),rulerSpan=span(rows.map(x=>x.rulerDeg));
 assert.ok(inputSpan>=44&&inputSpan<=47,'input sweeps its 50–95° sector');
 assert.ok(rulerSpan>=44/3,'passive ruler turns');
 const lawErr=max(rows,x=>Math.abs(x.rulerDeg-x.inputDeg/3));
 assert.ok(lawErr<=.05,'ruler heading stays at one third of the input within 0.05°');
 const last=rows.at(-1);assert.ok(Math.abs(last.inputDeg)<=1&&Math.abs(last.rulerDeg)<=.4,'input and ruler return to the saved datum');
 return{inputSpanDeg:inputSpan,rulerSpanDeg:rulerSpan,lawErrorDeg:lawErr,foundation:foundation(r,o)};
}
