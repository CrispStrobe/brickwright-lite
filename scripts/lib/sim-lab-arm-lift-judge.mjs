// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w];
const rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),carry=(p,b,v)=>add(p.position,rot(mul(p.rotation,conj(b.rotation)),sub(v,b.position)));
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const spin=(track,base,b,axis)=>{
 const zero=mul(conj(base.rotation),b.rotation),a=rot(conj(base.rotation),axis);let last=0,total=0;
 return track.map(f=>{const q=mul(mul(conj(f.bodies[base.id].rotation),f.bodies[b.id].rotation),conj(zero));const now=2*Math.atan2(dot(q.slice(0,3),a),q[3]);total+=wrap(now-last);last=now;return total;});
};
const span=xs=>Math.max(...xs)-Math.min(...xs),maxAbs=xs=>Math.max(...xs.map(Math.abs));
export const judgeArmLiftRun=(id,r)=>{
 const {mechanism:m,track,hubId}=r;assert.ok(track.length>300);assert.deepEqual(r.unsupported,[]);
 assert.equal(r.issues.length,id==='atlas-arm'?6:7);assert.ok(r.issues.every(i=>i.code==='locked-hinges'),'only known rigid multi-shaft mounts');
 const base=m.bodies.find(b=>b.id===hubId),body=id=>{const b=m.bodies.find(b=>b.parts.includes(id));assert.ok(b,id);return b;},byId=id=>m.bodies.find(b=>b.id===id);
 for(const f of track){const p=f.bodies[base.id];assert.ok(rot(mul(p.rotation,conj(base.rotation)),[0,1,0])[1]>.99,'upright base');
  for(const b of Object.values(f.bodies)){assert.ok([...b.position,...b.rotation].every(Number.isFinite));assert.ok(Math.hypot(...sub(b.position,p.position))<.8,'bounded assembly');}}
 assert.ok(Object.values(track.at(-1).busy).every(x=>!x),'all three motor runs finish');
 const motors=Object.fromEntries(m.actuators.map(a=>[a.port,m.joints.find(j=>j.id===a.joint)]));
 const shaft=Object.fromEntries(Object.entries(motors).map(([port,j])=>[port,spin(track,byId(j.body1),byId(j.body2),j.axis)]));
 for(const [port,j]of Object.entries(motors))assert.ok(maxAbs(shaft[port].map((v,i)=>v-track[i].joints[j.id].angle))<.03,'physical motor pose agrees with encoder');
 assert.ok(Object.values(shaft).every(v=>Math.abs(v.at(-1))<.035),'all motor shafts return home');
 if(id==='atlas-arm'){
  assert.equal(motors.A.body1,base.id,'shoulder motor mount is rigid with the base');
  const results={};
  for(const [port,part,degrees]of [['A','p99',15],['B','p167',25]]){
   const c=m.couplings.find(c=>c.parts.includes(part)),j=m.joints.find(j=>j.id===c.wheelJoint),b=body(part);
   assert.equal(c.wormJoint,motors[port].id,'worm coupling sees the actual driving motor');
   assert.equal(j.body2,b.id);const output=spin(track,byId(j.body1),b,j.axis);
   const error=maxAbs(output.map((x,i)=>x-c.ratio*shaft[port][i]));assert.ok(error<.015,'physical worm output follows 24:1 ratio');
   assert.ok(Math.abs(span(output)*180/Math.PI-degrees)<.8,'physical arm joint sweep');
   assert.ok(Math.abs(output.at(-1))<.003,'arm joint physically returns');results[port]={sweepDegrees:span(output)*180/Math.PI,ratioErrorRadians:error};
  }
  assert.ok(Math.abs(span(shaft.D)*180/Math.PI-45)<1,'powered jaw opens and closes');
  const tip=body('motorD'),d=track.map(f=>Math.hypot(...sub(carry(f.bodies[tip.id],tip,tip.position),carry(f.bodies[base.id],base,tip.position))));
  assert.ok(Math.max(...d)>.035,'physical wrist moves through arm workspace');assert.ok(d.at(-1)<.001,'physical wrist returns home');
  return {...results,wristTravelMm:Math.max(...d)*1000,jawSweepDegrees:span(shaft.D)*180/Math.PI};
 }
 assert.equal(id,'switchback-lift');assert.equal(motors.A.body1,base.id,'lift motor rigid with the mast');
 const rack=body('p58'),slider=m.joints.find(j=>j.type==='slider'&&[j.body1,j.body2].includes(rack.id));assert.ok(slider);
 const up=[0,1,0],forward=cross(up,motors.A.axis),ball=body('p340');assert.equal(ball.role,'load');
 const displacement=b=>track.map(f=>{const q=mul(f.bodies[base.id].rotation,conj(base.rotation)),v=sub(carry(f.bodies[b.id],b,b.position),carry(f.bodies[base.id],base,b.position));return {up:dot(v,rot(q,up)),forward:dot(v,rot(q,forward))};});
 const lift=displacement(rack),payload=displacement(ball),travel=lift.map(p=>p.up);
 const error=maxAbs(travel.map((v,i)=>v+.006*shaft.A[i]));assert.ok(error<.0006,'physical rack obeys 6 mm/radian pinion radius');
 const height=Math.max(...travel);assert.ok(Math.abs(height-.064)<.0005,'physical 64 mm lift');assert.ok(Math.abs(travel.at(-1))<.0004,'carriage physically returns');
 assert.ok(Math.abs(span(shaft.B)*180/Math.PI-40)<1&&Math.abs(span(shaft.D)*180/Math.PI-60)<1,'physical fork and gate sweep');
 assert.ok(Math.max(...payload.map(p=>p.up))>.062,'free ball rises with the cradle');
 const excursion=Math.max(...payload.map(p=>p.forward));assert.ok(excursion>.135&&excursion<.18,'physical ball traverses outbound track');
 const gate=payload.filter((_,i)=>track[i].t-track[0].t>=11000&&track[i].t-track[0].t<=16000);
 assert.ok(gate.length>50&&gate.every(p=>p.forward>.04&&p.forward<.07),'return ball waits at the closed gate');
 assert.ok(Math.abs(payload.at(-1).up)<.001&&Math.abs(payload.at(-1).forward)<.001,'physical ball reloads the original cradle');
 return {liftMm:height*1000,rackErrorMm:error*1000,ballExcursionMm:excursion*1000,ballReturnErrorMm:Math.hypot(payload.at(-1).up,payload.at(-1).forward)*1000};
};
