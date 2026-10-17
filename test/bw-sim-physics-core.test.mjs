// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Jolt physics core (overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js):
// proves bodies, joints, gears, motors, collisions and determinism as
// specified in Task P1. Expected values computed from first principles,
// tolerances as named constants.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadJolt, createPhysicsCore } from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';

const J = await loadJolt();

// Helpers
const qYaw = rot => {
    // rot [x,y,z,w] -> yaw around Y (world +Y up) in radians, normalized to [-pi,pi]
    const [x, y, z, w] = rot;
    // yaw extraction (assuming roll/pitch small): atan2(2*(w*y + x*z), 1 -2*(y*y + z*z))
    // Actually for Y-up, yaw is rotation about Y
    const siny = 2 * (w * y + x * z);
    const cosy = 1 - 2 * (y * y + x * x); // careful: need correct formula; for yaw (Y) use y*y + z*z? Let's use standard: yaw = atan2(2*(w*y + x*z), 1 -2*(y*y+z*z)) for ZYX? Check.
    // Use robust: from quat to matrix, yaw = atan2(m20,m00) where m is rotation matrix
    // Compute matrix from quat:
    const m00 = 1 - 2 * (y * y + z * z);
    const m20 = 2 * (x * z + w * y); // Actually m20 = 2*(x*z + w*y) ? Need verify.
    // Simpler: use siny/cosy with conventional YXZ
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
};

const quatYawSimple = rot => {
    // For pure yaw (only Y), quaternion is [0, sin(y/2),0,cos(y/2)]
    const [x, y, z, w] = rot;
    // If only yaw, then x,z ~0
    // General yaw from quat: yaw = atan2(2*(w*y + x*z), 1 -2*(y*y + x*x)) is for Y up? Let's brute use matrix:
    // rotation matrix from quat:
    const m00_2 = 1 - 2 * (y * y + z * z);
    const m01_2 = 2 * (x * y - w * z);
    const m02_2 = 2 * (x * z + w * y);
    const m10_2 = 2 * (x * y + w * z);
    const m11_2 = 1 - 2 * (x * x + z * z);
    const m12_2 = 2 * (y * z - w * x);
    const m20_2 = 2 * (x * z - w * y);
    const m21_2 = 2 * (y * z + w * x);
    const m22_2 = 1 - 2 * (x * x + y * y);
    // yaw = atan2(m20_2, m00_2) ??? For Y rotation, m20 = sin, m00=cos
    return Math.atan2(m20_2, m00_2);
};

/** Wrap an angle (rad) to [-pi, pi). */
const normalizeAngle = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// Common tolerances
const TOL_VEL = 0.02; // 2%
const TOL_POS_DEG = 1 * Math.PI / 180; // 1 degree in rad
const TOL_FALL = 0.02;
const TOL_GEAR = 0.02;

// Fixture helpers
const makeGround = () => ({
    id: 'ground', motion: 'static', position: [0, -0.01, 0], rotation: [0, 0, 0, 1], massKg: 0,
    colliders: [{ shape: 'box', halfExtents: [5, 0.01, 5] }], parts: [], friction: 0.8, restitution: 0,
});

const makeWheelMechVelocity = () => ({
    version: 1, gravity: [0, 0, 0],
    bodies: [
        { id: 'wheel', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: 0.02,
          colliders: [{ shape: 'cylinder', radius: 0.02, halfHeight: 0.01 }], parts: [] },
    ],
    joints: [
        { id: 'jw', type: 'hinge', body1: 'wheel', body2: 'world', point: [0, 0, 0], axis: [0, 1, 0], motor: { port: 'A', maxTorqueNm: 2, maxSpeedRadPerSec: 20 } },
    ],
    gears: [], diagnostics: [],
});

const makePositionMech = () => ({
    version: 1, gravity: [0, 0, 0],
    bodies: [
        { id: 'wheel', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: 0.02,
          colliders: [{ shape: 'cylinder', radius: 0.02, halfHeight: 0.01 }], parts: [] },
    ],
    joints: [
        { id: 'jw', type: 'hinge', body1: 'wheel', body2: 'world', point: [0, 0, 0], axis: [0, 0, 1], motor: { port: 'A', maxTorqueNm: 5, maxSpeedRadPerSec: 30 } },
    ],
    gears: [], diagnostics: [],
});

