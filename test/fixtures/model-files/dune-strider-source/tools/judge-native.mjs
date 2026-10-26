// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Pure observer: native-recorded rigid-body poses carry physical marker points.
// Linkage equations supply comparisons only; they never supply measured poses.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/norm(a));
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w],rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),deg=a=>a*180/Math.PI,span=a=>Math.max(...a)-Math.min(...a),max=a=>Math.max(0,...a);
const unwrap=xs=>{let old=xs[0],sum=old;return xs.map(x=>{sum+=wrap(x-old);old=x;return sum;});};
const travel=xs=>{let forward=0,reverse=0;for(let i=1;i<xs.length;i++){const d=deg(xs[i]-xs[i-1]);forward+=Math.max(0,d);reverse+=Math.max(0,-d);}return {forward,reverse};};
function circle(a,r,b,s,side){const d=norm(sub(b,a)),u=scale(sub(b,a),1/d),h=(r*r-s*s+d*d)/(2*d),v2=r*r-h*h;if(v2 < -1e-9)throw new Error('Jansen analytic closure is impossible');const v=Math.sqrt(Math.max(0,v2));return add(add(a,scale(u,h)),scale([-u[1],u[0]],side*v));}
export function jansenIdeal(q){
  const O=[0,0],A=[-4,0],B=[2*Math.cos(q),2*Math.sin(q)];
  const C=circle(A,4,B,5,1),ac=sub(C,A),E=add(A,[-ac[1],ac[0]]);
  const D=circle(A,4,B,5,-1),F=circle(E,5,D,4,-1),df=sub(F,D),G=add(D,scale([-df[1],df[0]],5/4));
  return {O,A,B,C,D,E,F,G};
}
export function judgeJansen(record,contract,{includeSamples=true}={}){
  const gates=[];const gate=(name,pass,actual,requirement)=>gates.push({name,status:pass?'PASS':'FAIL',actual,requirement});
  const threshold={pathErrorMm:.5,crankRadiusErrorMm:.25,hingeGapMm:.5,axisMismatchDeg:1,baseTiltDeg:2,baseDriftMm:2,returnMm:1,returnEncoderDeg:2,minFootSpanMm:70,minFootLiftMm:9.5,minForwardDeg:718,minReverseDeg:718,maxAngleStepDeg:2,encoderErrorDeg:1,maxEncoderAbsDeg:722,...contract.thresholds};
  const m=record.mechanism,track=record.track || [];
  gate('recording-completed',record.recordingStatus==='completed',record.recordingStatus,'completed');
  for(const [kind,want] of Object.entries(contract.expectedInputHashes || {}))gate('frozen-'+kind+'-bytes',record.inputs?.[kind]?.sha256===want,record.inputs?.[kind]?.sha256,want);
  gate('nonempty-samples',track.length>=(contract.minSamples || 100),track.length,`at least ${contract.minSamples || 100} native frames`);
  if(!m || !track.length)return {status:'FAIL',gates,thresholds:threshold};
  const bodyById=new Map(m.bodies.map(b=>[b.id,b])),partById=new Map(record.runModel.parts.map(p=>[p.id,p])),sourcePartById=new Map(record.model.parts.map(p=>[p.id,p]));
  const bodyOf=part=>{const matches=m.bodies.filter(b=>b.parts.includes(part));if(matches.length!==1)throw new Error(`Marker ${part} is owned by ${matches.length} bodies; select an unambiguous physical part.`);return matches[0];};
  const base=bodyOf(contract.basePart);
  const sourceBase=sourcePartById.get(contract.basePart),runBase=partById.get(contract.basePart);
  const matVec=(R,p)=>[0,3,6].map(i=>dot(R.slice(i,i+3),p)),transVec=(R,p)=>[0,1,2].map(i=>R[i]*p[0]+R[i+3]*p[1]+R[i+6]*p[2]);
  // A mat may rotate/translate the whole authored model before native import.
  // Restore that one rigid transform using the declared physical hub, keeping
  // all equation axes and dimensional predictions in the authored LDraw frame.
  const authoredLdu=p=>add(sourceBase.position,matVec(sourceBase.rotation,transVec(runBase.rotation,sub(p,runBase.position))));
  const initial=(point)=>{const p=partById.get(point.part);if(!p)throw new Error('Missing marker '+point.part);const local=point.local || [0,0,0],v=add(p.position,[0,3,6].map(i=>dot(p.rotation.slice(i,i+3),local)));return v.map((x,i)=>x*(i===0?.0004:-.0004));};
  const carry=(frame,body,p)=>add(frame.bodies[body.id].position,rot(frame.bodies[body.id].rotation,rot(conj(body.rotation),sub(p,body.position))));
  const inRestFrame=(frame,p)=>add(base.position,rot(base.rotation,rot(conj(frame.bodies[base.id].rotation),sub(p,frame.bodies[base.id].position))));
  const point=(frame,mark)=>authoredLdu(inRestFrame(frame,carry(frame,bodyOf(mark.part),initial(mark))).map((x,i)=>x/(i===0?.0004:-.0004)));
  const u=unit(contract.plane?.uLdu || [1,0,0]),v=unit(contract.plane?.vLdu || [0,-1,0]),n=unit(cross(u,v));
  gate('orthogonal-measurement-plane',Math.abs(dot(u,v))<1e-10,dot(u,v),'source-defined orthogonal axes');
  gate('one-hub-one-motor',m.hubs.length===1&&m.actuators.length===1&&m.actuators[0].port==='A',{hubs:m.hubs,actuators:m.actuators},'one hub and one motor on A');
  gate('controlled-hub-identity',record.controlledMotors?.length===1&&record.controlledMotors[0].hub===contract.basePart&&record.controlledMotors[0].direct===true,record.controlledMotors,'motor A belongs to the declared hub and supports the native direct command route');
  gate('compiler',record.compiler?.validation?.isValid&&record.compiler?.warnings?.length===0&&record.compiler?.unparsed?.length===0&&record.compiler?.missingRobotlabPrimitives?.length===0,record.compiler?.validation,'registered compiler accepts all source and all robotlab primitives are loaded');
  const allowed=contract.allowedIssueCodes || [];
  gate('import-diagnostics',record.issues.every(i=>allowed.includes(i.code)),record.issues,allowed.length?allowed:'no import issues');
  const ordinary=record.preparationComparison?.ordinary,strict=record.preparationComparison?.unassisted;
  gate('ordinary-equals-unassisted',JSON.stringify(ordinary)===JSON.stringify(strict),{ordinaryIssues:ordinary?.issues,strictIssues:strict?.issues},'identical body/joint/coupling/noCollide topology and diagnostics');
  if(contract.expectedDynamicBodies!==undefined)gate('dynamic-body-count',m.bodies.filter(b=>b.motion==='dynamic').length===contract.expectedDynamicBodies,m.bodies.filter(b=>b.motion==='dynamic').length,contract.expectedDynamicBodies);
  if(contract.expectedHinges!==undefined)gate('physical-hinge-count',m.joints.filter(j=>j.type==='hinge').length===contract.expectedHinges,m.joints.filter(j=>j.type==='hinge').length,contract.expectedHinges);
  if(contract.requireAllModelBodiesDynamic)gate('no-frozen-model-bodies',m.bodies.filter(b=>b.parts.length).every(b=>b.motion==='dynamic'),m.bodies.filter(b=>b.parts.length).map(b=>({id:b.id,motion:b.motion})), 'every body containing model parts is dynamic; only the scene floor may be static');
  if(contract.expectedCouplings){
    const describe=c=>({kind:c.kind || c.type,parts:[...(c.parts || [])].sort(),absoluteRatio:Math.abs(c.ratio)});
    const actual=(m.couplings || []).map(describe),expected=contract.expectedCouplings.map(describe);
    gate('stock-physical-couplings',JSON.stringify(actual)===JSON.stringify(expected),actual,expected);
  }
  gate('hinges-retained',m.joints.every(j=>j.type==='hinge'),m.joints.map(j=>({id:j.id,type:j.type})), 'every physical joint remains a hinge');
  gate('finite-native-program',record.finishedAt!==null&&record.finishedAt<=record.timing.timeLimitMs+record.timing.coldMs+record.timing.frameMs,record.finishedAt,`completes within ${record.timing.timeLimitMs}ms program watchdog window`);
  const commands=record.apiEvents.filter(e=>e.name==='runMotorDegrees');
  gate('native-command-completion',commands.length>0&&commands.every(c=>c.result==='completed'&&Number.isFinite(c.resolvedAt)),commands,'all finite motor commands complete through controller feedback');
  gate('no-api-refusals',record.refusals.length===0,record.refusals,'no command refusals, stalls, interruptions or unimplemented operations');
  gate('motor-not-busy-at-finish',record.track.at(-1)?.busy?.A===false,record.track.at(-1)?.busy,'A is no longer executing a finite command');
  const lastMotorCommand=record.apiEvents.filter(e=>['stopMotor','runMotorDegrees','setMotorSpeed','setMotorPower'].includes(e.name)&&e.args[0]==='A').at(-1);
  const finalMode=contract.finalMode || 'hold';
  gate('declared-final-motor-mode',lastMotorCommand?.name==='stopMotor'&&lastMotorCommand?.args[1]===finalMode&&lastMotorCommand?.result?.ok===true,lastMotorCommand,`the last accepted motor-A command is stop ${finalMode}, with no later drive command`);
  const afterFrames=track.filter(f=>f.phase==='after'),afterDuration=afterFrames.length?afterFrames.at(-1).t-record.finishedAt:0;
  gate('final-hold-observation',afterDuration+1e-6>=(contract.timing?.afterHoldObservationMs || record.timing.afterMs),afterDuration,`observe final ${finalMode} for ${contract.timing?.afterHoldObservationMs || record.timing.afterMs}ms`);
  for(const [name,want] of Object.entries(contract.terminalVariables || {})){
    const found=record.programVariables.flatMap(t=>Object.entries(t.variables)).filter(([k])=>k===name).map(([,value])=>value);
    gate('terminal-variable-'+name,found.length===1&&(typeof want==='number'?Number(found[0])===want:found[0]===want),found,want);
  }
  let finite=true,hingeGap=0,axisMismatch=0,baseTilt=0,baseDrift=0;
  const baseStart=track[0].bodies[base.id].position;
  const jointStats=Object.fromEntries(m.joints.map(j=>[j.id,{maxGapMm:0,maxAxisMismatchDeg:0,parts1:bodyById.get(j.body1)?.parts,parts2:bodyById.get(j.body2)?.parts}]));
  for(const f of track){
    for(const p of Object.values(f.bodies))finite&&=[...p.position,...p.rotation].every(Number.isFinite);
    const b=f.bodies[base.id];baseDrift=Math.max(baseDrift,norm(sub(b.position,baseStart))*1000);
    const up=rot(mul(b.rotation,conj(base.rotation)),[0,1,0]);baseTilt=Math.max(baseTilt,deg(Math.acos(Math.max(-1,Math.min(1,up[1])))));
    for(const j of m.joints){const b1=bodyById.get(j.body1),b2=bodyById.get(j.body2);if(!b1||!b2||!j.point)continue;
      const gap=norm(sub(carry(f,b1,j.point),carry(f,b2,j.point)))*1000;hingeGap=Math.max(hingeGap,gap);jointStats[j.id].maxGapMm=Math.max(jointStats[j.id].maxGapMm,gap);
      if(j.axis){const axes=[b1,b2].map(body=>rot(f.bodies[body.id].rotation,rot(conj(body.rotation),j.axis))),mismatch=deg(Math.acos(Math.max(-1,Math.min(1,dot(axes[0],axes[1])))));axisMismatch=Math.max(axisMismatch,mismatch);jointStats[j.id].maxAxisMismatchDeg=Math.max(jointStats[j.id].maxAxisMismatchDeg,mismatch);}
    }
  }
  gate('finite-physical-poses',finite,finite,'all recorded positions and quaternions finite');
  gate('physical-hinge-closure',hingeGap<=threshold.hingeGapMm,hingeGap,`<= ${threshold.hingeGapMm}mm across all phases`);
  gate('physical-axis-alignment',axisMismatch<=threshold.axisMismatchDeg,axisMismatch,`<= ${threshold.axisMismatchDeg}deg across all phases`);
  gate('stand-tilt',baseTilt<=threshold.baseTiltDeg,baseTilt,`<= ${threshold.baseTiltDeg}deg`);
  gate('stand-translation',baseDrift<=threshold.baseDriftMm,baseDrift,`<= ${threshold.baseDriftMm}mm`);
  const allEncoders=track.map(f=>f.encoder?.A?.angleDeg).filter(Number.isFinite),peakEncoder=max(allEncoders.map(Math.abs)),finalEncoder=allEncoders.at(-1);
  gate('qualified-encoder-envelope',peakEncoder<=threshold.maxEncoderAbsDeg,peakEncoder,`abs encoder <= ${threshold.maxEncoderAbsDeg}deg including overshoot`);
  if(contract.qualifiedEnvelopeDeg){const actual=[Math.min(...allEncoders),Math.max(...allEncoders)],bound=contract.qualifiedEnvelopeDeg;gate('declared-operating-envelope',actual[0]>=bound[0]&&actual[1]<=bound[1],actual,`within [${bound[0]},${bound[1]}]deg including cold drift and overshoot`);}
  gate('encoder-return',Math.abs(finalEncoder)<=threshold.returnEncoderDeg,finalEncoder,`abs final encoder <= ${threshold.returnEncoderDeg}deg`);
  const cold=track.filter(f=>f.phase==='cold');
  const coldStats={durationMs:cold.at(-1)?.t-cold[0]?.t,maxEncoderDriftDeg:max(cold.map(f=>Math.abs(f.encoder.A.angleDeg-cold[0].encoder.A.angleDeg))),maxBodyTranslationMm:max(cold.flatMap(f=>Object.keys(f.bodies).map(id=>norm(sub(f.bodies[id].position,cold[0].bodies[id].position))*1000)))};
  if(threshold.coldEncoderDriftDeg!==undefined)gate('unpowered-startup-drift',coldStats.maxEncoderDriftDeg<=threshold.coldEncoderDriftDeg,coldStats.maxEncoderDriftDeg,`<=${threshold.coldEncoderDriftDeg}deg during declared cold observation`);
  const legs=[];
  const outputBodies=contract.legs.map(leg=>bodyOf(leg.foot.part).id);
  gate('independent-passive-feet',new Set(outputBodies).size===contract.legs.length&&!outputBodies.includes(base.id),outputBodies,'each foot belongs to a distinct moving output body');
  for(const leg of contract.legs){
    const origin=leg.originLdu || contract.plane?.originLdu || [0,0,0];
    const project=p=>{const d=sub(p,origin);return [dot(d,u)*.4,dot(d,v)*.4,dot(d,n)*.4];};
    const sourceFoot=authoredLdu(initial(leg.foot).map((x,i)=>x/(i===0?.0004:-.0004))),normal=project(sourceFoot)[2];
    const rows=track.map(f=>{
      const c=project(point(f,leg.crank)),g=project(point(f,leg.foot)),q=Math.atan2(c[1],c[0]),expected=jansenIdeal(q).G.map(x=>x*8);
      return {t:f.t,phase:f.phase,crankXmm:c[0],crankYmm:c[1],q,footXmm:g[0],footYmm:g[1],footNormalMm:g[2],expectedXmm:expected[0],expectedYmm:expected[1],pathErrorMm:Math.hypot(g[0]-expected[0],g[1]-expected[1],g[2]-normal),encoderDeg:f.encoder.A.angleDeg};
    });
    const angles=unwrap(rows.map(r=>r.q));rows.forEach((r,i)=>r.qUnwrappedDeg=deg(angles[i]));
    const programRows=rows.filter(r=>r.phase==='program'),programAngles=unwrap(programRows.map(r=>r.q)),motion=travel(programAngles),angleSpanDeg=deg(span(programAngles));
    const pathError=max(rows.map(r=>r.pathErrorMm)),radiusError=max(rows.map(r=>Math.abs(Math.hypot(r.crankXmm,r.crankYmm)-16))),footSpan=span(programRows.map(r=>r.footXmm)),footLift=span(programRows.map(r=>r.footYmm)),returnError=norm(sub([rows.at(-1).footXmm,rows.at(-1).footYmm,rows.at(-1).footNormalMm],[rows[0].footXmm,rows[0].footYmm,rows[0].footNormalMm]));
    const step=max(angles.slice(1).map((q,i)=>Math.abs(deg(q-angles[i]))));
    const sign=contract.encoderToCrankSign;
    const encoderError=sign===undefined?null:max(rows.map((r,i)=>Math.abs(deg(angles[i]-angles[0])-sign*(r.encoderDeg-rows[0].encoderDeg))));
    gate(leg.name+'-native-foot-law',pathError<=threshold.pathErrorMm,pathError,`full 3D source-defined Jansen path error <=${threshold.pathErrorMm}mm`);
    gate(leg.name+'-crank-radius',radiusError<=threshold.crankRadiusErrorMm,radiusError,`16mm radius error <=${threshold.crankRadiusErrorMm}mm`);
    gate(leg.name+'-useful-foot-stroke',footSpan>=threshold.minFootSpanMm,footSpan,`>=${threshold.minFootSpanMm}mm measured horizontal stroke`);
    gate(leg.name+'-useful-foot-lift',footLift>=threshold.minFootLiftMm,footLift,`>=${threshold.minFootLiftMm}mm measured lift`);
    gate(leg.name+'-full-motion-both-directions',motion.forward>=threshold.minForwardDeg&&motion.reverse>=threshold.minReverseDeg,motion,`>=${threshold.minForwardDeg}deg forward, >=${threshold.minReverseDeg}deg reverse`);
    gate(leg.name+'-continuous-angular-excursion',angleSpanDeg>=threshold.minForwardDeg,angleSpanDeg,`unwrapped angle range >=${threshold.minForwardDeg}deg; accumulated small oscillations cannot substitute for complete revolutions`);
    gate(leg.name+'-return',returnError<=threshold.returnMm,returnError,`<=${threshold.returnMm}mm from saved foot position`);
    gate(leg.name+'-angular-sampling',step<=threshold.maxAngleStepDeg,step,`<=${threshold.maxAngleStepDeg}deg between native observations`);
    if(encoderError!==null)gate(leg.name+'-encoder-sign',encoderError<=threshold.encoderErrorDeg,encoderError,`q change = ${sign}*encoder change, error <=${threshold.encoderErrorDeg}deg`);
    legs.push({name:leg.name,footBody:bodyOf(leg.foot.part).id,pathErrorMm:pathError,crankRadiusErrorMm:radiusError,footSpanMm:footSpan,footLiftMm:footLift,returnErrorMm:returnError,travelDeg:motion,angleSpanDeg,maxAngleStepDeg:step,encoderErrorDeg:encoderError,samples:rows});
  }
  if(legs.length===2){const phaseError=max(legs[0].samples.map((r,i)=>Math.abs(deg(wrap(legs[1].samples[i].q-r.q-Math.PI)))));gate('opposed-crank-phasing',phaseError<=threshold.axisMismatchDeg,phaseError,`180deg phase separation within ${threshold.axisMismatchDeg}deg`);}
  const status=gates.every(g=>g.status==='PASS')?'PASS':'FAIL';
  return {status,scope:'Native Jansen gait mechanism and finite exported program only',thresholds:threshold,inputs:record.inputs,timing:record.timing,sampleCount:track.length,finishedAt:record.finishedAt,metrics:{hingeGapMm:hingeGap,axisMismatchDeg:axisMismatch,baseTiltDeg:baseTilt,baseDriftMm:baseDrift,peakEncoderDeg:peakEncoder,finalEncoderDeg:finalEncoder,cold:coldStats},gates,joints:jointStats,legs:legs.map(l=>includeSamples?l:(({samples,...rest})=>rest)(l))};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const [recordPath,contractPath,outputPath]=process.argv.slice(2);
  if(!outputPath)throw new Error('Usage: node judge-jansen.mjs RECORD.json CONTRACT.json REPORT.json');
  const storedRecord=readFileSync(recordPath),recordBytes=recordPath.endsWith('.gz')?gunzipSync(storedRecord):storedRecord,contractBytes=readFileSync(contractPath);
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const record=JSON.parse(recordBytes),contract=JSON.parse(contractBytes),result=judgeJansen(record,contract);
  result.provenance={recordSha256:sha(recordBytes),contractSha256:sha(contractBytes),observerSha256:sha(readFileSync(fileURLToPath(import.meta.url)))};
  if(record.inputs.contract){const pass=record.inputs.contract.sha256===result.provenance.contractSha256;result.gates.push({name:'predeclared-contract-identity',status:pass?'PASS':'FAIL',actual:result.provenance.contractSha256,requirement:record.inputs.contract.sha256});if(!pass)result.status='FAIL';}
  mkdirSync(path.dirname(path.resolve(outputPath)),{recursive:true});writeFileSync(outputPath,JSON.stringify(result,null,2));
  process.stdout.write(JSON.stringify({...result,legs:result.legs.map(({samples,...leg})=>leg)},null,2)+'\n');
  if(result.status!=='PASS')process.exitCode=1;
}
