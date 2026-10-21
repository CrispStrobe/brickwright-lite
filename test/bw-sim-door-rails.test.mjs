// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_KINDS} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {buildGraph} from '../overlay/scratch-gui/src/lib/bw-sim/mech/graph.js';
import {validatePartMeta} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {snapCandidates} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';
import {continuousStrip,continuousStrips} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/continuous-strip.js';
import {connectorSeatPosition,connectorSeatLength} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/connector-frame.js';
const I=[1,0,0,0,1,0,0,0,1],flip=[-1,0,0,0,1,0,0,0,-1];
const meta=(part,connectors,colliders=[{shape:'box',halfExtents:[10,4,10]}])=>({part,name:part,category:'fixture',massGrams:2,connectors,colliders});
const placed=(id,part,position=[0,0,0],rotation=I)=>({id,part,position,rotation,color:71});
const rail=(x=0)=>({id:'r'+x,type:'door-rail',position:[x,4,-15],axis:[1,0,0],length:160,data:{normal:[0,0,-1],continuous:true}});
const groove={id:'g',type:'door-groove',position:[0,12,-5],axis:[1,0,0],length:80,data:{normal:[0,0,-1]}};
const setup=rails=>({catalog:new Map([['rail.dat',meta('rail.dat',rails)],['groove.dat',meta('groove.dat',[groove])]]),model:{version:1,parts:[placed('r','rail.dat'),placed('g','groove.dat',[0,-8,-20],flip)]}});
test('opposed door-rail faces form a finite slider; wrong facing, offset or no engagement do not',()=>{
 const {catalog,model}=setup([rail()]);const m=compile(model,catalog,{ground:false,version:2});assert.equal(m.joints.length,1);assert.equal(m.joints[0].type,'slider');
 assert.ok(m.joints[0].limits.every(x=>Math.abs(Math.abs(x)-(80+40-8)*.0004)<1e-9));
 for(const moving of [placed('g','groove.dat',[0,-8,-10]),placed('g','groove.dat',[0,-8,-19],flip),placed('g','groove.dat',[200,-8,-20],flip)])assert.equal(compile({...model,parts:[model.parts[0],moving]},catalog,{ground:false,version:2}).joints.length,0);
});
test('slider engagement spans touching strips on its frame and stops at a real gap',()=>{
 const {catalog,model}=setup([rail(-80),rail(80)]);const m=compile(model,catalog,{ground:false,version:2});assert.equal(m.joints.length,1);assert.ok(m.joints[0].limits.every(x=>Math.abs(Math.abs(x)-(160+40-8)*.0004)<1e-9),'both physical strips extend travel');
 const broken=setup([rail(-80.5),rail(80.5)]);assert.ok(compile(broken.model,broken.catalog,{ground:false,version:2}).joints[0].limits.every(x=>Math.abs(x)<.02),'a gap does not become an invisible rail');
});
test('continuous rack runs require the same body, line, facing and width; touching strips do not duplicate a run',()=>{
 const strip=(id,x,owner='frame',normal=[0,-1,0])=>({partId:id,islandId:owner,c:{id:'t',type:'rack-teeth',position:[x,0,0],axis:[1,0,0],length:80},data:{normal,widthLdu:20}});
 const a=strip('a',0),b=strip('b',80),c=strip('c',160);const run=continuousStrip(a,[a,b,c]);assert.equal(run.c.length,240);assert.deepEqual(run.c.position,[80,0,0]);assert.equal(continuousStrips([a,b,c]).length,1);
 for(const bad of [strip('gap',81),strip('body',80,'other'),strip('normal',80,'frame',[0,1,0]),{...b,c:{...b.c,position:[80,1,0]}},{...b,data:{...b.data,widthLdu:10}}])assert.equal(continuousStrip(a,[a,bad]).c.length,80);
});
test('a clipped stud seats at its exposed roof, with the remaining real stud length, in graph and editor',()=>{
 const stud={id:'s',type:'stud',position:[0,4,0],axis:[0,-1,0],length:8,data:{seatOffsetLdu:4}};
 const c=meta('clipped.dat',[stud],[{shape:'box',halfExtents:[10,12,10],position:[0,12,0]},{shape:'cylinder',radius:6,halfHeight:2,position:[0,-2,0],region:'stud'}]);
 const cap=meta('cap.dat',[{id:'u',type:'antistud',position:[0,0,0],axis:[0,-1,0]}],[{shape:'box',halfExtents:[10,4,10],position:[0,-4,0]}]);
 const catalog=new Map([[c.part,c],[cap.part,cap]]),model={version:1,parts:[placed('stud',c.part),placed('cap',cap.part)]};
 assert.deepEqual(connectorSeatPosition(stud),[0,0,0]);assert.equal(connectorSeatLength(stud),4);assert.deepEqual(validatePartMeta(c),[]);
 const graph=buildGraph(model,catalog);assert.equal(graph.nodes.get('stud').connectors[0].length,4);assert.equal(compile(model,catalog,{ground:false,version:2}).bodies.length,1);
 const candidates=snapCandidates({model:{version:1,parts:[model.parts[1]]},catalog,part:c.part,pose:{position:[0,5,0],rotation:I}});assert.ok(candidates.some(c=>Math.abs(c.position[1])<1e-9),'editor uses the exposed clutch plane');
 const wrong=structuredClone(c);delete wrong.connectors[0].data;catalog.set(c.part,wrong);assert.equal(compile(model,catalog,{ground:false,version:2}).bodies.length,2,'unclipped primitive origin cannot clutch at that pose');
 for(const [offset,type]of [[-1,'stud'],[8,'stud'],[NaN,'stud'],[4,'pinhole']]){const bad=structuredClone(c);bad.connectors[0].data.seatOffsetLdu=offset;bad.connectors[0].type=type;assert.ok(validatePartMeta(bad).some(x=>x.includes('seatOffsetLdu')));}
});