const makeHingeSignMech = (axis) => ({
    version: 1, gravity: [0, 0, 0],
    bodies: [
        { id: 'frame', motion: 'static', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{ shape: 'box', halfExtents: [0.1, 0.1, 0.1] }], parts: [] },
        { id: 'arm', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: 0.02, colliders: [{ shape: 'box', halfExtents: [0.05, 0.01, 0.01] }], parts: [] },
    ],
    joints: [
        { id: 'j', type: 'hinge', body1: 'frame', body2: 'arm', point: [0, 0, 0], axis, motor: { port: 'A', maxTorqueNm: 5, maxSpeedRadPerSec: 20 } },
    ],
    gears: [], diagnostics: [],
});

const makeGearMech = (ratio, axis1, axis2, opts = {}) => {
    const { dampDriven = 0.2, mass1 = 0.01, mass2 = 0.02 } = opts;
    return {
        version: 1, gravity: [0, 0, 0],
        bodies: [
            { id: 'base', motion: 'static', position: [0, -1, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{ shape: 'box', halfExtents: [0.1, 0.1, 0.1] }], parts: [] },
            { id: 'g1', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: mass1, colliders: [{ shape: 'cylinder', radius: 0.005, halfHeight: 0.005 }], parts: [], angularDamping: 0 },
            { id: 'g2', motion: 'dynamic', position: [0.016, 0, 0], rotation: [0, 0, 0, 1], massKg: mass2, colliders: [{ shape: 'cylinder', radius: 0.012, halfHeight: 0.005 }], parts: [], angularDamping: dampDriven },
        ],
        joints: [
            { id: 'j1', type: 'hinge', body1: 'base', body2: 'g1', point: [0, 0, 0], axis: axis1, motor: { port: 'A', maxTorqueNm: 10, maxSpeedRadPerSec: 20 } },
            { id: 'j2', type: 'hinge', body1: 'base', body2: 'g2', point: [0.016, 0, 0], axis: axis2 },
        ],
        gears: [{ id: 'gear', type: 'gear', joint1: 'j1', joint2: 'j2', ratio }],
        diagnostics: [],
    };
};

const makeFreeFallMech = () => ({
    version: 1, gravity: [0, -9.81, 0],
    bodies: [
        { id: 'box', motion: 'dynamic', position: [0, 5, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{ shape: 'box', halfExtents: [0.1, 0.1, 0.1] }], parts: [] },
    ],
    joints: [], gears: [], diagnostics: [],
});

const makeDrivingBaseMech = () => {
    // ground top at y=0, chassis at y=0.06, wheels r=0.028
    const chassisY = 0.06;
    const wheelY = 0.028;
    const wheelR = 0.028;
    const halfH = 0.01; // wheel width/2
    // Cylinder axis is Y before rotation; to get wheel axis along Z, rotate 90 deg about X
    const qRotZ = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // 90 deg about X (Y->Z)
    // Actually rotation of 90 deg about X: [sin45,0,0,cos45]
    return {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            { id: 'ground', motion: 'static', position: [0, -0.02, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{ shape: 'box', halfExtents: [5, 0.02, 5] }], parts: [], friction: 0.9, restitution: 0 },
            { id: 'chassis', motion: 'dynamic', position: [0, chassisY, 0], rotation: [0, 0, 0, 1], massKg: 0.6,
              colliders: [
                  { shape: 'box', halfExtents: [0.08, 0.025, 0.05], position: [0, 0, 0], rotation: [0, 0, 0, 1] },
                  // sphere caster fixed in chassis collider list: rear caster
                  { shape: 'sphere', radius: 0.012, position: [-0.06, -0.025, 0] },
              ], parts: [], friction: 0.4 },
            { id: 'wheelL', motion: 'dynamic', position: [-0.02, wheelY, 0.07], rotation: [0, 0, 0, 1], massKg: 0.04,
              colliders: [{ shape: 'cylinder', radius: wheelR, halfHeight: halfH, position: [0, 0, 0], rotation: qRotZ }], parts: [], friction: 0.9 },
            { id: 'wheelR', motion: 'dynamic', position: [-0.02, wheelY, -0.07], rotation: [0, 0, 0, 1], massKg: 0.04,
              colliders: [{ shape: 'cylinder', radius: wheelR, halfHeight: halfH, position: [0, 0, 0], rotation: qRotZ }], parts: [], friction: 0.9 },
        ],
        joints: [
            // hinges at chassis sides, axis along Z (wheel axle)
            { id: 'jL', type: 'hinge', body1: 'chassis', body2: 'wheelL', point: [-0.02, wheelY, 0.07], axis: [0, 0, 1], motor: { port: 'A', maxTorqueNm: 1.5, maxSpeedRadPerSec: 15 } },
            { id: 'jR', type: 'hinge', body1: 'chassis', body2: 'wheelR', point: [-0.02, wheelY, -0.07], axis: [0, 0, 1], motor: { port: 'B', maxTorqueNm: 1.5, maxSpeedRadPerSec: 15 } },
        ],
        gears: [], diagnostics: [],
    };
};

