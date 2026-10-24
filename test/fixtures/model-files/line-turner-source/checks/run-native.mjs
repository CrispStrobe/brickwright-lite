#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Exact exported BW -> registered Creator -> actual Scratch VM -> Robot Lab -> Jolt.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createLineObserver} from './line-observer.mjs';
const addon=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const repo=path.resolve(arg('--repo',path.join(addon,'../brickwright-baseline'))),out=path.resolve(arg('--out',path.join(addon,'evidence/native')));
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(path.join(addon,p));
const model=read('models/line-turner.ldr'),program=read('programs/line-turner.bw'),markerBytes=read('markers.json'),markers=JSON.parse(markerBytes),contractBytes=read('docs/contract.json'),contract=JSON.parse(contractBytes);
assert.equal(contract.state,'FROZEN BEFORE NATIVE QUALIFICATION');
for(const [p,digest]of Object.entries(contract.inputs))assert.equal(sha(read(p)),digest,'Frozen qualified input changed: '+p);
for(const [p,digest]of Object.entries(contract.runtimeSources))assert.equal(sha(fs.readFileSync(path.join(repo,p))),digest,'Frozen runtime source changed: '+p);
fs.mkdirSync(out,{recursive:true});assert.ok(!fs.existsSync(path.join(out,'result.json')),'Use a new evidence directory; preserve earlier runs');
for(const [n,b]of Object.entries({'input.ldr':model,'input.bw':program,'markers.json':markerBytes,'contract.json':contractBytes}))fs.writeFileSync(path.join(out,n),b);
const {runRobotLabProgram}=await import(pathToFileURL(path.join(repo,'test/helpers/robot-lab-direct-vm.mjs')).href);
const S=contract.recording,A=contract.acceptance,G=contract.observerGeometry,C=contract.control,route=contract.route,sign=contract.datum.directionAForInwardSlider;
const span=a=>Math.max(...a)-Math.min(...a),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const identities={modelSha256:sha(model),programSha256:sha(program),markersSha256:sha(markerBytes),contractSha256:sha(contractBytes),checkSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),lineObserverSha256:sha(read('checks/line-observer.mjs')),physicalHingeObserverSha256:sha(read('checks/physical-hinge-observer.mjs')),physicalGuideObserverSha256:sha(read('checks/physical-guide-observer.mjs'))};
async function measure(run){
 const observed=await createLineObserver(run,{repo,markers,geometry:G,motorDirectionForInwardSlider:sign});
 observed.rows.forEach((r,i)=>{r.maximumHingeStepDeg=i?Math.max(...run.mechanism.joints.filter(j=>j.type==='hinge').map(j=>Math.abs(run.track[i].joints[j.id].angle-run.track[i-1].joints[j.id].angle)*180/Math.PI)):0;});
 return observed;
}
function judge(run,observed){
 const rows=observed.rows,checks=[],gate=(id,ok,requirement)=>checks.push({id,status:ok?'PASS':'FAIL',requirement});
 const first=rows[0],last=rows.at(-1),cold=rows.filter(r=>r.phase==='cold'),after=rows.filter(r=>r.phase==='after'),pr=rows.filter(r=>r.phase==='program');
 const max=(k,list=rows)=>Math.max(...list.map(r=>Math.abs(r[k]))),minimum=k=>Math.min(...rows.map(r=>r[k]));
 const rack=run.mechanism.couplings.filter(c=>c.kind==='rackAndPinion');
 gate('coverage',rows.length>=A.minimumPoseFrames,'At least '+A.minimumPoseFrames+' actual pose frames');
 gate('topology',run.mechanism.hubs.length===1&&run.mechanism.actuators.length===1&&run.mechanism.actuators[0].port==='A'&&run.mechanism.couplings.length===1&&rack.length===1&&Math.abs(Math.abs(rack[0].ratio)-G.pinionPitchRadiusLdu*.0004)<1e-10,'Exactly one real hub, useful motor A and declared rack/pinion coupling');
 gate('physical_interfaces',observed.physicalInterfaces.length===markers.physicalHingeInterfaces.length&&observed.guideInterfaces.length===markers.physicalGuideInterfaces.length,'Every preregistered original hinge and guide interface is observed');
 gate('full_dynamic_model',run.mechanism.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'),'All placed-part bodies are dynamic, including the actual supporting chassis');
 gate('no_loop_substitution',!run.mechanism.joints.some(j=>j.type==='ball')&&(run.mechanism.solver?.loopBalls||[]).length===0,'Strict import retains the original hinge constraints');
 gate('diagnostics',run.issues.length===0&&(run.mechanism.diagnostics||[]).length===0,'No unresolved import or native mechanism diagnostics');
 gate('finite',rows.every(r=>r.finite),'Every actual body/joint state and derived observation is finite');
 gate('completion',Number(last.variables.completed)===1&&Number(last.variables.failed)===0&&Number(last.variables.stage)===A.finalStage&&Number(last.variables.arrived)===0&&last.motorBusy===false,'All route stages finish, completed=1, failed=0, final stage7/arrived0 and motor is no longer busy');
 gate('duration',run.finishedAt!==null&&run.finishedAt-S.coldMs<A.maximumProgramDurationSeconds*1000,'Actual VM completion precedes the60second watchdog');
 gate('cold_coverage',cold.length>=30&&cold.at(-1).t-cold[0].t>=999.9,'The full1000ms default passive-brake startup interval is observed before the green flag');
 gate('after_coverage',after.length>=30&&after.at(-1).t-run.finishedAt>=999.9,'The full1000ms held after-completion interval is observed');
 gate('saved_datum',Math.abs(first.inputXmm-G.savedSliderXLdu*.4)<=.05&&Math.abs(first.outputUpMm-Math.sqrt((G.longLinkLdu*.4)**2-(G.savedSliderXLdu*.4)**2))<=.05,'Actual saved input and free-tip coordinates agree with the declared datum within0.05mm');
 const outputStroke=span(rows.map(r=>r.outputUpMm)),inputStroke=span(rows.map(r=>r.inputXmm));
 gate('output_stroke',outputStroke>=A.minimumTipStrokeMm&&outputStroke<=A.maximumTipStrokeMm,'Actual free tip spans23.0..23.7mm');
 gate('input_stroke',inputStroke>=A.minimumSliderStrokeMm&&inputStroke<=A.maximumSliderStrokeMm,'Actual carriage spans18.8..19.6mm');
 gate('output_line',max('outputLineErrorMm')<=A.maximumTipLineErrorMm,'Actual B stays within0.5mm of its fixed perpendicular line, including depth error');
 gate('input_line',max('inputLineErrorMm')<=A.maximumInputLineErrorMm,'Actual A stays within0.5mm of the fixed input line');
 gate('geometric_law',max('lawErrorMm')<=A.maximumTipHeightLawErrorMm,'Actual B agrees with sqrt(64²−actual A.x²) within1mm throughout');
 gate('midpoint_circle',max('shortLinkRadiusErrorMm')<=A.maximumMidpointCircleErrorMm,'The actual short-link midpoint joint follows its32mm circle');
 gate('midpoint_closure',max('midpointClosureMm')<=A.maximumMidpointClosureMm&&max('midpointLawErrorMm')<=A.maximumMidpointClosureMm,'Actual midpoint bodies and midpoint proportions agree within0.5mm');
 gate('input_pivot_closure',max('inputPivotClosureMm')<=A.maximumPhysicalHingeGapMm,'Independent carriage and long-bar A markers remain aligned at the real pivot');
 gate('rack_law',max('rackLawErrorMm')<=A.maximumRackLawErrorMm,'Actual carriage displacement agrees with measured encoder and physical pitch radius within0.5mm');
 gate('pinion_encoder',max('inputEncoderErrorDeg')<=A.maximumInputEncoderResidualDeg,'Actual pinion orientation independently agrees with the actual motor hinge encoder within1degree');
 gate('sample_steps',max('maximumHingeStepDeg')<=A.maximumHingeStepDeg,'Actual hinge accumulators change less than60degrees per frame');
 gate('operating_envelope',rows.every(r=>r.inputXmm>=contract.softwareEnvelopeLdu[0]*.4&&r.inputXmm<=contract.softwareEnvelopeLdu[1]*.4&&r.outputUpMm>0),'Every observed pose remains in the declared upper branch and94..146LDU operating envelope');
 gate('hinges',max('hingeGapMm')<=A.maximumPhysicalHingeGapMm,'All original and compiled hinge points close within0.5mm');
 gate('axes',max('axisMismatchDeg')<=A.maximumPhysicalAxisMismatchDeg,'All original and compiled hinge and guide axes align within2degrees');
 gate('guides',max('guideTransverseMm')<=A.maximumGuideTransverseErrorMm&&minimum('minGuideEngagementMm')>=A.minimumGuideEngagementMm&&minimum('minGuideEndMarginMm')>=0,'Every real guide remains aligned within0.5mm with at least7.5mm bore engagement and no exposed bore end');
 gate('carriage_attitude',max('carriageRotationDeg')<=A.maximumCarriageRotationDeg,'The physically supported input carriage rotates less than2degrees');
 gate('chassis',max('baseTiltDeg')<=A.maximumBaseTiltDeg&&max('baseRotationDeg')<=A.maximumBaseRotationDeg&&max('baseTranslationMm')<=A.maximumBaseTranslationMm,'The actual freestanding chassis remains within2degrees and2mm of its starting pose');
 gate('cold_output',cold.length>0&&max('outputReturnDistanceMm',cold)<=A.maximumColdOutputDriftMm,'Free tip cold drift under the default passive brake is at most0.5mm');
 gate('cold_input',cold.length>0&&max('sliderReturnDistanceMm',cold)<=A.maximumColdSliderDriftMm,'Actual carriage cold drift under the default passive brake is at most0.5mm');
 gate('cold_motor_datum',cold.length>0&&Math.abs(cold.at(-1).encoderDeg)<=A.maximumMotorDatumErrorDeg,'Independent pre-flag motor encoder remains within the declared datum tolerance');
 gate('output_return',last.outputReturnDistanceMm<=A.maximumTipReturnErrorMm,'Actual free tip returns within0.5mm of the saved pose');
 gate('input_return',last.sliderReturnDistanceMm<=A.maximumTipReturnErrorMm&&Math.abs(last.encoderDeg)<=A.maximumMotorReturnErrorDeg,'Actual carriage returns within0.5mm and motor returns within2degrees');
 const order=pr.filter(r=>Number(r.variables.arrived)===1).map(r=>Number(r.variables.stage)).filter((s,i,a)=>!i||s!==a[i-1]);
 gate('stage_order',JSON.stringify(order)===JSON.stringify(A.allStagesRequired),'Every declared settled stage occurs once in chronological order');
 const stages=route.map(target=>{
  const all=pr.filter(r=>Number(r.variables.stage)===target.stage&&Number(r.variables.arrived)===1),end=all.at(-1)?.t??-Infinity,settled=all.filter(r=>r.t>=end-A.settledWindowMs-.0001);
  gate('dwell_'+target.stage,all.length>0&&end-all[0].t>=C.dwellSeconds*1000-S.frameMs-1&&settled.length>=A.minimumSettledSamplesPerStage&&settled.at(-1).t-settled[0].t>=A.settledWindowMs-S.frameMs-1,'Stage '+target.stage+' supplies its complete2second dwell and final1second measurement window');
  if(!settled.length)return{stage:target.stage,samples:0};
  const maxInputError=Math.max(...settled.map(r=>Math.abs(r.inputXmm-target.sliderXMm))),maxTipError=Math.max(...settled.map(r=>Math.abs(r.outputUpMm-target.predictedTipHeightMm))),maxMotorError=Math.max(...settled.map(r=>Math.abs(r.encoderDeg-target.targetMotorDeg)));
  gate('target_'+target.stage,settled.every(r=>Math.abs(Number(r.variables.targetA)-target.targetMotorDeg)<1e-7&&Number(r.variables.directionA)===sign&&Math.abs(Number(r.variables.sliderTargetMm)-target.sliderXMm)<1e-7),'Stage '+target.stage+' uses the independently declared actual motor/slider target');
  gate('motor_'+target.stage,maxMotorError<=A.maximumMotorArrivalErrorDeg,'Stage '+target.stage+' actual motor is within2degrees of target');
  gate('slider_'+target.stage,maxInputError<=A.maximumSliderWaypointErrorMm,'Stage '+target.stage+' actual input carriage is within0.5mm of target');
  gate('tip_'+target.stage,maxTipError<=A.maximumTipWaypointErrorMm,'Stage '+target.stage+' actual free-tip height is within1mm of the predicted waypoint');
  return{stage:target.stage,leg:target.leg,samples:settled.length,dwellCoverageMs:end-all[0].t,settledCoverageMs:settled.at(-1).t-settled[0].t,targetSliderXMm:target.sliderXMm,targetTipHeightMm:target.predictedTipHeightMm,targetMotorDeg:target.targetMotorDeg,meanSliderXMm:mean(settled.map(r=>r.inputXmm)),meanTipHeightMm:mean(settled.map(r=>r.outputUpMm)),meanMidpointRadiusMm:mean(settled.map(r=>r.shortLinkRadiusMm)),maxSliderErrorMm:maxInputError,maxTipErrorMm:maxTipError,maxMotorErrorDeg:maxMotorError};
 });
 if(stages.every(s=>s.samples>0)){
  gate('settled_forward_travel',stages[3].meanTipHeightMm-stages[0].meanTipHeightMm>=A.minimumTipStrokeMm,'Settled stages0..3 show at least23mm actual tip travel');
  gate('settled_reverse_travel',stages[3].meanTipHeightMm-stages[6].meanTipHeightMm>=A.minimumTipStrokeMm,'Settled stages3..6 retrace at least23mm actual tip travel');
  gate('direction',stages.slice(1,4).every((s,i)=>s.meanSliderXMm<stages[i].meanSliderXMm&&s.meanTipHeightMm>stages[i].meanTipHeightMm)&&stages.slice(4).every((s,i)=>s.meanSliderXMm>stages[i+3].meanSliderXMm&&s.meanTipHeightMm<stages[i+3].meanTipHeightMm),'Actual input and output move in the expected directions on both route legs');
 }
 return{checks,failures:checks.filter(c=>c.status==='FAIL'),metrics:{frames:rows.length,programFrames:pr.length,coldFrames:cold.length,afterFrames:after.length,programDurationMs:run.finishedAt===null?null:run.finishedAt-S.coldMs,outputStrokeMm:outputStroke,inputStrokeMm:inputStroke,maxOutputLineErrorMm:max('outputLineErrorMm'),maxInputLineErrorMm:max('inputLineErrorMm'),maxGeometricLawErrorMm:max('lawErrorMm'),maxCircleResidualMm:max('circleResidualMm'),maxMidpointCircleErrorMm:max('shortLinkRadiusErrorMm'),maxMidpointClosureMm:max('midpointClosureMm'),maxRackLawErrorMm:max('rackLawErrorMm'),maxInputEncoderErrorDeg:max('inputEncoderErrorDeg'),maxOriginalHingeGapMm:max('originalHingeGapMm'),maxPhysicalHingeGapMm:max('hingeGapMm'),maxPhysicalAxisMismatchDeg:max('axisMismatchDeg'),maxGuideTransverseMm:max('guideTransverseMm'),minGuideEngagementMm:minimum('minGuideEngagementMm'),minGuideEndMarginMm:minimum('minGuideEndMarginMm'),maxCarriageRotationDeg:max('carriageRotationDeg'),maxBaseTiltDeg:max('baseTiltDeg'),maxBaseRotationDeg:max('baseRotationDeg'),maxBaseTranslationMm:max('baseTranslationMm'),maxHingeStepDeg:max('maximumHingeStepDeg'),coldOutputDriftMm:max('outputReturnDistanceMm',cold),coldInputDriftMm:max('sliderReturnDistanceMm',cold),outputReturnErrorMm:last.outputReturnDistanceMm,sliderReturnErrorMm:last.sliderReturnDistanceMm,finalEncoderDeg:last.encoderDeg,stageOrder:order,stages,finalVariables:last.variables,finalMotorBusy:last.motorBusy}};
}
try{
 const run=await runRobotLabProgram(program.toString(),{modelText:model.toString(),autoPorts:false,timeLimitMs:S.timeLimitMs,frameMs:S.frameMs,coldMs:S.coldMs,afterMs:S.afterMs,observeFrame:({vm})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value])))})});
 const raw=gzipSync(Buffer.from(JSON.stringify(run)),{level:9});fs.writeFileSync(path.join(out,'recording.json.gz'),raw);
 const observed=await measure(run),result=judge(run,observed),negativeControls=[];
 for(const [name,marker,required]of [['output','output',['geometric_law','output_stroke']],['input','slider',['geometric_law','input_stroke','rack_law']]]){
  const body=observed.owners[marker].body,altered={...run,track:run.track.map(f=>({...f,bodies:{...f.bodies,[body]:run.track[0].bodies[body]}}))},control=judge(altered,await measure(altered)),failed=control.failures.map(g=>g.id),detected=required.every(k=>failed.includes(k));
  negativeControls.push({marker:name,body,status:detected?'PASS_OBSERVER_DETECTS_FROZEN_MEMBER':'FAIL',alteration:'Freeze only this actual member body in a copied recording; the original physics run is unchanged.',requiredFailedGates:required,failedGateIds:failed});
  if(!detected)result.failures.push({id:'observer_control_'+name,status:'FAIL',requirement:'Observer detects the frozen '+name+' through '+required.join(', ')});
 }
 fs.writeFileSync(path.join(out,'observations.json.gz'),gzipSync(Buffer.from(JSON.stringify(observed.rows)),{level:9}));
 fs.writeFileSync(path.join(out,'physical-interfaces.json'),JSON.stringify({hinges:observed.physicalInterfaces,guides:observed.guideInterfaces,owners:observed.owners},null,2)+'\n');
 const receipt={status:result.failures.length?'FAIL':'PASS',scope:'Exact exported model and BW in a direct fixed session through the registered Creator, actual Scratch VM, Robot Lab controller and native Jolt. No artificial clamps or assigned output poses. Browser lifecycle and physical LEGO build remain untested.',...identities,recordingSha256:sha(raw),baseline:contract.baseline,runtime:{node:process.version,BW_INTEGRATED_ROOT:process.env.BW_INTEGRATED_ROOT||null,frameMs:S.frameMs,nativeStepMs:5,coldMs:S.coldMs,afterMs:S.afterMs,allPlacedPartBodiesDynamic:run.mechanism.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'),coldDrive:'Pinned SPIKE default passive electrical brake at zero duty, without position feedback'},topology:{bodies:run.mechanism.bodies.map(b=>({id:b.id,motion:b.motion,parts:b.parts})),joints:run.mechanism.joints,couplings:run.mechanism.couplings,actuators:run.mechanism.actuators,hubs:run.mechanism.hubs,solver:run.mechanism.solver},physicalHingeInterfaceCount:observed.physicalInterfaces.length,physicalGuideInterfaceCount:observed.guideInterfaces.length,negativeControls,...result};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({out,status:receipt.status,failures:receipt.failures,metrics:receipt.metrics,negativeControls},null,2));
 if(receipt.status!=='PASS')process.exitCode=1;
}catch(error){
 const receipt={status:'ERROR',...identities,error:error.stack||String(error)};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');console.error(JSON.stringify(receipt,null,2));process.exitCode=1;
}
