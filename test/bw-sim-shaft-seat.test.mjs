// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// When a shaft (pin, axle, axle pin, towball stub) is held by a hole: the
// connector matcher's rule (mech/graph.js shaftEngagement), on the real parts.
// A shaft seats when it engages at least MIN_ENGAGE_LDU of the hole along their
// common axis — a partly inserted axle holds, as in reality — and never when it
// would reach past the bottom of a blind hole. Positions are worked out here from
// the parts' LDraw dimensions (LDU), not read back from the matcher.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildGraph, MIN_ENGAGE_LDU} from '../overlay/scratch-gui/src/lib/bw-sim/mech/graph.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {snapCandidates} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Row-major rotation taking the part's +x to model +y (pins, axles and the towball lie along x). */
const X_TO_Y = [0, -1, 0, 1, 0, 0, 0, 0, 1];

const edgesBetween = (parts, a, b) => buildGraph({version: 1, parts}, CATALOG).edges
    .filter(e => (e.a.part === a && e.b.part === b) || (e.a.part === b && e.b.part === a))
    .map(e => `${e.a.part}.${e.a.connector}<-${e.b.part}.${e.b.connector}:${e.kind}`);

test('the rule\'s threshold sits between a face contact and the shortest real seat', () => {
    // Shortest hole in the catalogue: a Technic plate's, through its 8 LDU (3.2 mm) thickness
    // (the thin liftarm, half bush and bevel gear hub are 10). The part deriver
    // (scripts/derive-part-meta.mjs selfCheck) admits no shallower hole.
    const shortest = Math.min(...[...CATALOG.values()].flatMap(m => m.connectors)
        .filter(c => c.type === 'pinhole' || c.type === 'axlehole').map(c => c.length));
    assert.equal(shortest, 8);
    assert.ok(MIN_ENGAGE_LDU > 0.5 && MIN_ENGAGE_LDU <= shortest);
});

test('the towball 2736: its 17.5 LDU stub holds in a full 20 LDU axle hole, not when barely in', () => {
    // 60483 beam 2: axle hole 'a' at the origin along y, y -10..10. The towball's stub 'a' runs
    // x 0..17.5 in its own frame; turned onto y and placed at y = -10 it fills y -10..7.5.
    const beam = {id: 'beam', part: '60483.dat', position: [0, 0, 0], rotation: I3};
    const seated = {id: 'tb', part: '2736.dat', position: [0, -10, 0], rotation: X_TO_Y};
    assert.deepEqual(edgesBetween([beam, seated], 'beam', 'tb'), ['beam.a<-tb.a:rigid']);
    // Half in (engages 8.75): still held.
    assert.deepEqual(edgesBetween([beam, {...seated, position: [0, -18.75, 0]}], 'beam', 'tb'), ['beam.a<-tb.a:rigid']);
    // Engages 5 LDU (y -22.5..-5): not held.
    assert.deepEqual(edgesBetween([beam, {...seated, position: [0, -22.5, 0]}], 'beam', 'tb'), []);
    // The compiled mechanism welds them into one body.
    const mech = compile({version: 1, parts: [beam, seated]}, CATALOG, {ground: false});
    assert.equal(mech.bodies.length, 1);
});

test('a 3L pin half pushed into a beam holds; one that only touches its face does not', () => {
    const beam = {id: 'beam', part: '32523.dat', position: [0, 0, 0], rotation: I3}; // hole h1 at the origin, y -10..10
    const pin = y => ({id: 'pin', part: '6558.dat', position: [0, y, 0], rotation: X_TO_Y}); // 60 LDU long
    assert.deepEqual(edgesBetween([beam, pin(-20)], 'beam', 'pin'), ['beam.h1<-pin.p:rigid']); // full seat (as before)
    assert.deepEqual(edgesBetween([beam, pin(-30)], 'beam', 'pin'), ['beam.h1<-pin.p:rigid']); // y -60..0: 10 in
    assert.deepEqual(edgesBetween([beam, pin(-33)], 'beam', 'pin'), []); // 7 in
    assert.deepEqual(edgesBetween([beam, pin(-40)], 'beam', 'pin'), []); // ends at the face
});

test('a pin 3/4 (32002) seats its short end in a thin liftarm\'s 10 LDU hole', () => {
    // 6632 thin liftarm 1 x 3: pinhole h1 at (0, 0, 20) along y, y -5..5. 32002's pin runs x -20..10.
    const arm = {id: 'arm', part: '6632.dat', position: [0, 0, 0], rotation: I3};
    const pin = y => ({id: 'pin', part: '32002.dat', position: [0, y, 20], rotation: X_TO_Y});
    assert.deepEqual(edgesBetween([arm, pin(-5)], 'arm', 'pin'), ['arm.h1<-pin.p:hinge']); // y -25..5: whole hole
    assert.deepEqual(edgesBetween([arm, pin(-15)], 'arm', 'pin'), []); // y -35..-5: at the face
});

test('a blind hole: a pin seats up to the bottom and never past it', () => {
    // Colour sensor 37308: h0 at (20, 20, 0) along x, segment x 10..30, bottom at x = 10 (LDraw
    // connhol3 opens at x = 30). A 2L pin (x -20..20 in its frame) at x = 30 fills x 10..50.
    const sensor = {id: 's', part: '37308.dat', position: [0, 0, 0], rotation: I3};
    const pin2 = x => ({id: 'pin', part: '2780.dat', position: [x, 20, 0], rotation: I3});
    assert.deepEqual(edgesBetween([sensor, pin2(30)], 's', 'pin'), ['s.h0<-pin.p:rigid']);
    assert.deepEqual(edgesBetween([sensor, pin2(40)], 's', 'pin'), ['s.h0<-pin.p:rigid']); // 10 in
    assert.deepEqual(edgesBetween([sensor, pin2(20)], 's', 'pin'), []); // x 0..40: 10 past the bottom
    // A 3L pin centred on the hole reaches 20 LDU past the bottom, into the sensor body.
    const pin3 = x => ({id: 'pin', part: '6558.dat', position: [x, 20, 0], rotation: I3});
    assert.deepEqual(edgesBetween([sensor, pin3(40)], 's', 'pin'), ['s.h0<-pin.p:rigid']); // x 10..70
    assert.deepEqual(edgesBetween([sensor, pin3(20)], 's', 'pin'), []);
    // The other side's hole is mirrored: h1 x -30..-10, bottom at -10.
    assert.deepEqual(edgesBetween([sensor, {...pin2(-30), position: [-30, 20, 0]}], 's', 'pin'), ['s.h1<-pin.p:rigid']);
    assert.deepEqual(edgesBetween([sensor, {...pin2(-20), position: [-20, 20, 0]}], 's', 'pin'), []);
});

test('the editor snaps the towball into an axle hole (one rule with the compiler)', () => {
    const model = {version: 1, parts: [{id: 'beam', part: '60483.dat', position: [0, 0, 0], rotation: I3}]};
    const cands = snapCandidates({model, catalog: CATALOG, part: '2736.dat', pose: {position: [0, -16, 0], rotation: X_TO_Y}});
    const into = cands.find(c => c.pairs.some(p => p.moving === 'a' && p.fixed.part === 'beam' && p.fixed.connector === 'a'));
    assert.ok(into, `no candidate seats the stub: ${JSON.stringify(cands.map(c => c.pairs))}`);
    const placed = {id: 'tb', part: '2736.dat', position: into.position, rotation: into.rotation};
    assert.deepEqual(edgesBetween([model.parts[0], placed], 'beam', 'tb'), ['beam.a<-tb.a:rigid']);
});
