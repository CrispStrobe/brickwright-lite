// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// The program drives only the inputs. Observe the passive geometric mean
// from physical part-local points in the foundation frame, never reporters.
import assert from 'node:assert/strict';
import {observeAddon} from './sim-lab-addon-judge.mjs';
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=a=>Math.hypot(...a);
const unit=a=>a.map(x=>x/norm(a)),span=a=>Math.max(...a)-Math.min(...a);
export function measureRootBridge(r){
 // The repaired single-stud feet use the foundation's adjacent stud grid.
 // The foundation is shifted +10 LDU in X; the linkage datum stays at X=0.
 const o=observeAddon(r,'foundation_0'),origin=o.initial('foundation_0',[10,-404,-10]);
 const X=unit(sub(o.initial('foundation_0',[10,-404,-9]),origin));
 const Z=unit(sub(o.initial('foundation_0',[9,-404,-10]),origin));
 const project=p=>[dot(sub(p,origin),X)*1000,dot(sub(p,origin),Z)*1000];
 return r.track.map(f=>{
  const A=project(o.point(f,'a_marker',[0,0,20])),B=project(o.point(f,'b_marker',[0,0,20])),C=project(o.point(f,'height_marker'));
  const a=-A[0],b=B[0],h=C[1];
  const guides=['left_key','right_key'].map(id=>{
   const P=project(o.point(f,id)),Q=project(o.point(f,id,[20,0,0])),v=sub(Q,P),w=sub(C,P);
   return {v,offset:Math.abs(v[0]*w[1]-v[1]*w[0])/norm(v)};
  });
  const stopOverrun=Math.max(0,...r.mechanism.joints.filter(j=>j.type==='slider'&&j.limits).flatMap(j=>[j.limits[0]-f.joints[j.id].position,f.joints[j.id].position-j.limits[1]]))*1000;
  return {t:f.t,variables:f.extra?.variables||f.extra||{},a,b,h,error:Math.abs(h-Math.sqrt(a*b)),gap:o.gap(f),axis:o.axisGap(f),stopOverrun,
   center:Math.max(Math.abs(C[0]),Math.abs(A[1]),Math.abs(B[1])),
   guideError:Math.max(...guides.map(g=>g.offset)),
   orthogonalError:Math.asin(Math.min(1,Math.abs(dot(guides[0].v,guides[1].v))/(norm(guides[0].v)*norm(guides[1].v))))*180/Math.PI};
 });
}
export function judgeRootBridge(r){
 assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);
 if(r.vmErrors)assert.deepEqual(r.vmErrors,[]);
 assert.equal(r.mechanism.actuators.length,2);
 assert.equal(r.mechanism.joints.filter(j=>j.type==='slider').length,5);
 assert.equal(r.mechanism.bodies.filter(b=>b.motion==='dynamic').length,11);
 assert.ok(r.finishedAt>80000&&r.finishedAt<115000,'The finite input-only program completes');
 const rows=measureRootBridge(r);assert.ok(rows.length>=1500);
 const max=key=>Math.max(...rows.map(s=>s[key]));
 assert.ok(rows.every(s=>[s.a,s.b,s.h,s.error,s.center,s.guideError,s.orthogonalError].every(Number.isFinite)&&s.a>0&&s.b>0&&s.h>0));
 assert.ok(max('error')<=1,`Physical geometric mean error ${max('error')} mm`);
 assert.ok(max('center')<=1,`Physical center error ${max('center')} mm`);
 assert.ok(max('guideError')<=1,`Physical guide intersection error ${max('guideError')} mm`);
 assert.ok(max('orthogonalError')<=1,`Physical right-angle error ${max('orthogonalError')} degrees`);
 assert.ok(max('gap')<=1&&max('axis')<=1,'Physical bearings remain closed and aligned');
 assert.ok(max('stopOverrun')<=.2,'Physical sliders respect the source half-LDU stop tolerance');
 const targets=[[24,24],[24,32],[24,40],[32,40],[40,40],[40,32],[40,24],[32,24],[32,32],[25.6,40],[40,25.6],[32,32],[24,40],[40,24],[32,32]];
 const cells=targets.map(([a,b],i)=>{
  const all=rows.filter(s=>Number(s.variables.phase)===i+1),end=all.at(-1)?.t;
  const settled=all.filter(s=>s.t>=end-700);assert.ok(settled.length>=10,`Cell ${i+1}: settled observations`);
  assert.ok(settled.every(s=>Math.abs(s.a-a)<=.8&&Math.abs(s.b-b)<=.8),`Cell ${i+1}: physical inputs reach ${a}, ${b}`);
  return {a,b,h:settled.reduce((sum,s)=>sum+s.h,0)/settled.length};
 });
 assert.ok(span(cells.map(s=>s.h))>=12,'The passive output covers the source working range');
 const last=rows.at(-1);assert.equal(Number(last.variables.completed),1);assert.equal(Number(last.variables.failed),0);
 assert.ok(Math.abs(last.a-32)<=.8&&Math.abs(last.b-32)<=.8,'Both inputs return to center');
 return {heightErrorMm:max('error'),guideErrorMm:max('guideError'),rightAngleErrorDeg:max('orthogonalError'),cells,finishedMs:r.finishedAt};
}
