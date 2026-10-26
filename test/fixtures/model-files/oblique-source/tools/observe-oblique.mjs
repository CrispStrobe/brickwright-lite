// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Physical observations only: source part-local points are carried by actual
// native body poses. Analytic ellipses are comparisons, never imposed motion.
import {nativeObservation,add,sub,scale,dot,norm,qmul,qconj,qrot,degrees,clamp,variables} from './native-observation.mjs';
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const unwrap=angles=>{let last=angles[0],value=last;return angles.map(a=>{value+=wrap(a-last);last=a;return value;});};
export const span=xs=>Math.max(...xs)-Math.min(...xs);
export const directions=xs=>{let forwardDegrees=0,reverseDegrees=0;for(let i=1;i<xs.length;i++){const d=degrees(xs[i]-xs[i-1]);forwardDegrees+=Math.max(0,d);reverseDegrees+=Math.max(0,-d);}return {forwardDegrees,reverseDegrees};};
export const tiltDifferenceDeg=(a,b)=>Math.abs(degrees(Math.atan2(Math.sin(2*(a-b)),Math.cos(2*(a-b)))/2));

export function ellipseGeometry(lengthMm,u,guideAngleRad){
  const h11=(1-u)*lengthMm,h12=lengthMm/Math.tan(guideAngleRad),h22=u*lengthMm;
  const a=h11*h11+h12*h12,b=h12*h22,c=h22*h22,d=Math.hypot(a-c,2*b);
  const major=Math.sqrt(Math.max(0,(a+c+d)/2)),minor=Math.sqrt(Math.max(0,(a+c-d)/2));
  return {matrix:[[h11,h12],[0,h22]],semiaxesMm:[major,minor],fullAxesMm:[2*major,2*minor],majorAxisRadians:Math.atan2(2*b,a-c)/2,circular:d<1e-9};
}

function solve(matrix,vector){
  const a=matrix.map((r,i)=>[...r,vector[i]]),n=vector.length;
  for(let i=0;i<n;i++){
    let k=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;
    [a[i],a[k]]=[a[k],a[i]];const q=a[i][i];if(Math.abs(q)<1e-12)throw new Error('Ellipse fit is rank deficient');
    for(let j=i;j<=n;j++)a[i][j]/=q;
    for(let k=0;k<n;k++)if(k!==i){const q=a[k][i];for(let j=i;j<=n;j++)a[k][j]-=q*a[i][j];}
  }
  return a.map(r=>r[n]);
}

// Fit observed points, including a free centre, without using encoder phase or
// a target ellipse. Scale only for conditioning, then solve the measured conic.
export function fitMeasuredEllipse(points,scaleMm){
  const normal=Array.from({length:5},()=>Array(5).fill(0)),rhs=Array(5).fill(0);
  for(const point of points){const [x,y]=point.map(v=>v/scaleMm),r=[x*x,x*y,y*y,x,y];for(let i=0;i<5;i++){rhs[i]+=r[i];for(let j=0;j<5;j++)normal[i][j]+=r[i]*r[j];}}
  const [a,b2,c,d,e]=solve(normal,rhs),b=b2/2,det=a*c-b*b;
  if(!(det>0&&a>0&&c>0))throw new Error('Observed conic is not an ellipse');
  const centre=[-(c*d-b*e)/(2*det),-(-b*d+a*e)/(2*det)];
  const k=1+a*centre[0]**2+2*b*centre[0]*centre[1]+c*centre[1]**2,delta=Math.hypot(a-c,2*b);
  const lo=(a+c-delta)/2,hi=(a+c+delta)/2;
  const fullAxesMm=[2*scaleMm*Math.sqrt(k/lo),2*scaleMm*Math.sqrt(k/hi)];
  // Q's smaller eigenvalue points along the ellipse's major axis.
  const majorAxisRadians=Math.atan2(-2*b,c-a)/2;
  return {centreMm:centre.map(v=>v*scaleMm),fullAxesMm,majorAxisRadians,majorAxisDegrees:degrees(majorAxisRadians),conic:[a,b2,c,d,e],samples:points.length};
}

