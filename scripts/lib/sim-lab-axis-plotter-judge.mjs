// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
const rotate=([x,y,z,w],v)=>{const t=[2*(y*v[2]-z*v[1]),2*(z*v[0]-x*v[2]),2*(x*v[1]-y*v[0])];return [v[0]+w*t[0]+y*t[2]-z*t[1],v[1]+w*t[1]+z*t[0]-x*t[2],v[2]+w*t[2]+x*t[1]-y*t[0]];};
const range=xs=>Math.max(...xs)-Math.min(...xs);
export function judgeAxisPlotter(r){
 const {mechanism:m,track}=r,preset=r.preset||'calibration';
 const pen=m.bodies.find(b=>b.parts.includes('z_pen_proxy')),col=pen.colliders.find(c=>c.part==='z_pen_proxy');
 assert.equal(col.shape,'box');const h=col.halfExtents,q=col.rotation;
 const halfY=[0,1,2].reduce((s,k)=>s+Math.abs(rotate(q,[0,1,2].map(i=>i===k?h[k]:0))[1]),0);
 const local=[col.position[0],col.position[1]-halfY,col.position[2]],zero=local.map((v,k)=>v+pen.position[k]);
 const floor=m.bodies.find(b=>b.role==='ground');const floorY=floor.position[1]+floor.colliders[0].halfExtents[1];
 const samples=track.map(f=>{const p=f.bodies[pen.id],v=rotate(p.rotation,local).map((x,k)=>x+p.position[k]);return {x:(zero[0]-v[0])*1000,y:(zero[2]-v[2])*1000,h:(v[1]-floorY)*1000};});
 let current=null;const strokes=[];for(const p of samples){if(p.h<=1.2){if(!current)strokes.push(current=[]);current.push(p);}else current=null;}
 assert.equal(strokes.length,{'calibration':2,'original-curves':3,'original-pixel-costume':24}[preset],'physical pen lifts separate every drawing stroke');
 assert.ok(samples.every(p=>[p.x,p.y,p.h].every(Number.isFinite)&&p.x>-.4&&p.y>-.4&&p.x<40.4&&p.y<40.4&&p.h>.2&&p.h<6.2),'physical pen stays in calibrated workspace and above floor');
 assert.ok(samples.at(-1).h>5,'physical pen returns raised');assert.ok(Math.hypot(samples.at(-1).x,samples.at(-1).y)<.3,'physical XY returns home');
 let rackError=0;
 const joints=Object.fromEntries(m.joints.filter(j=>j.motor).map(j=>[j.motor.port,j]));
 for(let i=0;i<samples.length;i++){
  const p=samples[i],f=track[i];rackError=Math.max(rackError,Math.abs(p.x-4*f.joints[joints.A.id].angle),Math.abs(p.y-4*f.joints[joints.B.id].angle));
 }
 assert.ok(rackError<.25,'physical rack travel agrees with 4 mm pinion radius');
 let squareError=null,diagonalError=null;
 if(preset==='calibration'){
  const square=strokes[0],diagonal=strokes[1];
  squareError=Math.max(...square.map(p=>Math.min(Math.abs(p.x-2),Math.abs(p.x-38),Math.abs(p.y-2),Math.abs(p.y-38))));
  diagonalError=Math.max(...diagonal.map(p=>Math.abs(p.x+p.y-40)/Math.SQRT2));
  assert.ok(squareError<.25,'physical 36 mm calibration square');assert.ok(diagonalError<.25,'physical coordinated diagonal');
  for(const [x,y]of [[2,2],[38,2],[38,38],[2,38]])assert.ok(square.some(p=>Math.hypot(p.x-x,p.y-y)<.3),'physical calibration visits every corner');
  assert.ok(range(diagonal.map(p=>p.x))>20&&range(diagonal.map(p=>p.y))>20,'physical diagonal has both axis components');
 }
 return {strokes:strokes.length,penLiftMm:range(samples.map(p=>p.h)),rackErrorMm:rackError,squareErrorMm:squareError,diagonalErrorMm:diagonalError};
}
