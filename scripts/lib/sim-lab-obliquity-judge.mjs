// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Obliquity Orrery judge obliquity-tilt-v1 (R1, 2026-11-11).
//
// The law and why it is this mechanism's physics:
// - Drive: motor A's output socket holds axle A directly, so crank A turns 1:1 with the motor (no gearing).
// - Parallelogram: crank A and crank B are both 40 LDU (16 mm) and their frame axles are 80 LDU (32 mm) apart,
//   exactly the spacing of the two crank pins in the coupler. The coupler therefore translates without
//   turning, and every point of it moves on a 16 mm circle about its own centre.
// - Earth: fixed to the coupler through an angle connector #3 (157.5°), so its axis n is tilted ε = 22.5° from
//   vertical and, because the coupler never turns, n keeps one direction in space (parallel transport).
// - Sun: the marker stands on the frame exactly at the orbit centre of the Earth reference point on the axis,
//   level with it. The Sun direction s from the Earth is therefore horizontal and turns once per orbit.
// - Declination: sin δ = n · s. n = (sin ε·h, cos ε) with h the horizontal unit vector of the tilt, s horizontal,
//   so sin δ = sin ε · cos(λ − λ₀), λ the orbit position and λ₀ the position where the axis leans at the Sun.
//   In the saved pose the axis leans straight at the Sun (λ₀ = 45°, the pose's orbit position): sin δ =
//   sin 22.5° · cos(λ − 45°). The compiled LDraw reproduces this to 1.4e-5° over a full orbit.
//
// So the law is predicted from the compiled parts, not fitted: ε and the solstice position λ₀ are read from the
// compiled Earth axis and Sun marker, and must equal the contract's 22.5° and 45° (a turned connector, the
// wrong-model mutant, moves λ₀ to 135° and is refused). λ is measured from the observed Sun→Earth direction;
// the 1:1 drive is checked separately against motor A's encoder (λ − 45° = ∓ motor angle; the sign is the
// encoder convention only). δ is measured from the observed Earth axis, never from the encoder.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v));
const deg=x=>x*180/Math.PI,rad=x=>x*Math.PI/180,span=a=>Math.max(...a)-Math.min(...a),max=(s,k)=>Math.max(...s.map(k));
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));

// The reviewed law's constants and bounds (obliquity-tilt-v1). Never loosened to admit a model.
export const OBLIQUITY_TILT=Object.freeze({epsilonDeg:22.5,solsticeDeg:45,orbitMm:16,
 compiledDeg:.01,compiledMm:.05,lawDeg:.01,driveDeg:.25,radiusMm:.4,longitudeSpanDeg:85,returnDeg:1,disconnectedDeg:2});
// Earth axis points in the Earth plate's frame: the reference point level with the Sun, and a point up the axis.
const EARTH_REF=[0,2,0],EARTH_POLE=[0,-18,0];

/** ε, the solstice orbit position λ₀ and the orbit geometry, from the compiled parts alone (no motion). */
export function compiledOrrery(r,o=observeAddon(r)){
 const e=o.initial('earth',EARTH_REF),n=unit(sub(o.initial('earth',EARTH_POLE),e)),sun=o.initial('sun_marker');
 const a=o.initial('axle_A'),pa=o.initial('crank_pin_A'),b=o.initial('axle_B'),pb=o.initial('crank_pin_B');
 const flat=v=>Math.hypot(v[0],v[2]);
 // λ is measured in the world's horizontal plane; the saved pose sits at λ = 45°, so λ₀ = 45° + the angle from
 // the Sun→Earth direction to the Sun-facing horizontal tilt (−n) about the vertical.
 const r0=sub(e,sun),toSun=[-n[0],0,-n[2]],earthAz=Math.atan2(r0[2],r0[0]),tiltAz=Math.atan2(toSun[2],toSun[0]);
 const solstice=OBLIQUITY_TILT.solsticeDeg+deg(Math.atan2(Math.sin(tiltAz-earthAz),Math.cos(tiltAz-earthAz)));
 return{epsilonDeg:deg(Math.acos(n[1])),solsticeDeg:solstice,orbitMm:flat(r0)*1000,sunHeightMm:(e[1]-sun[1])*1000,
  crankAMm:flat(sub(pa,a))*1000,crankBMm:flat(sub(pb,b))*1000,frameSpacingMm:flat(sub(b,a))*1000,pinSpacingMm:flat(sub(pb,pa))*1000};
}

/** Per frame: observed δ (Earth axis · Sun direction), λ (Sun→Earth direction), orbit radius and motor angle. */
export function orreryTrack(r,o=observeAddon(r)){
 const motor=r.mechanism.joints.find(j=>j.motor?.port==='A');assert.ok(motor,'motor A drives a joint');
 const frames=r.track.filter(f=>f.phase!=='cold');assert.ok(frames.length>0,'program frames recorded');
 const raw=frames.map(f=>{const e=o.point(f,'earth',EARTH_REF),n=sub(o.point(f,'earth',EARTH_POLE),e),u=o.point(f,'sun_marker'),s=sub(u,e);
  return{t:f.t,delta:deg(Math.asin(dot(n,s)/norm(n)/norm(s))),az:Math.atan2(e[2]-u[2],e[0]-u[0]),radiusMm:Math.hypot(e[0]-u[0],e[2]-u[2])*1000,motorDeg:deg(f.joints[motor.id].angle)};});
 const az=unwrap(raw.map(x=>x.az));
 return raw.map((x,i)=>({...x,lam:OBLIQUITY_TILT.solsticeDeg+deg(az[i]-az[0])}));
}
const lawDeg=(lam,eps=OBLIQUITY_TILT.epsilonDeg,lam0=OBLIQUITY_TILT.solsticeDeg)=>deg(Math.asin(Math.sin(rad(eps))*Math.cos(rad(lam-lam0))));
/** λ from the encoder: 45° plus the motor turn, with the sign that the recorded run's own direction fixes. */
const driveRows=rows=>{const m0=rows[0].motorDeg,dm=rows.map(x=>x.motorDeg-m0),dl=rows.map(x=>x.lam-rows[0].lam);
 const sgn=dm.reduce((s,v,i)=>s+v*dl[i],0)>=0?1:-1;return rows.map((x,i)=>({...x,lamDrive:rows[0].lam+sgn*dm[i]}));};

