// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Line follower: the S1 driving base plus a SPIKE colour sensor on port C in
// front of the drive axle, ~8 mm above the floor. It drives the line-oval mat
// with the classic two-state follower, through the hub API only (motor
// commands in, hubState.data.sensors[2] reflection out), with the physics
// core and SimHubBridge in between — nothing about the lap is scripted.
//
// Why the earlier version never finished a lap (measured, 2026-10-17):
//  1. Its fixture's castor (39370 + pins + ball) was not connected to the hub:
//     compile() made it three free bodies, so the robot had no third support.
//     Run through a correct placement it wandered 7 m off the mat.
//  2. Its placement moved only the dynamic bodies' positions. The hinge/ball
//     joint points and the sensor's t=0 origin stayed where compile() put them,
//     so every joint yanked its wheel back toward the origin (the hub sank 1 cm
//     within 0.5 s with the motors stopped) and the colour ray was cast from
//     the wrong place (t=0 reading: white, 72). Its yaw (heading − 270°) also
//     turned the robot to face −x, against the mat's start heading.
//  3. The sensor sat 4 cm BEHIND the drive axle (LDraw z −20 vs 80). A two-
//     state follower steering from a point behind the axle is unstable: a turn
//     swings the sensor the opposite way.
// Fixed here by: the driving base's own castor, the sensor ahead of the axle,
// and placing the LDraw MODEL at the start pose before compile(), so bodies,
// joints and sensors come out of the compiler mutually consistent.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {LDU_M} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {SimHubBridge, STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import {createMat, distanceToOvalCentre} from '../overlay/scratch-gui/src/lib/bw-sim/world/mats.js';
import {placeOnStart} from '../overlay/scratch-gui/src/lib/bw-sim/world/place.js';

const parts = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts;
const CATALOG = new Map(parts.map(p => [p.part, p]));
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/bw-sim/line-follower.json', import.meta.url)));

/** The drive axle's midpoint in the fixture's LDraw frame: both wheels sit at z = 80, y = 10. */
const AXLE_MID_LDU = [0, 10, 80];

/**
 * Place an LDraw model so its forward (LDraw +z) points along the mat's start
 * heading and `anchorLdu` lands on (start.x, start.z). A rotation about the
 * LDraw y axis plus a translation, applied to every part BEFORE compile(), so
 * the compiler derives bodies, joint points and sensor rays from one placement.
 * World (x, z) = (x, −z)·LDU_M, so a world heading h (degrees from +x toward
 * +z) is the LDraw direction (cos h, 0, −sin h).
 */
const placeModel = placeOnStart;

const quatRotate = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [
        ix * w - iw * x - iy * z + iz * y,
        iy * w - iw * y - iz * x + ix * z,
        iz * w - iw * z - ix * y + iy * x
    ];
};

test('line-follower fixture: sensor on the hub, in front of the axle, ~8 mm up; castor attached', () => {
    const mech = compile(FIXTURE.model, CATALOG, {mat: FIXTURE.mat});
    assert.deepEqual(mech.diagnostics, []);
    assert.equal(mech.sensors.length, 1, 'one sensor');
    const s = mech.sensors[0];
    assert.equal(s.port, 'C');
    assert.equal(s.kind, 'color');
    const ground = mech.bodies.find(b => b.id === 'ground');
    const height = s.origin[1] - (ground.position[1] + 0.01);
    assert.ok(height > 0.007 && height < 0.013, `sensor height ${(height * 1000).toFixed(1)}mm expected 7-13`);
    assert.ok(Math.abs(s.direction[1] + 1) < 1e-6, `direction ${s.direction} should be down`);
    const hubBody = mech.bodies.find(b => b.parts.includes('hub'));
    assert.equal(s.body, hubBody.id);
    // Forward is world -z at identity: the sensor must be ahead of (more negative z than) the drive axle.
    const motorJoints = mech.joints.filter(j => j.motor);
    assert.equal(motorJoints.length, 2);
    const axleZ = (motorJoints[0].point[2] + motorJoints[1].point[2]) / 2;
    assert.ok(axleZ - s.origin[2] > 0.02, `sensor ${((axleZ - s.origin[2]) * 100).toFixed(1)} cm ahead of the axle, want > 2`);
    // The castor ball is held by the hub's body (the third support), not floating free.
    const ball = mech.joints.find(j => j.type === 'ball');
    assert.ok(ball && [ball.body1, ball.body2].includes(hubBody.id), `castor joint ${JSON.stringify(ball)}`);
});

// The classic two-state follower, following the line's OUTER edge (the oval
// turns left, toward −z, from the start heading +x; the line is on the
// sensor's left when the sensor is on white): on white turn left (slow A), on
// black turn right (slow B). Left motor A is mirrored, so forward is A < 0, B > 0.
// Tuned values: base 30 % of 1110 °/s, inner wheel at half speed, control
// period 20 ms. THRESHOLD 40 is midway between what the sensor reads at its
// 8.4 mm height: black ~4, white ~74 (the reading falls off with distance,
// sensors.js); the lap test checks its own readings straddle it.
const BASE_PCT = 30;
const SLOW = 0.5;
const THRESHOLD = 40;
const PERIOD_MS = 20;
const MAX_SPEED = 1110;

