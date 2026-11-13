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
const selectedPart = id => {
 const rows = [...model.matchAll(new RegExp('^0 !BW ID ' + id + '\\r?\\n([^\\r\\n]+)$', 'gm'))];
 if (rows.length !== 1) throw new Error('expected one ' + id);
 const fields = rows[0][1].trim().split(/\s+/);
 if (fields[0] !== '1' || fields.length !== 15 || fields.slice(2,14).some(v => !Number.isFinite(Number(v)))) {
  throw new Error('expected finite Type 1 placement for ' + id);
 }
 return fields[14];
};
const pinionPart = selectedPart('feed_pinion'), rackPart = selectedPart('radial_rack');
const pinion = metadata.find(p => p.part === pinionPart);
if (!Number.isInteger(pinion?.gear?.teeth) || pinion.gear.teeth <= 0) throw new Error('missing selected pinion tooth count');
const rackMeta = metadata.find(p => p.part === rackPart);
if (!rackMeta?.connectors?.some(c => c.type === 'rack-teeth')) throw new Error('missing selected rack metadata');
const activeData = readFileSync(new URL(rackPart,root), 'utf8');
const directRows = repeatedToothPitch(activeData,'toothr.dat');
// Standard direct tooth primitives work independently of the benchmark set.
// The original 64781 stores its repeated teeth in a named subpart instead.
const rack = directRows.length ? {groups:directRows} : parts.find(p => p.part === rackPart);
if (!rack) throw new Error('selected rack has no supported source-tooth rows: ' + rackPart);
const pitchLdu = rack.groups[0].pitchLdu;
if (!rack.groups.every(g => g.pitchLdu === pitchLdu)) throw new Error('inconsistent selected rack tooth rows');
const advance = compareRackAdvance(pitchLdu,pinion.gear.teeth,1,0.4);
const active = {rack:rackPart,pinion:pinionPart,teeth:pinion.gear.teeth,rackPitchLdu:pitchLdu,rackPitchMm:pitchLdu*0.4,
 ...advance, relativeDifferencePercent:100*advance.differenceMm/advance.pitchCircleMm,
 interpretation:'Rendered tooth-placement advance versus the simulator module-1 ideal; neither is a physical measurement.'};
const comparisons = parts.map(p => ({part:p.part, ...compareRackAdvance(p.groups[0].pitchLdu,pinion.gear.teeth,1,0.4)}));
console.log(JSON.stringify({active,parts,pinion:pinion.part,inputs:{teeth:pinion.gear.teeth,assumedModuleMm:1,lduMm:0.4},comparisons,
 limitations:'LDraw placement and a module-1 pitch-circle comparison only; not calibrated real-part pitch, contact geometry, collision clearance, or buildability.'},null,2));
