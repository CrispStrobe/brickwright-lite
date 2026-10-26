#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Exact exported BW -> registered Creator -> real Scratch VM -> native Jolt.
// Body-carried output markers are measured independently; predictions never set poses.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createPhysicalHingeObserver} from './physical-hinge-observer.mjs';
import {createPhysicalGuideObserver} from './physical-guide-observer.mjs';
const addon=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const opt=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const repo=path.resolve(opt('--repo',path.join(addon,'../brickwright-baseline'))),out=path.resolve(opt('--out',path.join(addon,'evidence/native')));
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(path.join(addon,p)),json=p=>JSON.parse(read(p));
const model=read('models/rod-ratio.ldr'),program=read('programs/rod-ratio.bw'),markersBytes=read('markers.json'),markers=JSON.parse(markersBytes),contractBytes=read('docs/contract.json'),contract=JSON.parse(contractBytes);
assert.equal(contract.state,'FROZEN BEFORE NATIVE QUALIFICATION');
for(const [file,digest] of Object.entries(contract.inputs))assert.equal(sha(read(file)),digest,'Frozen input changed: '+file);
for(const [file,digest] of Object.entries(contract.runtimeSources))assert.equal(sha(fs.readFileSync(path.join(repo,file))),digest,'Frozen runtime source changed: '+file);
fs.mkdirSync(out,{recursive:true});assert.ok(!fs.existsSync(path.join(out,'result.json')),'Use a new output directory and preserve earlier runs');
for(const [name,bytes] of Object.entries({'input.ldr':model,'input.bw':program,'contract.json':contractBytes,'markers.json':markersBytes}))fs.writeFileSync(path.join(out,name),bytes);
const imp=p=>import(pathToFileURL(path.join(repo,p)).href);
const [{runRobotLabProgram},{observeAddon}]=await Promise.all([imp('test/helpers/robot-lab-direct-vm.mjs'),imp('scripts/lib/sim-lab-addon-judge.mjs')]);
const settings=contract.recording,A=contract.acceptance,route=contract.route,sign=contract.motorDirectionA,r=contract.geometry.crankRadiusMm,lengths={short:contract.geometry.shortRodMm,long:contract.geometry.longRodMm},ratio=contract.geometry.wormRatioDenominator;
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),norm=a=>Math.hypot(...a),unit=a=>a.map(v=>v/norm(a)),deg=a=>a*180/Math.PI,clamp=a=>Math.max(-1,Math.min(1,a)),span=a=>Math.max(...a)-Math.min(...a),average=a=>a.reduce((s,v)=>s+v,0)/a.length;
const unwrap=angles=>{let prev=angles[0],total=prev;return angles.map(a=>{total+=Math.atan2(Math.sin(a-prev),Math.cos(a-prev));prev=a;return total;});};
const expected=(theta,L)=>r*Math.cos(theta)+Math.sqrt(L*L-r*r*Math.sin(theta)**2);
let run,physical,guides;
function measure(recording){
 const o=observeAddon(recording,markers.basePart),cf=markers.coordinateFrame,motor=recording.mechanism.actuators.find(a=>a.port==='A');assert.ok(motor);
 for(const p of [markers.basePart,cf.part,markers.input.pivot.part,markers.input.pin.part,markers.longInput.pivot.part,markers.longInput.pin.part,...Object.values(markers.outputs).map(p=>p.part)])assert.equal(recording.mechanism.bodies.filter(b=>b.parts.includes(p)).length,1,'Marker ownership must be unique: '+p);
 assert.equal(o.body(cf.part).id,o.base.id,'Basis belongs to the actual observed chassis');
 assert.notEqual(o.body(markers.outputs.short.part).id,o.body(markers.outputs.long.part).id,'Two distinct passive outputs');
 for(const m of Object.values(markers.outputs))assert.ok(!recording.mechanism.actuators.some(a=>{const j=recording.mechanism.joints.find(j=>j.id===a.joint);return j.body2===o.body(m.part).id;}),'Carriage is passive');
 const zero=o.initial(cf.part),axis=v=>unit(sub(o.initial(cf.part,v),zero)),x=axis(cf.horizontalLocal),down=axis(cf.downLocal),depth=axis(cf.depthLocal),basis=[x,down,depth];
 assert.ok(Math.abs(dot(x,down))+Math.abs(dot(x,depth))+Math.abs(dot(down,depth))<1e-8,'Orthogonal chassis basis');
 const point=(f,m)=>o.point(f,m.part,m.local||[0,0,0]);
 const rawAngles=recording.track.map(f=>{const v=sub(point(f,markers.input.pin),point(f,markers.input.pivot));return Math.atan2(dot(v,down),dot(v,x));});
 const phases=unwrap(rawAngles),first=recording.track[0];
 const initialOutputs=Object.fromEntries(Object.entries(markers.outputs).map(([k,m])=>[k,point(first,m)]));
 return recording.track.map((f,i)=>{
  const pivot=point(f,markers.input.pivot),tip=point(f,markers.input.pin),lv=sub(point(f,markers.longInput.pin),point(f,markers.longInput.pivot)),la=Math.atan2(dot(lv,down),dot(lv,x));
  const hinge=physical.measure(f),guide=guides.measure(f),encoderDeg=deg(f.joints[motor.joint].angle),crankDeg=deg(phases[i]);
  const outputs=Object.fromEntries(Object.entries(markers.outputs).map(([name,m])=>{
   const p=point(f,m),v=sub(p,pivot),delta=sub(p,initialOutputs[name]),positionMm=dot(v,x)*1000;
   const trace=basis.reduce((s,b)=>s+dot(o.vector(f,m.part,b),b),0);
   return[name,{pointMm:p.map(v=>v*1000),positionMm,inwardMm:r+lengths[name]-positionMm,idealPositionMm:expected(rawAngles[i],lengths[name]),lawErrorMm:positionMm-expected(rawAngles[i],lengths[name]),offAxisMm:Math.hypot(dot(delta,down),dot(delta,depth))*1000,rotationDeg:deg(Math.acos(clamp((trace-1)/2))),displacementFromFirstMm:norm(delta)*1000}];
  }));
  const row={t:f.t,phase:f.phase,crankDeg,encoderDeg,transmissionErrorDeg:crankDeg-sign*encoderDeg/ratio,crankPhaseDifferenceDeg:deg(Math.atan2(Math.sin(la-rawAngles[i]),Math.cos(la-rawAngles[i]))),crankRadiusMm:norm(sub(tip,pivot))*1000,outputs,quarterDifferenceMm:outputs.short.inwardMm-outputs.long.inwardMm,hingeGapMm:Math.max(o.gap(f),hinge.gapMm),originalHingeGapMm:hinge.gapMm,axisMismatchDeg:Math.max(o.axisGap(f),hinge.axisMismatchDeg,guide.maxAxisMismatchDeg),guideTransverseMm:guide.maxTransverseMm,minGuideEngagementMm:guide.minEngagementMm,minGuideEndMarginMm:guide.minEndMarginMm,guideInterfaces:guide.observations,baseTiltDeg:o.tilt(f),variables:f.extra?.variables||{}};
  row.finite=Object.values(f.bodies).every(b=>[...b.position,...b.rotation].every(Number.isFinite))&&Object.values(f.joints).every(j=>Object.values(j).filter(v=>typeof v==='number').every(Number.isFinite))&&Object.values(row).filter(v=>typeof v==='number').every(Number.isFinite)&&Object.values(outputs).every(o=>Object.values(o).filter(v=>typeof v==='number').every(Number.isFinite));
  return row;
 });
}
function judge(recording,rows){
 const checks=[],gate=(id,ok,requirement)=>checks.push({id,status:ok?'PASS':'FAIL',requirement});
 const max=(key,a=rows)=>Math.max(...a.map(v=>Math.abs(v[key]))),first=rows[0],last=rows.at(-1),cold=rows.filter(r=>r.phase==='cold'),after=rows.filter(r=>r.phase==='after'),pr=rows.filter(r=>r.phase==='program');
 gate('frames',rows.length>=A.minimumPoseFrames,'At least '+A.minimumPoseFrames+' actual pose frames');
 gate('topology',recording.mechanism.hubs.length===1&&recording.mechanism.actuators.length===1&&recording.mechanism.actuators[0].port==='A'&&recording.mechanism.couplings.filter(c=>c.kind==='worm').length===1&&recording.mechanism.couplings.filter(c=>c.kind==='worm')[0].ratio===1/24,'Exactly one actual hub, motor A and 24:1 worm coupling');
 gate('free_chassis',recording.mechanism.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'),'All bodies containing placed parts dynamic, including chassis');
 gate('issues',recording.issues.length===0&&(recording.mechanism.diagnostics||[]).length===0,'Zero unresolved import/mechanism diagnostics');
 gate('finite',rows.every(r=>r.finite),'All native states and derived observations finite');
 gate('duration',recording.finishedAt!==null&&recording.finishedAt-settings.coldMs<A.maximumProgramDurationSeconds*1000,'Program finishes before the declared watchdog');
 gate('cold_interval',cold.length>=31&&cold.at(-1).t-cold[0].t>=999.9,'Full 1000 ms unpowered cold interval');
 gate('after_interval',after.length>=30&&after.at(-1).t-recording.finishedAt>=999.9,'Full 1000 ms after interval');
 gate('completion',Number(last.variables.completed)===1&&Number(last.variables.failed)===0&&Number(last.variables.stage)===17&&Number(last.variables.arrived)===0,'completed=1, failed=0, final stage17/arrived0');
 gate('input_return',Math.abs(last.encoderDeg)<=contract.control.maximumMotorArrivalErrorDeg,'Actual unwrapped motor returns within 2 degrees');
 const outputMetrics={};
 for(const name of Object.keys(lengths)){
  const maxLaw=Math.max(...rows.map(s=>Math.abs(s.outputs[name].lawErrorMm))),stroke=span(rows.map(s=>s.outputs[name].positionMm)),coldDrift=Math.max(...cold.map(s=>s.outputs[name].displacementFromFirstMm)),returnError=last.outputs[name].displacementFromFirstMm;
  const offAxis=Math.max(...rows.map(s=>s.outputs[name].offAxisMm)),rotation=Math.max(...rows.map(s=>s.outputs[name].rotationDeg));
  gate('datum_'+name,Math.abs(first.outputs[name].positionMm-(r+lengths[name]))<=.5,'Saved '+name+' full-extension datum within0.5mm');
  gate('curve_'+name,maxLaw<=A.maximumPositionLawErrorMm,'Actual '+name+' body position agrees with independent observed-angle law within0.5mm throughout');
  gate('stroke_'+name,stroke>=A.fullStrokeMm[0]&&stroke<=A.fullStrokeMm[1],'Actual '+name+' full stroke47.5–48.5mm');
  gate('cold_'+name,coldDrift<=A.maximumColdOutputDriftMm,'Unpowered '+name+' marker drift at most0.5mm');
  gate('return_'+name,returnError<=A.maximumReturnErrorMm,'Actual '+name+' marker returns within0.5mm');
  gate('off_axis_'+name,offAxis<=A.maximumGuideTransverseErrorMm,'Actual '+name+' marker transverse drift at most0.5mm');
  gate('rotation_'+name,rotation<=A.maximumCarriageRotationDeg,'Actual '+name+' carriage rotation at most2degrees');
  outputMetrics[name]={strokeMm:stroke,maxLawErrorMm:maxLaw,coldDriftMm:coldDrift,returnErrorMm:returnError,maxOffAxisMm:offAxis,maxRotationDeg:rotation};
 }
 const forward=pr.filter(s=>Number(s.variables.stage)<=8),reverse=pr.filter(s=>Number(s.variables.stage)>=8&&Number(s.variables.stage)<=16);
 gate('forward_span',span(forward.map(s=>s.crankDeg))>=A.minimumForwardCrankSpanDeg,'At least355degrees actual forward phase span');
 gate('reverse_span',span(reverse.map(s=>s.crankDeg))>=A.minimumReverseCrankSpanDeg,'At least355degrees actual reverse phase span');
 gate('cold_crank',max('crankDeg',cold)<=A.maximumColdCrankDriftDeg,'Unpowered actual crank drift at most1degree');
 gate('transmission',max('transmissionErrorDeg')<=A.maximumOutputPhaseErrorDeg,'Actual motor/crank phase maintains24:1 within0.5crankdegrees');
 gate('common_phase',max('crankPhaseDifferenceDeg')<=A.maximumOutputPhaseErrorDeg,'Both real crank markers stay in phase within0.5degrees');
 gate('hinge_closure',max('hingeGapMm')<=A.maximumPhysicalHingeGapMm,'All original and compiled hinge interfaces close within0.5mm');
 gate('axes',max('axisMismatchDeg')<=A.maximumPhysicalAxisMismatchDeg,'All original hinge/guide axes align within2degrees');
 gate('guides',max('guideTransverseMm')<=A.maximumGuideTransverseErrorMm&&rows.every(s=>s.minGuideEngagementMm>=7.5&&s.minGuideEndMarginMm>=0),'Each of four real guides stays coaxial within0.5mm and keeps at least7.5mm bore engagement');
 gate('chassis',max('baseTiltDeg')<=A.maximumBaseTiltDeg,'Freestanding chassis tilt within2degrees');
 const order=pr.filter(s=>Number(s.variables.arrived)===1).map(s=>Number(s.variables.stage)).filter((s,i,a)=>!i||s!==a[i-1]);
 gate('stage_order',JSON.stringify(order)===JSON.stringify(A.requiredStages),'Every declared settled stage occurs in chronological order');
 const stages=route.map(target=>{
  const all=pr.filter(s=>Number(s.variables.stage)===target.stage&&Number(s.variables.arrived)===1),end=all.at(-1)?.t??-Infinity,frames=all.filter(s=>s.t>=end-A.settledWindowSeconds*1000-.0001);
  gate('dwell_'+target.stage,all.length>0&&end-all[0].t>=900&&frames.length>=A.minimumSettledSamples&&frames.at(-1).t-frames[0].t>=466.5,'Stage '+target.stage+' observes its1second dwell and final half-second window');
  if(!frames.length)return{stage:target.stage,frames:0};
  gate('motor_target_'+target.stage,frames.every(s=>Math.abs(Number(s.variables.targetA)-target.targetMotorDeg)<1e-6&&Math.abs(s.encoderDeg-target.targetMotorDeg)<=contract.control.maximumMotorArrivalErrorDeg),'Stage '+target.stage+' reaches independent motor target within2degrees');
  gate('phase_'+target.stage,frames.every(s=>Math.abs(s.crankDeg-target.phaseDeg)<=A.maximumOutputPhaseErrorDeg),'Stage '+target.stage+' actual crank reaches target within0.5degrees');
  const outputs=Object.fromEntries(Object.keys(lengths).map(name=>{
   const error=Math.max(...frames.map(s=>Math.abs(s.outputs[name].inwardMm-target.expectedInwardMm[name])));
   gate('waypoint_'+target.stage+'_'+name,error<=A.maximumSettledWaypointErrorMm,'Stage '+target.stage+' actual '+name+' carriage reaches independent target within0.5mm');
   return[name,{meanInwardMm:average(frames.map(s=>s.outputs[name].inwardMm)),maxWaypointErrorMm:error}];
  }));
  if(target.phaseDeg===90||target.phaseDeg===270)gate('difference_'+target.stage,frames.every(s=>s.quarterDifferenceMm>=A.quarterDifferenceMm[0]&&s.quarterDifferenceMm<=A.quarterDifferenceMm[1]),'Stage '+target.stage+' actual short-minus-long inward travel is4.315±0.5mm');
  return{stage:target.stage,targetPhaseDeg:target.phaseDeg,frames:frames.length,dwellCoverageMs:end-all[0].t,settledCoverageMs:frames.at(-1).t-frames[0].t,meanActualCrankDeg:average(frames.map(s=>s.crankDeg)),maxMotorErrorDeg:Math.max(...frames.map(s=>Math.abs(s.encoderDeg-target.targetMotorDeg))),meanDifferenceMm:average(frames.map(s=>s.quarterDifferenceMm)),outputs};
 });
 return{checks,failures:checks.filter(c=>c.status==='FAIL'),metrics:{frames:rows.length,programDurationMs:recording.finishedAt-settings.coldMs,outputs:outputMetrics,forwardCrankSpanDeg:span(forward.map(s=>s.crankDeg)),reverseCrankSpanDeg:span(reverse.map(s=>s.crankDeg)),maxTransmissionErrorDeg:max('transmissionErrorDeg'),maxCrankPhaseDifferenceDeg:max('crankPhaseDifferenceDeg'),maxHingeGapMm:max('hingeGapMm'),maxOriginalHingeGapMm:max('originalHingeGapMm'),maxAxisMismatchDeg:max('axisMismatchDeg'),maxGuideTransverseMm:max('guideTransverseMm'),minGuideEngagementMm:Math.min(...rows.map(s=>s.minGuideEngagementMm)),minGuideEndMarginMm:Math.min(...rows.map(s=>s.minGuideEndMarginMm)),maxBaseTiltDeg:max('baseTiltDeg'),coldCrankDriftDeg:max('crankDeg',cold),finalEncoderDeg:last.encoderDeg,stageOrder:order,stages,finalVariables:last.variables}};
}
const identities={modelSha256:sha(model),programSha256:sha(program),markersSha256:sha(markersBytes),contractSha256:sha(contractBytes),checkSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),physicalHingeObserverSha256:sha(read('checks/physical-hinge-observer.mjs')),physicalGuideObserverSha256:sha(read('checks/physical-guide-observer.mjs'))};
try{
 run=await runRobotLabProgram(program.toString(),{modelText:model.toString(),autoPorts:false,timeLimitMs:settings.timeLimitMs,frameMs:settings.frameMs,coldMs:settings.coldMs,afterMs:settings.afterMs,observeFrame:({vm,session})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value]))),time:session.time})});
 const raw=gzipSync(Buffer.from(JSON.stringify(run)),{level:9});fs.writeFileSync(path.join(out,'recording.json.gz'),raw);
 physical=await createPhysicalHingeObserver(run,{repo,expectedInterfaces:markers.physicalHingeInterfaces});
 guides=await createPhysicalGuideObserver(run,{repo,expectedInterfaces:markers.physicalGuideInterfaces});
 const rows=measure(run),result=judge(run,rows),negativeControls=[];
 for(const name of Object.keys(lengths)){
  const body=run.mechanism.bodies.find(b=>b.parts.includes(markers.outputs[name].part)),altered={...run,track:run.track.map(f=>({...f,bodies:{...f.bodies,[body.id]:run.track[0].bodies[body.id]}}))};
  const alteredRows=measure(altered),judgment=judge(altered,alteredRows),failedIds=judgment.failures.map(f=>f.id),detected=['curve_'+name,'stroke_'+name].every(id=>failedIds.includes(id));
  negativeControls.push({output:name,status:detected?'PASS_OBSERVER_DETECTS_FROZEN_OUTPUT':'FAIL',alteration:'Freeze only this passive body in a copy of the recording; no physical run was modified.',failedGateIds:failedIds,metrics:judgment.metrics.outputs[name]});
  if(!detected)result.failures.push({id:'negative_'+name,status:'FAIL',requirement:'Observer must detect frozen '+name+' curve and stroke'});
 }
 fs.writeFileSync(path.join(out,'observations.json.gz'),gzipSync(Buffer.from(JSON.stringify(rows)),{level:9}));
 fs.writeFileSync(path.join(out,'physical-interfaces.json'),JSON.stringify({hinges:physical.interfaces,guides:guides.interfaces},null,2)+'\n');
 const receipt={status:result.failures.length?'FAIL':'PASS',scope:'Exact exported model and program, direct fixed-session registered Creator/Scratch VM/Robot Lab/native Jolt qualification. Browser application lifecycle and hardware remain untested.',...identities,recordingSha256:sha(raw),baseline:contract.baseline,runtime:{node:process.version,frameMs:settings.frameMs,nativeStepMs:5,coldMs:settings.coldMs,afterMs:settings.afterMs,allPlacedPartBodiesDynamic:run.mechanism.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic')},physicalHingeInterfaceCount:physical.interfaces.length,physicalGuideInterfaceCount:guides.interfaces.length,negativeControls,...result};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({out,status:receipt.status,failures:receipt.failures,metrics:receipt.metrics,negativeControls:negativeControls.map(c=>({output:c.output,status:c.status}))},null,2));
 if(receipt.status!=='PASS')process.exitCode=1;
}catch(error){
 const receipt={status:'ERROR',...identities,error:error.stack||String(error)};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');console.error(JSON.stringify(receipt,null,2));process.exitCode=1;
}
