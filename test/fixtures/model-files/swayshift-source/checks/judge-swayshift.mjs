// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Independent part-marker observations. This file never steps or writes physics.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repoRoot=resolve(process.env.BW_REPO_ROOT||fileURLToPath(new URL('../../brickwright-lite/',import.meta.url)));
const {observeAddon}=await import(pathToFileURL(resolve(repoRoot,'scripts/lib/sim-lab-addon-judge.mjs')));
const partMetadataRaw=JSON.parse(readFileSync(resolve(repoRoot,'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'),'utf8')).parts;
const partMetadata=new Map((Array.isArray(partMetadataRaw)?partMetadataRaw:Object.values(partMetadataRaw)).map(p=>[p.part,p]));
const finite=Number.isFinite;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>scale(a,1/norm(a));
const clamp=x=>Math.max(-1,Math.min(1,x));
const deg=r=>r*180/Math.PI,rad=d=>d*Math.PI/180;
const conj=q=>[-q[0],-q[1],-q[2],q[3]];
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c];
const rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3);
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const projected=(v,a)=>sub(v,scale(a,dot(v,a)));
const signedAngle=(u,v,a)=>Math.atan2(dot(a,cross(unit(projected(u,a)),unit(projected(v,a)))),dot(unit(projected(u,a)),unit(projected(v,a))));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;};
const rms=a=>a.length?Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length):null;
const maximum=a=>a.length?Math.max(...a):null;
const minimum=a=>a.length?Math.min(...a):null;
const span=a=>a.length?maximum(a)-minimum(a):null;
const vec=a=>Array.isArray(a)&&a.length===3&&a.every(finite);
const pose=p=>p&&vec(p.position)&&Array.isArray(p.rotation)&&p.rotation.length===4&&p.rotation.every(finite);
const requireData=(ok,label)=>{if(!ok)throw new Error('SwayShift observation requires '+label);};
const contractOf=c=>typeof c==='string'?JSON.parse(readFileSync(c,'utf8')):c;
const variable=(f,name)=>f.extra?.variables?.[name]??f.extra?.[name];
const asBool=x=>x===true||x===1||x==='1';

function linearSample(rows,t,field,timeField='nativeTime'){
  requireData(rows.length&&finite(t),'a finite sample time');
  requireData(t>=rows[0][timeField]-1e-9&&t<=rows.at(-1)[timeField]+1e-9,'a fully observed interval at '+t);
  let lo=0,hi=rows.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(rows[m][timeField]<=t)lo=m;else hi=m;}
  if(Math.abs(t-rows[lo][timeField])<1e-10)return rows[lo][field];
  if(Math.abs(t-rows[hi][timeField])<1e-10)return rows[hi][field];
  const a=rows[lo],b=rows[hi],u=(t-a[timeField])/(b[timeField]-a[timeField]);
  const x=a[field],y=b[field];
  return Array.isArray(x)?x.map((v,i)=>v+u*(y[i]-v)):x+u*(y-x);
}

/** Time integration on a prescribed window. No phase search or fitted mean. */
export function angleWindow(rows,start,end){
  requireData(finite(start)&&finite(end)&&end>start,'an ordered angle window');
  const interior=rows.filter(r=>r.nativeTime>start&&r.nativeTime<end);
  const samples=[{t:start,angle:linearSample(rows,start,'angleGravityDeg')},
    ...interior.map(r=>({t:r.nativeTime,angle:r.angleGravityDeg})),
    {t:end,angle:linearSample(rows,end,'angleGravityDeg')}];
  let area=0,area2=0;
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i],dt=b.t-a.t;
    // Exact integral of each piecewise-linear observed segment and its square.
    area+=dt*(a.angle+b.angle)/2;
    area2+=dt*(a.angle*a.angle+a.angle*b.angle+b.angle*b.angle)/3;
  }
  const angles=samples.map(x=>x.angle);
  return {startSeconds:start,endSeconds:end,durationSeconds:end-start,observedSamples:interior.length,
    rmsDeg:Math.sqrt(area2/(end-start)),meanDeg:area/(end-start),peakDeg:maximum(angles.map(Math.abs)),
    peakToPeakDeg:span(angles),minimumDeg:minimum(angles),maximumDeg:maximum(angles),samples};
}

/** Both positive-going crossings and all same-sign peak decrements are retained. */
export function ringdown(rows,start,end){
  const window=rows.filter(r=>r.nativeTime>=start&&r.nativeTime<=end),crossings=[],peaks=[];
  for(let i=1;i<window.length;i++){
    const a=window[i-1],b=window[i];
    if(a.angleGravityDeg<0&&b.angleGravityDeg>=0){
      const u=-a.angleGravityDeg/(b.angleGravityDeg-a.angleGravityDeg);
      crossings.push(a.nativeTime+u*(b.nativeTime-a.nativeTime));
    }
  }
  for(let i=1;i+1<window.length;i++){
    const a=window[i-1],b=window[i],c=window[i+1],y=b.angleGravityDeg;
    const isMax=y>0&&y>a.angleGravityDeg&&y>=c.angleGravityDeg;
    const isMin=y<0&&y<a.angleGravityDeg&&y<=c.angleGravityDeg;
    if(!isMax&&!isMin)continue;
    const l=a.nativeTime-b.nativeTime,r=c.nativeTime-b.nativeTime;
    const A=((a.angleGravityDeg-y)/l-(c.angleGravityDeg-y)/r)/(l-r);
    const B=(a.angleGravityDeg-y)/l-A*l;
    const vertex=A!==0?-B/(2*A):0;
    // Refine only an already observed local extremum, never extrapolate.
    const x=finite(vertex)&&vertex>=l&&vertex<=r?vertex:0;
    peaks.push({t:b.nativeTime+x,angleDeg:y+B*x+A*x*x,sign:isMax?1:-1});
  }
  const periods=crossings.slice(1).map((t,i)=>t-crossings[i]);
  const decrements=[];
  for(const sign of [-1,1]){
    const p=peaks.filter(x=>x.sign===sign);
    for(let i=1;i<p.length;i++)decrements.push({start:p[i-1].t,end:p[i].t,
      startAmplitudeDeg:Math.abs(p[i-1].angleDeg),endAmplitudeDeg:Math.abs(p[i].angleDeg),
      logDecrement:Math.log(Math.abs(p[i-1].angleDeg/p[i].angleDeg))});
  }
  const delta=median(decrements.map(x=>x.logDecrement));
  return {startSeconds:start,endSeconds:end,positiveGoingCrossingsSeconds:crossings,periodsSeconds:periods,
    periodSeconds:mean(periods),periodStdSeconds:periods.length?Math.sqrt(mean(periods.map(x=>(x-mean(periods))**2))):null,
    peaks,sameSignPeakIntervals:decrements,medianFullCycleLogDecrement:delta,
    halfPeriodAmplitudeMultiplier:finite(delta)?Math.exp(-delta/2):null,
    halfPeriodMultiplierRange:decrements.length?[minimum(decrements.map(x=>Math.exp(-x.logDecrement/2))),maximum(decrements.map(x=>Math.exp(-x.logDecrement/2)))]:null};
}

function shapeCorners(shape){
  let h;
  if(shape.shape==='box')h=shape.halfExtents;
  else if(shape.shape==='sphere')h=[shape.radius,shape.radius,shape.radius];
  else if(shape.shape==='cylinder'||shape.shape==='capsule')h=[shape.radius,shape.halfHeight+(shape.shape==='capsule'?shape.radius:0),shape.radius];
  else throw new Error('Unsupported SwayShift clearance shape: '+shape.shape);
  requireData(vec(h),'finite shape bounds');
  const q=shape.rotation||[0,0,0,1],p=shape.position||[0,0,0];
  return [-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>add(p,rot(q,[x*h[0],y*h[1],z*h[2]])))));
}

