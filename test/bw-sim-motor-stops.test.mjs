// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Motors run on past what they drive (physics/jolt-core.js end stops, mech/compile.js FLOOR_HALF_M):
// every shipped model was run with each motor at full speed both ways (the motor mixer lets a child
// do it). Gears and racks couple WORLD rates, so a motor still driving a rack or a hinge at its end was
// satisfied by turning the whole model: the forklift's lift motor tipped the forklift over, the
// gearbox's shift motor turned the gearbox on its stand. Now the motor stalls at the end, as a real one
// does. And the floor reaches 10 m every way: a robot spinning on one wheel drove off the 2 m floor
// and fell within seconds.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));
const HZ = 1000 / STEP_MS;
const DEG = 180 / Math.PI;
/** The angle (degrees) between a body's up and the world's. */
const tilt = ([x, , z]) => Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (x * x + z * z)))) * DEG;

/** Runs `port` at full speed (sign) for `seconds` after settling: the chassis' worst tilt, the motor's turn, the slider's end. */
const runOn = async (file, port, sign, seconds = 3, {power = false} = {}) => {
    const J = await loadJolt();
    const m = prepareModel(readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models', file), 'latin1'), CATALOG).mechanism;
    const core = createPhysicsCore(J, m, {stepHz: HZ});
    const chassis = m.bodies.filter(b => b.id !== 'ground' && b.motion !== 'static').reduce((a, b) => (b.massKg > a.massKg ? b : a)).id;
    const motor = m.joints.find(j => j.motor && j.motor.port === port);
    for (let i = 0; i < 0.5 * HZ; i++) core.step(1 / HZ);
    // A speed drive, or (power) a PWM drive at full duty: the stall torque through the back-EMF damping that makes the
    // no-load speed (physics/actuators.js dcMotorCommand).
    if (power) core.setMotor(motor.id, {mode: 'torque', torqueNm: sign * motor.motor.maxTorqueNm, dampingNmsPerRad: motor.motor.maxTorqueNm / motor.motor.maxSpeedRadPerSec});
    else core.setMotor(motor.id, {mode: 'velocity', radPerSec: sign * motor.motor.maxSpeedRadPerSec});
    let worst = 0;
    let lowest = Infinity;
    for (let i = 0; i < seconds * HZ; i++) {
        core.step(1 / HZ);
        const {position, rotation} = core.bodyPose(chassis);
        worst = Math.max(worst, tilt(rotation));
        lowest = Math.min(lowest, position[1]);
    }
    const turned = core.jointState(motor.id).angle * DEG;
    core.destroy();
    return {worst, lowest, turned, m};
};

test('the forklift\'s lift motor run on past the top stalls there; the forklift stays level', async t => {
    const r = await runOn('forklift.ldr', 'C', 1);
    t.diagnostic(`turned ${r.turned.toFixed(0)}°, tilt at most ${r.worst.toFixed(1)}°`);
    assert.ok(r.worst < 3, `level: ${r.worst}°`);
    // The rack is 66 mm long; the pinion's ~1000° lifts it there, and the motor stops (it ran on to 3300°).
    assert.ok(r.turned > 800 && r.turned < 1100, `the motor stalls at the top: ${r.turned}°`);
});

test('the forklift\'s lift motor driven at full POWER past the top stalls there too (a PWM drive, not a speed)', async t => {
    const r = await runOn('forklift.ldr', 'C', 1, 3, {power: true});
    t.diagnostic(`turned ${r.turned.toFixed(0)}°, tilt at most ${r.worst.toFixed(1)}°`);
    assert.ok(r.worst < 3, `level: ${r.worst}°`);
    assert.ok(r.turned > 800 && r.turned < 1100, `the motor stalls at the top: ${r.turned}°`);
});

test('the gearbox\'s shift motor run on stalls against the shift fork\'s ends; the gearbox stays on its stand', async t => {
    for (const sign of [1, -1]) {
        const r = await runOn('gearbox.ldr', 'B', sign);
        t.diagnostic(`${sign > 0 ? '+' : '-'}: turned ${r.turned.toFixed(0)}°, tilt at most ${r.worst.toFixed(1)}°`);
        assert.ok(r.worst < 3, `level: ${r.worst}°`);
        assert.ok(Math.abs(r.turned) < 400, `the shift motor stops at the fork's end: ${r.turned}°`);
    }
});

test('a driving base spinning on one wheel for ten seconds stays on the floor', async t => {
    const r = await runOn('driving-base.ldr', 'A', 1, 10);
    t.diagnostic(`lowest ${r.lowest.toFixed(3)} m, tilt at most ${r.worst.toFixed(1)}°`);
    const floor = r.m.bodies.find(b => b.id === 'ground');
    assert.ok(r.lowest > floor.position[1] - 0.01, 'never below the floor');
    assert.ok(r.worst < 10, `upright: ${r.worst}°`);
});
