// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Read-only instrumentation: call the unchanged native step exactly once with
// its original arguments, then record that step's real rope impulses/velocity.
// No pose, force, friction, motor command, timestep or solver setting is changed.
import assert from 'node:assert/strict';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=v=>Math.hypot(...v),scale=(v,s)=>v.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const rotate=([x,y,z,w],v)=>{
 const t=[2*(y*v[2]-z*v[1]),2*(z*v[0]-x*v[2]),2*(x*v[1]-y*v[0])];
 return [v[0]+w*t[0]+y*t[2]-z*t[1],v[1]+w*t[1]+z*t[0]-x*t[2],v[2]+w*t[2]+x*t[1]-y*t[0]];
};
export function installRopeForceObserver(session,vm){
 const core=session.core,ropes=session.mechanism.couplings.filter(c=>c.kind==='rope');
 assert.equal(ropes.length,4,'Four direct ropes required for force observation');
 assert.ok(ropes.every(r=>r.points.length===1&&r.hook.body===ropes[0].hook.body),'Direct ropes must act on one actual payload body');
 const payload=ropes[0].hook.body,buffer=[];
 const point=p=>{const q=core.bodyPose(p.body);return add(q.position,rotate(q.rotation,p.local));};
 const original=core.step;
 let calls=0;
 core.step=function(...args){
  assert.equal(args.length,1,'Preserve native core.step call signature');
  assert.ok(Math.abs(args[0]-.005)<1e-12,'Observe exactly one existing5ms bridge step per call');
  const start=core.time,anchors=ropes.map(r=>point(r.points[0])),hook=point(ropes[0].hook);
  const velocityBefore=core.bodyLinearVelocity(payload);
  const vars=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value])));
  const returned=Reflect.apply(original,this,args);
  const end=core.time;
  assert.ok(Math.abs(end-start-.005)<1e-10,'Native call must advance exactly one unchanged physics step');
  const state=core.ropeState(),velocityAfter=core.bodyLinearVelocity(payload);
  assert.equal(state.length,4);
  buffer.push({startMs:start*1000,tMs:end*1000,dtSeconds:args[0],stage:Number(vars.stage),arrived:Number(vars.arrived),
   anchorsBeforeM:anchors,hookBeforeM:hook,tensionsN:state.map(s=>s.tension),velocityBeforeMps:velocityBefore,velocityAfterMps:velocityAfter});
  calls++;
  return returned;
 };
 return {drain:()=>buffer.splice(0),calls:()=>calls,payloadBody:payload};
}

