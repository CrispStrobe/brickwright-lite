#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [source,output]=process.argv.slice(2);
if(!source||!output)throw Error('Usage: adapt-pulse-percussion.mjs pulse_percussion.ldr output.ldr');
const bytes=readFileSync(source);
if(createHash('sha256').update(bytes).digest('hex')!=='d9dd175a8a5b3f193bc5163ef5887367a6797d9cf9a92777896885016c9945bb')throw Error('Source differs from the reviewed original assembly');
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model:m,refusals}=parseModel(bytes.toString('utf8').replaceAll('45601c01.dat','45601.dat'),{catalog:C});
if(refusals.length)throw Error(JSON.stringify(refusals));
const names={p55:'motor',p120:'hub',p92:'pivotShaft',p116:'camshaft',p119:'strikeBar',p103:'beater0',p109:'beater1',p115:'beater2',p100:'peg0',p106:'peg1',p112:'peg2',p98:'cam0',p104:'cam1',p110:'cam2'};
for(const p of m.parts){p.id=names[p.id]||p.id;if(p.id==='motor')p.port='A';if(p.id==='hub'){p.position=[10,-20,-300];p.rotation=[0,-1,0,1,0,0,0,0,1];}}
const I=[1,0,0,0,1,0,0,0,1],UP=[0,1,0,1,0,0,0,0,-1];
const add=(id,part,position,rotation=I,color=72)=>m.parts.push({id,part,position,rotation,color});
for(const x of [40,60]){
 add(`hubSplice${x}`,'32278.dat',[x,60,-300]);add(`hubFoot${x}`,'41239.dat',[x,80,-300]);add(`hubBasePin${x}`,'2780.dat',[x,70,-160],UP,0);
 for(const z of [-220,-380])add(`hubPin${x}_${z}`,'6558.dat',[x,60,z],UP,1);
}
delete m.steps;m.attribution={author:'CrispStrobe',license:'BSD-3-Clause : see ../licenses/pulse-percussion.txt'};
const text=serializeModel(m,{name:'pulse-percussion.ldr',title:'PULSE PERCUSSION — three gravity beaters and a phased camshaft'}).replace('0 !LDRAW_ORG Unofficial_Model','0 !LDRAW_ORG Unofficial_Model\r\n0 // Original design: CrispStrobe. Changes: ten-piece pinned hub mount, canonical hub, explicit port and IDs, connected instructions.');
const p=prepareModel(text,C,{mat:'plain'});
if(p.issues.length||p.model.parts.length!==130||p.mechanism.actuators.length!==1)throw Error(JSON.stringify(p.issues));
for(const part of p.model.parts)if(solidOverlaps(p.model,C,part).length)throw Error(`Overlap: ${part.id}`);
writeFileSync(output,text.replaceAll('\r\n','\n'));
process.stdout.write('130 pieces, one motor, connected and clear\n');
