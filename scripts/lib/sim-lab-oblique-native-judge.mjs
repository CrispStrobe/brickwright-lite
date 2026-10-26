// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reviewed extraction of immutable supplied judge-native.mjs SHA256 679eaa3e9761b215e71e4c8cfbe4692389fc0880f92579f66a981f96c8180c1a.
import {observeOblique,ellipseGeometry,fitMeasuredEllipse,tiltDifferenceDeg,span,directions} from '../../test/fixtures/model-files/oblique-source/tools/observe-oblique.mjs';
import {judgeControls} from './sim-lab-oblique-controls-judge.mjs';
import {add,sub,scale,dot,norm,degrees,clamp} from '../../test/fixtures/model-files/oblique-source/tools/native-observation.mjs';
const max=(rows,key)=>Math.max(...rows.map(r=>r[key]));
const types=xs=>Object.fromEntries([...new Set(xs.map(x=>x.type))].map(t=>[t,xs.filter(x=>x.type===t).length]));
const signature=m=>JSON.stringify({bodies:m.bodies,joints:m.joints,couplings:m.couplings,actuators:m.actuators,hubs:m.hubs});
const coverage=(angles,bins)=>({visited:new Set(angles.map(a=>Math.min(bins-1,Math.floor((((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI))/(2*Math.PI)*bins)))).size,total:bins});
const drift=(rows,point)=>rows.length?Math.max(...rows.map(r=>norm(sub(point(r),point(rows[0]))))):Infinity;

export function measureNative(record,contract){
  const observed=observeOblique(record,contract),rows=observed.rows,g=contract.geometry;
  const phases=Object.fromEntries(['cold','program','after'].map(p=>[p,rows.filter(r=>r.phase===p)])),motion=phases.program;
  const scalarNames=['barLengthErrorMm','endpointPredictionErrorMm','carriagePredictionErrorMm','physicalEndpointGapMm','guideDeviationMm','guideOriginDriftMm','carriageRollDeg','hingeGapMm','hingeAxisGapDeg','sliderLineGapMm','sliderAngleGapDeg','baseTravelMm','baseTiltDeg','encoderPhaseErrorDeg','inputBEncoderPhaseErrorDeg','gearLawErrorDeg'];
  const maxima=Object.fromEntries(scalarNames.map(key=>[key,max(rows,key)]));
  const outputs=Object.fromEntries(observed.outputs.map(q=>{
    const point=r=>r.outputs[q.id].pointMm;
    const holds=contract.control.stages.map(stage=>{const held=motion.filter(r=>r.stage===stage.stage&&r.settled===1);return {stage:stage.stage,samples:held.length,driftMm:drift(held,point)};});
    return [q.id,{marker:q.point,body:q.body,fractionFromA:q.fractionFromA,predictionErrorMm:Math.max(...rows.map(r=>r.outputs[q.id].predictionErrorMm)),ellipseRadialResidual:Math.max(...rows.map(r=>r.outputs[q.id].ellipseRadialResidual)),phaseErrorDeg:Math.max(...rows.map(r=>r.outputs[q.id].phaseErrorDeg)),heightDriftMm:Math.max(...rows.map(r=>r.outputs[q.id].heightDriftMm)),returnErrorMm:norm(sub(point(rows.at(-1)),point(rows[0]))),coldDriftMm:drift(phases.cold,point),afterDriftMm:drift(phases.after,point),maximumHoldDriftMm:Math.max(...holds.map(h=>h.driftMm)),holds}];
  }));
  const groups=contract.control.groups.map(group=>{
    const frames=motion.filter(r=>group.stages.includes(r.stage)),alpha=frames.map(r=>degrees(r.alphaUnwrapped));
    const expectedStroke=2*g.barLengthMm/Math.sin(group.guideAngleDeg*Math.PI/180);
    const outputFits=Object.fromEntries(observed.outputs.map(q=>{
      const theory=ellipseGeometry(g.barLengthMm,q.fractionFromA,group.guideAngleDeg*Math.PI/180);let fitted;
      try{fitted={status:'FIT',...fitMeasuredEllipse(frames.map(r=>r.outputs[q.id].pointMm.slice(0,2)),g.barLengthMm)};}catch(e){fitted={status:'UNFIT',reason:e.message};}
      return [q.id,{theory:{matrix:theory.matrix,fullAxesMm:theory.fullAxesMm,majorAxisDegrees:degrees(theory.majorAxisRadians),circular:theory.circular},fitted,axisErrorMm:fitted.fullAxesMm?Math.max(...fitted.fullAxesMm.map((x,k)=>Math.abs(x-theory.fullAxesMm[k]))):Infinity,centreErrorMm:fitted.centreMm?norm(fitted.centreMm):Infinity,tiltErrorDeg:fitted.status==='FIT'?(theory.circular?0:tiltDifferenceDeg(fitted.majorAxisRadians,theory.majorAxisRadians)):Infinity,travel:directions(frames.map(r=>r.outputs[q.id].phaseUnwrapped)),coverageBins:coverage(frames.map(r=>r.outputs[q.id].phaseUnwrapped),contract.acceptance?.coverageBins||72)}];
    }));
    return {id:group.id,name:group.name,stages:group.stages,samples:frames.length,guideTargetDeg:group.guideAngleDeg,guideAngleRangeDeg:[Math.min(...alpha),Math.max(...alpha)],guideTargetErrorDeg:Math.max(...alpha.map(x=>Math.abs(x-group.guideAngleDeg))),barTravel:directions(frames.map(r=>r.thetaUnwrapped)),carriageStrokesMm:['A','B'].map(p=>span(frames.map(r=>r.carriagePositionsMm[p]))),expectedCarriageStrokeMm:expectedStroke,outputs:outputFits};
  });
  const stageTravel=contract.control.stages.map(stage=>{
    const frames=motion.filter(r=>r.stage===stage.stage),prior=contract.control.stages.find(s=>s.stage===stage.stage-1)?.targetsDegrees.A||0,expected=(stage.targetsDegrees.A-prior)*g.encoderSignA;
    const delta=fn=>frames.length?degrees(fn(frames.at(-1))-fn(frames[0])):NaN;
    return {stage:stage.stage,expectedBarDegrees:expected,barDegrees:delta(r=>r.thetaUnwrapped),outputDegrees:Object.fromEntries(observed.outputs.map(q=>[q.id,delta(r=>r.outputs[q.id].phaseUnwrapped)])),guideRangeDeg:frames.length?[Math.min(...frames.map(r=>degrees(r.alphaUnwrapped))),Math.max(...frames.map(r=>degrees(r.alphaUnwrapped)))]:[],settledGuideErrorDeg:frames.some(r=>r.settled===1)?Math.max(...frames.filter(r=>r.settled===1).map(r=>Math.abs(degrees(r.alphaUnwrapped)-stage.guideAngleDeg))):Infinity};
  });
  return {observed,report:{sampleCount:rows.length,phaseSamples:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,v.length])),owners:observed.owners,bodyIds:observed.bodyIds,jointIds:observed.jointIds,maxima,outputs,groups,stageTravel,guideAngleRangeDeg:[Math.min(...rows.map(r=>degrees(r.alphaUnwrapped))),Math.max(...rows.map(r=>degrees(r.alphaUnwrapped)))],coldBarDriftDeg:span(phases.cold.map(r=>degrees(r.thetaUnwrapped))),coldGuideDriftDeg:span(phases.cold.map(r=>degrees(r.alphaUnwrapped))),barReturnErrorDeg:Math.abs(degrees(rows.at(-1).thetaUnwrapped-rows[0].thetaUnwrapped)),guideReturnErrorDeg:Math.abs(degrees(rows.at(-1).alphaUnwrapped-rows[0].alphaUnwrapped)),topology:{dynamicBodies:record.mechanism.bodies.filter(b=>b.motion==='dynamic').length,joints:types(record.mechanism.joints),motors:record.mechanism.actuators.length,couplings:record.mechanism.couplings.length,hubs:record.mechanism.hubs?.length},coldDurationMs:phases.cold.at(-1).t-phases.cold[0].t,afterDurationMs:phases.after.length?phases.after.at(-1).t-phases.after[0].t:0,driftReference:'Cold/after/hold drift is measured relative to the first actual native sample of that interval, excluding source-to-physics normalization.'}};
}

