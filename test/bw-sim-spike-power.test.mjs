// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * "Start motor at % power" on the virtual SPIKE hub: an unregulated duty cycle into the motor's
 * DC model, not a speed the hub keeps. SPIKE 3 Python's motor.set_duty_cycle(port, -10000..10000)
 * and the 2.x hub module's hub.port.X.motor.pwm(-100..100) are what the spikeprime extension's
 * motorStartPower block sends (virtual-hub/spike-hub-commands.js reads both); the hub
 * (hubs/spike/spike-virtual-hub.js) hands the duty to the physics as it is.
 *
 * The rig is test/bw-sim-dc-motor.test.mjs's: a SPIKE medium motor on port A turning a disc, and on
 * the same axis a hinge the test loads (its dynamometer). Expectations are the DC model's own
 * line (physics/actuators.js): unloaded at duty u the motor runs at u·ω0; a load torque τL takes
 * it down the line to ω = ω0·(u − τL/τs) — and it STAYS there, where the hub's speed loop
 * (motor.run) brings the speed back within 300 ms.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {applyDrive, attachMotor} from '../overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js';
import {SPIKE_MEDIUM_ANGULAR} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';
import {SpikeVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js';
import {SPIKE_PRIME_PROFILE} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/profile.js';
import {STEP_MS} from '../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js';
import {applyHubPython} from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-commands.js';

const J = await loadJolt();
const DEG = 180 / Math.PI;
const DT = STEP_MS / 1000;
const device = SPIKE_MEDIUM_ANGULAR;
const {noLoadRadPerSec: w0, stallTorqueNm: ts} = device.motor;
const SUPPLY = SPIKE_PRIME_PROFILE.ports[0].supplyVolts;

/**
 * The motor on port A of a SPIKE hub, turning a 40 g disc on a vertical axis; port B's hinge on the
 * same axis is the dynamometer. With `arm`, the output is instead a box whose centre of mass is
 * arm.L out from a horizontal axis, under gravity (bw-sim-dc-motor.test.mjs's stall rig).
 */
const rig = ({arm = null} = {}) => {
    const motor = port => ({port, maxTorqueNm: ts, maxSpeedRadPerSec: w0, deviceId: 48});
    const axis = arm ? [0, 0, 1] : [0, 1, 0];
    const mechanism = {
        version: 1, gravity: arm ? [0, -9.81, 0] : [0, 0, 0],
        bodies: [
            {id: 'housing', motion: 'static', position: [0, -0.2, 0], rotation: [0, 0, 0, 1], massKg: 0,
                colliders: [{shape: 'box', halfExtents: [0.01, 0.01, 0.01]}], parts: []},
            arm
                ? {id: 'out', motion: 'dynamic', position: [arm.L, 0, 0], rotation: [0, 0, 0, 1], massKg: arm.massKg,
                    colliders: [{shape: 'box', halfExtents: [0.004, 0.002, 0.002]}], parts: []}
                : {id: 'out', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: 0.04,
                    colliders: [{shape: 'cylinder', radius: 0.01, halfHeight: 0.002}], parts: []}
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
    const hub = new SpikeVirtualHub();
    hub.plug([{port: 'A', class: 'motor', ids: {lpf2: 48}, device}]);
    let t = 0;
    let angle = core.jointState('jA').angle;
    return {
        core, hub, hubState: hub.hubState,
        /** One 5 ms step as SimHubBridge.step runs it; `load` sets the dynamometer first. Returns the step's drive and state. */
        step (load = null) {
            t += STEP_MS;
            hub.advanceTo(t);
            const drives = hub.readDrives();
            for (const d of drives) applyDrive(core, 'jA', d, mechanism.joints[0].motor, {device, supplyVolts: SUPPLY});
            if (load) core.setMotor('jB', load);
            core.step(DT);
            const s = core.jointState('jA');
            hub.writeReadings([{port: 'A', kind: 'encoder', angleRad: s.angle, deltaRad: s.angle - angle, radPerSec: s.velocity}]);
            angle = s.angle;
            return {drive: drives[0], speed: s.velocity * DEG, angle: s.angle * DEG};
        }
    };
};

/** A constant load torque on the dynamometer (Jolt needs some damping: 2 % of the motor's). */
const LOAD_DAMPING = 0.02 * ts / w0;
const loadTorque = torqueNm => ({mode: 'torque', torqueNm, dampingNmsPerRad: LOAD_DAMPING});

test('set_duty_cycle and pwm are read as a duty cycle; the hub drives that duty, unregulated', () => {
    for (const [statement, duty] of [
        ['import motor; from hub import port; motor.set_duty_cycle(port.A, 5000)', 0.5],
        ['motor.set_duty_cycle(port.A, -2500)', -0.25],
        ['import hub; hub.port.A.motor.pwm(50)', 0.5],
        ['hub.port.A.motor.pwm(-130)', -1]
    ]) {
        const r = rig();
        const {handled, unhandled} = applyHubPython(r.hubState, statement);
        assert.ok(handled, `${statement}: ${unhandled}`);
        const drives = [];
        for (let i = 0; i < 40; i++) drives.push(r.step().drive);
        r.core.destroy();
        assert.deepEqual([...new Set(drives.map(d => `${d.mode} ${d.duty} ${d.decay}`))], [`pwm ${duty} brake`],
            `${statement}: the same duty every step, no feedback`);
        assert.equal(r.hubState.motors.busy('A'), true, 'the port reports a running command');
    }
    // Duty 0 lets the motor coast (LWP3's StartPower 0 is FLOAT; the hub module's pwm(0) was a coast here already).
    const r = rig();
    applyHubPython(r.hubState, 'motor.set_duty_cycle(port.A, 5000)');
    for (let i = 0; i < 10; i++) r.step();
    applyHubPython(r.hubState, 'motor.set_duty_cycle(port.A, 0)');
    const {drive} = r.step();
    r.core.destroy();
    assert.deepEqual(drive, {port: 'A', mode: 'pwm', duty: 0, decay: 'coast'});
});

test('at 50 % power the motor runs at half its no-load speed, slows down its line under load and stays slow', t => {
    const r = rig();
    applyHubPython(r.hubState, 'import motor; from hub import port; motor.set_duty_cycle(port.A, 5000)');
    let free = 0;
    for (let i = 0; i < 200; i++) free = r.step().speed;
    // 30 % of the stall torque against it, for 1 s: down the line to ω0·(0.5 − 0.3), over the damping it now also turns.
    const loaded = [];
    for (let i = 0; i < 200; i++) loaded.push(r.step(loadTorque(-0.3 * ts)).speed);
    const reported = r.hubState.data.motors[0];
    r.core.destroy();
    const settled = loaded.at(-1);
    const predicted = w0 * (0.5 - 0.3) / (1 + 0.02) * DEG;
    t.diagnostic(`free ${free.toFixed(1)} °/s (u·ω0 ${(0.5 * w0 * DEG).toFixed(1)}); loaded ${settled.toFixed(1)} °/s ` +
        `(ω0·(u − τL/τs) ${predicted.toFixed(1)}); the hub reports ${reported.measuredDegPerSec.toFixed(1)} °/s, speed ${reported.speed} %`);
    assert.ok(Math.abs(free - 0.5 * w0 * DEG) < 0.03 * 0.5 * w0 * DEG, `free: ${free} °/s`);
    assert.ok(Math.abs(settled - predicted) < 0.05 * predicted, `loaded: ${settled} °/s vs ${predicted}`);
    // No speed regulation: the last half second is as slow as the line says, not pulled back up.
    assert.ok(Math.max(...loaded.slice(100)) < 0.5 * free, `stays slow: at most ${Math.max(...loaded.slice(100))} °/s`);
    // The hub reports what the shaft does (the extension's speed reporter reads it).
    assert.ok(Math.abs(reported.measuredDegPerSec - settled) < 1);
    assert.equal(reported.speed, Math.round(settled / 1110 * 100));
});

test('the same load against a SPEED (motor.run) is regulated away: the contrast', t => {
    const r = rig();
    const target = 0.5 * w0 * DEG * 0.9;
    applyHubPython(r.hubState, `motor.run(port.A, ${Math.round(target)})`);
    for (let i = 0; i < 200; i++) r.step();
    const loaded = [];
    for (let i = 0; i < 200; i++) loaded.push(r.step(loadTorque(-0.3 * ts)).speed);
    r.core.destroy();
    t.diagnostic(`speed loop at ${Math.round(target)} °/s under 0.3·τs: ends at ${loaded.at(-1).toFixed(1)} °/s`);
    assert.ok(Math.abs(loaded.at(-1) - Math.round(target)) < 0.05 * target, `the speed loop holds ${loaded.at(-1)} °/s`);
});

test('at 50 % power the motor holds a weight up to half its stall torque, and no more', t => {
    // An arm level on a horizontal axis, its weight m·g·L against the motor: at duty u and standstill the
    // motor pushes with u·τs (the DC line), so 3 % lighter than that it rises, 3 % heavier it sinks: it
    // stalls, as against an end stop, rather than the hub raising the duty to hold a speed.
    const L = 0.04;
    const after = factor => {
        const r = rig({arm: {L, massKg: factor * 0.5 * ts / (9.81 * L)}});
        applyHubPython(r.hubState, 'import motor; from hub import port; motor.set_duty_cycle(port.A, 5000)');
        let last = null;
        for (let i = 0; i < 40; i++) last = r.step();
        r.core.destroy();
        return last;
    };
    const lighter = after(0.97);
    const heavier = after(1.03);
    t.diagnostic(`u·τs ${(0.5 * ts * 100).toFixed(2)} N·cm: arm at 0.97·u·τs ${lighter.angle.toFixed(2)}°, at 1.03·u·τs ${heavier.angle.toFixed(2)}°`);
    assert.ok(lighter.angle > 0, `0.97·u·τs: the arm rose (${lighter.angle}°)`);
    assert.ok(heavier.angle < 0, `1.03·u·τs: the arm sank (${heavier.angle}°)`);
    assert.equal(heavier.drive.duty, 0.5, 'the duty stayed 0.5');
});
