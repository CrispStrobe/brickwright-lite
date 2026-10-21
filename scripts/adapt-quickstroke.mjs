#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Usage: adapt-quickstroke.mjs source.ldr output.ldr');
const bytes=readFileSync(source);if(createHash('sha256').update(bytes).digest('hex')!=='fd968e15603279400ff3863ae7892a476b49855074894552249f0fab2b44dc35')throw Error('Source differs from reviewed model');
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model,refusals}=parseModel(bytes.toString('utf8'),{catalog:C});if(refusals.length||model.decor?.length)throw Error(JSON.stringify(refusals));
model.attribution={author:'CrispStrobe',license:'BSD-3-Clause : see ../licenses/quickstroke.txt'};delete model.steps;
const text=serializeModel(model,{name:'quickstroke.ldr',title:'Quickstroke — offset slider-crank'});
const p=prepareModel(text,C,{mat:'plain'});if(p.issues.some(i=>i.code!=='locked-hinges')||p.model.parts.length!==111)throw Error(JSON.stringify(p.issues));
for(const part of p.model.parts)if(solidOverlaps(p.model,C,part).length)throw Error('Solid overlap '+part.id);
writeFileSync(output,text);console.log('Quickstroke: 111 physical placements / one motor / no solid overlaps');