export function judgeNative(record,contract,{contractSha256}={}){
  const a=contract.acceptance,g=contract.geometry;if(!a?.maximum||!a?.minimum||!a?.topology)throw new Error('Freeze explicit acceptance before qualification');
  const gates=[],gate=(name,pass,actual,requirement)=>gates.push({name,status:pass?'PASS':'FAIL',actual,requirement});
  const {observed,report}=measureNative(record,contract),o=observed.observation,m=record.mechanism,ids=observed.bodyIds,controls=judgeControls(record,contract.control);
  gate('native-record-completed',record.recordingStatus==='completed'&&Number.isFinite(record.finishedAt),{recordingStatus:record.recordingStatus,finishedAt:record.finishedAt,error:record.error},'actual native finite program completed');
  gate('exact-model-and-program-bytes',['model','program'].every(k=>record.inputs[k].sha256===contract.inputs[k].sha256),{recorded:record.inputs,declared:contract.inputs},'tested SHA-256 values equal the predeclared contract');
  if(contractSha256)gate('exact-contract-bytes',record.inputs.contract?.sha256===contractSha256,{recorded:record.inputs.contract?.sha256,judged:contractSha256},'recorded contract is the exact judged contract');
  gate('finite-body-poses',record.track.every(f=>Object.values(f.bodies).every(p=>[...p.position,...p.rotation].every(Number.isFinite))),record.track.length,'every actual recorded pose is finite');
  const modelBodies=m.bodies.filter(b=>!(b.role==='ground'&&b.parts.length===0));
  gate('all-model-bodies-dynamic',modelBodies.length>0&&modelBodies.every(b=>b.motion==='dynamic'),modelBodies.map(b=>({id:b.id,motion:b.motion,parts:b.parts})),'no model body is artificially static or frozen; only the empty-part environment floor is excluded');
  gate('declared-native-topology',Object.entries(a.topology).every(([k,v])=>k==='joints'?Object.keys(v).length===Object.keys(report.topology.joints).length&&Object.entries(v).every(([t,n])=>report.topology.joints[t]===n):report.topology[k]===v),report.topology,a.topology);
  gate('six-distinct-physical-members',new Set(Object.values(ids)).size===6,ids,'base, A carriage, bar, B guide, B carriage and B input are separate actual bodies');
  gate('physical-marker-ownership',observed.owners.barA===observed.owners.barB&&observed.owners.guideOrigin===observed.owners.guideDirection&&observed.owners.driveBOrigin===observed.owners.driveBDirection&&observed.outputs.every(q=>q.body===ids.bar),{owners:observed.owners,outputs:observed.outputs.map(q=>({id:q.id,body:q.body}))},'actual bar markers belong to the bar; independent guide/input marker pairs belong to their own members');
  const project=p=>g.planeAxesLdu.map(axis=>dot(sub(p,g.originLdu),axis)*.4),A=project(o.sourcePoint(g.markers.barA)),B=project(o.sourcePoint(g.markers.barB)),v=sub(B,A),L=norm(v);
  const sourceGeometry=observed.outputs.map(q=>{const w=sub(project(o.sourcePoint(q.point)),A),u=dot(w,v)/(L*L);return {id:q.id,derivedFraction:u,declaredFraction:q.fractionFromA,inPlaneOffsetMm:norm(sub(w,scale(v,u)))};});
  gate('ellipse-geometry-from-authored-parts',Math.abs(L-g.barLengthMm)<1e-4&&sourceGeometry.every(q=>Math.abs(q.derivedFraction-q.declaredFraction)<1e-6&&q.inPlaneOffsetMm<1e-4),{barLengthMm:L,markers:sourceGeometry},'ellipse dimensions derive from actual authored part-local points, not fitted targets');
  const pairSpecs=[{type:'hinge',members:['carriageA','bar'],axis:g.planeNormalLdu},{type:'hinge',members:['carriageB','bar'],axis:g.planeNormalLdu},{type:'hinge',members:['base','guideB'],axis:g.planeNormalLdu},{type:'hinge',members:['base','inputB'],axis:g.planeNormalLdu},{type:'slider',members:['base','carriageA'],axis:g.planeAxesLdu[0]},{type:'slider',members:['guideB','carriageB'],axis:g.planeAxesLdu[1]}];
  const jointGraph=pairSpecs.map(w=>{const pair=w.members.map(n=>ids[n]).sort(),found=m.joints.filter(j=>j.type===w.type&&JSON.stringify([j.body1,j.body2].sort())===JSON.stringify(pair));return {...w,joints:found.map(j=>j.id),axisMismatchDeg:found.map(j=>{const v=sub(o.sourceFromWorld(record.track[0],add(j.point,scale(j.axis,.001))),o.sourceFromWorld(record.track[0],j.point));return degrees(Math.acos(clamp(Math.abs(dot(v,w.axis)/(norm(v)*norm(w.axis))))));})};});
  gate('all-original-joints-retained',m.joints.length===pairSpecs.length&&jointGraph.every(j=>j.joints.length===1),jointGraph,'all four required hinges and both original slider guides retained');
  gate('all-original-joint-axes',jointGraph.every(j=>j.axisMismatchDeg.length===1&&j.axisMismatchDeg[0]<=a.maximum.hingeAxisGapDeg),jointGraph,'all actual joint axes match the authored physical directions');
  const motors=m.joints.filter(j=>j.motor);gate('two-useful-physical-motors',motors.some(j=>j.motor.port==='A'&&j.body1===ids.carriageA&&j.body2===ids.bar)&&motors.some(j=>j.motor.port==='B'&&j.body1===ids.base&&j.body2===ids.inputB),motors,'A turns the bar from the fixed-orientation moving carriage; grounded B drives the real pinion');
  gate('passive-guides-and-stock-gear-only',m.joints.filter(j=>j.type==='slider').every(j=>!j.motor&&!(j.maxForceN>0))&&m.couplings.length===1&&m.couplings[0].kind==='gear',m.couplings,'no direct output/slider drives; sole coupling is the native recognized stock gear mesh');
  const allowed=new Set(a.allowedPreparationIssueCodes||[]);gate('preparation-diagnostics-accounted',record.issues.every(i=>allowed.has(i.code)),record.issues,{allowedCodes:[...allowed]});
  gate('ordinary-unassisted-same-topology',signature(record.preparationComparison.ordinary.mechanism)===signature(record.preparationComparison.unassisted.mechanism),{ordinary:types(record.preparationComparison.ordinary.mechanism.joints),unassisted:types(record.preparationComparison.unassisted.mechanism.joints)},'ordinary and autoPorts:false prepare the same actual mechanism');
  gate('native-control-program',controls.status==='PASS',{status:controls.status,gateCount:controls.gates.length,failed:controls.gates.filter(g=>g.status==='FAIL')},'all actual compiler/VM/controller freshness, completion, hold and watchdog gates pass');
  for(const [key,value]of Object.entries(report.maxima)){if(!Number.isFinite(a.maximum[key]))throw new Error('Missing predeclared maximum '+key);gate(key,value<=a.maximum[key],value,`maximum ${a.maximum[key]}`);}
  gate('cold-duration',report.coldDurationMs>=a.minimum.coldDurationMs,report.coldDurationMs,`at least ${a.minimum.coldDurationMs}ms unpowered before green flag`);
  gate('post-completion-duration',report.afterDurationMs+record.timing.frameMs>=a.minimum.afterDurationMs,report.afterDurationMs,`at least ${a.minimum.afterDurationMs}ms final hold within one frame`);
  gate('cold-angle-stability',Math.max(report.coldBarDriftDeg,report.coldGuideDriftDeg)<=a.maximum.coldAngleDriftDeg,{bar:report.coldBarDriftDeg,guide:report.coldGuideDriftDeg},`maximum ${a.maximum.coldAngleDriftDeg}° drift from first native cold sample`);
  gate('both-physical-angles-return',Math.max(report.barReturnErrorDeg,report.guideReturnErrorDeg)<=a.maximum.returnAngleDeg,{bar:report.barReturnErrorDeg,guide:report.guideReturnErrorDeg},`both real members return within ${a.maximum.returnAngleDeg}°`);
  gate('bounded-actual-guide-angle',report.guideAngleRangeDeg[0]>=g.operatingGuideAngleDeg[0]&&report.guideAngleRangeDeg[1]<=g.operatingGuideAngleDeg[1],report.guideAngleRangeDeg,g.operatingGuideAngleDeg);
  for(const stage of report.stageTravel){
    gate(`stage-${stage.stage}-actual-guide-arrival`,stage.settledGuideErrorDeg<=a.maximum.guideTargetErrorDeg,stage.settledGuideErrorDeg,`actual guide within ${a.maximum.guideTargetErrorDeg}° of declared setting at settled hold`);
    if(Math.abs(stage.expectedBarDegrees)>contract.control.controller.correctionToleranceDeg)gate(`stage-${stage.stage}-signed-output-travel`,[stage.barDegrees,...Object.values(stage.outputDegrees)].every(x=>Math.abs(x-stage.expectedBarDegrees)<=a.maximum.stageTravelErrorDeg),stage,`actual bar and markers follow signed turn within ${a.maximum.stageTravelErrorDeg}°`);
  }
  for(const group of report.groups){
    gate(`${group.id}-guide-held`,group.guideTargetErrorDeg<=a.maximum.guideTargetErrorDeg,group.guideAngleRangeDeg,`actual guide holds ${group.guideTargetDeg}° within ${a.maximum.guideTargetErrorDeg}°`);
    gate(`${group.id}-both-slider-strokes`,group.carriageStrokesMm.every(x=>Math.abs(x-group.expectedCarriageStrokeMm)<=a.maximum.strokeErrorMm),{measured:group.carriageStrokesMm,expected:group.expectedCarriageStrokeMm},`stroke error at most ${a.maximum.strokeErrorMm}mm`);
    gate(`${group.id}-bar-circuits`,group.barTravel.forwardDegrees>=a.minimum.groupForwardDegrees&&group.barTravel.reverseDegrees>=a.minimum.groupReverseDegrees,group.barTravel,'full measured bar revolution in both directions at this guide setting');
    for(const [id,q]of Object.entries(group.outputs)){
      gate(`${group.id}-${id}-measured-principal-axes`,q.fitted.status==='FIT'&&q.axisErrorMm<=a.maximum.output.axisErrorMm,{fitted:q.fitted,theory:q.theory,axisErrorMm:q.axisErrorMm},`principal axes fit from actual points within ${a.maximum.output.axisErrorMm}mm`);
      gate(`${group.id}-${id}-measured-principal-tilt`,q.fitted.status==='FIT'&&q.tiltErrorDeg<=a.maximum.output.tiltErrorDeg,{actual:q.fitted.majorAxisDegrees,expected:q.theory.majorAxisDegrees,circular:q.theory.circular,errorDeg:q.tiltErrorDeg},`principal tilt within ${a.maximum.output.tiltErrorDeg}°; circular orientation is undefined and omitted`);
      gate(`${group.id}-${id}-measured-centre`,q.centreErrorMm<=a.maximum.output.centreErrorMm,q.fitted.centreMm,`independently fitted centre within ${a.maximum.output.centreErrorMm}mm of the guide intersection`);
      gate(`${group.id}-${id}-independent-circuits`,q.travel.forwardDegrees>=a.minimum.groupForwardDegrees&&q.travel.reverseDegrees>=a.minimum.groupReverseDegrees,q.travel,'actual marker phase independently completes a full turn both ways');
      gate(`${group.id}-${id}-angular-coverage`,q.coverageBins.visited===q.coverageBins.total,q.coverageBins,'actual marker covers every phase bin at this guide setting');
    }
  }
  for(const [id,q]of Object.entries(report.outputs))for(const key of ['predictionErrorMm','ellipseRadialResidual','phaseErrorDeg','heightDriftMm','returnErrorMm','coldDriftMm','afterDriftMm','maximumHoldDriftMm'])gate(`${id}-${key}`,q[key]<=a.maximum.output[key],q[key],`maximum ${a.maximum.output[key]}`);
  if(g.retention.length!==2)throw new Error('Declare both real guide retention intervals');
  for(const guide of g.retention){const values=observed.rows.map(r=>r.carriagePositionsMm[guide.port]),range=[Math.min(...values),Math.max(...values)],margins=[range[0]-guide.physicalBoundsMm[0],guide.physicalBoundsMm[1]-range[1]],parts=new Set(record.model.parts.map(p=>p.id));gate(`${guide.id}-physical-retention`,guide.stopParts.length>=2&&guide.stopParts.every(p=>parts.has(p))&&margins.every(x=>x>=guide.minimumMarginMm),{rangeMm:range,marginsMm:margins,physicalBoundsMm:guide.physicalBoundsMm,stopParts:guide.stopParts},`at least ${guide.minimumMarginMm}mm real stop/engagement margin throughout all observed motion`);}
  return {schema:'oblique-native-qualification/v1',status:gates.every(g=>g.status==='PASS')?'PASS':'FAIL',scope:contract.scope,contractSha256,inputs:record.inputs,runtime:record.runtime,prepareOptions:record.prepareOptions,effectivePreparation:record.effectivePreparation,gates,controls,measurements:report};
}
