// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reviewer-owned judges for models the shared harness qualifies without a SPIKE hub
// (Phasor Twin, driven by the Robot Lab's own lab-direct controller) or without a motor
// (Pivot Exchange, three passive compound pendulums released from a saved deflection).
// Predictions judge observed, passive bodies; they never drive their poses. Every law is
// derived from the documented mechanism and the compiled joints/colliders, never fitted to the
// recorded motion. Failing assertions carry their measured values.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>scale(v,1/norm(v));
const deg=x=>x*180/Math.PI,max=(s,k)=>Math.max(...s.map(k)),span=a=>Math.max(...a)-Math.min(...a);
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
/** Twist (rad) of a body's rotation since its initial pose about the world axis a. */
const twist=(q,q0,a)=>{const d=mul(q,conj(q0));return 2*Math.atan2(dot(d.slice(0,3),a),d[3]);};

const NO_MOTOR=[{severity:'warning',code:'no-motor'}];
function healthy(r,native,{gears=false,motorless=false}={}){
 // A motorless model compiles with exactly the compiler's 'no motor' warning; anything else refuses.
 assert.deepEqual(r.issues.map(({severity,code})=>({severity,code})),motorless?NO_MOTOR:[]);if(motorless)assert.deepEqual(r.issues[0].parts,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?500:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
 if(gears)assert.ok(r.mechanism.couplings.every(c=>c.kind==='gear'&&c.parts.every(p=>/gear/.test(p))),'only physical gear meshes');
 else assert.deepEqual(r.mechanism.couplings,[],'no imposed output coupling');
}
function foundation(r,o){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id];
 const frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=max(frames,f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000),tiltDeg=max(frames,f=>o.tilt(f));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});
 const gapMm=max(r.track,f=>o.gap(f)),axisDeg=max(r.track,f=>o.axisGap(f));
 check(gapMm<=.5&&axisDeg<=1,'true hinge closure and aligned axes',{gapMm,axisDeg});return{horizontalMm,tiltDeg,gapMm,axisDeg};
}
const vars=f=>f.extra.variables,num=(f,k)=>Number(vars(f)[k]);

// Compiled mass properties, exactly as the engine builds them (jolt-core.js): every collider gets the
// density massKg/volume, then the body mass is overridden to body.massKg with the inertia scaled by the
// same factor. Boxes, local-y cylinders and spheres.
const outer=d=>[0,1,2].map(i=>[0,1,2].map(j=>d[i]*d[j]));
const rotM=q=>[[1,0,0],[0,1,0],[0,0,1]].map(e=>rot(q,e));
const rotateTensor=(q,I)=>{const c=rotM(q),R=[0,1,2].map(i=>[0,1,2].map(j=>c[j][i]));return R.map(row=>[0,1,2].map(j=>[0,1,2].reduce((s,k)=>s+row[k]*[0,1,2].reduce((t,l)=>t+I[k][l]*R[j][l],0),0)));};
export function massProperties(b){
 const cols=b.colliders,mSum=cols.reduce((s,c)=>s+c.massKg,0);assert.ok(cols.every(c=>c.massKg>0)&&mSum>0,'per-part collider masses');
 const com=scale(cols.reduce((s,c)=>add(s,scale(c.position||[0,0,0],c.massKg)),[0,0,0]),1/mSum);
 let I=[[0,0,0],[0,0,0],[0,0,0]];
 for(const c of cols){const m=c.massKg;let d;
  if(c.shape==='box'){const [x,y,z]=c.halfExtents;d=[m*(y*y+z*z)/3,m*(x*x+z*z)/3,m*(x*x+y*y)/3];}
  else if(c.shape==='cylinder'){const r=c.radius,h=2*c.halfHeight,s=m*(3*r*r+h*h)/12;d=[s,m*r*r/2,s];}
  else if(c.shape==='sphere')d=Array(3).fill(.4*m*c.radius*c.radius);else assert.fail('collider shape '+c.shape);
  const Ic=rotateTensor(c.rotation||[0,0,0,1],[[d[0],0,0],[0,d[1],0],[0,0,d[2]]]),off=sub(c.position||[0,0,0],com),oo=outer(off),r2=dot(off,off);
  I=I.map((row,i)=>row.map((v,j)=>v+Ic[i][j]+m*((i===j?r2:0)-oo[i][j])));}
 const k=b.massKg/mSum;return{mass:b.massKg,com,inertia:I.map(row=>row.map(v=>v*k))};
}
function inertiaAboutLine(b,pose,P,a){
 const mp=massProperties(b),q=pose.rotation,c=add(pose.position,rot(q,mp.com)),Iw=rotateTensor(q,mp.inertia);
 const r=sub(c,P),rp=sub(r,scale(a,dot(r,a)));
 return dot(a,[0,1,2].map(i=>dot(Iw[i],a)))+mp.mass*dot(rp,rp);
}

