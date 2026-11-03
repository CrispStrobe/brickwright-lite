// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions judge observed, passive bodies; they never drive their poses.
// Batch B (2026-10-27, landed 2026-11-02): Poise, Equal Share, Stroke Shift and Triad Table promoted after review.
// Each law is derived from the model's documented mechanism and the compiled joints, springs and masses,
// never fitted to the recorded motion. Failing assertions carry their measured values.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>scale(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const deg=x=>x*180/Math.PI,max=(s,k)=>Math.max(...s.map(k)),min=(s,k)=>Math.min(...s.map(k)),span=a=>Math.max(...a)-Math.min(...a);
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
const inPlane=(v,a)=>sub(v,scale(a,dot(v,a)));
const vars=f=>f.extra.variables,num=(f,k)=>Number(vars(f)[k]);
const ids=b=>[b.body1,b.body2];

function healthy(r,native,{couplings=[]}={}){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
 // Only the declared physical couplings (gear teeth, a real spindle); nothing may impose the passive output.
 check(r.mechanism.couplings.every(c=>couplings.includes(c.kind)),'only declared physical couplings',{kinds:r.mechanism.couplings.map(c=>c.kind),couplings});
}
function foundation(r,o){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id];
 const frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=max(frames,f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000),tiltDeg=max(frames,f=>o.tilt(f));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});
 const gapMm=max(r.track,f=>o.gap(f)),axisDeg=max(r.track,f=>o.axisGap(f));
 check(gapMm<=.5&&axisDeg<=1,'true hinge closure and aligned axes',{gapMm,axisDeg});return{horizontalMm,tiltDeg,gapMm,axisDeg};
}
const done=(r,stage)=>{const v=vars(r.track.at(-1));check(Number(v.completed)===1&&Number(v.failed)===0&&String(v.stage)===String(stage),'program completes without fault',{completed:v.completed,failed:v.failed,stage:v.stage});};
/** Last frame of each settled dwell, by stage. */
const holds=(r,stages,flag='dwelling')=>stages.map(s=>{const h=r.track.filter(f=>f.phase!=='cold'&&String(vars(f).stage)===String(s)&&num(f,flag)===1);assert.ok(h.length>0,'settled hold '+s);return h.at(-1);});

