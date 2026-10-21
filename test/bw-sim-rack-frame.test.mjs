// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Rack and pinion on a moving frame (physics/jolt-core.js 'rackAndPinion'): since jolt-physics 1.1.0-bw.4 the coupling
// is the fork's RackMeshConstraint, v(slider) = ratio · ω(hinge) RELATIVE TO THE FRAMES that carry pinion and rack
// (BRICKWRIGHT.md section 4). Jolt's RackAndPinionConstraint tied world rates: a turning or driving chassis's own
// motion drove the rack, and a motor driving a rack at its end stop turned the whole machine. Each test runs a
// control with the world-rate constraint (the same core with the fork's class hidden) to show it tells them apart.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {upgradeMechanismV1} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {MODELS, MODELS_BASE, prepareModel, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';

const J = await loadJolt();
/** The same Jolt without the fork's RackMeshConstraint: the core falls back to RackAndPinionConstraint (world rates). */
const WORLD_RATES = Object.assign(Object.create(J), {RackMeshConstraintSettings: undefined});
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUI = path.join(ROOT, 'overlay/scratch-gui');
const HZ = 200;
const R = 0.004; // 8T pinion's pitch radius: 4 mm of rack per radian

/**
 * A 200 g chassis free in space carrying a pinion on a motorised hinge (axis `pinionAxis`, through `pinionAt`) and a rack
 * on a slider along `rackAxis`, coupled at R. No gravity, no floor: whatever moves the rack is the coupling.
 */
const benchMechanism = ({pinionAxis, rackAxis, pinionAt, rackAt}) => {
    const box = (id, position, massKg, half) => ({id, motion: 'dynamic', position, rotation: [0, 0, 0, 1], massKg,
        colliders: [{shape: 'box', halfExtents: half}], parts: []});
    const m = upgradeMechanismV1({version: 1, gravity: [0, 0, 0], bodies: [
        box('chassis', [0, 0, 0], 0.2, [0.04, 0.005, 0.06]),
        box('pinion', pinionAt, 0.005, [0.004, 0.004, 0.004]),
        box('rack', rackAt, 0.01, [0.03, 0.002, 0.002])
    ], joints: [
        {id: 'jp', type: 'hinge', body1: 'chassis', body2: 'pinion', point: pinionAt, axis: pinionAxis, motor: {port: 'A', maxTorqueNm: 0.2, maxSpeedRadPerSec: 20}},
        {id: 'jr', type: 'slider', body1: 'chassis', body2: 'rack', point: rackAt, axis: rackAxis}
    ], gears: [{id: 'g0', type: 'rackAndPinion', hingeJoint: 'jp', sliderJoint: 'jr', ratio: R}], diagnostics: []});
    m.noCollide = [['chassis', 'pinion'], ['chassis', 'rack'], ['pinion', 'rack']];
    return m;
};

/** Run the bench 1 s with the chassis given `v` (m/s) and `w` (rad/s); the pinion held or turned at 2 rad/s. */
const runBench = (Jx, spec, {v = [0, 0, 0], w = [0, 0, 0], turn = false} = {}) => {
    const core = createPhysicsCore(Jx, benchMechanism(spec), {stepHz: HZ});
    core.setMotor('jp', turn ? {mode: 'velocity', radPerSec: 2} : {mode: 'hold'});
    // The whole machine moves as one rigid body at the start: v + w × (x − x_chassis) at each body's centre.
    const c = core.bodyPose('chassis').position;
    for (const id of ['chassis', 'pinion', 'rack']) {
        const d = core.bodyPose(id).position.map((x, i) => x - c[i]);
        const wxd = [w[1] * d[2] - w[2] * d[1], w[2] * d[0] - w[0] * d[2], w[0] * d[1] - w[1] * d[0]];
        core.setBodyVelocity(id, v.map((x, i) => x + wxd[i]), w);
    }
    const wz0 = () => core.bodyAngularVelocity('chassis');
    for (let i = 0; i < HZ; i++) core.step(1 / HZ);
    const out = {slide: core.jointState('jr').position, theta: core.jointState('jp').angle, w: wz0(), v: core.bodyLinearVelocity('chassis')};
    core.destroy();
    return out;
};

test('a rack on a turning chassis keeps its place on it: it moves only by r times the pinion\'s turn relative to the chassis', t => {
    // The chassis spins at 3 rad/s about the pinion's own axis (a steering pinion, vertical, as the car turns).
    const spec = {pinionAxis: [0, 1, 0], rackAxis: [1, 0, 0], pinionAt: [0, 0.01, 0], rackAt: [0, 0.01, 0.006]};
    const held = runBench(J, spec, {w: [0, 3, 0]});
    const turned = runBench(J, spec, {w: [0, 3, 0], turn: true});
    const control = runBench(WORLD_RATES, spec, {w: [0, 3, 0]});
    t.diagnostic(`held: slide ${(held.slide * 1000).toFixed(4)} mm; turned ${turned.theta.toFixed(3)} rad: slide ${(turned.slide * 1000).toFixed(3)} mm ` +
        `(r·θ ${(R * turned.theta * 1000).toFixed(3)}); world-rate control held: slide ${(control.slide * 1000).toFixed(2)} mm`);
    assert.ok(Math.abs(held.slide) < 1e-5, `held: the rack moved ${held.slide} m`);
    assert.ok(Math.abs(turned.theta) > 1.5, `the motor turned the pinion ${turned.theta} rad`);
    assert.ok(Math.abs(Math.abs(turned.slide) - R * Math.abs(turned.theta)) < 1e-4, `turned: slide ${turned.slide} vs r·θ ${R * turned.theta}`);
    assert.ok(Math.abs(control.slide) > 1e-3, `the control's rack moved only ${control.slide} m: the bench does not tell them apart`);
});

