#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [source,output]=process.argv.slice(2);
if(!source||!output)throw Error('Usage: adapt-straight-eight.mjs original.ldr output.ldr');
const bytes=readFileSync(source);
if(createHash('sha256').update(bytes).digest('hex')!=='20a42809c7eb9a089c68020998f0fb61d0ef436e1ccfe9bbfe5a16f347a0fbab')throw Error('Source differs from the reviewed original assembly');
const C=catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json',import.meta.url))));
const {model,refusals}=parseModel(bytes.toString('utf8'),{catalog:C});
if(refusals.length)throw Error(JSON.stringify(refusals));
for(const p of model.parts){if(p.part==='54696p01.dat'){p.id='motorA';p.port='A';}if(p.part==='45601.dat')p.id='hub';}
model.attribution={author:'CrispStrobe',license:'BSD-3-Clause : see ../licenses/straight-eight.txt'};
const text=serializeModel(model,{name:'straight-eight.ldr',title:'STRAIGHT EIGHT — Peaucellier straight-line linkage'}).replaceAll('\r\n','\n');
const p=prepareModel(text,C,{mat:'plain'});
if(p.issues.length||model.parts.length!==113||p.mechanism.actuators.length!==1)throw Error(JSON.stringify(p.issues));
for(const part of model.parts)if(solidOverlaps(model,C,part).length)throw Error(`Overlap: ${part.id}`);
writeFileSync(output,text);
process.stdout.write('113 pieces, one motor, connected and clear\n');
