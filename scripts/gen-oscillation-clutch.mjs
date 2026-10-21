#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Original experiments assembled from our own qualified base modules.
import {readFileSync,writeFileSync} from 'node:fs';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const root=new URL('../',import.meta.url),base='overlay/scratch-gui/static/sim-lab/models/';
const C=catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',root))));
const read=id=>parseModel(readFileSync(new URL(base+id+'.ldr',root),'utf8'),{catalog:C}).model;
const I=[1,0,0,0,1,0,0,0,1],X=[0,0,1,0,1,0,-1,0,0],UP=[0,1,0,1,0,0,0,0,-1],GEAR=[1,0,0,0,0,1,0,-1,0];
const add=(m,id,part,position,rotation=I,color=72,port)=>m.parts.push({id,part,position,rotation,color,...(port?{port}:{})});
const save=(m,id,title)=>{
 m.attribution={author:'CrispStrobe',license:'BSD-3-Clause'};delete m.steps;
 const s=serializeModel(m,{name:id+'.ldr',title}).replaceAll('\r\n','\n');
 const p=prepareModel(s,C,{mat:'plain'}),overlaps=p.model.parts.flatMap(x=>solidOverlaps(p.model,C,x).map(o=>[x.id,o.part]));
 console.log(id,p.model.parts.length,JSON.stringify(p.issues),JSON.stringify(overlaps));
 if(p.issues.length||overlaps.length)throw Error('Model must be connected and clear');
 writeFileSync(new URL(base+id+'.ldr',root),s);
};
{
 const m=read('centrifugal-governor');
 Object.assign(m.parts.find(p=>p.id==='arm0'),{part:'32524.dat',position:[-340,-40,20]});
 Object.assign(m.parts.find(p=>p.id==='arm1'),{part:'41239.dat',position:[340,20,20]});
 for(const x of [-20,20]){
  add(m,`spokeInner${x}`,'32278.dat',[x,-80,-100]);
  Object.assign(m.parts.find(p=>p.id===(x===20?'crankPin1':'crankPin2')),{part:'6558.dat',position:[x,-60,0],color:1});
  add(m,`spokeOuter${x}`,'32278.dat',[x,-100,-320]);
  for(const z of [-200,-240])add(m,`spokeSplice${x}_${z}`,'2780.dat',[x,-90,z],UP,0);
 }
 for(const z of [-440,-400]){
  add(m,`spokeBridge${z}`,'32524.dat',[0,-120,z],X,25);
  for(const x of [-20,20])add(m,`bridgePin${x}_${z}`,'2780.dat',[x,-110,z],UP,0);
 }
 add(m,'pendulumSupport','32278.dat',[0,-140,-420],I,25);
 for(const z of [-440,-400])add(m,`supportPin${z}`,'2780.dat',[0,-130,z],UP,0);
 add(m,'hanger2','15100.dat',[0,-160,-560],[0,1,0,1,0,0,0,0,-1]);
 add(m,'swingPin2','3673.dat',[10,-160,-560],I,71);
 add(m,'arm2','32525.dat',[20,-60,-560],[0,1,0,0,0,1,1,0,0],14);
 save(m,'pendulum-array','Pendulum array — motor excitation and unequal free periods');
}
{
 const m=read('crank-rocker');m.parts=m.parts.filter(p=>['motor','frame','framePin1','framePin2','hub','hubPin-60','hubPin60'].includes(p.id));
 const frame=m.parts.find(p=>p.id==='frame');frame.part='32278.dat';frame.position[0]=40;
 m.parts.find(p=>p.id==='hub').position[0]=40;
 for(const p of m.parts.filter(p=>p.id.startsWith('hubPin')))p.position[0]+=40;
 add(m,'loadMotor','54696p01.dat',[80,0,0],I,71,'B');
 for(const x of [60,100])add(m,`loadMotorPin${x}`,'2780.dat',[x,30,0],UP,0);
 // One 3L pin seats through each motor/frame/hub stack; two 2L pins would overlap.
 Object.assign(m.parts.find(p=>p.id==='framePin2'),{part:'6558.dat',position:[-20,40,0],color:1});
 Object.assign(m.parts.find(p=>p.id==='loadMotorPin100'),{part:'6558.dat',position:[100,40,0],color:1});
 m.parts=m.parts.filter(p=>!p.id.startsWith('hubPin'));
 for(const [id,x] of [['input',0],['output',80]]){
  add(m,id+'Axle','3706.dat',[x,-90,0],UP,4);
  add(m,id+'Pointer','6632.dat',[x,-140,0],X,id==='input'?4:1);
 }
 add(m,'clutch','76019.dat',[0,-70,0],GEAR,15);
 add(m,'outputGear','3649.dat',[80,-70,0],GEAR,1);
 for(const x of [-20,100]){
  add(m,`foot${x}`,'32278.dat',[x,140,60]);
  for(const z of [0,200])add(m,`footPin${x}_${z}`,'2780.dat',[x,130,z],UP,0);
 }
 for(const z of [-60,180]){
  add(m,`cross${z}`,'32278.dat',[40,160,z],X);
  for(const x of [-20,100])add(m,`crossPin${x}_${z}`,'2780.dat',[x,150,z],UP,0);
 }
 save(m,'clutch-bench','Clutch load bench — torque limiting under a controllable load');
}