export function judgeRopeImpulses(run,{windowMs=500,relativeResidualLimit,minimumSideWeightFraction,verticalSupportRange,linearDampingPerSecond}){
 const failures=[],gate=(ok,message)=>{if(!ok)failures.push(message);};
 const steps=run.track.flatMap(f=>(f.extra?.forceSteps||[]).map(s=>({...s,phase:f.phase})));
 const ropes=run.mechanism.couplings.filter(c=>c.kind==='rope'),payload=run.mechanism.bodies.find(b=>b.id===ropes[0]?.hook.body);
 const gravity=run.mechanism.gravity,weight=payload?.massKg*norm(gravity||[]),up=gravity?scale(gravity,-1/norm(gravity)):[];
 gate(steps.length>0&&Number.isFinite(weight)&&weight>0,'Real full-rate rope impulse observations and a positive native payload weight are required');
 if(!steps.length||!(weight>0))return {failures,metrics:null};
 gate(Number.isFinite(linearDampingPerSecond)&&linearDampingPerSecond>=0,'Native linear damping coefficient is finite and nonnegative');
 gate(steps.every(s=>Math.abs(s.dtSeconds-.005)<1e-12&&Math.abs(s.tMs-s.startMs-5)<1e-6),'Every rope force observation covers one unchanged5ms native step');
 gate(Math.abs(steps[0].startMs)<1e-6&&steps.every((s,i)=>!i||Math.abs(s.startMs-steps[i-1].tMs)<1e-6),'Force sampling starts at time zero with no missing or duplicate physics intervals');
 gate(Math.abs(steps.at(-1).tMs-run.track.at(-1).t)<5.0001,'Full-rate force observation reaches the final native frame');
 gate(steps.every(s=>[s.startMs,s.tMs,s.dtSeconds,...s.hookBeforeM,...s.anchorsBeforeM.flat(),...s.tensionsN,...s.velocityBeforeMps,...s.velocityAfterMps].every(Number.isFinite)&&s.tensionsN.every(t=>t>=0)),'All full-rate rope forces, geometry and velocities are finite and tensions nonnegative');
 const idx={left:[],right:[]};
 ropes.forEach((r,i)=>{if(r.parts[0].startsWith('left_'))idx.left.push(i);else if(r.parts[0].startsWith('right_'))idx.right.push(i);});
 gate(idx.left.length===2&&idx.right.length===2,'Full-rate force evidence contains two ropes per actual winch side');
 const stages=[];
 for(let stage=0;stage<6;stage++){
  const all=steps.filter(s=>s.phase==='program'&&s.stage===stage&&s.arrived===1);
  const end=all.at(-1)?.tMs??-Infinity,start=end-windowMs;
  // Select complete5ms intervals whose whole duration lies in the final window.
  const window=all.filter(s=>s.startMs>=start-1e-6&&s.tMs<=end+1e-6);
  const duration=window.reduce((s,r)=>s+r.dtSeconds,0);
  gate(window.length===Math.round(windowMs/5)&&Math.abs(duration-windowMs/1000)<1e-9,'Stage '+stage+' has every5ms interval in the complete final force window');
  if(!window.length){stages.push({stage,steps:0});continue;}
  let ropeImpulse=[0,0,0],dragImpulse=[0,0,0];
  const sideImpulse={left:[0,0,0],right:[0,0,0]},zeroRun={left:0,right:0},longestZeroRun={left:0,right:0};
  for(const s of window){
   // Jolt applies gravity first, then v *= (1-c*dt). This correction
   // reconstructs existing drag; it does not change any native setting.
   const freeVelocity=add(s.velocityBeforeMps,scale(gravity,s.dtSeconds));
   dragImpulse=add(dragImpulse,scale(freeVelocity,-payload.massKg*linearDampingPerSecond*s.dtSeconds));
   const impulse=s.tensionsN.map((t,i)=>{
    const d=sub(s.anchorsBeforeM[i],s.hookBeforeM),length=norm(d);
    return scale(d,t*s.dtSeconds/length);
   });
   for(const v of impulse)ropeImpulse=add(ropeImpulse,v);
   for(const side of ['left','right']){
    const sum=idx[side].reduce((a,i)=>add(a,impulse[i]),[0,0,0]);
    sideImpulse[side]=add(sideImpulse[side],sum);
    zeroRun[side]=idx[side].every(i=>s.tensionsN[i]<=1e-8)?zeroRun[side]+s.dtSeconds*1000:0;
    longestZeroRun[side]=Math.max(longestZeroRun[side],zeroRun[side]);
   }
  }
  const gravityImpulse=scale(gravity,payload.massKg*duration);
  const momentumChange=scale(sub(window.at(-1).velocityAfterMps,window[0].velocityBeforeMps),payload.massKg);
  const residual=sub(add(add(ropeImpulse,gravityImpulse),dragImpulse),momentumChange),weightImpulse=weight*duration;
  const relativeResidual=norm(residual)/weightImpulse;
  const verticalSupportFraction=dot(ropeImpulse,up)/weightImpulse;
  const sideFractions=Object.fromEntries(['left','right'].map(side=>[side,dot(sideImpulse[side],up)/weightImpulse]));
  gate(relativeResidual<=relativeResidualLimit,'Stage '+stage+' rope/gravity/drag impulse agrees with observed payload momentum within preregistered relative bound');
  gate(verticalSupportFraction>=verticalSupportRange[0]&&verticalSupportFraction<=verticalSupportRange[1],'Stage '+stage+' vertical rope impulse supplies near-weight support within the preregistered band');
  gate(['left','right'].every(side=>sideFractions[side]>=minimumSideWeightFraction),'Stage '+stage+' both winch sides supply the preregistered minimum upward weight impulse');
  stages.push({stage,steps:window.length,startMs:window[0].startMs,endMs:end,durationMs:duration*1000,
   ropeImpulseNs:ropeImpulse,gravityImpulseNs:gravityImpulse,dragImpulseNs:dragImpulse,momentumChangeNs:momentumChange,residualNs:residual,
   weightImpulseNs:weightImpulse,relativeResidual,verticalSupportFraction,sideUpwardWeightFractions:sideFractions,longestZeroRunMs:longestZeroRun});
 }
 return {failures,metrics:{physicsIntervals:steps.length,physicsDurationMs:steps.at(-1).tMs,payloadBody:payload.id,payloadMassKg:payload.massKg,gravityMps2:gravity,payloadWeightN:weight,
  method:'Post-call observations of every unchanged native5ms step; pre-step real anchor/tie geometry, post-step Jolt impulse/dt, and actual world COM velocities',
  windowMs,relativeResidualLimit,verticalSupportRange,minimumSideWeightFraction,linearDampingPerSecond,
  zeroRunScope:'Diagnostic only; no continuous individual or side-pair positive-tension claim',stages}};
}
