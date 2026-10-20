// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import fs from 'node:fs';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const C=catalogFrom(JSON.parse(fs.readFileSync('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const {model:m}=parseModel(fs.readFileSync('overlay/scratch-gui/static/sim-lab/models/crank-rocker.ldr','utf8'),{catalog:C});
m.parts=m.parts.filter(p=>['motor','frame','framePin1','framePin2','crank','crankPin1','crankPin2','hub','hubPin-60','hubPin60'].includes(p.id));
const I=[1,0,0,0,1,0,0,0,1],X=[0,0,1,0,1,0,-1,0,0],UP=[0,1,0,1,0,0,0,0,-1];
const add=(id,part,position,rotation=I,color=72)=>m.parts.push({id,part,position,rotation,color});
Object.assign(m.parts.find(p=>p.id==='crank'),{part:'32278.dat',color:25});
for(const x of [-220,220]){add(`wing${x}`,'32278.dat',[x,-80,0],X,25);for(const dx of [0,40])add(`wingPin${x}_${dx}`,'2780.dat',[(x<0?-1:1)*(100+dx),-70,0],UP,0);}
for(const [n,x] of [[0,-340],[1,340]]){
 add(`hanger${n}`,'15100.dat',[x,-100,0],[0,0,1,1,0,0,0,1,0]);
 add(`swingPin${n}`,'3673.dat',[x,-100,10],[0,0,-1,0,1,0,1,0,0],71);
 add(`arm${n}`,'40490.dat',[x,-20,20],[-1,0,0,0,0,1,0,1,0],n?1:4);
}
for(const x of [-60,60]){
 add(`foot${x}`,'32278.dat',[x,140,60],I);
 for(const z of [0,200])add(`footPin${x}_${z}`,'2780.dat',[x,130,z],UP,0);
}
for(const z of [-60,180]){
 add(`cross${z}`,'32278.dat',[0,160,z],X);
 for(const x of [-60,60])add(`crossPin${x}_${z}`,'2780.dat',[x,150,z],UP,0);
}
m.attribution={author:'CrispStrobe',license:'BSD-3-Clause'};
const s=serializeModel(m,{name:'centrifugal-governor.ldr',title:'Centrifugal governor — speed squared versus gravity'});fs.writeFileSync('overlay/scratch-gui/static/sim-lab/models/centrifugal-governor.ldr',s.replaceAll('\r\n','\n'));
const p=prepareModel(s,C,{mat:'plain'});console.log('pieces',p.model.parts.length,'issues',p.issues,'overlaps',p.model.parts.flatMap(x=>solidOverlaps(p.model,C,x).map(o=>[x.id,o.part])));
if(p.issues.length||p.model.parts.length!==34||p.model.parts.some(x=>solidOverlaps(p.model,C,x).length))throw Error('Original governor is not clear and connected');
