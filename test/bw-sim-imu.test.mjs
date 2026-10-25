// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// IMU published by SimHubBridge (hub-bridge.js + sensors.js): pitch, roll,
// yaw, angular velocity, acceleration and faceUp from the hub body's pose
// and velocity. Proves the three cases from task P4 §1.
//
// SPIKE sign convention (documented here): the hub at rest with its display
// (top) up has pitch = 0, roll = 0, faceUp = top (0) and acceleration
// (0, 0, 1000) milli-g on the axis through its face. Pitch is rotation
// about the hub's right axis (X, east when level), positive when the nose
// (forward, -Z body, +Y spike) lifts up; roll is about the forward axis
// (Y spike, -Z body), positive when the right side lifts up. Yaw is
// clockwise positive seen from above, as for the driving base.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {SimHubBridge} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';

const J = await loadJolt();

const quatFromAxisAngle = (axis, deg) => {
    const rad = deg * Math.PI / 180;
    const s = Math.sin(rad / 2), c = Math.cos(rad / 2);
    const len = Math.hypot(...axis);
    const n = axis.map(v => v / len);
    return [n[0] * s, n[1] * s, n[2] * s, c];
};

const TOL_DEG = 2;
const TOL_G = 30;

test('hub at rest: pitch 0, roll 0, faceUp top, acceleration ~1000 on face axis', async () => {
    const mech = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], friction: 0.8},
            {id: 'hub', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.02, 0.01, 0.02]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
    };
    const core = createPhysicsCore(J, mech, {stepHz: 200});
    const hubState = new VirtualSpikeHubState();
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: 'hub', stepMs: 5});
    bridge.tick(5);
    const imu = hubState.data.imu;
    assert.ok(Math.abs(imu.pitch) < TOL_DEG, `pitch ${imu.pitch}`);
    assert.ok(Math.abs(imu.roll) < TOL_DEG, `roll ${imu.roll}`);
    assert.ok(Math.abs(imu.yaw) < TOL_DEG, `yaw ${imu.yaw}`);
    assert.equal(imu.faceUp, 0, `faceUp ${imu.faceUp} expected top (0)`);
    assert.ok(Math.abs(imu.acceleration.z - 1000) < TOL_G, `acc z ${imu.acceleration.z} expected 1000`);
    assert.ok(Math.abs(imu.acceleration.x) < TOL_G && Math.abs(imu.acceleration.y) < TOL_G, `acc xy ${imu.acceleration.x},${imu.acceleration.y}`);
    assert.ok(Math.abs(imu.angularVelocity.x) < 1 && Math.abs(imu.angularVelocity.y) < 1 && Math.abs(imu.angularVelocity.z) < 1, `angVel ${JSON.stringify(imu.angularVelocity)}`);
    bridge.dispose();
    core.destroy();
});

test('hub tilted nose-up 30°: pitch positive ~30, SPIKE sign documented', async () => {
    // Nose-up is a rotation about the hub's right axis (X, east) by +30°, lifting the front (forward, -Z body, +Y spike) up.
    // In this convention pitch is positive nose-up.
    const q = quatFromAxisAngle([1, 0, 0], 30);
    const mech = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], friction: 0.8},
            {id: 'hub', motion: 'dynamic', position: [0, 0.05, 0], rotation: q, massKg: 1, colliders: [{shape: 'box', halfExtents: [0.02, 0.01, 0.02]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
    };
    const core = createPhysicsCore(J, mech, {stepHz: 200});
    const hubState = new VirtualSpikeHubState();
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: 'hub', stepMs: 5});
    bridge.tick(5);
    const imu = hubState.data.imu;
    assert.ok(Math.abs(imu.pitch - 30) < TOL_DEG, `pitch ${imu.pitch} expected +30 nose-up`);
    assert.ok(Math.abs(imu.roll) < TOL_DEG, `roll ${imu.roll}`);
    // Gravity now has components on forward (Y spike) and up (Z spike): Y ~500, Z ~866 at 30°
    assert.ok(Math.abs(imu.acceleration.y - 500) < TOL_G, `acc y ${imu.acceleration.y} expected ~500`);
    assert.ok(Math.abs(imu.acceleration.z - 866) < TOL_G, `acc z ${imu.acceleration.z} expected ~866`);
    bridge.dispose();
    core.destroy();
});

test('hub rolled 90° on its side: faceUp side, acceleration on side axis', async () => {
    const q = quatFromAxisAngle([0, 0, 1], 90);
    const mech = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], friction: 0.8},
            {id: 'hub', motion: 'dynamic', position: [0, 0.05, 0], rotation: q, massKg: 1, colliders: [{shape: 'box', halfExtents: [0.02, 0.01, 0.02]}], parts: []},
        ],
        joints: [], gears: [], diagnostics: [],
    };
    const core = createPhysicsCore(J, mech, {stepHz: 200});
    const hubState = new VirtualSpikeHubState();
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: 'hub', stepMs: 5});
    bridge.tick(5);
    const imu = hubState.data.imu;
    assert.ok(Math.abs(Math.abs(imu.roll) - 90) < TOL_DEG, `roll ${imu.roll} expected ±90`);
    assert.notEqual(imu.faceUp, 0, `faceUp ${imu.faceUp} should not be top`);
    assert.ok(Math.abs(imu.acceleration.x - 1000) < TOL_G || Math.abs(imu.acceleration.x + 1000) < TOL_G, `acc x ${imu.acceleration.x} expected ±1000`);
    assert.ok(Math.abs(imu.acceleration.z) < TOL_G, `acc z ${imu.acceleration.z} should be ~0 when on side`);
    bridge.dispose();
    core.destroy();
});

test('hub spinning in place at 90 deg/s: angularVelocity.z ~90 and yaw advances', async () => {
    const mech = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            {id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{shape: 'box', halfExtents: [5, 0.01, 5]}], parts: [], friction: 0.8},
            {id: 'hub', motion: 'dynamic', position: [0, 0.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{shape: 'box', halfExtents: [0.02, 0.01, 0.02]}], parts: []},
        ],
        joints: [
            {id: 'j', type: 'hinge', body1: 'ground', body2: 'hub', point: [0, 0.05, 0], axis: [0, 1, 0], motor: {port: 'A', maxTorqueNm: 10, maxSpeedRadPerSec: 10}},
        ],
        gears: [], diagnostics: [],
    };
    const core = createPhysicsCore(J, mech, {stepHz: 200});
    const hubState = new VirtualSpikeHubState();
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: 'hub', stepMs: 5});
    hubState.motors.runAtSpeed('A', 90);
    for (let t = 0; t < 500; t += 5) bridge.tick(5);
    const imu = hubState.data.imu;
    assert.ok(Math.abs(imu.angularVelocity.z - 90) < 5, `angVel z ${imu.angularVelocity.z} expected 90`);
    assert.ok(Math.abs(imu.yaw) > 30, `yaw ${imu.yaw} should have advanced`);
    bridge.dispose();
    core.destroy();
});
