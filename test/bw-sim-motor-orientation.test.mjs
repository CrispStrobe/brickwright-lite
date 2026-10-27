// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A motor turned upside down drives the other way in the world (#1460). The motor's internal edge
// (mech/graph.js) carries rotation · shaft axis, but when the driven axle also turns in a bearing
// on the housing's body, a plain hinge joins the motor edge in one collinear group (mech/joints.js)
// and the group's FIRST member named the joint's axis and body order: the bearing's, whose axis
// follows the direction the axle was placed in, not the motor. The orrery's motor flipped 180°
// about z, its axle left as it was, kept the upright axis.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {dirToWorld} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';

const CATALOG = new Map(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts.map(p => [p.part, p]));
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const FLIP_Z = [-1, 0, 0, 0, -1, 0, 0, 0, 1]; // 180° about z: the motor's output faces down
const AX = [0, 1, 0, 1, 0, 0, 0, 0, -1]; // axle/pin local X -> LDraw Y
const FLAT = [0, 0, 1, 0, 1, 0, -1, 0, 0]; // beam holes vertical, length along X

const mul = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const apply = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

/**
 * A SPIKE medium motor whose output drives an 8L axle through its body into the centre hole of a
 * beam pinned under the housing (u0/u1): the axle turns in that hole, a plain hinge collinear with
 * the motor's, between the same two bodies. The assembly is placed by `R` (about the origin); the
 * axle — symmetric, so either way round is the same build — points along `axle` (+1: as placed by
 * R, -1: turned end for end). `bearing: false` leaves the beam and its pins out.
 */
const model = (R, {axle = 1, bearing = true} = {}) => {
    const parts = [
        {id: 'm', part: '54696p01.dat', position: [0, 0, 0], rotation: I3, port: 'A'},
        {id: 'axle', part: '3707.dat', position: [0, 0, 0], rotation: axle > 0 ? AX : mul(FLIP_Z, AX)},
    ];
    if (bearing) parts.push(
        {id: 'beam', part: '32524.dat', position: [0, 40, 0], rotation: FLAT},
        {id: 'p1', part: '2780.dat', position: [20, 30, 0], rotation: AX},
        {id: 'p2', part: '2780.dat', position: [-20, 30, 0], rotation: AX},
    );
    return {version: 1, parts: parts.map(p => ({...p, position: apply(R, p.position), rotation: mul(R, p.rotation)}))};
};

/** The world direction the axle turns (relative to the housing) for a positive motor command. */
const driveDirection = (R, opts) => {
    const mech = compile(model(R, opts), CATALOG, {ground: false});
    const motors = mech.joints.filter(j => j.motor);
    assert.equal(motors.length, 1);
    const [j] = motors;
    const axleBody = mech.bodies.find(b => b.parts.includes('axle')).id;
    assert.ok(j.body1 === axleBody || j.body2 === axleBody, 'the motor joint turns the axle');
    // The joint turns body2 about its axis relative to body1.
    return j.body2 === axleBody ? j.axis : j.axis.map(v => -v);
};

test('the bearing hinge is collinear with the motor and between the same bodies (the case of #1460)', () => {
    const mech = compile(model(I3), CATALOG, {ground: false});
    const housing = mech.bodies.find(b => b.parts.includes('beam'));
    assert.ok(housing.parts.includes('m'), 'the beam is pinned rigidly to the housing');
    assert.equal(mech.joints.length, 1, 'the bearing merges into the motor joint');
    assert.ok(mech.joints[0].motor);
});

test('the drive direction is the motor\'s: neither a collinear bearing nor the axle\'s direction changes it', () => {
    for (const R of [I3, FLIP_Z]) {
        const bare = driveDirection(R, {bearing: false});
        for (const axle of [1, -1]) {
            const dir = driveDirection(R, {axle});
            assert.ok(close(dir, bare), `${R === I3 ? 'upright' : 'flipped'}, axle ${axle}: ${dir} vs bare motor ${bare}`);
        }
    }
});

test('a motor turned upside down drives its output the other way in the world', () => {
    for (const axle of [1, -1]) {
        const up = driveDirection(I3, {axle: 1});
        // The flipped motor with its axle left pointing the way it did (the orrery of #1455), and turned.
        const flipped = driveDirection(FLIP_Z, {axle: -axle});
        assert.ok(close(up.map(Math.abs), dirToWorld([0, 1, 0]).map(Math.abs)), `vertical shaft: ${up}`);
        assert.ok(close(flipped, up.map(v => -v)), `axle ${axle}: upright ${up}, flipped ${flipped}: the output must reverse`);
    }
});
