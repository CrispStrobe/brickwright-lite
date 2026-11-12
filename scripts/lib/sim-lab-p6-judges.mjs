// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// P6 judges (2026-11-07). Each law is predicted from the model's documented mechanism and real part data,
// never fitted to the recorded motion and never read from the compiler's own coupling ratios. Predictions
// judge observed passive bodies; they never drive their poses. Failing assertions carry their measured values.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const max=(s,k)=>Math.max(...s.map(k)),deg=x=>x*180/Math.PI;
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
const ids=j=>[j.body1,j.body2];
const vars=f=>f.extra.variables;
const inPlane=(v,a)=>sub(v,a.map(x=>x*dot(v,a)));
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};

function healthy(r,native){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?1000:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
}
function foundation(r,o){
 const first=r.track.find(f=>f.phase==='program')||r.track[0],b=first.bodies[o.base.id],frames=r.track.filter(f=>f.phase!=='cold');
 const horizontalMm=max(frames,f=>Math.hypot(f.bodies[o.base.id].position[0]-b.position[0],f.bodies[o.base.id].position[2]-b.position[2])*1000),tiltDeg=max(frames,f=>o.tilt(f));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});return{horizontalMm,tiltDeg};
}
const done=(r,stage)=>{const v=vars(r.track.at(-1));check(Number(v.completed)===1&&Number(v.failed)===0&&String(v.stage)===String(stage),'program completes without fault',{completed:v.completed,failed:v.failed,stage:v.stage});};

// ---------------------------------------------------------------------------------------------
// Paired Door Sync: one 16-tooth pinion (94925, LEGO module 1 mm, so pitch radius 16·1/2 = 8 mm) between two racks
// on opposite sides. A rack's displacement along its own guide is v = θ·(a × d)·r̂ where a is the motor axis and d
// the unit offset from the pinion axis to the rack's guide line: the two racks lie on opposite sides, so the same θ
// moves them by ±8 mm/rad (0.1396263 mm/°) in opposite senses and their sum stays zero. Both racks are passive.
const PAIRED_DOOR_PITCH_M=16*0.001/2;
function pairedDoorRows(r){
 const m=r.mechanism,o=observeAddon(r,'base_runner_left'),pin=r.runModel.parts.find(p=>p.id==='pinion');
 assert.ok(pin&&/^94925\.dat$/i.test(pin.part),'the drive pinion is the real 16-tooth 94925');
 const jO=m.joints.find(j=>j.motor?.port==='A');assert.ok(jO&&jO.type==='hinge'&&ids(jO).includes(o.body('pinion').id),'motor A turns the pinion');
 const a=unit(jO.axis),sign=ids(jO)[1]===o.body('pinion').id?1:-1;
 const racks=['rack_front','rack_back'].map(id=>{const s=m.joints.find(j=>j.type==='slider'&&ids(j).includes(o.body(id).id)&&ids(j).includes(o.base.id));assert.ok(s,'rack '+id+' rides its own guide');
  const u=unit(s.axis),off=sub(s.point,jO.point),d=unit(sub(off,a.map(x=>x*dot(off,a))));const k=dot(cross(a,d),u)*sign;check(Math.abs(Math.abs(k)-1)<1e-6,'guide tangent to the pinion',{id,k});return{id,u,k,p0:o.initial(id)};});
 check(racks[0].k*racks[1].k<0,'the racks lie on opposite sides of the pinion',{k:racks.map(x=>x.k)});
 const theta=unwrap(r.track.map(f=>f.joints[jO.id].angle)),t0=theta[0];
 return{o,racks,rows:r.track.map((f,i)=>{const th=theta[i]-t0,x=racks.map(q=>dot(sub(o.point(f,q.id),q.p0),q.u)),pred=racks.map(q=>q.k*PAIRED_DOOR_PITCH_M*th);
  return{thetaDeg:deg(th),x:x.map(v=>v*1000),pred:pred.map(v=>v*1000),err:Math.max(...x.map((v,j)=>Math.abs(v-pred[j])))*1000,sum:Math.abs(x[0]+x[1])*1000};})};
}
export function judgePairedDoor(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,1);done(r,5);
 const {o,rows}=pairedDoorRows(r),found=foundation(r,o);
 const err=max(rows,x=>x.err),sum=max(rows,x=>x.sum),thMax=max(rows,x=>x.thetaDeg),thMin=Math.min(...rows.map(x=>x.thetaDeg));
 check(thMax>=145&&thMin<=-145,'the program sweeps the pinion through both authored holds',{thMax,thMin});
 const strokeMm=max(rows,x=>Math.abs(x.x[0]));check(strokeMm>=0.1396263*145,'the front rack travels its predicted stroke',{strokeMm});
 check(err<=.3,'each passive rack follows ±8 mm per radian of the observed pinion',{err});
 check(sum<=.3,'the opposed racks keep a constant sum (equal and opposite)',{sum});
 return{law:'x_front = -x_back = ±8 mm/rad (16T pinion)',maxLawErrorMm:err,maxSumMm:sum,thetaRangeDeg:[thMin,thMax],strokeMm,...found};
}

