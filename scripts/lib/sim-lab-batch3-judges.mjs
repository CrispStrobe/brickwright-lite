// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions judge observed, passive bodies; they never drive their poses.
// Samebeat (compound pendulum), promoted from the experimental entries after independent
// review (2026-10-27).
// Each law is derived from the model's documented mechanism and the compiled mass/geometry,
// never fitted to the recorded motion. Failing assertions carry their measured values.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>scale(v,1/norm(v));
const deg=x=>x*180/Math.PI,max=(s,k)=>Math.max(...s.map(k)),span=a=>Math.max(...a)-Math.min(...a);
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
/** Twist (rad) of a body's rotation since its initial pose about the world axis a. */
const twist=(q,q0,a)=>{const d=mul(q,conj(q0));const s=dot(d.slice(0,3),a),w=d[3];return 2*Math.atan2(s,w);};

function healthy(r,native,{gears=false}={}){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
 // Gear meshes are the physical tooth contact model; any other compiled coupling would impose an output.
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
// density massKg/volume (so COM and inertia follow the part masses), then the body mass is overridden to
// body.massKg with the inertia scaled by the same factor. Boxes, local-y cylinders and spheres.
const outer=(d)=>[[d[0]*d[0],d[0]*d[1],d[0]*d[2]],[d[1]*d[0],d[1]*d[1],d[1]*d[2]],[d[2]*d[0],d[2]*d[1],d[2]*d[2]]];
const rotM=q=>[[1,0,0],[0,1,0],[0,0,1]].map(e=>rot(q,e));// columns
const rotateTensor=(q,I)=>{const c=rotM(q),R=[0,1,2].map(i=>[0,1,2].map(j=>c[j][i]));return R.map((row,i)=>[0,1,2].map(j=>[0,1,2].reduce((s,k)=>s+row[k]*[0,1,2].reduce((t,l)=>t+I[k][l]*R[j][l],0),0)));};
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
/** Moment of inertia (kg m²) of a body in pose {position, rotation} about the world line (P, a). */
export function inertiaAboutLine(b,pose,P,a){
 const mp=massProperties(b),q=pose.rotation,c=add(pose.position,rot(q,mp.com)),Iw=rotateTensor(q,mp.inertia);
 const r=sub(c,P),rp=sub(r,scale(a,dot(r,a)));
 return dot(a,[0,1,2].map(i=>dot(Iw[i],a)))+mp.mass*dot(rp,rp);
}

// ---------------------------------------------------------------------------------------------
// Samebeat: one rigid compound pendulum hung from a motor-held support. After a short support pulse it
// swings freely, so its period is T = 2π·√(I_P / (M·g·d)), with I_P its compiled inertia about the
// observed hinge line and d the COM distance from that line (both from compiled colliders).
const SAMEBEAT_BASE='base_floor_rail_-60',SAMEBEAT_OUTPUT='pendulum_ballast';
export function samebeatPredictedPeriodS(r){
 const pend=observeAddon(r,SAMEBEAT_BASE).body(SAMEBEAT_OUTPUT),j=r.mechanism.joints.find(j=>j.type==='hinge'&&!j.motor&&[j.body1,j.body2].includes(pend.id));assert.ok(j,'pendulum hinge');
 const a=unit(j.axis),mp=massProperties(pend),c=add(pend.position,rot(pend.rotation,mp.com)),rr=sub(c,j.point),d=norm(sub(rr,scale(a,dot(rr,a))));
 const g=norm(r.mechanism.gravity||[0,-9.81,0]),I=inertiaAboutLine(pend,pend,j.point,a);
 return{periodS:2*Math.PI*Math.sqrt(I/(mp.mass*g*d)),dMm:d*1000,j,pend,a};
}
function samebeatSwing(r){
 const o=observeAddon(r,SAMEBEAT_BASE),{periodS,dMm,pend,a}=samebeatPredictedPeriodS(r),q0=pend.rotation,b0=r.mechanism.bodies.find(b=>b.id===o.base.id).rotation;
 const th=unwrap(r.track.map(f=>twist(f.bodies[pend.id].rotation,q0,a)-twist(f.bodies[o.base.id].rotation,b0,a)));
 const free=r.track.map((f,i)=>[f,i]).filter(([f])=>num(f,'held')===1&&num(f,'targetA')===0);
 assert.ok(free.length>10,'free swing recorded');const t0=free[0][0].t+300,win=free.filter(([f])=>f.t>=t0);
 const mean=win.reduce((s,[,i])=>s+th[i],0)/win.length,ups=[];
 for(let k=1;k<win.length;k++){const [fa,ia]=win[k-1],[fb,ib]=win[k],ya=th[ia]-mean,yb=th[ib]-mean;if(ya<0&&yb>=0)ups.push((fa.t+(fb.t-fa.t)*(-ya)/(yb-ya))/1000);}// track time is in ms
 const periods=ups.slice(1).map((t,i)=>t-ups[i]),measured=ups.length>1?(ups.at(-1)-ups[0])/(ups.length-1):NaN;
 const amplitudeDeg=deg(span(win.map(([,i])=>th[i])))/2;
 return{o,predictedS:periodS,dMm,measuredS:measured,crossings:ups.length,periodSpreadS:periods.length?span(periods):NaN,amplitudeDeg,th};
}
export function samebeatLoss(r){
 const o=observeAddon(r,SAMEBEAT_BASE),P0=o.initial(SAMEBEAT_OUTPUT),dropMm=max(r.track,f=>norm(sub(o.point(f,SAMEBEAT_OUTPUT),P0))*1000);
 // Without its suspension the pendulum has no hinge at all: no period can be observed about it.
 const hinged=r.mechanism.joints.some(j=>j.type==='hinge'&&!j.motor&&[j.body1,j.body2].includes(o.body(SAMEBEAT_OUTPUT).id));
 if(!hinged)return{dropMm,hinged,lost:true};
 const s=samebeatSwing(r),lawErr=Math.abs(s.measuredS-s.predictedS)/s.predictedS;
 return{dropMm,hinged,crossings:s.crossings,lawErr,lost:dropMm>10||s.crossings<20||!(lawErr<=.05)};
}
export function judgeSamebeat(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,3,'frame, motor-held support and one passive pendulum');
 const v=vars(r.track.at(-1));assert.equal(Number(v.completed),1);assert.equal(Number(v.failed),0);
 const s=samebeatSwing(r),{o}=s,err=Math.abs(s.measuredS-s.predictedS)/s.predictedS,diag={predictedS:s.predictedS,measuredS:s.measuredS,dMm:s.dMm,crossings:s.crossings,spreadS:s.periodSpreadS,amplitudeDeg:s.amplitudeDeg};
 check(s.amplitudeDeg>=.3,'the passive pendulum swings after the support pulse',diag);
 check(s.crossings>=30,'about 22 s of free swing at half-second periods',diag);
 check(err<=.005,'free period matches the compiled compound-pendulum prediction within 0.5%',diag);
 check(s.periodSpreadS<=.02*s.predictedS,'every observed cycle keeps that period',diag);
 const P0=o.initial(SAMEBEAT_OUTPUT),dropMm=max(r.track,f=>norm(sub(o.point(f,SAMEBEAT_OUTPUT),P0))*1000);
 check(dropMm<=10,'pendulum stays hung on its pivot',{dropMm});
 return{...diag,periodErrorFraction:err,ballastExcursionMm:dropMm,foundation:foundation(r,o)};
}

/** Measured law loss after a contract's physical disconnection (test/bw-sim-qualification.test.mjs). */
export function batch3DisconnectionLoss(id,r){
 if(id==='samebeat'){const l=samebeatLoss(r);return{metric:'ballastDropMm',value:l.dropMm,lost:l.lost,detail:l};}
 assert.fail('no batch-3 disconnection measure for '+id);
}
