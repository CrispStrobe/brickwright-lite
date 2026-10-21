// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Authored model controls. These do not establish physical-hardware accuracy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {applyHubPython} from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-commands.js';
import {SpikeVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js';
import {powerDrive} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-motor-controller.js';
import {SPIKE_MEDIUM_ANGULAR as DEVICE} from '../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';
import {dcMotorCommand, applyDrive, attachMotor} from '../overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js';

const DEG = 180 / Math.PI;
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`);
const command = (hub, source) => {
    const result = applyHubPython(hub, source);
    assert.equal(result.handled, true);assert.deepEqual(result.unhandled, []);
    return result;
};
const lab = () => {
    const hub = new SpikeVirtualHub();
    assert.deepEqual(hub.plug([{port: 'A', class: 'motor', ids: {lpf2: 48}, device: DEVICE.id}]), []);
    return hub;
};

test('SPIKE 2 percent PWM and SPIKE 3 hundredth-percent duty share signed clamped power', () => {
    const hub = new Hub();
    for (const [source, duty] of [
        ['hub.port.A.motor.pwm(-25)', -0.25],
        ['hub.port.A.motor.start_at_power(250)', 1],
        ['motor.set_duty_cycle(port.A, -2500)', -0.25],
        ['motor.set_duty_cycle(port.A, -25000)', -1],
        ['motor.set_duty_cycle(port.F, 1250)', 0.125]
    ]) {
        command(hub, source);
        const index = source.includes('port.F') ? 5 : 0;
        assert.equal(hub.backend._controllers[index].mode, 'power');
        assert.equal(hub.backend._controllers[index].duty, duty);
    }
    const before = structuredClone(hub.data);
    for (const source of ['motor.set_duty_cycle(port.G, 100)', 'hub.port.Z.motor.pwm(10)',
        'motor.set_duty_cycle(port.A, NaN)', 'hub.port.A.motor.pwm(1 + 2)']) {
        const result = applyHubPython(hub, source);
        assert.equal(result.handled, false);assert.deepEqual(result.unhandled, [source]);
        assert.deepEqual(hub.data, before);
    }
    for (const value of [NaN, Infinity, -Infinity, '50']) assert.throws(() => hub.motors.runAtPower('A', value), TypeError);
    assert.throws(() => hub.motors.runAtPower('Z', 50), RangeError);
});

test('regulated run_at_speed and motor.run retain speed units rather than becoming duty', () => {
    const hub = new Hub();
    command(hub, 'hub.port.A.motor.run_at_speed(25)');
    assert.equal(hub.backend._controllers[0].mode, 'speed');
    const requested = hub.backend._controllers[0].requested;
    command(hub, 'hub.port.A.motor.pwm(25)');
    assert.equal(hub.backend._controllers[0].mode, 'power');
    command(hub, 'motor.run(port.A, 123)');
    assert.equal(hub.backend._controllers[0].mode, 'speed');
    assert.ok(hub.backend._controllers[0].requested > 0);
    assert.notEqual(hub.backend._controllers[0].requested, requested);
});

test('independent duty integrates the existing DC rotor model and opposing load, not a speed servo', () => {
    const speeds = [];
    for (const load of [0, 0.2, 1]) {
        const hub = new Hub();
        hub.motors.setLoad('A', load);
        hub.motors.runAtPower('A', 50);
        hub.stepMotors(1000);
        speeds.push(hub.data.motors[0].degPerSec);
        assert.equal(hub.backend._controllers[0].mode, 'power');
        assert.equal(hub.backend._controllers[0].duty, 0.5);
        assert.equal(hub.motors.busy('A'), true);
        assert.equal(hub.motors.done('A'), false);
        if (load === 1) assert.equal(hub.data.motors[0].stalled, true);
    }
    // Prediction of the existing nominal-voltage torque/back-EMF line, not a
    // constant copied from the power command or a physical motor measurement.
    const model = dcMotorCommand(DEVICE, 0.5, 'brake');
    near(speeds[0], model.torqueNm / model.dampingNmsPerRad * DEG, 1);
    assert.ok(speeds[1] > 0 && speeds[1] < speeds[0] * 0.8);
    assert.equal(speeds[2], 0);
    const reverse = new Hub();reverse.motors.runAtPower('A', -50);reverse.stepMotors(1000);
    near(reverse.data.motors[0].degPerSec, -speeds[0], 1);
    assert.ok(reverse.data.motors[0].position < 0);
});

test('power replacement interrupts finite motion once and preserves waits, Stop and zero coast', async () => {
    const hub = new Hub();
    const finite = hub.motors.runForTime('A', 500, 300);
    const waiting = hub.backend.wait(50);
    let completions = 0;finite.then(() => completions++);
    command(hub, 'hub.port.A.motor.pwm(40)');
    assert.equal(await finite, 'interrupted');assert.equal(completions, 1);
    hub.stepMotors(50);assert.equal(await waiting, 'completed');
    const next = hub.motors.runForTime('A', 1000, 100);
    command(hub, 'motor.set_duty_cycle(port.A, 0)');
    assert.equal(await next, 'interrupted');
    assert.equal(hub.backend._controllers[0].mode, 'stop');
    assert.equal(hub.backend._controllers[0].action, 'coast');
    command(hub, 'motor.set_duty_cycle(port.A, 4000)');
    const cancelled = hub.backend.wait(1000);
    hub.stopAll();assert.equal(await cancelled, 'interrupted');
    assert.equal(hub.backend._controllers[0].mode, 'idle');
    assert.equal(hub.data.motors[0].degPerSec, 0);
    const position = hub.data.motors[0].position;
    hub.stepMotors(100);assert.equal(hub.data.motors[0].position, position);
    hub.backend.dispose();assert.throws(() => hub.motors.runAtPower('A', 10), /disposed/);
});

test('Lab duty bypasses feedback on a blocked encoder and preserves reversal and measured position', () => {
    const hub = lab();
    try {
        command(hub.hubState, 'motor.set_duty_cycle(port.A, 3000)');
        for (let t = 5; t <= 100; t += 5) {
            hub.advanceTo(t);
            assert.deepEqual(hub.readDrives(), [{port: 'A', mode: 'pwm', duty: 0.3, decay: 'brake'}]);
            hub.writeReadings([{port: 'A', kind: 'encoder', deltaRad: 0, radPerSec: 0}]);
            assert.equal(hub.readPort('A').angleDeg, 0);
            assert.equal(hub.dc.get(0).integral, 0, 'no PI windup in open-loop mode');
        }
        command(hub.hubState, 'hub.port.A.motor.pwm(-30)');hub.advanceTo(105);
        assert.equal(hub.readDrives()[0].duty, -0.3);
        assert.equal(hub.directCommand('A', {speedDps: 300}).ok, true);
        for (let t = 110; t <= 310; t += 5) hub.advanceTo(t);
        assert.equal(hub.hubState.backend._controllers[0].mode, 'speed');
        assert.ok(hub.readDrives()[0].duty > 0.3, 'blocked regulated speed asks for extra torque');
        assert.equal(hub.directCommand('A', {power: 30}).ok, true);hub.advanceTo(315);
        assert.equal(hub.readDrives()[0].duty, 0.3);
        const saved = hub.exportState();
        const mirror = lab();
        try {mirror.importState(saved);assert.equal(mirror.stateKey(mirror.exportState()), hub.stateKey(saved));}
        finally {mirror.dispose();}
    } finally {hub.dispose();}
});

test('Lab zero power opens the bridge; later stop and speed own the same port', () => {
    const hub = lab();
    try {
        assert.equal(hub.directCommand('A', {power: 500}).ok, true);hub.advanceTo(5);
        assert.equal(hub.readDrives()[0].duty, 1);
        command(hub.hubState, 'hub.port.A.motor.pwm(0)');hub.advanceTo(10);
        assert.deepEqual(hub.readDrives()[0], {port: 'A', mode: 'pwm', duty: 0, decay: 'coast'});
        hub.directCommand('A', {power: -50});hub.advanceTo(15);
        hub.directCommand('A', {stop: 'brake'});hub.advanceTo(20);
        assert.deepEqual(hub.readDrives()[0], {port: 'A', mode: 'pwm', duty: 0, decay: 'brake'});
        assert.equal(hub.directCommand('Z', {power: 20}).ok, false);
        assert.equal(hub.directCommand('A', {power: NaN}).ok, false);
        assert.equal(hub.directCommand('A', {speedDps: 100}).ok, true);hub.advanceTo(25);
        assert.equal(hub.hubState.backend._controllers[0].mode, 'speed');
    } finally {hub.dispose();}
});

test('power model clocks and validation cannot acquire a foreign backend or nonfinite duty', () => {
    const hub = new Hub();hub.clockOwner = 'foreign';
    assert.throws(() => hub.motors.runAtPower('A', 10), /owned/);
    assert.equal(hub.backend._controllers[0].mode, 'idle');
    for (const value of [NaN, Infinity, undefined, '0.5']) assert.throws(() => powerDrive(value), TypeError);
    assert.deepEqual(powerDrive(-2), {mode: 'pwm', duty: -1, decay: 'brake'});
    assert.deepEqual(powerDrive(0), {mode: 'pwm', duty: 0, decay: 'coast'});
});

test('actual Lab DC physics slows fixed duty under load and holds a blocked shaft without increasing duty', async () => {
    const {loadJolt, createPhysicsCore} = await import('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js');
    const J = await loadJolt();
    const motor = port => ({port, maxTorqueNm: DEVICE.motor.stallTorqueNm, maxSpeedRadPerSec: DEVICE.motor.noLoadRadPerSec, deviceId: 48});
    const run = load => {
        const mechanism = {version: 1, gravity: [0, 0, 0],
            bodies: [
                {id: 'housing', motion: 'static', position: [0, -0.2, 0], rotation: [0, 0, 0, 1], massKg: 0,
                    colliders: [{shape: 'box', halfExtents: [0.01, 0.01, 0.01]}], parts: []},
                {id: 'out', motion: 'dynamic', position: [0, 0, 0], rotation: [0, 0, 0, 1], massKg: 0.04,
                    colliders: [{shape: 'cylinder', radius: 0.01, halfHeight: 0.002}], parts: []}],
            joints: ['A', 'B'].map(port => ({id: 'j' + port, type: 'hinge', body1: 'housing', body2: 'out',
                point: [0, 0, 0], axis: [0, 1, 0], motor: motor(port)})), gears: [], diagnostics: []};
        const core = createPhysicsCore(J, mechanism, {stepHz: 200});
        const hub = lab();attachMotor(core, 'jA', DEVICE);
        core.setMotor('jB', load === 'blocked' ? {mode: 'brake'} : load ?
            {mode: 'torque', torqueNm: -0.2 * DEVICE.motor.stallTorqueNm, dampingNmsPerRad: 0} : {mode: 'coast'});
        command(hub.hubState, 'motor.set_duty_cycle(port.A, 5000)');
        let angle = 0;
        try {
            for (let i = 1; i <= 200; i++) {
                hub.advanceTo(i * 5);
                const drive = hub.readDrives()[0];assert.equal(drive.duty, 0.5);
                applyDrive(core, 'jA', drive, motor('A'), {device: DEVICE});
                core.step(0.005);
                const s = core.jointState('jA');
                hub.writeReadings([{port: 'A', kind: 'encoder', deltaRad: s.angle - angle, radPerSec: s.velocity}]);
                angle = s.angle;
            }
            return core.jointState('jA').velocity;
        } finally {hub.dispose();core.destroy();}
    };
    const free = run(null), loaded = run('loaded'), blocked = run('blocked');
    assert.ok(free > 0);assert.ok(loaded > 0 && loaded < free * 0.8);
    assert.ok(Math.abs(blocked) < free * 0.02, 'second hinge physically blocks the powered shaft');
});
