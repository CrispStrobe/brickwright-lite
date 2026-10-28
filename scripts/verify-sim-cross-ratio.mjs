// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Standalone consumer: builtins only, no producer oracle, parser or engine import.
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const contractBytes=readFileSync(new URL('../test/fixtures/bw-sim/cross-ratio/contract.json',import.meta.url));
const C=JSON.parse(contractBytes),sha=x=>createHash('sha256').update(x).digest('hex');
const check=(ok,message)=>assert.ok(ok,message);
const minus=(a,b)=>a.map((v,i)=>v-b[i]),plus=(a,b)=>a.map((v,i)=>v+b[i]);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),length=v=>Math.hypot(...v),degrees=x=>x*180/Math.PI;
function matrix(q){
 check(Array.isArray(q)&&q.length===4&&q.every(Number.isFinite),'finite quaternion');
 check(Math.abs(length(q)-1)<=C.limits.quaternionNorm,'unit quaternion');
 const [x,y,z,w]=q,n=dot(q,q);
 return [[1-2*(y*y+z*z)/n,2*(x*y-z*w)/n,2*(x*z+y*w)/n],
  [2*(x*y+z*w)/n,1-2*(x*x+z*z)/n,2*(y*z-x*w)/n],
  [2*(x*z-y*w)/n,2*(y*z+x*w)/n,1-2*(x*x+y*y)/n]];
}
const apply=(m,v)=>m.map(row=>dot(row,v));
const transpose=m=>m[0].map((_,i)=>m.map(row=>row[i]));
function pose(p){check(p&&Array.isArray(p.position)&&p.position.length===3&&p.position.every(Number.isFinite),'finite position');matrix(p.rotation);return p;}
function relativeVector(initial,now,baseInitial,baseNow,reference){
 // Four matrix applications, independent of the producer's quaternion product.
 return apply(matrix(baseInitial.rotation),apply(transpose(matrix(baseNow.rotation)),
  apply(matrix(now.rotation),apply(transpose(matrix(initial.rotation)),reference))));
}
function transported(body,now,point){return plus(now.position,apply(matrix(now.rotation),apply(transpose(matrix(body.rotation)),minus(point,body.position))));}
export function readCrossRatio(record,{expectedIdentity}={}){
 check(expectedIdentity,'external exact CI commit/tree/file identities are mandatory');
 assert.deepEqual(Object.keys(expectedIdentity).sort(),['commit','files','tree'],'closed external identity schema');
 assert.deepEqual(Object.keys(expectedIdentity.files||{}).sort(),[...C.identityPaths].sort(),'complete required source/SDK file census');
 check(Object.values(expectedIdentity.files).every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)),'exact file SHA-256 values');
 check(expectedIdentity.files['test/fixtures/bw-sim/cross-ratio/contract.json']===sha(contractBytes),'expected frozen contract');
 check(expectedIdentity.files['overlay/scratch-gui/static/sim-lab/models/cross-ratio.ldr']===C.modelSha256&&expectedIdentity.files['overlay/scratch-gui/static/sim-lab/programs/cross-ratio.bw']===C.programSha256,'expected source input hashes');
 assert.deepEqual(record.identity,expectedIdentity,'original CI identity');
 check(/^[a-f0-9]{40}$/.test(expectedIdentity.commit)&&/^[a-f0-9]{40}$/.test(expectedIdentity.tree),'exact commit/tree');
 check(record.schema===1&&record.kind==='cross-ratio-native','native record schema');
 check(record.contractSha256===sha(contractBytes),'frozen contract identity');
 assert.deepEqual(record.timing,{...C.timing,coldMs:record.timing.coldMs});
 check(C.timing.coldMs.includes(record.timing.coldMs),'declared cold boundary');
 check(['original','remove-pivot-P'].includes(record.variant),'declared physical input');
 check(sha(record.input.originalModel)===C.modelSha256&&sha(record.input.program)===C.programSha256,'exact shipped input bytes');
 const original=record.input.originalModel;
 const block=/^0 !BW ID pivot_axle_P\n(?:0 [^\n]*\n)*1 [^\n]*\n/gm;
 const matches=[...original.matchAll(block)];check(matches.length===1,'unique physical P axle');
 const model=record.variant==='original'?original:original.replace(block,'');
 check(record.input.model===model,'only the declared physical axle is removed');
 check(record.input.modelSha256===sha(model),'actual model digest');
 check(record.vmErrors?.length===0,'actual VM error stream is empty');
 const topology=C.topology[record.variant];
 assert.deepEqual(record.issues.map(i=>i.severity+':'+i.code+':'+[...(i.parts||[])].sort().join(',')).sort(),topology.issueKeys,'only exact source-derived diagnostics');
 check(record.unsupported?.length===0,'no unsupported operation');
 const m=record.mechanism;check(m.bodies.length===topology.bodyCount,'exact declared body count');
 const groups=m.bodies.map(b=>[...b.parts].sort()).sort((a,b)=>a.join('\0')<b.join('\0')?-1:a.join('\0')>b.join('\0')?1:0);
 assert.deepEqual(groups,topology.bodyPartGroups,'exact compiler body-part census');
 check(new Set(m.bodies.map(b=>b.id)).size===topology.bodyCount,'unique physical body IDs');
 const floor=m.bodies.filter(b=>b.id==='ground');check(floor.length===1&&floor[0].motion==='static','one static ground body');
 check(m.bodies.filter(b=>b.motion==='static').length===1,'only floor may be fixed');
 const roles=Object.fromEntries(Object.entries(C.roles).map(([role,part])=>{
  const b=m.bodies.filter(b=>b.parts.includes(part));check(b.length===1,role+' unique membership');pose(b[0]);return[role,b[0]];
 }));
 check(new Set(Object.values(roles).map(b=>b.id)).size===4&&Object.values(roles).every(b=>b.motion==='dynamic'),'four distinct dynamic physical roles');
 check(m.actuators.length===1&&m.actuators[0].port==='A','actual input A only');
 const joints=m.joints;check(joints.length===topology.jointCount,'declared hinge census');
 check(joints.every(j=>j.type==='hinge'),'hinges only');
 const allowed=new Set(['base:input','base:output','coupler:input','coupler:output']);
 const roleOf=id=>Object.keys(roles).find(k=>roles[k].id===id);
 const edges=joints.map(j=>[roleOf(j.body1),roleOf(j.body2)].sort().join(':'));
 check(new Set(edges).size===joints.length&&edges.every(x=>allowed.has(x)),'physical linkage edges');
 check(record.variant==='original'||(!edges.includes('coupler:input')&&edges.includes('base:input')),'control removes input/coupler edge only');
 const frames=record.track;check(Array.isArray(frames)&&frames.length>=100,'complete raw frame sequence');
 check(frames[0].t===0,'actual initial world pose');
 check(Number.isFinite(record.finishedAt)&&record.finishedAt>record.timing.coldMs&&record.finishedAt<=record.timing.coldMs+C.timing.timeLimitMs,'finite authored completion');
 check(frames.at(-1).t===record.finishedAt+C.timing.afterMs,'full final hold');
 let previous=-C.timing.frameMs,minInput=Infinity,maxInput=-Infinity,minOutput=Infinity,maxOutput=-Infinity;
 let lawErrorDeg=0,couplerErrorDeg=0,planeDeg=0,closureMm=0,axisDeg=0;
 const stageHolds=[];let hold=null;
 for(const f of frames){
  check(Number.isFinite(f.t)&&f.t===previous+C.timing.frameMs,'exact recording cadence; no missing/duplicate/reordered rows');previous=f.t;
  check(f.phase===(f.t<=record.timing.coldMs?'cold':f.t<=record.finishedAt?'program':'after'),'actual phase clock');
  const dynamic=m.bodies.filter(b=>b.motion==='dynamic');
  assert.deepEqual(Object.keys(f.bodies).sort(),dynamic.map(b=>b.id).sort(),'all dynamic body poses, including freed captures');
  for(const b of dynamic)pose(f.bodies[b.id]);
  const v={};
  for(const [role,reference]of Object.entries({input:[.5,0,-Math.sqrt(3)/2],output:[-.5,0,-Math.sqrt(3)/2],coupler:[-1,0,0]})){
   v[role]=relativeVector(roles[role],f.bodies[roles[role].id],roles.base,f.bodies[roles.base.id],reference);
   planeDeg=Math.max(planeDeg,degrees(Math.asin(Math.min(1,Math.abs(v[role][1])))));
  }
  const theta=Math.atan2(-v.input[2],v.input[0]),phi=Math.atan2(-v.output[2],v.output[0]);
  const th=degrees(theta),ph=degrees(phi);check(th>=29&&th<=151,'declared input sector');
  if(record.variant==='original')check(ph>0&&ph<180,'declared crossed output branch');
  minInput=Math.min(minInput,th);maxInput=Math.max(maxInput,th);minOutput=Math.min(minOutput,ph);maxOutput=Math.max(maxOutput,ph);
  // Rational full-angle circle vector: no tan/atan half-angle producer formula.
  const denominator=5-4*Math.cos(theta);
  const predicted=[(5*Math.cos(theta)-4)/denominator,0,-3*Math.sin(theta)/denominator];
  const error=degrees(Math.atan2(v.output[0]*predicted[2]-v.output[2]*predicted[0],dot(v.output,predicted)));
  lawErrorDeg=Math.max(lawErrorDeg,Math.abs(error));
  const cp=[Math.cos(theta+phi),0,-Math.sin(theta+phi)];
  couplerErrorDeg=Math.max(couplerErrorDeg,Math.abs(degrees(Math.atan2(v.coupler[0]*cp[2]-v.coupler[2]*cp[0],dot(v.coupler,cp)))));
  if(f.t<=record.timing.coldMs)check(Math.abs(th-60)<=.5,'unpowered cold input remains at datum');
  for(const j of joints){
   check(j.point?.length===3&&j.point.every(Number.isFinite)&&j.axis?.length===3&&j.axis.every(Number.isFinite)&&Math.abs(length(j.axis)-1)<1e-5,'actual world hinge definition');
   const bs=[j.body1,j.body2].map(id=>m.bodies.find(b=>b.id===id));
   const p=bs.map(b=>transported(b,f.bodies[b.id],j.point));closureMm=Math.max(closureMm,length(minus(...p))*1000);
   const axes=bs.map(b=>apply(matrix(f.bodies[b.id].rotation),apply(transpose(matrix(b.rotation)),j.axis)));
   axisDeg=Math.max(axisDeg,degrees(Math.acos(Math.min(1,Math.max(-1,dot(...axes))))));
  }
  const vars=f.extra?.variables;check(vars,'actual VM variables');
  check(!f.extra.sessionFailed,'no hidden session failure');
  if(vars.failed!==undefined)check(Number(vars.failed)===0,'no failed program frame is hidden by later success');
  const arrived=Number(vars.arrived)===1&&Number(vars.inputReady)===1&&f.phase==='program';
  const stage=Number(vars.stage);
  if(hold&&(!arrived||stage!==hold.stage)){
   check(f.t-hold.start>=C.timing.holdMs,'full authored 1500ms hold before next stage');
   stageHolds.push(hold.stage);hold=null;
  }
  if(arrived){
   check(Number.isInteger(stage)&&stage>=0&&stage<10,'actual route stage');
   if(!hold){check(stage===stageHolds.length,'route holds occur once in authored order');hold={stage,start:f.t};}
   check(Math.abs(th-C.route[stage])<=.5,'actual physical stage arrival, no target-as-pose');
  }
 }
 for(const f of frames.filter(f=>f.t>=record.finishedAt))check(Number(f.extra.variables.completed)===1&&Number(f.extra.variables.failed)===0&&Number(f.extra.variables.stage)===10,'actual completion persists throughout final hold');
 const last=frames.at(-1),vars=last.extra.variables;
 check(Number(vars.completed)===1&&Number(vars.failed)===0&&Number(vars.stage)===10,'original program completes entire route');
 check(!hold&&stageHolds.length===10,'all ten complete ordered route holds');
 check(Object.keys(last.busy).length===1&&last.busy.A===false&&last.extra.modes.A==='hold','input is actually idle in hold');
 check(maxInput-minInput>=C.limits.inputSpanDeg,'nontrivial actual input sweep');
 check(closureMm<=C.limits.closureMm&&axisDeg<=C.limits.axisDeg,'remaining true hinges stay closed/aligned');
 if(record.variant==='original'){
  check(maxOutput-minOutput>=C.limits.minimumOutputSpanDeg,'passive output moves');
  check(lawErrorDeg<=C.limits.lawDeg&&couplerErrorDeg<=C.limits.couplerDeg&&planeDeg<=C.limits.planeDeg,'same frozen mechanical acceptance');
 }else check(lawErrorDeg>C.limits.lawDeg,'moving-input physical control loses the same law');
 const result={inputSpanDeg:maxInput-minInput,outputSpanDeg:maxOutput-minOutput,lawErrorDeg,couplerErrorDeg,planeDeg,closureMm,axisDeg};
 if(record.summary!==undefined)assert.deepEqual(record.summary,result,'summary cannot replace raw observations');
 return result;
}
export function readCrossRatioLines(text,options){
 const lines=text.split(/\r?\n/).map(x=>x.replace(/^\s*# /,'')).filter(x=>x.startsWith('CROSS_RATIO_WIRE_V1 ')).map(line=>{
  const match=/^CROSS_RATIO_WIRE_V1 ([0-9]+) ([a-f0-9]{64}) ([A-Za-z0-9+/]+={0,2})$/.exec(line);check(match,'canonical evidence wire');
  const count=Number(match[1]);check(Number.isSafeInteger(count)&&count>0&&count<=2*1024*1024,'bounded advertised item');
  check(match[3].length<=Math.ceil(count/3)*4,'bounded encoded item');
  const bytes=Buffer.from(match[3],'base64');check(bytes.length===count&&bytes.toString('base64')===match[3],'exact canonical decoded bytes');
  check(sha(bytes)===match[2],'record item SHA-256');return JSON.parse(bytes.toString('utf8'));
 });
 const records=[];let current;
 for(const item of lines){
  if(item.type==='header'){check(!current,'unterminated original');current={...item.record,track:[]};}
  else if(item.type==='frame'){check(current,'frame before header');current.track.push(item.frame);}
  else if(item.type==='end'){check(current,'end before header');Object.assign(current,item.record);records.push({variant:current.variant,coldMs:current.timing.coldMs,metrics:readCrossRatio(current,options)});current=null;}
  else check(false,'unknown record line');
 }
 check(!current,'complete original');
 assert.deepEqual(records.map(r=>r.variant+':'+r.coldMs).sort(),['original:0','original:1000','remove-pivot-P:0','remove-pivot-P:1000']);
 return records;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [file,identity]=process.argv.slice(2);check(file&&identity&&process.argv.length===4,'usage: node scripts/verify-sim-cross-ratio.mjs ORIGINAL.log EXPECTED-CI-IDENTITY.json');
 check(statSync(file).size<=64*1024*1024,'bounded original');
 console.log(JSON.stringify({status:'PASS',records:readCrossRatioLines(readFileSync(file,'utf8'),{expectedIdentity:JSON.parse(readFileSync(identity,'utf8'))})}));
}