// ---------------------------------------------------------------------------------------------
// Evenhand: a counterbalanced two-joint arm in a vertical plane. The engine's motors hold any load, so the law is the
// holding torque, not sag. Prediction (statics, independent of the solver's motor effort): at each settled pose the
// motor must cancel gravity's moment about its own axis from every body distal to that joint,
// τ_motor = −a·Σ (c_b − p) × m_b g, with each body's configured mass and centre of mass at the observed pose (the
// compiler's part-mass inputs) and the hinge point/axis carried with its proximal body. Balance: the elbow's distal
// centre of mass lies on the elbow axis (|τ| < 0.01 mN·m, the reference figure), the shoulder keeps only a small
// residual (reference 0.33–0.36 mN·m). Counterweights removed, the elbow load reappears (the reference control has
// 0.61·cos(A+B) mN·m).
const G=[0,-9.81,0];
const qmul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=q=>[-q[0],-q[1],-q[2],q[3]],rotq=(q,v)=>qmul(qmul(q,[...v,0]),conj(q)).slice(0,3);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
function evenhandHolds(r){
 const m=r.mechanism,jA=m.joints.find(j=>j.motor?.port==='A'),jB=m.joints.find(j=>j.motor?.port==='B');assert.ok(jA&&jB&&jA.type==='hinge'&&jB.type==='hinge','two motor hinges');
 assert.ok(r.track.every(f=>f.extra?.dynamics),'holding torque and mass properties recorded per frame');
 const distal=j=>{const d=new Set([j.body2]);let more=true;while(more){more=false;for(const k of m.joints)if(d.has(k.body1)&&!d.has(k.body2)){d.add(k.body2);more=true;}}return d;};
 check(distal(jA).has(jB.body1)&&distal(jA).has(jB.body2)&&!distal(jB).has(jA.body1),'serial chain: shoulder carries the elbow',{});
 const statics=(f,j)=>{const b1=m.bodies.find(b=>b.id===j.body1),fb=f.bodies[j.body1];
  const p=fb?add(fb.position,rotq(fb.rotation,rotq(conj(b1.rotation),sub(j.point,b1.position)))):j.point,a=fb?rotq(fb.rotation,rotq(conj(b1.rotation),j.axis)):j.axis;
  let tau=0;for(const id of distal(j)){const d=f.extra.dynamics.bodies[id];tau+=dot(a,cross(sub(d.com,p),G.map(x=>x*d.massKg)));}return -tau;};
 const stages=[...new Set(r.track.map(f=>String(vars(f).stage)))];const holds=[];
 for(const s of stages){const fr=r.track.filter(f=>f.phase==='program'&&String(vars(f).stage)===s);if(fr.length<20)continue;const tail=fr.slice(-16);// final 0.4 s of each authored 1.2 s hold
  holds.push({stage:s,targetDeg:[Number(vars(tail[0]).targetA),Number(vars(tail[0]).targetB)],rows:tail.map(f=>({angDeg:[jA,jB].map(j=>deg(f.joints[j.id].angle)),
   meas:[jA,jB].map(j=>f.extra.dynamics.joints[j.id]*1000),pred:[jA,jB].map(j=>statics(f,j)*1000)}))});}
 return{jA,jB,holds};
}
export function judgeEvenhand(r,{native=false}={}){
 healthy(r,native);assert.equal(r.mechanism.actuators.length,2);done(r,10);check(Number(vars(r.track.at(-1)).arrivals)===11,'all eleven authored arrivals',{arrivals:vars(r.track.at(-1)).arrivals});
 const o=observeAddon(r,'hub'),found=foundation(r,o),{jA,jB,holds}=evenhandHolds(r);
 check(holds.length===11,'eleven settled holds observed',{holds:holds.map(h=>h.stage)});
 // The forearm's observed attitude relative to the upper arm, from the bodies (not the encoder), must equal the elbow angle.
 const b1=r.mechanism.bodies.find(b=>b.id===jB.body1),b2=r.mechanism.bodies.find(b=>b.id===jB.body2);
 const ref=unit(inPlane(Math.abs(jB.axis[0])>.9?[0,0,1]:[1,0,0],unit(jB.axis))),relDeg=f=>{// forearm rotation relative to the upper arm, in the saved frame
  const d1=qmul(f.bodies[b1.id].rotation,conj(b1.rotation)),d2=qmul(f.bodies[b2.id].rotation,conj(b2.rotation)),v=rotq(qmul(conj(d1),d2),ref);
  return deg(Math.atan2(dot(unit(jB.axis),cross(ref,v)),dot(ref,v)));};
 let poseErr=0,bodyErr=0,lawErr=0,elbow=0,shoulderMin=Infinity,shoulderMax=-Infinity,predElbow=0;
 for(const h of holds)for(const x of h.rows){
  poseErr=Math.max(poseErr,...x.angDeg.map((v,k)=>Math.abs(v-h.targetDeg[k])));
  lawErr=Math.max(lawErr,...x.meas.map((v,k)=>Math.abs(v-x.pred[k])));
  elbow=Math.max(elbow,Math.abs(x.meas[1]));predElbow=Math.max(predElbow,Math.abs(x.pred[1]));shoulderMin=Math.min(shoulderMin,Math.abs(x.meas[0]));shoulderMax=Math.max(shoulderMax,Math.abs(x.meas[0]));}
 for(const f of r.track.filter(f=>f.phase==='program'))bodyErr=Math.max(bodyErr,Math.abs(relDeg(f)-deg(f.joints[jB.id].angle)));
 check(poseErr<=.5,'every authored pose reached and held',{poseErr});
 check(bodyErr<=.5,'the observed forearm body follows the elbow encoder',{bodyErr});
 check(lawErr<=.02,'each held motor torque equals the static gravity moment of its distal bodies',{lawErr});
 check(predElbow<.01&&elbow<.01,'counterbalanced forearm: the elbow holds no load at any pose',{elbow,predElbow});
 check(shoulderMin>=.32&&shoulderMax<=.37,'the shoulder keeps only its small reviewed residual',{shoulderMin,shoulderMax});
 return{law:'τ = −a·Σ(c−p)×mg at every hold; elbow balanced',holds:holds.length,maxTorqueLawErrorMNm:lawErr,maxElbowMNm:elbow,shoulderMNm:[shoulderMin,shoulderMax],poseErrDeg:poseErr,bodyErrDeg:bodyErr,...found};
}