test('a steering rack on a driving, turning car does not twist it: the car keeps its yaw rate, the rack its place', t => {
    // A car driving at 0.3 m/s along z while turning at 1 rad/s; the steering pinion (axis y) held by its motor.
    // Pinion and rack sit on the chassis's vertical through its centre, so y stays a principal axis of the whole
    // car: turning free, it keeps its yaw rate unless something twists it.
    const spec = {pinionAxis: [0, 1, 0], rackAxis: [1, 0, 0], pinionAt: [0, 0.01, 0], rackAt: [0, 0.016, 0]};
    const car = runBench(J, spec, {v: [0, 0, 0.3], w: [0, 1, 0]});
    const control = runBench(WORLD_RATES, spec, {v: [0, 0, 0.3], w: [0, 1, 0]});
    const tilt = o => Math.hypot(o.w[0], o.w[2]);
    t.diagnostic(`relative: yaw ${car.w[1].toFixed(4)} rad/s, roll/pitch ${tilt(car).toFixed(5)} rad/s, rack ${(car.slide * 1000).toFixed(4)} mm; ` +
        `world-rate control: yaw ${control.w[1].toFixed(4)} rad/s, roll/pitch ${tilt(control).toFixed(4)}, rack ${(control.slide * 1000).toFixed(2)} mm`);
    assert.ok(Math.abs(car.slide) < 1e-5, `the steering rack moved ${car.slide} m`);
    // Jolt's default angular damping (0.05 s⁻¹, jolt-core.js sets none) takes e^−0.05 of it in the second.
    const yaw = Math.exp(-0.05);
    assert.ok(Math.abs(car.w[1] / yaw - 1) < 0.005, `the car's yaw rate went from 1 to ${car.w[1]} rad/s (damping alone: ${yaw})`);
    assert.ok(tilt(car) < 1e-3, `the car twisted at ${tilt(car)} rad/s`);
    assert.ok(Math.abs(control.slide) > 1e-3 && Math.abs(control.w[1] / yaw - 1) > 0.05, 'the control is not disturbed: the bench does not tell them apart');
});

test('the Forklift\'s lift motor driving the carriage past its end stalls there: the machine does not tip', t => {
    // The shipped Forklift (lift motor on port C turns the 8T on the rack). Run the lift up for 6 s, far past the top
    // of the carriage's travel: the motor stalls against the end (the slider's limit) and the machine stands.
    const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(GUI, 'src/lib/bw-sim/part-meta/parts.json'), 'utf8')));
    const entry = MODELS.find(m => m.file === 'forklift.ldr');
    const text = readFileSync(path.join(GUI, MODELS_BASE, entry.file), 'utf8');
    const tiltDeg = q => Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (q[0] * q[0] + q[2] * q[2])))) * 180 / Math.PI;
    const run = Jx => {
        const {mechanism} = prepareModel(text, CATALOG, {mat: entry.mat});
        const core = createPhysicsCore(Jx, mechanism, {stepHz: HZ});
        const hub = mechanism.bodies.find(b => b.parts.includes('hub')).id;
        const lift = mechanism.actuators.find(a => a.port === 'C').joint;
        const slider = mechanism.joints.find(j => j.type === 'slider');
        core.setMotor(lift, {mode: 'velocity', radPerSec: 6});
        let maxTilt = 0;
        for (let i = 0; i < 6 * HZ; i++) {
            core.step(1 / HZ);
            maxTilt = Math.max(maxTilt, tiltDeg(core.bodyPose(hub).rotation));
        }
        const out = {maxTilt, slide: core.jointState(slider.id).position, limits: slider.limits};
        core.destroy();
        return out;
    };
    const relative = run(J);
    const control = run(WORLD_RATES);
    t.diagnostic(`relative: tipped at most ${relative.maxTilt.toFixed(2)}°, carriage at ${(relative.slide * 1000).toFixed(1)} mm (limits ${relative.limits.map(x => (x * 1000).toFixed(1)).join(' … ')} mm); ` +
        `world-rate control: ${control.maxTilt.toFixed(1)}°`);
    assert.ok(relative.maxTilt < 1, `the Forklift tipped ${relative.maxTilt}°`);
    assert.ok(relative.slide >= relative.limits[0] - 0.001 && relative.slide <= relative.limits[1] + 0.001, 'the carriage stays within its travel');
    assert.ok(control.maxTilt > 10, `the control tipped only ${control.maxTilt}°: the bench does not tell them apart`);
});
