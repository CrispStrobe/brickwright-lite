// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Afterturn (closed shape cycle on a free yaw platform), judged after the native rotor (#1573).
// Predictions are derived from the compiled bodies and the documented slider-crank geometry, never
// from the recorded motion; they only check observed, passive poses. Failing checks carry their values.
//
// DERIVATION (afterturnPrediction below).
// The platform P (every dynamic body except the base) turns about the vertical yaw bearing j0. Motor A
// turns the reaction wheel W about a parallel axis through the same line. Motor B turns a crank that
// drives two balanced slider carts radially through two rods (slider-crank). With no external yaw
// torque the total yaw angular momentum about the bearing line stays zero (the run starts at rest):
//   J(B)·ψ' + Iw·α' + h(B)·B' = 0,
// ψ the platform yaw, α the wheel angle relative to the platform, Iw the wheel's own moment about its
// axis, J(B) the locked moment of the whole platform (wheel included) at shape B, h(B)·B' the yaw
// momentum of the moving shape parts. The native rotor's energy ½·Jr·(ω2−ω1)² depends only on the
// relative rate, so its generalised momentum about ψ is Jr·(ω2−ω1) − Jr·(ω2−ω1) = 0: it adds no yaw
// momentum (#1573; the legacy treatment added Jr to both bodies, the #1494 double count).
// Wheel stroke at fixed shape B:  dψ/dα = −Iw/J(B)  =>  ratio(B) = Iw/J(B) platform°/wheel°.
// Shape strokes at a held wheel contribute −∫h(B)/J(B) dB; the cycle runs B 0→70 and back along the same
// path, so the two shape contributions cancel exactly. The program's closed cycle is
//   B 0→70, A 0→+900, B 70→0, A +900→0  =>  Δψcycle = −ratio(70)·ΔA1 − ratio(0)·ΔA2,
// and its inverse (A 0→+900 at B 0, B 0→70, A back at B 70, B back) gives the negative of that.
// With ΔA1 = −ΔA2 = 900°: Δψcycle = −900°·(ratio(70) − ratio(0)) (the sign is the platform's reported yaw,
// which this model reports opposite to motor A).
// The fixed-mass control has no rods or carts: J does not depend on B, so its two strokes cancel and
// the ideal net cycle is 0.
//
// J(B) is summed body by body with the compiled per-collider masses (massProperties, the engine's own
// construction) about the yaw line, each body posed by the slider-crank kinematics at crank angle B:
// crank pin P rotates by B about the crank axis; the cart pin S slides along its slider axis to keep the
// rod length |S−P|; the rod turns about the crank axis by the angle between its old and new direction;
// the cart translates. The slider-crank radius at B is c·cos B + √(L² − c²·sin² B) (c = 16 mm crank,
// L = 48 mm rod: 64 mm at B = 0, 51.0568 mm at B = 70°, as in the supplied lesson). Every rotation here
// is about the horizontal crank axis and each moving body's yaw moment is even in the rotation sign
// (zero yz products of inertia), so the result does not depend on the motor sign convention.
//
// TOLERANCES.
// Stroke ratio: 1 % of the prediction, the bound of the analytic free-pair rotor control
// (test/bw-sim-rotor-inertia.test.mjs) already used for the saved-pose stroke (bw-sim-rotor-model.test.mjs).
// Net cycle: the cycle is the sum of two strokes, each within 1 % of its own ratio times its own measured
// wheel travel, so |Δψ − Δψpred| ≤ 0.01·(ratio(70)·|ΔA1| + ratio(0)·|ΔA2|), with Δψpred evaluated from
// the measured ΔA1, ΔA2 (encoder arrival errors are therefore not charged to the law). The inverse and
// the control use the same bound around their predictions. A law that cannot be resolved inside that
// bound is refused: the predicted cycle must exceed twice its own bound, so a cycle the judge passes is
// the shape-dependent inertia and not noise.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom,prepareModel} from '../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {observeAddon} from './sim-lab-addon-judge.mjs';
import {massProperties,inertiaAboutLine} from './sim-lab-batch3-judges.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>scale(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const axisAngle=(a,t)=>[...scale(a,Math.sin(t/2)),Math.cos(t/2)];
const deg=x=>x*180/Math.PI,rad=x=>x*Math.PI/180,max=(s,k)=>Math.max(...s.map(k));
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
const twist=(q,q0,a)=>{const d=mul(q,conj(q0));return 2*Math.atan2(dot(d.slice(0,3),a),d[3]);};
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};