// ---------------------------------------------------------------------------------------------
// Poise: Roberval balance. Upper and lower bars and the two pan uprights form two parallelograms, so the pans
// stay upright and the beam's equilibrium does not depend on where a load sits on a pan. Motors A and B swing
// equal weights across their pans. For comparison, the same load moment on a rigid beam carrying this ballast
// would tilt it by asin(m_w·Δz / (M_beam·d)), with m_w, M_beam and d (ballast COM below the beam pivot) taken
// from the compiled bodies.
const PO_BASE='hub',PO_BEAM='upper_bar',PO_LOW='lower_bar',PO_W=['left_weight','right_weight'],PO_PANS=['left_pan_frame','right_pan_frame'];
const beamAngle=(o,f,id,a)=>deg(o.angle(f,id,a,unit(inPlane([0,0,1],a))));
function poiseGeometry(r){
 const m=r.mechanism,o=observeAddon(r,PO_BASE),beam=o.body(PO_BEAM);
 const pivot=m.joints.find(j=>j.type==='hinge'&&!j.motor&&ids(j).includes(beam.id)&&ids(j).includes(o.base.id));assert.ok(pivot,'beam pivot on the stand');
 const a=unit(pivot.axis),low=o.body(PO_LOW);
 assert.ok(m.joints.some(j=>j.type==='hinge'&&ids(j).includes(low.id)&&ids(j).includes(o.base.id)),'lower bar pivots on the stand');
 for(const p of PO_PANS){const pan=o.body(p);assert.ok([beam,low].every(b=>m.joints.some(j=>j.type==='hinge'&&ids(j).includes(b.id)&&ids(j).includes(pan.id))),'pan '+p+' hangs from both bars');}
 const w=PO_W.map(id=>o.body(id));check(Math.abs(w[0].massKg-w[1].massKg)<1e-9,'equal moving weights',{masses:w.map(b=>b.massKg)});
 const d=dot(sub(pivot.point,beam.position),[0,1,0]);check(d>0,'ballast hangs below the beam pivot',{dMm:d*1000});
 return{o,a,beam,low,w,d,mw:w[0].massKg};
}
export function judgePoise(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,2);
 const g=poiseGeometry(r),{o,a}=g;done(r,6);
 const prog=r.track.filter(f=>f.phase!=='cold'),hs=holds(r,[1,2,3,4,5]);
 const w0=PO_W.map(id=>o.initial(id)),shift=(f,i)=>dot(sub(o.point(f,PO_W[i]),w0[i]),[0,0,1])*1000;
 const rows=hs.map(f=>{const dz=[shift(f,0),shift(f,1)],net=(dz[0]+dz[1])/1000;// both shifts measured along the beam axis
  return{tilt:beamAngle(o,f,PO_BEAM,a),lower:beamAngle(o,f,PO_LOW,a),pans:PO_PANS.map(p=>deg(o.angle(f,p,a,[0,1,0]))),dz,rigidTiltDeg:deg(Math.asin(Math.min(1,Math.abs(g.mw*net)/(g.beam.massKg*g.d))))};});
 const moved=max(rows,x=>Math.abs(x.dz[0]+x.dz[1]));check(moved>=40,'the weights really shift the net load moment',{moved});
 const each=[0,1].map(i=>max(rows,x=>Math.abs(x.dz[i])));check(each.every(x=>x>=40),'each motor-driven weight crosses its pan',{each});
 const rigid=max(rows,x=>x.rigidTiltDeg);check(rigid>=10,'a rigid beam would visibly tilt for these load moments',{rigid});
 const tilt=max(rows,x=>Math.abs(x.tilt));check(tilt<=.1,'beam stays level at every settled hold whatever the load position',{tilt,rows});
 const bars=max(prog,f=>Math.abs(beamAngle(o,f,PO_BEAM,a)-beamAngle(o,f,PO_LOW,a)));check(bars<=.05,'upper and lower bars stay parallel',{bars});
 const pans=max(prog,f=>Math.max(...PO_PANS.map(p=>Math.abs(deg(o.angle(f,p,a,[0,1,0]))))));check(pans<=.2,'pans stay upright',{pans});
 const last=rows.at(-1);check(Math.abs(last.dz[0])<=.5&&Math.abs(last.dz[1])<=.5,'weights return to the saved datum',{dz:last.dz});
 return{maxNetShiftMm:moved,rigidBeamTiltDeg:rigid,heldTiltDeg:tilt,maxBarSkewDeg:bars,maxPanTiltDeg:pans,suppression:rigid/Math.max(tilt,1e-9),foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Equal Share: a whippletree. The crank moves the equalizer's centre pivot; the left tip compresses one stock
// shock, the right tip two in parallel. Moment balance about the centre pivot, kL·δL·aL = kR·δR·aR, with the arms
// and spring stiffnesses read from the compiled joints, predicts δL/δR. Compressions are observed from bodies.
const ES_BASE='hub',ES_BEAM='equalizer';
function shareGeometry(r){
 const m=r.mechanism,o=observeAddon(r,ES_BASE),eq=o.body(ES_BEAM),crank=m.joints.find(j=>j.motor?.port==='A');
 const centre=m.joints.find(j=>j.type==='hinge'&&ids(j).includes(eq.id)&&ids(j).includes(crank.body2===o.base.id?crank.body1:crank.body2));assert.ok(centre,'equalizer centre pivot on the crank');
 const tips=m.joints.filter(j=>j.type==='hinge'&&j!==centre&&ids(j).includes(eq.id));
 const shocks=tips.map(t=>{const rod=ids(t).find(id=>id!==eq.id),s=m.joints.find(j=>j.type==='slider'&&j.spring&&ids(j).includes(rod));assert.ok(s,'tip drives a sprung shock');return{tip:t,rod,s,cyl:ids(s).find(id=>id!==rod),arm:dot(sub(t.point,centre.point),[0,0,1])};});
 const left=shocks.filter(x=>x.arm<0),right=shocks.filter(x=>x.arm>0);
 check(left.length===1&&right.length===2,'one shock on the left tip, two in parallel on the right',{left:left.length,right:right.length});
 const kL=left[0].s.spring.stiffness,kR=right.reduce((s,x)=>s+x.s.spring.stiffness,0),aL=-left[0].arm,aR=right[0].arm;
 check(right.every(x=>Math.abs(x.arm-aR)<1e-6),'parallel right shocks share one tip',{arms:right.map(x=>x.arm)});
 return{o,m,eq,centre,left,right,kL,kR,aL,aR,ratio:kR*aR/(kL*aL)};
}
const compression=(r,o,sh,f)=>{const b=id=>r.mechanism.bodies.find(b=>b.id===id),ax=unit(sh.s.axis);
 // rod displacement relative to its cylinder along the bore, from the two bodies' observed poses
 const rel=f2=>{const pr=f2.bodies[sh.rod].position,pc=f2.bodies[sh.cyl].position,qc=f2.bodies[sh.cyl].rotation;const d=sub(pr,pc);const conjq=[-qc[0],-qc[1],-qc[2],qc[3]];return rotq(conjq,d);};
 const c0=rotq([0,0,0,1],sub(b(sh.rod).position,b(sh.cyl).position)),ax0=rotq([-b(sh.cyl).rotation[0],-b(sh.cyl).rotation[1],-b(sh.cyl).rotation[2],b(sh.cyl).rotation[3]],ax);
 const c0l=rotq([-b(sh.cyl).rotation[0],-b(sh.cyl).rotation[1],-b(sh.cyl).rotation[2],b(sh.cyl).rotation[3]],c0);
 return Math.abs(dot(sub(rel(f),c0l),ax0))*1000;};
const qmul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],rotq=(q,v)=>qmul(qmul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
export function judgeEqualShare(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);
 const g=shareGeometry(r),{o}=g;done(r,6);
 const hs=holds(r,[1,2,3,4]);
 const rows=hs.map(f=>{const dL=compression(r,o,g.left[0],f),dR=g.right.map(x=>compression(r,o,x,f));return{dL,dR,ratio:dL/((dR[0]+dR[1])/2),beamDeg:deg(o.angle(f,ES_BEAM,[0,-1,0],[0,0,1]))};});
 check(min(rows,x=>x.dL)>=4,'the shocks are really loaded',{rows});
 const err=max(rows,x=>Math.abs(x.ratio/g.ratio-1));check(err<=.01,'compressions share the load by moment balance',{predicted:g.ratio,rows});
 const par=max(rows,x=>Math.abs(x.dR[0]-x.dR[1]));check(par<=.05,'the parallel shocks compress equally',{par});
 const tilt=min(rows.slice(0,3),x=>Math.abs(x.beamDeg));check(tilt>=1,'the equalizer tilts to share unequal stiffness',{rows});
 const last=r.track.at(-1),back=Math.max(compression(r,o,g.left[0],last),...g.right.map(x=>compression(r,o,x,last)));check(back<=.3,'shocks return to the saved datum',{back});
 return{predictedRatio:g.ratio,kL:g.kL,kR:g.kR,armsMm:[g.aL*1000,g.aR*1000],rows,ratioError:err,foundation:foundation(r,o)};
}

