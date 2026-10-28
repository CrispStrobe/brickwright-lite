#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [id,source,output]=process.argv.slice(2),spec={
 'scale-echo':{sha:'9ee6fa870d7865780b36cdea57f46c8f43dd5c78dee5e559da3dc75bdc89ee8b',n:148,title:'Scale Echo — two-to-one pantograph'},
 turnwise:{sha:'17e09b9bad8b8e69349c3154b59cc9f27028bf3e802ea2064d402abe4be6fe86',n:127,title:'Turnwise — unequal steering angles'}
}[id];if(!spec||!source||!output)throw Error('Usage: adapt-scaling-steering.mjs scale-echo|turnwise source.ldr output.ldr');
const bytes=readFileSync(source);if(createHash('sha256').update(bytes).digest('hex')!==spec.sha)throw Error('Source differs from reviewed model');
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model,refusals}=parseModel(bytes.toString('utf8'),{catalog:C});if(refusals.length||model.decor?.length)throw Error(JSON.stringify(refusals));
model.attribution={author:'CrispStrobe',license:`BSD-3-Clause : see ../licenses/${id}.txt`};delete model.steps;
const text=serializeModel(model,{name:id+'.ldr',title:spec.title}),p=prepareModel(text,C,{mat:'plain'});
if(p.issues.length||p.model.parts.length!==spec.n)throw Error(JSON.stringify(p.issues));
for(const part of p.model.parts)if(solidOverlaps(p.model,C,part).length)throw Error('Solid overlap '+part.id);
writeFileSync(output,text);console.log(`${id}: ${spec.n} original placements, no solid overlaps`);