export const AFTERTURN={base:'base_cross_100',wheel:'reaction_axle',crank:'crank_B_axle',strokeDeg:70,wheelDeg:900,sides:[['rod_left','rod_left_cart_pin'],['rod_right','rod_right_cart_pin']]};
export const RATIO_TOLERANCE=.01;
const rotateAbout=(pose,O,q)=>({position:add(O,rot(q,sub(pose.position,O))),rotation:mul(q,pose.rotation)});

/** Independent prediction for a compiled Afterturn mechanism at crank angle B (degrees). */
export function afterturnPrediction(m,Bdeg){
 const byPart=p=>{const b=m.bodies.find(b=>b.parts.includes(p));assert.ok(b,p);return b;};
 const base=byPart(AFTERTURN.base),wheel=byPart(AFTERTURN.wheel),crank=byPart(AFTERTURN.crank);
 const yaw=m.joints.find(j=>j.type==='hinge'&&[j.body1,j.body2].includes(base.id));assert.ok(yaw,'yaw bearing');
 const a=unit(yaw.axis),P0=yaw.point,wheelJ=m.joints.find(j=>j.motor?.port==='A');assert.equal(wheelJ.body2,wheel.id);
 check(norm(cross(unit(wheelJ.axis),a))<1e-9&&norm(cross(sub(wheelJ.point,P0),a))<1e-9,'wheel turns about the yaw line',{wheel:wheelJ.point,yaw:P0});
 const crankJ=m.joints.find(j=>j.motor?.port==='B');assert.equal(crankJ.body2,crank.id);
 const ca=unit(crankJ.axis),qc=axisAngle(ca,rad(Bdeg)),poses=new Map(m.bodies.map(b=>[b.id,{position:b.position,rotation:b.rotation}]));
 poses.set(crank.id,rotateAbout(poses.get(crank.id),crankJ.point,qc));
 const sides=[];
 for(const [rodPart,cartPart] of AFTERTURN.sides){
  const rod=byPart(rodPart),cart=byPart(cartPart);
  // The fixed-mass control parks its rods and carts on the platform: no slider, nothing moves with B.
  if(!m.joints.some(j=>j.type==='slider'&&[j.body1,j.body2].includes(cart.id)))continue;
  const hinge=(x,y)=>m.joints.find(j=>j.type==='hinge'&&[j.body1,j.body2].includes(x)&&[j.body1,j.body2].includes(y));
  const pinJ=hinge(rod.id,crank.id),cartJ=hinge(rod.id,cart.id),slide=m.joints.find(j=>j.type==='slider'&&[j.body1,j.body2].includes(cart.id));assert.ok(pinJ&&cartJ&&slide,'slider-crank '+rodPart);
  const P=pinJ.point,S=cartJ.point,L=norm(sub(S,P)),u=unit(slide.axis),Pn=add(crankJ.point,rot(qc,sub(P,crankJ.point)));
  // S + t·u at rod length from the moved pin; the root continuous with t = 0 at B = 0.
  const w=sub(S,Pn),bq=dot(w,u),disc=bq*bq-(dot(w,w)-L*L);assert.ok(disc>=0,'rod reaches its slider');
  const t=[-bq+Math.sqrt(disc),-bq-Math.sqrt(disc)].sort((x,y)=>Math.abs(x)-Math.abs(y))[0],Sn=add(S,scale(u,t));
  const d0=sub(S,P),d1=sub(Sn,Pn);check(Math.abs(dot(d0,ca))<1e-9&&Math.abs(dot(d1,ca))<1e-9,'rod moves in the crank plane',{d0,d1});
  const phi=Math.atan2(dot(ca,cross(d0,d1)),dot(d0,d1)),qr=axisAngle(ca,phi),rp=poses.get(rod.id);
  poses.set(rod.id,{position:add(Pn,rot(qr,sub(rp.position,P))),rotation:mul(qr,rp.rotation)});
  poses.set(cart.id,{position:add(poses.get(cart.id).position,scale(u,t)),rotation:poses.get(cart.id).rotation});
  const radius=p=>norm(sub(sub(p,P0),scale(a,dot(sub(p,P0),a))));
  sides.push({rodPart,crankMm:norm(sub(sub(P,crankJ.point),scale(ca,dot(sub(P,crankJ.point),ca))))*1000,rodMm:L*1000,cartRadiusMm:radius(Sn)*1000,cartTravelMm:t*1000});
 }
 const platform=m.bodies.filter(b=>b.motion==='dynamic'&&b.id!==base.id);
 const J=platform.reduce((s,b)=>s+inertiaAboutLine(b,poses.get(b.id),P0,a),0);
 const mpW=massProperties(wheel),Iw=dot(a,[0,1,2].map(i=>dot(rotTensorRow(wheel.rotation,mpW.inertia,i),a)))+mpW.mass*perp2(add(wheel.position,rot(wheel.rotation,mpW.com)),P0,a);
 return{Bdeg,J,Iw,ratio:Iw/J,sides};
}
// The wheel's own moment about the yaw line (it lies on that line, so the parallel-axis term vanishes up to its COM offset).
const perp2=(c,P,a)=>{const r=sub(c,P),rp=sub(r,scale(a,dot(r,a)));return dot(rp,rp);};
function rotTensorRow(q,I,i){const R=[[1,0,0],[0,1,0],[0,0,1]].map(e=>rot(q,e)),M=[0,1,2].map(r=>[0,1,2].map(c=>R[c][r]));return[0,1,2].map(j=>[0,1,2].reduce((s,k)=>s+M[i][k]*[0,1,2].reduce((t,l)=>t+I[k][l]*M[j][l],0),0));}

