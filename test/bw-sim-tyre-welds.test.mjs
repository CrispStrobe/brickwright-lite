// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Parts with nothing to connect by (kinds/tyre.js): a tyre rides on the rim inside it, a plug on the
// part its body sits in; a ball stays a toy. (A real NXT Tri-bot from the LDraw library dropped its
// tyres and its cables' fourteen plugs on the floor beside it.)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// As part-meta/catalog-parts.js makes them for a catalogue part with no connector: its envelope as a collider.
const lone = (part, name, he, extra = {}) => ({part, name, category: 'other', massGrams: 5, connectors: [], decoration: true,
    colliders: [{shape: 'box', halfExtents: he}], ...extra});
const catalog = new Map([...CATALOG,
    ['tyre.dat', lone('tyre.dat', 'Tyre 30 x 14', [30, 30, 8], {category: 'wheel', tyre: true})],
    ['plug.dat', lone('plug.dat', 'Electric Plug', [4, 4, 8])],
    ['ball.dat', lone('ball.dat', 'Ball 52mm', [65, 65, 65])]]);

test('a tyre rides on the rim inside it, a plug on the beam it sits in; a ball is left a toy', () => {
    const model = {version: 1, parts: [
        {id: 'beam', part: '32524.dat', position: [0, 0, 0], rotation: I},
        {id: 'axle', part: '3706.dat', position: [0, -60, 40], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0]},
        {id: 'rim', part: '39367p01.dat', position: [0, -60, 80], rotation: I},
        {id: 'tyre', part: 'tyre.dat', position: [0, -60, 82], rotation: I},
        {id: 'plug', part: 'plug.dat', position: [0, 0, 50], rotation: I},
        {id: 'ball', part: 'ball.dat', position: [400, 0, 0], rotation: I}]};
    const mech = compile(model, catalog, {version: 2});
    const bodyOf = id => mech.bodies.find(b => b.parts.includes(id)).id;
    assert.equal(bodyOf('tyre'), bodyOf('rim'), 'the tyre turns with its rim');
    assert.equal(bodyOf('plug'), bodyOf('beam'), 'the plug stays in the beam');
    assert.notEqual(bodyOf('ball'), bodyOf('beam'), 'the ball is a body of its own');
});
