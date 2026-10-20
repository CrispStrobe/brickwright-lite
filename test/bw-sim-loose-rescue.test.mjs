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

test(`a model from elsewhere: pins further off than ${RESCUE.lateralLdu} LDU are not joined`, () => {
    const {issues} = prepareModel(twoBeams(RESCUE.lateralLdu + 1, false), CATALOG);
    assert.ok(codes(issues).includes('loose-part'));
});

test('a model from elsewhere: two parts of different bodies that overlap as built never collide with each other', () => {
    // Beam B 10 LDU beside beam A: their 18 LDU wide boxes overlap by 8 LDU (3.2 mm); nothing joins them.
    const text = own => [
        '0 Overlap', ...(own ? ['0 Author: Brickwright'] : []),
        '1 71 0 0 0 1 0 0 0 1 0 0 0 1 32524.dat',
        '1 72 10 0 0 1 0 0 0 1 0 0 0 1 32524.dat'
    ].join('\n');
    const pairOf = m => {
        const [a, b] = m.bodies.filter(x => x.motion === 'dynamic').map(x => x.id).sort();
        return {a, b, whole: m.noCollide.some(([x, y]) => x === a && y === b), parts: (m.noCollideParts || []).find(([x, y]) => x === a && y === b)};
    };
    const foreign = pairOf(prepareModel(text(false), CATALOG).mechanism);
    assert.ok(foreign.whole, 'the pair is a noCollide pair');
    assert.ok(foreign.parts && foreign.parts[2].length === 1, 'filtered part by part: the two overlapping beams');
    const own = pairOf(prepareModel(text(true), CATALOG).mechanism);
    assert.ok(!own.whole && !own.parts, 'our own file: they collide (the overlap is the builder\'s to see)');
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