// ---------------------------------------------------------------------------------------------
// Stroke Shift: an in-line slider-crank whose crank radius is set by a real spindle (motor B) carried on the
// turning carrier (motor A). With the crank pin C observed, the piston pin on its guide line through the carrier
// axis O follows x = u·(C−O) + √(L² − |(C−O)⊥|²), with L = |P−C| from the compiled rod joints. Strokes are 2r.
const SS_BASE='hub',SS_PISTON='output_marker',SS_ROD='rod_near';
function strokeGeometry(r){
 const m=r.mechanism,o=observeAddon(r,SS_BASE),pis=o.body(SS_PISTON),rod=o.body(SS_ROD);
 const ends=m.joints.filter(j=>j.type==='hinge'&&ids(j).includes(rod.id));assert.equal(ends.length,2,'rod has two pins');
 const jP=ends.find(j=>ids(j).includes(pis.id)),jC=ends.find(j=>j!==jP);assert.ok(jP&&jC,'rod joins crank pin to piston');
 const crankBody=ids(jC).find(id=>id!==rod.id),guide=m.joints.find(j=>j.type==='slider'&&ids(j).includes(pis.id)&&ids(j).includes(o.base.id));assert.ok(guide,'piston guide on the base');
 const carrier=m.joints.find(j=>j.type==='hinge'&&ids(j).includes(o.base.id)&&!j.motor&&m.couplings.some(c=>c.kind==='gear'&&[c.joint1,c.joint2].includes(j.id)));assert.ok(carrier,'geared carrier bearing');
 const a=unit(carrier.axis),u0=unit(inPlane(guide.axis,a)),u=dot(u0,sub(jP.point,carrier.point))<0?scale(u0,-1):u0,n=unit(cross(a,u));
 const L=norm(inPlane(sub(jP.point,jC.point),a)),e=dot(sub(jP.point,carrier.point),n);
 check(Math.abs(e)<=.5e-3,'piston line passes through the carrier axis',{eMm:e*1000});
 return{o,m,a,u,n,O:carrier.point,jC,jP,crankBody,L,pis};
}
const carryPoint=(r,o,f,bodyId,p)=>{const b=r.mechanism.bodies.find(b=>b.id===bodyId),fb=f.bodies[bodyId];const local=rotq([-b.rotation[0],-b.rotation[1],-b.rotation[2],b.rotation[3]],sub(p,b.position));const w=add(fb.position,rotq(fb.rotation,local));
 const base=o.base,fbase=f.bodies[base.id];return add(base.position,rotq(base.rotation,rotq([-fbase.rotation[0],-fbase.rotation[1],-fbase.rotation[2],fbase.rotation[3]],sub(w,fbase.position))));};
