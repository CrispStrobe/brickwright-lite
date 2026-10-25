// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// A six-R loop consisting of two orthogonal, three-parallel-hinge chains
// already constrains their common platform to a translation. Add that exact
// redundant passive constraint to stabilize the iterative solve. Original
// hinge-axis geometry, contacts, finite motor torque and all travel remain physical.
// One redundant elbow is represented by the published ball-loop relaxation;
// the passive slider restores the platform constraints that elbow shared.
import {breakHingeLoops} from '../mech/loops.js';
import {vecDot,vecCross,vecNormalize} from '../mech/vec.js';
const parallel=(a,b)=>Math.abs(vecDot(a,b))>1-1e-10;
export const spatialLoopSliders=(joints,bodies,{coupled=new Set()}={})=>{
 const active=new Set(joints.filter(j=>j.type==='hinge'&&j.body1!=='world'&&j.body2!=='world'));
 const adjacency=()=>{const map=new Map();for(const j of active)for(const id of [j.body1,j.body2]){if(!map.has(id))map.set(id,[]);map.get(id).push(j);}return map;};
 let adj,changed=true;while(changed){changed=false;adj=adjacency();for(const [id,js]of adj)if(js.length<2){for(const j of js)active.delete(j);changed=true;}}
 adj=adjacency();const seen=new Set(),out=[],byId=new Map(bodies.map(b=>[b.id,b]));
 for(const start of [...adj.keys()].sort()){
  if(seen.has(start))continue;const component=[],queue=[start];while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);component.push(id);for(const j of adj.get(id)||[])queue.push(j.body1===id?j.body2:j.body1);}
  if(component.length!==6||component.some(id=>adj.get(id).length!==2))continue;
  const vertices=[],edges=[];let at=start,previous=null;
  do{vertices.push(at);const j=adj.get(at).find(j=>j!==previous);edges.push(j);at=j.body1===at?j.body2:j.body1;previous=j;}while(at!==start&&vertices.length<=6);
  if(vertices.length!==6||at!==start)continue;
  const transitions=vertices.map((_,i)=>i).filter(i=>!parallel(edges[(i+5)%6].axis,edges[i].axis));
  if(transitions.length!==2||(transitions[1]-transitions[0])!==3)continue;
  const a=edges[transitions[0]].axis,b=edges[transitions[1]].axis;
  if(Math.abs(vecDot(a,b))>1e-6)continue;
  const endpoints=transitions.map(i=>byId.get(vertices[i]));if(endpoints.some(b=>!b))continue;endpoints.sort((a,b)=>b.massKg-a.massKg||a.id.localeCompare(b.id));
  const [frame,platform]=endpoints;
  const elbow=transitions.map(i=>edges[(i+1)%6]).find(j=>!j.motor&&!j.limits&&!j.spring&&!j.frictionNm&&!coupled.has(j.id));
  if(!elbow)continue;
  const relaxed=breakHingeLoops(edges,{keep:new Set(edges.filter(j=>j!==elbow).map(j=>j.id)),massOf:id=>byId.get(id).massKg}).joints.find(j=>j.id===elbow.id);
  out.push({relaxed,type:'slider',body1:frame.id,body2:platform.id,point:platform.position.slice(),axis:vecNormalize(vecCross(a,b)),closureOf:edges.map(j=>j.id)});
 }
 return out;
};
export const SPATIAL_LOOP={id:'spatial-loop',kind:'spatial-loop',detect:({joints,islands,couplings=[],gearCouplings=[]})=>{
 const coupled=new Set([...couplings,...gearCouplings].flatMap(c=>[c.joint1,c.joint2,c.wormJoint,c.wheelJoint,c.pinionJoint,c.sliderJoint]).filter(Boolean));
 const sliders=spatialLoopSliders(joints,islands.bodies,{coupled});return {joints:sliders.map(({relaxed,...j})=>j),replacements:sliders.map(s=>s.relaxed)};
}};
