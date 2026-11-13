// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {repeatedToothPitch, compareRackAdvance} from './lib/spiral-tooth-pitch.mjs';
const root = new URL('../overlay/scratch-gui/static/ldraw/parts/', import.meta.url);
const references = [['64781.dat','s/64781s02.dat'],['32132.dat','toothr.dat'],['32185.dat','toothr.dat'],['18942.dat','toothr.dat']];
const parts = references.map(([part,subpart]) => {
 const data=readFileSync(new URL(part,root));
 const rows=repeatedToothPitch(data.toString('utf8'),subpart);
 if (!rows.length) throw new Error('no repeated tooth group for '+part);
 return {part,subpart,sha256:createHash('sha256').update(data).digest('hex'),groups:rows};
});
const metadata = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts;
const model = readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/spiral-scribe.ldr', import.meta.url), 'utf8');
const pinions = [...model.matchAll(/^0 !BW ID feed_pinion\r?\n([^\r\n]+)$/gm)];
if (pinions.length !== 1 || !/^1\s+.*\s32270\.dat$/i.test(pinions[0][1])) throw new Error('unexpected feed pinion');
const pinion = metadata.find(p => p.part === '32270.dat');
if (pinion?.gear?.teeth !== 12) throw new Error('unexpected gear metadata');
const comparisons = parts.map(p => ({part:p.part, ...compareRackAdvance(p.groups[0].pitchLdu,pinion.gear.teeth,1,0.4)}));
console.log(JSON.stringify({parts,pinion:pinion.part,inputs:{teeth:12,assumedModuleMm:1,lduMm:0.4},comparisons,
 limitations:'LDraw placement and a module-1 pitch-circle comparison only; not calibrated real-part pitch, contact geometry, collision clearance, or buildability.'},null,2));
