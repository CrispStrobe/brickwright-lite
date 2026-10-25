// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// System clutch in the Robot Lab (kinds/stud.js; parts derived by scripts/derive-part-meta.mjs):
// a stud seated in an anti-stud cell or in an underside tube is a rigid edge, so stacked bricks
// and plates compile to one body; the editor's magnet snaps a brick onto studs. The parts are
// the shipped catalogue's (bw-sim/part-meta/parts.json), placed as LDraw places them: a brick's
// origin is the centre of its top face, -y is up, a brick is 24 LDU tall and a plate 8.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {buildGraph} from '../overlay/scratch-gui/src/lib/bw-sim/mech/graph.js';
import {snapCandidates} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {BUILTIN_KINDS} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js';
import {ConnectorKindRegistry} from '../overlay/scratch-gui/src/lib/bw-sim/registry/kinds.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Part +x onto model +z (a pin lies along x). */
const X_TO_Z = [0, 0, -1, 0, 1, 0, 1, 0, 0];
/** Part +y onto model +z (a beam's holes run along y). */
const Y_TO_Z = [1, 0, 0, 0, 0, -1, 0, 1, 0];

const model = parts => ({version: 1, parts: parts.map(([id, part, position, rotation = I3]) => ({id, part, position, rotation}))});
const bodiesOf = m => compile(m, CATALOG, {ground: false}).bodies.map(b => b.parts.slice().sort());
const edges = (m, kinds) => buildGraph(m, CATALOG, [], kinds).edges.map(e => `${e.a.part}.${e.a.connector}-${e.b.part}.${e.b.connector}:${e.kind}`);

test('two 2 x 4 bricks stacked are one body: eight studs clutch', () => {
    const stacked = model([['a', '3001.dat', [0, 0, 0]], ['b', '3001.dat', [0, -24, 0]]]);
    assert.deepEqual(bodiesOf(stacked), [['a', 'b']]);
    const e = edges(stacked);
    assert.equal(e.length, 8, e.join(' '));
    assert.ok(e.every(x => x.endsWith(':rigid')), e.join(' '));
    // A stack is a build that could exist: the lower brick's studs sit in the upper one's hollow underside.
    assert.deepEqual(solidOverlaps(stacked, CATALOG, stacked.parts[1]), []);
    // One stud lower (the bricks 1 LDU apart) nothing is seated: two bodies.
    assert.equal(bodiesOf(model([['a', '3001.dat', [0, 0, 0]], ['b', '3001.dat', [0, -25, 0]]])).length, 2);
    // Half a stud off the grid: no clutch either.
    assert.equal(bodiesOf(model([['a', '3001.dat', [0, 0, 0]], ['b', '3001.dat', [10, -24, 0]]])).length, 2);
});

test('a plate on a brick, one stud over, is one body by the studs it covers', () => {
    const m = model([['brick', '3001.dat', [0, 0, 0]], ['plate', '3020.dat', [20, -8, 0]]]);
    assert.deepEqual(bodiesOf(m), [['brick', 'plate']]);
    // The plate covers three of the brick's four stud columns: 6 studs held.
    assert.equal(edges(m).length, 6);
    // A tile has no studs: nothing holds a brick on it.
    assert.equal(bodiesOf(model([['tile', '87079.dat', [0, 0, 0]], ['brick', '3001.dat', [0, -24, 0]]])).length, 2);
});

test('a stud in an underside tube is clutch too, through the registered tube kind', () => {
    // A 1 x 1 plate pushed into the tube of a 2 x 2 brick (the half-stud offset).
    // The plate's stud base on the brick's bottom face (y 24): the plate hangs below the brick.
    const m = model([['brick', '3003.dat', [0, 0, 0]], ['plate', '3024.dat', [0, 24, 0]]]);
    const e = edges(m);
    assert.equal(e.length, 1, e.join(' '));
    assert.ok(e[0].includes('plate.s0') && e[0].includes('brick.t0') && e[0].endsWith(':rigid'), e[0]);
    assert.deepEqual(bodiesOf(m), [['brick', 'plate']]);
    // Without the tube kind in the registry the same build falls apart: the kind is what joins them.
    const noTube = {...BUILTIN_KINDS, connectors: new ConnectorKindRegistry(BUILTIN_KINDS.connectors.list().filter(k => k.kind !== 'tube'))};
    assert.deepEqual(edges(m, noTube), []);
});

test('a Technic brick 1 x 4 with holes takes studs and pins: a frictionless pin is a hinge to a beam', () => {
    // 3701 on the back row of a 2 x 4 plate's studs (z 10); a pin through its middle hole (z 0..20
    // at y -14) into the end hole of a beam 3 standing up behind it.
    const parts = [
        ['plate', '3020.dat', [0, 0, 0]],
        ['tb', '3701.dat', [0, -24, 10]],
        ['beam', '32523.dat', [0, -14, 30], Y_TO_Z]
    ];
    const hinge = model([...parts, ['pin', '3673.dat', [0, -14, 20], X_TO_Z]]);
    const mech = compile(hinge, CATALOG, {ground: false});
    const stack = mech.bodies.find(b => b.parts.includes('tb'));
    assert.ok(stack.parts.includes('plate'), 'the Technic brick sits on the plate by its anti-studs');
    // The beam turns against the stack: the frictionless pin is a hinge in each (both about z).
    assert.notEqual(mech.bodies.find(b => b.parts.includes('beam')).id, stack.id);
    assert.ok(mech.joints.length >= 1 && mech.joints.every(j => j.type === 'hinge' && Math.abs(Math.abs(j.axis[2]) - 1) < 1e-9),
        JSON.stringify(mech.joints.map(j => [j.type, j.axis])));
    // A friction pin holds: one body.
    const rigid = model([...parts, ['pin', '2780.dat', [0, -14, 20], X_TO_Z]]);
    assert.equal(compile(rigid, CATALOG, {ground: false}).bodies.length, 1);
});

test('the magnet snaps a brick onto studs, and a plate into a tube', () => {
    const base = model([['a', '3001.dat', [0, 0, 0]]]);
    // Dragged a little off, above the brick.
    const [best] = snapCandidates({model: base, catalog: CATALOG, part: '3001.dat', pose: {position: [3, -30, 2], rotation: I3}});
    assert.ok(best, 'a candidate');
    assert.deepEqual(best.position.map(v => Math.round(v * 1000) / 1000 + 0), [0, -24, 0]);
    assert.deepEqual(best.rotation, I3);
    assert.equal(best.pairs.length, 8);
    assert.ok(best.pairs.every(p => p.kind === 'rigid'));
    // A 1 x 1 plate under a 2 x 2 brick's tube.
    const brick = model([['b', '3003.dat', [0, 0, 0]]]);
    const cands = snapCandidates({model: brick, catalog: CATALOG, part: '3024.dat', pose: {position: [1, 28, -1], rotation: I3}});
    const intoTube = cands.find(c => c.pairs.some(p => p.fixed.connector === 't0'));
    assert.ok(intoTube, `no tube candidate among ${cands.map(c => c.pairs.map(p => p.fixed.connector).join('+')).join(', ')}`);
    assert.deepEqual(intoTube.position.map(v => Math.round(v * 1000) / 1000 + 0), [0, 24, 0]);
});
