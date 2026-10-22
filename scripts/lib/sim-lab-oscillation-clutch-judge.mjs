// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),scale=(a,s)=>a.map(x=>x*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w];
const rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),carry=(p,b,v)=>add(p.position,rot(mul(p.rotation,conj(b.rotation)),sub(v,b.position)));
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,body=(m,id)=>{const b=m.bodies.find(b=>b.parts.includes(id));assert.ok(b,id);return b;};
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
// Actual orientation, relative to the chassis. Neither the encoder nor the gear constraint supplies this observation.
const physicalSpin=(track,base,b,axis)=>{
 const zero=mul(conj(base.rotation),b.rotation),a=rot(conj(base.rotation),axis);let last=0,total=0;
 return track.map(f=>{const q=mul(mul(conj(f.bodies[base.id].rotation),f.bodies[b.id].rotation),conj(zero));const now=2*Math.atan2(dot(q.slice(0,3),a),q[3]);total+=wrap(now-last);last=now;return total;});
};
export const judgeOscillationClutchRun=(id,r)=>{
 const{mechanism:m,track,hubId}=r;assert.deepEqual(r.issues,[]);assert.deepEqual(r.unsupported,[]);assert.ok(track.length>300);
 const base=body(m,'hub');assert.equal(base.id,hubId);
 for(const f of track){
  const p=f.bodies[hubId];assert.ok(rot(mul(p.rotation,conj(base.rotation)),[0,1,0])[1]>.985,'upright base');
  for(const b of Object.values(f.bodies)){assert.ok([...b.position,...b.rotation].every(Number.isFinite));assert.ok(Math.hypot(...sub(b.position,p.position))<.8);}
 }
 assert.ok(Object.values(track.at(-1).busy).every(x=>!x),'all motor runs finish');
 const drive=m.actuators.find(a=>a.port==='A').joint;
 if(id==='pendulum-array'){
  assert.ok(Math.abs(track.at(-1).joints[drive].angle)<.06,'support returns after two opposite half turns');
  const input=m.joints.find(j=>j.id===drive),rotor=m.bodies.find(b=>b.id===(input.body1===base.id?input.body2:input.body1));
  const held=[];let group=[];
  for(const f of track){if(!f.busy.A&&Math.abs(f.joints[drive].velocity)<.02)group.push(f);else{if(group.length>60)held.push(group);group=[];}}
  if(group.length>60)held.push(group);assert.equal(held.length,2,'two motor-excited free oscillation windows');
  const results=[];
  for(const [n,length] of [[0,.048],[1,.096],[2,.080]]){
   const b=body(m,`arm${n}`),j=m.joints.find(j=>j.type==='hinge'&&[j.body1,j.body2].includes(b.id));
   const c=b.colliders.find(c=>c.part===`arm${n}`&&c.shape==='box'),center=add(b.position,rot(b.rotation,c.position||[0,0,0]));
   const pivot=add(j.point,scale(j.axis,dot(sub(center,j.point),j.axis))),tip=add(center,sub(center,pivot));
   const periods=[];
   for(const fs0 of held){
    const fs=fs0.filter(f=>f.t>=fs0[0].t+500&&f.t<=fs0[0].t+6500),values=fs.map(f=>{
     const q=mul(f.bodies[rotor.id].rotation,conj(rotor.rotation)),p=carry(f.bodies[rotor.id],rotor,pivot),v=sub(carry(f.bodies[b.id],b,tip),p);
     const dir=cross(rot(q,j.axis),[0,-1,0]);const theta=Math.atan2(dot(v,dir),-v[1]);
     assert.ok(Math.abs(Math.hypot(...v)-length)<.0025,'physical pendulum length');
     assert.ok(Math.abs(wrap(theta-f.joints[j.id].angle))<.04,'physical pendulum pose agrees with its hinge');return theta;
    });
    const span=Math.max(...values)-Math.min(...values);assert.ok(span>.07,'physical pendulum swing after support stops');
    const peaks=[];
    for(let i=1;i<fs.length-1;i++)if(values[i]>values[i-1]&&values[i]>=values[i+1]){
     const d=values[i-1]-2*values[i]+values[i+1],offset=d?Math.max(-.5,Math.min(.5,(values[i-1]-values[i+1])/(2*d))):0;
     peaks.push((fs[i].t+offset*(fs[i+1].t-fs[i].t))/1000);
    }
    assert.ok(peaks.length>7,'repeated free oscillations');const ds=peaks.slice(1).map((x,i)=>x-peaks[i]);
    assert.ok(ds.every(x=>x>.30&&x<.65),'bounded physical periods');periods.push(mean(ds));
   }
   const ideal=2*Math.PI*Math.sqrt(2*length/(3*9.81));assert.ok(periods.every(x=>Math.abs(x/ideal-1)<.12),'period near distributed-rod prediction');
   results.push({arm:n,lengthMm:1000*length,periodsSeconds:periods});
  }
  assert.ok(results[1].periodsSeconds[0]>results[2].periodsSeconds[0]&&results[2].periodsSeconds[0]>results[0].periodsSeconds[0],'longer pendulums have longer periods');
  return results;
 }
 assert.equal(id,'clutch-bench');const load=m.actuators.find(a=>a.port==='B').joint,axis=m.joints.find(j=>j.id===drive).axis;
 const input=physicalSpin(track,base,body(m,'inputPointer'),axis),output=physicalSpin(track,base,body(m,'outputGear'),axis),ring=physicalSpin(track,base,body(m,'clutch'),axis);
 const slip=m.joints.find(j=>j.frictionNm>0);assert.ok(slip&&Math.abs(slip.frictionNm-.0375)<1e-8,'clutch friction is present');
 const results=[];
 for(const [name,lo,hi]of [['free',800,2700],['loaded',4800,6000],['released',7900,8800],['reverse',10100,11700]]){
  const indices=track.map((f,i)=>f.t>=lo&&f.t<=hi?i:-1).filter(i=>i>=0);assert.ok(indices.length>20);
  const a=indices[0],z=indices.at(-1),dA=input[z]-input[a],dB=output[z]-output[a],dRing=ring[z]-ring[a],dSlip=track[z].joints[slip.id].angle-track[a].joints[slip.id].angle;
  assert.ok(Math.abs(dA)>2,'input shaft physically turns');assert.ok(Math.abs(dA-(track[z].joints[drive].angle-track[a].joints[drive].angle))<.04,'input pose and encoder agree');
  assert.ok(Math.abs(dB-(track[z].joints[load].angle-track[a].joints[load].angle))<.04,'output pose and encoder agree');
  if(name==='loaded'){
   assert.ok(Math.abs(dB)<.01&&Math.abs(dRing)<.02,'held output and clutch ring stop');
   assert.ok(Math.abs(dSlip+dA)<.04,'input rotates relative to stopped ring');
  }else{
   assert.ok(Math.abs(dB/dA+.6)<.015,'physical 24:40 transmission ratio');assert.ok(Math.abs(dRing-dA)<.04,'clutch locks after unloading');
   if(name==='reverse')assert.ok(dA<0&&dB>0,'physical reverse transmission');
  }
  results.push({stage:name,inputRad:dA,outputRad:dB,ringRad:dRing,slipRad:dSlip});
 }
 return results;
};