export function judgeStrokeShift(r,{native=false}={}){
 healthy(r,native,{couplings:['gear','screw']});assert.equal(r.mechanism.actuators.length,2);
 const g=strokeGeometry(r),{o}=g;done(r,6);
 const p0=o.initial(SS_PISTON),P0=dot(sub(g.jP.point,g.O),g.u);
 const rows=r.track.filter(f=>f.phase!=='cold').map(f=>{const C=sub(carryPoint(r,o,f,g.crankBody,g.jC.point),g.O),cu=dot(C,g.u),cp=norm(inPlane(sub(C,scale(g.u,cu)),g.a));
  return{f,rMm:norm(inPlane(C,g.a))*1000,pred:(cu+Math.sqrt(g.L*g.L-cp*cp)-P0)*1000,meas:dot(sub(o.point(f,SS_PISTON),p0),g.u)*1000};});
 const err=max(rows,x=>Math.abs(x.meas-x.pred));check(err<=.3,'piston follows the slider-crank closure from the observed crank pin',{err});
 const trials=[1,2,3].map(t=>{const turn=rows.filter(x=>num(x.f,'trial')===t&&[2,3].includes(num(x.f,'stage')));assert.ok(turn.length>100,'turn '+t);const rr=turn.map(x=>x.rMm);return{rMm:rr.reduce((s,x)=>s+x,0)/rr.length,rSpan:span(rr),stroke:span(turn.map(x=>x.meas))};});
 check(trials.every(t=>t.rSpan<=.1),'radius is held during each turn',{trials});
 check(trials.every(t=>Math.abs(t.stroke-2*t.rMm)<=.1),'each stroke is twice its crank radius',{trials});
 check(trials[1].rMm-trials[0].rMm>=5&&trials[2].rMm-trials[1].rMm>=5,'the spindle really changes the radius',{trials});
 const last=rows.at(-1);check(Math.abs(last.meas)<=.3,'piston returns to its saved datum',{lastMm:last.meas});
 return{Lmm:g.L*1000,trials,lawErrorMm:err,foundation:foundation(r,o)};
}

