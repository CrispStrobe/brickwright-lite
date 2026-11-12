// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync} from 'node:fs';
import {screenRack} from './lib/spiral-rack-screen.mjs';

const root = new URL('../', import.meta.url);
const parts = JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root))).parts;
const model = readFileSync(new URL('overlay/scratch-gui/static/sim-lab/models/spiral-scribe.ldr', root), 'utf8');
const rack = /^0 !BW ID radial_rack\r?\n([^\r\n]+)$/gm;
const entries = [...model.matchAll(rack)];
if (entries.length !== 1 || !/^1\s+.*\s64781\.dat$/i.test(entries[0][1])) throw new Error('unexpected Spiral Scribe rack identity');
const reference = parts.find(p => p.part === '64781.dat');
if (!reference) throw new Error('missing 64781 metadata');
const candidates = parts.filter(p => p.connectors?.some(c => c.type === 'rack-teeth'));
const result = candidates.map(p => ({part: p.part, name: p.name,
 transforms: screenRack(reference, p, ['h0', 'h1', 'a0', 'a1'])}));
console.log(JSON.stringify({model: 'spiral-scribe', reference: reference.part,
 constraints: 'unchanged four attachment connectors and rack tooth contact, axis-aligned proper rotations',
 limitations: 'Metadata screen only: pitch, actual part geometry, collision clearance, travel and physical build not established.',
 candidates: result}, null, 2));
