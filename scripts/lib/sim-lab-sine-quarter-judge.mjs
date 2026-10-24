// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions judge observed, passive bodies; they never drive their poses.
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
export function judgeSineShuttle(r,{native=false}={}){
 healthy(r,native);assert.ok(r.finishedAt<91000);assert.equal(r.mechanism.actuators.length,1);
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,4);assert.equal(r.mechanism.joints.filter(j=>j.type==='slider').length,2);assert.equal(r.mechanism.joints.filter(j=>j.type==='hinge').length,2);
 const o=observeAddon(r),ex=unit(sub(o.initial('guide_x_-100',[20,0,0]),o.initial('guide_x_-100'))),ez=unit(sub(o.initial('guide_z_20',[20,0,0]),o.initial('guide_z_20'))),j=r.mechanism.joints.find(j=>j.motor?.port==='A');
 assert.equal(new Set(['hub','crank','yoke_end_-100','follower_cross'].map(id=>o.body(id).id)).size,4);
 const first=r.track[0],Y0=o.point(first,'yoke_end_-100'),F0=o.point(first,'follower_cross'),rel0=sub(F0,Y0);
 const phases=unwrap(r.track.map(f=>{const v=sub(o.point(f,'crank',[0,0,40]),o.point(f,'crank'));return Math.atan2(dot(v,ez),dot(v,ex));}));
 const rows=r.track.map((f,i)=>{
  const O=o.point(f,'crank'),C=sub(o.point(f,'crank',[0,0,40]),O),Y=o.point(f,'yoke_end_-100'),F=o.point(f,'follower_cross'),y=sub(Y,O),v=sub(F,O),dy=sub(Y,Y0),df=sub(sub(F,Y),rel0),a=f.joints[j.id].angle,theta=phases[i];
  return{t:f.t,phase:f.phase,stage:Number(f.extra.variables.stage),a:deg(a),x:dot(y,ex)*1000,z:dot(v,ez)*1000,
   yokeLawMm:Math.abs(dot(y,ex)*1000-16*Math.cos(theta)),followerLawMm:Math.hypot(dot(v,ex)*1000-16*Math.cos(theta),dot(v,ez)*1000-16*Math.sin(theta)),
   radiusMm:Math.abs(norm(C)*1000-16),phaseDeg:Math.abs(deg(theta+a)),yokeTransverseMm:norm(sub(dy,ex.map(x=>x*dot(dy,ex))))*1000,
   followerTransverseMm:norm(sub(df,ez.map(x=>x*dot(df,ez))))*1000,
   orientationDeg:Math.max(...['yoke_end_-100','follower_cross'].flatMap(id=>[ex,ez].map(axis=>deg(Math.acos(Math.min(1,Math.max(-1,dot(o.vector(f,id,axis),axis)))))))),
   yokeReturnMm:norm(sub(Y,Y0))*1000,followerReturnMm:norm(sub(F,F0))*1000};
 });
 const vars=r.track.at(-1).extra.variables,last=rows.at(-1);assert.equal(Number(vars.completed),1);assert.equal(Number(vars.failed),0);assert.equal(Number(vars.stage),4);
 const legs=[1,2,3].map(stage=>{const a=rows.filter(f=>f.stage===stage&&f.phase!=='cold');assert.ok(a.length>0);return{stage,travelDeg:span(a.map(x=>x.a)),yokeStrokeMm:span(a.map(x=>x.x)),followerStrokeMm:span(a.map(x=>x.z))};});
 for(const [i,l]of legs.entries()){assert.ok(l.travelDeg>[350,710,1070][i],'complete input legs');assert.ok(l.yokeStrokeMm>=31&&l.yokeStrokeMm<=33&&l.followerStrokeMm>=31&&l.followerStrokeMm<=33,'useful passive strokes');}
 const errors=Object.fromEntries(['yokeLawMm','followerLawMm','radiusMm','phaseDeg','yokeTransverseMm','followerTransverseMm','orientationDeg'].map(k=>[k,max(rows,x=>x[k])]));
 for(const k of ['yokeLawMm','followerLawMm','yokeTransverseMm','followerTransverseMm'])assert.ok(errors[k]<=.5,k);
 assert.ok(errors.radiusMm<=.25&&errors.phaseDeg<=1&&errors.orientationDeg<=1,'radius, phase and slider orientation');
 assert.ok(last.yokeReturnMm<=.5&&last.followerReturnMm<=.5&&Math.abs(last.a)<=1.5,'both passive outputs return in 3D');
 assert.ok(Math.min(...rows.map(x=>x.a))>=-5&&Math.max(...rows.map(x=>x.a))<=1085,'qualified motor envelope');
 const cross=(a,level,dir)=>{for(let i=1;i<a.length;i++){const p=a[i-1],q=a[i];if(dir<0?p.x>level&&q.x<=level:p.x<level&&q.x>=level)return p.t+(q.t-p.t)*(level-p.x)/(q.x-p.x);}return NaN;};
 const timing=(stage,lo,hi)=>{const a=rows.filter(x=>x.stage===stage&&x.a>=lo&&x.a<=hi),out=cross(a,-8,-1)-cross(a,8,-1),back=cross(a,8,1)-cross(a,-8,1),mean=(out+back)/2;assert.ok(Number.isFinite(mean)&&out>0&&back>0&&Math.abs(out-back)/mean<=.1,'symmetric measured central strokes');return{outMs:out,backMs:back,meanMs:mean};};
 const slow=timing(1,0,360),fast=timing(2,720,1080),ratio=slow.meanMs/fast.meanMs;assert.ok(ratio>=2.7&&ratio<=3.3,'measured 3:1 timing ratio');
 return{legs,errors,slow,fast,ratio,returnMm:[last.yokeReturnMm,last.followerReturnMm],foundation:foundation(r,o)};
}
export function judgeQuartermaster(r,{native=false}={}){
 healthy(r,native);assert.ok(r.finishedAt<119000);assert.equal(r.mechanism.actuators.length,2);assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,5);assert.equal(r.mechanism.joints.length,4);assert.ok(r.mechanism.joints.every(j=>j.type==='hinge'));
 const o=observeAddon(r),output=o.body('output_spine_Z'),j=r.mechanism.joints.find(j=>!j.motor&&j.body2===output.id);
 assert.ok(j);assert.ok(!r.mechanism.actuators.some(a=>a.joint===j.id),'output wheel is passive');
 const a=unwrap(r.track.map(f=>o.angle(f,'output_spine_Z',j.axis,[0,0,1]))).map(deg),rows=r.track.map((f,i)=>({t:f.t,stage:Number(f.extra.variables.stage),wheel:a[i]}));
 const vars=r.track.at(-1).extra.variables;assert.equal(Number(vars.done),1);assert.equal(Number(vars.fault),0);assert.equal(Number(vars.stage),99);
 const stations=[];for(let cycle=1;cycle<=8;cycle++){
  const after=cycle<=4?-90*cycle:-360+90*(cycle-4),before=cycle<=4?after+90:after-90;
  for(const substage of [1,2,3,4,5,6])assert.ok(rows.some(x=>x.stage===cycle*10+substage),'all actual indexing substages');
  const settled=rows.filter(x=>x.stage===cycle*10+6),dwell=rows.filter(x=>[cycle*10+1,cycle*10+5,cycle*10+6].includes(x.stage));
  assert.ok(Math.abs(settled.at(-1).wheel-after)<=2,'independently observed quarter-turn station');
  for(const f of dwell){const target=f.stage%10===1?before:after;assert.ok(Math.abs(f.wheel-target)<=2,'latched dwell retains the wheel');}
  const drift=span(settled.map(x=>x.wheel));assert.ok(drift<=1,'held dwell drift');stations.push({cycle,targetDeg:after,actualDeg:settled.at(-1).wheel,dwellDriftDeg:drift});
 }
 assert.ok(span(a)>=355&&span(a)<=365,'wheel makes a full forward and reverse turn');assert.ok(Math.abs(a.at(-1))<=2,'wheel returns to saved station');
 for(const port of ['A','B']){const m=r.mechanism.joints.find(j=>j.motor?.port===port),values=r.track.map(f=>deg(f.joints[m.id].angle));assert.ok(span(values)>=(port==='A'?1435:44));assert.ok(Math.abs(values.at(-1))<=1,'final motor target');}
 return{stations,rangeDeg:[Math.min(...a),Math.max(...a)],returnDeg:a.at(-1),foundation:foundation(r,o)};
}
