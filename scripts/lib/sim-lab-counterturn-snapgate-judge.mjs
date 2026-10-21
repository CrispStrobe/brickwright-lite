// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Predictions only judge recorded native poses; they never drive the simulation.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=a=>Math.hypot(...a),unit=a=>a.map(x=>x/norm(a)),deg=a=>a*180/Math.PI;
const span=a=>Math.max(...a)-Math.min(...a),mean=a=>a.reduce((s,x)=>s+x,0)/a.length,max=(a,key)=>Math.max(...a.map(x=>x[key])),min=(a,key)=>Math.min(...a.map(x=>x[key]));
const unwrap=xs=>{let last=xs[0],total=last;return xs.map(x=>{total+=Math.atan2(Math.sin(x-last),Math.cos(x-last));last=x;return total;});};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],rotate=(q,v)=>{const u=q.slice(0,3),t=cross(u,v).map(x=>2*x),w=cross(u,t);return v.map((x,i)=>x+q[3]*t[i]+w[i]);};
const worldVector=(b,f,v)=>rotate(f.bodies[b.id].rotation,rotate(b.rotation.map((x,i)=>i<3?-x:x),v));
const baseYaw=(o,f)=>{const v=worldVector(o.base,f,[1,0,0]);return deg(Math.atan2(v[2],v[0]));};
function finite(r){assert.ok(r.finishedAt,'finite program completes');assert.deepEqual(r.unsupported,[]);assert.equal(r.mechanism.actuators.length,1);assert.equal(r.mechanism.actuators[0].port,'A');for(const f of r.track)for(const p of Object.values(f.bodies))assert.ok([...p.position,...p.rotation].every(Number.isFinite));}
export function measureCounterturn(r){
 const o=observeAddon(r,'yaw_base'),motor=r.mechanism.joints.find(j=>j.motor),yaw=unwrap(r.track.map(f=>o.angle(f,'yaw_platform',[0,1,0],[1,0,0]))).map(deg),rotor=unwrap(r.track.map(f=>o.angle(f,'g20',[0,1,0],[1,0,0]))).map(deg);
 return r.track.map((f,i)=>({t:f.t,encoder:deg(f.joints[motor.id].angle),speed:deg(f.joints[motor.id].velocity),yaw:yaw[i]-yaw[0],beta:rotor[i]-rotor[0]-yaw[i]+yaw[0],gapMm:o.gap(f),tiltDeg:o.tilt(f),baseMm:norm(sub(f.bodies[o.base.id].position,r.track[0].bodies[o.base.id].position))*1000,shaftTiltDeg:deg(Math.asin(Math.min(1,Math.abs(o.vector(f,'g12',motor.axis)[1])))),baseYaw:baseYaw(o,f)}));
}
export function judgeCounterturn(id,r,{gain,locked=false}={}){
 finite(r);assert.equal(r.issues.length,8);assert.ok(r.issues.every(i=>i.code==='gear-not-on-hinge'&&i.parts.length===1&&/^ballast_[xz]_[+-]?1_[01]$/.test(i.parts[0])));
 const a=measureCounterturn(r);assert.ok(a.length>=500);assert.ok(r.finishedAt<35000);assert.ok(r.mechanism.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'));assert.equal(r.mechanism.couplings.length,1);
 assert.ok(span(a.map(x=>x.encoder))>1439&&Math.abs(a.at(-1).encoder)<=1);assert.ok(span(a.map(x=>x.beta))>=360);
 const ratio=span(a.map(x=>x.beta))/span(a.map(x=>x.encoder));assert.ok(Math.abs(ratio/.6-1)<=.01,'physical bevel ratio');assert.ok(Math.max(...a.map(x=>Math.abs(x.beta-.6*x.encoder)))<=2,'physical bevel phase');
 assert.ok(max(a,'gapMm')<=1&&max(a,'tiltDeg')<=.5&&max(a,'baseMm')<=2&&max(a,'shaftTiltDeg')<=.1&&Math.max(...a.map(x=>Math.abs(x.baseYaw)))<=.5,'freestanding frame, level shaft and closed hinges');
 const forward=a.filter(x=>x.speed>30),reverse=a.filter(x=>x.speed< -30);assert.ok(forward.length>=100&&reverse.length>=100);
 const yawSpan=span(a.map(x=>x.yaw));
 if(locked)assert.ok(yawSpan<=1,'physical brace locks only the carrier');else{
  assert.ok(yawSpan>=30,'useful passive counterturn');assert.ok(Math.abs(a.at(-1).yaw)<=5,'carrier returns');assert.ok(span(a.filter(x=>x.t<=5000).map(x=>x.yaw))<=.2,'coast startup remains stable');
  const active=a.filter(x=>Math.abs(x.speed)>30),opposite=active.filter(x=>x.yaw*x.beta<0).length/active.length;assert.ok(opposite>=.99);
  if(gain!==undefined){assert.ok(Number.isFinite(gain)&&gain>0&&gain<1);const fitted=-a.reduce((s,x)=>s+x.beta*x.yaw,0)/a.reduce((s,x)=>s+x.beta*x.beta,0);assert.ok(Math.abs(fitted/gain-1)<=.03,'independently measured native inertia gain');assert.ok(Math.max(...a.map(x=>Math.abs(x.yaw+gain*x.beta)))<=5,'complete predicted trajectory');}
 }
 let momentumResidual;
 if(!locked&&r.track.every(f=>f.extra?.momentum)){const sums=r.track.map(f=>Object.values(f.extra.momentum).reduce((s,L)=>s+L[1],0)),scale=Math.max(...r.track.map(f=>Object.values(f.extra.momentum).reduce((s,L)=>s+Math.abs(L[1]),0)));momentumResidual=Math.max(...sums.map(x=>Math.abs(x-sums[0])))/scale;assert.ok(momentumResidual<=.02,'fixed-origin native vertical momentum');}
 return{pieces:r.runModel.parts.length,yawSpanDeg:yawSpan,relativeRotorSpanDeg:span(a.map(x=>x.beta)),ratio,returnYawDeg:a.at(-1).yaw,hingeGapMm:max(a,'gapMm'),gain,momentumResidual};
}
// Frozen source points, with the design's 1 mm axial eye-plane clearance applied
// to the corresponding points on the unchanged pivot axes. No fitted dimensions.
const sourcePoints={O:['sun_shaft',[80,0,0]],M:['sun_shaft',[80,0,60]],X:['sun_shaft',[80,0,-100]],Y:['sun_shaft',[80,100,0]],A:['spring_cylinder',[-20,-40,0]],AI:['input_arm_-60',[60,120,100]],P:['spring_rod',[0,0,0]],R:['rocker',[0,40,0]],RP:['rocker',[0,40,40]],C0:['spring_cylinder',[0,0,0]]};
export function measureSnapgate(r){
 const o=observeAddon(r,'sun_shaft'),motor=r.mechanism.joints.find(j=>j.motor),slider=r.mechanism.joints.find(j=>j.type==='slider'&&j.spring),parts=new Map(r.runModel.parts.map(p=>[p.id,p]));assert.ok(slider);
 const points=Object.fromEntries(Object.entries(sourcePoints).map(([id,[part,p]])=>{const R=parts.get(part).rotation,delta=['O','M','X','Y','AI','R','RP'].includes(id)?[0,1,2].map(i=>-2.5*R[3+i]):[0,0,0];return[id,[part,p.map((x,i)=>x+delta[i])]];}));
 const placedVector=(part,local)=>unit(sub(o.initial(part,local),o.initial(part,[0,0,0])));
 const rows=r.track.map(f=>{
  const P=id=>o.point(f,...points[id]),O=P('O'),M=P('M'),A=P('A'),AI=P('AI'),rod=P('P'),R=P('R'),RP=P('RP'),C0=P('C0'),X=unit(sub(P('X'),O)),Y=unit(sub(P('Y'),O)),angle=v=>deg(Math.atan2(dot(v,Y),dot(v,X))),axes=[[1,0,0],[0,1,0],[0,0,1]].map(v=>unit(o.vector(f,'spring_cylinder',placedVector('spring_cylinder',v)))),q=sub(rod,C0).map((_,i)=>dot(sub(rod,C0),axes[i])*1000),h=q[1]+16,nativeH=64-Math.abs(f.joints[slider.id].position-slider.spring.restM)*1000,encoder=deg(f.joints[motor.id].angle),input=angle(sub(AI,M)),out=angle(sub(RP,R));
  const normal=unit(o.vector(f,'rocker',placedVector('rocker',[0,1,0]))),side=unit(o.vector(f,'rocker',placedVector('rocker',[1,0,0]))),beamCentre=R.map((x,i)=>x+o.vector(f,'rocker',[0,-.017,0])[i]);
  const gaps=['stop_bush_-40','stop_bush_40'].map(part=>{const axis=unit(o.vector(f,part,placedVector(part,[0,0,1]))),c=dot(side,axis),support=3.6*Math.sqrt(Math.max(0,1-c*c))+4*Math.abs(c);return Math.abs(dot(sub(o.point(f,part,[0,0,0]),beamCentre),side))*1000-3.6-support;});
  return{t:f.t,phase:f.phase,stage:Number(f.extra?.variables?.stage??-1),cycle:Number(f.extra?.variables?.cycle??-1),busy:f.busy.A,input,out,encoder,h,nativeH,transverse:Math.hypot(q[0],q[2]),anchorClosure:norm(sub(A,AI))*1000,eyeClosure:norm(sub(rod,RP))*1000,axisClosure:norm(sub(R,O))*1000,radiusInput:Math.abs(norm(sub(AI,M))*1000-96),radiusOutput:Math.abs(norm(sub(RP,R))*1000-16),endpointError:Math.abs(Math.sqrt(Math.max(0,(norm(sub(RP,AI))*1000)**2-64))-h),phaseError:Math.abs(input-1.875+encoder/24),gapMm:o.gap(f),axisGapDeg:o.axisGap(f),baseMm:norm(sub(f.bodies[o.base.id].position,r.track[0].bodies[o.base.id].position))*1000,tiltDeg:o.tilt(f),baseYaw:Math.abs(baseYaw(o,f)),outputPlaneError:Math.abs(dot(sub(RP,O),unit(cross(X,Y))))*1000,outputAxisTilt:deg(Math.acos(Math.min(1,Math.abs(dot(normal,unit(cross(X,Y))))))),frameOrthogonality:Math.abs(dot(X,Y)),stopPenetration:Math.max(0,...gaps.map(x=>-x)),activeStopGap:Math.min(...gaps.map(Math.abs)),anchor:AI,normal};
 });
 for(let i=0;i<rows.length;i++){const dt=i?(rows[i].t-rows[i-1].t)/1000:0;for(const k of ['input','out'])rows[i][k+'Speed']=dt?(rows[i][k]-rows[i-1][k])/dt:0;}
 return rows;
}
export function judgeSnapgate(id,r,{fine=false,cold=false}={}){
 finite(r);assert.equal(r.issues.length,2);const notes=r.issues.map(i=>i.parts.slice().sort().join('|')).sort();assert.deepEqual(notes,[['stop_upper_bearing','stop_upper_bearing_pin_-60','stop_upper_bearing_pin_60'].sort().join('|'),['worm_wheel_bearing_-65','worm_wheel_bearing_pin_-120_-70','worm_wheel_bearing_pin_-80_-70'].sort().join('|')].sort());
 const a=measureSnapgate(r),program=a.filter(x=>x.phase!=='cold');assert.ok(a.length>=(fine?6000:600));assert.ok(r.finishedAt<58000);assert.ok(span(program.map(x=>x.encoder))>=860);assert.ok(Math.abs(program.at(-1).encoder)<=1.5);assert.ok(max(a,'phaseError')<=.5,'source worm phase');
 const guards={baseYaw:1,outputPlaneError:.8,outputAxisTilt:2,frameOrthogonality:1e-8,gapMm:.8,axisGapDeg:2,baseMm:1,tiltDeg:1,anchorClosure:.8,eyeClosure:.8,axisClosure:.8,radiusInput:.8,radiusOutput:.8,transverse:.8,endpointError:.8,stopPenetration:1.5};for(const[k,limit]of Object.entries(guards))assert.ok(max(a,k)<=limit,`${k}=${max(a,k)} > ${limit}`);
 assert.ok(min(a,'h')>=49&&max(a,'h')<=63&&span(a.map(x=>x.h))>=4,'useful spring compression stroke');assert.ok(Math.max(...a.map(x=>Math.abs(x.h-x.nativeH)))<=.3,'native spring coordinate matches actual eye geometry');
 // Fine native qualification requires >=3 measured transition samples. Browser
 // worker batches can cross the whole band between two observed poses: they
 // establish a duration upper bound and a secant speed, never a peak waveform.
 // Program variables select time windows only; each angle is independently observed.
 const holds=[],snaps=[];
 for(let cycle=1;cycle<=2;cycle++){
  const states=[];
  for(const stage of [2,4]){let s=program.filter(x=>x.cycle===cycle&&x.stage===stage&&!x.busy&&Math.abs(x.encoder-45)<=1.5);const end=s.at(-1)?.t;s=s.filter(x=>x.t>=end-500);assert.ok(s.length>=(fine?100:14),'half-second physical memory hold');assert.ok(max(s,'input')<=.5&&min(s,'input')>=-.5);assert.ok(span(s.map(x=>x.out))<=.5);const out=mean(s.map(x=>x.out));assert.ok(Math.abs(out)>=16&&Math.abs(Math.abs(out)-19.23533)<=3);assert.ok(max(s,'stopPenetration')<=1&&max(s,'activeStopGap')<=1);states.push({cycle,stage,out,input:mean(s.map(x=>x.input)),anchor:[0,1,2].map(i=>mean(s.map(x=>x.anchor[i])))});}
  assert.ok(states[0].out>16&&states[1].out< -16&&states[0].out-states[1].out>=32,'opposite memory at same input');assert.ok(Math.abs(states[0].input-states[1].input)<=.25&&norm(sub(states[0].anchor,states[1].anchor))*1000<=.5);holds.push(...states);
  for(const stage of [1,3]){const s=program.filter(x=>x.cycle===cycle&&x.stage===stage),direction=stage===1?1:-1;assert.ok(span(s.map(x=>x.input))>=16.5);const crosses=s.map((x,i)=>i&&s[i-1].out*direction<0&&x.out*direction>=0?i:-1).filter(i=>i>=0);assert.equal(crosses.length,1,'one directed snap per outward leg');const c=crosses[0],level=.8*19.23533;let lo=c,hi=c;while(lo>0&&s[lo].out*direction> -level)lo--;while(hi<s.length-1&&s[hi].out*direction<level)hi++;assert.ok(lo<c&&(fine?hi>c:hi>=c)&&s[lo].out*direction<=-level&&s[hi].out*direction>=level);const duration=(s[hi].t-s[lo].t)/1000,transition=s.slice(lo,hi+1),peak=Math.max(...transition.map(x=>Math.abs(x.outSpeed))),inputPeak=Math.max(...transition.map(x=>Math.abs(x.inputSpeed)));assert.ok(duration<=.25&&transition.length>=(fine?3:2)&&peak>=30&&peak/inputPeak>=5,'fast passive switch');assert.ok(Math.abs(s[c].input+direction*14.51097)<=4,'source-derived trigger');snaps.push({cycle,stage,...(fine?{durationSeconds:duration,peakSpeedDps:peak}:{durationUpperBoundSeconds:duration,observedSecantSpeedDps:peak}),observations:transition.length,triggerInputDeg:s[c].input});}
 }
 for(const stage of [2,4])assert.ok(Math.abs(holds.find(x=>x.stage===stage&&x.cycle===1).out-holds.find(x=>x.stage===stage&&x.cycle===2).out)<=1,'repeatable memory');
 if(cold){const s=a.filter(x=>x.phase==='cold');assert.ok(s.length>=101&&s.at(-1).t>=500);assert.ok(span(s.map(x=>x.input))<=.5&&span(s.map(x=>x.encoder))<=1&&Math.max(...s.map(x=>Math.abs(x.out+17)))<=8);assert.ok(Math.abs(s.at(-1).inputSpeed)<=1&&Math.abs(s.at(-1).outSpeed)<=5);const tail=a.filter(x=>x.t>=a.at(-1).t-100);assert.ok(Math.abs(mean(tail.map(x=>x.out))-s.at(-1).out)<=1.5,'returns to cold-settled source state');}
 return{pieces:r.runModel.parts.length,holds:holds.map(({anchor,...h})=>h),snaps,shockRangeMm:[min(a,'h'),max(a,'h')],hingeGapMm:max(a,'gapMm'),stopPenetrationMm:max(a,'stopPenetration')};
}
export const judgeCounterturnSnapgate=(id,r)=>id==='counterturn'?judgeCounterturn(id,r):judgeSnapgate(id,r);
