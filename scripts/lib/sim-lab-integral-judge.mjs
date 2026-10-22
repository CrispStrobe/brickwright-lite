// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reconstruct rotation from body poses, independently of the input encoders.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const slope=(x,y)=>{const mx=mean(x),my=mean(y);return x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/x.reduce((s,v)=>s+(v-mx)**2,0);};
const unwrap=values=>{let prev=values[0],total=prev;return values.map(v=>{total+=Math.atan2(Math.sin(v-prev),Math.cos(v-prev));prev=v;return total;});};
const degrees=r=>r*180/Math.PI;
export function measureIntegral(r){
 const o=observeAddon(r),wheel=o.body('outputWheel'),disc=o.body('platter');
 const a=unwrap(r.track.map(f=>o.angle(f,'platter',[0,1,0],[0,0,1])));
 const b=unwrap(r.track.map(f=>o.angle(f,'outputWheel',[0,0,1],[0,1,0])));
 const rows=r.track.map((f,i)=>{const w=o.point(f,'outputWheel'),d=o.point(f,'platter');return {t:f.t,disc:a[i],wheel:b[i],x:w[2]-d[2],z:d[0]-w[0],phase:Number(f.extra?.variables?.phase),load:f.extra?.rolling?.[wheel.id]?.load};});
 let integral=0;
 for(let i=0;i<rows.length;i++){
  if(i)integral+=(rows[i].x+rows[i-1].x)/2*(rows[i].disc-rows[i-1].disc)/.028;
  rows[i].residual=degrees(rows[i].wheel-rows[0].wheel-integral-(rows[i].z-rows[0].z)/.028);
 }
 return {o,wheel,disc,rows};
}
export function judgeIntegral(_id,r,{contact=false}={}){
 assert.deepEqual(r.unsupported,[]);
 // These two inherited multi-pin joints form rigid frame/platter assemblies.
 const inherited=[['01_base.ldr#13_36','01_base.ldr#13_37','01_base.ldr#13_38','01_base.ldr#13_39','bearing'],['06_platter.ldr#27_10','06_platter.ldr#27_11','06_platter.ldr#27_12','06_platter.ldr#27_13','06_platter.ldr#27_16','06_platter.ldr#27_17','06_platter.ldr#27_18','06_platter.ldr#27_19']];
 assert.equal(r.issues.length,2);
 r.issues.forEach((issue,i)=>{assert.equal(issue.code,'locked-hinges');assert.deepEqual([...issue.parts].sort(),[...inherited[i]].sort());});
 assert.deepEqual(r.mechanism.actuators.map(a=>a.port),['A','B']);
 assert.equal(r.runModel.parts.length,155);
 const {o,wheel,disc,rows}=measureIntegral(r);
 assert.ok(!r.mechanism.actuators.some(a=>{const j=r.mechanism.joints.find(j=>j.id===a.joint);return [j.body1,j.body2].includes(wheel.id);}), 'output has no motor');
 for(const c of r.mechanism.couplings)assert.ok(!JSON.stringify(c).includes('"'+wheel.id+'"'),'output has no imposed rotation coupling');
 assert.ok(r.finishedAt && r.finishedAt-(r.start||0)<45000,'finite program completes within 45 simulated seconds');
 const last=r.track.at(-1).extra.variables;
 assert.equal(Number(last.complete),1);assert.equal(Number(last.fault),0);
 const slider=r.mechanism.joints.find(j=>j.type==='slider');
 for(const f of r.track){
  for(const pose of Object.values(f.bodies))assert.ok([...pose.position,...pose.rotation].every(Number.isFinite));
  assert.ok(f.joints[slider.id].position>=slider.limits[0]&&f.joints[slider.id].position<=slider.limits[1],'carriage stays within physical travel');
  const v=f.extra.variables;
  if([1,2,3,4,9].includes(Number(v.phase))){const B=r.mechanism.actuators.find(a=>a.port==='B');assert.ok(Math.abs(degrees(f.joints[B.joint].angle)-Number(v.targetB))<=2,'actual B angle meets the unchanged program guard');}
 }
 const plateaus=[1,2,3,4].map(phase=>{
  const all=rows.filter(s=>s.phase===phase);assert.ok(all.length>100,'six-second station recorded');
  assert.ok(all.at(-1).t-all[0].t>=5900,'full station retained');
  const a=all.filter(s=>s.t>=all[0].t+1000);assert.ok(a.length>50);
  const times=a.map(s=>s.t/1000),ds=slope(times,a.map(s=>s.disc)),ws=slope(times,a.map(s=>s.wheel)),ratio=ws/ds,x=mean(a.map(s=>s.x));
  assert.ok(ds>0,'platter keeps the same rotation direction');
  assert.ok(a.slice(1).every((s,i)=>s.disc-a[i].disc>=-1e-6),'platter never reverses at a station');
  if(phase===3){assert.ok(Math.abs(ratio)<=.2,'near-neutral output');assert.ok(Math.abs(x)<=.003,'near-centre wheel');}
  else{const sign=phase===4?-1:1;assert.ok(sign*ratio>=.1,'passive output follows the signed radius');assert.ok(sign*x>=(phase===2?.008:.02),'actual radial position');}
  const loadFraction=contact?a.filter(s=>Number.isFinite(s.load)&&s.load>0).length/a.length:null;
  if(contact)assert.ok(loadFraction>=.9,'positive native load for at least 90% of station samples');
  return {phase,ratio,radiusMm:x*1000,contactFraction:loadFraction};
 });
 assert.ok(plateaus[0].ratio>plateaus[1].ratio,'half-radius output is slower');
 return {plateaus,endpointResidualDegrees:rows.at(-1).residual,maxResidualDegrees:Math.max(...rows.map(s=>Math.abs(s.residual))),finishedMs:r.finishedAt-(r.start||0)};
}