export function observeOblique(record,contract){
  const g=contract.geometry,o=nativeObservation(record,g.basePart),m=record.mechanism;
  const [X,Y]=g.planeAxesLdu,N=g.planeNormalLdu,origin=g.originLdu;
  const project=p=>{const d=sub(p,origin);return [dot(d,X)*.4,dot(d,Y)*.4,dot(d,N)*.4];};
  const marks=g.markers,names=['barA','barB','carriageA','carriageB','guideOrigin','guideDirection','driveBOrigin','driveBDirection'];
  for(const name of names)if(!marks[name])throw new Error('Missing actual physical marker '+name);
  const owners=Object.fromEntries(names.map(n=>[n,o.bodyOf(marks[n].part).id]));
  const outputs=g.outputs.map(q=>({...q,body:o.bodyOf(q.point.part).id,saved:project(o.sourcePoint(q.point))}));
  const saved=Object.fromEntries(names.map(n=>[n,project(o.sourcePoint(marks[n]))]));
  const bodyIds={base:o.base.id,carriageA:owners.carriageA,bar:owners.barA,guideB:owners.guideOrigin,carriageB:owners.carriageB,inputB:owners.driveBOrigin};
  const hinges=m.joints.filter(j=>j.type==='hinge'),sliders=m.joints.filter(j=>j.type==='slider');
  const angleBetween=(a,b)=>degrees(Math.acos(clamp(dot(a,b)/(norm(a)*norm(b)))));
  const first=record.track[0],base0=o.pose(first,o.base),baseRest=o.base;
  const relativeRoll=(f,childId,parentId)=>{
    const child=o.bodyById.get(childId),parent=o.bodyById.get(parentId);
    const rest=qmul(qconj(parent.rotation),child.rotation),actual=qmul(qconj(o.pose(f,parent).rotation),o.pose(f,child).rotation);
    return 2*degrees(Math.acos(clamp(Math.abs(qmul(actual,qconj(rest))[3]))));
  };
  const rows=record.track.map(f=>{
    const p=Object.fromEntries(names.map(n=>[n,project(o.point(f,marks[n]))]));
    const bar=sub(p.barA,p.barB),guide=sub(p.guideDirection,p.guideOrigin),input=sub(p.driveBDirection,p.driveBOrigin);
    const theta=Math.atan2(-bar[1],bar[0]),alpha=Math.atan2(guide[1],guide[0]),inputB=Math.atan2(input[1],input[0]);
    const L=g.barLengthMm,c=Math.cos(theta),s=Math.sin(theta),cot=1/Math.tan(alpha);
    const expectedA=[L*c+L*cot*s,0],expectedB=[L*cot*s,L*s];
    const xy=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const outputPoints=Object.fromEntries(outputs.map(q=>{
      const point=project(o.point(f,q.point)),h=ellipseGeometry(L,q.fractionFromA,alpha).matrix;
      const prediction=[h[0][0]*c+h[0][1]*s,h[1][1]*s];
      const os=point[1]/h[1][1],oc=(point[0]-h[0][1]*os)/h[0][0];
      return [q.id,{pointMm:point,predictedMm:prediction,predictionErrorMm:xy(point,prediction),ellipseRadialResidual:Math.abs(Math.hypot(oc,os)-1),phase:Math.atan2(os,oc),heightDriftMm:Math.abs(point[2]-q.saved[2])}];
    }));
    let hingeGapMm=0,hingeAxisGapDeg=0,sliderLineGapMm=0,sliderAngleGapDeg=0;
    const hingeDetails=[];
    for(const j of hinges){const [a,b]=[j.body1,j.body2].map(id=>o.bodyById.get(id)),gap=norm(sub(o.carry(f,a,j.point),o.carry(f,b,j.point)))*1000,axisGap=angleBetween(o.axis(f,a,j.axis),o.axis(f,b,j.axis));hingeGapMm=Math.max(hingeGapMm,gap);hingeAxisGapDeg=Math.max(hingeAxisGapDeg,axisGap);hingeDetails.push({id:j.id,gapMm:gap,axisGapDeg:axisGap});}
    for(const j of sliders){const [a,b]=[j.body1,j.body2].map(id=>o.bodyById.get(id)),delta=sub(o.carry(f,b,j.point),o.carry(f,a,j.point)),axis=o.axis(f,a,j.axis);sliderLineGapMm=Math.max(sliderLineGapMm,norm(sub(delta,scale(axis,dot(delta,axis))))*1000);sliderAngleGapDeg=Math.max(sliderAngleGapDeg,relativeRoll(f,j.body2,j.body1));}
    const base=o.pose(f,o.base),baseDelta=qmul(base.rotation,qconj(baseRest.rotation)),fields=variables(f);
    return {t:f.t,phase:f.phase,stage:Number(fields.stage),settled:Number(fields.settled),pointsMm:p,theta,alpha,inputB,encoderDeg:Object.fromEntries(['A','B'].map(port=>[port,f.encoder[port].angleDeg])),outputs:outputPoints,
      barLengthErrorMm:Math.abs(Math.hypot(bar[0],bar[1])-L),
      endpointPredictionErrorMm:Math.max(xy(p.barA,expectedA),xy(p.barB,expectedB)),
      carriagePredictionErrorMm:Math.max(xy(p.carriageA,expectedA),xy(p.carriageB,expectedB)),
      physicalEndpointGapMm:Math.max(norm(sub(p.barA,p.carriageA)),norm(sub(p.barB,p.carriageB))),
      guideDeviationMm:Math.max(Math.abs(p.carriageA[1]),Math.abs(p.carriageB[0]*Math.sin(alpha)-p.carriageB[1]*Math.cos(alpha)),Math.abs(p.carriageA[2]-saved.carriageA[2]),Math.abs(p.carriageB[2]-saved.carriageB[2])),
      guideOriginDriftMm:norm(sub(p.guideOrigin,saved.guideOrigin)),
      carriageRollDeg:Math.max(relativeRoll(f,bodyIds.carriageA,bodyIds.base),relativeRoll(f,bodyIds.carriageB,bodyIds.guideB)),
      carriagePositionsMm:{A:p.carriageA[0],B:p.carriageB[0]*Math.cos(alpha)+p.carriageB[1]*Math.sin(alpha)},
      hingeGapMm,hingeAxisGapDeg,hingeDetails,sliderLineGapMm,sliderAngleGapDeg,
      baseTravelMm:norm(sub(base.position,base0.position))*1000,baseTiltDeg:angleBetween(qrot(baseDelta,[0,1,0]),[0,1,0])};
  });
  const theta=unwrap(rows.map(r=>r.theta)),alpha=unwrap(rows.map(r=>r.alpha)),input=unwrap(rows.map(r=>r.inputB));
  const outputPhase=Object.fromEntries(outputs.map(q=>[q.id,unwrap(rows.map(r=>r.outputs[q.id].phase))]));
  for(let i=0;i<rows.length;i++){
    const r=rows[i];r.thetaUnwrapped=theta[i];r.alphaUnwrapped=alpha[i];r.inputBUnwrapped=input[i];
    r.encoderPhaseErrorDeg=Math.abs(degrees(theta[i])-g.savedBarPhaseDeg-g.encoderSignA*r.encoderDeg.A);
    r.inputBEncoderPhaseErrorDeg=Math.abs(degrees(input[i])-g.guideDrive.savedInputPhaseDeg-g.guideDrive.encoderSign*r.encoderDeg.B);
    r.gearLawErrorDeg=Math.abs((degrees(alpha[i])-g.savedGuideAngleDeg)-g.guideDrive.guideDegreesPerInputDegree*(degrees(input[i])-g.guideDrive.savedInputPhaseDeg));
    for(const q of outputs){r.outputs[q.id].phaseUnwrapped=outputPhase[q.id][i];r.outputs[q.id].phaseErrorDeg=Math.abs(degrees(wrap(r.outputs[q.id].phase-r.theta)));}
  }
  return {rows,owners,outputs,bodyIds,observation:o,jointIds:{hinges:hinges.map(j=>j.id),sliders:sliders.map(j=>j.id)}};
}
