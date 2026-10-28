// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Analytic controls only. Circle intersections generate poses without using
// either acceptance oracle. These records are never engine qualification.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../../../../'+p,import.meta.url),'utf8');
const contractBytes=read('test/fixtures/bw-sim/cross-ratio/contract.json'),C=JSON.parse(contractBytes);
const digest=s=>createHash('sha256').update(s).digest('hex');
export const ANALYTIC_IDENTITY={commit:'1'.repeat(40),tree:'2'.repeat(40),files:Object.fromEntries(C.identityPaths.map(p=>[p,digest(read(p))]))};
export function analyticRecord(control=false,coldMs=0){
 const a=.032,b=.064,root=Math.sqrt(3),A=[0,0,0],B=[a,0,0],P0=[b/2,0,-b*root/2];
 const q=d=>[0,Math.sin(d*Math.PI/360),0,Math.cos(d*Math.PI/360)];
 const body=(id,parts,position)=>({id,parts,position,rotation:q(0),motion:'dynamic'});
 const topology=C.topology[control?'remove-pivot-P':'original'];
 const parts=role=>topology.bodyPartGroups.find(g=>g.includes(C.roles[role]));
 const bodies=[body('base',parts('base'),A),body('input',parts('input'),A),body('output',parts('output'),B),body('coupler',parts('coupler'),P0),{...body('ground',[],A),motion:'static'},...(control?C.control.detachedCaptureParts.map((p,i)=>body('capture'+i,[p],[.2+i*.01,0,0])):[])];
 const hinge=(id,body1,body2,point)=>({id,type:'hinge',body1,body2,point,axis:[0,1,0]});
 const joints=[hinge('A','base','input',A),hinge('B','base','output',B),...(!control?[hinge('P','input','coupler',P0)]:[]),hinge('Q','coupler','output',[0,0,-b*root/2])];
 const input={originalModel:read('overlay/scratch-gui/static/sim-lab/models/cross-ratio.ldr'),program:read('overlay/scratch-gui/static/sim-lab/programs/cross-ratio.bw')};
 input.model=control?input.originalModel.replace(/^0 !BW ID pivot_axle_P\n(?:0 [^\n]*\n)*1 [^\n]*\n/gm,''):input.originalModel;input.modelSha256=digest(input.model);
 const frames=[];
 for(let index=0;index<=621;index++){
  const stage=Math.min(9,Math.floor(Math.max(0,index-1)/60)),th=index===0?60:C.route[stage],angle=th*Math.PI/180;
  const P=[b*Math.cos(angle),b*Math.sin(angle)],dx=P[0]-a,dy=P[1],d=Math.hypot(dx,dy);
  const along=(b*b-a*a+d*d)/(2*d),height=Math.sqrt(Math.max(0,b*b-along*along));
  const Q=[a+along*dx/d-height*dy/d,along*dy/d+height*dx/d];
  const ph=Math.atan2(Q[1],Q[0]-a)*180/Math.PI,gamma=Math.atan2(Q[1]-P[1],Q[0]-P[0])*180/Math.PI;
  const poses=Object.fromEntries(bodies.filter(x=>x.id!=='ground').map(x=>[x.id,{position:[...x.position],rotation:q(0)}]));
  poses.input.rotation=q(th-60);
  if(!control){poses.output.rotation=q(ph-120);poses.coupler.rotation=q(gamma-180);poses.coupler.position=[P[0],0,-P[1]];}
  frames.push({t:index*25,phase:index===0?'cold':index<=601?'program':'after',bodies:poses,busy:{A:false},extra:{variables:{completed:index>=601?1:0,failed:0,stage:index>=601?10:stage,arrived:index>=601?0:1,inputReady:1},modes:{A:'hold'}}});
 }
 // Sixty samples at every route arrival; the final twenty frames are the
 // final datum hold. The original-program clock here is an analytic fixture.
 if(coldMs){
  const cold=Array.from({length:coldMs/25},(_,i)=>({...structuredClone(frames[0]),t:i*25,phase:'cold'}));
  for(const f of frames)f.t+=coldMs;
  frames.unshift(...cold);
 }
 return {schema:1,kind:'cross-ratio-native',identity:ANALYTIC_IDENTITY,contractSha256:digest(contractBytes),variant:control?'remove-pivot-P':'original',input,timing:{...C.timing,coldMs},mechanism:{bodies,joints,actuators:[{port:'A'}]},track:frames,finishedAt:15025+coldMs,issues:topology.issueKeys.map(key=>{const [severity,code,part]=key.split(':');return{severity,code,parts:[part]};}),unsupported:[],vmErrors:[]};
}
