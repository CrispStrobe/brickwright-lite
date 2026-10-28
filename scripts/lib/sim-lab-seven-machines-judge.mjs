// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {judgeAxisPlotter} from './sim-lab-axis-plotter-judge.mjs';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const mul=([x,y,z,w],[a,b,c,d])=>[w*a+x*d+y*c-z*b,w*b-x*c+y*d+z*a,w*c+x*b-y*a+z*d,w*d-x*a-y*b-z*c],conj=([x,y,z,w])=>[-x,-y,-z,w];
const rot=(q,v)=>mul(mul(q,[...v,0]),conj(q)).slice(0,3),carry=(p,b,v)=>add(p.position,rot(mul(p.rotation,conj(b.rotation)),sub(v,b.position)));
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x)),span=v=>Math.max(...v)-Math.min(...v),maxAbs=v=>Math.max(...v.map(Math.abs)),deg=180/Math.PI;
const unwrap=xs=>{let last=xs[0],total=last;return xs.map(x=>{total+=wrap(x-last);last=x;return total;});};
export function judgeSevenMachinesRun(id,r){
 const {mechanism:m,track,hubId}=r;assert.ok(r.issues.every(i=>id==='butterfly'&&i.code==='locked-hinges'),'no unexpected model issues');assert.deepEqual(r.unsupported,[]);assert.ok(track.length>150);
 const byId=id=>m.bodies.find(b=>b.id===id),body=id=>{const b=m.bodies.find(b=>b.parts.includes(id));assert.ok(b,id);return b;},base=byId(hubId);
 const joint=(a,b)=>{const j=m.joints.find(j=>[j.body1,j.body2].includes(a.id)&&[j.body1,j.body2].includes(b.id));assert.ok(j);return j;};
 const point=(f,b,p)=>add(base.position,rot(conj(mul(f.bodies[base.id].rotation,conj(base.rotation))),sub(carry(f.bodies[b.id],b,p),f.bodies[base.id].position)));
 const spin=(b,axis,frame=base)=>{const zero=mul(conj(frame.rotation),b.rotation),a=rot(conj(frame.rotation),axis);return unwrap(track.map(f=>{const q=mul(mul(conj(f.bodies[frame.id].rotation),f.bodies[b.id].rotation),conj(zero));return 2*Math.atan2(dot(q.slice(0,3),a),q[3]);}));};
 const motors=Object.fromEntries(m.actuators.map(a=>[a.port,m.joints.find(j=>j.id===a.joint)]));
 let closure=0;
 for(const f of track){
  const root=f.bodies[base.id],q=mul(root.rotation,conj(base.rotation));assert.ok(rot(q,[0,1,0])[1]>.99,'upright base');
  for(const b of Object.values(f.bodies)){assert.ok([...b.position,...b.rotation].every(Number.isFinite));assert.ok(Math.hypot(...sub(b.position,root.position))<.8,'bounded assembly');}
  for(const j of m.joints.filter(j=>j.type==='hinge')){const a=byId(j.body1),b=byId(j.body2);if(!f.bodies[a.id]||!f.bodies[b.id])continue;closure=Math.max(closure,Math.hypot(...sub(carry(f.bodies[a.id],a,j.point),carry(f.bodies[b.id],b,j.point))));}
 }
 assert.ok(closure<.00055,'physical hinge loop closure');assert.ok(Object.values(track.at(-1).busy).every(x=>!x),'all motor commands finish');
 for(const j of Object.values(motors))assert.ok(maxAbs(spin(byId(j.body2),j.axis,byId(j.body1)).map((a,i)=>wrap(a-track[i].joints[j.id].angle)))<.025,'physical motor pose agrees with encoder');
 const result={closureMm:closure*1000};
 if(id==='axis-plotter')return {...result,...judgeAxisPlotter(r)};
 if(id==='mean-machine'){
  const a=spin(byId(motors.A.body2),[1,0,0]),b=spin(byId(motors.B.body2),[1,0,0]),out=spin(body('mean_pointer'),[1,0,0]),carrier=spin(body('differential_housing'),[1,0,0]);
  const error=maxAbs(out.map((c,i)=>c-(a[i]+b[i])/2));assert.ok(error<.012,'physical pointer computes the signed mean');assert.ok(maxAbs(carrier.map((c,i)=>c-out[i]))<.008,'physical pointer follows carrier');
  for(const [aa,bb,cc]of [[60,60,60],[90,-90,0],[120,-30,45],[-60,-60,-60]])assert.ok(track.some((f,i)=>!f.busy.A&&!f.busy.B&&Math.abs(a[i]*deg-aa)<.8&&Math.abs(b[i]*deg-bb)<.8&&Math.abs(out[i]*deg-cc)<.8),'each physical arithmetic case');
  assert.ok(Math.abs(out.at(-1))<.01,'pointer returns home');return {...result,meanErrorDegrees:error*deg};
 }
 if(id==='tilt-lab'){
  const outer=byId(motors.A.body2),tray=byId(motors.B.body2),ball=body('maze_ball');
  assert.equal(motors.B.body1,outer.id,'inner motor rides on outer gimbal');assert.equal(ball.role,'load');assert.notEqual(ball.id,tray.id);
  const a=spin(outer,motors.A.axis),b=spin(tray,motors.B.axis,outer);
  for(const [angle,minimum]of [[a,5],[b,9]]){assert.ok(Math.max(...angle)*deg>minimum&&Math.min(...angle)*deg< -minimum,'both signed physical tilts');assert.ok(maxAbs(angle)*deg<12,'bounded physical tilts');assert.ok(Math.abs(angle.at(-1))<.008,'gimbal returns level');}
  const center=[motors.A.point[0],motors.A.point[1],motors.B.point[2]],initial=ball.position;
  const local=track.map(f=>{const pose=f.bodies[tray.id],q=mul(pose.rotation,conj(tray.rotation)),v=add(tray.position,rot(conj(q),sub(f.bodies[ball.id].position,pose.position)));return sub(v,center);});
  const x=local.map(v=>dot(v,motors.A.axis)),z=local.map(v=>dot(v,motors.B.axis)),height=local.map(v=>v[1]);
  assert.ok(x.every(v=>Math.abs(v)<.0185)&&z.every(v=>Math.abs(v)<.043),'free ball stays within tray walls');
  assert.ok(height.every(v=>v>.0185&&v<.023),'free ball stays on tiled floor');
  const travel=Math.hypot(span(x),span(z));assert.ok(travel>.025,'free ball moves independently under gravity');
  const orientationError=maxAbs(track.map((f,i)=>{const qa=[...motors.A.axis.map(v=>v*Math.sin(a[i]/2)),Math.cos(a[i]/2)],qb=[...motors.B.axis.map(v=>v*Math.sin(b[i]/2)),Math.cos(b[i]/2)],predicted=mul(mul(f.bodies[base.id].rotation,qa),qb);return 2*Math.acos(Math.min(1,Math.abs(dot(predicted,f.bodies[tray.id].rotation))));}));
  assert.ok(orientationError<.012,'actual nested gimbal rotation product');return {...result,ballExcursionMm:travel*1000,tiltDegrees:{A:[Math.min(...a)*deg,Math.max(...a)*deg],B:[Math.min(...b)*deg,Math.max(...b)*deg]},orientationErrorDegrees:orientationError*deg};
 }
 if(id==='stepworks'){
  const carrier=body('carrier_front'),pallet=body('pallet_rung_front');assert.equal(pallet.role,'load');
  const orbit=track.map(f=>sub(point(f,carrier,carrier.position),carrier.position)),cargo=track.map(f=>sub(point(f,pallet,pallet.position),pallet.position));
  assert.ok(Math.abs(span(orbit.map(v=>v[1]))-.016)<.0004&&Math.abs(span(orbit.map(v=>v[2]))-.016)<.0004,'physical 16 mm rail orbit');
  const advance=cargo.at(-1)[2];assert.ok(advance>.044&&advance<.050,'physical three-cycle pallet advance');assert.ok(span(cargo.map(v=>v[1]))>.0075,'free pallet actually lifts');assert.ok(Math.abs(cargo.at(-1)[1])<.0006,'pallet settles onto fixed rails');
  assert.ok(Math.abs(track.at(-1).joints[motors.A.id].angle+6*Math.PI)<.04,'three complete forward transfers');return {...result,palletAdvanceMm:advance*1000,palletLiftMm:span(cargo.map(v=>v[1]))*1000};
 }
 if(id==='butterfly'){
  const wingL=body('wing_left_spine'),wingR=body('wing_right_spine'),l=spin(wingL,[1,0,0]),rr=spin(wingR,[1,0,0]),slider=m.joints.filter(j=>j.type==='slider');assert.equal(slider.length,1);
  const s=track.map(f=>f.joints[slider[0].id].position),sweep=span(l)*deg;
  // At the 8 mm drive arm, the 0.55 mm loop-closure bound permits about
  // four degrees of transient angular error. This is a demonstrator, not
  // an angular metrology fixture; settled return and mirrored motion are checked separately.
  assert.ok(Math.abs(span(s)-.016)<.0005,'physical 16 mm crosshead stroke');assert.ok(Math.abs(sweep-53.130102)<4,'physical full wing sweep');assert.ok(maxAbs(l.map((v,i)=>v+rr[i]))<.07,'wings rise together');assert.ok(Math.abs(l.at(-1))<.012&&Math.abs(rr.at(-1))<.012,'both physical wings return home');
  assert.ok(Math.abs(track.at(-1).joints[motors.A.id].angle-2*Math.PI)<.04,'one complete flap');return {...result,wingSweepDegrees:sweep,crossheadStrokeMm:span(s)*1000};
 }
 const crank=byId(motors.A.body2),origin=motors.A.point;
 if(id==='stride-lab'||id==='tempo-loop'){
  const coupler=body('coupler'),output=body(id==='stride-lab'?'rocker':'outputCrank'),bJoint=joint(crank,coupler),cJoint=joint(coupler,output),dJoint=joint(base,output),d=id==='stride-lab'?.032:.016;
  const ex=[0,0,1],ey=[0,1,0],xy=(f,b,p)=>{const v=sub(point(f,b,p),origin);return [dot(v,ex),dot(v,ey)];};
  let error=0;const xs=[],ys=[],working=[],alpha=[],beta=[];
  const initialP=sub(scale(cJoint.point,2),bJoint.point);
  for(const f of track){
   const B=xy(f,crank,bJoint.point),C=xy(f,coupler,cJoint.point),q=Math.hypot(d-B[0],B[1]),u=[(d-B[0])/q,-B[1]/q],h=Math.sqrt(Math.max(0,.04**2-q*q/4));
   // Same signed assembly branch as the supplied geometry: upper at reset.
   const expected=id==='stride-lab'?[B[0]+q*u[0]/2-h*u[1],B[1]+q*u[1]/2+h*u[0]]:
    [d-q*u[0]/2+h*u[1],-q*u[1]/2-h*u[0]];
   error=Math.max(error,Math.hypot(...sub(C,expected)));alpha.push(Math.atan2(B[1],B[0]));beta.push(Math.atan2(C[1],C[0]-d));
   if(id==='stride-lab'){
    const P=xy(f,coupler,initialP);xs.push(P[0]);ys.push(P[1]);if(B[0]<-.0003)working.push(P);
   }
  }
  assert.ok(error<.00065,'physical coupler follows closed-loop geometry');
  if(id==='stride-lab'){
   assert.ok(working.length>60);const deviation=maxAbs(working.map(v=>v[1]-.064)),stroke=span(working.map(v=>v[0]));assert.ok(deviation<.00065,'physical near-straight working stroke');assert.ok(stroke>.062&&stroke<.066,'physical 64 mm working stroke');
   assert.ok(span(ys)>.013,'curved return differs from working stroke');assert.ok(Math.abs(track.at(-1).joints[motors.A.id].angle)<.015,'physical return home');return {...result,pathErrorMm:error*1000,workingDeviationMm:deviation*1000,workingStrokeMm:stroke*1000};
  }
  const aa=unwrap(alpha),bb=unwrap(beta),ratio=[];
  for(let i=2;i<aa.length;i++){const da=aa[i]-aa[i-2],db=bb[i]-bb[i-2];if(Math.abs(da)>.025)ratio.push(db/da);}
  assert.ok(span(aa)>12.5&&span(bb)>12.5,'both physical cranks make two full turns');assert.ok(Math.min(...ratio)>.50&&Math.min(...ratio)<.63&&Math.max(...ratio)>1.9&&Math.max(...ratio)<2.15,'physical variable angular-speed ratio');assert.ok(Math.abs(aa.at(-1)-aa[0])<.015&&Math.abs(bb.at(-1)-bb[0])<.02,'both physical cranks return home');return {...result,pathErrorMm:error*1000,speedRatioRange:[Math.min(...ratio),Math.max(...ratio)]};
 }
 assert.equal(id,'twinpoint');
 const right=byId(motors.B.body2),leftLink=body('linkBP'),rightLink=body('linkCP'),bj=joint(crank,leftLink),cj=joint(right,rightLink),pj=joint(leftLink,rightLink),originMid=scale(add(motors.A.point,motors.B.point),.5);
 const xy=(f,b,p)=>{const v=sub(point(f,b,p),originMid);return [v[2],v[1]];};let error=0;const circle=[],line=[];
 for(const f of track){
  const B=xy(f,crank,bj.point),C=xy(f,right,cj.point),P=xy(f,leftLink,pj.point),v=sub(C,B),q=Math.hypot(...v),u=scale(v,1/q),h=Math.sqrt(Math.max(0,.064**2-q*q/4)),expected=add(scale(add(B,C),.5),[-u[1]*h,u[0]*h]);
  error=Math.max(error,Math.hypot(...sub(P,expected)));const a=Math.atan2(B[1],B[0]+.04),b=Math.atan2(C[1],C[0]-.04);
  if(Math.abs(wrap(a-b))<.03)circle.push(P);
  if(a>1.29&&a<2.12&&Math.abs(wrap(a+b-Math.PI))<.03)line.push(P);
 }
 assert.ok(error<.0008,'physical tip follows upper five-bar intersection');assert.ok(circle.length>60&&line.length>60,'both coordinated paths actually execute');
 assert.ok(span(circle.map(p=>p[0]))>.062 && span(circle.map(p=>p[1]))>.062,'physical complete circle');
 const circleError=maxAbs(circle.map(P=>Math.hypot(P[0],P[1]-Math.sqrt(.064**2-.04**2))-.032)),straightness=maxAbs(line.map(P=>P[0])),stroke=span(line.map(P=>P[1]));
 assert.ok(circleError<.001,'physical 32 mm circle');assert.ok(straightness<.001,'physical vertical line');assert.ok(Math.abs(stroke-.027800551)<.0012,'physical line stroke');return {...result,tipErrorMm:error*1000,circleErrorMm:circleError*1000,lineErrorMm:straightness*1000,lineStrokeMm:stroke*1000};
}
