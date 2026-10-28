// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reviewed geometric predictions judge observed bodies. Nothing here drives a pose.
import {observeAddon} from './sim-lab-addon-judge.mjs';
import {checkIntakeProgramOutcome} from './robot-lab-intake-checks.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const deg=x=>x*180/Math.PI,rad=x=>x*Math.PI/180,span=a=>Math.max(...a)-Math.min(...a),max=a=>Math.max(...a);
const unwrap=a=>{let prev=a[0],total=prev;return a.map(v=>{total+=Math.atan2(Math.sin(v-prev),Math.cos(v-prev));prev=v;return total;});};
export const NINE_INTAKES=Object.freeze({
 helixgate:{drive:{A:'worm_1start'},ranges:{A:[0,720]},minMs:26000,disconnect:['worm_1start']},
 looprelay:{drive:{A:'chain_input16'},ranges:{A:[0,180]},minMs:31000,disconnect:['chain_input16']},
 paritydial:{drive:{A:'gear_drive'},ranges:{A:[-90,90]},minMs:25000,disconnect:['gear_drive']},
 counterslide:{drive:{A:'drive_pinion_8t'},ranges:{A:[-100,0]},minMs:14500,disconnect:['drive_pinion_8t']},
 'toggle-press':{drive:{A:'crank'},ranges:{A:[-80,0]},minMs:12000,success:'done',disconnect:['upper_toggle_UK']},
 footfall:{drive:{A:'input_crank_OM'},ranges:{A:[0,360]},minMs:35000,success:'done',disconnect:['blue_transfer_f_DF']},
 phasekeeper:{drive:{A:'joint_1_input_yoke'},ranges:{A:[0,360]},minMs:28000,success:'done',disconnect:['joint_2_intermediate_yoke']},
 vectorsum:{drive:{A:'side_gear_A',B:'side_gear_B'},ranges:{A:[0,180],B:[-180,180]},minMs:30000,success:'done',disconnect:['satellite_1','satellite_2','satellite_3']},
 pointweaver:{drive:{A:'left_input_arm',B:'right_input_arm'},ranges:{A:[-31.5986,0],B:[-8.106818,23.491782]},minMs:9000,success:'done',disconnect:['left_forearm']}
});
export function removeIntakeParts(source,ids){
 const blocks=source.replace(/\r\n/g,'\n').split(/(?=^0 !BW ID )/m);
 for(const id of ids)if(blocks.filter(b=>b.startsWith('0 !BW ID '+id+'\n')).length!==1)throw Error('Expected one real removed part: '+id);
 return blocks.filter(b=>!ids.some(id=>b.startsWith('0 !BW ID '+id+'\n'))).join('');
}
export function circleIntersections(a,ra,b,rb){
 const v=sub(b,a),d=norm(v);if(d<1e-9||d>ra+rb+1e-7||d<Math.abs(ra-rb)-1e-7)throw Error('No geometric closure');
 const x=(ra*ra-rb*rb+d*d)/(2*d),h=Math.sqrt(Math.max(0,ra*ra-x*x)),c=a.map((v,i)=>v+x*(b[i]-v)/d),n=[-(b[1]-a[1])/d,(b[0]-a[0])/d];
 return [c.map((v,i)=>v+h*n[i]),c.map((v,i)=>v-h*n[i])];
}
const pick=(points,index,sign)=>points.reduce((a,b)=>sign*a[index]>sign*b[index]?a:b);
const mv=(m,v)=>[0,1,2].map(i=>dot(m.slice(i*3,i*3+3),v));
function planar(r,o,reference,localOrigin,originMm,axisXLocal,axisZLocal){
 const p=r.runModel.parts.find(p=>p.id===reference),physical=v=>[v[0],-v[1],-v[2]];
 const x=unit(physical(mv(p.rotation,axisXLocal))),z=unit(physical(mv(p.rotation,axisZLocal))),origin=o.initial(reference,localOrigin);
 return(f,id,local=[0,0,0])=>{const v=sub(o.point(f,id,local),origin);return[originMm[0]+1000*dot(v,x),originMm[1]+1000*dot(v,z)];};
}
function angles(o,frames,id,axis){
 const ref=unit(cross(axis,Math.abs(axis[0])<.8?[1,0,0]:[0,1,0]));
 return unwrap(frames.map(f=>o.angle(f,id,axis,ref))).map(deg);
}
function passiveJoint(r,o,id,type='hinge'){
 const body=o.body(id).id,j=r.mechanism.joints.find(j=>j.type===type&&!j.motor&&[j.body1,j.body2].includes(body)&&[j.body1,j.body2].includes(o.base.id));
 if(!j)throw Error('Missing independently supported passive '+type+': '+id);return j;
}
export function evaluateNineIntake(id,r,{requireObservations=true}={}){
 const c=NINE_INTAKES[id];if(!c)throw Error('No reviewed nine-intake contract: '+id);
 const errors=[],metrics={},add=(code,value,limit)=>{metrics[code]=value;if(!Number.isFinite(value)||value>limit)errors.push({code,value,limit});};
 const outcome=checkIntakeProgramOutcome(r,{successVariable:c.success});
 errors.push(...outcome.errors);
 if(!r.track?.some(f=>f.phase==='program')||errors.some(e=>['non-finite-or-invalid-pose','invalid-recording-time'].includes(e.code)))return{ok:false,errors,metrics};
 const o=observeAddon(r,r.mechanism.hubs[0].id),frames=r.track.filter(f=>f.phase==='program'||f.phase==='after'),after=r.track.filter(f=>f.phase==='after'),lastProgram=r.track.filter(f=>f.phase==='program').at(-1);
 const input={};for(const port of Object.keys(c.drive)){
  const j=r.mechanism.joints.find(j=>j.motor?.port===port);if(!j)throw Error('Missing input '+port);
  input[port]=frames.map(f=>deg(f.joints[j.id].angle));
  add('route-error-'+port,Math.max(Math.abs(Math.min(...input[port])-c.ranges[port][0]),Math.abs(Math.max(...input[port])-c.ranges[port][1]),Math.abs(input[port].at(-1))),3);
  if(after.length)add('hold-drift-'+port,max(after.map(f=>Math.abs(deg(f.joints[j.id].angle)-deg(lastProgram.joints[j.id].angle)))),.5);
 }
 if(r.finishedAt<c.minMs)errors.push({code:'premature-program-end',actual:r.finishedAt,minimum:c.minMs});
 if(r.mechanism.bodies.some(b=>b.motion==='static'&&b.id!=='ground'))errors.push({code:'artificial-world-anchor'});
 const settled=frames.find(f=>f.t>=frames[0].t+500)||frames[0],ref=settled.bodies[o.base.id];
 add('world-foundation-drift-mm',max(r.track.filter(f=>f.t>=settled.t).map(f=>1000*norm(sub(f.bodies[o.base.id].position,ref.position)))),1);
 add('world-foundation-tilt-deg',max(r.track.map(f=>o.tilt(f))),2);
 add('hinge-closure-mm',max(r.track.map(f=>o.gap(f))),.5);
 add('hinge-axis-error-deg',max(r.track.map(f=>o.axisGap(f))),2);
 if(requireObservations){
  const contactFrames=r.track.filter(f=>f.t>=settled.t);
  const missing=contactFrames.filter(f=>typeof f.extra?.groundContact!=='boolean').length;
  if(missing)errors.push({code:'missing-native-ground-observation',frames:missing});
  else add('ground-contact-missing-fraction',contactFrames.filter(f=>!f.extra.groundContact).length/contactFrames.length,.05);
  if(after.some(f=>!f.extra?.motorModes||Object.keys(c.drive).some(p=>f.extra.motorModes[p]!=='hold')))errors.push({code:'final-motors-not-held'});
 }
 const A=input.A,theta=A.map(rad),law=[];
 const compare=(name,actual,pred,limit)=>{const error=max(actual.map((v,i)=>Array.isArray(v)?norm(sub(v,pred[i])):Math.abs(v-pred[i])));metrics[name]=error;law.push({name,error,limit});if(!Number.isFinite(error)||error>limit)errors.push({code:'passive-law',name,value:error,limit});};
 if(id==='helixgate'||id==='looprelay'||id==='paritydial'){
  const parts=id==='helixgate'?[['gate_arm',1/24]]:id==='looprelay'?[['indicator_hand',-2/9]]:[['dial_left',-1/3],['dial_right',1/3]];
  for(const [part,ratio] of parts){const j=passiveJoint(r,o,part);compare(part+'-law-error-deg',angles(o,frames,part,j.axis),A.map(x=>x*ratio),.5);}
 }else if(id==='counterslide'){
  const vectors=['rack_low','rack_high'].map(part=>frames.map(f=>sub(o.point(f,part),o.initial(part))));
  for(const [k,part] of ['rack_low','rack_high'].entries()){
   const j=passiveJoint(r,o,part,'slider');compare(part+'-law-error-mm',vectors[k].map(v=>1000*dot(v,j.axis)),theta.map(x=>-4*x),.1);
  }
  compare('jaw-midpoint-drift-mm',vectors[0].map((v,i)=>v.map((x,k)=>500*(x+vectors[1][i][k]))),vectors[0].map(()=>[0,0,0]),.1);
 }else if(id==='pointweaver'){
  const xy=planar(r,o,'base_cross_-40',[0,0,0],[0,-16],[0,0,1],[-1,0,0]);
  const elbowsA=theta.map(t=>[-40+32*Math.cos(rad(11.221402893)-t),32*Math.sin(rad(11.221402893)-t)]);
  const elbowsB=input.B.map(x=>[40+32*Math.cos(rad(160.671778731-x)),32*Math.sin(rad(160.671778731-x))]);
  const pred=elbowsA.map((a,i)=>pick(circleIntersections(a,64,elbowsB[i],64),1,1));
  compare('left-crank-error-mm',frames.map(f=>xy(f,'left_input_arm',[0,0,40])),elbowsA,.25);
  compare('right-crank-error-mm',frames.map(f=>xy(f,'right_input_arm',[0,0,40])),elbowsB,.25);
  compare('endpoint-law-error-mm',frames.map(f=>xy(f,'endpoint_marker')),pred,.5);
  const corners=[[14,70],[14,78],[-14,78],[-14,70]];
  const cornerErrors=corners.map((p,i)=>{const f=frames.filter(f=>Number(f.extra?.variables?.phase)===i+1).at(-1);return f?norm(sub(xy(f,'endpoint_marker'),p)):Infinity;});
  add('corner-error-mm',max(cornerErrors),1);metrics.cornerErrorsMm=cornerErrors;
 }else if(id==='toggle-press'){
  const xy=planar(r,o,'pivot_bridge',[0,0,0],[16,48],[1,0,0],[0,0,1]);
  const pred=theta.map(t=>{const C=[-24*Math.sin(t),-24*Math.cos(t)],K=pick(circleIntersections([16,48],48,C,64),0,1);return[K[0]+Math.sqrt(Math.max(0,48*48-(K[1]-48)**2)),48];});
  compare('guided-ram-law-error-mm',frames.map(f=>xy(f,'slider_cross')),pred,.5);
  metrics.ramStrokeMm=span(frames.map(f=>xy(f,'slider_cross')[0]));if(metrics.ramStrokeMm<20)errors.push({code:'missing-passive-stroke',value:metrics.ramStrokeMm});
 }else if(id==='footfall'){
  const xy=planar(r,o,'frame_top_X_AP',[0,-20,140],[64,16],[0,0,1],[0,1,0]);
  const crank=theta.map(t=>[-24*Math.cos(t),24*Math.sin(t)]);
  compare('crank-phase-error-mm',frames.map(f=>xy(f,'input_crank_OM',[0,0,30])),crank,.25);
  const pred=crank.map(M=>{
   const P=[64,16],C=pick(circleIntersections(P,64,M,80),1,1),E=pick(circleIntersections(P,64,M,96),1,-1),D=pick(circleIntersections(P,64,C,96),0,1),F=pick(circleIntersections(D,64,E,64),1,-1);
   return pick(circleIntersections(F,112,E,80),1,-1);
  });
  // This serial leg amplifies closure error through two triangles; the
  // reviewed endpoint budget is 1 mm, with the separate 0.5 mm hinge bound retained.
  compare('foot-trajectory-error-mm',frames.map(f=>xy(f,'lower_triangle_h_FG',[0,0,140])),pred,1);
 }else if(id==='phasekeeper'){
  const motor=r.mechanism.joints.find(j=>j.motor?.port==='A'),couplings=r.mechanism.couplings.filter(c=>c.kind==='universalJoint');
  if(couplings.length!==2)errors.push({code:'missing-real-Cardan-cross',actual:couplings.length});
  compare('output-phase-error-deg',angles(o,frames,'output_pointer',motor.axis),A,2);
  if(couplings.length===2){
   // The declared straight stock axle's local X axis determines the measured
   // direction independently of compiler coupling order or inferred ratios.
   const axle=r.runModel.parts.find(p=>p.id==='intermediate_axle');
   let axis=unit(mv(axle.rotation,[1,0,0]).map((x,i)=>i?-x:x));if(dot(axis,motor.axis)<0)axis=axis.map(x=>-x);
   const predicted=unwrap(theta.map(t=>Math.atan2(Math.sin(t),.8*Math.cos(t)))).map(deg);
   compare('single-joint-ripple-error-deg',angles(o,frames,'intermediate_axle',axis),predicted,2);
   add('universal-pivot-closure-mm',max(frames.flatMap(f=>couplings.map(c=>1000*norm(sub(o.point(f,c.parts[0]),o.point(f,c.parts[1])))))),.5);
  }
 }else if(id==='vectorsum'){
  const motorB=r.mechanism.joints.find(j=>j.motor?.port==='B'),axis=motorB.axis,carrier=angles(o,frames,'diff_cover_28t',axis),pred=A.map((a,i)=>(input.B[i]-a)/2),out=passiveJoint(r,o,'output_pointer');
  compare('carrier-average-error-deg',carrier,pred,1);
  compare('geared-pointer-error-deg',angles(o,frames,'output_pointer',out.axis),pred.map(x=>-28*x/12),1);
 }
 return{ok:errors.length===0,errors,metrics,law,scope:'Reviewed simulation contract; no physical LEGO build acceptance.'};
}