test('guide collision pairs follow only the engaged continuous run and preserve unrelated obstacles',async()=>{
 const {DOOR_NEST}=await import('../overlay/scratch-gui/src/lib/bw-sim/kinds/door-rail.js');
 const {BUILTIN_KINDS}=await import('../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js');
 const {localNoCollide}=await import('../overlay/scratch-gui/src/lib/bw-sim/mech/collision-filter.js');
 assert.ok(BUILTIN_KINDS.couplings.detectors().includes(DOOR_NEST),'overlap and travel support must be registered');
 const node=(partId,type,x,normal,length)=>({partId,placed:{rotation:I},connectors:[{id:'track',type,position:[x,0,0],axis:[1,0,0],length,_orig:{data:{normal}}}]});
 const nodes=new Map([
 ['rail1',node('rail1','door-rail',0,[0,0,-1],160)],
 ['rail2',node('rail2','door-rail',160,[0,0,-1],160)],
 ['gap',node('gap','door-rail',321,[0,0,-1],160)],
 ['back',node('back','door-rail',160,[0,0,1],160)],
 ['other',node('other','door-rail',160,[0,0,-1],160)],
 ['groove',node('groove','door-groove',0,[0,0,1],80)]
 ]);
 const islands={nodeToBody:new Map([...nodes.keys()].map(id=>[id,id==='groove'?'b1':id==='other'?'b2':'b0']))};
 const pairs=DOOR_NEST.collisionPairs({nodes,islands});assert.deepEqual(pairs,[['groove','rail1'],['groove','rail2']]);
 const shape=(part,x)=>({part,shape:'box',position:[x,0,0],halfExtents:[.001,.001,.001]});
 const bodies=[{id:'b0',parts:['rail1','rail2','stop'],position:[0,0,0],colliders:[shape('rail1',0),shape('rail2',.02),shape('stop',.04)]},{id:'b1',parts:['groove'],position:[0,0,0],colliders:[shape('groove',.01)]}];
 const joints=[{type:'slider',body1:'b0',body2:'b1',axis:[1,0,0],point:[0,0,0]}];
 const filtered=localNoCollide(bodies,joints,[['b0','b1']],[],[],islands,nodes,pairs);
 assert.deepEqual(filtered,[['b0','b1',[['rail1','groove'],['rail2','groove']]]],'a frame stop remains collidable while the groove passes between rail segments');
 assert.deepEqual(localNoCollide(bodies,joints,[['b0','b1']],[],[],islands,nodes),[['b0','b1',[]]],'without matching guide contacts none are excluded');
});

test('an explicit adhesive interface bonds only coincident opposed faces; area remains declared, not strength',()=>{
 const c=(id,axis)=>({id,type:'bond-face',position:[0,0,0],axis,data:{areaMm2:128}});
 const catalog=new Map([['sheet.dat',meta('sheet.dat',[{...c('bond',[0,1,0]),type:'bond-surface'}])],['pad.dat',meta('pad.dat',[c('adhesive',[0,-1,0])])]]);
 const model={version:1,parts:[placed('sheet','sheet.dat'),placed('pad','pad.dat')]};assert.equal(compile(model,catalog,{ground:false,version:2}).bodies.length,1);
 assert.equal(compile({...model,parts:[model.parts[0],placed('pad','pad.dat',[0,1,0])]},catalog,{ground:false,version:2}).bodies.length,2,'an air gap is not bonded');
 const wrong=structuredClone(catalog.get('pad.dat'));wrong.connectors[0].axis=[0,1,0];catalog.set('pad.dat',wrong);assert.equal(compile(model,catalog,{ground:false,version:2}).bodies.length,2,'faces point towards each other');
 wrong.connectors[0].data.areaMm2=0;assert.ok(validatePartMeta(wrong,{connectorKinds:BUILTIN_KINDS.connectors}).some(e=>e.includes('areaMm2')));
});
