// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reuse the live reader. Extra API markers are read-only rigid transforms.
import {createMeasurementReader,jointBinding,ropeBinding} from '../../../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import {add,sub,dot,scale,norm,cross,unit,inv,rot,world} from './rigid-poses.mjs';
export function createBatchObserver(session,requested,readVariable){
 const m=session.mechanism,core=session.core,parts=new Map(session.runModel.parts.map(p=>[p.id,p])),bodyOf=new Map();for(const b of m.bodies)for(const id of b.parts||[])if(!bodyOf.has(id))bodyOf.set(id,b);
 const carry=(b,p)=>{const actual=core.bodyPose(b.id);return add(actual.position,rot(actual.rotation,rot(inv(b.rotation),sub(p,b.position))));};
 const point=marker=>{const p=parts.get(marker.part),b=bodyOf.get(marker.part);if(!p||!b)throw Error('missing-target');const v=marker.localLdu??[0,0,0],initial=world(add(p.position,[0,1,2].map(i=>dot(p.rotation.slice(3*i,3*i+3),v))));return carry(b,initial);};
 const vector=(marker,v)=>{const p=parts.get(marker.part),b=bodyOf.get(marker.part);if(!p||!b)throw Error('missing-target');const initial=world([0,1,2].map(i=>dot(p.rotation.slice(3*i,3*i+3),v)));return rot(core.bodyPose(b.id).rotation,rot(inv(b.rotation),initial));};
 const axisOf=(def)=>def.reference?unit(vector(def.reference,{x:[1,0,0],y:[0,1,0],z:[0,0,1]}[def.axis])):{x:[1,0,0],y:[0,1,0],z:[0,0,1]}[def.axis];
 let definitions=requested;
 if(!definitions.length){
  const base=(m.hubs||[]).map(h=>m.bodies.find(b=>b.id===h.body)).find(Boolean)||m.bodies.find(b=>b.parts?.some(id=>parts.has(id)));const id=base?.parts.find(id=>parts.has(id));definitions=id?[{id:'assembly-mass',kind:'mass',label:'Configured assembly mass',targets:[id]},{id:'assembly-speed',kind:'speed',label:'Assembly speed',targets:[id]}]:[];
  for(const j of m.joints.filter(j=>['hinge','slider'].includes(j.type)).slice(0,12))definitions.push({id:'joint-'+j.id,kind:j.type==='slider'?'travel':'jointAngle',label:j.motor?.port||j.id,joint:j.id});
  for(const r of (m.couplings||[]).filter(c=>c.kind==='rope').slice(0,4))definitions.push({id:'rope-'+r.id,kind:'tension',label:r.id,rope:r.id});definitions.push({id:'hinge-closure',kind:'hingeGap',label:'Maximum hinge anchor gap'});
 }
 const extra=new Set(['pointCoordinate','signedAngle','hingeGap','programVariable']),reader=createMeasurementReader(session),normalized=definitions.filter(d=>!extra.has(d.kind)).map(d=>{
  const v={...d};if(['jointAngle','jointSpeed','travel'].includes(v.kind)){const j=m.joints.find(j=>v.port?j.motor?.port===v.port:j.id===v.joint);v.joint=j?.id??v.joint;v.binding=j?jointBinding(m,j):'missing';}
  if(v.kind==='tension'){const r=(m.couplings||[]).find(r=>r.kind==='rope'&&r.id===v.rope);v.binding=r?ropeBinding(r):'missing';}return v;
 });
 const states=new Map();
 const read=()=>{
  const rows=new Map(reader.read(normalized).map(r=>[r.id,r]));
  for(const d of definitions.filter(d=>extra.has(d.kind))){const row={id:d.id,kind:d.kind,label:d.label,available:false,value:null,reason:'',unit:d.kind==='programVariable'?'':d.kind==='signedAngle'?'°':'mm',source:d.kind==='programVariable'?'vm-variable':d.kind==='hingeGap'?'observed-hinge-anchors':'observed-part-marker'};
   try{
    if(d.kind==='programVariable'){const v=readVariable?.(d.variable);if(v===undefined)throw Error('missing-variable');if(!['number','string'].includes(typeof v)||(typeof v==='string'&&!v.trim()))throw Error('unavailable');row.value=Number(v);}
    if(d.kind==='pointCoordinate'){const p=point(d.point),reference=d.reference?point(d.reference):[0,0,0];row.value=dot(sub(p,reference),axisOf(d))*1000;}
    if(d.kind==='signedAngle'){
     const axis=axisOf(d),v=vector(d.point,d.vectorLdu),project=v=>sub(v,scale(axis,dot(v,axis)));if(norm(project(v))<1e-12)throw Error('degenerate-angle');
     let s=states.get(d.id);if(!s){s={initial:v,refBasis:d.reference?[vector(d.reference,[1,0,0]),vector(d.reference,[0,1,0]),vector(d.reference,[0,0,1])]:null,previous:0,total:0};states.set(d.id,s);}
     let ref=s.initial;if(d.reference){const old=s.refBasis.map(unit),basis=[vector(d.reference,[1,0,0]),vector(d.reference,[0,1,0]),vector(d.reference,[0,0,1])].map(unit);ref=basis.reduce((sum,b,i)=>add(sum,scale(b,dot(s.initial,old[i]))),[0,0,0]);}
     const a=unit(project(ref)),b=unit(project(v)),theta=Math.atan2(dot(axis,cross(a,b)),dot(a,b));s.total+=Math.atan2(Math.sin(theta-s.previous),Math.cos(theta-s.previous));s.previous=theta;row.value=s.total*180/Math.PI;
    }
    if(d.kind==='hingeGap'){const gaps=m.joints.filter(j=>j.type==='hinge').map(j=>norm(sub(carry(m.bodies.find(b=>b.id===j.body1),j.point),carry(m.bodies.find(b=>b.id===j.body2),j.point)))*1000);if(!gaps.length)throw Error('unavailable');row.value=Math.max(...gaps);}
    if(!Number.isFinite(row.value))throw Error('unavailable');row.available=true;
   }catch(e){row.reason=['missing-target','missing-variable','degenerate-angle'].includes(e.message)?e.message:'unavailable';row.value=null;}rows.set(d.id,row);
  }
  return definitions.map(d=>rows.get(d.id));
 };
 return{definitions,read};
}
export function summarize(columns,samples){return columns.map((c,i)=>{const values=samples.map(s=>s.values[i]).filter(Number.isFinite);if(!values.length)return{id:c.id,unit:c.unit,availableSamples:0,min:null,max:null,mean:null,span:null,rms:null};const min=Math.min(...values),max=Math.max(...values),mean=values.reduce((a,b)=>a+b,0)/values.length;return{id:c.id,unit:c.unit,availableSamples:values.length,min,max,mean,span:max-min,rms:Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length)};});}