function boxOf(body,p,shape){
  let h;
  if(shape.shape==='box')h=shape.halfExtents;
  else if(shape.shape==='sphere')h=[shape.radius,shape.radius,shape.radius];
  else if(shape.shape==='cylinder'||shape.shape==='capsule')h=[shape.radius,shape.halfHeight+(shape.shape==='capsule'?shape.radius:0),shape.radius];
  else throw new Error('Unsupported SwayShift clearance shape: '+shape.shape);
  const q=mul(p.rotation,shape.rotation||[0,0,0,1]);
  return{body:body.id,part:shape.part??shape.sourcePart,centre:add(p.position,rot(p.rotation,shape.position||[0,0,0])),
    axes:[[1,0,0],[0,1,0],[0,0,1]].map(a=>rot(q,a)),half:h};
}

// Maximum separating-axis gap is a conservative lower bound on shape distance.
// Cylinders/spheres use enclosing oriented boxes; reported clearances are not CAD mesh distances.
function boxSeparation(a,b){
  const delta=sub(b.centre,a.centre),axes=[...a.axes,...b.axes];
  for(const u of a.axes)for(const v of b.axes){const w=cross(u,v);if(norm(w)>1e-8)axes.push(unit(w));}
  return maximum(axes.map(n=>Math.abs(dot(delta,n))-a.axes.reduce((s,v,i)=>s+Math.abs(dot(v,n))*a.half[i],0)-b.axes.reduce((s,v,i)=>s+Math.abs(dot(v,n))*b.half[i],0)));
}