function healthy(r,control){
 // The control's parked rods close two loops on the platform; the compiler locks them (its two declared notices).
 if(control)assert.deepEqual(r.issues.map(i=>i.code),['locked-hinges','locked-hinges']);else assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=1000,'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
 assert.deepEqual(r.mechanism.couplings,[],'no imposed output coupling');
}
function foundation(r,o){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id],frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=max(frames,f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000),tiltDeg=max(frames,f=>o.tilt(f));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});
 const gapMm=max(r.track,f=>o.gap(f)),axisDeg=max(r.track,f=>o.axisGap(f));
 check(gapMm<=.5&&axisDeg<=1,'true hinge closure and aligned axes',{gapMm,axisDeg});return{horizontalMm,tiltDeg,gapMm,axisDeg};
}

/** Observed rows from body poses only: platform yaw over the base, wheel over the platform, crank over the platform (degrees). */
function observe(r){
 const m=r.mechanism,body=p=>m.bodies.find(b=>b.parts.includes(p));
 const base=body(AFTERTURN.base),wheel=body(AFTERTURN.wheel),crank=body(AFTERTURN.crank);
 const yawJ=m.joints.find(j=>j.type==='hinge'&&[j.body1,j.body2].includes(base.id)),plat=m.bodies.find(b=>b.id===(yawJ.body1===base.id?yawJ.body2:yawJ.body1));
 // α (wheel over platform) is taken about the same positive axis as ψ, as the law dψ/dα = −Iw/J requires;
 // motor A's own axis points the other way, so α = −A in the program's degrees.
 const a=unit(yawJ.axis),ba=unit(m.joints.find(j=>j.motor?.port==='B').axis);
 // Relative rotation of x over y, expressed in y's compiled frame, as a twist about the compiled axis.
 const rel=(f,x,y,axis)=>twist(mul(conj(f.bodies[y.id].rotation),f.bodies[x.id].rotation),mul(conj(y.rotation),x.rotation),axis);
 const psi=unwrap(r.track.map(f=>rel(f,plat,base,a))),A=unwrap(r.track.map(f=>rel(f,wheel,plat,a))),B=unwrap(r.track.map(f=>rel(f,crank,plat,ba)));
 return r.track.map((f,i)=>({t:f.t,psi:deg(psi[i]-psi[0]),A:deg(A[i]-A[0]),B:deg(B[i]-B[0])}));
}
/** Rest-to-rest wheel strokes (|Δα| > 100°) at a held crank, each with its mean crank angle. */
function strokes(rows){
 const out=[];let start=null;
 for(let i=1;i<rows.length;i++){
  const moving=Math.abs(rows[i].A-rows[i-1].A)>1e-3;
  if(moving&&start===null)start=i-1;
  if((!moving||i===rows.length-1)&&start!==null){const a=rows[start],b=rows[i-1];if(Math.abs(b.A-a.A)>100)out.push({from:start,to:i-1,dA:b.A-a.A,dPsi:b.psi-a.psi,B:(a.B+b.B)/2,Bspread:Math.abs(b.B-a.B),ratio:-(b.psi-a.psi)/(b.A-a.A)});start=null;}
 }
 return out;
}