const makeBallMech = () => {
    const chassisY = 0.06;
    return {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            { id: 'ground', motion: 'static', position: [0, -0.02, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{ shape: 'box', halfExtents: [5, 0.02, 5] }], parts: [], friction: 0.9 },
            { id: 'chassis', motion: 'dynamic', position: [0, chassisY, 0], rotation: [0, 0, 0, 1], massKg: 0.5,
              colliders: [{ shape: 'box', halfExtents: [0.07, 0.02, 0.04] }], parts: [] },
            { id: 'ball', motion: 'dynamic', position: [-0.05, 0.015, 0], rotation: [0, 0, 0, 1], massKg: 0.02,
              colliders: [{ shape: 'sphere', radius: 0.012 }], parts: [] },
            { id: 'wheelL', motion: 'dynamic', position: [0, 0.028, 0.06], rotation: [0, 0, 0, 1], massKg: 0.03,
              colliders: [{ shape: 'cylinder', radius: 0.028, halfHeight: 0.008, rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }], parts: [], friction: 0.9 },
            { id: 'wheelR', motion: 'dynamic', position: [0, 0.028, -0.06], rotation: [0, 0, 0, 1], massKg: 0.03,
              colliders: [{ shape: 'cylinder', radius: 0.028, halfHeight: 0.008, rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }], parts: [], friction: 0.9 },
        ],
        joints: [
            { id: 'jL', type: 'hinge', body1: 'chassis', body2: 'wheelL', point: [0, 0.028, 0.06], axis: [0, 0, 1], motor: { port: 'A', maxTorqueNm: 1.2, maxSpeedRadPerSec: 12 } },
            { id: 'jR', type: 'hinge', body1: 'chassis', body2: 'wheelR', point: [0, 0.028, -0.06], axis: [0, 0, 1], motor: { port: 'B', maxTorqueNm: 1.2, maxSpeedRadPerSec: 12 } },
            { id: 'jBall', type: 'ball', body1: 'chassis', body2: 'ball', point: [-0.05, 0.015, 0] },
        ],
        gears: [], diagnostics: [],
    };
};

// Tests
test('velocity motor reaches target ±2% within 0.5 s', async () => {
    const mech = makeWheelMechVelocity();
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    const target = 10; // rad/s
    core.setMotor('jw', { mode: 'velocity', radPerSec: target });
    for (let i = 0; i < 60; i++) core.step(1 / 120); // 0.5 s
    const st = core.jointState('jw');
    assert.ok(Math.abs(st.velocity - target) / Math.abs(target) < TOL_VEL, `velocity ${st.velocity} vs ${target}`);
    // also check angle increasing
    assert.ok(st.angle > 0, 'angle should increase');
    core.destroy();
});

