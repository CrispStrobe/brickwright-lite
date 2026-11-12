// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// RimRun judge (Q5, 2026-11-09): two free rollers of equal mass and equal rolling radius on one incline.
// Rolling without slip gives a = g·sinθ / (1 + I/(m·r²)), so the roller whose ballast sits nearer the axle
// (smaller I) accelerates faster. I, m and r are computed from the compiled model's own collider masses and
// shapes (the data the engine is given), never fitted to the motion; θ is the measured path's slope and is
// checked against the authored 6.842773° incline. Predictions judge the observed passive rollers; they never
// drive them. Failing assertions carry their measured values.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v)),scale=(a,s)=>a.map(x=>x*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const rotq=([x,y,z,w],v)=>{const t=scale(cross([x,y,z],v),2);return add(add(v,scale(t,w)),cross([x,y,z],t));};
const fmt=o=>JSON.stringify(o,(k,v)=>typeof v==='number'?+v.toPrecision(6):v);
const check=(ok,msg,values)=>assert.ok(ok,msg+' '+fmt(values));
const deg=x=>x*180/Math.PI;
const unwrap=a=>{let p=a[0],t=p;return a.map(v=>{t+=Math.atan2(Math.sin(v-p),Math.cos(v-p));p=v;return t;});};
// Jolt's BodyCreationSettings default damping (mLinearDamping = mAngularDamping = 0.05 /s): the compiled
// rollers set none, so the engine applies it. Rolling without slip with both damped at the same rate
// decelerates by exactly c·v, so the prediction over the window is g·sinθ/(1+β) − c·v̄ (v̄ its mean speed).
export const RIMRUN_ENGINE_DAMPING_PER_S=.05;
/** The authored incline: the frame's rotation in the supplied model (sin = 0.119145220618). */
export const RIMRUN_INCLINE_DEG=deg(Math.asin(0.119145220618));
/** Gates. The ratio bound is 2 % of the predicted ratio; the supplier measured 0.65 %. */
export const RIMRUN_GATES=Object.freeze({ratioRel:.02,accelRel:.05,inclineDeg:.3,slipRel:.03,leadMm:5,settleMmPerS:10,settleNetMm:1,caughtMinMm:250,fitMinFrames:10});
const LANES=Object.freeze({left:{wheels:['left_wheel_-1','left_wheel_1'],axle:'left_shaft_-1',ballast:/^left_ballast_/},right:{wheels:['right_wheel_-1','right_wheel_1'],axle:'right_shaft_-1',ballast:/^right_ballast_/}});

