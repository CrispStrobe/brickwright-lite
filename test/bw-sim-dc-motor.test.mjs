// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The DC-motor actuator (physics/actuators.js `pwm`, devices/dc-motors.js) and the SPIKE
 * motor controller that drives it (hubs/spike/spike-motor-controller.js through
 * hubs/spike/spike-virtual-hub.js), measured on the real Jolt core at the Robot Lab's 5 ms
 * step (owner decision D5; docs/ROBOT-LAB-ARCHITECTURE.md R3 (c)).
 *
 * Every expectation is the MODEL's prediction from its DeviceModel numbers (ω0, τs, the
 * rotor's reflected inertia J, the gearbox friction τf) and the rig's geometry, never a
 * value the test sets and reads back. Whether those numbers are the real motor's is owner
 * decision D6 (devices/dc-motors.js says which are LEGO's, which Pybricks', which derived).
 *
 * The rig: a static housing, an output body on a vertical (or, for the stall test,
 * horizontal) hinge driven by the motor on port A, and on the same axis a second hinge
 * (port B) that is never bound to a hub — the test's dynamometer: Coulomb friction (Jolt's
 * hinge friction with its motor off) or a known torque.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {applyDrive, attachMotor, dcMotorCommand} from '../overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js';
import {SPIKE_MEDIUM_ANGULAR, SPIKE_LARGE_ANGULAR} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';
import {SpikeVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js';
import {KP} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-motor-controller.js';
import {STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';

const J = await loadJolt();
const DEG = 180 / Math.PI;
const DT = STEP_MS / 1000;
const MOTORS = [['medium', SPIKE_MEDIUM_ANGULAR, 48], ['large', SPIKE_LARGE_ANGULAR, 49]];

/**
 * A motor rig. `out`: the output body (a disc on a vertical axis, or with `arm` a box whose
 * centre of mass is `arm.L` from a horizontal axis, under gravity).
 */
const rig = ({device, deviceId, disc = {massKg: 0.04, radius: 0.01}, arm = null}) => {
    const axis = arm ? [0, 0, 1] : [0, 1, 0];
    const out = arm
        ? {id: 'out', motion: 'dynamic', position: [arm.L, 0, 0], rotation: [0, 0, 0, 1], massKg: arm.massKg,
            colliders: [{shape: 'box', halfExtents: [0.004, 0.002, 0.002]}], parts: []}
        : {id: 'out', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: disc.massKg,
            colliders: [{shape: 'cylinder', radius: disc.radius, halfHeight: 0.002}], parts: []};
    const motor = port => ({port, maxTorqueNm: device.motor.stallTorqueNm, maxSpeedRadPerSec: device.motor.noLoadRadPerSec, deviceId});
    const mechanism = {
        version: 1, gravity: arm ? [0, -9.81, 0] : [0, 0, 0],
        bodies: [
            // The housing, clear of the output so the two never touch.
            {id: 'housing', motion: 'static', position: [0, -0.2, 0], rotation: [0, 0, 0, 1], massKg: 0,
                colliders: [{shape: 'box', halfExtents: [0.01, 0.01, 0.01]}], parts: []},
            out
        ],
        joints: [
            {id: 'jA', type: 'hinge', body1: 'housing', body2: 'out', point: [0, 0, 0], axis, motor: motor('A')},
            {id: 'jB', type: 'hinge', body1: 'housing', body2: 'out', point: [0, 0, 0], axis, motor: motor('B')}
        ],
        gears: [], diagnostics: []
    };
    const core = createPhysicsCore(J, mechanism, {stepHz: 1000 / STEP_MS});
    attachMotor(core, 'jA', device);
    core.setMotor('jB', {mode: 'coast'});
    return {core, motor: mechanism.joints[0].motor};
};

/** The output's own inertia about the axis (a solid disc). */
const discInertia = ({massKg, radius}) => 0.5 * massKg * radius * radius;

/** Open loop: duty into the DC model every step. */
const runDuty = (r, device, duty, steps, decay = 'brake') => {
    const speeds = [];
    for (let i = 0; i < steps; i++) {
        applyDrive(r.core, 'jA', {port: 'A', mode: 'pwm', duty, decay}, r.motor, {device, supplyVolts: device.motor.nominalVolts});
        r.core.step(DT);
        speeds.push(r.core.jointState('jA').velocity);
    }
    return speeds;
};

/** Closed loop: a SPIKE hub's controller on port A, as SimHubBridge.step runs it. */
const spikeLoop = (r, device, deviceId) => {
    const hub = new SpikeVirtualHub();
    hub.plug([{port: 'A', class: 'motor', ids: {lpf2: deviceId}, device}]);
    let t = 0;
    let angle = r.core.jointState('jA').angle;
    return {
        hub,
        motors: hub.hubState.motors,
        /** One 5 ms step; `load` sets the dynamometer hinge first. */
        step (load = null) {
            t += STEP_MS;
            hub.advanceTo(t);
            for (const d of hub.readDrives()) applyDrive(r.core, 'jA', d, r.motor, {device, supplyVolts: 7.2});
            if (load) r.core.setMotor('jB', load);
            r.core.step(DT);
            const s = r.core.jointState('jA');
            hub.writeReadings([{port: 'A', kind: 'encoder', angleRad: s.angle, deltaRad: s.angle - angle, radPerSec: s.velocity}]);
            angle = s.angle;
            return s;
        },
        get position () { return hub.hubState.data.motors[0].position; }
    };
};

/** A constant load torque on the dynamometer hinge (Jolt needs some damping; 2 % of the motor's). */
const loadTorque = (device, torqueNm) => ({mode: 'torque', torqueNm,
    dampingNmsPerRad: 0.02 * device.motor.stallTorqueNm / device.motor.noLoadRadPerSec});

for (const [name, device, deviceId] of MOTORS) {
    const {noLoadRadPerSec: w0, stallTorqueNm: ts, rotorInertiaKgM2: Jr, frictionTorqueNm: tf} = device.motor;

    test(`(a) ${name}: no-load speed at duty 1 and 0.5 is ω0·u within 3 %`, () => {
        for (const duty of [1, 0.5]) {
            const r = rig({device, deviceId});
            // Time constant (J + I)/b ≈ 40–50 ms: after 1 s the speed has settled.
            const speeds = runDuty(r, device, duty, 200);
            r.core.destroy();
            const measured = speeds.at(-1);
            assert.ok(Math.abs(measured - w0 * duty) < 0.03 * w0 * duty,
                `duty ${duty}: ${(measured * DEG).toFixed(1)} °/s vs ω0·u = ${(w0 * duty * DEG).toFixed(1)} °/s`);
        }
    });

    test(`(b) ${name}: the stall torque holds an arm whose weight is within 3 % of τs`, () => {
        // An arm with its centre of mass L = 40 mm out on a horizontal axis, level at the start:
        // gravity pulls it down with m·g·L, the motor at duty 1 and standstill pushes it up with
        // τs. 3 % lighter than the stall torque it rises, 3 % heavier it falls.
        const L = 0.04;
        const angleAfter = factor => {
            const r = rig({device, deviceId, arm: {L, massKg: factor * ts / (9.81 * L)}});
            runDuty(r, device, 1, 40);
            const a = r.core.jointState('jA').angle;
            r.core.destroy();
            return a * DEG;
        };
        const lighter = angleAfter(0.97);
        const heavier = angleAfter(1.03);
        assert.ok(lighter > 0, `an arm 3 % under the stall torque rose: ${lighter.toFixed(2)}°`);
        assert.ok(heavier < 0, `an arm 3 % over the stall torque fell: ${heavier.toFixed(2)}°`);
    });

    test(`(c) ${name}: brake stops a 20 g·cm² flywheel sooner than coast, each as predicted`, () => {
        const disc = {massKg: 0.04, radius: 0.01};
        const I = discInertia(disc) + Jr;
        const timeTo10 = decay => {
            const r = rig({device, deviceId, disc});
            const w = runDuty(r, device, 1, 200).at(-1);
            const speeds = runDuty(r, device, 0, 400, decay);
            r.core.destroy();
            const k = speeds.findIndex(v => Math.abs(v) < 0.1 * Math.abs(w));
            assert.ok(k >= 0, `${decay}: the flywheel came below 10 % within 2 s`);
            return {seconds: (k + 1) * DT, w};
        };
        const brake = timeTo10('brake');
        const coast = timeTo10('coast');
        assert.ok(brake.seconds < coast.seconds, `brake ${brake.seconds} s, coast ${coast.seconds} s`);
        // Brake: exponential decay with τ = I/b, to 10 % after τ·ln 10 in continuous time. The
        // core integrates the damping implicitly (backward Euler, the price of being stable for
        // any inertia): ω shrinks by 1/(1 + dt/τ) per step, so it takes the first whole number
        // of steps n with (1 + dt/τ)^n ≥ 10 — for the medium motor's bare rotor (τ ≈ 33 ms) 16
        // steps, 80 ms instead of 75 ms (7 % slow), less for slower decays.
        const tau = I / (ts / w0);
        const continuous = tau * Math.LN10;
        const steps = Math.ceil(Math.LN10 / Math.log(1 + DT / tau));
        assert.ok(Math.abs(brake.seconds - steps * DT) <= DT + 1e-9,
            `brake: ${brake.seconds} s vs ${steps} backward-Euler steps (continuous τ·ln 10 = ${continuous.toFixed(3)} s)`);
        assert.ok(Math.abs(brake.seconds - continuous) <= 0.15 * continuous, `brake: ${brake.seconds} s vs ${continuous.toFixed(3)} s`);
        // Coast: the gearbox friction decelerates linearly, to 10 % after 0.9·ω·I/τf.
        const coastPredicted = 0.9 * coast.w * I / tf;
        assert.ok(Math.abs(coast.seconds - coastPredicted) <= Math.max(0.1 * coastPredicted, DT),
            `coast: ${coast.seconds} s vs 0.9·ω·I/τf = ${coastPredicted.toFixed(3)} s`);
    });

    test(`(d) ${name}: run_for_degrees(360) ends within ±2° unloaded and ±5° against a 30 % load`, async () => {
        for (const [load, tolerance] of [[0, 2], [0.3, 5]]) {
            const r = rig({device, deviceId});
            const loop = spikeLoop(r, device, deviceId);
            let outcome = null;
            let atEnd = null;
            loop.motors.runForDegrees('A', 360, 500).then(v => { outcome = v; });
            // The load: Coulomb friction of 30 % of the stall torque on the dynamometer hinge.
            const friction = load ? {mode: 'coast', frictionNm: load * ts} : null;
            for (let i = 0; i < 600 && atEnd === null; i++) {
                loop.step(friction);
                await null;
                if (outcome) atEnd = loop.position;
            }
            // Then half a second more: the default stop action (brake) must not let it drift.
            for (let i = 0; i < 100; i++) loop.step(friction);
            const rest = loop.position;
            r.core.destroy();
            assert.equal(outcome, 'completed', `load ${load}`);
            assert.ok(Math.abs(atEnd - 360) <= tolerance, `load ${load}: completed at ${atEnd.toFixed(2)}°`);
            assert.ok(Math.abs(rest - 360) <= tolerance, `load ${load}: at rest at ${rest.toFixed(2)}°`);
        }
    });

    test(`(e) ${name}: hold resists a disturbance torque and returns`, () => {
        const r = rig({device, deviceId});
        const loop = spikeLoop(r, device, deviceId);
        loop.motors.stop('A', 'hold');
        for (let i = 0; i < 20; i++) loop.step();
        const held = loop.position;
        // Half the stall torque against the hold for 300 ms. Its proportional term alone would
        // settle at a deflection of τ/KP; the integral only shrinks it.
        const disturbance = 0.5 * ts;
        let worst = 0;
        for (let i = 0; i < 60; i++) {
            loop.step(loadTorque(device, -disturbance));
            worst = Math.max(worst, Math.abs(loop.position - held));
        }
        const pOnly = disturbance / KP * DEG;
        assert.ok(worst < pOnly, `deflected ${worst.toFixed(2)}° (P alone: ${pOnly.toFixed(2)}°)`);
        assert.ok(worst > 0, 'the disturbance did reach the shaft');
        // Released: back on the held angle within 0.5 s, to the encoder's 1°.
        for (let i = 0; i < 100; i++) loop.step({mode: 'coast'});
        r.core.destroy();
        assert.ok(Math.abs(loop.position - held) <= 1, `returned to ${loop.position.toFixed(2)}° of ${held.toFixed(2)}°`);
    });

    test(`(f) ${name}: after a load step the speed is back within 5 % in under 300 ms`, () => {
        const r = rig({device, deviceId});
        const loop = spikeLoop(r, device, deviceId);
        const target = 500;
        loop.motors.runAtSpeed('A', target);
        for (let i = 0; i < 200; i++) loop.step();
        // 30 % of the stall torque, from now on.
        const speeds = [];
        for (let i = 0; i < 200; i++) speeds.push(loop.step(loadTorque(device, -0.3 * ts)).velocity * DEG);
        r.core.destroy();
        const dip = Math.min(...speeds);
        assert.ok(dip < 0.95 * target, `the load did slow it (to ${dip.toFixed(0)} °/s)`);
        // Recovered: from this step on, every speed is within 5 %.
        const k = speeds.findIndex((_, i) => speeds.slice(i).every(v => Math.abs(v - target) <= 0.05 * target));
        assert.ok(k >= 0 && k * STEP_MS < 300, `recovered after ${k * STEP_MS} ms`);
    });

    test(`(g) ${name}: no oscillation over 1 % of the speed at steady state, bare and loaded with inertia`, () => {
        // Bare: the output is the rotor alone (J ≈ ${Jr}); loaded: 1e-3 kg·m² more, a heavy arm.
        for (const disc of [{massKg: 0.04, radius: 0.01}, {massKg: 0.5, radius: 0.0632}]) {
            const r = rig({device, deviceId, disc});
            const loop = spikeLoop(r, device, deviceId);
            const target = 500;
            loop.motors.runAtSpeed('A', target);
            const speeds = [];
            for (let i = 0; i < 400; i++) speeds.push(loop.step().velocity * DEG);
            r.core.destroy();
            const last = speeds.slice(-100);
            const peakToPeak = Math.max(...last) - Math.min(...last);
            const mean = last.reduce((a, b) => a + b) / last.length;
            assert.ok(peakToPeak < 0.01 * target, `I ${discInertia(disc)}: peak-to-peak ${peakToPeak.toFixed(2)} °/s`);
            assert.ok(Math.abs(mean - target) < 0.01 * target, `I ${discInertia(disc)}: mean ${mean.toFixed(1)} °/s`);
        }
    });
}

test('every DC-motor number names its source', () => {
    for (const [, device] of MOTORS) {
        assert.ok(device.source.length > 0);
        for (const key of ['noLoadRadPerSec', 'stallTorqueNm', 'frictionTorqueNm', 'rotorInertiaKgM2', 'encoder']) {
            assert.ok(device.sources[key] && device.sources[key].source, `${device.id}.${key} has a source`);
        }
    }
    // The command the actuator gives a coasting motor carries the gearbox friction, a braking one only damping.
    assert.deepEqual(dcMotorCommand(SPIKE_MEDIUM_ANGULAR, 0, 'coast'), {mode: 'coast', frictionNm: SPIKE_MEDIUM_ANGULAR.motor.frictionTorqueNm});
    assert.equal(dcMotorCommand(SPIKE_MEDIUM_ANGULAR, 0, 'brake').torqueNm, 0);
});
