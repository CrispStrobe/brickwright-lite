#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [id,source,output]=process.argv.slice(2),hashes={"phase-bridge": "bd256e2d216c2cf73f4070a5183e13687e896f16fb379b2ba453e4d43ba649dd", "phase-bridge-misphased": "68fc8c0b584bb83d7501eec96f2e6886916beba84419337a9a578b7a813f6d35"};
if(!hashes[id]||!source||!output)throw Error('Usage: adapt-phase-bridge.mjs model-id source.ldr output.ldr');
const bytes=readFileSync(source);if(createHash('sha256').update(bytes).digest('hex')!==hashes[id])throw Error('Source differs from reviewed model');
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model,refusals}=parseModel(bytes.toString('utf8'),{catalog:C});if(refusals.length||model.decor?.length)throw Error(JSON.stringify(refusals));
model.attribution={author:'CrispStrobe',license:`BSD-3-Clause : see ../licenses/${id}.txt`};delete model.steps;
const text=serializeModel(model,{name:id+'.ldr',title:id==='phase-bridge'?'Phase Bridge — double-Cardan cancellation':'Phase Bridge — misphased comparison'}).replaceAll('\r\n','\n');
const p=prepareModel(text,C,{mat:'plain'});if(p.issues.length||p.mechanism.couplings.filter(c=>c.kind==='universalJoint').length!==2)throw Error(JSON.stringify(p.issues));
for(const part of p.model.parts)if(solidOverlaps(p.model,C,part).length)throw Error('Solid overlap '+part.id);
writeFileSync(output,text);console.log(id,model.parts.length,'placements / two inferred crosses / one motor');