/** Core geometry path shared by calibration and the later two-run comparison. */
export function observeSwayShift(r,{contract:input}={}){
  const c=contractOf(input);requireData(c?.gates&&c?.geometry,'a qualification contract');
  requireData(r.mechanism&&r.runModel&&Array.isArray(r.track)&&r.track.length>2,'the native mechanism, runModel and track');
  const ids=c.geometry.requiredPartIds,o=observeAddon(r,ids.chassis),m=r.mechanism;
  const base=o.body(ids.chassis),carriage=o.body(ids.carriage),pendulum=o.body(ids.pendulumUpper);
  requireData(o.body(ids.pendulumLower).id===pendulum.id,'a single rigid pendulum');
  requireData(new Set([base.id,carriage.id,pendulum.id]).size===3,'independent chassis, carriage and passive pendulum bodies');
  const motor=m.joints.find(j=>j.motor?.port===c.scope.motorPort);
  const free=m.joints.find(j=>j.type==='hinge'&&!j.motor&&[j.body1,j.body2].includes(pendulum.id)&&[j.body1,j.body2].includes(carriage.id));
  const slider=m.joints.find(j=>j.type==='slider'&&[j.body1,j.body2].includes(carriage.id)&&[j.body1,j.body2].includes(base.id));
  requireData(motor&&free,'a real A motor and a passive carriage-pendulum hinge');
  requireData(slider&&Array.isArray(slider.limits)&&slider.limits.length===2,'the actual finite carriage guide constraint');
  const bodyById=new Map(m.bodies.map(b=>[b.id,b])),dynamic=m.bodies.filter(b=>b.motion==='dynamic');
  const initialNative=id=>r.setup?.bodyPoses?.[id];
  const dynamics=id=>r.setup?.bodyDynamics?.[id];
  for(const b of [base,carriage,pendulum]){
    requireData(pose(initialNative(b.id)),b.id+' admitted native pose');
    requireData(dynamics(b.id)&&vec(dynamics(b.id).centerOfMassWorld),b.id+' admitted COM');
  }
  const localCom=Object.fromEntries([base,carriage,pendulum].map(b=>[b.id,rot(conj(initialNative(b.id).rotation),sub(dynamics(b.id).centerOfMassWorld,initialNative(b.id).position))]));
  const bodyPoint=(id,p)=>{const b=bodyById.get(id);return{body:id,local:rot(conj(b.rotation),sub(p,b.position))};};
  const partPoint=(id,p)=>bodyPoint(o.body(id).id,o.initial(id,p));
  const carry=(f,p)=>add(f.bodies[p.body].position,rot(f.bodies[p.body].rotation,p.local));
  const carryVector=(f,id,v)=>rot(f.bodies[id].rotation,rot(conj(bodyById.get(id).rotation),v));
  const marks=c.geometry.markerPoints||{
    pendulumTop:{part:ids.pendulumUpper,local:[0,0,-140]},
    pendulumBottom:{part:ids.pendulumUpper,local:[0,0,140]},
    carriage:{part:ids.carriage,local:[0,0,0]},
    guideStart:{part:'guide_left',local:[20,0,0]},
    guideEnd:{part:'guide_left',local:[-20,0,0]}
  };
  const points=Object.fromEntries(Object.entries(marks).map(([k,x])=>[k,partPoint(x.part,x.local)]));
  const sourceParts=new Map(r.runModel.parts.map(p=>[p.id,p]));
  const canonical=id=>{const p=sourceParts.get(id);requireData(p&&partMetadata.has(p.part),'canonical metadata for '+id);return partMetadata.get(p.part);};
  const connectorEnds=(id,k)=>{
    const connector=canonical(id).connectors.find(x=>x.id===k);
    requireData(connector&&vec(connector.position)&&vec(connector.axis)&&finite(connector.length),'physical connector '+id+':'+k);
    return [sub(connector.position,scale(connector.axis,connector.length/2)),add(connector.position,scale(connector.axis,connector.length/2))].map(p=>partPoint(id,p));
  };
  const axleConnectorId=id=>{
    const matches=canonical(id).connectors.filter(x=>x.type==='axle');
    requireData(matches.length===1,'one canonical guide-axle connector for '+id);
    return matches[0].id;
  };
  const guides=(c.geometry.guideBindings||[{guide:'guide_left',slide:'slide_left'},{guide:'guide_right',slide:'slide_right'}]).map(g=>({
    ...g,ends:connectorEnds(g.guide,axleConnectorId(g.guide)),bores:['e0','e1'].map(k=>({id:g.slide+':'+k,ends:connectorEnds(g.slide,k)}))}));
  const rackEnds=connectorEnds(ids.carriage,'t'),pinionCentre=partPoint(c.geometry.pinionPartId||'pinion',[0,0,0]);
  const excludedClearancePairs=new Set((c.geometry.intentionalPendulumClearancePairs||[]).map(p=>[...p].sort().join('|')));
  const initialPoint=k=>o.initial(marks[k].part,marks[k].local);
  const axis0=unit(free.axis),gravity=r.setup?.gravity||m.gravity;
  requireData(vec(gravity)&&norm(gravity)>0,'actual gravity');
  const down=unit(gravity),up=scale(down,-1),guide0=unit(sub(initialPoint('guideEnd'),initialPoint('guideStart')));
  const anchors=[free.body1,free.body2].map(id=>bodyPoint(id,free.point));
  const com0=dynamics(pendulum.id).centerOfMassWorld;
  const shaft0=sub(initialPoint('pendulumBottom'),initialPoint('pendulumTop'));
  const equilibriumOffset=signedAngle(shaft0,sub(com0,free.point),axis0);
  const localAxis=rot(conj(initialNative(pendulum.id).rotation),axis0);
  const d=norm(projected(sub(com0,free.point),axis0)),pd=dynamics(pendulum.id);
  requireData(finite(pd.solverMassKg)&&pd.solverMassKg>0&&Array.isArray(pd.inertiaKgM2)&&pd.inertiaKgM2.every(vec),'admitted pendulum mass and tensor');
  const Icom=dot(localAxis,pd.inertiaKgM2.map(row=>dot(row,localAxis))),Ihinge=Icom+pd.solverMassKg*d*d;
  const predictedPeriod=2*Math.PI*Math.sqrt(Ihinge/(pd.solverMassKg*norm(gravity)*pd.gravityFactor*d));
  requireData(finite(predictedPeriod)&&predictedPeriod>0,'a physical compound-pendulum period');
  const floor=bodyById.get('ground');requireData(floor?.colliders?.length,'the ordinary native ground');
  const floorHeight=maximum(floor.colliders.flatMap(s=>shapeCorners(s).map(p=>dot(add(floor.position,rot(floor.rotation,p)),up))));
  const pendulumCorners=pendulum.colliders.flatMap(shapeCorners);
  let previousTime=-Infinity,previousNative=-Infinity;
  const rows=r.track.map((f,index)=>{
    requireData(finite(f.t)&&f.t>previousTime,'strictly increasing session timestamps');previousTime=f.t;
    for(const b of dynamic)requireData(pose(f.bodies?.[b.id]),'finite observed pose '+b.id+' at '+f.t);
    const nativeTime=f.extra?.nativeTime??f.extra?.motorDynamics?.t??(index===0?0:null);
    requireData(finite(nativeTime)&&nativeTime>previousNative,'strictly increasing completed-step timestamps');previousNative=nativeTime;
    const velocities=f.extra?.velocities;
    for(const b of [base,carriage,pendulum])requireData(vec(velocities?.[b.id]?.linear)&&vec(velocities?.[b.id]?.angular),'actual native velocities for '+b.id);
    const axis=unit(carryVector(f,carriage.id,axis0));
    const shaft=sub(carry(f,points.pendulumBottom),carry(f,points.pendulumTop));
    const com=add(f.bodies[pendulum.id].position,rot(f.bodies[pendulum.id].rotation,localCom[pendulum.id]));
    const carriageCom=add(f.bodies[carriage.id].position,rot(f.bodies[carriage.id].rotation,localCom[carriage.id]));
    const pAnchor=carry(f,anchors.find(a=>a.body===pendulum.id)),cAnchor=carry(f,anchors.find(a=>a.body===carriage.id));
    const angleGravity=signedAngle(down,shaft,axis)+equilibriumOffset;
    const carriageDown=carryVector(f,carriage.id,down);
    const angleRelative=signedAngle(carriageDown,shaft,axis)+equilibriumOffset;
    const angleCom=signedAngle(down,sub(com,pAnchor),axis);
    const carriageFramed=o.point(f,marks.carriage.part,marks.carriage.local);
    const contacts=f.extra?.contacts;requireData(Array.isArray(contacts)&&contacts.every(p=>Array.isArray(p)&&p.length===2),'native current contacts');
    const pendantContacts=contacts.filter(p=>p.includes(pendulum.id));
    const shaftAxisMismatch=deg(Math.acos(clamp(dot(unit(carryVector(f,pendulum.id,axis0)),axis))));
    const basePose=f.bodies[base.id],pendPose=f.bodies[pendulum.id];
    const mode=f.extra?.controllerMode??null;
    const engagement=guides.map(g=>{
      const ends=g.ends.map(p=>carry(f,p)),a=unit(sub(ends[1],ends[0])),length=norm(sub(ends[1],ends[0]));
      return {guide:g.guide,bores:g.bores.map(b=>{
        const e=b.ends.map(p=>carry(f,p)),s=e.map(p=>dot(sub(p,ends[0]),a)).sort((x,y)=>x-y);
        return {bore:b.id,coverageFraction:Math.min(1,Math.max(0,Math.min(length,s[1])-Math.max(0,s[0]))/(s[1]-s[0])),
          endMarginMm:1000*Math.min(s[0],length-s[1]),lateralGapMm:1000*norm(projected(sub(scale(add(e[0],e[1]),.5),ends[0]),a)),
          axisMismatchDeg:deg(Math.acos(clamp(Math.abs(dot(unit(sub(e[1],e[0])),a)))))};
      })};
    });
    const rt=rackEnds.map(p=>carry(f,p)),rackAxis=unit(sub(rt[1],rt[0])),rackLength=norm(sub(rt[1],rt[0]));
    const rackContactPosition=dot(sub(carry(f,pinionCentre),rt[0]),rackAxis);
    let pendulumClearanceMm=null,closestPendulumPair=null;
    const localHingeInterfaces={};
    if(c.geometry.intentionalPendulumClearancePairs){
      const moving=pendulum.colliders.map(s=>boxOf(pendulum,pendPose,s));
      const rest=dynamic.filter(b=>b.id!==pendulum.id).flatMap(b=>b.colliders.map(s=>boxOf(b,f.bodies[b.id],s)));
      for(const a of moving)for(const b of rest){
        const pair=[a.part,b.part].sort().join('|');
        if(excludedClearancePairs.has(pair)){
          // The engaged pin/bore is intentionally overlapping; adjacent face
          // pairs retain their signed conservative gap for explicit reporting.
          const gap=1000*boxSeparation(a,b);
          localHingeInterfaces[pair]=localHingeInterfaces[pair]===undefined?gap:Math.min(localHingeInterfaces[pair],gap);
          continue;
        }
        const mm=1000*boxSeparation(a,b);
        if(pendulumClearanceMm===null||mm<pendulumClearanceMm){pendulumClearanceMm=mm;closestPendulumPair=[a.part,b.part];}
      }
    }
    const sliderPosition=dot(sub(carriageFramed,initialPoint('carriage')),slider.axis)*(slider.body2===carriage.id?1:-1);
    return {index,t:f.t,nativeTime,phase:f.phase,stage:Number(variable(f,'stage')),
      completed:Number(variable(f,'completed')),failed:Number(variable(f,'failed')),
      motorBusy:Boolean(f.busy?.[c.scope.motorPort]),controllerMode:mode,drive:f.extra?.drive??null,
      motorAngleDeg:Number(f.extra?.motorAngleDeg??deg(f.joints[motor.id].angle)),
      motorDynamics:f.extra?.motorDynamics??null,passiveDynamics:f.extra?.passiveDynamics??null,
      angleGravityDeg:deg(wrap(angleGravity)),angleRelativeDeg:deg(wrap(angleRelative)),angleComDeg:deg(wrap(angleCom)),
      markerComAngleDifferenceDeg:deg(wrap(angleGravity-angleCom)),
      pendulumCom:com,carriageCom,pendulumVelocity:velocities[pendulum.id].linear,carriageVelocity:velocities[carriage.id].linear,
      pendulumAngularVelocity:velocities[pendulum.id].angular,carriageAngularVelocity:velocities[carriage.id].angular,
      relativeAngularVelocityDegS:deg(dot(sub(velocities[pendulum.id].angular,velocities[carriage.id].angular),axis)),
      carriagePoint:carriageFramed,carriageTravelMm:1000*dot(sub(carriageFramed,initialPoint('carriage')),guide0),
      carriageLateralDriftMm:1000*norm(projected(sub(carriageFramed,initialPoint('carriage')),guide0)),
      carriageRotationDeg:deg(2*Math.acos(clamp(Math.abs(mul(conj(mul(basePose.rotation,conj(base.rotation))),mul(f.bodies[carriage.id].rotation,conj(carriage.rotation)))[3])))),
      hingeGapMm:1000*norm(sub(pAnchor,cAnchor)),hingeAxisMismatchDeg:shaftAxisMismatch,
      allHingeGapMm:o.gap(f),allHingeAxisMismatchDeg:o.axisGap(f),chassisTiltDeg:o.tilt(f),basePosition:basePose.position,
      pendulumContacts:pendantContacts,engagement,
      rackUsableToothMarginMm:1000*Math.min(rackContactPosition,rackLength-rackContactPosition),
      nativeSliderEndMarginMm:1000*Math.min(sliderPosition-slider.limits[0],slider.limits[1]-sliderPosition),
      pendulumClearanceMm,closestPendulumPair,localHingeInterfaces,
      pendulumFloorClearanceMm:1000*(minimum(pendulumCorners.map(p=>dot(add(pendPose.position,rot(pendPose.rotation,p)),up)))-floorHeight)
    };
  });
  return {rows,geometry:{bodyIds:{base:base.id,carriage:carriage.id,pendulum:pendulum.id},motorJointId:motor.id,freeHingeId:free.id,
    markers:marks,gravity,initialGuideDirection:guide0,equilibriumOffsetDeg:deg(equilibriumOffset),nativePendulum:pd,
    comLeverMetres:d,comInertiaKgM2:Icom,hingeInertiaKgM2:Ihinge,predictedPeriodSeconds:predictedPeriod},
    topology:{issues:r.issues,unsupported:r.unsupported,importedStaticBodies:m.bodies.filter(b=>b.parts.length&&b.motion!=='dynamic').map(b=>b.id),
      actuatorCount:m.actuators.length,passiveHinge:free,pendulumRelatedCouplings:m.couplings.filter(cp=>Object.values(cp).includes(free.id))}};
}

