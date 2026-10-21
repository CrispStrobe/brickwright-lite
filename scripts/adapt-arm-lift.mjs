#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [id,source,output]=process.argv.slice(2);
const hashes={'atlas-arm':'ffd577c3ceef64c462cb4b0769003b13adf711a765bff0f5f9e6e3766e367b16','switchback-lift':'534868be6444c0d47c98e3ca3defe441e7f91272605b9c2ed76c60b231053647'};
if(!hashes[id]||!source||!output)throw Error('Usage: adapt-arm-lift.mjs atlas-arm|switchback-lift original.ldr output.ldr');
const bytes=read(source);if(createHash('sha256').update(bytes).digest('hex')!==hashes[id])throw Error('Source differs from the reviewed original assembly');
let n=0;const original=bytes.toString('utf8').replaceAll('45601c01.dat','45601.dat').split(/\r?\n/).flatMap(line=>/^1\s/.test(line)?[`0 !BW ID p${++n}`,line]:[line]).join('\n');
const C=catalogFrom(JSON.parse(read(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model,refusals}=parseModel(original,{catalog:C});if(refusals.length)throw Error(JSON.stringify(refusals));
n=0;for(const p of model.parts){if(p.part==='54696p01.dat'){p.id=`motor${['A','B','D'][n]}`;p.port=['A','B','D'][n++];}if(p.part==='45601.dat')p.id='hub';}
model.attribution={author:'CrispStrobe',license:`BSD-3-Clause : see ../licenses/${id}.txt`};delete model.steps;
if(id==='atlas-arm'){
for(const x of [180,300])for(const z of [-50,70])model.parts.push({id:`hubPin${x}_${z}`,part:'2780.dat',color:0,position:[x,30,z],rotation:[0,-1,0,1,0,0,0,0,1]});
model.parts.push({id:'motorBraceA',part:'6632.dat',color:4,position:[-160,-220,0],rotation:[0,0,1,1,0,0,0,1,0]});
model.parts.push({id:'motorBraceB',part:'6632.dat',color:4,position:[56.568542,-284.852814,0],rotation:[Math.SQRT1_2,0,Math.SQRT1_2,Math.SQRT1_2,0,-Math.SQRT1_2,0,1,0]});
}else{
model.parts.find(p=>p.id==='hub').position[0]=140;
for(const x of [80])for(const z of [-60,60])model.parts.push({id:`hubPin${x}_${z}`,part:'2780.dat',color:0,position:[x,130,z],rotation:[0,-1,0,1,0,0,0,0,1]});
for(const id of ['p110','p120']){const p=model.parts.find(p=>p.id===id);p.part='32123a.dat';p.position[1]=-115;}
model.parts.push({id:'motorBraceA',part:'6632.dat',color:4,position:[40,-125,-110],rotation:[0,0,1,0,1,0,-1,0,0]});
model.parts=model.parts.filter(p=>!['p63','p68','p156','p165'].includes(p.id));
model.parts.push({id:'housingBrace',part:'41677.dat',color:4,position:[0,-140,-75],rotation:[-1,0,0,0,0,1,0,1,0]});
model.parts.push({id:'motorBraceB',part:'6632.dat',color:4,position:[40,-225,-130],rotation:[1,0,0,0,1,0,0,0,1]});
model.parts.find(p=>p.id==='p340').load=true;
}
// The motor output is independently rotatable. Match its initial keyed
// socket to the supplied shafts, without moving or twisting those shafts.
for(const [motorId,angle]of (id==='atlas-arm'?[['motorA',45],['motorB',45],['motorD',-15]]:[['motorB',10],['motorD',-30]]))model.parts.find(p=>p.id===motorId).rotorAngle=angle;
const title=id==='atlas-arm'?'ATLAS ARM — two worm drives and a powered gripper':'SWITCHBACK LIFT — lift, tip, return and reload';
const text=serializeModel(model,{name:id+'.ldr',title}).replaceAll('\r\n','\n'),p=prepareModel(text,C,{mat:'plain'});
const expected=id==='atlas-arm'?237:341;
if(p.issues.some(i=>i.code!=='locked-hinges')||model.parts.length!==expected)throw Error(JSON.stringify(p.issues));
for(const part of model.parts)if(solidOverlaps(model,C,part).length)throw Error(`Overlap: ${part.id}`);
write(output,text);process.stdout.write(`${id}: ${expected} pieces, three motors, clear; only rigid multi-pin mount notices\n`);