export const BATCH_B_JUDGES=Object.freeze({'roberval-balance-v1':judgePoise,'whippletree-share-v1':judgeEqualShare,'variable-crank-v1':judgeStrokeShift});

/** Measured loss of each batch-B law after its physical disconnection (the judge itself must also refuse). */
export function batchBDisconnectionLoss(id,r){
 if(id==='poise'){// lower_bar removed: the pans are no longer held upright.
  const o=observeAddon(r,PO_BASE),a=[1,0,0],v=max(r.track.filter(f=>f.phase!=='cold'),f=>Math.max(...PO_PANS.map(p=>Math.abs(deg(o.angle(f,p,a,[0,1,0]))))));
  return{metric:'maxPanTiltDeg',value:v,lost:v>10};}
 if(id==='equal-share'){// right_back_rod removed: only one shock remains on the right tip.
  const o=observeAddon(r,ES_BASE),m=r.mechanism,eq=o.body(ES_BEAM),tips=m.joints.filter(j=>j.type==='hinge'&&ids(j).includes(eq.id));
  const sh=tips.map(t=>{const rod=ids(t).find(id=>id!==eq.id),s=m.joints.find(j=>j.type==='slider'&&j.spring&&ids(j).includes(rod));return s&&{rod,s,cyl:ids(s).find(id=>id!==rod),arm:t.point[2]};}).filter(Boolean);
  const hs=holds(r,[1,2,3]),L=sh.filter(x=>x.arm<0),R=sh.filter(x=>x.arm>.03);assert.ok(L.length===1&&R.length===1,'one remaining shock per side');
  const ratios=hs.map(f=>compression(r,o,L[0],f)/compression(r,o,R[0],f));const v=Math.max(...ratios.map(x=>Math.abs(x/2-1)));
  return{metric:'ratioDepartureFrom2',value:v,ratios,lost:v>.2};}
 if(id==='stroke-shift'){// rod_near and rod_far removed: the piston is a loose part on its guide.
  // Documented radii (program header): 16, 22 and 28 mm, so the connected strokes are 32, 44 and 56 mm.
  const o=observeAddon(r,SS_BASE),p0=o.initial(SS_PISTON),x=f=>dot(sub(o.point(f,SS_PISTON),p0),[0,0,1])*1000;
  const strokes=[1,2,3].map(t=>span(r.track.filter(f=>num(f,'trial')===t&&[2,3].includes(num(f,'stage'))).map(x)));
  const v=Math.max(...strokes.map((s,i)=>Math.abs(s-2*[16,22,28][i])));return{metric:'maxStrokeLossMm',value:v,strokes,lost:v>10};}
 if(id==='triad-table'){const v=triadPinCLossMm(r);return{metric:'pinCSeparationMm',value:v,lost:v>2};}
 assert.fail('no batch-B disconnection measure for '+id);
}