function gate(list,id,actual,limit,operation='<='){
  const pass=operation==='>='?finite(actual)&&actual>=limit:operation==='==='?actual===limit:finite(actual)&&actual<=limit;
  list.push({id,passed:pass,actual,operation,limit});
}

/** This analysis is fixed before the final-scene calibration is read. */
export function measureSwayShiftCalibration(r,{contract:input}={}){
  const c=contractOf(input),o=observeSwayShift(r,{contract:c}),rows=o.rows,T=o.geometry.predictedPeriodSeconds;
  const events=r.commandEvents||r.commandLog||[];
  const hold=events.find(e=>e.name==='stopMotor'&&e.args?.[0]===c.scope.motorPort&&e.args?.[1]==='hold');
  requireData(hold&&finite(hold.t),'an actual calibration hold command');
  const holdSeconds=hold.t/1000,start=holdSeconds+T,end=holdSeconds+9*T;
  const a=angleWindow(rows,start,end),rd=ringdown(rows,start,end),sampleRows=rows.filter(x=>x.nativeTime>=start&&x.nativeTime<=end);
  const gates=[],g=c.gates;
  gate(gates,'calibration_no_import_issues',r.issues?.length??NaN,0);
  gate(gates,'calibration_no_unsupported',r.unsupported?.length??NaN,0);
  gate(gates,'calibration_no_static_imported_bodies',o.topology.importedStaticBodies.length,0);
  gate(gates,'calibration_pendulum_mass_unchanged',o.geometry.nativePendulum.massAdjusted,false,'===');
  gate(gates,'calibration_pendulum_inertia_unchanged',o.geometry.nativePendulum.inertiaAdjusted,false,'===');
  gate(gates,'calibration_no_pendulum_contact',rows.reduce((n,x)=>n+(x.pendulumContacts.length>0?1:0),0),0);
  gate(gates,'calibration_hinge_gap_mm',maximum(rows.map(x=>x.allHingeGapMm)),g.hingeGapMmMax);
  gate(gates,'calibration_hinge_axes_deg',maximum(rows.map(x=>x.allHingeAxisMismatchDeg)),g.hingeAxisMismatchDegMax);
  gate(gates,'calibration_pendulum_floor_mm',minimum(rows.map(x=>x.pendulumFloorClearanceMm)),g.pendulumFloorClearanceMmMin,'>=');
  gate(gates,'calibration_marker_COM_angle_agreement_deg',maximum(rows.map(x=>Math.abs(x.markerComAngleDifferenceDeg))),0.01);
  gate(gates,'calibration_initial_saved_angle_error_deg',Math.abs(Math.abs(rows[0].angleGravityDeg)-c.calibration.freeCalibrationInitialAngleDeg),0.01);
  gate(gates,'calibration_useful_observed_peak_deg',a.peakDeg,1,'>=');
  gate(gates,'calibration_bounded_small_angle_deg',maximum(rows.map(x=>Math.abs(x.angleGravityDeg))),6);
  gate(gates,'calibration_actual_carriage_hold_range_mm',span(sampleRows.map(x=>x.carriageTravelMm)),g.residualHoldCarriageRangeMmMax);
  gate(gates,'calibration_complete_period_intervals',rd.periodsSeconds.length,c.calibration.freePeriodMinimumFullCycles,'>=');
  gate(gates,'calibration_period_relative_error',finite(rd.periodSeconds)?Math.abs(rd.periodSeconds/T-1):NaN,g.controlObservedPeriodRelativeErrorMax);
  gate(gates,'calibration_peak_intervals',rd.sameSignPeakIntervals.length,g.ringdownSameSignPeakIntervalsMin,'>=');
  gate(gates,'calibration_half_period_decay_multiplier_min',rd.halfPeriodAmplitudeMultiplier,g.ringdownHalfPeriodAmplitudeMultiplierMin,'>=');
  gate(gates,'calibration_half_period_decay_multiplier_max',rd.halfPeriodAmplitudeMultiplier,g.ringdownHalfPeriodAmplitudeMultiplierMax);
  gate(gates,'calibration_marker_sampling_density',sampleRows.length/8,g.residualWindowSamplesPerPeriodMin,'>=');
  gate(gates,'calibration_native_controller_hold_fraction',sampleRows.filter(x=>x.controllerMode==='hold'&&!x.motorBusy).length/sampleRows.length,1,'>=');
  return {kind:'final-scene-free-period-calibration',passed:gates.every(g=>g.passed),gates,
    modelSha256:r.provenance?.modelSha256??null,programSha256:r.provenance?.programSha256??null,
    geometry:o.geometry,holdCommandSessionSeconds:holdSeconds,analysisWindow:a,ringdown:rd,
    periodSelectionRule:'Arithmetic mean of every observed positive-going crossing interval in the prescribed 8T window; no interval rejection or timing optimization.',
    selectedPeriodSeconds:rd.periodSeconds,rows};
}

function commandMotions(r,port){
  const api=(r.commandEvents||r.commandLog||[]).filter(e=>e.name==='runMotorDegrees'&&e.args?.[0]===port);
  const native=(r.nativeCommandLog||[]).filter(e=>e.name==='runForDegrees'&&e.args?.[0]===port);
  const completed=(r.nativeCompletionLog||[]).filter(e=>e.port===0&&e.before?.mode==='position');
  requireData(api.length===3&&native.length===3&&completed.length===3,'exactly two outward moves and one return, with three native completion events');
  return api.map((e,i)=>{
    const n=native[i],done=completed[i];
    requireData(finite(e.t)&&finite(e.doneAt)&&finite(n.nativeTime)&&finite(done.nativeTime),'actual API and completed native motor clocks');
    return {index:i,sessionStartSeconds:e.t/1000,sessionDoneSeconds:e.doneAt/1000,
      nativeStartSeconds:n.nativeTime,nativeDoneSeconds:done.nativeTime,durationSeconds:done.nativeTime-n.nativeTime,
      apiArguments:e.args,nativeArguments:n.args,apiResult:e.result,nativeResult:done.result,
      busyBefore:e.busyBefore===true||n.busyBefore===true,absoluteWaypointDeg:Number(e.variables?.targetA),
      freshEncoderDeg:Number(e.variables?.fresh_angle),relativeCommandDeg:Number(e.variables?.command_degrees),
      controllerTargetDeg:Number(n.after?.targetDeg),controllerAfter:done.after?.mode??null};
  });
}