/**
 * afterturn-shape-cycle-v1. Moving masses: four wheel strokes (cycle, inverse) at B = 70° and B = 0, each
 * ratio within 1 % of Iw/J(B); net cycle and inverse within their derived bounds; the shape effect is
 * resolved (predicted cycle > twice its bound). Control (fixed masses): two strokes at the constant
 * ratio and a net cycle within its bound of zero.
 */
export function judgeAfterturn(r,{contract}={}){
 const control=contract?.id==='afterturn-fixed-masses';
 healthy(r,control);const v=r.track.at(-1).extra.variables;assert.equal(Number(v.completed),1,'program completed');assert.equal(Number(v.failed),0,'program did not fail');
 const o=observeAddon(r,AFTERTURN.base),found=foundation(r,o),m=r.mechanism,moving=!control;
 // The moving-mass model must carry both rods and carts; the control must have none (its carts are part of the platform).
 if(!control)check(AFTERTURN.sides.every(([rod,cart])=>[rod,cart].every(p=>m.bodies.some(b=>b.parts.includes(p)&&b.parts.length<=(p===rod?1:30)))),'both rods and carts are separate moving bodies',{});
 if(control)check(!m.joints.some(j=>j.type==='slider'),'control carts are fixed to the platform',{control});else check(m.joints.filter(j=>j.type==='slider').length===2,'two radial carts on sliders',{});
 const rows=observe(r),s=strokes(rows),p0=afterturnPrediction(m,0),pS=afterturnPrediction(m,AFTERTURN.strokeDeg);
 const pred=B=>Math.abs(B)<5?p0:(check(Math.abs(Math.abs(B)-AFTERTURN.strokeDeg)<2,'stroke taken at a supplied shape',{B}),pS);
 const diag={Iw:p0.Iw,J0:p0.J,J70:pS.J,ratio0:p0.ratio,ratio70:pS.ratio,strokes:s};
 check(s.length===4&&s.every(x=>Math.abs(Math.abs(x.dA)-AFTERTURN.wheelDeg)<5&&x.Bspread<.5),'four completed 900° wheel strokes at a held shape',diag);
 for(const x of s){const p=pred(x.B);check(Math.abs(x.ratio-p.ratio)<=RATIO_TOLERANCE*p.ratio,'platform/wheel ratio is Iw/J at the held shape within 1%',{...x,predicted:p.ratio});}
 // Cycle = strokes 1+2, inverse = strokes 3+4 (with the shape strokes between them cancelling).
 // Whole-cycle heading change, shape strokes included (they cancel in the ideal law): from rest before the
 // first shape stroke to rest after the second wheel stroke (both shape strokes inside); the inverse from
 // there to the end of the run, after its own two shape strokes.
 const shapeStart=rows.findIndex(x=>Math.abs(x.B)>.05),start=Math.max(0,shapeStart-1);check(shapeStart>0&&shapeStart<s[0].from,'the cycle opens with a shape stroke',{shapeStart});
 const net=(x,y,from,to)=>{const pa=pred(x.B),pb=pred(y.B),predicted=-(pa.ratio*x.dA+pb.ratio*y.dA),bound=RATIO_TOLERANCE*(pa.ratio*Math.abs(x.dA)+pb.ratio*Math.abs(y.dA)),measured=rows[to].psi-rows[from].psi;return{measured,predicted,bound,error:measured-predicted,wheelStrokesOnly:x.dPsi+y.dPsi};};
 const end=rows.length-1;check(Math.abs(rows[end].B)<.5&&Math.abs(rows[end].A)<1,'both internal motions are home at the end',rows[end]);
 const cycle=net(s[0],s[1],start,s[1].to),inverse=net(s[2],s[3],s[1].to,end),result={...diag,cycle,inverse,foundation:found,moving};
 check(Math.abs(cycle.error)<=cycle.bound,'net cycle rotation matches −(ratio·ΔA) summed over its strokes',result);
 check(Math.abs(inverse.error)<=inverse.bound,'inverse cycle undoes the first',result);
 if(moving){
  check(s[0].B>AFTERTURN.strokeDeg/2&&Math.abs(s[1].B)<5&&Math.abs(s[2].B)<5&&s[3].B>AFTERTURN.strokeDeg/2,'cycle order: wheel out at B=70, back at B=0; inverse reversed',diag);
  check(Math.abs(cycle.predicted)>2*cycle.bound,'the shape-dependent inertia is resolved above the bound',cycle);
 }else check(Math.abs(cycle.predicted)<cycle.bound/10&&Math.abs(cycle.measured)<=cycle.bound,'control: constant inertia leaves no net cycle',cycle);
 return result;
}
export const judgeAfterturnControl=r=>judgeAfterturn(r,{contract:{id:'afterturn-fixed-masses'}});
/**
 * Disconnection (rods removed): the carts no longer follow the crank, so the platform no longer has the
 * reviewed model's inertia J(B). The law is lost when any completed wheel stroke leaves the reviewed
 * model's own predicted ratio Iw/J(B) by more than the judge's 1 % bound, or fewer than four strokes complete.
 */
export function afterturnDisconnectionLoss(r){
 const intact=prepareModel(readFileSync(new URL('../../overlay/scratch-gui/static/sim-lab/models/afterturn.ldr',import.meta.url),'utf8'),catalogFrom(JSON.parse(readFileSync(new URL('../../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url),'utf8')))).mechanism;
 const p0=afterturnPrediction(intact,0),pS=afterturnPrediction(intact,AFTERTURN.strokeDeg),s=strokes(observe(r));
 const errors=s.map(x=>{const p=Math.abs(x.B)<5?p0:pS;return Math.abs(x.ratio-p.ratio)/p.ratio;}),value=errors.length?Math.max(...errors):Infinity;
 return{metric:'maxStrokeRatioErrorFraction',value,lost:s.length<4||!(value<=RATIO_TOLERANCE),detail:{strokes:s,ratio0:p0.ratio,ratio70:pS.ratio}};
}