// Moment of inertia of one compiled collider about an axis through `c` (unit `a`), all in the body frame.
function colliderInertia(col,c,a){
 const m=col.massKg,q=col.rotation||[0,0,0,1],la=rotq([-q[0],-q[1],-q[2],q[3]],a);let own;
 if(col.shape==='box'){const[hx,hy,hz]=col.halfExtents;own=m/3*((hy*hy+hz*hz)*la[0]**2+(hx*hx+hz*hz)*la[1]**2+(hx*hx+hy*hy)*la[2]**2);}
 else if(col.shape==='cylinder'){const r=col.radius,h=2*col.halfHeight,ax=m*r*r/2,tr=m*(3*r*r+h*h)/12;own=ax*la[1]**2+tr*(1-la[1]**2);}
 else if(col.shape==='sphere'){own=.4*m*col.radius**2;}
 else throw new Error('RimRun judge: no inertia rule for collider shape '+col.shape);
 const d=sub(col.position||[0,0,0],c),perp=sub(d,scale(a,dot(d,a)));return own+m*dot(perp,perp);
}
/** The compiled model's prediction for one lane's roller. */
export function rimrunRollerModel(r,lane){
 const o=observeAddon(r),L=LANES[lane],b=o.body(L.wheels[0]);
 for(const id of [...L.wheels,L.axle])assert.equal(o.body(id).id,b.id,'lane '+lane+' is one free roller body ('+id+')');
 check(!r.mechanism.joints.some(j=>j.body1===b.id||j.body2===b.id),'the roller has no joint to anything (free on the track)',{lane,body:b.id});
 const a=unit(sub(o.initial(L.wheels[1]),o.initial(L.wheels[0]))),cols=b.colliders,m=cols.reduce((s,c)=>s+c.massKg,0);
 check(Math.abs(m-b.massKg)<=1e-9,'collider masses sum to the body mass',{m,massKg:b.massKg});
 const com=scale(cols.reduce((s,c)=>add(s,scale(c.position||[0,0,0],c.massKg)),[0,0,0]),1/m);
 const tyres=cols.filter(c=>L.wheels.includes(c.part)&&c.shape==='cylinder');assert.equal(tyres.length,2,'two tyre cylinders');
 const radius=tyres[0].radius;check(Math.abs(tyres[1].radius-radius)<1e-12,'equal tyres',{radii:tyres.map(t=>t.radius)});
 const I=cols.reduce((s,c)=>s+colliderInertia(c,com,a),0),ballast=cols.filter(c=>L.ballast.test(c.part));
 const ballastRadius=ballast.length?Math.sqrt(ballast.reduce((s,c)=>{const d=sub(c.position||[0,0,0],com),p=sub(d,scale(a,dot(d,a)));return s+c.massKg*dot(p,p);},0)/ballast.reduce((s,c)=>s+c.massKg,0)):null;
 return{lane,body:b,axis:a,massKg:m,inertia:I,radius,beta:I/(m*radius*radius),ballastRadius};
}
// Axle path and roll angle per frame; the downhill direction is taken over the free-rolling window only.
function laneTrack(r,o,model){
 const L=LANES[model.lane],ref=unit(cross(model.axis,Math.abs(model.axis[1])<.9?[0,1,0]:[1,0,0]));
 const path=r.track.map(f=>o.point(f,L.axle)),roll=unwrap(r.track.map(f=>o.angle(f,L.wheels[0],model.axis,ref)));
 return{path,roll:roll.map(v=>v-roll[0])};
}
const along=(tr,i0,i1)=>{const u=unit(sub(tr.path[i1],tr.path[i0]));return{u,s:tr.path.map(p=>dot(sub(p,tr.path[0]),u))};};
const fitQuadratic=(t,s)=>{ // least squares s = c0 + c1 t + c2 t²/2
 const n=t.length,X=t.map(x=>[1,x,x*x/2]),A=[0,1,2].map(i=>[0,1,2].map(j=>X.reduce((q,row)=>q+row[i]*row[j],0))),bv=[0,1,2].map(i=>X.reduce((q,row,k)=>q+row[i]*s[k],0));
 for(let i=0;i<3;i++){const p=A[i][i];for(let j=i+1;j<3;j++){const f=A[j][i]/p;for(let k=i;k<3;k++)A[j][k]-=f*A[i][k];bv[j]-=f*bv[i];}}
 const c=[0,0,0];for(let i=2;i>=0;i--){c[i]=(bv[i]-[0,1,2].slice(i+1).reduce((q,k)=>q+A[i][k]*c[k],0))/A[i][i];}
 const res=Math.sqrt(s.reduce((q,v,k)=>q+(v-(c[0]+c[1]*t[k]+c[2]*t[k]*t[k]/2))**2,0)/n);const tm=t.reduce((a,b)=>a+b,0)/n;return{accel:c[2],meanSpeed:c[1]+c[2]*tm,resid:res,n};
};
// The fit window (2026-11-10). The rollers cross a joint between two abutting 320 LDU track tiles every 128 mm;
// the tiles are exactly coplanar, but Jolt's internal-edge contact there costs each roller about 0.0085 m/s
// (natively and in the browser alike). A quadratic fit over a window holding such a crossing reads several
// percent low depending only on where the crossing falls, so each lane is fitted from gate clearance to its
// first tile joint: one tile, no crossing.
//  - Gate clearance: the first frame after the last frame in which the engine reports the gate body in contact
//    with either roller (WereBodiesInContact, recorded per frame as `contacts`), and no such contact from there
//    to the catches. Determined from the engine's contacts, never from a time or a program stage.
//  - Tile segments: from the compiled colliders of the lane's track tiles (`track_<lane>_*`), projected on the
//    lane's downhill path at the frame's initial pose. A window never crosses a tile end.
//  - At least RIMRUN_GATES.fitMinFrames frames per lane (10: at the registry's 20 ms frameMs, 0.18 s, which
//    at the window's 0.4–0.5 m/s is 80–90 mm of the 128 mm tile, enough for a three-term fit with seven spare
//    degrees of freedom; fewer frames are refused, not fitted).
const contactsOf=f=>f.contacts??f.extra?.contacts;
export function rimrunGateClearance(r,endIndex){
 const jG=r.mechanism.joints.find(j=>j.motor?.port==='A');assert.ok(jG,'the gate motor joint');
 const o=observeAddon(r),gate=jG.body2===o.base.id?jG.body1:jG.body2,rollers=new Set(['left','right'].map(l=>o.body(LANES[l].wheels[0]).id));
 check(!rollers.has(gate),'the gate is not a roller',{gate});
 // A frame without contact pairs (the browser's paused first snapshot, taken before the observation starts)
 // counts as touching: unknown never admits a window. At least one frame must show the gate holding a roller.
 const touching=f=>{const c=contactsOf(f);if(c==null)return null;check(Array.isArray(c),'engine contact pairs',{t:f.t});return c.some(([a,b])=>(a===gate&&rollers.has(b))||(b===gate&&rollers.has(a)));};
 let last=-1,seen=false,known=0;for(let i=0;i<endIndex;i++){const x=touching(r.track[i]);if(x!==null)known++;if(x===true)seen=true;if(x!==false)last=i;}
 check(seen,'the engine reports the gate holding the rollers before it opens',{last});
 check(known>=endIndex-1,'engine contact pairs recorded on every frame after the first',{known,endIndex});
 const clear=last+1;check(clear<endIndex,'the gate clears both rollers before the catches',{clear,endIndex});
 return{index:clear,gate,lastContactT:r.track[last].t,clearT:r.track[clear].t};
}
export function rimrunTileBounds(r,o,lane,u,origin){
 const frame=o.base,b=r.mechanism.bodies.find(x=>x.id===frame.id),pose=r.track[0].bodies[frame.id];
 const tiles=b.colliders.filter(c=>new RegExp('^track_'+lane+'_').test(c.part)&&c.shape==='box');
 check(tiles.length>0,'the lane has compiled track tiles',{lane});
 const inv=q=>[-q[0],-q[1],-q[2],q[3]],toWorld=v=>add(rotq(pose.rotation,rotq(inv(b.rotation),v)),[0,0,0]);
 const ends=[];for(const c of tiles){const centre=add(toWorld(sub(c.position,b.position)),pose.position),q=c.rotation||[0,0,0,1];
  const axes=[[1,0,0],[0,1,0],[0,0,1]].map(e=>toWorld(rotq(q,e))),reach=axes.reduce((s2,a,i)=>s2+c.halfExtents[i]*Math.abs(dot(a,u)),0),mid=dot(sub(centre,origin),u);ends.push(mid-reach,mid+reach);}
 return [...ends].sort((a,b2)=>a-b2).filter((v,i,a)=>i===0||v-a[i-1]>1e-6);
}
/** Measure both lanes: each over its own tile from gate clearance, before either roller meets a catch shoe. */
export function rimrunMeasure(r){
 const o=observeAddon(r),models=['left','right'].map(l=>rimrunRollerModel(r,l)),tracks=models.map(m=>laneTrack(r,o,m));
 const shoes=r.mechanism.joints.filter(j=>j.type==='slider'),contactAt=r.track.findIndex(f=>shoes.some(j=>Math.abs(f.joints[j.id].position??0)>2e-4));
 const opened=r.track.findIndex(f=>String(f.extra?.variables?.stage)==='2');
 check(opened>0,'the program reaches the open hold',{opened});check(contactAt>opened,'the rollers run free before any catch shoe moves',{opened,contactAt});
 const clearance=rimrunGateClearance(r,contactAt);
 const lanes=models.map((m,k)=>{
  const tr0=tracks[k],dir=unit(sub(tr0.path[contactAt-1],tr0.path[clearance.index])),origin=tr0.path[0];
  const bounds=rimrunTileBounds(r,o,m.lane,dir,origin),pos=i=>dot(sub(tr0.path[i],origin),dir);
  const s0=pos(clearance.index),hi=bounds.find(b=>b>s0),lo=[...bounds].reverse().find(b=>b<=s0);
  check(hi!==undefined&&lo!==undefined,'the roller is on a track tile at gate clearance',{lane:m.lane,s0,bounds});
  const idx=[];for(let i=clearance.index;i<contactAt&&pos(i)<hi;i++)idx.push(i);
  check(idx.every(i=>pos(i)>=lo&&pos(i)<hi),'the fit window stays on one tile',{lane:m.lane});
  check(idx.length>=RIMRUN_GATES.fitMinFrames,'enough frames on one tile after gate clearance to fit',{lane:m.lane,frames:idx.length,min:RIMRUN_GATES.fitMinFrames});
  const t=idx.map(i=>r.track[i].t/1000),tr={...tr0,...along(tr0,idx[0],idx.at(-1))},fit=fitQuadratic(t,idx.map(i=>tr.s[i]));
  const inclineDeg=deg(Math.asin(Math.max(-1,Math.min(1,-tr.u[1])))),g=norm(r.mechanism.gravity),predicted=g*Math.sin(inclineDeg*Math.PI/180)/(1+m.beta)-RIMRUN_ENGINE_DAMPING_PER_S*fit.meanSpeed;
  const last=idx.at(-1),slip=Math.abs(tr.s[last]-tr.s[idx[0]]-m.radius*Math.abs(tr.roll[last]-tr.roll[idx[0]]))/Math.abs(tr.s[last]-tr.s[idx[0]]);
  const leadAt=contactAt-2,sAtEnd=dot(sub(tr0.path[leadAt],tr0.path[0]),unit(sub(tr0.path[leadAt],tr0.path[clearance.index])));
  return{lane:m.lane,massKg:m.massKg,inertia:m.inertia,radius:m.radius,beta:m.beta,ballastRadius:m.ballastRadius,inclineDeg,accel:fit.accel,predicted,meanSpeed:fit.meanSpeed,fitResidMm:fit.resid*1000,slip,sAtEndMm:sAtEnd*1000,
   window:{from:r.track[idx[0]].t,to:r.track[last].t,frames:idx.length,tile:[lo,hi],fromS:pos(idx[0]),toS:pos(last)}};});
 return{lanes,window:{clearance:clearance.clearT,lastGateContact:clearance.lastContactT,left:lanes[0].window,right:lanes[1].window,contactAt:r.track[contactAt].t},o};
}
function foundation(r,o){
 const frames=r.track.filter(f=>f.phase!=='cold'),f0=frames[0],b0=f0.bodies[o.base.id].position;
 const horizontalMm=Math.max(...frames.map(f=>Math.hypot(f.bodies[o.base.id].position[0]-b0[0],f.bodies[o.base.id].position[2]-b0[2])*1000)),tiltDeg=Math.max(...frames.map(f=>o.tilt(f)));
 check(horizontalMm<=2&&tiltDeg<=2,'upright stationary chassis in world coordinates',{horizontalMm,tiltDeg});return{horizontalMm,tiltDeg};
}
export function judgeRimRun(r,{native=false}={}){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(r.finishedAt>0,'the actual VM finishes');
 assert.ok(r.track.length>=(native?300:100),'dense actual motion recording');
 for(const f of r.track)for(const b of Object.values(f.bodies))assert.ok([...b.position,...b.rotation].every(Number.isFinite));
 assert.ok(r.mechanism.bodies.filter(b=>b.motion==='static').every(b=>b.id==='ground'),'only the floor is fixed');
 assert.equal(r.mechanism.actuators.length,1,'only the gate motor');
 const v=r.track.at(-1).extra.variables;check(Number(v.completed)===1&&Number(v.failed)===0&&String(v.stage)==='4','program completes without fault',{completed:v.completed,failed:v.failed,stage:v.stage});
 const {lanes,window,o}=rimrunMeasure(r),found=foundation(r,o),G_=RIMRUN_GATES;
 check(Math.abs(lanes[0].massKg-lanes[1].massKg)<=1e-9&&Math.abs(lanes[0].radius-lanes[1].radius)<=1e-12,'equal mass and equal rolling radius (the design premise)',{mass:lanes.map(l=>l.massKg),radius:lanes.map(l=>l.radius)});
 check(lanes.every(l=>l.ballastRadius!==null),'both rollers carry ballast',{ballast:lanes.map(l=>l.ballastRadius)});
 const inner=lanes[0].ballastRadius<lanes[1].ballastRadius?0:1,outer=1-inner;
 check(lanes[outer].ballastRadius-lanes[inner].ballastRadius>.005,'one ballast sits measurably nearer the axle',{ballastRadius:lanes.map(l=>l.ballastRadius)});
 for(const l of lanes){check(Math.abs(l.inclineDeg-RIMRUN_INCLINE_DEG)<=G_.inclineDeg,'the roller runs down the authored incline',{lane:l.lane,inclineDeg:l.inclineDeg,authored:RIMRUN_INCLINE_DEG});
  check(l.slip<=G_.slipRel,'rolling without slip: travel = r·angle',{lane:l.lane,slip:l.slip});
  check(Math.abs(l.accel/l.predicted-1)<=G_.accelRel,'each roller accelerates at g·sinθ/(1+I/mr²) less the engine damping c·v̄',{lane:l.lane,accel:l.accel,predicted:l.predicted});}
 const ratio=lanes[inner].accel/lanes[outer].accel,predictedRatio=lanes[inner].predicted/lanes[outer].predicted;
 check(Math.abs(ratio/predictedRatio-1)<=G_.ratioRel,'inner/outer acceleration ratio matches the predicted ratio',{ratio,predictedRatio});
 const leadMm=lanes[inner].sAtEndMm-lanes[outer].sAtEndMm;check(leadMm>=G_.leadMm,'the inner-ballast roller leads before the catches',{leadMm});
 // Catch and settle: the program ends 0.5 s after the gate returns, while a late roller may still be rebounding off
 // its spring shoe (measured: 32 mm/s 40 ms after the finish, under 2 mm/s within 200 ms). Rest is judged over the
 // final second of the after-run: both rollers held in their catches, not at the instant the program stops.
 const after=r.track.filter(f=>f.phase==='after'),last=after.filter(f=>f.t>=after.at(-1).t-1000);
 check(after.length&&after.at(-1).t-after[0].t>=1500&&last.length>=10,'an after-run long enough to judge the catch',{afterMs:after.length?after.at(-1).t-after[0].t:0});
 const settleMmPerS=Math.max(...['left','right'].flatMap(l=>last.slice(1).map((f,i)=>norm(sub(o.point(f,LANES[l].axle),o.point(last[i],LANES[l].axle)))/((f.t-last[i].t)/1000)*1000)));
 const settleNetMm=Math.max(...['left','right'].map(l=>norm(sub(o.point(last.at(-1),LANES[l].axle),o.point(last[0],LANES[l].axle)))*1000));
 const caughtMm=['left','right'].map(l=>norm(sub(o.point(last.at(-1),LANES[l].axle),o.point(r.track[0],LANES[l].axle)))*1000);
 check(settleMmPerS<=G_.settleMmPerS&&settleNetMm<=G_.settleNetMm,'after the program both rollers rest in their catches',{settleMmPerS,settleNetMm});
 check(caughtMm.every(d=>d>=G_.caughtMinMm),'both rollers end down the track at the catches, not back at the gate',{caughtMm});
 return{law:'a = g·sinθ/(1+I/(m·r²)); inner ballast leads',innerLane:lanes[inner].lane,ratio,predictedRatio,leadMm,settleMmPerS,settleNetMm,caughtMm,window,lanes:lanes.map(({lane,massKg,inertia,radius,beta,ballastRadius,inclineDeg,accel,predicted,meanSpeed,fitResidMm,slip})=>({lane,massKg,inertia,radius,beta,ballastRadius,inclineDeg,accel,predicted,meanSpeed,fitResidMm,slip})),...found};
}
// Disconnection: every ballast part removed from both rollers. The rollers become identical, so the lead the
// intact model predicts (ratio 1.0778 from its colliders) must vanish: the measured ratio falls below the
// midpoint between 1 and that prediction.
export const RIMRUN_INTACT_PREDICTED_RATIO=1.0778;
export function rimrunDisconnectionLoss(id,r){
 if(id!=='rimrun')throw new Error('No RimRun disconnection measure for '+id);
 const {lanes}=rimrunMeasure(r),value=Math.max(lanes[0].accel,lanes[1].accel)/Math.min(lanes[0].accel,lanes[1].accel);
 return{metric:'accelRatio',value,lost:value<1+(RIMRUN_INTACT_PREDICTED_RATIO-1)/2};
}
