// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reviewed extraction from the retained original source runner SHA256
// f45ddde6b3cef0549b1fe31985c1e614ff6a43328b8b802155d809ec4c4cc067. Every original physical gate
// runs in native mode. Browser mode checks its actual program and after poses;
// the full unpowered startup remains an explicit native-suite responsibility.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createLineObserver} from '../../test/fixtures/model-files/line-turner-source/checks/line-observer.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const fixture=new URL('../../test/fixtures/model-files/line-turner-source/',import.meta.url);
const contract=JSON.parse(readFileSync(new URL('docs/contract.json',fixture)));
const markers=JSON.parse(readFileSync(new URL('markers.json',fixture)));
export async function evaluateLineTurner(run,{native=true}={}){
const S={...contract.recording,coldMs:native?contract.recording.coldMs:(run.start||0)},A=contract.acceptance,G=contract.observerGeometry,C=contract.control,route=contract.route,sign=contract.datum.directionAForInwardSlider;
const span=a=>Math.max(...a)-Math.min(...a),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
async function measure(run){
 const observed=await createLineObserver(run,{repo,markers,geometry:G,motorDirectionForInwardSlider:sign});
 observed.rows.forEach((r,i)=>{r.maximumHingeStepDeg=i?Math.max(...run.mechanism.joints.filter(j=>j.type==='hinge').map(j=>Math.abs(run.track[i].joints[j.id].angle-run.track[i-1].joints[j.id].angle)*180/Math.PI)):0;});
 return observed;
}
function judge(run,observed){
 const rows=observed.rows,checks=[],gate=(id,ok,requirement)=>{if(!native&&id.startsWith('cold'))return;checks.push({id,status:ok?'PASS':'FAIL',requirement});};
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


 const observed=await measure(run);return {...judge(run,observed),observed};
}
export async function judgeLineTurner(run,options){const result=await evaluateLineTurner(run,options);assert.deepEqual(result.failures,[],'Original line-turner physical acceptance');return result.metrics;}
