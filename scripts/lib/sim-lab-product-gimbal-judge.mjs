// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Independent pose observations. Formulae are predictions, never simulator inputs.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const DEG=180/Math.PI,sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),unit=a=>a.map(v=>v/norm(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const aa=(v,t)=>[...v.map(x=>x*Math.sin(t/2)),Math.cos(t/2)],qError=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(a,b)/(norm(a)*norm(b)))))*DEG;
const span=a=>Math.max(...a)-Math.min(...a),vars=f=>f.extra?.variables||f.variables||{};
const close=(actual,want,limit,message)=>assert.ok(Math.abs(actual-want)<=limit,`${message}: ${actual} vs ${want} ±${limit}`);

export function measureProduct(r){
 const o=observeAddon(r,'base_main_front'),A=r.mechanism.joints.find(j=>j.motor?.port==='A');
 const basePart=r.runModel.parts.find(p=>p.id==='hub'); // authored hub axes are identity
 const x=unit(sub(o.initial('hub',[1,0,0]),o.initial('hub'))),y=unit(sub(o.initial('hub',[0,0,1]),o.initial('hub')));
 assert.ok(basePart);const origin=A.point;
 return r.track.map(f=>{
  const get=id=>sub(o.point(f,id),origin).map(v=>v*1000);
  const a=dot(get('a_marker'),y),b=dot(get('b_stage_crossbar_neg'),x),output=dot(get('output_marker'),y);
  return {t:f.t,a,b,output,error:output-a*b/88,phase:Number(vars(f).phase),moving:Number(vars(f).moving)};
 });
}
export function judgeProduct(r){
 assert.ok(r.finishedAt>0&&r.finishedAt<75000,'Product: finite program');assert.deepEqual(r.issues,[]);
 const rows=measureProduct(r),worst=Math.max(...rows.map(s=>Math.abs(s.error))),travel=span(rows.map(s=>s.output));
 assert.ok(worst<=1,`Product: y=a*b/88 throughout the run, error ${worst} mm`);
 assert.ok(travel>=24,`Product: useful passive output span ${travel} mm`);
 const cells=[[24,32],[24,40],[24,48],[0,48],[0,40],[0,32],[-24,32],[-24,40],[-24,48],[-24,32],[0,32],[0,48],[24,48],[24,32],[0,40]];
 const held=cells.map(([a,b],i)=>{
  const frames=rows.filter(s=>s.phase===i+1&&s.moving===0);assert.ok(frames.length>=10,`Product cell ${i+1}: settled samples`);
  for(const f of frames){close(f.a,a,.8,'actual factor a');close(f.b,b,.8,'actual factor b');}
  return frames.at(-1);
 });
 for(const [low,high,a]of [[0,2,24],[5,3,0],[6,8,-24]]){
  const gain=(held[high].output-held[low].output)/(held[high].b-held[low].b);close(gain,a/88,.05,'Product: signed held-a gain');
 }
 const final=vars(r.track.at(-1));assert.equal(Number(final.complete),1);assert.equal(Number(final.fault),0);
 return {productErrorMm:worst,outputSpanMm:travel,settledCells:held.length};
}

export function measureGimbal(r){
 const m=r.mechanism,bodies=new Map(m.bodies.map(b=>[b.id,b])),J=Object.fromEntries(m.joints.filter(j=>j.motor).map(j=>[j.motor.port,j]));
 assert.deepEqual(Object.keys(J).sort(),['A','B','C']);
 const base=bodies.get(J.A.body1),output=m.bodies.find(b=>b.parts.includes('marker_primary'));
 assert.equal(J.A.body2,J.B.body1);assert.equal(J.B.body2,J.C.body1);assert.equal(J.C.body2,output.id);
 return r.track.map(f=>{
  const axis=j=>unit(rot(mul(f.bodies[j.body1].rotation,conj(bodies.get(j.body1).rotation)),j.axis));
  const angles=Object.fromEntries(Object.entries(J).map(([p,j])=>[p,f.joints[j.id].angle])),axes=Object.fromEntries(Object.entries(J).map(([p,j])=>[p,axis(j)]));
  const baseDelta=mul(f.bodies[base.id].rotation,conj(base.rotation));
  const ideal=mul(mul(mul(mul(baseDelta,aa(J.A.axis,angles.A)),aa(J.B.axis,angles.B)),aa(J.C.axis,angles.C)),output.rotation);
  return {stage:Number(vars(f).stage),angles,axisDot:dot(axes.A,axes.C),det:dot(axes.A,cross(axes.B,axes.C)),error:qError(f.bodies[output.id].rotation,ideal),local:mul(conj(f.bodies[base.id].rotation),f.bodies[output.id].rotation)};
 });
}
export function judgeGimbal(r){
 assert.ok(r.finishedAt>0&&r.finishedAt<180000);assert.deepEqual(r.issues,[]);assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,4);assert.equal(r.mechanism.joints.length,3);
 const rows=measureGimbal(r),worst=Math.max(...rows.map(s=>s.error));assert.ok(worst<=1,`Gimbal: actual orientation law error ${worst}°`);
 for(const f of rows)close(Math.abs(f.det),Math.abs(Math.cos(f.angles.B)),.02,'Gimbal: Jacobian determinant');
 const stage=n=>{const samples=rows.filter(s=>s.stage===n);assert.ok(samples.length>=20,`Gimbal display ${n}: sufficient samples`);return samples.at(-1);};
 for(const [base,a,c,b]of [[10,11,12,0],[20,21,22,60],[30,31,32,90]]){
  const zero=stage(base),yaw=stage(a),roll=stage(c);
  for(const f of [zero,yaw,roll]){close(Math.abs(f.angles.B)*DEG,b,1,'Gimbal: middle pitch');if(b===0)assert.ok(Math.abs(f.axisDot)<.02);if(b===90)assert.ok(Math.abs(f.axisDot)>.999);}
  assert.ok(Math.abs(yaw.angles.A-zero.angles.A)*DEG>=15);assert.ok(Math.abs(roll.angles.C-zero.angles.C)*DEG>=15);
  for(const p of ['B','C'])close(yaw.angles[p]*DEG,zero.angles[p]*DEG,1,'A-only holds '+p);
  for(const p of ['A','B'])close(roll.angles[p]*DEG,zero.angles[p]*DEG,1,'C-only holds '+p);
 }
 const locked=stage(30),cancelled=stage(33),cancellation=qError(locked.local,cancelled.local);
 for(const p of ['A','C'])assert.ok(Math.abs(cancelled.angles[p]-locked.angles[p])*DEG>=15,'Both inputs move during cancellation');
 assert.ok(cancellation<=1,`Gimbal: actual cancellation ${cancellation}°`);
 for(const n of [40,99])for(const a of Object.values(stage(n).angles))close(a*DEG,0,1,'Gimbal: home');
 const final=vars(r.track.at(-1));assert.equal(Number(final.completed),1);assert.equal(Number(final.failed),0);
 return {orientationErrorDeg:worst,cancellationDeg:cancellation,lockedAxisDot:locked.axisDot};
}