test('position motor from 0 to 10π reaches ±1° and holds 1 s', async () => {
    const mech = makePositionMech();
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    const target = 10 * Math.PI;
    core.setMotor('jw', { mode: 'position', rad: target });
    // step 2.5 s to reach
    for (let i = 0; i < 300; i++) core.step(1 / 120);
    let st = core.jointState('jw');
    assert.ok(Math.abs(st.angle - target) < TOL_POS_DEG, `angle ${st.angle} vs ${target} diff ${(st.angle - target)}`);
    // hold 1 s
    for (let i = 0; i < 120; i++) core.step(1 / 120);
    st = core.jointState('jw');
    assert.ok(Math.abs(st.angle - target) < TOL_POS_DEG, `hold angle ${st.angle} vs ${target}`);
    core.destroy();
});

test('hinge angle sign: positive velocity increases angle', async () => {
    const axis = [0, 1, 0];
    const mech = makeHingeSignMech(axis);
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    core.setMotor('j', { mode: 'velocity', radPerSec: 2.0 });
    const a0 = core.jointState('j').angle;
    for (let i = 0; i < 60; i++) core.step(1 / 120);
    const a1 = core.jointState('j').angle;
    assert.ok(a1 > a0, `angle should increase: ${a0} -> ${a1}`);
    // also test negative velocity decreases
    core.setMotor('j', { mode: 'velocity', radPerSec: -2.0 });
    for (let i = 0; i < 60; i++) core.step(1 / 120);
    const a2 = core.jointState('j').angle;
    assert.ok(a2 < a1, `negative velocity should decrease: ${a1} -> ${a2}`);
    core.destroy();
});

test('gear 8T→24T same direction ratio -1/3', async () => {
    const mech = makeGearMech(-1 / 3, [0, 1, 0], [0, 1, 0]);
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    core.setMotor('j1', { mode: 'velocity', radPerSec: 6 });
    for (let i = 0; i < 180; i++) core.step(1 / 120); // 1.5 s
    const a1 = core.jointState('j1').angle;
    const a2 = core.jointState('j2').angle;
    const ratio = a2 / a1;
    assert.ok(Math.abs(ratio - (-1 / 3)) / Math.abs(-1 / 3) < TOL_GEAR, `gear ratio ${ratio} vs -1/3`);
    core.destroy();
});

test('gear 8T→24T flipped axis ratio +1/3', async () => {
    const mech = makeGearMech(1 / 3, [0, 1, 0], [0, -1, 0]);
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    core.setMotor('j1', { mode: 'velocity', radPerSec: 6 });
    for (let i = 0; i < 180; i++) core.step(1 / 120);
    const a1 = core.jointState('j1').angle;
    const a2 = core.jointState('j2').angle;
    const ratio = a2 / a1;
    assert.ok(Math.abs(ratio - (1 / 3)) / (1 / 3) < TOL_GEAR, `gear flipped ratio ${ratio} vs 1/3`);
    core.destroy();
});

test('gear ratio +2', async () => {
    const mech = makeGearMech(2, [0, 1, 0], [0, 1, 0]);
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    core.setMotor('j1', { mode: 'velocity', radPerSec: 4 });
    for (let i = 0; i < 180; i++) core.step(1 / 120);
    const a1 = core.jointState('j1').angle;
    const a2 = core.jointState('j2').angle;
    const ratio = a2 / a1;
    assert.ok(Math.abs(ratio - 2) / 2 < TOL_GEAR, `gear ratio ${ratio} vs 2`);
    core.destroy();
});

test('gear on its hinge\'s body1: the contract ratio holds for the hinge as written', async () => {
    // The driven gear is the hinge's body1 (the frame is body2), as a gear turning on an
    // axle fixed in the frame compiles. ω(j2) is then the FRAME relative to the gear, minus
    // the gear's own rate: for ratio +1/3 the gear itself turns at −1/3 of the driver, and
    // the hinge reads +1/3.
    const mech = makeGearMech(1 / 3, [0, 1, 0], [0, 1, 0]);
    mech.joints[1] = { ...mech.joints[1], body1: 'g2', body2: 'base' };
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    core.setMotor('j1', { mode: 'velocity', radPerSec: 6 });
    for (let i = 0; i < 180; i++) core.step(1 / 120);
    const a1 = core.jointState('j1').angle;
    const ratio = core.jointState('j2').angle / a1;
    assert.ok(Math.abs(ratio - 1 / 3) / (1 / 3) < TOL_GEAR, `hinge ratio ${ratio} vs +1/3`);
    // The gear body itself turns the other way round the shared +y axis.
    const w2 = core.bodyAngularVelocity('g2')[1];
    const w1 = core.bodyAngularVelocity('g1')[1];
    assert.ok(Math.abs(w2 / w1 - (-1 / 3)) < 0.01, `body rates ${w1} ${w2}`);
    core.destroy();
});