// ---------------------------------------------------------------------------------------------
// Triad Table: a planar 3-RPR parallel platform. Each leg body pivots on the base at a_i; a spindle-driven piston
// slides along it and carries the platform pin. From the three observed piston extensions s_i (piston relative
// to its leg body along the compiled slider axis), the leg lengths ℓ_i = |q_i⁰ + s_i·d_i − a_i| (leg frame) fix
// the platform pose by forward kinematics: solve (x, z, ψ) so that |q_i(x,z,ψ) − a_i| = ℓ_i. The predicted
// platform pins are compared with the observed passive platform.
const TT_BASE='hub',TT_PLATFORM='platform_frame';
function triadGeometry(r){
 const m=r.mechanism,o=observeAddon(r,TT_BASE),pl=o.body(TT_PLATFORM),base=o.base;
 const legs=m.joints.filter(j=>j.type==='hinge'&&ids(j).includes(pl.id)).map(q=>{
  const piston=ids(q).find(id=>id!==pl.id),s=m.joints.find(j=>j.type==='slider'&&ids(j).includes(piston));assert.ok(s,'platform pin on a sliding piston');
  const leg=ids(s).find(id=>id!==piston),a=m.joints.find(j=>j.type==='hinge'&&!j.motor&&ids(j).includes(leg)&&ids(j).includes(base.id));assert.ok(a,'leg pivots on the base');
  return{q,s,piston,leg,a,sign:s.body1===piston?1:-1};});
 assert.equal(legs.length,3,'three legs carry the platform');
 const axis=unit(legs[0].a.axis);check(legs.every(l=>Math.abs(Math.abs(dot(unit(l.a.axis),axis))-1)<1e-6&&Math.abs(Math.abs(dot(unit(l.q.axis),axis))-1)<1e-6),'one common plane of motion',{});
 return{o,m,pl,legs,axis};
}
const conj=q=>[-q[0],-q[1],-q[2],q[3]];
const localOf=(r,f,bodyId,refId)=>{const b=f.bodies[bodyId],c=f.bodies[refId];return{p:rotq(conj(c.rotation),sub(b.position,c.position)),q:qmul(conj(c.rotation),b.rotation)};};
function triadRows(r,g,frames){
 const {o,legs,axis,pl}=g,bodies=new Map(r.mechanism.bodies.map(b=>[b.id,b]));
 const e1=unit(inPlane([1,0,0],axis)),e2=cross(axis,e1);
 const P=v=>[dot(v,e1),dot(v,e2)];
 const init=legs.map(l=>{const B=bodies.get(l.leg),Pi=bodies.get(l.piston);
  return{a:P(l.a.point),q0:P(l.q.point),dLocal:rotq(conj(B.rotation),unit(l.s.axis)),rel0:rotq(conj(B.rotation),sub(Pi.position,B.position)),qLeg0:rotq(conj(B.rotation),sub(l.q.point,B.position)),aLeg:rotq(conj(B.rotation),sub(l.a.point,B.position)),axLeg:rotq(conj(B.rotation),axis)};});
 const c0=init.map(x=>x.q0).reduce((s,v)=>[s[0]+v[0]/3,s[1]+v[1]/3],[0,0]),rel=init.map(x=>[x.q0[0]-c0[0],x.q0[1]-c0[1]]);
 const pin=(x,i)=>{const c=Math.cos(x[2]),s=Math.sin(x[2]);return[x[0]+c*rel[i][0]-s*rel[i][1],x[1]+s*rel[i][0]+c*rel[i][1]];};
 let guess=[c0[0],c0[1],0];
 return frames.map(f=>{
  const ell=legs.map((l,i)=>{const L=localOf(r,f,l.piston,l.leg),s=dot(sub(L.p,init[i].rel0),init[i].dLocal);return norm(inPlane(sub(add(init[i].qLeg0,scale(init[i].dLocal,s)),init[i].aLeg),init[i].axLeg));});
  let x=[...guess];
  for(let it=0;it<30;it++){const res=[0,1,2].map(i=>{const p=pin(x,i);return Math.hypot(p[0]-init[i].a[0],p[1]-init[i].a[1])-ell[i];});
   const J=[0,1,2].map(i=>[0,1,2].map(k=>{const h=1e-7,y=[...x];y[k]+=h;const p=pin(y,i);return(Math.hypot(p[0]-init[i].a[0],p[1]-init[i].a[1])-ell[i]-res[i])/h;}));
   const det=J[0][0]*(J[1][1]*J[2][2]-J[1][2]*J[2][1])-J[0][1]*(J[1][0]*J[2][2]-J[1][2]*J[2][0])+J[0][2]*(J[1][0]*J[2][1]-J[1][1]*J[2][0]);assert.ok(Math.abs(det)>1e-12,'non-singular platform pose');
   const inv=[[J[1][1]*J[2][2]-J[1][2]*J[2][1],J[0][2]*J[2][1]-J[0][1]*J[2][2],J[0][1]*J[1][2]-J[0][2]*J[1][1]],[J[1][2]*J[2][0]-J[1][0]*J[2][2],J[0][0]*J[2][2]-J[0][2]*J[2][0],J[0][2]*J[1][0]-J[0][0]*J[1][2]],[J[1][0]*J[2][1]-J[1][1]*J[2][0],J[0][1]*J[2][0]-J[0][0]*J[2][1],J[0][0]*J[1][1]-J[0][1]*J[1][0]]].map(row=>row.map(v=>v/det));
   const dx=inv.map(row=>dot(row,res));x=x.map((v,k)=>v-dx[k]);if(Math.max(...dx.map(Math.abs))<1e-12)break;}
  guess=x;
  const pinObs=legs.map(l=>P(carryPoint(r,o,f,pl.id,l.q.point)));
  const err=Math.max(...[0,1,2].map(i=>{const p=pin(x,i);return Math.hypot(p[0]-pinObs[i][0],p[1]-pinObs[i][1]);}))*1000;
  return{f,ell,pose:{xMm:(x[0]-c0[0])*1000,zMm:(x[1]-c0[1])*1000,yawDeg:deg(x[2])},err};});
}
export function judgeTriadTable(r,{native=false,contract}={}){
 sameIssues(r.issues,contract?.expectedIssues);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 check(r.mechanism.couplings.every(c=>c.kind==='screw'),'only the three real spindles couple',{kinds:r.mechanism.couplings.map(c=>c.kind)});
 assert.equal(r.mechanism.actuators.length,3);
 const g=triadGeometry(r);done(r,16);
 const frames=r.track.filter(f=>f.phase!=='cold'),rows=triadRows(r,g,frames);
 const err=max(rows,x=>x.err);check(err<=.1,'observed platform pins follow the forward kinematics of the observed leg lengths',{err});
 const xs=rows.map(x=>x.pose),travel=Math.max(span(xs.map(p=>p.xMm)),span(xs.map(p=>p.zMm))),yaw=span(xs.map(p=>p.yawDeg));
 check(travel>=8&&yaw>=10,'the platform really translates and turns',{travel,yaw});
 const legSpan=Math.min(...[0,1,2].map(i=>span(rows.map(x=>x.ell[i]))))*1000;check(legSpan>=4,'every leg really changes length',{legSpan});
 const last=rows.at(-1).pose;check(Math.hypot(last.xMm,last.zMm)<=.3&&Math.abs(last.yawDeg)<=.1,'platform returns to its saved datum',{last});
 return{lawErrorMm:err,translationSpanMm:travel,yawSpanDeg:yaw,legSpanMm:legSpan,final:last,foundation:foundation(r,g.o)};
}
const sameIssues=(actual,expected=[])=>{const key=i=>i.code+':'+[...(i.parts||[])].sort().join(',');assert.deepEqual(actual.map(key).sort(),(expected||[]).map(key).sort(),'compiler issues are exactly the reviewed, declared ones');};
/** Triad Table disconnection (platform_axle_C removed): the platform's saved pin-C location, carried with the
 * platform, no longer tracks piston C's end. Pin C sits at the documented 140 LDU = 56 mm home pin length along
 * leg C from its base pivot (model header). */
export function triadPinCLossMm(r){
 const m=r.mechanism,o=observeAddon(r,TT_BASE),pl=o.body(TT_PLATFORM),pC=o.body('actuator_piston_C');
 const s=m.joints.find(j=>j.type==='slider'&&ids(j).includes(pC.id)),leg=ids(s).find(id=>id!==pC.id),a=m.joints.find(j=>j.type==='hinge'&&!j.motor&&ids(j).includes(leg)&&ids(j).includes(o.base.id));
 let d=unit(inPlane(s.axis,unit(a.axis)));const toPl=sub(pl.position,a.point);if(dot(d,toPl)<0)d=scale(d,-1);
 const pin=add([a.point[0],s.point[1],a.point[2]],scale(d,.056));
 return max(r.track.filter(f=>f.phase!=='cold'),f=>norm(sub(carryPoint(r,o,f,pl.id,pin),carryPoint(r,o,f,pC.id,pin))))*1000;
}
