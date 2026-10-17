// SPDX-License-Identifier: BSD-3-Clause
/**
 * rotateAboutSnap about a HORIZONTAL snap axis (editor/snap.js): an axle snapped into the
 * driving base's left motor output, whose axis is LDraw x. A quarter turn must keep the
 * axle on that line with its own axis unchanged (a shaft spun in its hole), four turns
 * must return the pose exactly, and two turns must not (the rotation really happens).
 * The first implementation rotated about world Y whatever the snap axis was; a vertical
 * hole hid that.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {snapCandidates, rotateAboutSnap} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';

const CATALOG = new Map(JSON.parse(readFileSync('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', 'utf8')).parts.map(p => [p.part, p]));
const BASE = JSON.parse(readFileSync('test/fixtures/bw-sim/driving-base.json', 'utf8'));
const EPS = 1e-9;

const col = (R, i) => [R[i], R[3 + i], R[6 + i]];
const near = (a, b, eps) => a.every((v, i) => Math.abs(v - b[i]) <= eps);

test('a quarter turn about a horizontal snap axis spins the axle in place', () => {
    const motor = BASE.parts.find(p => p.id === 'motorL');
    const model = {version: 1, parts: [motor]};
    const axle = BASE.parts.find(p => p.id === 'axleL');
    const [c0] = snapCandidates({model, catalog: CATALOG, part: '3705.dat', pose: {position: axle.position, rotation: axle.rotation}});
    assert.ok(c0, 'the axle snaps into the motor output');
    assert.ok(Math.abs(Math.abs(c0.axis[0]) - 1) < EPS, `snap axis ${c0.axis} is LDraw x (horizontal)`);
    const shaft = R => col(R, 0); // 3705's own axis is its local x
    const c1 = rotateAboutSnap(c0, 1);
    assert.ok(near(shaft(c1.rotation).map(Math.abs), shaft(c0.rotation).map(Math.abs), EPS), 'the axle keeps its axis');
    // Still on the snap line: same y and z (the line runs along x).
    assert.ok(near(c1.position.slice(1), c0.position.slice(1), 1e-6), `moved off the axis: ${c0.position} → ${c1.position}`);
    assert.ok(!near(c1.rotation, c0.rotation, 1e-6), 'a quarter turn changes the orientation');
    const c4 = [1, 2, 3].reduce(c => rotateAboutSnap(c, 1), c1);
    assert.ok(near(c4.rotation, c0.rotation, EPS) && near(c4.position, c0.position, 1e-6), 'four quarter turns return the pose');
    const c2 = rotateAboutSnap(c0, 2);
    assert.ok(!near(c2.rotation, c0.rotation, 1e-6), 'a half turn is a different pose');
    const det = R => R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
    for (const c of [c1, c2, c4]) assert.ok(Math.abs(det(c.rotation) - 1) < 1e-9, 'stays a proper rotation');
});
