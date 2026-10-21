// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// These fresh diagnostic cores are NEVER advanced. Actual program execution is
// a separate SimSession and receives none of the unit diagnostic velocities.
import{catalogFrom,prepareModel,SimSession}from'../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import{loadJolt,createPhysicsCore}from'../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import{HubState}from'./spike-arena-vm.mjs';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export async function counterturnInertia(modelText,catalog){
 const p=prepareModel(modelText,catalog,{mat:'plain'}),J=await loadJolt(),origin=p.runModel.parts.find(p=>p.id==='yaw_base').position.map((x,i)=>x*(i?-.0004:.0004)),rotor=p.mechanism.bodies.find(b=>b.parts.includes('g20'));
 const tensors=core=>Object.fromEntries(p.mechanism.bodies.filter(b=>b.motion==='dynamic').map(b=>{
  const cols=[0,1,2].map(k=>{const w=[0,0,0];w[k]=1;core.setBodyVelocity(b.id,[0,0,0],w);return core.bodyAngularMomentum(b.id);}),tensor=[0,1,2].map(i=>cols.map(c=>c[i]));
  core.setBodyVelocity(b.id,[1,0,0],[0,0,0]);const L0=core.bodyAngularMomentum(b.id,[0,0,0]),Lz=core.bodyAngularMomentum(b.id,[0,0,1]),mass=L0[1]-Lz[1];
  core.setBodyVelocity(b.id,[0,1,0],[0,0,0]);const Ly=core.bodyAngularMomentum(b.id,[0,0,0]),com=[Ly[2]/mass,-L0[2]/mass,L0[1]/mass],r=com.map((x,i)=>x-origin[i]);
  core.setBodyVelocity(b.id,[0,0,0],[0,0,0]);return[b.id,{mass,com,tensor,yawInertia:tensor[1][1]+mass*(dot(r,r)-r[1]**2)}];
 }));
 const measure=m=>{const c=createPhysicsCore(J,m,{stepHz:200});try{return tensors(c);}finally{c.destroy();}};
 const shape=structuredClone(p.mechanism);shape.couplings=[];shape.gears=[];const shapeTensors=measure(shape),floorTensors=measure(p.mechanism),hub=new HubState();hub.setSimulationEnabled(true);const session=new SimSession({...p,hubState:hub,catalog,mat:'plain',J});let augmentedTensors;try{augmentedTensors=tensors(session.core);}finally{session.dispose();}
 const base=p.mechanism.bodies.find(b=>b.parts.includes('yaw_base')),gain=t=>t[rotor.id].yawInertia/Object.entries(t).filter(([id])=>id!==base.id).reduce((s,[,x])=>s+x.yawInertia,0),shapeGain=gain(shapeTensors),nativeGain=gain(augmentedTensors);
 const verticalMotorAddition=Object.keys(floorTensors).reduce((s,id)=>s+Math.abs(augmentedTensors[id].tensor[1][1]-floorTensors[id].tensor[1][1]),0),total=Math.max(...Object.keys(floorTensors).map(id=>[0,1,2].reduce((s,i)=>s+augmentedTensors[id].tensor[i][i]-floorTensors[id].tensor[i][i],0)));
 return{origin,shapeTensors,floorTensors,augmentedTensors,shapeGain,nativeGain,gainDivergenceFraction:nativeGain/shapeGain-1,reflectedVerticalLeakageFraction:verticalMotorAddition/total};
}
