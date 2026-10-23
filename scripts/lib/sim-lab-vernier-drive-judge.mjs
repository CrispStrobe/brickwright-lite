// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reviewed extraction from the retained original source runner SHA256
// f75ac704f4fca2e10f17a1b4e4ae8bad16ff895c34a871c1e70ed2e2011d6252. Every original physical gate
// runs in native mode. Browser mode checks its actual program and after poses;
// the full unpowered startup remains an explicit native-suite responsibility.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createPhysicalHingeObserver} from '../../test/fixtures/model-files/vernier-drive-source/checks/physical-hinge-observer.mjs';
import {measureRotations} from '../../test/fixtures/model-files/vernier-drive-source/checks/rotational-observer.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const fixture=new URL('../../test/fixtures/model-files/vernier-drive-source/',import.meta.url);
const contract=JSON.parse(readFileSync(new URL('docs/contract.json',fixture)));
const markers=JSON.parse(readFileSync(new URL('markers.json',fixture)));
export async function evaluateVernierDrive(run,{native=true}={}){
const A=contract.acceptance,T=contract.transmission,G=contract.geometry.programGeometry||contract.geometry,S={...contract.recording,coldMs:native?contract.recording.coldMs:(run.start||0)},route=contract.route;
const intendedRoute=[0,90,180,270,360,270,180,90,0],near=(a,b)=>Math.abs(a-b)<1e-8;
assert.deepEqual(route.map(r=>r.outputDeg),intendedRoute,'Frozen route must match independently declared experiment');
assert.ok([1,-1].includes(T.inputRatio)&&near(T.leftRatio,T.inputRatio)&&near(T.rightRatio,-27/25*T.inputRatio)&&near(T.carrierRatio,-1/25*T.inputRatio)&&near(T.outputRatio,1/25*T.inputRatio)&&T.outputPerCarrier===-1,'Exact signed25:1 transmission must agree with geometric design');
for(const [i,r]of route.entries()){
 assert.equal(r.stage,i);assert.equal(r.leg,i<=4?'forward':'reverse');
 assert.ok(near(r.targetMotorDeg,intendedRoute[i]*25/T.inputRatio)&&near(r.predictedLeftDeg,intendedRoute[i]*25)&&near(r.predictedRightDeg,-intendedRoute[i]*27)&&near(r.predictedCarrierDeg,-intendedRoute[i]),'Independent route arithmetic at stage'+i);
}
const span=a=>a.length?Math.max(...a)-Math.min(...a):NaN,max=a=>a.length?Math.max(...a.map(Math.abs)):NaN,mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const couplingSignature=cs=>cs.map(c=>({kind:c.kind,parts:[...c.parts].sort(),ratio:c.ratio,carrier:!!c.carrier})).sort((a,b)=>a.parts.join('|').localeCompare(b.parts.join('|')));
let physical;
async function measure(run){
 const measured=await measureRotations(run,markers,{repo});
 const rows=measured.rows.map((r,i)=>{
  const a=Object.fromEntries(Object.entries(r.rotations).map(([k,v])=>[k,v.angleDeg])),h=physical.measure(run.track[i]);
  const residuals={inputEncoder:a.input-T.inputRatio*r.encoderDeg,left:a.left-G.expectedRatios.left*a.input,right:a.right-G.expectedRatios.right*a.input,mean:a.carrier-(a.left+a.right)/2,takeoff:a.output-T.outputPerCarrier*a.carrier,reduction:a.output-G.expectedRatios.output*a.input};
  for(const k of ['compound_j','compound_k','spider'])if(G.expectedRatios[k]!==undefined)residuals[k]=a[k]-G.expectedRatios[k]*a.input;
  const nativeHingeStepDeg=i?Math.max(...run.mechanism.joints.filter(j=>j.type==='hinge').map(j=>Math.abs(run.track[i].joints[j.id].angle-run.track[i-1].joints[j.id].angle)*180/Math.PI)):0;
  return{...r,anglesDeg:a,residualsDeg:residuals,nativeHingeStepDeg,physicalHingeGapMm:Math.max(h.gapMm,r.compiledHingeGapMm),originalPhysicalHingeGapMm:h.gapMm,physicalAxisMismatchDeg:Math.max(h.axisMismatchDeg,r.compiledAxisMismatchDeg)};
 });
 return{...measured,rows};
}
function judge(run,measured){
 const rows=measured.rows,checks=[],gate=(id,ok,requirement)=>{if(!native&&id.startsWith('cold'))return;checks.push({id,status:ok?'PASS':'FAIL',requirement});};
 const first=rows[0],last=rows.at(-1),pr=rows.filter(r=>r.phase==='program'),cold=rows.filter(r=>r.phase==='cold'),after=rows.filter(r=>r.phase==='after');
 const maximum=key=>max(rows.map(r=>r[key])),angle=(r,k)=>r.anglesDeg[k],owners=measured.owners;
 const passive=['right','carrier','output'].map(k=>owners[k].body),motor=run.mechanism.joints.find(j=>j.id===measured.motorJoint);
 const carriers=run.mechanism.couplings.filter(c=>c.kind==='relativeGear'&&c.carrier);
 gate('frames',rows.length>=A.minimumPoseFrames,'At least '+A.minimumPoseFrames+' actual native pose frames');
 gate('finite',rows.every(r=>r.finite&&Object.values(r.residualsDeg).every(Number.isFinite)),'Every raw body/joint state and derived angle/residual is finite');
 gate('hub_motor',run.mechanism.hubs.length===1&&run.mechanism.actuators.length===1&&run.mechanism.actuators[0].port==='A'&&run.mechanism.actuators[0].hub===run.mechanism.hubs[0].id,'One actual hub and its explicitly bound motor A');
 gate('free_chassis',run.mechanism.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'),'Every body containing a placed part is dynamic, including the chassis');
 gate('issues',run.issues.length===0&&(run.mechanism.diagnostics||[]).length===0,'No unresolved import or mechanism diagnostics');
 gate('topology',JSON.stringify(couplingSignature(run.mechanism.couplings))===JSON.stringify(couplingSignature(contract.topology.couplings))&&run.mechanism.couplings.length===6,'Exactly the six preregistered physical gear meshes');
 gate('differential_meshes',carriers.length===2&&carriers.every(c=>c.frame===owners.carrier.body),'Both native side/spider gear meshes use the actual differential carrier frame');
 gate('independent_members',new Set([owners.left.body,owners.right.body,owners.carrier.body,owners.output.body]).size===4&&passive.every(id=>id!==motor.body2&&id!==measured.baseBody),'Left, right, carrier and pointer are distinct; right/carrier/pointer are unactuated passive bodies');
 gate('reference_frames',Object.keys(owners).filter(k=>k!=='spider').every(k=>owners[k].relativeBody===measured.baseBody)&&(!owners.spider||owners.spider.relativeBody===owners.carrier.body),'All main and compound-shaft markers reference the actual chassis; the spider alone references the actual carrier');
 if(owners.spider)gate('spider_owner',![owners.left.body,owners.right.body,owners.carrier.body,owners.output.body,measured.baseBody].includes(owners.spider.body),'Actual spider is independently free on its carrier seat');
 const carrierPart=markers.rotationMarkers.carrier.part,carrierInterfaces=physical.interfaces.filter(i=>i.a.part===carrierPart||i.b.part===carrierPart),carrierConnectors=new Set(carrierInterfaces.flatMap(i=>[i.a,i.b].filter(e=>e.part===carrierPart).map(e=>e.connector)));
 gate('physical_differential_interfaces',['h0','h1','q0'].every(k=>carrierConnectors.has(k))&&carrierInterfaces.every(i=>!i.sameBody),'Original casing h0/h1 side bearings and q0 spider seat remain between independent bodies');
 if(owners.spider)gate('differential_contacts',[owners.left.body,owners.right.body].every(side=>carriers.some(c=>[c.gear1,c.gear2].includes(side)&&[c.gear1,c.gear2].includes(owners.spider.body))),'Actual spider meshes separately with each actual side body');
 gate('duration',run.finishedAt!==null&&run.finishedAt-S.coldMs<A.maximumProgramDurationSeconds*1000,'Actual VM program completes before its150-second watchdog');
 gate('cold_interval',cold.length>=31&&cold.at(-1).t-cold[0].t>=S.coldMs-.1,'Full declared1000ms unpowered cold interval');
 gate('after_interval',after.length>=30&&after.at(-1).t-run.finishedAt>=S.afterMs-.1,'Full declared1000ms after interval');
 gate('completion',Number(last.variables.completed)===A.completed&&Number(last.variables.failed)===A.failed&&Number(last.variables.stage)===A.finalStage&&Number(last.variables.arrived)===A.finalArrived,'completed1, failed0, final stage9 and arrived0');
 gate('motor_not_busy',Object.values(last.busy).every(v=>!v),'All actual motor commands are complete');
 gate('motor_datum',Math.abs(first.encoderDeg)<=A.maximumMotorDatumErrorDeg,'Saved motor datum within1degree; no encoder reset');
 gate('motor_return',Math.abs(last.encoderDeg)<=A.maximumMotorReturnErrorDeg,'Actual unwrapped motor encoder returns within2degrees');
 gate('native_sample_steps',maximum('nativeHingeStepDeg')<A.maximumNativeHingeStepDeg,'Native hinge accumulators advance less than60degrees per recorded sample, independently supporting body-marker turn counts');
 const residualMax=Object.fromEntries(Object.keys(first.residualsDeg).map(k=>[k,max(rows.map(r=>r.residualsDeg[k]))]));
 for(const [id,k,bound,requirement]of [
  ['input_encoder','inputEncoder',A.maximumInputEncoderResidualDeg,'Actual input body agrees with the motor encoder and measured sign within1degree'],
  ['branch_left','left',A.maximumBranchRatioResidualDeg,'Actual left input follows the direct branch within1degree'],
  ['branch_right','right',A.maximumBranchRatioResidualDeg,'Actual right input follows the−27/25 compound ratio within1degree'],
  ['mean','mean',A.maximumCarrierSignedMeanResidualDeg,'Actual carrier is the mean of the two actual side rotations within1degree'],
  ['takeoff','takeoff',A.maximumTakeoffResidualDeg,'Actual pointer reverses actual carrier within1degree'],
  ['reduction','reduction',A.maximumOverallReductionResidualDeg,'Actual output equals actual input/25 within1degree']
 ])gate(id,residualMax[k]<=bound,requirement);
 for(const k of ['compound_j','compound_k','spider'])gate('ratio_'+k,owners[k]&&Number.isFinite(G.expectedRatios[k])&&residualMax[k]<=A.maximumBranchRatioResidualDeg,'Independently observed '+k+' maintains its preregistered ratio within1degree');
 const forward=pr.filter(r=>Number(r.variables.stage)<=4),reverse=pr.filter(r=>Number(r.variables.stage)>=4&&Number(r.variables.stage)<=8),rotationMetrics={};
 for(const k of Object.keys(owners)){
  const fspan=span(forward.map(r=>angle(r,k))),rspan=span(reverse.map(r=>angle(r,k))),coldDrift=max(cold.map(r=>angle(r,k)-angle(first,k))),returnError=Math.abs(angle(last,k)-angle(first,k));
  rotationMetrics[k]={forwardSpanDeg:fspan,reverseSpanDeg:rspan,coldDriftDeg:coldDrift,returnErrorDeg:returnError,finalAngleDeg:angle(last,k),maximumStepDeg:max(rows.map(r=>r.rotations[k].stepDeg)),maximumAxisMismatchDeg:max(rows.map(r=>r.rotations[k].axisMismatchDeg)),maximumAxisCenterDriftMm:max(rows.map(r=>r.rotations[k].centerDriftMm))};
  gate('unwrapped_'+k,rotationMetrics[k].maximumStepDeg<A.maximumMarkerStepDeg,'Actual '+k+' steps below120degrees, avoiding turn-count ambiguity at the declared sample rate');
  gate('axis_'+k,rotationMetrics[k].maximumAxisMismatchDeg<=A.maximumMarkerAxisErrorDeg&&rotationMetrics[k].maximumAxisCenterDriftMm<=A.maximumAxisCenterDriftMm,'Actual '+k+' stays on its reference axis within2degrees/0.5mm');
  if(k==='carrier'||k==='output'){
   const cap=k==='carrier'?'Carrier':'Output';
   gate('forward_span_'+k,fspan>=A['minimum'+cap+'SpanEachDirectionDeg'],'Actual '+k+' forward span at least355degrees');
   gate('reverse_span_'+k,rspan>=A['minimum'+cap+'SpanEachDirectionDeg'],'Actual '+k+' reverse span at least355degrees');
   gate('cold_'+k,coldDrift<=A['maximumCold'+cap+'DriftDeg'],'Unpowered '+k+' drift at most1degree');
   gate('return_'+k,returnError<=A['maximum'+cap+'ReturnErrorDeg'],'Actual '+k+' return error at most1degree');
  }
 }
 gate('hinge_closure',maximum('physicalHingeGapMm')<=A.maximumPhysicalHingeGapMm,'Every original and compiled hinge closes within0.5mm');
 gate('physical_axes',maximum('physicalAxisMismatchDeg')<=A.maximumPhysicalHingeAxisErrorDeg,'Every original and compiled hinge axis agrees within2degrees');
 gate('base_tilt',maximum('baseTiltDeg')<=A.maximumBaseTiltDeg,'Freestanding actual chassis tilt within2degrees');
 gate('base_stationary',maximum('baseRotationDeg')<=A.maximumBaseRotationDeg&&maximum('baseTranslationMm')<=A.maximumBaseTranslationMm,'Complete actual chassis orientation changes by at most2degrees and translation by at most2mm');
 const order=pr.filter(r=>Number(r.variables.arrived)===1).map(r=>Number(r.variables.stage)).filter((v,i,a)=>!i||v!==a[i-1]);
 gate('stage_order',JSON.stringify(order)===JSON.stringify(A.allStagesRequired),'All nine measured settled stages occur in the declared chronological order');
 const stages=route.map(target=>{
  const all=pr.filter(r=>Number(r.variables.stage)===target.stage&&Number(r.variables.arrived)===1),end=all.at(-1)?.t??-Infinity,window=all.filter(r=>r.t>=end-A.settledWindowMs-.0001),coverage=all.length?end-all[0].t:0,settledCoverage=window.length?end-window[0].t:0;
  gate('dwell_'+target.stage,coverage>=A.minimumArrivedCoverageMsPerStage&&settledCoverage>=A.minimumSettledCoverageMsPerStage&&window.length>=A.minimumSettledSamplesPerStage,'Stage'+target.stage+' includes the declared dwell and final half-second measurement window');
  if(!window.length)return{stage:target.stage,frames:0};
  const motorError=max(window.map(r=>r.encoderDeg-target.targetMotorDeg)),outputError=max(window.map(r=>angle(r,'output')-target.outputDeg)),carrierError=max(window.map(r=>angle(r,'carrier')-target.predictedCarrierDeg));
  const leftError=max(window.map(r=>angle(r,'left')-target.predictedLeftDeg)),rightError=max(window.map(r=>angle(r,'right')-target.predictedRightDeg));
  gate('motor_target_'+target.stage,window.every(r=>Math.abs(Number(r.variables.targetA)-target.targetMotorDeg)<1e-8)&&motorError<=A.maximumMotorArrivalErrorDeg,'Stage'+target.stage+' reaches the independently declared motor target within2degrees');
  gate('program_stage_'+target.stage,window.every(r=>near(Number(r.variables.outputTarget),target.outputDeg)&&Number(r.variables.directionA)===Math.sign(T.outputRatio)&&Number(r.variables.leg)===(target.leg==='forward'?0:1)),'Stage'+target.stage+' program globals match the independent output target, direction and route leg');
  gate('output_target_'+target.stage,outputError<=A.maximumOutputSettledTargetErrorDeg,'Stage'+target.stage+' actual pointer reaches its target within1degree');
  gate('carrier_target_'+target.stage,carrierError<=A.maximumCarrierSettledTargetErrorDeg,'Stage'+target.stage+' actual carrier reaches its separate target within1degree');
  gate('branch_targets_'+target.stage,leftError<=A.maximumSettledBranchTargetErrorDeg&&rightError<=A.maximumSettledBranchTargetErrorDeg,'Stage'+target.stage+' actual side rotations agree with their declared targets within4degrees, including motor arrival tolerance');
  return{stage:target.stage,leg:target.leg,outputTargetDeg:target.outputDeg,carrierTargetDeg:target.predictedCarrierDeg,frames:window.length,dwellCoverageMs:coverage,settledCoverageMs:settledCoverage,meanActualAnglesDeg:Object.fromEntries(Object.keys(owners).map(k=>[k,mean(window.map(r=>angle(r,k)))])),maxMotorErrorDeg:motorError,maxOutputErrorDeg:outputError,maxCarrierErrorDeg:carrierError,maxLeftErrorDeg:leftError,maxRightErrorDeg:rightError};
 });
 return{checks,failures:checks.filter(c=>c.status==='FAIL'),metrics:{frames:rows.length,programDurationMs:run.finishedAt===null?null:run.finishedAt-S.coldMs,rotationMetrics,maxResidualsDeg:residualMax,maxNativeHingeStepDeg:maximum('nativeHingeStepDeg'),maxPhysicalHingeGapMm:maximum('physicalHingeGapMm'),maxOriginalPhysicalHingeGapMm:maximum('originalPhysicalHingeGapMm'),maxPhysicalAxisMismatchDeg:maximum('physicalAxisMismatchDeg'),maxBaseTiltDeg:maximum('baseTiltDeg'),maxBaseRotationDeg:maximum('baseRotationDeg'),maxBaseTranslationMm:maximum('baseTranslationMm'),finalEncoderDeg:last.encoderDeg,stageOrder:order,stages,finalVariables:last.variables}};
}

 physical=await createPhysicalHingeObserver(run,{repo,expectedInterfaces:markers.physicalHingeInterfaces});
 const observed=await measure(run);return {...judge(run,observed),observed};
}
export async function judgeVernierDrive(run,options){const result=await evaluateVernierDrive(run,options);assert.deepEqual(result.failures,[],'Original vernier-drive physical acceptance');return result.metrics;}
