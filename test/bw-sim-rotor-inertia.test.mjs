// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * A motor's reflected rotor inertia Jr couples its hinge's two bodies only through their
 * RELATIVE rotation (jolt-core.js setRotorInertia, issue #1494). The analytic case: a
 * free-floating housing (moment I1 about the axis) carrying a motor whose output body
 * (moment I2) it drives, no gravity, no contact. The rotor's kinetic energy ½·Jr·(ω2 − ω1)²
 * carries no angular momentum term, so I1·ω1 + I2·ω2 stays 0 and the housing turns
 * ψ = −I2·α/(I1 + I2) for a hinge turn α, whatever Jr is. Adding Jr to both bodies instead
 * gives (I2 + Jr)/(I1 + I2 + 2·Jr).
 *
 * The moments are chosen like Robot Lab's Afterturn (docs/data/robot-lab-experimental-checkpoint.json):
 * I2/(I1 + I2) ≈ 0.026 with the SPIKE medium motor's Jr, where the old treatment gives ≈ 0.125.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {attachMotor} from '../overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js';
import {SPIKE_MEDIUM_ANGULAR} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';

const J = await loadJolt();
const DT = 0.005;

const disc = (id, y, massKg, radius) => ({id, motion: 'dynamic', position: [0, y, 0], rotation: [0, 0, 0, 1], massKg,
    colliders: [{shape: 'cylinder', radius, halfHeight: 0.002}], parts: []});
const moment = ({massKg, radius}) => 0.5 * massKg * radius * radius;

const T = 0.003, C = 1e-4;
const run = ({housing, output, withRotor = true, steps = 100}) => {
    const device = SPIKE_MEDIUM_ANGULAR;
    const mechanism = {
        version: 1, gravity: [0, 0, 0],
        bodies: [disc('housing', 0, housing.massKg, housing.radius), disc('out', 0.05, output.massKg, output.radius)],
        joints: [{id: 'j', type: 'hinge', body1: 'housing', body2: 'out', point: [0, 0.025, 0], axis: [0, 1, 0],
            motor: {port: 'A', maxTorqueNm: device.motor.stallTorqueNm, maxSpeedRadPerSec: device.motor.noLoadRadPerSec, deviceId: 48}}],
        gears: [], diagnostics: []
    };
    const core = createPhysicsCore(J, mechanism, {stepHz: 1 / DT});
    if (withRotor) attachMotor(core, 'j', device);
    core.setMotor('j', {mode: 'torque', torqueNm: T, dampingNmsPerRad: C});
    for (let i = 0; i < steps; i++) core.step(DT);
    const q = core.bodyPose('housing').rotation;
    const psi = 2 * Math.atan2(q[1], q[3]);
    const alpha = core.jointState('j').angle;
    core.destroy();
    return {psi, alpha, Jr: device.motor.rotorInertiaKgM2};
};

test('a free housing turns -I2/(I1+I2) per hinge turn, the rotor adding nothing (#1494)', t => {
    const housing = {massKg: 0.5, radius: 0.0947};
    const output = {massKg: 0.05, radius: 0.0482};
    const [I1, I2] = [moment(housing), moment(output)];
    const {psi, alpha, Jr} = run({housing, output});
    const physical = I2 / (I1 + I2);
    const bothBodies = (I2 + Jr) / (I1 + I2 + 2 * Jr);
    const ratio = -psi / alpha;
    t.diagnostic(`I1 ${I1.toExponential(3)} I2 ${I2.toExponential(3)} Jr ${Jr.toExponential(3)}; hinge ${alpha.toFixed(4)} rad, ` +
        `housing ${psi.toFixed(5)} rad; ratio ${ratio.toFixed(5)}, physical ${physical.toFixed(5)}, Jr-on-both ${bothBodies.toFixed(5)}`);
    assert.ok(alpha > 0.2, `the motor turned the hinge (${alpha})`);
    assert.ok(bothBodies > 3 * physical, 'the case separates the two treatments');
    assert.ok(Math.abs(ratio - physical) < 0.05 * physical, `ratio ${ratio} vs physical ${physical} (Jr on both: ${bothBodies})`);
});

test('the rotor still slows the relative turn: Jr is in the relative mode (#1494)', t => {
    const housing = {massKg: 0.5, radius: 0.0947};
    const output = {massKg: 0.05, radius: 0.0482};
    const [I1, I2] = [moment(housing), moment(output)];
    const bare = run({housing, output, withRotor: false, steps: 40});
    const loaded = run({housing, output, steps: 40});
    // I·α'' = T − C·α' from rest: α(t) = (T/C)·(t − τ·(1 − e^(−t/τ))), τ = I/C, I the relative moment.
    const mu = I1 * I2 / (I1 + I2);
    const turn = I => { const tau = I / C, tt = 40 * DT; return (T / C) * (tt - tau * (1 - Math.exp(-tt / tau))); };
    const predicted = turn(mu + loaded.Jr) / turn(mu);
    const measured = loaded.alpha / bare.alpha;
    t.diagnostic(`hinge turn with rotor / without ${measured.toFixed(4)}, predicted from mu + Jr ${predicted.toFixed(4)}`);
    assert.ok(Math.abs(measured - predicted) < 0.1 * predicted, `measured ${measured} vs ${predicted}`);
});