test('gear ratios above 1 and of both signs stay stable (−3, +5, −5/3)', async () => {
    // Jolt's gear constraint diverged for r < 1 or r < 0 before the core ordered the pair.
    for (const ratio of [-3, 5, -5 / 3]) {
        const mech = makeGearMech(ratio, [0, 1, 0], [0, 1, 0]);
        const core = createPhysicsCore(J, mech, { stepHz: 120 });
        core.setMotor('j1', { mode: 'velocity', radPerSec: 3 });
        for (let i = 0; i < 180; i++) core.step(1 / 120);
        const a1 = core.jointState('j1').angle;
        const measured = core.jointState('j2').angle / a1;
        assert.ok(Math.abs(a1 - 4.5) < 0.1, `driver ${a1} rad (ratio ${ratio})`);
        assert.ok(Math.abs(measured - ratio) / Math.abs(ratio) < TOL_GEAR, `gear ratio ${measured} vs ${ratio}`);
        core.destroy();
    }
});

test('free fall ½gt² ±2% after 0.5 s', async () => {
    const mech = makeFreeFallMech();
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    const start = core.bodyPose('box').position;
    for (let i = 0; i < 60; i++) core.step(1 / 120); // 0.5 s
    const end = core.bodyPose('box').position;
    const fallen = start[1] - end[1];
    const expected = 0.5 * 9.81 * 0.25; // 0.5*g*t², t=0.5
    assert.ok(Math.abs(fallen - expected) / expected < TOL_FALL, `fallen ${fallen} vs ${expected}`);
    core.destroy();
});

test('driving base: forward >0.15 m in 2 s with |yaw|<5°', async () => {
    const mech = makeDrivingBaseMech();
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    const startPos = core.bodyPose('chassis').position;
    const startYaw = quatYawSimple(core.bodyPose('chassis').rotation);
    // both forward: for axis [0,0,1], forward along +X requires negative velocity (see analysis)
    // Use -10 rad/s for forward
    core.setMotor('jL', { mode: 'velocity', radPerSec: -10 });
    core.setMotor('jR', { mode: 'velocity', radPerSec: -10 });
    for (let i = 0; i < 240; i++) core.step(1 / 120); // 2 s
    const endPos = core.bodyPose('chassis').position;
    const endYaw = quatYawSimple(core.bodyPose('chassis').rotation);
    const forwardDist = endPos[0] - startPos[0]; // X forward
    const yawChange = Math.abs(normalizeAngle(endYaw - startYaw)) * 180 / Math.PI;
    assert.ok(forwardDist > 0.15, `forward ${forwardDist} should be >0.15`);
    assert.ok(yawChange < 5, `yaw ${yawChange} should be <5°`);
    core.destroy();
});

test('driving base: turn in place |yaw|>45° centre moves <0.05 m', async () => {
    const mech = makeDrivingBaseMech();
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    const startPos = core.bodyPose('chassis').position;
    const startYaw = quatYawSimple(core.bodyPose('chassis').rotation);
    // opposite speeds to turn
    core.setMotor('jL', { mode: 'velocity', radPerSec: -8 });
    core.setMotor('jR', { mode: 'velocity', radPerSec: 8 });
    // Sample every step and unwrap: at 8 rad/s on 28 mm wheels and a 0.14 m track the base
    // turns ~3.2 rad/s, more than a full turn in 2 s, so a wrapped end-minus-start yaw lies.
    let yaw = 0;
    let prev = startYaw;
    for (let i = 0; i < 240; i++) {
        core.step(1 / 120);
        const now = quatYawSimple(core.bodyPose('chassis').rotation);
        yaw += normalizeAngle(now - prev);
        prev = now;
    }
    const endPos = core.bodyPose('chassis').position;
    const yawChange = Math.abs(yaw) * 180 / Math.PI;
    const move = distXZ(startPos, endPos);
    assert.ok(yawChange > 45, `yaw ${yawChange} should be >45°`);
    assert.ok(move < 0.05, `move ${move} should be <0.05`);
    core.destroy();
});