function healthy(r,native,expectedIssues){
 const key=i=>i.code+':'+[...(i.parts||[])].sort().join(',');
 assert.deepEqual(r.issues.map(key).sort(),expectedIssues.map(key).sort(),'compiler issues are exactly the reviewed, declared ones');
 assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
}
function foundation(r,o){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id],frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=max(frames,f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000),tiltDeg=max(frames,f=>o.tilt(f));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});
 const gapMm=max(r.track,f=>o.gap(f)),axisDeg=max(r.track,f=>o.axisGap(f));
 check(gapMm<=.5&&axisDeg<=1,'true hinge closure and aligned axes',{gapMm,axisDeg});return{horizontalMm,tiltDeg,gapMm,axisDeg};
}

/** obliquity-tilt-v1: sin δ = sin 22.5° · cos(λ − 45°), predicted from the compiled axle tilt, max error 0.01°. */
export function judgeObliquityTilt(r,{native=false,contract}={}){
 const L=OBLIQUITY_TILT;healthy(r,native,contract?.expectedIssues??[]);assert.equal(r.mechanism.actuators.length,1);
 const o=observeAddon(r),g=compiledOrrery(r,o);
 // The compiled model must be the reviewed mechanism: the law's constants come from its parts.
 check(Math.abs(g.epsilonDeg-L.epsilonDeg)<=L.compiledDeg,'compiled axle tilt is 22.5°',g);
 check(Math.abs(g.solsticeDeg-L.solsticeDeg)<=L.compiledDeg,'compiled axis leans at the Sun at λ = 45°',g);
 check(Math.abs(g.orbitMm-L.orbitMm)<=L.compiledMm&&Math.abs(g.sunHeightMm)<=L.compiledMm,'compiled Sun at the orbit centre, level with the Earth',g);
 check([g.crankAMm,g.crankBMm].every(x=>Math.abs(x-L.orbitMm)<=L.compiledMm)&&Math.abs(g.frameSpacingMm-g.pinSpacingMm)<=L.compiledMm,'compiled parallelogram: equal 16 mm cranks, equal spacings',g);
 const v=r.track.at(-1).extra.variables;assert.equal(Number(v.completed),1,'program reports completion');assert.equal(Number(v.failed),0,'program reports no failure');assert.equal(Number(v.stage),99,'program reaches its final stage');
 const rows=driveRows(orreryTrack(r,o));
 const longitudeSpanDeg=span(rows.map(x=>x.lam)),lawErrorDeg=max(rows,x=>Math.abs(x.delta-lawDeg(x.lam))),driveErrorDeg=max(rows,x=>Math.abs(x.lam-x.lamDrive));
 const radiusErrorMm=max(rows,x=>Math.abs(x.radiusMm-L.orbitMm)),returnDeg=Math.abs(rows.at(-1).lam-rows[0].lam);
 const deltaRange=[Math.min(...rows.map(x=>x.delta)),Math.max(...rows.map(x=>x.delta))],values={longitudeSpanDeg,lawErrorDeg,driveErrorDeg,radiusErrorMm,returnDeg,deltaRange};
 check(longitudeSpanDeg>=L.longitudeSpanDeg,'Earth travels a quarter orbit',values);
 check(lawErrorDeg<=L.lawDeg,'declination follows sin δ = sin 22.5° · cos(λ − 45°)',values);
 check(driveErrorDeg<=L.driveDeg,'crank A turns 1:1 with motor A',values);
 check(radiusErrorMm<=L.radiusMm,'16 mm orbit',values);
 check(returnDeg<=L.returnDeg,'Earth returns to the saved position',values);
 return{law:'sin δ = sin 22.5° · cos(λ − 45°)',compiled:g,...values,frames:rows.length,foundation:foundation(r,o)};
}

/**
 * Disconnection loss: with the reviewed part removed, the input still completes but δ no longer follows the law
 * evaluated at the encoder's orbit position (the input→output law). Lost when that error exceeds 2°.
 */
export function obliquityDisconnectionLoss(r){
 const rows=orreryTrack(r),m0=rows[0].motorDeg,motorSpanDeg=span(rows.map(x=>x.motorDeg));
 // Either encoder sign: the smaller error is the one a working drive would have.
 const err=s=>max(rows,x=>Math.abs(x.delta-lawDeg(OBLIQUITY_TILT.solsticeDeg+s*(x.motorDeg-m0))));
 const value=Math.min(err(1),err(-1));
 return{metric:'encoderLawErrorDeg',value,motorSpanDeg,longitudeSpanDeg:span(rows.map(x=>x.lam)),lost:value>OBLIQUITY_TILT.disconnectedDeg};
}