function velocityConsistency(rows,start,end){
  const samples=[];
  for(let i=1;i+1<rows.length;i++){
    const a=rows[i-1],b=rows[i],z=rows[i+1];
    if(![a,b,z].every(x=>x.nativeTime>=start&&x.nativeTime<=end&&x.pendulumContacts.length===0))continue;
    const l=b.nativeTime-a.nativeTime,r=z.nativeTime-b.nativeTime;
    const w=[-r/(l*(l+r)),(r-l)/(l*r),l/(r*(l+r))];
    const derivative=key=>[0,1,2].map(k=>w[0]*a[key][k]+w[1]*b[key][k]+w[2]*z[key][k]);
    const nativeAtMiddle=key=>scale(add(scale(a[key],r),scale(z[key],l)),1/(l+r));
    const pv=derivative('pendulumCom'),cv=derivative('carriageCom');
    const nativeP=nativeAtMiddle('pendulumVelocity'),nativeC=nativeAtMiddle('carriageVelocity');
    const thetaRate=w[0]*a.angleRelativeDeg+w[1]*b.angleRelativeDeg+w[2]*z.angleRelativeDeg;
    const omega=(r*a.relativeAngularVelocityDegS+l*z.relativeAngularVelocityDegS)/(l+r);
    samples.push({t:b.nativeTime,pendulumErrorMps:norm(sub(pv,nativeP)),carriageErrorMps:norm(sub(cv,nativeC)),
      angularErrorDegS:Math.abs(thetaRate-omega),observedPendulumVelocity:pv,nativePendulumVelocity:nativeP,
      observedCarriageVelocity:cv,nativeCarriageVelocity:nativeC,observedAngularVelocityDegS:thetaRate,nativeAngularVelocityDegS:omega});
  }
  return {startSeconds:start,endSeconds:end,sampleCount:samples.length,
    pendulumRmsMps:rms(samples.map(x=>x.pendulumErrorMps)),pendulumMaxMps:maximum(samples.map(x=>x.pendulumErrorMps)),
    carriageRmsMps:rms(samples.map(x=>x.carriageErrorMps)),carriageMaxMps:maximum(samples.map(x=>x.carriageErrorMps)),
    angularRmsDegS:rms(samples.map(x=>x.angularErrorDegS)),angularMaxDegS:maximum(samples.map(x=>x.angularErrorDegS)),samples};
}

function holdWindow(rows,start,end){
  const w=rows.filter(x=>x.nativeTime>=start&&x.nativeTime<=end),speed=[];
  for(let i=1;i<w.length;i++)speed.push(Math.abs((w[i].carriageTravelMm-w[i-1].carriageTravelMm)/(w[i].nativeTime-w[i-1].nativeTime)));
  return {samples:w.length,carriageRangeMm:span(w.map(x=>x.carriageTravelMm)),carriageMaximumSpeedMmS:maximum(speed),
    actualHoldFraction:w.length?w.filter(x=>x.controllerMode==='hold'&&!x.motorBusy).length/w.length:null,
    drivePwmFraction:w.length?w.filter(x=>x.drive?.mode==='pwm').length/w.length:null};
}

function modeName(mode){return mode==='shaped'||mode==='tuned'?'tuned':mode==='inPhase'||mode==='in-phase'?'in-phase':null;}

export function measureSwayShift(r,{contract:input,mode:rMode}={}){
  const c=contractOf(input),mode=modeName(rMode||r.provenance?.mode),T=c.calibration.periodSeconds;
  requireData(mode&&finite(T)&&T>0,'a known mode and frozen period');
  const o=observeSwayShift(r,{contract:c}),rows=o.rows,moves=commandMotions(r,c.scope.motorPort),t0=moves[0].sessionStartSeconds;
  const primaryBounds=c.program.primaryWindowPeriodsFromFirstStart.map(x=>t0+x*T);
  const secondaryBounds=c.program.secondaryWindowPeriodsFromActualSecondCompletion.map(x=>moves[1].nativeDoneSeconds+x*T);
  const primary=angleWindow(rows,...primaryBounds),secondary=angleWindow(rows,...secondaryBounds);
  const primaryHold=holdWindow(rows,...primaryBounds),secondaryHold=holdWindow(rows,...secondaryBounds);
  const startPosition=linearSample(rows,moves[0].nativeStartSeconds,'carriageTravelMm');
  const pulses=moves.slice(0,2).map(m=>{
    const start=linearSample(rows,m.nativeStartSeconds,'carriageTravelMm'),end=linearSample(rows,m.nativeDoneSeconds,'carriageTravelMm');
    return {...m,startCarriageMm:start,endCarriageMm:end,travelMm:end-start};
  });
  const returnMove={...moves[2],startCarriageMm:linearSample(rows,moves[2].nativeStartSeconds,'carriageTravelMm'),
    endCarriageMm:linearSample(rows,moves[2].nativeDoneSeconds,'carriageTravelMm')};
  const pre=rows.filter(x=>x.nativeTime>=moves[0].nativeStartSeconds-.25*T&&x.nativeTime<=moves[0].nativeStartSeconds);
  requireData(pre.length>=5,'a settled pre-move observation window');
  const settledBase=[0,1,2].map(k=>mean(pre.map(x=>x.basePosition[k])));
  const transient=rows.filter(x=>x.nativeTime>=moves[0].nativeStartSeconds&&x.nativeTime<moves[1].nativeStartSeconds);
  const outbound=rows.filter(x=>x.nativeTime>=moves[0].nativeStartSeconds&&x.nativeTime<moves[2].nativeStartSeconds);
  const afterFirst=rows.filter(x=>x.nativeTime>=moves[0].nativeStartSeconds);
  const finalHoldRows=rows.filter(x=>x.nativeTime>=moves[2].nativeDoneSeconds);
  const post=rows.filter(x=>x.phase==='after');
  const vc=velocityConsistency(rows,moves[0].nativeStartSeconds,Math.max(primaryBounds[1],secondaryBounds[1]));
  const gEntries=rows.flatMap(x=>x.engagement.flatMap(g=>g.bores));
  const passive=rows.filter(x=>x.nativeTime>0).map(x=>x.passiveDynamics);
  requireData(passive.every(x=>x&&finite(x.motorTorqueNm)),'completed-step passive-hinge effort records');
  const finished=finite(r.finishedAt)&&r.finishedAt>0?r.finishedAt/1000:NaN;
  const localInterfaceNames=[...new Set(rows.flatMap(x=>Object.keys(x.localHingeInterfaces)))];
  return {mode,periodSeconds:T,geometry:o.geometry,topology:o.topology,
    modelSha256:r.provenance?.modelSha256,programSha256:r.provenance?.programSha256,
    timing:{t0SessionSeconds:t0,pulseStartSpacingSessionSeconds:moves[1].sessionStartSeconds-t0,
      pulseStartSpacingNativeSeconds:moves[1].nativeStartSeconds-moves[0].nativeStartSeconds,
      firstCompletionBeforeSecondStartSeconds:moves[1].nativeStartSeconds-moves[0].nativeDoneSeconds,
      returnStartPeriodsFromFirst:(moves[2].sessionStartSeconds-t0)/T,
      observedDurationSeconds:rows.at(-1).t/1000,finishedAtSeconds:finite(finished)?finished:null,
      programFinalHoldSeconds:finite(finished)?finished-moves[2].nativeDoneSeconds:null,
      observedFinalHoldSeconds:rows.at(-1).nativeTime-moves[2].nativeDoneSeconds,
      observedAfterSeconds:post.length?post.at(-1).t/1000-finished:0,
      coldSeconds:maximum(rows.filter(x=>x.phase==='cold').map(x=>x.t/1000))},
    pulses,returnMove,primary:{...primary,hold:primaryHold},secondary:{...secondary,hold:secondaryHold},
    controlRingdown:ringdown(rows,...primaryBounds),velocityConsistency:vc,
    travel:{startPositionMm:startPosition,firstEndpointMm:pulses[0].endCarriageMm-startPosition,
      finalOutwardEndpointMm:pulses[1].endCarriageMm-startPosition,
      finalReturnErrorMm:Math.abs(rows.at(-1).carriageTravelMm-startPosition),
      wholeRangeMm:span(rows.map(x=>x.carriageTravelMm)),finalHoldRangeMm:span(finalHoldRows.map(x=>x.carriageTravelMm))},
    motion:{preMoveAngleDegMax:maximum(pre.map(x=>Math.abs(x.angleGravityDeg))),
      preMoveAngularSpeedDegSMax:maximum(pre.map(x=>Math.abs(x.relativeAngularVelocityDegS))),
      transientBeforeSecondMoveDeg:maximum(transient.map(x=>Math.abs(x.angleGravityDeg))),
      outwardAndResidualAngleDegMax:maximum(outbound.map(x=>Math.abs(x.angleGravityDeg))),
      wholeRunAngleDegMax:maximum(rows.map(x=>Math.abs(x.angleGravityDeg))),
      markerComAngleDifferenceDegMax:maximum(rows.map(x=>Math.abs(x.markerComAngleDifferenceDeg)))},
    structure:{hingeGapMmMax:maximum(rows.map(x=>x.allHingeGapMm)),hingeAxisMismatchDegMax:maximum(rows.map(x=>x.allHingeAxisMismatchDeg)),
      guideLateralDriftMmMax:maximum(rows.map(x=>x.carriageLateralDriftMm)),guideRotationDegMax:maximum(rows.map(x=>x.carriageRotationDeg)),
      chassisTranslationFromSettledDatumMmMax:maximum(afterFirst.map(x=>1000*norm(sub(x.basePosition,settledBase)))),
      chassisTiltDegMax:maximum(rows.map(x=>x.chassisTiltDeg)),pendulumUnintendedContactFrames:rows.filter(x=>x.pendulumContacts.length).length,
      pendulumFloorClearanceMmMin:minimum(rows.map(x=>x.pendulumFloorClearanceMm)),
      pendulumClearanceToNonjointPartsMmMin:rows.every(x=>finite(x.pendulumClearanceMm))?minimum(rows.map(x=>x.pendulumClearanceMm)):null,
      closestPendulumPair:rows.filter(x=>finite(x.pendulumClearanceMm)).sort((a,b)=>a.pendulumClearanceMm-b.pendulumClearanceMm)[0]?.closestPendulumPair??null,
      guideBoreCoverageFractionMin:minimum(gEntries.map(x=>x.coverageFraction)),guideEndMarginMmMin:minimum(gEntries.map(x=>x.endMarginMm)),
      guideBoreLateralGapMmMax:maximum(gEntries.map(x=>x.lateralGapMm)),guideBoreAxisMismatchDegMax:maximum(gEntries.map(x=>x.axisMismatchDeg)),
      rackUsableToothMarginMmMin:minimum(rows.map(x=>x.rackUsableToothMarginMm)),
      nativeSliderEndMarginMmMin:minimum(rows.map(x=>x.nativeSliderEndMarginMm)),
      localHingeInterfaces:Object.fromEntries(localInterfaceNames.map(k=>[k,{minimumSignedGapMm:minimum(rows.map(x=>x.localHingeInterfaces[k])),maximumSignedGapMm:maximum(rows.map(x=>x.localHingeInterfaces[k]))}])),
      freeHingeMotorTorqueNmMaxAbs:maximum(passive.map(x=>Math.abs(x.motorTorqueNm)))},
    lifecycle:{completed:rows.at(-1).completed,failed:rows.at(-1).failed,everFailed:rows.some(x=>x.failed===1),
      finalMotorBusy:rows.at(-1).motorBusy,finalControllerMode:rows.at(-1).controllerMode,
      finalMotorAngleDeg:rows.at(-1).motorAngleDeg,compilerErrors:r.provenance?.compilerErrors,compilerWarnings:r.provenance?.compilerWarnings,
      vmErrors:r.vmErrors,sessionFailures:r.track.filter(f=>f.extra?.sessionFailed).map(f=>f.extra.sessionFailed),missingOpcodes:r.setup?.missingOpcodes,
      explicitHubIdentity:r.setup?.explicitHubIdentity,withSpike:r.provenance?.withSpike,spikeConnected:r.spikeConnected,
      worldPaused:r.worldPaused,driveModes:[...new Set(rows.map(x=>x.drive?.mode))]},rows};
}

