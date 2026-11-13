// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync} from 'node:fs';
import {screenRack, screenMountRedesign} from './lib/spiral-rack-screen.mjs';

const root = new URL('../', import.meta.url);
const parts = JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root))).parts;
const model = readFileSync(new URL('overlay/scratch-gui/static/sim-lab/models/spiral-scribe.ldr', root), 'utf8');
const rack = /^0 !BW ID radial_rack\r?\n([^\r\n]+)$/gm;
const entries = [...model.matchAll(rack)];
if (entries.length !== 1) throw new Error('expected one Spiral Scribe rack');
const fields = entries[0][1].trim().split(/\s+/);
if (fields[0] !== '1' || fields.length !== 15 || fields.slice(2,14).some(v => !Number.isFinite(Number(v)))) {
 throw new Error('expected one finite LDraw Type 1 rack placement');
}
const activePart = fields[14];
const active = parts.find(p => p.part === activePart);
if (!active?.connectors?.some(c => c.type === 'rack-teeth')) throw new Error('missing active rack metadata');
// Keep the original four-mount benchmark separate from the redesigned assembly.
const reference = parts.find(p => p.part === '64781.dat');
if (!reference) throw new Error('missing 64781 metadata');
const candidates = parts.filter(p => p.connectors?.some(c => c.type === 'rack-teeth'));
const result = candidates.map(p => ({part: p.part, name: p.name,
 transforms: screenRack(reference, p, ['h0', 'h1', 'a0', 'a1']),
 redesign: screenMountRedesign(reference, p, ['h0', 'h1', 'a0', 'a1'])}));
console.log(JSON.stringify({model: 'spiral-scribe', activeRack: active.part, reference: reference.part,
 referenceRole: 'original 64781 four-mount benchmark; not the redesigned assembly',
 constraints: 'original four attachment connectors and rack tooth contact, axis-aligned proper rotations',
 limitations: 'Metadata screen only: redesign searches axial translations that cover the reference tooth span, minimizing the largest distinct-mount displacement; missing assignments retain centre alignment for independent distances; distinct assignments do not prove a shared mounting layout; pitch, part geometry, clearance, travel and physical build not established.',
 candidates: result}, null, 2));