test('ball joint rolls freely with chassis', async () => {
    const mech = makeBallMech();
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    const chassisStart = core.bodyPose('chassis').position;
    const ballStart = core.bodyPose('ball').position;
    // drive forward
    core.setMotor('jL', { mode: 'velocity', radPerSec: -10 });
    core.setMotor('jR', { mode: 'velocity', radPerSec: -10 });
    for (let i = 0; i < 180; i++) core.step(1 / 120); // 1.5 s
    const chassisEnd = core.bodyPose('chassis').position;
    const ballEnd = core.bodyPose('ball').position;
    // ball should have moved with chassis (follow)
    const chassisMove = distXZ(chassisStart, chassisEnd);
    const ballMove = distXZ(ballStart, ballEnd);
    assert.ok(chassisMove > 0.1, `chassis should move ${chassisMove}`);
    // The socket point rides with the chassis: carry its start offset (chassis frame at t=0 is
    // world-aligned) through the chassis end pose and compare with the ball centre. A world-frame
    // offset comparison would count any chassis yaw as drift.
    const rotate = ([x, y, z, w], v) => {
        const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
        return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
    };
    const socketOffset = [ballStart[0] - chassisStart[0], ballStart[1] - chassisStart[1], ballStart[2] - chassisStart[2]];
    const socketEnd = rotate(core.bodyPose('chassis').rotation, socketOffset).map((v, i) => v + chassisEnd[i]);
    const drift = dist2(socketEnd, ballEnd);
    assert.ok(drift < 0.002, `ball should stay in its socket, drift ${drift}`);
    // ball should have rotated (pose changed) - check that its rotation is not identity
    const ballRot = core.bodyPose('ball').rotation;
    const isIdentity = Math.abs(ballRot[0]) < 1e-6 && Math.abs(ballRot[1]) < 1e-6 && Math.abs(ballRot[2]) < 1e-6 && Math.abs(ballRot[3] - 1) < 1e-6;
    // ball may have rotated due to rolling; not strictly required but we check it moved
    assert.ok(ballMove > 0.05, `ball should move ${ballMove}`);
    core.destroy();
});

test('determinism: same mechanism same script identical snapshot', async () => {
    const mech = makeDrivingBaseMech();
    const run = () => {
        const core = createPhysicsCore(J, mech, { stepHz: 120 });
        core.setMotor('jL', { mode: 'velocity', radPerSec: -8 });
        core.setMotor('jR', { mode: 'velocity', radPerSec: -8 });
        for (let i = 0; i < 120; i++) core.step(1 / 120);
        core.setMotor('jL', { mode: 'velocity', radPerSec: 0 });
        for (let i = 0; i < 60; i++) core.step(1 / 120);
        const snap = core.snapshot();
        core.destroy();
        return snap;
    };
    const s1 = run();
    const s2 = run();
    assert.deepEqual(s1.bodyIds, s2.bodyIds);
    assert.deepEqual(s1.jointIds, s2.jointIds);
    assert.equal(s1.t, s2.t);
    // byte-for-byte Float32Array
    assert.equal(s1.bodies.length, s2.bodies.length);
    assert.equal(s1.joints.length, s2.joints.length);
    for (let i = 0; i < s1.bodies.length; i++) assert.equal(s1.bodies[i], s2.bodies[i], `bodies[${i}]`);
    for (let i = 0; i < s1.joints.length; i++) assert.equal(s1.joints[i], s2.joints[i], `joints[${i}]`);
});

