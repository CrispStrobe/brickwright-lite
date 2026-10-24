// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Actual body-carried point observations. Geometry equations only compare results.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPhysicalHingeObserver} from './physical-hinge-observer.mjs';
import {createPhysicalGuideObserver} from './physical-guide-observer.mjs';
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),scale=(v,s)=>v.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),norm=v=>Math.hypot(...v);
const unit=v=>{const n=norm(v);assert.ok(Number.isFinite(n)&&n>0);return scale(v,1/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const degrees=r=>r*180/Math.PI,clamp=n=>Math.max(-1,Math.min(1,n));
const unwrap=a=>{assert.ok(a.length);let previous=a[0],total=0;return a.map(x=>{total+=Math.atan2(Math.sin(x-previous),Math.cos(x-previous));previous=x;return total;});};

export async function createLineObserver(run,{repo,markers,geometry,motorDirectionForInwardSlider=null,developmentClampedSupportBodyIds=null}){
 const {observeAddon}=await import(pathToFileURL(path.join(repo,'scripts/lib/sim-lab-addon-judge.mjs')).href);
 const o=observeAddon(run,markers.basePart),cf=markers.coordinateFrame;
 const physical=await createPhysicalHingeObserver(run,{repo,expectedInterfaces:markers.physicalHingeInterfaces});
 const guides=await createPhysicalGuideObserver(run,{repo,expectedInterfaces:markers.physicalGuideInterfaces});
 const pointDefs={...markers.points,pinionCentre:markers.pinion.centre,pinionReference:markers.pinion.reference};
 const owner=id=>{const b=run.mechanism.bodies.filter(b=>b.parts.includes(id));assert.equal(b.length,1,'Unique actual body owner required: '+id);return b[0];};
 const owners=Object.fromEntries(Object.entries(pointDefs).map(([k,m])=>[k,{...m,body:owner(m.part).id}]));
 assert.equal(owner(cf.part).id,o.base.id,'Coordinate basis is on the actual chassis');
 if(developmentClampedSupportBodyIds===null){
  assert.equal(owners.origin.body,o.base.id,'O belongs to the actual chassis');
 }else{
  const expected=[...new Set(markers.developmentSupportParts.map(id=>owner(id).id))].sort();
  assert.deepEqual([...developmentClampedSupportBodyIds].sort(),expected,'Only the explicitly named development fixture supports may be clamped');
  assert.ok(expected.includes(o.base.id)&&expected.includes(owners.origin.body),'Both separately supported development datum islands must be declared');
  assert.ok(expected.every(id=>run.mechanism.bodies.find(b=>b.id===id)?.motion==='static'),'Every declared development support is actually static');
 }
 assert.notEqual(owners.slider.body,owners.output.body,'Input carriage and passive output must be independently observed bodies');
 assert.equal(owners.longInput.body,owners.output.body,'The long-link input pivot and B are on one actual rigid bar');
 assert.equal(owners.midpoint.body,owners.output.body,'The long-link midpoint is physical');
 assert.notEqual(owners.shortMidpoint.body,owners.output.body,'Short and long links remain independent hinged bodies');
 assert.notEqual(owners.output.body,o.base.id,'The output is not frozen into the frame');
 const carriageBodies=[...new Set(guides.interfaces.flatMap(g=>g.ends.filter(e=>e.type==='slide-bore').map(e=>e.body)))];
 assert.deepEqual(carriageBodies,[owners.slider.body],'Every real guide bore belongs to the independently observed input carriage');
 assert.ok(!run.mechanism.joints.some(j=>j.type==='slider'&&[j.body1,j.body2].includes(owners.output.body)),'No direct prismatic output guide may impose the output line');
 const actuator=run.mechanism.actuators.find(a=>a.port==='A');assert.ok(actuator,'Actual motor A required');
 const motor=run.mechanism.joints.find(j=>j.id===actuator.joint);assert.ok(motor);
 assert.ok(![motor.body1,motor.body2].includes(owners.output.body),'No motor may prescribe the output body');
 const zero=o.initial(cf.part),basis=[cf.horizontalLocal,cf.downLocal,cf.depthLocal].map(v=>unit(sub(o.initial(cf.part,v),zero)));
 assert.ok(Math.abs(dot(basis[0],basis[1]))+Math.abs(dot(basis[0],basis[2]))+Math.abs(dot(basis[1],basis[2]))<1e-8,'Orthonormal observed chassis frame');
 const motorAxis=unit(motor.axis),rotationEncoderSign=Math.sign(dot(motorAxis,cross(basis[0],basis[1])));
 assert.ok(Math.abs(dot(motorAxis,cross(basis[0],basis[1])))>.999,'Input motor axis belongs to the linkage plane normal');
 const point=(f,m)=>o.point(f,m.part,m.local||[0,0,0]);
 const worldPoints=run.track.map(f=>Object.fromEntries(Object.entries(pointDefs).map(([k,m])=>[k,point(f,m)])));
 assert.ok(worldPoints.length>0,'Actual pose samples required');
 const coords=worldPoints.map(p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,basis.map(a=>dot(sub(v,p.origin),a)*1000)])));
 const first=coords[0],rawAngles=coords.map(p=>Math.atan2(p.pinionReference[1]-p.pinionCentre[1],p.pinionReference[0]-p.pinionCentre[0]));
 const inputAngles=unwrap(rawAngles),longLengthMm=geometry.longLinkLdu*.4,halfLengthMm=geometry.halfLinkLdu*.4,pitchRadiusMm=geometry.pinionPitchRadiusLdu*.4;
 assert.equal(longLengthMm,2*halfLengthMm,'Exact midpoint proportions are required');
 const rows=run.track.map((f,index)=>{
  const p=coords[index],hinge=physical.measure(f),guide=guides.measure(f),A=p.slider,B=p.output,M=p.midpoint,S=p.shortMidpoint;
  const encoderDeg=degrees(f.joints[motor.id].angle),inputAngleDeg=degrees(inputAngles[index]);
  const expectedY=Math.sqrt(Math.max(0,longLengthMm**2-A[0]**2));
  const outputUpMm=-B[1],initialUpMm=-first.output[1];
  const lineErrorMm=Math.hypot(B[0],B[2]-first.output[2]);
  const inputLineErrorMm=Math.hypot(A[1],A[2]-first.slider[2]);
  const carriage=run.mechanism.bodies.find(b=>b.id===guides.interfaces[0].ends.find(e=>e.type==='slide-bore').body);
  assert.ok(carriage&&carriage.id!==owners.output.body&&carriage.id!==o.base.id,'The sole slider carriage is a distinct body');
  const reference=basis.reduce((s,v)=>s+dot(o.vector(f,carriage.parts.find(id=>run.mechanism.bodies.filter(b=>b.parts.includes(id)).length===1),v),v),0);
  const inputInwardMm=first.slider[0]-A[0],predictedInwardFromEncoderMm=motorDirectionForInwardSlider===null?null:motorDirectionForInwardSlider*encoderDeg*Math.PI/180*pitchRadiusMm;
  const basePose=f.bodies[o.base.id],base0=run.track[0].bodies[o.base.id];
  const baseDot=Math.abs(basePose.rotation.reduce((sum,v,k)=>sum+v*base0.rotation[k],0));
  const row={t:f.t,phase:f.phase,coordinatesMm:p,encoderDeg,inputAngleDeg,inputEncoderErrorDeg:inputAngleDeg-rotationEncoderSign*encoderDeg,inputXmm:A[0],inputInwardMm,outputUpMm,outputRiseMm:outputUpMm-initialUpMm,outputLineErrorMm:lineErrorMm,inputLineErrorMm,expectedOutputUpFromActualInputMm:expectedY,lawErrorMm:outputUpMm-expectedY,circleResidualMm:Math.hypot(A[0],outputUpMm)-longLengthMm,midpointLawErrorMm:Math.hypot(M[0]-(A[0]+B[0])/2,M[1]-(A[1]+B[1])/2),shortLinkRadiusMm:Math.hypot(S[0],S[1]),shortLinkRadiusErrorMm:Math.hypot(S[0],S[1])-halfLengthMm,midpointClosureMm:Math.hypot(M[0]-S[0],M[1]-S[1]),carriageRotationDeg:degrees(Math.acos(clamp((reference-1)/2))),predictedInwardFromEncoderMm,rackLawErrorMm:predictedInwardFromEncoderMm===null?null:inputInwardMm-predictedInwardFromEncoderMm,outputReturnDistanceMm:norm(sub(B,first.output)),sliderReturnDistanceMm:norm(sub(A,first.slider)),hingeGapMm:Math.max(o.gap(f),hinge.gapMm),originalHingeGapMm:hinge.gapMm,axisMismatchDeg:Math.max(o.axisGap(f),hinge.axisMismatchDeg,guide.maxAxisMismatchDeg),guideTransverseMm:guide.maxTransverseMm,minGuideEngagementMm:guide.minEngagementMm,minGuideEndMarginMm:guide.minEndMarginMm,guideInterfaces:guide.observations,baseTiltDeg:o.tilt(f),baseTranslationMm:norm(sub(basePose.position,base0.position))*1000,baseRotationDeg:degrees(2*Math.acos(clamp(baseDot))),variables:f.extra?.variables||{},motorBusy:f.extra?.motorBusy??null};
  row.motorBusy=f.busy?.A??row.motorBusy;
  row.inputPivotClosureMm=Math.hypot(A[0]-p.longInput[0],A[1]-p.longInput[1],A[2]-p.longInput[2]-(first.slider[2]-first.longInput[2]));
  row.finite=Object.values(f.bodies).every(b=>[...b.position,...b.rotation].every(Number.isFinite))&&Object.values(f.joints).every(j=>Object.values(j).filter(v=>typeof v==='number').every(Number.isFinite))&&Object.values(row).filter(v=>typeof v==='number').every(Number.isFinite)&&Object.values(p).flat().every(Number.isFinite);
  return row;
 });
 return {rows,owners,baseBody:o.base.id,rotationEncoderSign,motorJoint:motor.id,physicalInterfaces:physical.interfaces,guideInterfaces:guides.interfaces,observedBodyCount:run.mechanism.bodies.filter(b=>b.parts.length).length};
}
