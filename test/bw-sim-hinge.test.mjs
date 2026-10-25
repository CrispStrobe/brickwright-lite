// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The hinge tool's pure half (editor/snap.js hingeCandidates): where a selection turns on the
// model about one round connection line, carrying what hangs off it. Beams lie flat (holes
// along LDraw y, -y up) with pins standing in them; a Beam 3 arm on a pin at the end of a
// Beam 7, a second arm on the first.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hingeCandidates, turnAboutLine} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const UP = [0, -1, 0, 1, 0, 0, 0, 0, 1]; // a pin's or an axle's own x along y
const beam7 = {id: 'b7', part: '32524.dat', position: [0, 0, 0], rotation: I};
const pin = (id, z, y) => ({id, part: '2780.dat', position: [0, y, z], rotation: UP});
const beam3 = (id, z, y) => ({id, part: '32523.dat', position: [0, y, z], rotation: I});

// b7 (holes z -60..60) holds a free pin at h0 and pin p1 at h6; the arm (holes z 60, 80, 100)
// sits on p1; pin p2 in the arm's far hole carries a second arm `c` (holes z 100, 120, 140).
const ARM = {version: 1, parts: [beam7, pin('p0', -60, -10), pin('p1', 60, -10), beam3('arm', 80, -20), pin('p2', 100, -30), beam3('c', 120, -40)]};
const sorted = ids => ids.slice().sort();

test('an arm on one pin: the first hinge is that pin\'s line and the arm carries what hangs off it', () => {
    const hinges = hingeCandidates(ARM, CATALOG, ['arm']);
    assert.equal(hinges.length, 2, JSON.stringify(hinges.map(h => h.moving)));
    const [first, second] = hinges;
    assert.deepEqual(sorted(first.moving), ['arm', 'c', 'p2'], 'the arm, its pin and the second arm turn');
    assert.deepEqual(first.fixed, ['p1'], 'the pin it turns on stays with the beam');
    assert.ok(Math.abs(Math.abs(first.axis[1]) - 1) < 1e-9 && Math.abs(first.point[2] - 60) < 1e-9, `the line through h6 along y: ${first.point}`);
    assert.equal(first.moving[0], 'arm', 'the selection first');
    // The other way round: on p2's line the arm turns the beam with it, and `c` stays.
    assert.deepEqual(sorted(second.moving), ['arm', 'b7', 'p0', 'p1']);
    assert.deepEqual(second.fixed, ['p2']);
});

test('a hinge through several parts: the second arm alone, or a pin with its arm', () => {
    const [h] = hingeCandidates(ARM, CATALOG, ['c']);
    assert.deepEqual(h.moving, ['c']);
    const [h2] = hingeCandidates(ARM, CATALOG, ['arm', 'p2']);
    assert.deepEqual(sorted(h2.moving), ['arm', 'c', 'p2']);
});

test('turned on its hinge, the arm\'s hole stays on the pin', () => {
    const [h] = hingeCandidates(ARM, CATALOG, ['arm']);
    const byId = new Map(ARM.parts.map(p => [p.id, p]));
    const turned = turnAboutLine(h.moving.map(id => byId.get(id)), h.axis, h.point, Math.PI / 2);
    const model = {version: 1, parts: ARM.parts.map(p => turned.find(t => t.id === p.id) || p)};
    // Still the same hinge after a quarter turn: the arm still sits on p1 and still carries c.
    const [again] = hingeCandidates(model, CATALOG, ['arm']);
    assert.deepEqual(sorted(again.moving), ['arm', 'c', 'p2']);
    assert.deepEqual(again.fixed, ['p1']);
    const arm = model.parts.find(p => p.id === 'arm');
    assert.ok(Math.abs(arm.position[0]) > 19 && Math.abs(arm.position[2] - 60) < 1e-6, `the arm swung round: ${arm.position}`);
});

test('an arm held by two pins has no hinge; a loose part has none either', () => {
    const rigid = {version: 1, parts: [beam7, pin('q0', 20, -10), pin('q1', 60, -10), beam3('arm', 40, -20)]};
    assert.deepEqual(hingeCandidates(rigid, CATALOG, ['arm']), []);
    const loose = {version: 1, parts: [beam7, beam3('far', 400, 0)]};
    assert.deepEqual(hingeCandidates(loose, CATALOG, ['far']), []);
    assert.deepEqual(hingeCandidates(ARM, CATALOG, ['nope']), []);
});

test('a gear on an axle in a round hole: selecting the gear turns gear and axle', () => {
    const model = {version: 1, parts: [beam7,
        {id: 'ax', part: '4519.dat', position: [0, -20, 0], rotation: UP},
        {id: 'g', part: '3648.dat', position: [0, -40, 0], rotation: [1, 0, 0, 0, 0, 1, 0, -1, 0]}]};
    const hinges = hingeCandidates(model, CATALOG, ['g']);
    assert.equal(hinges.length, 1);
    assert.deepEqual(hinges[0].moving, ['g', 'ax']);
    assert.deepEqual(hinges[0].fixed, ['b7']);
});

test('a side bigger than maxParts is not offered', () => {
    assert.equal(hingeCandidates(ARM, CATALOG, ['arm'], {maxParts: 2}).length, 0);
    assert.equal(hingeCandidates(ARM, CATALOG, ['arm'], {maxParts: 3}).length, 1);
});

test('a selection bigger than maxParts is not searched', () => {
    assert.deepEqual(hingeCandidates(ARM, CATALOG, ['arm', 'c', 'p2'], {maxParts: 2}), []);
});