// ---------------------------------------------------------------------------------------------
// Phasor Twin: one gear train turns two equal cranks 1:1 with their pins clocked 90° apart. Each piston
// follows the slider-crank closure x = r·cos φ + √(L² − (r·sin φ − e)²) along its line (r, L, e from the
// compiled joint points), and the two piston positions trace a loop of area π·r² per crank turn.
export const PHASOR_BASE='base_cross_60';
function phasorCrank(r,o,side){
 const J=r.mechanism.joints,crank=o.body('crankplate_'+side),rod=o.body('conrod_'+side),piston=o.body('pistonrod_'+side);
 const main=J.find(j=>j.type==='hinge'&&!j.motor&&[j.body1,j.body2].includes(crank.id)&&[j.body1,j.body2].includes(o.base.id)),pin=J.find(j=>j.type==='hinge'&&[j.body1,j.body2].includes(crank.id)&&[j.body1,j.body2].includes(rod.id));
 const wrist=J.find(j=>j.type==='hinge'&&[j.body1,j.body2].includes(piston.id)&&[j.body1,j.body2].includes(rod.id)),slide=J.find(j=>j.type==='slider'&&[j.body1,j.body2].includes(piston.id));
 assert.ok(main&&pin&&wrist&&slide,'crank '+side+': main bearing, crank pin, wrist pin and slider');
 const a=unit(main.axis),u=unit(sub(slide.axis,scale(a,dot(slide.axis,a)))),w=[a[1]*u[2]-a[2]*u[1],a[2]*u[0]-a[0]*u[2],a[0]*u[1]-a[1]*u[0]];
 const C=main.point,pin0=sub(pin.point,C),W0=sub(wrist.point,C),rad=norm(sub(pin0,scale(a,dot(pin0,a)))),L=Math.hypot(dot(sub(W0,pin0),u),dot(sub(W0,pin0),w)),e=dot(W0,w);
 const carry=(f,b,P)=>{const s=r.mechanism.bodies.find(x=>x.id===b.id);return add(f.bodies[b.id].position,rot(f.bodies[b.id].rotation,rot(conj(s.rotation),sub(P,s.position))));};
 const toBase=(f,p)=>{const s=o.base;return add(s.position,rot(s.rotation,rot(conj(f.bodies[s.id].rotation),sub(p,f.bodies[s.id].position))));};
 const phi=unwrap(r.track.map(f=>{const v=sub(toBase(f,carry(f,crank,pin.point)),C);return Math.atan2(dot(v,w),dot(v,u));}));
 const x=r.track.map(f=>dot(sub(toBase(f,carry(f,piston,wrist.point)),C),u));
 const pred=phi.map(p=>rad*Math.cos(p)+Math.sqrt(L*L-(rad*Math.sin(p)-e)**2));
 return{phi,x,pred,rad,L,e};
}
// A disconnected rod leaves no wrist joint; then only the free piston's own travel is observable.
function phasorCrankLoose(r,o){
 const piston=o.body('pistonrod_B'),slide=r.mechanism.joints.find(j=>j.type==='slider'&&[j.body1,j.body2].includes(piston.id));
 if(r.mechanism.joints.some(j=>j.type==='hinge'&&[j.body1,j.body2].includes(piston.id))){const B=phasorCrank(r,o,'B');return{strokeMm:span(B.x)*1000,lawErrMm:max(B.x.map((x,i)=>i),i=>Math.abs(B.x[i]-B.pred[i]))*1000};}
 const u=unit(slide?slide.axis:[1,0,0]),x=r.track.map(f=>dot(o.point(f,'pistonrod_B'),u));return{strokeMm:span(x)*1000,lawErrMm:Infinity};
}
export function phasorLoss(r){
 const o=observeAddon(r,PHASOR_BASE),B=phasorCrankLoose(r,o);
 // Connected: 32 mm stroke within 0.5 mm of the closure. The loss is the original stroke or law bound failing.
 return{...B,lost:B.strokeMm<30||B.lawErrMm>2};
}
export function judgePhasorTwin(r,{native=false}={}){
 healthy(r,native,{gears:true});assert.equal(r.mechanism.actuators.length,1);
 assert.equal(r.mechanism.joints.filter(j=>j.type==='slider').length,2);
 const o=observeAddon(r,PHASOR_BASE),A=phasorCrank(r,o,'A'),B=phasorCrank(r,o,'B');
 assert.equal(new Set(['crankplate_A','crankplate_B','pistonrod_A','pistonrod_B','conrod_A','conrod_B'].map(id=>o.body(id).id)).size,6,'two independent passive crank chains');
 const v=vars(r.track.at(-1));assert.equal(Number(v.completed),1);assert.equal(Number(v.failed),0);
 const geom={rA:A.rad*1000,rB:B.rad*1000,LA:A.L*1000,LB:B.L*1000};
 check(Math.abs(A.rad-B.rad)<1e-4&&Math.abs(A.L-B.L)<1e-4,'equal cranks and rods',geom);
 const lawA=max(A.x.map((x,i)=>i),i=>Math.abs(A.x[i]-A.pred[i]))*1000,lawB=max(B.x.map((x,i)=>i),i=>Math.abs(B.x[i]-B.pred[i]))*1000;
 const strokeA=span(A.x)*1000,strokeB=span(B.x)*1000,diag={...geom,lawA,lawB,strokeA,strokeB};
 check(lawA<=.5&&lawB<=.5,'each piston follows its slider-crank closure within 0.5 mm',diag);
 check(Math.abs(strokeA-2*A.rad*1000)<=.5&&Math.abs(strokeB-2*B.rad*1000)<=.5,'full strokes of twice the crank radius',diag);
 const phase=A.phi.map((p,i)=>deg(B.phi[i]-p)),phaseSpan=span(phase),phaseMean=phase.reduce((s,x)=>s+x,0)/phase.length;
 check(phaseSpan<=2&&Math.abs(Math.abs(((phaseMean%360)+540)%360-180)-90)<=1.5,'the gear train holds the cranks 90° apart',{phaseSpan,phaseMean});
 const fwd=r.track.map((f,i)=>[f,i]).filter(([f])=>num(f,'targetA')===720).map(([,i])=>i);assert.ok(fwd.length>100,'forward sweep recorded');
 const turns=Math.abs(A.phi[fwd.at(-1)]-A.phi[fwd[0]])/(2*Math.PI);let area=0;
 for(let k=1;k<fwd.length;k++){const i=fwd[k-1],j=fwd[k];area+=(A.x[i]*B.x[j]-A.x[j]*B.x[i])/2;}
 const i=fwd.at(-1),j=fwd[0];area+=(A.x[i]*B.x[j]-A.x[j]*B.x[i])/2;
 const areaPerTurn=Math.abs(area)/turns*1e6,ideal=Math.PI*(A.rad*1000)**2,loop={turns,areaPerTurn,ideal};
 check(turns>=1.9,'the passive cranks make two turns forward',loop);
 check(Math.abs(areaPerTurn-ideal)<=.01*ideal,'piston loop encloses π·r² per crank turn within 1%',loop);
 const back=Math.abs(deg(A.phi.at(-1)-A.phi[0]));check(back<=2,'cranks return to the saved pose',{back});
 return{...diag,phaseSpanDeg:phaseSpan,phaseMeanDeg:phaseMean,...loop,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Pivot Exchange: three identical arms hang on frame-owned axles through different holes, released
// from the saved 8° deflection with no motor. Each is a compound pendulum, T0 = 2π·√(I_P/(M·g·d)) with
// I_P its compiled inertia about the observed hinge line and d the COM distance from that line; the
// finite release lengthens it by the series factor 1 + θ0²/16. The near and far holes are nearly
// conjugate (equal predicted periods); the central-hole control is predicted (and must swing) slower.
export const PIVOT_ARMS=['near','far','control'],PIVOT_BASE='hub';
function pivotArm(r,o,arm){
 const b=o.body('arm_'+arm+'_beam'),j=r.mechanism.joints.find(j=>j.type==='hinge'&&!j.motor&&[j.body1,j.body2].includes(b.id));
 if(!j)return{arm,hinged:false};
 const a=unit(j.axis),mp=massProperties(b),c=add(b.position,rot(b.rotation,mp.com)),rr=sub(c,j.point),d=norm(sub(rr,scale(a,dot(rr,a))));
 const g=norm(r.mechanism.gravity||[0,-9.81,0]),I=inertiaAboutLine(b,b,j.point,a),T0=2*Math.PI*Math.sqrt(I/(mp.mass*g*d));
 const q0=b.rotation,b0=r.mechanism.bodies.find(x=>x.id===o.base.id).rotation;
 const th=unwrap(r.track.map(f=>twist(f.bodies[b.id].rotation,q0,a)-twist(f.bodies[o.base.id].rotation,b0,a)));
 // The equilibrium is where gravity puts the COM straight below the hinge: from the compiled pose.
 const down=unit(sub(scale(unit(r.mechanism.gravity||[0,-9.81,0]),1),scale(a,dot(unit(r.mechanism.gravity||[0,-9.81,0]),a)))),rp=unit(sub(rr,scale(a,dot(rr,a))));
 const release=Math.atan2(dot(a,[rp[1]*down[2]-rp[2]*down[1],rp[2]*down[0]-rp[0]*down[2],rp[0]*down[1]-rp[1]*down[0]]),dot(rp,down));
 const obs=r.track.map((f,i)=>[f,i]).filter(([f])=>num(f,'observing')===1);
 const y=obs.map(([,i])=>th[i]-release),ups=[];// angle from the equilibrium; release at th=0 is -release
 for(let k=1;k<obs.length;k++){const ya=y[k-1],yb=y[k];if(ya<0&&yb>=0){const [fa]=obs[k-1],[fb]=obs[k];ups.push(fa.t+(fb.t-fa.t)*(-ya)/(yb-ya));}}
 const amplitudeDeg=deg(span(y))/2,periods=ups.slice(1).map((t,i)=>(t-ups[i])/1000);
 const measuredS=ups.length>1?(ups.at(-1)-ups[0])/(ups.length-1)/1000:NaN,theta=Math.abs(release);
 // Retained on its pivot: the beam's distance from the hinge line stays what it was (it swings on an arc).
 const P0=o.initial('arm_'+arm+'_beam'),R0=norm(sub(sub(P0,j.point),scale(a,dot(sub(P0,j.point),a)))),dropMm=max(r.track,f=>{const v=sub(o.point(f,'arm_'+arm+'_beam'),j.point);return Math.abs(norm(sub(v,scale(a,dot(v,a))))-R0)*1000;});
 return{arm,hinged:true,predictedS:T0*(1+theta*theta/16),smallAngleS:T0,releaseDeg:deg(theta),dMm:d*1000,measuredS,crossings:ups.length,spreadS:periods.length?span(periods):NaN,amplitudeDeg,dropMm};
}
export function pivotLoss(r,arm='near'){
 const o=observeAddon(r,PIVOT_BASE),s=pivotArm(r,o,arm);
 // Without its axle the arm has no hinge at all, or it no longer keeps the compound-pendulum period.
 if(!s.hinged)return{...s,lost:true};
 const err=Math.abs(s.measuredS-s.predictedS)/s.predictedS;return{...s,lawErr:err,lost:s.dropMm>1||s.crossings<10||!(err<=.05)};
}
export function judgePivotExchange(r,{native=false}={}){
 healthy(r,native,{motorless:true});assert.equal(r.mechanism.actuators.length,0,'no motor: gravity provides the motion');
 assert.ok(r.mechanism.joints.every(j=>!j.motor));
 const o=observeAddon(r,PIVOT_BASE),v=vars(r.track.at(-1));assert.equal(Number(v.complete),1);assert.equal(Number(v.fault),0);
 assert.equal(new Set(PIVOT_ARMS.map(a=>o.body('arm_'+a+'_beam').id).concat(o.base.id)).size,4,'three independent arms on the frame');
 const s=Object.fromEntries(PIVOT_ARMS.map(a=>[a,pivotArm(r,o,a)]));
 for(const a of PIVOT_ARMS){const x=s[a];check(x.hinged,'arm '+a+' hangs on a hinge',x);
  check(x.amplitudeDeg>=4,'arm '+a+' swings from its saved release',x);
  check(x.crossings>=(a==='control'?12:25),'arm '+a+' completes the observed cycles',x);
  check(Math.abs(x.measuredS-x.predictedS)<=.005*x.predictedS,'arm '+a+' period matches the compiled compound-pendulum prediction within 0.5%',x);
  check(x.spreadS<=.02*x.predictedS,'arm '+a+' keeps that period every cycle',x);
  check(x.dropMm<=1,'arm '+a+' stays on its pivot (radius from the hinge line within 1 mm)',x);}
 const pairPred=Math.abs(s.near.predictedS-s.far.predictedS)/s.near.predictedS,pairMeas=Math.abs(s.near.measuredS-s.far.measuredS)/s.near.measuredS;
 check(pairPred<=.005&&pairMeas<=.005,'the near and far holes are conjugate: equal periods within 0.5%',{pairPred,pairMeas});
 const ratioPred=s.control.predictedS/s.near.predictedS,ratioMeas=s.control.measuredS/s.near.measuredS;
 check(ratioPred>1.5&&Math.abs(ratioMeas-ratioPred)<=.01*ratioPred,'the central-hole control swings slower by the predicted ratio',{ratioPred,ratioMeas});
 return{arms:s,pairPred,pairMeas,ratioPred,ratioMeas,foundation:foundation(r,o)};
}

/** Measured law loss after a contract's physical disconnection (test/bw-sim-qualification.test.mjs). */
export const HUBLESS_DISCONNECTION_LOSSES=Object.freeze({
 'phasor-twin':r=>{const l=phasorLoss(r);return{metric:'pistonBStrokeMm',value:l.strokeMm,lost:l.lost,detail:l};},
 'pivot-exchange':r=>{const l=pivotLoss(r,'near');return{metric:'nearArmPeriodLoss',value:l.hinged?l.lawErr:'no-hinge',lost:l.lost,detail:l};}
});