export function judgeSwayShiftRun(r,options={}){
  const c=contractOf(options.contract),m=measureSwayShift(r,{...options,contract:c}),g=c.gates,gates=[];
  const checks=[
    ['no_import_issues',m.topology.issues?.length,0],['no_unsupported',m.topology.unsupported?.length,0],
    ['one_motor',m.topology.actuatorCount,1,'==='],['no_static_imported_bodies',m.topology.importedStaticBodies.length,0],
    ['pendulum_mass_unchanged',m.geometry.nativePendulum.massAdjusted,false,'==='],['pendulum_inertia_unchanged',m.geometry.nativePendulum.inertiaAdjusted,false,'==='],
    ['no_pendulum_coupling_drive',m.topology.pendulumRelatedCouplings.length,0],
    ['no_compiler_errors',m.lifecycle.compilerErrors?.length,0],['no_VM_errors',m.lifecycle.vmErrors?.length,0],
    ['no_session_failures',m.lifecycle.sessionFailures.length,0],['all_opcodes_supported',m.lifecycle.missingOpcodes?.length,0],
    ['actual_shared_virtual_hub',m.lifecycle.explicitHubIdentity,true,'==='],['real_SPIKE_transport',m.lifecycle.withSpike,true,'==='],
    ['SPIKE_connected',m.lifecycle.spikeConnected,true,'==='],['world_remains_running',m.lifecycle.worldPaused,false,'==='],
    ['completed',m.lifecycle.completed,1,'==='],['failed',m.lifecycle.failed,0,'==='],['ever_failed',m.lifecycle.everFailed,false,'==='],
    ['final_motor_not_busy',m.lifecycle.finalMotorBusy,false,'==='],['final_controller_holds',m.lifecycle.finalControllerMode,'hold','==='],
    ['final_encoder_return_deg',Math.abs(m.lifecycle.finalMotorAngleDeg),g.finalMotorEncoderErrorDegMax],
    ['total_travel_error_mm',Math.abs(m.travel.finalOutwardEndpointMm-c.geometry.totalTravelMm),g.totalTravelErrorMmMaxAbs],
    ['carriage_return_error_mm',m.travel.finalReturnErrorMm,g.finalCarriageReturnErrorMmMax],
    ['final_hold_carriage_range_mm',m.travel.finalHoldRangeMm,g.finalHoldCarriageRangeMmMax],
    ['first_move_completed_before_second_s',m.timing.firstCompletionBeforeSecondStartSeconds,g.firstCompletionBeforeSecondStartSecondsMin,'>='],
    ['return_after_measurements_periods',m.timing.returnStartPeriodsFromFirst,c.program.returnNotBeforePeriodsFromFirstStart,'>='],
    ['program_final_hold_periods',m.timing.programFinalHoldSeconds/m.periodSeconds,c.program.finalHoldPeriodsMin,'>='],
    ['observed_budget_s',m.timing.observedDurationSeconds,c.program.qualificationObservedBudgetSeconds],
    ['normal_completion_before_watchdog_s',m.timing.finishedAtSeconds-m.timing.coldSeconds,c.program.actualWatchdogBudgetSeconds??c.program.watchdogBudgetSecondsMax],
    ['cold_observation_s',m.timing.coldSeconds,c.program.coldObservationSecondsMin-1e-8,'>='],
    ['after_observation_s',m.timing.observedAfterSeconds,c.program.afterObservationSecondsMin-1e-8,'>='],
    ['pre_move_rest_angle_deg',m.motion.preMoveAngleDegMax,g.preMoveRestAngleDegMaxAbs],
    ['pre_move_rest_angular_speed_deg_s',m.motion.preMoveAngularSpeedDegSMax,g.preMoveRestAngularSpeedDegSMax],
    ['useful_passive_transient_deg',m.motion.transientBeforeSecondMoveDeg,g.transientSwingBeforeSecondMoveDegMin,'>='],
    ['outward_small_angle_deg',m.motion.outwardAndResidualAngleDegMax,g.outwardAndResidualAngleDegMaxAbs],
    ['whole_run_angle_deg',m.motion.wholeRunAngleDegMax,g.wholeRunAngleDegMaxAbs],
    ['marker_COM_angle_agreement_deg',m.motion.markerComAngleDifferenceDegMax,.01],
    ['hinge_gap_mm',m.structure.hingeGapMmMax,g.hingeGapMmMax],['hinge_axis_mismatch_deg',m.structure.hingeAxisMismatchDegMax,g.hingeAxisMismatchDegMax],
    ['guide_lateral_drift_mm',m.structure.guideLateralDriftMmMax,g.guideLateralDriftMmMax],['guide_rotation_deg',m.structure.guideRotationDegMax,g.guideRotationDegMax],
    ['guide_bore_lateral_gap_mm',m.structure.guideBoreLateralGapMmMax,g.guideLateralDriftMmMax],['guide_bore_axis_mismatch_deg',m.structure.guideBoreAxisMismatchDegMax,g.guideRotationDegMax],
    ['chassis_translation_mm',m.structure.chassisTranslationFromSettledDatumMmMax,g.chassisTranslationFromSettledDatumMmMax],
    ['chassis_tilt_deg',m.structure.chassisTiltDegMax,g.chassisTiltDegMax],['no_pendulum_contact_frames',m.structure.pendulumUnintendedContactFrames,0],
    ['pendulum_floor_clearance_mm',m.structure.pendulumFloorClearanceMmMin,g.pendulumFloorClearanceMmMin,'>='],
    ['pendulum_nonjoint_clearance_mm',m.structure.pendulumClearanceToNonjointPartsMmMin,g.pendulumClearanceToNonjointPartsMmMin,'>='],
    ['full_guide_bore_coverage',m.structure.guideBoreCoverageFractionMin,g.guideBoreCoverageFractionMin,'>='],
    ['guide_end_margin_mm',m.structure.guideEndMarginMmMin,g.guideEndMarginMmMin,'>='],
    ['carriage_end_stop_margin_mm',m.structure.nativeSliderEndMarginMmMin,g.guideEndMarginMmMin,'>='],
    ['rack_tooth_margin_mm',m.structure.rackUsableToothMarginMmMin,g.rackUsableToothMarginMmMin,'>='],
    ['free_hinge_motor_torque_nm',m.structure.freeHingeMotorTorqueNmMaxAbs,g.freeHingeMotorTorqueNmMaxAbs],
    ['velocity_sample_count',m.velocityConsistency.sampleCount,g.velocityConsistencySamplesMin,'>='],
    ['pendulum_velocity_rms_m_s',m.velocityConsistency.pendulumRmsMps,g.linearVelocityConsistencyRmsMpsMax],
    ['pendulum_velocity_max_m_s',m.velocityConsistency.pendulumMaxMps,g.linearVelocityConsistencyMaxMpsMax],
    ['carriage_velocity_rms_m_s',m.velocityConsistency.carriageRmsMps,g.linearVelocityConsistencyRmsMpsMax],
    ['carriage_velocity_max_m_s',m.velocityConsistency.carriageMaxMps,g.linearVelocityConsistencyMaxMpsMax],
    ['relative_angular_velocity_rms_deg_s',m.velocityConsistency.angularRmsDegS,g.angularVelocityConsistencyRmsDegSMax],
    ['relative_angular_velocity_max_deg_s',m.velocityConsistency.angularMaxDegS,g.angularVelocityConsistencyMaxDegSMax]
  ];
  for(const x of checks)gate(gates,...x);
  const expectedGap=m.mode==='tuned'?c.calibration.shapedStartGapSeconds:c.calibration.inPhaseStartGapSeconds;
  gate(gates,'pulse_start_gap_session_error_s',Math.abs(m.timing.pulseStartSpacingSessionSeconds-expectedGap),g.pulseStartGapErrorSecondsMax);
  gate(gates,'pulse_start_gap_native_error_s',Math.abs(m.timing.pulseStartSpacingNativeSeconds-expectedGap),g.pulseStartGapErrorSecondsMax);
  for(const p of m.pulses){
    const id='pulse_'+(p.index+1);
    gate(gates,id+'_completed_API',p.apiResult,'completed','===');gate(gates,id+'_completed_native',p.nativeResult,'completed','===');
    gate(gates,id+'_not_busy_at_start',p.busyBefore,false,'===');
    gate(gates,id+'_duration_periods',p.durationSeconds/m.periodSeconds,g.pulseDurationPeriodsMax);
    gate(gates,id+'_travel_error_mm',Math.abs(p.travelMm-c.geometry.halfTravelMm),g.halfTravelErrorMmMaxAbs);
    gate(gates,id+'_fresh_encoder_argument_error_deg',Math.abs(Number(p.apiArguments[1])-(p.absoluteWaypointDeg-p.freshEncoderDeg)),1e-8);
    gate(gates,id+'_reported_command_argument_error_deg',Math.abs(Number(p.apiArguments[1])-p.relativeCommandDeg),1e-8);
    gate(gates,id+'_absolute_waypoint_error_deg',Math.abs(Math.abs(p.absoluteWaypointDeg)-c.program.absoluteMotorTargetsDegMagnitude[p.index]),1e-6);
    gate(gates,id+'_speed_dps',Number(p.apiArguments[2]),c.program.outwardSpeedDps??900,'===');
    gate(gates,id+'_arrival_hold',p.controllerAfter,'hold','===');
  }
  gate(gates,'return_completed_API',m.returnMove.apiResult,'completed','===');gate(gates,'return_completed_native',m.returnMove.nativeResult,'completed','===');
  for(const key of ['primary','secondary']){
    const w=m[key];
    gate(gates,key+'_samples_per_period',w.observedSamples/g.residualWindowPeriods,g.residualWindowSamplesPerPeriodMin,'>=');
    gate(gates,key+'_actual_carriage_hold_range_mm',w.hold.carriageRangeMm,g.residualHoldCarriageRangeMmMax);
    gate(gates,key+'_actual_carriage_hold_speed_mm_s',w.hold.carriageMaximumSpeedMmS,g.residualHoldCarriageSpeedMmSMax);
    gate(gates,key+'_native_hold_fraction',w.hold.actualHoldFraction,1,'===');
    gate(gates,key+'_native_PWM_fraction',w.hold.drivePwmFraction,1,'===');
    if(m.mode==='in-phase'){
      gate(gates,key+'_control_useful_RMS_deg',w.rmsDeg,g.controlResidualRmsDegMin,'>=');
      gate(gates,key+'_control_useful_peak_deg',w.peakDeg,g.controlResidualPeakDegMin,'>=');
    }else{
      gate(gates,key+'_shaped_RMS_deg',w.rmsDeg,g.shapedResidualRmsDegMax);
      gate(gates,key+'_shaped_peak_deg',w.peakDeg,g.shapedResidualPeakDegMax);
    }
  }
  if(m.mode==='in-phase'){
    gate(gates,'observed_control_period_intervals',m.controlRingdown.periodsSeconds.length,g.controlObservedPeriodIntervalsMin,'>=');
    gate(gates,'observed_control_period_relative_error',Math.abs(m.controlRingdown.periodSeconds/m.periodSeconds-1),g.controlObservedPeriodRelativeErrorMax);
    gate(gates,'free_ringdown_peak_intervals',m.controlRingdown.sameSignPeakIntervals.length,g.ringdownSameSignPeakIntervalsMin,'>=');
    gate(gates,'free_half_period_decay_min',m.controlRingdown.halfPeriodAmplitudeMultiplier,g.ringdownHalfPeriodAmplitudeMultiplierMin,'>=');
    gate(gates,'free_half_period_decay_max',m.controlRingdown.halfPeriodAmplitudeMultiplier,g.ringdownHalfPeriodAmplitudeMultiplierMax);
  }
  gate(gates,'frozen_model_identity',m.modelSha256,c.provenanceToBind.modelSha256,'===');
  gate(gates,'frozen_program_identity',m.programSha256,m.mode==='tuned'?c.provenanceToBind.programShapedSha256:c.provenanceToBind.programInPhaseSha256,'===');
  return {kind:'SwayShift-native-run',mode:m.mode,passed:gates.every(x=>x.passed),gates,measurements:m};
}