test('line follower completes one lap within 90 s, stays within 3 cm of line, deterministic', async () => {
    const J = await loadJolt();
    const mat = createMat(FIXTURE.mat);
    const mech = compile(placeModel(FIXTURE.model, mat.startPose, AXLE_MID_LDU), CATALOG, {mat: FIXTURE.mat});
    assert.deepEqual(mech.diagnostics, []);
    const hubDef = mech.bodies.find(b => b.parts.includes('hub'));
    const sensor = mech.sensors[0];
    const motorJoints = mech.joints.filter(j => j.motor);
    const axle0 = [0, 1, 2].map(i => (motorJoints[0].point[i] + motorJoints[1].point[i]) / 2);
    // Placement check (compiler output, t = 0): axle on the start point, sensor ahead along +x and over the line.
    assert.ok(Math.hypot(axle0[0] - mat.startPose.x, axle0[2] - mat.startPose.z) < 1e-6, `axle at ${axle0}`);
    assert.ok(sensor.origin[0] - axle0[0] > 0.02 && Math.abs(sensor.origin[2] - axle0[2]) < 0.01,
        `sensor ${sensor.origin} should be ahead of the axle along +x`);
    assert.equal(mat.colorAt(sensor.origin[0], sensor.origin[2]).color, 0, 'sensor starts over the black line');
    // A point fixed to the hub body, carried through its current pose.
    const carried = (pose, p0) => {
        const w = quatRotate(pose.rotation, [0, 1, 2].map(i => p0[i] - hubDef.position[i]));
        return w.map((v, i) => v + pose.position[i]);
    };
    const centreLength = mat.centreLineLengthM;
    const speed = BASE_PCT * MAX_SPEED / 100;

    const runOnce = () => {
        const core = createPhysicsCore(J, mech, {stepHz: 1000 / STEP_MS});
        const hubState = new VirtualSpikeHubState();
        const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody: hubDef.id});
        bridge.tick(STEP_MS); // one step so the sensor has a reading
        const black0 = hubState.data.sensors[2].reflection;
        const start = carried(core.bodyPose(hubDef.id), axle0);
        let prev = start;
        let travelled = 0;
        let maxAxle = 0;
        let maxSensor = 0;
        let whiteMax = 0;
        let lapMs = null;
        for (let t = PERIOD_MS; t <= 90000; t += PERIOD_MS) {
            const reflection = hubState.data.sensors[2].reflection;
            whiteMax = Math.max(whiteMax, reflection);
            const onWhite = reflection >= THRESHOLD;
            hubState.motors.runAtSpeed('A', -speed * (onWhite ? SLOW : 1));
            hubState.motors.runAtSpeed('B', speed * (onWhite ? 1 : SLOW));
            bridge.tick(PERIOD_MS);
            if (t % 100 !== 0) continue;
            const pose = core.bodyPose(hubDef.id);
            const axle = carried(pose, axle0);
            const spot = carried(pose, sensor.origin);
            travelled += Math.hypot(axle[0] - prev[0], axle[2] - prev[2]);
            prev = axle;
            maxAxle = Math.max(maxAxle, distanceToOvalCentre(axle[0], axle[2]));
            maxSensor = Math.max(maxSensor, distanceToOvalCentre(spot[0], spot[2]));
            if (travelled >= 0.9 * centreLength && Math.hypot(axle[0] - start[0], axle[2] - start[2]) < 0.05) {
                lapMs = t;
                break;
            }
        }
        bridge.dispose();
        core.destroy();
        return {lapMs, travelled, maxAxle, maxSensor, black0, whiteMax};
    };

    const r1 = runOnce();
    // The sensor's own readings straddle the threshold (black at the start, white while following).
    assert.ok(r1.black0 < THRESHOLD && r1.whiteMax > THRESHOLD, `black ${r1.black0} white ${r1.whiteMax} vs threshold ${THRESHOLD}`);
    assert.ok(r1.lapMs !== null,
        `no lap in 90 s: travelled ${r1.travelled.toFixed(2)} m, max ${(r1.maxAxle * 100).toFixed(1)} cm off the line`);
    assert.ok(r1.travelled >= 0.9 * centreLength, `travelled ${r1.travelled.toFixed(2)} < ${(0.9 * centreLength).toFixed(2)}`);
    // The robot (drive-axle midpoint) and the sensor's spot both stay within 3 cm
    // of the centre line. The sensor rides the line's edge, 1 cm off centre.
    assert.ok(r1.maxAxle <= 0.03, `axle strayed ${(r1.maxAxle * 100).toFixed(1)} cm from the line`);
    assert.ok(r1.maxSensor <= 0.03, `sensor strayed ${(r1.maxSensor * 100).toFixed(1)} cm from the line`);
    const r2 = runOnce();
    assert.equal(r2.lapMs, r1.lapMs, 'deterministic lap time');
    assert.equal(r2.maxAxle, r1.maxAxle, 'deterministic path');
    console.log(`lap ${r1.lapMs / 1000} s, travelled ${r1.travelled.toFixed(3)} m of ${centreLength.toFixed(3)}, ` +
        `max off-line: axle ${(r1.maxAxle * 1000).toFixed(1)} mm, sensor ${(r1.maxSensor * 1000).toFixed(1)} mm`);
});
