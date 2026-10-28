// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),sub=(a,b)=>a.map((v,k)=>v-b[k]),degrees=x=>x*180/Math.PI,angle=(a,b)=>degrees(Math.acos(Math.min(1,Math.max(-1,a.reduce((s,x,k)=>s+x*b[k],0)))));
export function judgeSarrusLift(id,r){
 const {mechanism:m,track}=r,body=new Map(m.bodies.map(b=>[b.id,b])),base=m.bodies.find(b=>b.parts.includes('hub')),deck=m.bodies.find(b=>b.parts.includes('deck_plate')),worm=m.couplings.find(c=>c.kind==='worm'),loop=m.joints.find(j=>j.closureOf?.length===6);
 assert.deepEqual(r.unsupported,[]);assert.ok(r.issues.every(i=>i.code==='locked-hinges'));assert.ok(loop&&!loop.motor&&!loop.limits);assert.ok(track.length>500);assert.equal(deck.motion,'dynamic');assert.ok(Math.abs(worm.ratio+1/24)<1e-10);
 const start=sub(deck.position,base.position);let tiltDeg=0,lateralMm=0,heightErrorMm=0,pivotGapMm=0,axisErrorDeg=0,phaseErrorDeg=0,minHeight=Infinity,maxHeight=-Infinity,minInput=Infinity,maxInput=-Infinity;
 for(const f of track){
  for(const p of Object.values(f.bodies))assert.ok([...p.position,...p.rotation].every(Number.isFinite));
  const a=f.bodies[base.id],d=f.bodies[deck.id],local=rot(conj(a.rotation),sub(d.position,a.position)),relative=mul(conj(a.rotation),d.rotation),input=f.joints[worm.wormJoint].angle;
  tiltDeg=Math.max(tiltDeg,angle(rot(relative,[0,1,0]),[0,1,0]));lateralMm=Math.max(lateralMm,Math.hypot(local[0]-start[0],local[2]-start[2])*1000);
  const actual=(local[1]-start[1])*1000,expected=96*(Math.sin(Math.PI/4+input/24)-Math.SQRT1_2);heightErrorMm=Math.max(heightErrorMm,Math.abs(actual-expected));minHeight=Math.min(minHeight,actual);maxHeight=Math.max(maxHeight,actual);minInput=Math.min(minInput,input);maxInput=Math.max(maxInput,input);
  phaseErrorDeg=Math.max(phaseErrorDeg,degrees(Math.abs(f.joints[worm.wheelJoint].angle+input/24)));
  for(const j of m.joints.filter(j=>loop.closureOf.includes(j.id))){
   const carry=id=>rot(f.bodies[id].rotation,sub(j.point,body.get(id).position)).map((v,k)=>v+f.bodies[id].position[k]);pivotGapMm=Math.max(pivotGapMm,Math.hypot(...sub(carry(j.body1),carry(j.body2)))*1000);
   const axis=j.axis||m.joints.find(o=>o.type==='hinge'&&(o.body1===j.body1||o.body2===j.body1)).axis;axisErrorDeg=Math.max(axisErrorDeg,angle(rot(f.bodies[j.body1].rotation,axis),rot(f.bodies[j.body2].rotation,axis)));
  }
  assert.ok(rot(a.rotation,[0,1,0])[1]>.999,'base stays upright');
 }
 assert.ok(minInput<-598*Math.PI/180&&maxInput>598*Math.PI/180,'native motor reaches both commanded ends');assert.ok(minHeight< -34&&maxHeight>21,'physical deck completes both sides of the lift');assert.ok(heightErrorMm<1,'measured deck follows the 96 mm sine law');assert.ok(tiltDeg<1&&lateralMm<1,'deck translates without rotating');assert.ok(pivotGapMm<.5&&axisErrorDeg<.2,'all original physical hinge axes remain aligned');assert.ok(phaseErrorDeg<.2,'worm preserves its physical 24:1 phase');assert.ok(Math.abs(track.at(-1).joints[worm.wormJoint].angle)<2*Math.PI/180,'motor returns home');
 return {tiltDeg,lateralMm,heightErrorMm,pivotGapMm,axisErrorDeg,phaseErrorDeg,minHeight,maxHeight};
}