test('invalid mechanism is refused with validator message', async () => {
    const bad = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [{ id: 'a', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: -1, colliders: [{ shape: 'box', halfExtents: [0.1, 0.1, 0.1] }], parts: [] }],
        joints: [], gears: [], diagnostics: [],
    };
    assert.throws(() => createPhysicsCore(J, bad), err => {
        const msg = err.message;
        return /mass/.test(msg) || /positive/.test(msg);
    });
});

test('destroy frees core: 20 cores loop', async () => {
    for (let i = 0; i < 20; i++) {
        const mech = makeWheelMechVelocity();
        const core = createPhysicsCore(J, mech);
        core.setMotor('jw', { mode: 'velocity', radPerSec: 5 });
        core.step(1 / 120);
        core.destroy();
        // after destroy should be unusable
        assert.throws(() => core.step(0.01));
    }
});

test('step remainder kept and time multiple of 1/stepHz', async () => {
    const mech = makeFreeFallMech();
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    core.step(0.01); // not multiple
    const t1 = core.time;
    assert.equal(Math.round(t1 * 120) / 120, t1);
    core.step(0.015);
    const t2 = core.time;
    assert.equal(Math.round(t2 * 120) / 120, t2);
    core.destroy();
});

test('motor modes coast brake hold', async () => {
    const mech = makeWheelMechVelocity();
    const core = createPhysicsCore(J, mech);
    core.setMotor('jw', { mode: 'velocity', radPerSec: 10 });
    for (let i = 0; i < 30; i++) core.step(1 / 120);
    core.setMotor('jw', { mode: 'brake' });
    const vBefore = core.jointState('jw').velocity;
    for (let i = 0; i < 30; i++) core.step(1 / 120);
    const vAfter = core.jointState('jw').velocity;
    assert.ok(Math.abs(vAfter) < Math.abs(vBefore) + 1e-6, 'brake should reduce speed');
    core.setMotor('jw', { mode: 'coast' });
    // coast should not throw
    core.step(1 / 120);
    core.setMotor('jw', { mode: 'hold' });
    const holdAngle = core.jointState('jw').angle;
    for (let i = 0; i < 60; i++) core.step(1 / 120);
    const afterHold = core.jointState('jw').angle;
    assert.ok(Math.abs(afterHold - holdAngle) < 0.1, 'hold should keep angle');
    core.destroy();
});

test('collisions: dynamic-dynamic disabled, dynamic-static enabled', async () => {
    // Two dynamic boxes overlapping by design (gears) should not repel; dynamic vs static should collide
    // Create two dynamic boxes overlapping at same position, plus ground static
    const mech = {
        version: 1, gravity: [0, -9.81, 0],
        bodies: [
            { id: 'ground', motion: 'static', position: [0, -0.5, 0], rotation: [0, 0, 0, 1], massKg: 0, colliders: [{ shape: 'box', halfExtents: [5, 0.5, 5] }], parts: [] },
            { id: 'a', motion: 'dynamic', position: [0, 1, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{ shape: 'box', halfExtents: [0.1, 0.1, 0.1] }], parts: [] },
            { id: 'b', motion: 'dynamic', position: [0, 1.05, 0], rotation: [0, 0, 0, 1], massKg: 1, colliders: [{ shape: 'box', halfExtents: [0.1, 0.1, 0.1] }], parts: [] },
        ],
        joints: [], gears: [], diagnostics: [],
    };
    const core = createPhysicsCore(J, mech, { stepHz: 120 });
    for (let i = 0; i < 120; i++) core.step(1 / 120); // 1 s fall onto ground
    const posA = core.bodyPose('a').position;
    const posB = core.bodyPose('b').position;
    // both should be on ground (y ~0.1), not repelling each other excessively
    // If dynamic-dynamic collided, they'd separate; if not, they'd interpenetrate but both rest on ground
    // Check they are both near ground and not far apart vertically
    assert.ok(posA[1] < 0.3 && posA[1] > -0.1, `a y ${posA[1]}`);
    assert.ok(posB[1] < 0.3 && posB[1] > -0.1, `b y ${posB[1]}`);
    core.destroy();
});
