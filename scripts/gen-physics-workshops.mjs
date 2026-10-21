#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Original larger teaching models, assembled from Brickwright's own mechanism modules.
// Extra pieces carry the chain, brace the bearings, and add measurable rotational inertia.
import {readFileSync, writeFileSync} from 'node:fs';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {chainRound} from '../overlay/scratch-gui/src/lib/bw-sim/editor/chain-path.js';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
const ROOT = new URL('../', import.meta.url);
const dir = new URL('overlay/scratch-gui/static/sim-lab/models/', ROOT);
const catalog = catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', ROOT))));
const read = file => parseModel(readFileSync(new URL(file, dir), 'utf8'), {catalog}).model;
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ALONG_X = [0, 0, 1, 0, 1, 0, -1, 0, 0];
const PIN_Y = [0, 1, 0, 1, 0, 0, 0, 0, -1];
const HOLES_X = [0, 1, 0, 1, 0, 0, 0, 0, -1];
const add = (parts, id, part, position, rotation = I, color = 72) => parts.push({id, part, position, rotation, color});
const save = (model, file, title) => {
    const text = serializeModel(model, {name: file, title});
    const p = prepareModel(text, catalog);
    if (p.issues.length) throw new Error(`${file}: ${JSON.stringify(p.issues)}`);
    const overlaps = p.model.parts.flatMap(part => solidOverlaps(p.model, catalog, part).map(o => [part.id, o.part]));
    if (overlaps.length) throw new Error(`${file}: overlaps ${JSON.stringify(overlaps)}`);
    writeFileSync(new URL(file, dir), text);
    process.stdout.write(`${file}: ${model.parts.length} pieces, ${p.mechanism.bodies.length} bodies, no issues or solid overlaps\n`);
};

// A 104 mm centre-distance chain transmission. The actual 3711 chain links account
// for its size; a pinned splice joins the two bearing beams rather than leaving the output floating.
const chain = read('chain-drive.ldr');
chain.parts = chain.parts.filter(p => !p.id.startsWith('link'));
for (const p of chain.parts) if (p.id === 'drivenAxle' || p.id === 'sprocketBig') p.position[0] = 260;
add(chain.parts, 'outputBearingBeam', '32524.dat', [220, 40, 0], ALONG_X);
add(chain.parts, 'bearingSplice', '32524.dat', [140, 60, 0], ALONG_X, 25);
add(chain.parts, 'splicePinIn', '2780.dat', [100, 50, 0], PIN_Y, 0);
add(chain.parts, 'splicePinOut', '2780.dat', [180, 50, 0], PIN_Y, 0);
const loop = chainRound(chain, catalog, ['sprocketSmall', 'sprocketBig']);
if (loop.error) throw new Error(JSON.stringify(loop));
loop.links.forEach((link, i) => chain.parts.push({id: `link${i + 1}`, ...link}));
save(chain, 'chain-transmission.ldr', 'Long chain transmission — speed ratio and same-direction drive');

// Two flywheels on an open differential. Long half-shafts clear the brake gear;
// transverse braces close the bearing frames to take the flywheels' reaction torque.
// Smooth axle joiners act as retaining collars on either side of each three-wheel stack.
const differential = read('differential.ldr');
// The large wheels themselves show rotation; remove the original small pointer beams.
differential.parts = differential.parts.filter(p => !/Pointer$/.test(p.id));
for (const p of differential.parts) {
    if (/^pinR[1-4]$/.test(p.id)) { p.part = '6558.dat'; p.position[0] = 40; }
    if (p.id === 'leftAxle') { p.part = '50451.dat'; p.position[0] = -175; }
    if (p.id === 'rightAxle') { p.part = '50451.dat'; p.position[0] = 169; }
}
for (const x of [-40, 60]) for (const y of [-20, 20]) {
    add(differential.parts, `bearingBrace${x < 0 ? 'L' : 'R'}${y < 0 ? 'Top' : 'Bottom'}`, '32524.dat', [x, y, 0], HOLES_X, 25);
}
for (const side of [-1, 1]) {
    const name = side < 0 ? 'Left' : 'Right';
    for (const x of [175, 215, 255]) add(differential.parts, `flywheel${name}${x}`, '49295p01.dat', [side * x, -100, 0], ALONG_X, 15);
    add(differential.parts, `collar${name}145`, '6536.dat', [side * 145, -100, 0], I, 4);
    add(differential.parts, `collar${name}295`, '59443.dat', [side * 295, -100, 0], ALONG_X, 4);
}
save(differential, 'flywheel-differential.ldr', 'Flywheel differential — angular inertia and power splitting');
