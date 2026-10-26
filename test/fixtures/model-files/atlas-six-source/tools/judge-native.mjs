// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Atlas Six's pure independent native pose observer. Target geometry supplies
// comparisons only; all measured output comes from recorded native body poses.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {judgeControls} from './judge-controls.mjs';
import {nativeObservation,observePlatform,add,sub,scale,dot,norm,unit,qmul,qconj,qrot,trans,matMul,eye,degrees,clamp,rotationAngleDeg,variables} from './native-observation.mjs';
const PORTS=[...'ABCDEF'];
const max=values=>Math.max(0,...values),span=values=>Math.max(...values)-Math.min(...values);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);

export function judgeAtlas(record,contract,{includeSamples=true}={}) {
  const gates=[],gate=(name,pass,actual,requirement)=>gates.push({name,status:pass?'PASS':'FAIL',actual,requirement});
  const m=record.mechanism,track=record.track || [],T=contract.thresholds,plan=contract.plan;
  const required=['minimumSamples','maxFrameMs','jointClosureMm','jointAxisDeg','sliderTransverseMm','platformRigidityMm','poseTranslationMm','poseRotationDeg','baseDriftMm','baseTiltDeg','coldTranslationMm','coldRotationDeg','coldEncoderDeg','returnTranslationMm','returnRotationDeg','holdTranslationMm','holdRotationDeg','screwLawMm','strokeMarginLdu','socketStemAngleDeg','settledTailMs','minimumSettledSamples','minTranslationSpanMm','minRotationSpanDeg'];
  const missing=required.filter(k=>T?.[k]===undefined);
  if(missing.length)throw new Error('Contract must predeclare thresholds: '+missing.join(', '));
  if(!contract.expectedInputHashes?.model||!contract.expectedInputHashes?.program)throw new Error('Contract must freeze actual exported LDR and BW hashes before full qualification');
  gate('native-record-completed',record.recordingStatus==='completed',record.recordingStatus,'completed');
  for(const [kind,want] of Object.entries(contract.expectedInputHashes || {}))gate('frozen-'+kind+'-bytes',record.inputs?.[kind]?.sha256===want,record.inputs?.[kind]?.sha256,want);
  if(contract.expectedCheckout)gate('selected-runtime-checkout',record.runtime?.checkout===contract.expectedCheckout,record.runtime?.checkout,contract.expectedCheckout);
  gate('sample-coverage',track.length>=T.minimumSamples,track.length,`at least ${T.minimumSamples} actual native frames`);
  const timeSteps=track.slice(1).map((f,i)=>f.t-track[i].t);
  gate('temporal-sampling',timeSteps.length>0&&timeSteps.every(t=>t>0&&t<=T.maxFrameMs+1e-6),{maximumMs:max(timeSteps),minimumMs:Math.min(...timeSteps)},`strictly increasing, at most ${T.maxFrameMs}ms per sample`);
  if(!m||!track.length)return {status:'FAIL',gates};
  const o=nativeObservation(record,contract.basePart),observed=observePlatform(record,contract,o),rows=observed.rows;
  const controls=judgeControls(record,plan);gates.push(...controls.gates);
  gate('declared-hub-control-identity',record.controlledMotors?.length===6&&record.controlledMotors.every(m=>m.hub===contract.basePart),record.controlledMotors,'all six commands belong to the declared observed base hub');
  const allowed=contract.allowedIssueCodes || [];
  gate('native-import-diagnostics',(record.issues || []).every(i=>allowed.includes(i.code)),record.issues,allowed.length?allowed:'no import diagnostics');
  gate('ordinary-unassisted-equivalence',Boolean(record.preparationComparison?.ordinary&&record.preparationComparison?.unassisted)&&JSON.stringify(record.preparationComparison.ordinary)===JSON.stringify(record.preparationComparison.unassisted),{ordinaryIssues:record.preparationComparison?.ordinary?.issues,unassistedIssues:record.preparationComparison?.unassisted?.issues},'identical native bodies, joints, couplings, filtering and diagnostics');
  gate('all-model-bodies-dynamic',m.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'),m.bodies.filter(b=>b.parts.length).map(b=>({id:b.id,motion:b.motion})),'every model body is dynamic; only the native floor is static');
  const actualCounts={dynamicBodies:m.bodies.filter(b=>b.motion==='dynamic').length,joints:{},couplings:{}};
  for(const j of m.joints)actualCounts.joints[j.type]=(actualCounts.joints[j.type]||0)+1;
  for(const c of m.couplings || [])actualCounts.couplings[c.kind]=(actualCounts.couplings[c.kind]||0)+1;
  gate('declared-native-topology',canonical(actualCounts)===canonical(contract.topology),actualCounts,contract.topology);
  gate('all-six-physical-struts-observed',JSON.stringify(contract.legs.map(l=>l.port).sort())===JSON.stringify(PORTS),contract.legs.map(l=>l.port),'exactly one observed physical strut for each native port A–F');
  gate('one-rigid-independent-platform',new Set(observed.markerBodies).size===1&&observed.markerBodies[0]!==o.base.id,observed.markerBodies,'all three noncollinear markers belong to one real moving platform body, distinct from the base');
  const basisOrth=matMul(trans(observed.basis),observed.basis),basisError=max(basisOrth.map((v,i)=>Math.abs(v-eye[i])));
  gate('orthonormal-observation-basis',basisError<1e-9,basisError,'the predeclared measurement axes are orthonormal');
  const rigidity=max(rows.map(r=>r.rigidErrorMm));
  gate('actual-platform-rigidity',rigidity<=T.platformRigidityMm,rigidity,`marker rigid-transform residual <=${T.platformRigidityMm}mm`);
  const admissions=record.catalogAugmentation?.entries || [];
  gate('official-structural-catalogue-admission',admissions.every(a=>a.meta&&!a.decoration&&a.why.length===0),admissions.map(a=>({part:a.part,decoration:a.decoration,why:a.why,metadataSha256:a.metadataSha256})),'all extra stock parts pass the unmodified canonical catalogue admission');
  if(contract.expectedExtraMetadata)for(const [part,sha] of Object.entries(contract.expectedExtraMetadata))gate('stock-admission-'+part,admissions.find(a=>a.part===part)?.metadataSha256===sha,admissions.find(a=>a.part===part)?.metadataSha256,sha);
  if(admissions.length)gate('official-extra-provenance-present',Boolean(record.catalogAugmentation?.provenance?.sha256)&&record.catalogAugmentation.files.length>0,{provenance:record.catalogAugmentation?.provenance?.sha256,files:record.catalogAugmentation?.files?.length},'official source manifest and every consumed closure file hashed');
  if(admissions.length)gate('all-stock-closure-hashes-match-manifest',record.catalogAugmentation?.fileHashVerification?.status==='PASS',record.catalogAugmentation?.fileHashVerification,'all actually consumed official and selected-checkout LDraw files match the pinned complete closure');

  let finite=true,jointGap=0,axisMismatch=0,sliderTransverse=0,baseDrift=0,baseTilt=0;
  const base0=o.pose(track[0],o.base),jointStats=Object.fromEntries(m.joints.map(j=>[j.id,{type:j.type,maxClosureMm:0,maxAxisDeg:0,maxTransverseMm:0}]));
  for(const f of track) {
    for(const p of Object.values(f.bodies))finite&&=[...p.position,...p.rotation].every(Number.isFinite)&&Math.abs(norm(p.rotation)-1)<1e-3;
    const bp=o.pose(f,o.base);baseDrift=Math.max(baseDrift,norm(sub(bp.position,base0.position))*1000);
    const up=qrot(qmul(bp.rotation,qconj(base0.rotation)),[0,1,0]);baseTilt=Math.max(baseTilt,degrees(Math.acos(clamp(up[1]))));
    for(const j of m.joints) {
      const a=o.bodyById.get(j.body1),b=o.bodyById.get(j.body2);if(!j.point||!a||!b)throw new Error('Unobservable physical joint '+j.id);
      const d=sub(o.carry(f,b,j.point),o.carry(f,a,j.point)),s=jointStats[j.id];
      if(j.type==='slider') {
        const axis=o.axis(f,a,j.axis),transverse=norm(sub(d,scale(axis,dot(d,axis))))*1000;
        s.maxTransverseMm=Math.max(s.maxTransverseMm,transverse);sliderTransverse=Math.max(sliderTransverse,transverse);
      } else {
        const gap=norm(d)*1000;s.maxClosureMm=Math.max(s.maxClosureMm,gap);jointGap=Math.max(jointGap,gap);
      }
      if(j.axis&&j.type!=='ball') {
        const axes=[a,b].map(body=>o.axis(f,body,j.axis)),angle=degrees(Math.acos(clamp(dot(axes[0],axes[1]))));
        s.maxAxisDeg=Math.max(s.maxAxisDeg,angle);axisMismatch=Math.max(axisMismatch,angle);
      }
    }
  }
  gate('finite-actual-native-poses',finite,finite,'finite positions and unit quaternions');
  gate('ball-and-hinge-closure',jointGap<=T.jointClosureMm,jointGap,`<=${T.jointClosureMm}mm through cold, movement and hold`);
  gate('hinge-and-slider-axis-alignment',axisMismatch<=T.jointAxisDeg,axisMismatch,`<=${T.jointAxisDeg}deg; ball joints remain rotationally free`);
  gate('slider-transverse-closure',sliderTransverse<=T.sliderTransverseMm,sliderTransverse,`<=${T.sliderTransverseMm}mm transverse error`);
  gate('unanchored-base-drift',baseDrift<=T.baseDriftMm,baseDrift,`<=${T.baseDriftMm}mm`);
  gate('unanchored-base-tilt',baseTilt<=T.baseTiltDeg,baseTilt,`<=${T.baseTiltDeg}deg`);

  const stages=[];
  for(const stage of plan.stages) {
    const all=rows.filter(r=>r.stage===stage.stage&&r.settled===1),end=all.at(-1)?.t,tail=all.filter(r=>r.t>=end-T.settledTailMs-1e-6);
    const target=stage.targetPose;if(!target)throw new Error('Missing independent target pose for stage '+stage.stage);
    const rotation=target.rotationMatrix || eye;
    const translationErrors=tail.map(r=>norm(sub(r.translationMm,target.translationMm))),rotationErrors=tail.map(r=>rotationAngleDeg(matMul(trans(rotation),r.rotationMatrix)));
    gate(`stage-${stage.stage}-settled-pose-coverage`,tail.length>=T.minimumSettledSamples,tail.length,`at least ${T.minimumSettledSamples} actual frames over the final ${T.settledTailMs}ms of the declared dwell`);
    gate(`stage-${stage.stage}-actual-position`,tail.length>0&&max(translationErrors)<=T.poseTranslationMm,{maximumMm:max(translationErrors),lastTranslationMm:tail.at(-1)?.translationMm,targetMm:target.translationMm},`actual platform centre within ${T.poseTranslationMm}mm of independent IK pose`);
    gate(`stage-${stage.stage}-actual-orientation`,tail.length>0&&max(rotationErrors)<=T.poseRotationDeg,{maximumDeg:max(rotationErrors),lastRotationVectorDeg:tail.at(-1)?.rotationVectorDeg},`SO(3) orientation error <=${T.poseRotationDeg}deg`);
    stages.push({stage:stage.stage,name:stage.name,targetPose:target,settledFrames:tail.length,maxTranslationErrorMm:max(translationErrors),maxOrientationErrorDeg:max(rotationErrors),last:tail.at(-1)});
  }
  const program=rows.filter(r=>r.phase==='program'),translationSpan=[0,1,2].map(i=>span(program.map(r=>r.translationMm[i]))),rotationSpan=[0,1,2].map(i=>span(program.map(r=>r.rotationVectorDeg[i])));
  for(let i=0;i<3;i++) {
    gate('independent-translation-axis-'+i,translationSpan[i]>=T.minTranslationSpanMm[i],translationSpan[i],`>=${T.minTranslationSpanMm[i]}mm independently observed range`);
    gate('independent-rotation-axis-'+i,rotationSpan[i]>=T.minRotationSpanDeg[i],rotationSpan[i],`>=${T.minRotationSpanDeg[i]}deg independently observed rotation-vector range`);
  }
  const cold=rows.filter(r=>r.phase==='cold'),coldFrames=track.filter(f=>f.phase==='cold');
  const coldMetrics={durationMs:cold.at(-1)?.t-cold[0]?.t,translationMm:max(cold.map(r=>norm(r.translationMm))),rotationDeg:max(cold.map(r=>rotationAngleDeg(r.rotationMatrix))),encoderDeg:max(coldFrames.flatMap(f=>PORTS.map(p=>Math.abs(f.encoder[p].angleDeg-coldFrames[0].encoder[p].angleDeg))))};
  gate('unpowered-cold-duration',coldMetrics.durationMs+1e-6>=contract.timing.coldMs,coldMetrics.durationMs,`at least ${contract.timing.coldMs}ms before the program starts`);
  gate('unpowered-cold-platform-position',coldMetrics.translationMm<=T.coldTranslationMm,coldMetrics.translationMm,`<=${T.coldTranslationMm}mm from saved datum`);
  gate('unpowered-cold-platform-orientation',coldMetrics.rotationDeg<=T.coldRotationDeg,coldMetrics.rotationDeg,`<=${T.coldRotationDeg}deg from saved datum`);
  gate('unpowered-cold-encoder-drift',coldMetrics.encoderDeg<=T.coldEncoderDeg,coldMetrics.encoderDeg,`<=${T.coldEncoderDeg}deg`);
  const after=rows.filter(r=>r.phase==='after'),last=rows.at(-1),holdOrigin=after[0];
  const holdMetrics={durationMs:after.at(-1)?.t-record.finishedAt,translationDriftMm:holdOrigin?max(after.map(r=>norm(sub(r.translationMm,holdOrigin.translationMm)))):Infinity,rotationDriftDeg:holdOrigin?max(after.map(r=>rotationAngleDeg(matMul(trans(holdOrigin.rotationMatrix),r.rotationMatrix)))):Infinity};
  gate('final-hold-duration',holdMetrics.durationMs+1e-6>=contract.timing.afterMs,holdMetrics.durationMs,`at least ${contract.timing.afterMs}ms after all VM scripts complete`);
  gate('final-hold-position-stability',holdMetrics.translationDriftMm<=T.holdTranslationMm,holdMetrics.translationDriftMm,`<=${T.holdTranslationMm}mm during final powered hold`);
  gate('final-hold-orientation-stability',holdMetrics.rotationDriftDeg<=T.holdRotationDeg,holdMetrics.rotationDriftDeg,`<=${T.holdRotationDeg}deg during final powered hold`);
  gate('platform-return-position',norm(last.translationMm)<=T.returnTranslationMm,norm(last.translationMm),`<=${T.returnTranslationMm}mm from saved centre`);
  gate('platform-return-orientation',rotationAngleDeg(last.rotationMatrix)<=T.returnRotationDeg,rotationAngleDeg(last.rotationMatrix),`<=${T.returnRotationDeg}deg from saved orientation`);

  const legs=[];
  for(const leg of contract.legs) {
    if(!leg.lowerBall||!leg.upperBall||!leg.lowerSocketPart||!leg.upperSocketPart)throw new Error('Leg '+leg.port+' needs both real ball markers and socket part IDs for physical articulation observation');
    const drive=m.joints.find(j=>j.motor?.port===leg.port),screw=(m.couplings || []).find(c=>c.kind==='screw'&&c.hingeJoint===drive?.id&&c.parts?.includes(leg.pistonPart));
    const expectedRatio=(leg.leadLduPerRev || 3.0147)*.0004/(2*Math.PI);
    gate(leg.port+'-native-physical-screw-route',Boolean(screw)&&Math.abs(Math.abs(screw.ratio)-expectedRatio)<1e-9,{motorJoint:drive?.id,coupling:screw},'the actual motor hinge drives its declared physical piston through the canonical stock lead screw');
    const legRows=track.map(f=>{
      const origin=o.point(f,{part:leg.bodyPart}),axis=unit(sub(o.point(f,{part:leg.bodyPart,local:[0,0,20]}),origin)),eyePoint=o.point(f,{part:leg.pistonPart}),d=sub(eyePoint,origin),extension=dot(d,axis)-120;
      const low=leg.lowerBall?o.point(f,leg.lowerBall):null,high=leg.upperBall?o.point(f,leg.upperBall):null;
      const endDistance=low&&high?norm(sub(high,low)):null;
      const rollVector=unit(sub(o.point(f,{part:leg.bodyPart,local:[20,0,0]}),origin));
      const direction=(part,local)=>unit(sub(o.point(f,{part,local}),o.point(f,{part})));
      const socketAngles={};
      for(const end of ['lower','upper']) {
        const stem=direction(leg[end+'Ball'].part,leg.ballStemLocal || [20,0,0]),opening=direction(leg[end+'SocketPart'],leg.socketOpeningLocal || [0,20,0]);
        socketAngles[end]=degrees(Math.acos(clamp(dot(stem,opening))));
      }
      return {t:f.t,extensionLdu:extension,encoderDeg:f.encoder[leg.port].angleDeg,transverseMm:norm(sub(d,scale(axis,dot(d,axis))))*.4,endDistanceLdu:endDistance,axisLdu:axis,bodyXaxisLdu:rollVector,socketStemAngleDeg:socketAngles};
    });
    const e0=legRows[0].extensionLdu,a0=legRows[0].encoderDeg,lead=leg.leadLduPerRev || 3.0147;
    gate(leg.port+'-authored-extension-datum',Number.isFinite(leg.savedExtensionLdu)&&Math.abs(e0-leg.savedExtensionLdu)<.01,{observedLdu:e0,declaredLdu:leg.savedExtensionLdu},'actual saved piston extension matches the builder ledger within0.01LDU');
    const lawError=max(legRows.map(r=>Math.abs((r.extensionLdu-e0)-leg.encoderToExtensionSign*(r.encoderDeg-a0)/360*lead)*.4));
    const extensionRange=[Math.min(...legRows.map(r=>r.extensionLdu)),Math.max(...legRows.map(r=>r.extensionLdu))];
    gate(leg.port+'-actual-screw-law',lawError<=T.screwLawMm,lawError,`actual piston travel versus signed real encoder within ${T.screwLawMm}mm`);
    gate(leg.port+'-actual-stroke-margin',extensionRange[0]>=T.strokeMarginLdu&&extensionRange[1]<=60-T.strokeMarginLdu,extensionRange,`physical extension in [${T.strokeMarginLdu},${60-T.strokeMarginLdu}]LDU including all motion and cold drift`);
    if(leg.qualifiedExtensionLdu)gate(leg.port+'-qualified-extension-envelope',extensionRange[0]>=leg.qualifiedExtensionLdu[0]&&extensionRange[1]<=leg.qualifiedExtensionLdu[1],extensionRange,leg.qualifiedExtensionLdu);
    const transverse=max(legRows.map(r=>r.transverseMm));
    gate(leg.port+'-actual-piston-coaxiality',transverse<=T.sliderTransverseMm,transverse,`<=${T.sliderTransverseMm}mm`);
    const endLengthError=legRows[0].endDistanceLdu===null?null:max(legRows.map(r=>Math.abs(r.endDistanceLdu-Math.hypot(leg.transverseOffsetLdu,120+r.extensionLdu))*.4));
    if(endLengthError!==null)gate(leg.port+'-offset-ball-distance',endLengthError<=T.jointClosureMm,endLengthError,`actual endpoint distance follows the physical offset strut within ${T.jointClosureMm}mm`);
    const socketMax=Object.fromEntries(['lower','upper'].map(end=>[end,max(legRows.map(r=>r.socketStemAngleDeg[end]))]));
    for(const end of ['lower','upper'])gate(leg.port+'-'+end+'-physical-socket-articulation',socketMax[end]<=T.socketStemAngleDeg,socketMax[end],`actual towball stem versus stock socket opening <=${T.socketStemAngleDeg}deg through all phases; native balls impose no angular limit`);
    legs.push({port:leg.port,physicalLeg:leg.physicalLeg,partPrefix:leg.partPrefix,body:o.bodyOf(leg.bodyPart).id,bodyMassKg:o.bodyOf(leg.bodyPart).massKg,bodyInitialPosition:o.bodyOf(leg.bodyPart).position,extensionRangeLdu:extensionRange,screwLawErrorMm:lawError,pistonTransverseMm:transverse,endLengthErrorMm:endLengthError,maxSocketStemAngleDeg:socketMax,samples:includeSamples?legRows:undefined});
  }
  return {status:gates.every(g=>g.status==='PASS')?'PASS':'FAIL',scope:'Complete unanchored native six-DOF platform and finite exported six-port VM program; no browser or hardware qualification',inputs:record.inputs,sampleCount:track.length,finishedAt:record.finishedAt,topology:actualCounts,metrics:{jointClosureMm:jointGap,jointAxisDeg:axisMismatch,sliderTransverseMm:sliderTransverse,baseDriftMm:baseDrift,baseTiltDeg:baseTilt,platformRigidityMm:rigidity,translationSpanMm:translationSpan,rotationVectorSpanDeg:rotationSpan,cold:coldMetrics,hold:holdMetrics,returnTranslationMm:norm(last.translationMm),returnOrientationDeg:rotationAngleDeg(last.rotationMatrix)},gates,controls,stages,joints:jointStats,legs,samples:includeSamples?rows:undefined};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const [recordPath,contractPath,outputPath]=process.argv.slice(2);
  if(!outputPath)throw new Error('Usage: node judge-native.mjs RECORD.json[.gz] CONTRACT.json REPORT.json');
  const stored=readFileSync(recordPath),bytes=recordPath.endsWith('.gz')?gunzipSync(stored):stored,contractBytes=readFileSync(contractPath),record=JSON.parse(bytes),contract=JSON.parse(contractBytes);
  const result=judgeAtlas(record,contract);
  result.provenance={recordSha256:hash(bytes),contractSha256:hash(contractBytes),observerSha256:hash(readFileSync(fileURLToPath(import.meta.url))),observationHelperSha256:hash(readFileSync(new URL('./native-observation.mjs',import.meta.url))),controlObserverSha256:hash(readFileSync(new URL('./judge-controls.mjs',import.meta.url)))};
  const identity=record.inputs?.contract?.sha256===result.provenance.contractSha256;
  result.gates.push({name:'predeclared-contract-identity',status:identity?'PASS':'FAIL',actual:result.provenance.contractSha256,requirement:record.inputs?.contract?.sha256});if(!identity)result.status='FAIL';
  mkdirSync(path.dirname(path.resolve(outputPath)),{recursive:true});writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,scope:result.scope,metrics:result.metrics,failedGates:result.gates.filter(g=>g.status==='FAIL')},null,2));
  if(result.status!=='PASS')process.exitCode=1;
}
