#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Usage: adapt-ellipse-engine.mjs source.ldr output.ldr');
const bytes=readFileSync(source);if(createHash('sha256').update(bytes).digest('hex')!=='a1a06bef72fa803675b6699231ff5c000a7f097f50be667f378caeeb08d7b768')throw Error('Source differs from reviewed model');
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model,refusals}=parseModel(bytes.toString('utf8'),{catalog:C});if(refusals.length||model.decor?.length)throw Error(JSON.stringify(refusals));
model.attribution={author:'CrispStrobe',license:'BSD-3-Clause : see ../licenses/ellipse-engine.txt'};delete model.steps;
const text=serializeModel(model,{name:'ellipse-engine.ldr',title:'Ellipse Engine — orthogonal trammel'});
const p=prepareModel(text,C,{mat:'plain'});if(p.issues.some(i=>i.code!=='locked-hinges')||p.model.parts.length!==169)throw Error(JSON.stringify(p.issues));
for(const part of p.model.parts)if(solidOverlaps(p.model,C,part).length)throw Error('Solid overlap '+part.id);
writeFileSync(output,text);console.log('Ellipse Engine: 169 physical placements / one motor / no solid overlaps');