export function p6DisconnectionLoss(id,r){
 // pinion removed: motor A still turns its axle, but nothing drives the racks.
 if(id==='paired-door-sync'){const m=r.mechanism,o=observeAddon(r,'base_runner_left'),jO=m.joints.find(j=>j.motor?.port==='A'),theta=unwrap(r.track.map(f=>f.joints[jO.id].angle));
  const racks=['rack_front','rack_back'].map(id=>{const s=m.joints.find(j=>j.type==='slider'&&ids(j).includes(o.body(id).id)&&ids(j).includes(o.base.id));return{id,u:unit(s?s.axis:[1,0,0]),p0:o.initial(id)};});
  const v=max(r.track.map((f,i)=>[f,i]),([f,i])=>Math.max(...racks.map(q=>Math.abs(Math.abs(dot(sub(o.point(f,q.id),q.p0),q.u))-PAIRED_DOOR_PITCH_M*Math.abs(theta[i]-theta[0])))))*1000;
  return{metric:'rackLawErrorMm',value:v,lost:v>2};}
 // the outer forearm counterweights removed: the elbow carries a gravity load again.
 if(id==='evenhand'){const {holds}=evenhandHolds(r);const v=holds.length?max(holds.flatMap(h=>h.rows),x=>Math.abs(x.meas[1])):NaN;return{metric:'maxElbowHoldingTorqueMNm',value:v,holds:holds.length,lost:v>.1};}
 throw new Error('No P6 disconnection measure for '+id);
}
