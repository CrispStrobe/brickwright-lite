// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {upgradePartMeta} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {buildGraph} from '../overlay/scratch-gui/src/lib/bw-sim/mech/graph.js';
import {driveHubRef,phasedMotorSource} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/motor-phase.js';
import {parseLDraw} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {partVisual} from '../overlay/scratch-gui/src/lib/bw-sim/view/part-geometry.js';
const root=new URL('../',import.meta.url),C=new Map(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',root))).parts.map(m=>[m.part,upgradePartMeta(m)]));
const read=p=>{try{return readFileSync(new URL('overlay/scratch-gui/static/ldraw/'+p,root),'latin1');}catch{return undefined;}};
test('initial motor angle survives flat and nested MPD saves; malformed declarations fail',()=>{
 const source=readFileSync(new URL('overlay/scratch-gui/static/sim-lab/models/atlas-arm.ldr',root),'utf8');
 for(const text of [source,`0 FILE main.mpd\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 child.ldr\n0 FILE child.ldr\n${source}\n0 NOFILE\n`]){
  const p=parseModel(text,{catalog:C});assert.deepEqual(p.refusals,[]);assert.deepEqual(p.model.parts.filter(p=>p.rotorAngle!==undefined).map(p=>[p.id,p.rotorAngle]),[['motorA',45],['motorB',45],['motorD',-15]]);
  assert.deepEqual(parseModel(serializeModel(p.model),{catalog:C}).model.parts,p.model.parts);
 }
 for(const value of ['NaN','Infinity','', 'bad'])assert.ok(parseModel(`0 !BW ROTOR ${value}\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 54696p01.dat`,{catalog:C}).refusals.some(i=>i.code==='bad-rotor'));
});
test('only motor output connectors and output mesh turn; phase caches remain independent',()=>{
 const meta=C.get('54696p01.dat'),original=JSON.stringify(meta),motor={id:'m',part:meta.part,position:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],port:'A',rotorAngle:45};
 const a=buildGraph({parts:[motor]},C),b=buildGraph({parts:[{...motor,rotorAngle:0}]},C);
 const ae=[...a.nodes.values()].find(n=>n.id!=='m'),be=[...b.nodes.values()].find(n=>n.id!=='m');
 assert.deepEqual(a.nodes.get('m').connectors,b.nodes.get('m').connectors,'housing mounting connectors stay fixed');
 assert.notDeepEqual(ae.connectors.filter(c=>c.id!=='out'),be.connectors.filter(c=>c.id!=='out'),'radial output pin holes follow the rotor');assert.equal(JSON.stringify(meta),original,'shared catalogue stays immutable');
 const zero=parseLDraw(read('parts/'+meta.part)),turned=parseLDraw(phasedMotorSource(meta.part,read,meta,45)),ref=driveHubRef(meta.part,read,meta);
 assert.deepEqual(zero.refs.filter((_,i)=>i!==ref),turned.refs.filter((_,i)=>i!==ref));assert.notDeepEqual(zero.refs[ref].x,turned.refs[ref].x);
 const colors=new Map([[16,{value:'#ffffff',edge:'#333333',alpha:1}]]),v0=partVisual(meta.part,read,colors),v45=partVisual(meta.part,read,colors,{rotor:{meta,angle:45}});
 assert.notEqual(v0,v45);assert.notDeepEqual(v0.faces.attributes.position.array,v45.faces.attributes.position.array);assert.equal(partVisual(meta.part,read,colors),v0);assert.equal(partVisual(meta.part,read,colors,{rotor:{meta,angle:45}}),v45);
});
