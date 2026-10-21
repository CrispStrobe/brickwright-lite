#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Usage: adapt-sarrus-lift.mjs source.ldr output.ldr');
const bytes=readFileSync(source);if(createHash('sha256').update(bytes).digest('hex')!=='067b52d1de79c8cea1cdf6022ccc47d24f124bfa37a5767119bf2995fc7455b2')throw Error('Source differs from reviewed model');
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model,refusals}=parseModel(bytes.toString('utf8').replaceAll(' 32064.dat',' 32064a.dat').replaceAll(' 3023.dat',' 3023b.dat'),{catalog:C});if(refusals.length||model.decor?.length)throw Error(JSON.stringify(refusals));
model.attribution={author:'CrispStrobe',license:'BSD-3-Clause : see ../licenses/sarrus-lift.txt'};delete model.steps;
// One plate of clearance prevents the upper links brushing the deck underside.
const bearingIds=['deck_a_bearing_-1','deck_a_bearing_1','deck_b_bearing_-1','deck_b_bearing_1'];
for(const p of model.parts)if(p.id==='deck_plate'||p.id.startsWith('deck_corner_tile_')||p.id.startsWith('sample_cargo_'))p.position[1]-=8;
for(const id of bearingIds){const b=model.parts.find(p=>p.id===id);model.parts.push({id:id+'_clearance_plate',part:'3023b.dat',color:72,position:b.position.map((v,k)=>v-(k===1?8:0)),rotation:b.rotation.slice()});}

const text=serializeModel(model,{name:'sarrus-lift.ldr',title:'Sarrus Lift — spatial straight-line linkage'});
const p=prepareModel(text,C,{mat:'plain'});if(p.issues.some(i=>i.code!=='locked-hinges')||p.model.parts.length!==144)throw Error(JSON.stringify(p.issues));
for(const part of p.model.parts)if(solidOverlaps(p.model,C,part).length)throw Error('Solid overlap '+part.id);
writeFileSync(output,text);console.log('Sarrus Lift: 144 physical placements / one motor / no solid overlaps');
