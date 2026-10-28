// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Producer oracle. The retained-record reader deliberately uses different math.
import assert from 'node:assert/strict';
const rad=x=>x*Math.PI/180,deg=x=>x*180/Math.PI;
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const inv=([x,y,z,w])=>[-x,-y,-z,w];
const rot=(q,v)=>mul(mul(q,[...v,0]),inv(q)).slice(0,3);
const wrap=x=>deg(Math.atan2(Math.sin(rad(x)),Math.cos(rad(x))));
export function crossRatioMetrics(r){
 const roles={base:'motor_rail_-40_-140',input:'input_beam',output:'output_beam',coupler:'coupler_beam'};
 const bodies=Object.fromEntries(Object.entries(roles).map(([role,part])=>{
  const bs=r.mechanism.bodies.filter(b=>b.parts.includes(part));assert.equal(bs.length,1,role+' unique membership');return[role,bs[0]];
 }));
 assert.equal(new Set(Object.values(bodies).map(b=>b.id)).size,4);
 const references={input:[.5,0,-Math.sqrt(3)/2],output:[-.5,0,-Math.sqrt(3)/2],coupler:[-1,0,0]};
 const rows=r.track.map(f=>{
  const angles={},vectors={};
  for(const role of ['input','output','coupler']){
   const b=bodies[role],q=mul(mul(mul(bodies.base.rotation,inv(f.bodies[bodies.base.id].rotation)),f.bodies[b.id].rotation),inv(b.rotation));
   const v=rot(q,references[role]);vectors[role]=v;angles[role]=deg(Math.atan2(-v[2],v[0]));
  }
  const prediction=deg(2*Math.atan2(3*Math.sin(rad(angles.input)/2),Math.cos(rad(angles.input)/2)));
  return {t:f.t,...angles,lawErrorDeg:Math.abs(wrap(angles.output-prediction)),couplerErrorDeg:Math.abs(wrap(angles.coupler-angles.input-angles.output)),planeDeg:Math.max(...Object.values(vectors).map(v=>deg(Math.asin(Math.min(1,Math.abs(v[1]))))))};
 });
 assert.ok(rows.length>1);
 return {inputSpanDeg:Math.max(...rows.map(x=>x.input))-Math.min(...rows.map(x=>x.input)),outputSpanDeg:Math.max(...rows.map(x=>x.output))-Math.min(...rows.map(x=>x.output)),lawErrorDeg:Math.max(...rows.map(x=>x.lawErrorDeg)),couplerErrorDeg:Math.max(...rows.map(x=>x.couplerErrorDeg)),planeDeg:Math.max(...rows.map(x=>x.planeDeg))};
}
export function judgeCrossRatio(r,{control=false,expectedIssueKeys=[]}={}){
 assert.ok(Number.isFinite(r.finishedAt)&&r.finishedAt>0,'actual VM completion');
 assert.deepEqual(r.issues.map(i=>i.severity+':'+i.code+':'+[...(i.parts||[])].sort().join(',')).sort(),expectedIssueKeys);assert.deepEqual(r.unsupported,[]);
 const v=r.track.at(-1).extra.variables;assert.equal(Number(v.completed),1);assert.equal(Number(v.failed),0);assert.equal(Number(v.stage),10);
 assert.ok(Object.values(r.track.at(-1).busy).every(x=>x===false));
 const m=crossRatioMetrics(r);assert.ok(m.inputSpanDeg>=119,'actual input sweeps original sector');
 if(control)assert.ok(m.lawErrorDeg>.5,'physical disconnection loses same law');
 else {assert.ok(m.outputSpanDeg>=10);assert.ok(m.lawErrorDeg<=.5,JSON.stringify(m));assert.ok(m.couplerErrorDeg<=.5,JSON.stringify(m));assert.ok(m.planeDeg<=.5,JSON.stringify(m));}
 return m;
}

// Serialize program semantics, including literal inputs, edges, mutations,
// variables, lists and broadcasts. Opcode histograms are readiness only.
export function crossRatioProgramGraph(project){
 assert.ok(Array.isArray(project?.targets)&&project.targets.length>0);
 const graph=project.targets.map(t=>{
  assert.equal(typeof t.name,'string');assert.ok(t.blocks&&typeof t.blocks==='object');
  return structuredClone({name:t.name,isStage:t.isStage,blocks:t.blocks,variables:t.variables||{},lists:t.lists||{},broadcasts:t.broadcasts||{}});
 }).sort((a,b)=>a.name.localeCompare(b.name));
 assert.equal(new Set(graph.map(t=>t.name)).size,graph.length,'unique program target names');
 return graph;
}

export function assertCrossRatioBrowserProgram(record,{timeLimitMs,holdMs,afterMs,routeLength}){
 assert.ok(Number.isFinite(record.start)&&Number.isFinite(record.finishedAt));
 const elapsed=record.finishedAt-record.start;
 assert.ok(elapsed>=routeLength*holdMs&&elapsed<=timeLimitMs,'actual browser interval is long enough for the authored holds and stays inside the declared cap');
 assert.ok(record.track.at(-1).t-record.finishedAt>=afterMs,'full actual final hold');
 assert.deepEqual(record.refusals,[],'no actual API command refused');
 assert.ok(Array.isArray(record.apiEvents)&&record.apiEvents.some(e=>
  ['setMotorPower','setMotorSpeed'].includes(e.name)&&e.args?.[0]==='A'&&Number.isFinite(Number(e.args[1]))&&Math.abs(Number(e.args[1]))>0),
 'actual nonzero motor A command, not loaded variables or passive drift');
}