function pulseProfileDifference(a,b,index){
  const pa=a.pulses[index],pb=b.pulses[index],duration=Math.max(pa.durationSeconds,pb.durationSeconds),samples=[];
  for(let t=0;t<=duration+1e-9;t+=.005){
    const x=linearSample(a.rows,pa.nativeStartSeconds+t,'carriageTravelMm')-pa.startCarriageMm;
    const y=linearSample(b.rows,pb.nativeStartSeconds+t,'carriageTravelMm')-pb.startCarriageMm;
    samples.push({elapsedSeconds:t,shapedDisplacementMm:x,inPhaseDisplacementMm:y,differenceMm:x-y});
  }
  return {pulse:index+1,samples,rmsDifferenceMm:rms(samples.map(x=>x.differenceMm)),maxDifferenceMm:maximum(samples.map(x=>Math.abs(x.differenceMm))),
    durationDifferenceSeconds:Math.abs(pa.durationSeconds-pb.durationSeconds)};
}

export function judgeSwayShiftPair(shapedRecord,inPhaseRecord,{contract:input,negativeChallenges=true}={}){
  const c=contractOf(input),shaped=judgeSwayShiftRun(shapedRecord,{contract:c,mode:'tuned'}),control=judgeSwayShiftRun(inPhaseRecord,{contract:c,mode:'in-phase'});
  const a=shaped.measurements,b=control.measurements,g=c.gates,gates=[],comparisons={};
  gate(gates,'shaped_run_passes',shaped.passed,true,'===');gate(gates,'control_run_passes',control.passed,true,'===');
  gate(gates,'identical_model_bytes',a.modelSha256,b.modelSha256,'===');
  gate(gates,'same_final_travel_mm',Math.abs(a.travel.finalOutwardEndpointMm-b.travel.finalOutwardEndpointMm),g.pairFinalTravelDifferenceMmMaxAbs);
  for(const key of ['primary','secondary']){
    const rmsRatio=a[key].rmsDeg/b[key].rmsDeg,peakRatio=a[key].peakDeg/b[key].peakDeg;
    comparisons[key]={shapedRmsDeg:a[key].rmsDeg,controlRmsDeg:b[key].rmsDeg,rmsRatio,
      shapedPeakDeg:a[key].peakDeg,controlPeakDeg:b[key].peakDeg,peakRatio,
      shapedWindow:[a[key].startSeconds,a[key].endSeconds],controlWindow:[b[key].startSeconds,b[key].endSeconds]};
    gate(gates,key+'_RMS_reduction_ratio',rmsRatio,g.shapedResidualRmsRatioMax);
    gate(gates,key+'_peak_reduction_ratio',peakRatio,g.shapedResidualPeakRatioMax);
  }
  gate(gates,'common_primary_start_clock_error_s',Math.abs(a.primary.startSeconds-b.primary.startSeconds),g.pulseStartGapErrorSecondsMax);
  gate(gates,'common_primary_duration_error_s',Math.abs(a.primary.durationSeconds-b.primary.durationSeconds),1e-8);
  gate(gates,'equal_arrival_relative_duration_error_s',Math.abs(a.secondary.durationSeconds-b.secondary.durationSeconds),1e-8);
  const profiles=[0,1].map(i=>pulseProfileDifference(a,b,i));
  for(const p of profiles){gate(gates,'pulse_'+p.pulse+'_profile_RMS_mm',p.rmsDifferenceMm,g.pairedPulsePositionProfileRmsDifferenceMmMax);gate(gates,'pulse_'+p.pulse+'_profile_max_mm',p.maxDifferenceMm,g.pairedPulsePositionProfileMaxDifferenceMmMax);}
  const challenges=negativeChallenges?frozenRecordingChallenges(inPhaseRecord,{contract:c}):null;
  if(challenges){gate(gates,'frozen_pendulum_rejected',challenges.pendulum.rejected,true,'===');gate(gates,'frozen_carriage_rejected',challenges.carriage.rejected,true,'===');}
  return {kind:'SwayShift-native-pair',passed:gates.every(x=>x.passed),gates,comparisons,pulseProfiles:profiles,
    naturalDecay:{controlHalfPeriodAmplitudeMultiplier:b.controlRingdown.halfPeriodAmplitudeMultiplier,
      extraShapedPassiveTimeSeconds:b.pulses[1].nativeDoneSeconds-a.pulses[1].nativeDoneSeconds,
      limitation:'The primary common clock leaves the earlier shaped arrival more decay time. The separate arrival-relative reduction and bounded free decay are also required.'},
    challenges,perRun:{shaped,control}};
}

