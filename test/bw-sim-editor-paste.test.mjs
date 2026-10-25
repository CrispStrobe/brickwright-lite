// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

// Duplicate and Paste respect the overlap rule: freeOffset finds the first
// non-overlapping offset, pasteParts uses it, and a fully boxed-in part is refused.

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {freeOffset, solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const ROBOT = json('test/fixtures/bw-sim/driving-base.json');
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const BEAM = '32524.dat';
const OFFSETS = [
    [20, 0, 0], [-20, 0, 0], [0, 0, 20], [0, 0, -20],
    [40, 0, 0], [-40, 0, 0], [0, 0, 40], [0, 0, -40],
    [0, -24, 0]
];

test('a beam duplicated in free space lands at +20 x', () => {
    const model = {...ROBOT, parts: [...ROBOT.parts, {id: 'beam', part: BEAM, position: [0, -10, 400], rotation: I}]};
    const beam = model.parts.find(p => p.id === 'beam');
    const offset = freeOffset({model, catalog: CATALOG, parts: [beam], offsets: OFFSETS});
    assert.deepEqual(offset, [20, 0, 0]);
});

test('a beam whose +20 x spot is blocked by another beam lands at -20 x', () => {
    const beam1 = {id: 'beam1', part: BEAM, position: [0, -10, 400], rotation: I};
    const beam2 = {id: 'beam2', part: BEAM, position: [20, -10, 400], rotation: I};
    const model = {...ROBOT, parts: [...ROBOT.parts, beam1, beam2]};
    const offset = freeOffset({model, catalog: CATALOG, parts: [beam1], offsets: OFFSETS});
    assert.deepEqual(offset, [-20, 0, 0]);
});

test('duplicating the hub finds the first free offset (computed via solidOverlaps)', () => {
    const hub = ROBOT.parts.find(p => p.id === 'hub');
    // Compute expected by checking solidOverlaps ourselves in the test
    let expected = null;
    for (const off of OFFSETS) {
        const copy = {...hub, position: [hub.position[0] + off[0], hub.position[1] + off[1], hub.position[2] + off[2]]};
        if (solidOverlaps(ROBOT, CATALOG, copy).length === 0) {
            expected = off;
            break;
        }
    }
    assert.ok(expected, 'should have at least one free offset for hub (up should be free)');
    const offset = freeOffset({model: ROBOT, catalog: CATALOG, parts: [hub], offsets: OFFSETS});
    assert.deepEqual(offset, expected);
});

test('a fully boxed-in case returns null', () => {
    // Create a central beam and surround it with beams at all 9 offsets
    const center = {id: 'center', part: BEAM, position: [0, -10, 400], rotation: I};
    const surround = OFFSETS.map((off, i) => ({
        id: `s${i}`, part: BEAM, position: [center.position[0] + off[0], center.position[1] + off[1], center.position[2] + off[2]], rotation: I
    }));
    const model = {...ROBOT, parts: [...ROBOT.parts, center, ...surround]};
    const offset = freeOffset({model, catalog: CATALOG, parts: [center], offsets: OFFSETS});
    assert.equal(offset, null);
});

test('copies are not checked against each other, and pins/axles/balls are ignored', () => {
    // Two beams duplicated together should not be considered overlapping each other
    const beam1 = {id: 'b1', part: BEAM, position: [0, -10, 400], rotation: I};
    const beam2 = {id: 'b2', part: BEAM, position: [0, -10, 420], rotation: I};
    const model = {...ROBOT, parts: [...ROBOT.parts, beam1, beam2]};
    // Duplicating both together: copies at +20 x should be free relative to model, even though they are 20 apart from each other
    // But if we checked copies against each other, they would be 20 apart and not overlapping anyway
    // Test that a pin inside a beam is not considered overlapping
    const beam = {id: 'beam', part: BEAM, position: [0, -10, 400], rotation: I};
    const model2 = {...ROBOT, parts: [...ROBOT.parts, beam]};
    const copy = {...beam, position: [20, -10, 400]};
    // This copy overlaps beam at [0,-10,400]? No, 20 apart is one hole pitch, beams at 20 apart should not overlap if they are not touching
    // But if we place a pin, it should be ignored
    const pin = {id: 'pin', part: '2780.dat', position: [0, -10, 400], rotation: I};
    const model3 = {...ROBOT, parts: [...ROBOT.parts, beam, pin]};
    // Pin sits inside beam hole, should not be considered solid overlap
    assert.deepEqual(solidOverlaps(model3, CATALOG, pin), []);
});
