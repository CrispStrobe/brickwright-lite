// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Robot Lab R2 judge family (2026-11-11): Cadence Geneva, Equinox differential, Helios epicyclic, Orion double Cardan.
//
// Each law is the mechanism's own physics, and its constants are read from the compiled parts (tooth counts from
// the part catalogue, crank radius, centre distance and shaft directions from the compiled poses), never fitted to
// a run. Each judge then measures the parts' actual poses (observeAddon, relative to the hub) and the motor
// encoders. Bounds are frozen here and never loosened to admit a model.
//
// - geneva-index-v1 (cadence-geneva): an external four-slot Geneva. Crank radius a = 40 mm and centre distance
//   d = 56.57 mm satisfy d·sin(180°/n) = a for n = 4, so the roller enters and leaves each slot radially. Per crank
//   turn the star turns 90° while the crank is within ±45° of the line of centres, tan β = sin φ / (√2 − cos φ),
//   and dwells for the other 270°; the star turns against the crank. The 8T star pinion drives a 24T idler, a 24T
//   idler and the 24T dial gear (three external meshes): dial = −star/3, one dial turn for twelve crank turns.
// - differential-sum-v1 (equinox-differential): an open bevel differential. Motor A's 12T bevel drives the 28T
//   carrier, so |K| = (12/28)|A|; the side gears obey L + R = 2K in every stage (both free, one held, the other
//   held, both free on the return); each brake motor is geared to its output by 12T:20T, |motor| = (20/12)|output|.
// - willis-epicyclic-v1 (helios-transmission): the 24T input sun drives the 8T planet, whose 16T twin drives the
//   16T output sun. Willis: (ω_out − ω_c)/(ω_A − ω_c) = (24/8)(16/16) = 3, so ω_out = 3ω_A − 2ω_c; motor B's 20T
//   gear drives the 28T carrier, ω_c = −(20/28)ω_B. The output stands still when ω_B = −(3·28/(2·20))·ω_A.
// - double-cardan-offset-v1 (orion-cardan): two universal joints with equal bend β (here 36.87°, from the
//   compiled shaft directions), the middle shaft's forks in one plane and the output parallel to the input. The
//   middle shaft follows tan θ_m = tan θ / cos β (12.76° peak-to-peak lead), the output equals the input. It is not
//   Phasekeeper's double-cardan-v1 (that judge names Phasekeeper's own parts); it reuses the same ripple form.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const deg=x=>x*180/Math.PI,rad=x=>x*Math.PI/180,span=a=>Math.max(...a)-Math.min(...a),maxAbs=a=>Math.max(...a.map(Math.abs));
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
const CATALOG=(()=>{const P=JSON.parse(readFileSync(new URL('../../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url),'utf8'));return new Map(Object.values(P.parts||P).map(p=>[p.part,p]));})();
/** Tooth count of a compiled part, from the part catalogue. */
const teeth=(r,id)=>{const p=r.runModel.parts.find(p=>p.id===id);assert.ok(p,'compiled part '+id);const n=CATALOG.get(p.part)?.gear?.teeth;assert.ok(n>0,'gear part '+id);return n;};

// Frozen constants and bounds of the four laws. Never loosened to admit a model.
export const R2_LAWS=Object.freeze({
 geneva:Object.freeze({slots:4,crankMm:40,compiledMm:.05,dialRatio:-1/3,stepDeg:90,stepTolDeg:.25,firstStepMinDeg:88,dwellDeg:.1,lagDeg:4.5,dialDeg:.25,driveDeg:.25,crankTurns:12,disconnectedDeg:10}),
 differential:Object.freeze({carrierRatio:12/28,brakeRatio:20/12,sumDeg:.1,carrierDeg:.25,brakeDeg:.25,heldDeg:1,stageDeg:840,disconnectedDeg:5}),
 willis:Object.freeze({k:3,controlRatio:-20/28,lawDeg:.25,controlDeg:.25,driveDeg:.25,standstillDps:.5,inputDps:30,disconnectedDeg:5}),
 cardan:Object.freeze({betaDeg:36.87,compiledDeg:.01,outputDeg:.25,rippleDeg:.5,ripplePpTolDeg:.25,inputSpanDeg:3600,disconnectedDeg:5})
});

function healthy(r,native,expectedIssues){
 const key=i=>i.code+':'+[...(i.parts||[])].sort().join(',');
 assert.deepEqual(r.issues.map(key).sort(),(expectedIssues||[]).map(key).sort(),'compiler issues are exactly the reviewed, declared ones');
 assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
}
function foundation(r,o){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id],frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=Math.max(...frames.map(f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000)),tiltDeg=Math.max(...frames.map(f=>o.tilt(f)));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});
 const gapMm=Math.max(...r.track.map(f=>o.gap(f))),axisDeg=Math.max(...r.track.map(f=>o.axisGap(f)));
 check(gapMm<=.5&&axisDeg<=1,'true hinge closure and aligned axes',{gapMm,axisDeg});return{horizontalMm,tiltDeg,gapMm,axisDeg};
}
function completed(r){const v=r.track.at(-1).extra.variables;assert.equal(Number(v.completed),1,'program reports completion');assert.equal(Number(v.failed),0,'program reports no failure');}
const program=r=>r.track.filter(f=>f.phase!=='cold');
/** Unwrapped rotation (deg, from the first program frame) of a part about an axis, relative to the hub. */
const turn=(o,frames,id,axis)=>{const ref=unit(cross(axis,Math.abs(axis[0])<.8?[1,0,0]:[0,1,0])),a=unwrap(frames.map(f=>o.angle(f,id,axis,ref))).map(deg);return a.map(x=>x-a[0]);};
const encoder=(r,frames,port)=>{const j=r.mechanism.joints.find(j=>j.motor?.port===port);assert.ok(j,'motor '+port+' drives a joint');return{joint:j,deg:frames.map(f=>deg(f.joints[j.id].angle-frames[0].joints[j.id].angle))};};
const stageRows=(frames,s)=>frames.map((f,i)=>Number(f.extra?.variables?.stage)===s?i:-1).filter(i=>i>=0);

// ---------------------------------------------------------------- geneva-index-v1
const VERTICAL=[0,-1,0];
/** Crank radius, centre distance, entry phase and dial ratio from the compiled parts alone. */
export function compiledGeneva(r,o=observeAddon(r)){
 const c=o.initial('driver_shaft'),p=o.initial('driver_roller_0'),s=o.initial('star_shaft');
 const d1=[p[0]-c[0],p[2]-c[2]],d2=[s[0]-c[0],s[2]-c[2]],crankMm=Math.hypot(...d1)*1000,centreMm=Math.hypot(...d2)*1000;
 // Signed angle about the vertical axis (−y) from the roller to the line of centres: the crank turn that brings the
 // roller to the slot's centre line.
 const entryDeg=deg(Math.atan2(d1[0]*d2[1]-d1[1]*d2[0],d1[0]*d2[0]+d1[1]*d2[1]));
 const meshes=[['dial_star_pinion','dial_idler_1_gear'],['dial_idler_1_gear','dial_idler_2_gear'],['dial_idler_2_gear','dial_output_gear']];
 const dialRatio=meshes.reduce((k,[a,b])=>-k*teeth(r,a)/teeth(r,b),1);
 return{crankMm,centreMm,radialEntry:centreMm*Math.sin(Math.PI/R2_LAWS.geneva.slots)/crankMm,entryDeg,dialRatio};
}
/** Ideal star turn (deg) for crank angle u measured from the line of centres (n = 4, radial entry). */
const genevaStep=u=>{const m=Math.round(u/360),w=u-360*m,h=w<-45?-45:w>45?45:deg(Math.atan2(Math.sin(rad(w)),Math.SQRT2-Math.cos(rad(w))));return 90*m+h;};
export function genevaTrack(r,o=observeAddon(r),g=compiledGeneva(r,o)){
 const frames=program(r),crank=turn(o,frames,'driver_crank',VERTICAL),star=turn(o,frames,'star_center',VERTICAL),dial=turn(o,frames,'dial_output_gear',VERTICAL),enc=encoder(r,frames,'A');
 // The roller starts entryDeg away from the line of centres, so the crank angle from that line is u = crank − entryDeg.
 // An external Geneva turns the star against the crank.
 const u0=-g.entryDeg,pred=crank.map(a=>-(genevaStep(a+u0)-genevaStep(u0)));
 return{frames,crank,star,dial,enc:enc.deg,pred,u:crank.map(a=>a+u0)};
}
export function judgeGenevaIndex(r,{native=false,contract}={}){
 const L=R2_LAWS.geneva;healthy(r,native,contract?.expectedIssues);assert.equal(r.mechanism.actuators.length,1);
 const o=observeAddon(r),g=compiledGeneva(r,o);
 check(Math.abs(g.crankMm-L.crankMm)<=L.compiledMm&&Math.abs(g.radialEntry-1)<=1e-3,'compiled four-slot Geneva: 40 mm crank, centre distance a/sin 45°',g);
 check(Math.abs(g.dialRatio-L.dialRatio)<=1e-9,'compiled 8T:24T:24T:24T train gives dial = −star/3',g);
 completed(r);
 const t=genevaTrack(r,o,g),err=t.star.map((x,i)=>x-t.pred[i]),w=t.u.map(x=>x-360*Math.round(x/360));
 const driveErrorDeg=Math.max(maxAbs(t.crank.map((x,i)=>x-t.enc[i])),0),crankTurns=span(t.crank)/360;
 // Dwell: the star must not move while the roller is outside the slots (|φ| ≥ 50°, a 5° margin past exit).
 const turnIdx=t.u.map(x=>Math.round(x/360));let dwellDeg=0;
 for(const k of new Set(turnIdx)){const idx=t.u.map((x,i)=>turnIdx[i]===k&&Math.abs(w[i])>=50?i:-1).filter(i=>i>=0);
  for(const side of [idx.filter(i=>w[i]<0),idx.filter(i=>w[i]>0)])if(side.length>1)dwellDeg=Math.max(dwellDeg,span(side.map(i=>t.star[i])));}
 // Each step: star level after an engagement minus the level before it.
 const levels=[...new Set(turnIdx)].sort((a,b)=>a-b).map(k=>{const before=t.u.map((x,i)=>turnIdx[i]===k&&w[i]<=-50?i:-1).filter(i=>i>=0),after=t.u.map((x,i)=>turnIdx[i]===k&&w[i]>=50?i:-1).filter(i=>i>=0);
  return before.length&&after.length?Math.abs(t.star[after.at(-1)]-t.star[before[0]]):null;}).filter(x=>x!==null);
 const laterStepErrorDeg=maxAbs(levels.slice(1).map(x=>x-L.stepDeg)),firstStepDeg=levels[0];
 const lagDeg=maxAbs(err),dialErrorDeg=maxAbs(t.dial.map((x,i)=>x-L.dialRatio*t.star[i]));
 const values={crankTurns,steps:levels.length,firstStepDeg,laterStepErrorDeg,dwellDeg,lagDeg,dialErrorDeg,driveErrorDeg,starEndDeg:t.star.at(-1),dialEndDeg:t.dial.at(-1)};
 check(Math.abs(crankTurns-L.crankTurns)<=.01&&levels.length===L.crankTurns,'twelve crank turns, twelve engagements',values);
 check(driveErrorDeg<=L.driveDeg,'crank turns 1:1 with motor A',values);
 check(dwellDeg<=L.dwellDeg,'star dwells while the roller is outside the slots (270° of each turn)',values);
 check(laterStepErrorDeg<=L.stepTolDeg&&firstStepDeg>=L.firstStepMinDeg&&firstStepDeg<=L.stepDeg+L.stepTolDeg,'every engagement indexes the star 90°',values);
 check(lagDeg<=L.lagDeg,'star follows tan β = sin φ / (√2 − cos φ) within the roller clearance',values);
 check(dialErrorDeg<=L.dialDeg,'dial = −star/3',values);
 return{law:'n = 4 Geneva: 90° per crank turn over ±45°, dwell 270°, dial = −star/3',compiled:g,...values,frames:t.frames.length,foundation:foundation(r,o)};
}
/** Without the drive pin the crank still turns twelve times but the star no longer indexes. */
export function genevaDisconnectionLoss(r){
 const o=observeAddon(r),g=compiledGeneva(r,o),t=genevaTrack(r,o,g),value=maxAbs(t.star.map((x,i)=>x-t.pred[i]));
 return{metric:'starLawErrorDeg',value,crankTurns:span(t.crank)/360,starSpanDeg:span(t.star),lost:value>R2_LAWS.geneva.disconnectedDeg};
}

// ---------------------------------------------------------------- differential-sum-v1
const OUT_AXIS=[0,0,1],OUT_REF=[0,1,0];
export function compiledDifferential(r){
 return{carrierRatio:teeth(r,'pinion')/teeth(r,'cover'),brakeRatioRight:teeth(r,'brake20')/teeth(r,'brake12'),brakeRatioLeft:teeth(r,'brakeLeft20')/teeth(r,'brakeLeft12'),
  sideTeeth:[teeth(r,'sideL'),teeth(r,'sideR')],planetTeeth:['planet1','planet2','planet3'].map(id=>teeth(r,id))};
}
export function differentialTrack(r,o=observeAddon(r)){
 const frames=program(r),L=turn(o,frames,'leftWheel',OUT_AXIS),R=turn(o,frames,'rightWheel',OUT_AXIS),K=turn(o,frames,'casing',OUT_AXIS);
 return{frames,L,R,K,A:encoder(r,frames,'A').deg,B:encoder(r,frames,'B').deg,C:encoder(r,frames,'C').deg};
}
/** Best signed fit error of y = ±k·x (the sign is the axis convention, the magnitude is the law). */
const signedError=(y,x,k)=>Math.min(maxAbs(y.map((v,i)=>v-k*x[i])),maxAbs(y.map((v,i)=>v+k*x[i])));
export function judgeDifferentialSum(r,{native=false,contract}={}){
 const L=R2_LAWS.differential;healthy(r,native,contract?.expectedIssues);assert.equal(r.mechanism.actuators.length,3);
 const o=observeAddon(r),g=compiledDifferential(r);
 check(Math.abs(g.carrierRatio-L.carrierRatio)<=1e-9&&g.brakeRatioRight===L.brakeRatio&&g.brakeRatioLeft===L.brakeRatio,'compiled 12T:28T carrier drive and 12T:20T brakes',g);
 check(g.sideTeeth[0]===g.sideTeeth[1],'compiled equal side gears (the sum law needs them)',g);
 completed(r);
 const t=differentialTrack(r,o),sumErrorDeg=maxAbs(t.L.map((l,i)=>l+t.R[i]-2*t.K[i]));
 const carrierErrorDeg=signedError(t.K,t.A,L.carrierRatio),brakeRightErrorDeg=signedError(t.B,t.R,L.brakeRatio),brakeLeftErrorDeg=signedError(t.C,t.L,L.brakeRatio);
 const stage=s=>{const idx=stageRows(t.frames,s);assert.ok(idx.length>10,'stage '+s+' recorded');const a=idx[0],b=idx.at(-1);return{A:t.A[b]-t.A[a],K:t.K[b]-t.K[a],L:t.L[b]-t.L[a],R:t.R[b]-t.R[a]};};
 const s1=stage(1),s2=stage(2),s3=stage(3),s4=stage(4);
 const heldRightDeg=Math.abs(s2.R),heldLeftDeg=Math.abs(s3.L);
 const values={sumErrorDeg,carrierErrorDeg,brakeRightErrorDeg,brakeLeftErrorDeg,heldRightDeg,heldLeftDeg,stages:{s1,s2,s3,s4}};
 check([s1,s2,s3].every(s=>Math.abs(Math.abs(s.A)-L.stageDeg)<=2),'motor A turns the carrier 840° in stages 1–3',values);
 check(sumErrorDeg<=L.sumDeg,'side gears obey L + R = 2K',values);
 check(carrierErrorDeg<=L.carrierDeg,'carrier K = (12/28)·A',values);
 check(brakeRightErrorDeg<=L.brakeDeg&&brakeLeftErrorDeg<=L.brakeDeg,'brake motors turn 20/12 × their output',values);
 check(heldRightDeg<=L.heldDeg&&heldLeftDeg<=L.heldDeg,'a held output stays put while the other turns 2K',values);
 return{law:'L + R = 2K, K = (12/28)·A, brake motor = (20/12)·output',compiled:g,...values,frames:t.frames.length,foundation:foundation(r,o)};
}
/** Without the carrier drive the motor still turns but the carrier no longer follows K = (12/28)·A. */
export function differentialDisconnectionLoss(r){
 const t=differentialTrack(r),value=signedError(t.K,t.A,R2_LAWS.differential.carrierRatio);
 return{metric:'carrierLawErrorDeg',value,inputSpanDeg:span(t.A),carrierSpanDeg:span(t.K),lost:value>R2_LAWS.differential.disconnectedDeg};
}

// ---------------------------------------------------------------- willis-epicyclic-v1
const HELIOS_AXIS=[0,-1,0];
export function compiledWillis(r){
 return{k:(teeth(r,'sun_input')/teeth(r,'planet_small_pos'))*(teeth(r,'planet_large_pos')/teeth(r,'sun_output')),
  kNeg:(teeth(r,'sun_input')/teeth(r,'planet_small_neg'))*(teeth(r,'planet_large_neg')/teeth(r,'sun_output')),controlRatio:-teeth(r,'control_gear')/teeth(r,'carrier_top')};
}
export function willisTrack(r,o=observeAddon(r)){
 const frames=program(r),A=turn(o,frames,'sun_input',HELIOS_AXIS),O=turn(o,frames,'sun_output',HELIOS_AXIS),C=turn(o,frames,'carrier_top',HELIOS_AXIS),has=id=>r.mechanism.bodies.some(b=>b.parts.includes(id)),B=has('control_gear')?turn(o,frames,'control_gear',HELIOS_AXIS):null;
 return{frames,A,O,C,B,encA:encoder(r,frames,'A').deg,encB:encoder(r,frames,'B').deg};
}
export function judgeWillisEpicyclic(r,{native=false,contract}={}){
 const L=R2_LAWS.willis;healthy(r,native,contract?.expectedIssues);assert.equal(r.mechanism.actuators.length,2);
 const o=observeAddon(r),g=compiledWillis(r);
 check(g.k===L.k&&g.kNeg===L.k&&Math.abs(g.controlRatio-L.controlRatio)<=1e-9,'compiled 24T/8T·16T/16T compound planets and 20T:28T carrier drive',g);
 completed(r);
 const t=willisTrack(r,o),lawErrorDeg=maxAbs(t.O.map((x,i)=>x-(L.k*t.A[i]-(L.k-1)*t.C[i]))),controlErrorDeg=maxAbs(t.C.map((x,i)=>x-L.controlRatio*t.B[i]));
 const driveErrorDeg=Math.max(maxAbs(t.A.map((x,i)=>x-t.encA[i])),maxAbs(t.B.map((x,i)=>x-t.encB[i])));
 // The five constant-speed stages: ω_B steps 0, −21, −42, −63, −84 °/s. Speeds from the middle 60 % of each stage.
 const speeds=[1,2,3,4,5].map(s=>{const idx=stageRows(t.frames,s);assert.ok(idx.length>20,'stage '+s+' recorded');const a=idx[Math.floor(idx.length*.3)],b=idx[Math.floor(idx.length*.9)],dt=(t.frames[b].t-t.frames[a].t)/1000;
  return{stage:s,A:(t.A[b]-t.A[a])/dt,B:(t.B[b]-t.B[a])/dt,C:(t.C[b]-t.C[a])/dt,O:(t.O[b]-t.O[a])/dt};});
 const standstillB=(L.k/(L.k-1))*L.inputDps/L.controlRatio,still=speeds.find(s=>Math.abs(s.B-standstillB)<=1);
 const values={lawErrorDeg,controlErrorDeg,driveErrorDeg,standstillControlDps:standstillB,speeds};
 check(lawErrorDeg<=L.lawDeg,'output follows ω_out = 3ω_A − 2ω_c',values);
 check(controlErrorDeg<=L.controlDeg,'carrier ω_c = −(20/28)·ω_B',values);
 check(driveErrorDeg<=L.driveDeg,'input sun and control gear turn 1:1 with their motors',values);
 check(speeds.every(s=>Math.abs(s.A-L.inputDps)<=.5),'motor A runs at 30 °/s through the five stages',values);
 check(still&&Math.abs(still.O)<=L.standstillDps,'output stands still at ω_B = −(3·28/(2·20))·ω_A',values);
 return{law:'ω_out = 3ω_A − 2ω_c, ω_c = −(20/28)ω_B',compiled:g,...values,frames:t.frames.length,foundation:foundation(r,o)};
}
/** Without the control gear the carrier is no longer driven by motor B: the encoder law is lost. */
export function willisDisconnectionLoss(r){
 const t=willisTrack(r),L=R2_LAWS.willis,value=maxAbs(t.O.map((x,i)=>x-(L.k*t.encA[i]-(L.k-1)*L.controlRatio*t.encB[i])));
 return{metric:'encoderLawErrorDeg',value,inputSpanDeg:span(t.encA),controlSpanDeg:span(t.encB),lost:value>L.disconnectedDeg};
}

// ---------------------------------------------------------------- double-cardan-offset-v1
export function compiledCardan(r){
 const c=r.mechanism.couplings.filter(c=>c.kind==='universalJoint');assert.equal(c.length,2,'two real Cardan crosses');
 const [j1,j2]=c,ang=(a,b)=>deg(Math.acos(Math.min(1,Math.abs(dot(unit(a),unit(b))))));
 const bend=unit(cross(j1.shaft1,j1.shaft2));
 return{beta1Deg:ang(j1.shaft1,j1.shaft2),beta2Deg:ang(j2.shaft1,j2.shaft2),outputParallelDeg:ang(j1.shaft1,j2.shaft2),
  // The middle shaft's two forks lie in one plane (in phase), and the input fork lies in the plane of the bend.
  middleForksDeg:ang(j1.fork2,j2.fork1),inputForkOffPlaneDeg:90-ang(j1.fork1,bend),middleAxis:unit(j1.shaft2)};
}
export function cardanTrack(r,o=observeAddon(r),g=compiledCardan(r)){
 const frames=program(r),enc=encoder(r,frames,'A'),axis=enc.joint.axis;
 const input=turn(o,frames,'shaft_input',axis),output=turn(o,frames,'shaft_output',axis);
 let m=g.middleAxis;if(dot(m,axis)<0)m=m.map(x=>-x);
 const middle=turn(o,frames,'shaft_middle',m),cb=Math.cos(rad(g.beta1Deg));
 const th=enc.deg.map(rad),pred=unwrap(th.map(t=>Math.atan2(Math.sin(t),cb*Math.cos(t)))).map(deg),p0=pred[0];
 return{frames,enc:enc.deg,input,output,middle,pred:pred.map(x=>x-p0)};
}
export function judgeDoubleCardanOffset(r,{native=false,contract}={}){
 const L=R2_LAWS.cardan;healthy(r,native,contract?.expectedIssues);assert.equal(r.mechanism.actuators.length,1);
 const o=observeAddon(r),g=compiledCardan(r);
 check(Math.abs(g.beta1Deg-L.betaDeg)<=L.compiledDeg&&Math.abs(g.beta2Deg-L.betaDeg)<=L.compiledDeg,'compiled equal bends β = 36.87°',g);
 check(g.outputParallelDeg<=L.compiledDeg&&g.middleForksDeg<=L.compiledDeg&&Math.abs(g.inputForkOffPlaneDeg)<=L.compiledDeg,'compiled Z arrangement: output parallel to input, middle forks in phase',g);
 completed(r);
 const t=cardanTrack(r,o,g),cb=Math.cos(rad(g.beta1Deg)),predictedPpDeg=2*deg(Math.atan((1/Math.sqrt(cb)-Math.sqrt(cb))/2));
 const lead=t.middle.map((x,i)=>x-t.enc[i]),leadPpDeg=span(lead),inputSpanDeg=span(t.enc);
 const values={inputSpanDeg,driveErrorDeg:maxAbs(t.input.map((x,i)=>x-t.enc[i])),outputErrorDeg:maxAbs(t.output.map((x,i)=>x-t.enc[i])),
  rippleLawErrorDeg:maxAbs(t.middle.map((x,i)=>x-t.pred[i])),leadPpDeg,predictedPpDeg};
 check(inputSpanDeg>=L.inputSpanDeg,'input turns at least ten revolutions',values);
 check(values.driveErrorDeg<=L.outputDeg,'input shaft turns 1:1 with motor A',values);
 check(values.outputErrorDeg<=L.outputDeg,'output equals input (constant velocity through two equal joints)',values);
 check(values.rippleLawErrorDeg<=L.rippleDeg,'middle shaft follows tan θ_m = tan θ / cos β',values);
 check(Math.abs(leadPpDeg-predictedPpDeg)<=L.ripplePpTolDeg,'middle shaft ripples 12.76° peak to peak',values);
 return{law:'output − input = 0, tan θ_m = tan θ / cos 36.87°',compiled:g,...values,frames:t.frames.length,foundation:foundation(r,o)};
}
/** With one cross removed the input still turns but the output no longer equals it. */
export function cardanDisconnectionLoss(r){
 const frames=program(r),o=observeAddon(r),enc=encoder(r,frames,'A'),output=turn(o,frames,'shaft_output',enc.joint.axis),value=maxAbs(output.map((x,i)=>x-enc.deg[i]));
 return{metric:'outputLawErrorDeg',value,inputSpanDeg:span(enc.deg),outputSpanDeg:span(output),lost:value>R2_LAWS.cardan.disconnectedDeg};
}

/** Disconnection loss by contract id. */
export function r2DisconnectionLoss(id,r){
 const f={'cadence-geneva':genevaDisconnectionLoss,'equinox-differential':differentialDisconnectionLoss,'helios-transmission':willisDisconnectionLoss,'orion-cardan':cardanDisconnectionLoss}[id];
 assert.ok(f,'no R2 disconnection loss for '+id);return f(r);
}
