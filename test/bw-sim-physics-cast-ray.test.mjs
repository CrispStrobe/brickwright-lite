// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Jolt physics core — castRay (overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js).
// Proves the task P3 §1 contract: ray queries hit both static and dynamic
// bodies, return distance/point/normal in world frame, miss as null, and
// respect ignoreBodies. Expected values from first principles.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJolt, createPhysicsCore } from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';

const J = await loadJolt();

const DIST_EPS = 1e-4;
const NORMAL_EPS = 1e-3;

const groundOnly = () => ({
    version: 1, gravity: [0, -9.81, 0],
    bodies: [
        { id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{ shape: 'box', halfExtents: [5, 0.01, 5] }], parts: [] },
    ], joints: [], gears: [], diagnostics: [],
});

const mixedBodies = () => ({
    version: 1, gravity: [0, 0, 0],
    bodies: [
        { id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{ shape: 'box', halfExtents: [5, 0.01, 5] }], parts: [] },
        { id: 'dynBox', motion: 'dynamic', position: [0, 0.5, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{ shape: 'box', halfExtents: [0.1, 0.1, 0.1] }], parts: [] },
    ], joints: [], gears: [], diagnostics: [],
});

test('castRay: down onto ground from 0.1 m returns 0.1 +/- 1e-4', () => {
    const core = createPhysicsCore(J, groundOnly());
    const hit = core.castRay([0, 0.1, 0], [0, -1, 0], 1, {});
    assert.ok(hit !== null, 'should hit ground');
    assert.ok(Math.abs(hit.distance - 0.1) < DIST_EPS, `distance ${hit.distance} vs 0.1`);
    assert.equal(hit.bodyId, 'ground');
    assert.ok(Math.abs(hit.point[0] - 0) < DIST_EPS && Math.abs(hit.point[1] - 0) < DIST_EPS && Math.abs(hit.point[2] - 0) < DIST_EPS,
        `point ${hit.point} should be (0, 0, 0)`);
    // Top face normal points up (+y) in world frame.
    assert.ok(hit.normal[1] > 1 - NORMAL_EPS, `normal ${hit.normal} y should be +1`);
    assert.ok(Math.abs(hit.normal[0]) < NORMAL_EPS && Math.abs(hit.normal[2]) < NORMAL_EPS, `normal ${hit.normal} xz should be 0`);
    core.destroy();
});

test('castRay: ray that misses returns null', () => {
    const core = createPhysicsCore(J, groundOnly());
    const hit = core.castRay([0, 0.1, 0], [1, 0, 0], 0.05, {});
    assert.equal(hit, null);
    core.destroy();
});

test('castRay: ignored body is skipped', () => {
    const core = createPhysicsCore(J, groundOnly());
    const hit = core.castRay([0, 0.1, 0], [0, -1, 0], 1, { ignoreBodies: ['ground'] });
    assert.equal(hit, null);
    core.destroy();
});

test('castRay: hits a dynamic body (static AND dynamic)', () => {
    const core = createPhysicsCore(J, mixedBodies());
    // From y=1 down 2 m: dynBox top is at y=0.6 (centre 0.5 + half 0.1), ground top at 0.
    // Nearest is dynBox at distance 0.4.
    const hit = core.castRay([0, 1, 0], [0, -1, 0], 2, {});
    assert.ok(hit !== null, 'should hit dynBox');
    assert.equal(hit.bodyId, 'dynBox');
    assert.ok(Math.abs(hit.distance - 0.4) < DIST_EPS, `distance ${hit.distance} vs 0.4`);
    assert.ok(hit.normal[1] > 1 - NORMAL_EPS, `dynBox top normal ${hit.normal} should be +y`);
    core.destroy();
});

test('castRay: ignoring the dynamic body falls through to ground', () => {
    const core = createPhysicsCore(J, mixedBodies());
    const hit = core.castRay([0, 1, 0], [0, -1, 0], 2, { ignoreBodies: ['dynBox'] });
    assert.ok(hit !== null, 'should hit ground after ignoring dynBox');
    assert.equal(hit.bodyId, 'ground');
    assert.ok(Math.abs(hit.distance - 1) < DIST_EPS, `distance ${hit.distance} vs 1`);
    core.destroy();
});

test('castRay: direction is normalised (non-unit input)', () => {
    const core = createPhysicsCore(J, groundOnly());
    const hit = core.castRay([0, 0.1, 0], [0, -10, 0], 1, {});
    assert.ok(hit !== null);
    assert.ok(Math.abs(hit.distance - 0.1) < DIST_EPS, `distance ${hit.distance} vs 0.1`);
    core.destroy();
});

test('castRay: invalid args throw', () => {
    const core = createPhysicsCore(J, groundOnly());
    assert.throws(() => core.castRay([0, 0], [0, -1, 0], 1, {}), /origin must be Vec3/);
    assert.throws(() => core.castRay([0, 0.1, 0], [0, 0, 0], 1, {}), /non-zero/);
    assert.throws(() => core.castRay([0, 0.1, 0], [0, -1, 0], 0, {}), /positive/);
    assert.throws(() => core.castRay([0, 0.1, 0], [0, -1, 0], -1, {}), /positive/);
    // After destroy, castRay is refused.
    core.destroy();
    assert.throws(() => core.castRay([0, 0.1, 0], [0, -1, 0], 1, {}), /destroyed/);
});
