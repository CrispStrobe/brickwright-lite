// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Observe every original connector hinge, including front/rear interfaces that
// compilation combines into one representative joint. Predictions never set poses.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGraph} from '../../overlay/scratch-gui/src/lib/bw-sim/mech/graph.js';
import {catalogFrom} from '../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {lduToWorld,dirToWorld} from '../../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
const catalog=catalogFrom(JSON.parse(readFileSync(new URL('../../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));

const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),norm=v=>Math.hypot(...v);
const unit=v=>{const n=norm(v);assert.ok(Number.isFinite(n)&&n>0,'Nonzero finite direction required');return v.map(x=>x/n);};
const conj=([x,y,z,w])=>[-x,-y,-z,w];
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const rotate=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const quaternion=q=>{assert.ok(Array.isArray(q)&&q.length===4&&q.every(Number.isFinite),'Finite quaternion required');return unit(q);};
const position=p=>{assert.ok(Array.isArray(p)&&p.length===3&&p.every(Number.isFinite),'Finite body position required');return p;};
const key=e=>`${e.a.part}:${e.a.connector}|${e.b.part}:${e.b.connector}`;

// A count alone could accept a missing rear interface replaced by an unrelated
// hinge. Pin the original Cable Compass connector identities as well as their count.
const expectedInterfaces=[
 "left_frame_-1:h5|left_output_axle:a",
 "left_frame_1:h5|left_output_axle:a",
 "left_worm_bearing:h5|left_worm_axle:a",
 "right_frame_-1:h5|right_output_axle:a",
 "right_frame_1:h5|right_output_axle:a",
 "right_worm_bearing:h5|right_worm_axle:a"
];

export function createCableHingeObserver(run){
 const diagnostics=[],graph=buildGraph(run.runModel,catalog,diagnostics);
 assert.deepEqual(diagnostics,[],'Original connector graph must have no unresolved diagnostics');
 const edges=graph.edges.filter(e=>e.kind==='hinge'&&!e._isMotorInternal);
 assert.equal(edges.length,expectedInterfaces.length,'All six original external hinge interfaces must be present');
 assert.deepEqual(edges.map(key).sort(),[...expectedInterfaces].sort(),'Original physical hinge identities must match');
 const bodies=new Map(run.mechanism.bodies.map(b=>[b.id,b]));
 const endpoint=end=>{
  const node=graph.nodes.get(end.part);
  assert.ok(node,`Missing connector graph node ${end.part}`);
  const owners=run.mechanism.bodies.filter(b=>b.parts.includes(node.partId));
  assert.equal(owners.length,1,`Unique body ownership required for ${end.part}:${end.connector}`);
  assert.ok(node.connectors.some(c=>c.id===end.connector),`Missing connector ${end.part}:${end.connector}`);
  return {node:end.part,part:node.partId,connector:end.connector,body:owners[0].id};
 };
 const interfaces=edges.map(e=>{
  const a=endpoint(e.a),b=endpoint(e.b);
  // Graph coordinates are already transformed using the actual imported
  // runModel, including mat placement. The hole centre is the shared hinge
  // point; shaft and hole connector centres need not coincide along an axle.
  const hole=graph.nodes.get(e.a.part).connectors.find(c=>c.id===e.a.connector);
  assert.deepEqual(hole.position,e.point,'Hinge point must be the actual hole connector centre');
  return {id:key(e),a,b,sameBody:a.body===b.body,pointLdu:[...hole.position],axisLdu:[...hole.axis],pointWorld:lduToWorld(hole.position),axisWorld:unit(dirToWorld(hole.axis))};
 });
 const carried=interfaces.map(i=>({
  ends:[i.a,i.b].map(end=>{
   const body=bodies.get(end.body),inverse=conj(quaternion(body.rotation));
   return {body:end.body,localPoint:rotate(inverse,sub(i.pointWorld,position(body.position))),localAxis:rotate(inverse,i.axisWorld)};
  })
 }));
 function measure(frame){
  const poses=new Map();
  const pose=id=>{
   if(!poses.has(id)){
    const p=frame.bodies[id];assert.ok(p,`Recorded body ${id} is missing`);
    poses.set(id,{position:position(p.position),rotation:quaternion(p.rotation)});
   }
   return poses.get(id);
  };
  let gapMm=0,axisMismatchDeg=0;
  for(const {ends} of carried){
   const observed=ends.map(e=>{
    const p=pose(e.body);
    return {point:add(p.position,rotate(p.rotation,e.localPoint)),axis:unit(rotate(p.rotation,e.localAxis))};
   });
   gapMm=Math.max(gapMm,norm(sub(observed[0].point,observed[1].point))*1000);
   const cosine=Math.max(-1,Math.min(1,dot(observed[0].axis,observed[1].axis)));
   axisMismatchDeg=Math.max(axisMismatchDeg,Math.acos(cosine)*180/Math.PI);
  }
  return {gapMm,axisMismatchDeg};
 }
 return {measure,interfaces};
}
