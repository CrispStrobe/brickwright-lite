// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Independently carry every original bore/shaft interface with its native body.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v));
const conj=([x,y,z,w])=>[-x,-y,-z,w],mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),key=e=>`${e.a.part}:${e.a.connector}|${e.b.part}:${e.b.connector}`;
export async function createPhysicalGuideObserver(run,{repo,expectedInterfaces}){
 const sim=path.join(repo,'overlay/scratch-gui/src/lib/bw-sim'),imp=p=>import(pathToFileURL(path.join(sim,p)).href);
 const [{buildGraph},{catalogFrom},{lduToWorld,dirToWorld}]=await Promise.all([imp('mech/graph.js'),imp('sim-session.js'),imp('contracts.js')]);
 const catalog=catalogFrom(JSON.parse(fs.readFileSync(path.join(sim,'part-meta/parts.json')))),diagnostics=[],graph=buildGraph(run.runModel,catalog,diagnostics);
 assert.deepEqual(diagnostics,[]);
 const edges=graph.edges.filter(e=>e.kind==='slider');
 assert.equal(edges.length,4,'Two real guides on each of two passive carriages');
 assert.deepEqual(edges.map(key).sort(),[...expectedInterfaces].sort(),'All original physical slide interfaces must match preregistration');
 const make=end=>{
  const node=graph.nodes.get(end.part),c=node.connectors.find(c=>c.id===end.connector),owners=run.mechanism.bodies.filter(b=>b.parts.includes(node.partId));
  assert.equal(owners.length,1,'Unique guide ownership '+end.part);const b=owners[0];
  return{part:node.partId,connector:c.id,body:b.id,type:c.type,lengthMm:c.length*.4,localPoint:rot(conj(b.rotation),sub(lduToWorld(c.position),b.position)),localAxis:rot(conj(b.rotation),unit(dirToWorld(c.axis)))};
 };
 const interfaces=edges.map(e=>({id:key(e),ends:[make(e.a),make(e.b)]}));
 function measure(frame){
  const observations=interfaces.map(i=>{
   const ends=i.ends.map(e=>{const b=frame.bodies[e.body];assert.ok(b,'Recorded guide body missing '+e.body);return{...e,point:add(b.position,rot(b.rotation,e.localPoint)),axis:unit(rot(b.rotation,e.localAxis))};});
   const shaft=ends.find(e=>e.type==='axle'),bore=ends.find(e=>e.type==='slide-bore');assert.ok(shaft&&bore);
   const delta=sub(bore.point,shaft.point),axialMm=dot(delta,shaft.axis)*1000,transverseMm=norm(sub(delta,shaft.axis.map(v=>v*axialMm/1000)))*1000;
   const axisMismatchDeg=Math.acos(Math.min(1,Math.abs(dot(shaft.axis,bore.axis))))*180/Math.PI;
   const shaftInterval=[-shaft.lengthMm/2,shaft.lengthMm/2],boreHalf=bore.lengthMm/2*Math.abs(dot(shaft.axis,bore.axis)),boreInterval=[axialMm-boreHalf,axialMm+boreHalf];
   const engagementMm=Math.max(0,Math.min(shaftInterval[1],boreInterval[1])-Math.max(shaftInterval[0],boreInterval[0]));
   const endMarginMm=Math.min(boreInterval[0]-shaftInterval[0],shaftInterval[1]-boreInterval[1]);
   return{id:i.id,axialMm,transverseMm,axisMismatchDeg,engagementMm,endMarginMm};
  });
  return{observations,maxTransverseMm:Math.max(...observations.map(o=>o.transverseMm)),maxAxisMismatchDeg:Math.max(...observations.map(o=>o.axisMismatchDeg)),minEngagementMm:Math.min(...observations.map(o=>o.engagementMm)),minEndMarginMm:Math.min(...observations.map(o=>o.endMarginMm))};
 }
 return{interfaces,measure};
}