export function frozenRecordingChallenges(r,{contract:input}={}){
  const c=contractOf(input),m=observeSwayShift(r,{contract:c}),ids=m.geometry.bodyIds;
  const frozen=(child,parent)=>{
    const copy=structuredClone(r),first=copy.track[0],a=first.bodies[parent],b=first.bodies[child];
    const relativePosition=rot(conj(a.rotation),sub(b.position,a.position)),relativeRotation=mul(conj(a.rotation),b.rotation);
    for(const f of copy.track){const p=f.bodies[parent];f.bodies[child]={position:add(p.position,rot(p.rotation,relativePosition)),rotation:mul(p.rotation,relativeRotation)};}
    return copy;
  };
  const p=measureSwayShift(frozen(ids.pendulum,ids.carriage),{contract:c,mode:'in-phase'});
  const t=measureSwayShift(frozen(ids.carriage,ids.base),{contract:c,mode:'in-phase'});
  const pendantRejected=p.motion.transientBeforeSecondMoveDeg<c.gates.transientSwingBeforeSecondMoveDegMin&&
    p.primary.rmsDeg<c.gates.controlResidualRmsDegMin&&p.secondary.rmsDeg<c.gates.controlResidualRmsDegMin;
  const carriageRejected=Math.abs(t.travel.finalOutwardEndpointMm-c.geometry.totalTravelMm)>c.gates.totalTravelErrorMmMaxAbs;
  return {description:'Only observed body poses are altered; original motor telemetry, flags and command events remain. These are observer challenges, not native runs.',
    pendulum:{rejected:pendantRejected,transientDeg:p.motion.transientBeforeSecondMoveDeg,primaryRmsDeg:p.primary.rmsDeg,secondaryRmsDeg:p.secondary.rmsDeg},
    carriage:{rejected:carriageRejected,actualObservedTransferMm:t.travel.finalOutwardEndpointMm}};
}
