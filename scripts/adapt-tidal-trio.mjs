#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Reproduce the owner's original assembly; read downloaded controllers as data only.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const [source, output] = process.argv.slice(2);
if (!source || !output) throw Error('Usage: adapt-tidal-trio.mjs tidal_trio_home.mpd output.ldr');
const bytes = readFileSync(source);
if (createHash('sha256').update(bytes).digest('hex') !== '2d22875000cdedb24e5135eea5c1282b1e0ddfa4ca6a7a56ee7f3d07c69233c5') throw Error('Source differs from the reviewed home-pose assembly');
const C = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));
const {model: m, refusals} = parseModel(bytes.toString('utf8').replaceAll('45601c01.dat', '45601.dat'), {catalog: C});
if (refusals.length) throw Error(JSON.stringify(refusals));
for (const p of m.parts) {
    if (p.part === '45601.dat') {
        p.id = 'hub';
        p.position = [30, 160, -180];
        p.rotation = [0, -1, 0, 1, 0, 0, 0, 0, 1];
    }
    const module = /^0([234])_module\.ldr#\d+_(\d+)$/.exec(p.id);
    if (!module) continue;
    const lane = Number(module[1]) - 2;
    const names = {14: 'motor', 47: 'brace', 64: 'crank', 69: 'coupler', 73: 'rocker', 78: 'flag'};
    if (names[module[2]]) p.id = `${names[module[2]]}${lane}`;
    if (p.part === '54696p01.dat') p.port = 'ABC'[lane];
}
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const UP = [0, 1, 0, 1, 0, 0, 0, 0, -1];
const add = (id, part, position, rotation, color = 72) => m.parts.push({id, part, position, rotation, color});
// Replace the detached console with a two-rail mount pinned into free chassis holes.
// Four pins enter the hub's blind side sockets from below, through the rails.
for (const x of [40, 80]) {
    add(`hubRail${x}`, '32278.dat', [x, 240, -140], I);
    add(`hubBasePin${x}`, '2780.dat', [x, 230, 0], UP, 0);
    for (const z of [-100, -260]) add(`hubPin${x}_${z}`, '2780.dat', [x, 230, z], UP, 0);
}
delete m.steps;
m.attribution = {author: 'CrispStrobe', license: 'BSD-3-Clause : see ../licenses/tidal-trio.txt'};
const text = serializeModel(m, {name: 'tidal-trio.ldr', title: 'TIDAL TRIO — three-motor phase sculpture'}).replace('0 !LDRAW_ORG Unofficial_Model', '0 !LDRAW_ORG Unofficial_Model\r\n0 // Copyright (c) 2026 CrispStrobe. Original owner-supplied design.\r\n0 // Changes: pinned hub mount, canonical hub, explicit ports and IDs, connected instructions.');
const p = prepareModel(text, C, {mat: 'plain'});
if (p.model.parts.length !== 226 || p.mechanism.actuators.length !== 3 || p.issues.some(i => i.code !== 'locked-hinges')) throw Error(JSON.stringify(p.issues));
for (const part of p.model.parts) {
    const overlaps = solidOverlaps(p.model, C, part);
    if (overlaps.length) throw Error(JSON.stringify({part: part.id, overlaps}));
}
writeFileSync(output, text.replaceAll('\r\n', '\n'));
process.stdout.write(JSON.stringify({pieces: p.model.parts.length, motors: p.mechanism.actuators.length, issues: p.issues}) + '\n');
