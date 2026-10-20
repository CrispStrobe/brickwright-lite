// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Models from elsewhere (docs/ROBOT-LAB-REAL-MODELS.md): a group that connects to nothing is joined by its nearest
// pin-in-hole near-miss (mech/loose-rescue.js), and parts that overlap as built never collide with each other
// (mech/collision-filter.js asBuiltOverlaps). Neither applies to our own files ('0 Author: Brickwright'): there a
// loose part is the builder's to fix.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {REPO} from './helpers/bw-integrated.mjs';

const SIM = path.join(REPO, 'overlay', 'scratch-gui', 'src/lib/bw-sim');
const {prepareModel, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {RESCUE} = await import(path.join(SIM, 'mech/loose-rescue.js'));
const {asBuiltOverlaps} = await import(path.join(SIM, 'mech/collision-filter.js'));
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta/parts.json'), 'utf8')));

// Two 7L beams (32524: holes along z, axes along y, 20 LDU deep), one above the other, and two friction pins
// (2780, turned onto y) meant to hold them at both ends — placed `off` LDU across the holes.
const twoBeams = (off, own) => [
    '0 Two beams',
    ...(own ? ['0 Author: Brickwright'] : []),
    '1 71 0 0 0 1 0 0 0 1 0 0 0 1 32524.dat',
    '1 72 0 20 0 1 0 0 0 1 0 0 0 1 32524.dat',
    `1 0 ${off} 10 -60 0 -1 0 1 0 0 0 0 1 2780.dat`,
    `1 0 ${off} 10 60 0 -1 0 1 0 0 0 0 1 2780.dat`
].join('\n');
const codes = issues => issues.map(i => i.code);

test('a model from elsewhere: pins 3 LDU off their holes still hold the beams together (seated-loosely, nothing loose)', () => {
    const {issues, mechanism} = prepareModel(twoBeams(3, false), CATALOG);
    assert.ok(!codes(issues).includes('loose-part'), `nothing loose: ${codes(issues)}`);
    assert.ok(codes(issues).includes('seated-loosely'), 'the Lab says it joined them where they almost fit');
    assert.equal(mechanism.bodies.filter(b => b.motion === 'dynamic').length, 1, 'friction pins: one rigid body');
});

test('our own file: the same pins 3 LDU off are loose (the builder fixes it)', () => {
    const {issues} = prepareModel(twoBeams(3, true), CATALOG);
    assert.ok(codes(issues).includes('loose-part'));
    assert.ok(!codes(issues).includes('seated-loosely'));
});

test(`a model from elsewhere: pins further off than ${RESCUE.lateralLdu} LDU make no near-miss joint, but what they touch holds them`, () => {
    const {issues} = prepareModel(twoBeams(RESCUE.lateralLdu + 1, false), CATALOG);
    assert.ok(!codes(issues).includes('loose-part'), `nothing loose: ${codes(issues)}`);
    const seated = issues.filter(i => i.code === 'seated-loosely');
    assert.ok(seated.some(i => /touch/.test(i.message)), 'welded where they touch (weldByContact), not seated on a near-miss');
    assert.ok(!seated.some(i => /almost fit/.test(i.message)));
});

test('as built: colliders of two bodies overlapping 3 mm are kept apart; touching, already filtered, or listed ones are not added', () => {
    const body = (id, x) => ({id, motion: 'dynamic', position: [x, 0, 0], rotation: [0, 0, 0, 1], massKg: 0.01,
        colliders: [{shape: 'box', halfExtents: [0.004, 0.004, 0.004], part: `${id}p`}], parts: [`${id}p`]});
    assert.deepEqual(asBuiltOverlaps([body('a', 0), body('b', 0.005)], []), [['a', 'b', [['ap', 'bp']]]], '3 mm deep');
    assert.deepEqual(asBuiltOverlaps([body('a', 0), body('b', 0.0079)], []), [], '0.1 mm: touching, not nested');
    assert.deepEqual(asBuiltOverlaps([body('a', 0), body('b', 0.005)], [['a', 'b']]), [], 'a whole noCollide pair');
    assert.deepEqual(asBuiltOverlaps([body('a', 0), body('b', 0.005)], [['a', 'b']], [['a', 'b', [['ap', 'bp']]]]), [], 'already kept apart');
    // An inverted entry ('collide': only the listed pairs meet): a listed pair still needs keeping apart.
    assert.deepEqual(asBuiltOverlaps([body('a', 0), body('b', 0.005)], [['a', 'b']], [['a', 'b', [['ap', 'bp']], 'collide']]),
        [['a', 'b', [['ap', 'bp']]]]);
});

test('an unknown file placed many times is one issue (a cable is thousands of segment lines), with its count and first lines', () => {
    const lines = ['0 Cable', '1 71 0 0 0 1 0 0 0 1 0 0 0 1 32524.dat'];
    for (let i = 0; i < 30; i++) lines.push(`1 0 0 ${-10 - i} 0 1 0 0 0 1 0 0 0 1 zz-segment.dat`);
    const {issues} = prepareModel(lines.join('\n'), CATALOG);
    const unknown = issues.filter(i => i.code === 'unknown-part');
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0].count, 30);
    assert.equal(unknown[0].line, 3);
    assert.equal(unknown[0].lines.length, 20);
    assert.match(unknown[0].message, /and 29 more/);
});
