// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Read actual body poses and real band-anchor geometry; never prescribe motion.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const SOURCE=fileURLToPath(new URL('../../../../',import.meta.url));
const {partCircle,BANDS,bandPath}=await import(pathToFileURL(path.join(SOURCE,'overlay/scratch-gui/src/lib/bw-sim/editor/belt-path.js')).href);
const DEG=180/Math.PI,MM=1000,LDU_M=.0004;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(v,k)=>v.map(x=>x*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v);
const unit=v=>scale(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const conjugate=q=>[-q[0],-q[1],-q[2],q[3]];
const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-dot(a.slice(0,3),b.slice(0,3))];
const rotate=(q,v)=>{const t=scale(cross(q.slice(0,3),v),2);return add(v,add(scale(t,q[3]),cross(q.slice(0,3),t)));};
const clamp=x=>Math.max(-1,Math.min(1,x));
const toWorld=p=>[p[0]*LDU_M,-p[1]*LDU_M,-p[2]*LDU_M];
const toLdu=p=>[p[0]/LDU_M,-p[1]/LDU_M,-p[2]/LDU_M];
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const unwrapper=()=>{let previous=null,value=0;return a=>{value=previous===null?a:value+wrap(a-previous);previous=a;return value;};};

export function makeObserver(rig,{motorToInputSign=null}={}){
  const core=rig.session.core,m=rig.session.mechanism;
  const parts=new Map(rig.session.runModel.parts.map(p=>[p.id,p]));
  const bodies=new Map(m.bodies.map(b=>[b.id,b]));
  const initial=new Map(m.bodies.map(b=>[b.id,core.bodyPose(b.id)]));
  const hinges=m.joints.filter(j=>j.type==='hinge');assert.equal(hinges.length,2);
  const driven=hinges.find(j=>j.motor?.port==='A');assert.ok(driven);
  const passive=hinges.find(j=>!j.motor);assert.ok(passive);
  const shared=[driven.body1,driven.body2].filter(b=>[passive.body1,passive.body2].includes(b));
  assert.equal(shared.length,1,'Both real revolute bearings must connect to the same physical support.');
  const frame=shared[0],input=driven.body1===frame?driven.body2:driven.body1,output=passive.body1===frame?passive.body2:passive.body1;
  const ids={frame,input,output};assert.equal(new Set(Object.values(ids)).size,3);
  const bodyFor=id=>{const found=m.bodies.filter(b=>b.parts?.includes(id));assert.equal(found.length,1,`${id}: one anchor owner`);return found[0].id;};
  const authoredDirection=(id,v)=>{const p=parts.get(id);return [0,1,2].map(r=>dot(p.rotation.slice(r*3,r*3+3),v));};
  const authoredPoint=(id,v)=>add(parts.get(id).position,authoredDirection(id,v));
  const fixedPoint=(name,body,world,details={})=>{
    const p=initial.get(body),local=rotate(conjugate(p.rotation),sub(world,p.position));
    return {name,body,authoredPointLdu:toLdu(world),...details,read(){const now=core.bodyPose(body);return add(now.position,rotate(now.rotation,local));}};
  };
  const points={
    inputCenter:fixedPoint('inputCenter',input,driven.point),
    inputBearing:fixedPoint('inputBearing',frame,driven.point),
    outputCenter:fixedPoint('outputCenter',output,passive.point),
    outputBearing:fixedPoint('outputBearing',frame,passive.point),
    origin:fixedPoint('origin',frame,passive.point)
  };
  const bands=(rig.session.model.belts||[]).map(b=>{
    assert.equal(b.around.length,2);
    const anchors=b.around.map(id=>{
      const p=parts.get(id),meta=rig.session.catalog.get(p.part),circle=partCircle(meta);assert.ok(circle,`${id}: native physical band seat`);
      const body=bodyFor(id),role=body===input?'input':body===output?'output':null;assert.ok(role);
      const name=`${b.id}_${role}`,center=authoredPoint(id,circle.center),axis=unit(authoredDirection(id,circle.axis));
      points[name]=fixedPoint(name,body,toWorld(center),{part:id,point:'actual native partCircle center',radiusLdu:circle.r,axisLdu:axis});
      return {part:id,body,role,point:name,radiusLdu:circle.r,axisLdu:axis};
    });
    assert.deepEqual(new Set(anchors.map(a=>a.role)),new Set(['input','output']));
    const band=BANDS.find(x=>x.part===b.band);assert.ok(band);
    const coupling=m.couplings.find(c=>c.kind==='spring'&&c.parts?.length===2&&c.parts.every(p=>b.around.includes(p)));assert.ok(coupling);
    const d0Ldu=Math.max(0,(band.restLdu-Math.PI*anchors.reduce((s,a)=>s+a.radiusLdu,0))/2);
    assert.ok(Math.abs(coupling.restM-d0Ldu*LDU_M)<1e-10);
    return {...b,anchors,restLengthLdu:band.restLdu,restCenterDistanceMm:d0Ldu*.4,stiffnessNPerM:coupling.stiffness,dampingNsPerM:coupling.damping};
  });
  assert.equal(bands.length,2);assert.equal(m.couplings.length,2);assert.ok(m.couplings.every(c=>c.kind==='spring'));
  const reference=Object.fromEntries(['input','output'].map(role=>[role,bands[0].anchors.find(a=>a.role===role).point]));
  const initialVectors=Object.fromEntries(['input','output'].map(role=>[role,sub(points[reference[role]].read(),points[`${role}Center`].read())]));
  const savedAngle=Object.fromEntries(Object.entries(initialVectors).map(([role,v])=>[role,Math.atan2(v[0],-v[2])]));
  const initialRelativeMm=Object.fromEntries(Object.entries(points).map(([name,p])=>{
    const d=sub(p.read(),points.origin.read());return [name,[d[0]*MM,-d[2]*MM,d[1]*MM]];
  }));
  const unwrap={input:unwrapper(),output:unwrapper()};
  const direction=(body,v)=>unit(rotate(mul(core.bodyPose(body).rotation,conjugate(initial.get(body).rotation)),v));
  const hingeClosurePairs=[['inputCenter','inputBearing'],['outputCenter','outputBearing']];
  let maximumBaseTiltDegrees=0,maximumBaseTranslationMm=0;
  const read=()=>{
    const pose=core.bodyPose(frame),delta=mul(pose.rotation,conjugate(initial.get(frame).rotation));
    const x=rotate(delta,[1,0,0]),z=rotate(delta,[0,0,-1]),up=rotate(delta,[0,1,0]);
    const actual=Object.fromEntries(Object.entries(points).map(([name,p])=>[name,p.read()]));
    const relative=p=>{const d=sub(p,actual.origin);return [dot(d,x)*MM,dot(d,z)*MM,dot(d,up)*MM];};
    const positionsMm=Object.fromEntries(Object.entries(actual).map(([name,p])=>[name,relative(p)]));
    const angles=Object.fromEntries(['input','output'].map(role=>{
      const v=sub(actual[reference[role]],actual[`${role}Center`]);return [role,unwrap[role](wrap(Math.atan2(dot(v,x),dot(v,z))-savedAngle[role]))*DEG];
    }));
    const bandReadings=bands.map(b=>{
      const [a1,a2]=b.anchors,d=norm(sub(actual[a1.point],actual[a2.point]))*MM;
      const physicsLoopLengthMm=2*d+Math.PI*(a1.radiusLdu+a2.radiusLdu)*.4;
      const currentCircles=b.anchors.map(a=>{const axis=direction(a.body,toWorld(a.axisLdu));return {center:toLdu(actual[a.point]),axis:[axis[0],-axis[1],-axis[2]],r:a.radiusLdu};});
      // The editor path is a distinct check from the constitutive spring law.
      const drawn=bandPath(currentCircles);
      return {id:b.id,band:b.band,centerDistanceMm:d,extensionMm:d-b.restCenterDistanceMm,
        physicsLoopStretchRatio:physicsLoopLengthMm/(b.restLengthLdu*.4),
        editorPathStretchRatio:drawn.error?null:drawn.lengthLdu/b.restLengthLdu,
        editorPathError:drawn.error||null,
        elasticForceMagnitudeN:b.stiffnessNPerM*Math.max(0,(d-b.restCenterDistanceMm)/1000),
        anchorsMm:b.anchors.map(a=>({role:a.role,part:a.part,point:positionsMm[a.point]}))};
    });
    const closureErrors=hingeClosurePairs.map(([a,b])=>({name:`${a}/${b}`,errorMm:norm(sub(actual[a],actual[b]))*MM}));
    const axisErrors=['input','output'].map(role=>({name:role,errorDegrees:Math.acos(clamp(Math.abs(dot(direction(ids[role],[0,1,0]),up))))*DEG}));
    const outOfPlaneErrors=Object.entries(points).map(([name,p])=>({name,errorMm:positionsMm[name][2]+(p.authoredPointLdu[1]-points.origin.authoredPointLdu[1])*.4}));
    const baseTiltDegrees=Math.acos(clamp(dot(up,[0,1,0])))*DEG;
    const baseTranslationMm=norm(sub(pose.position,initial.get(frame).position))*MM;
    maximumBaseTiltDegrees=Math.max(maximumBaseTiltDegrees,baseTiltDegrees);maximumBaseTranslationMm=Math.max(maximumBaseTranslationMm,baseTranslationMm);
    const encoderADegrees=rig.api.encoder('A').angleDeg;
    return {timeMs:rig.session.bridge?.timeMs??core.time*1000,sessionTimeMs:rig.session.time,physicsTimeMs:core.time*1000,encoderADegrees,inputDegrees:angles.input,outputDegrees:angles.output,
      inputSpeedDps:-dot(sub(core.bodyAngularVelocity(input),core.bodyAngularVelocity(frame)),up)*DEG,
      outputSpeedDps:-dot(sub(core.bodyAngularVelocity(output),core.bodyAngularVelocity(frame)),up)*DEG,
      inputToEncoderErrorDegrees:motorToInputSign===null?null:angles.input-motorToInputSign*encoderADegrees,
      inputBandAnchorMm:bands.map(b=>positionsMm[b.anchors.find(a=>a.role==='input').point]),
      outputBandAnchorMm:bands.map(b=>positionsMm[b.anchors.find(a=>a.role==='output').point]),
      bandCenterDistancesMm:bandReadings.map(b=>b.centerDistanceMm),bandStretchRatios:bandReadings.map(b=>b.editorPathStretchRatio),bandReadings,
      maximumJointClosureErrorMm:Math.max(...closureErrors.map(e=>e.errorMm)),
      maximumAxisDeviationDegrees:Math.max(...axisErrors.map(e=>e.errorDegrees)),
      maximumOutOfPlaneErrorMm:Math.max(...outOfPlaneErrors.map(e=>Math.abs(e.errorMm))),
      maximumReturnPointDifferenceMm:Math.max(...['input','output'].map(role=>norm(sub(positionsMm[reference[role]],initialRelativeMm[reference[role]])))),
      baseTiltDegrees,baseTranslationMm,positionsMm,closureErrors,axisErrors,outOfPlaneErrors};
  };
  return {read,ids,points:Object.fromEntries(Object.entries(points).map(([name,p])=>[name,{name,body:p.body,part:p.part,point:p.point,authoredPointLdu:p.authoredPointLdu}])),
    bands,hingeClosurePairs,bodyParts:Object.fromEntries(Object.entries(ids).map(([role,id])=>[role,bodies.get(id).parts])),
    baseMotion:()=>({maximumBaseTiltDegrees,maximumBaseTranslationMm})};
}
