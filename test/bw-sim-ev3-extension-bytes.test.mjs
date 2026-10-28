// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The bytes the REAL ev3comprehensive extension sends, run on the Robot Lab's EV3 brick
 * (hubs/ev3/; docs/ROBOT-LAB-EV3-NXT.md). Its blocks are called as the VM calls them, with a
 * backend that records each packet (as test/ev3-direct-bytecode.test.mjs does); every packet is then
 * executed by the brick, and what the brick did — and the reply it built — is checked against the
 * EV3 developer kits: outputs by bit field (A = 1 … D = 8), sensors by port 0–3, replies carrying
 * the command's globals [CDK §4.1] at the offsets the extension reads them from (a float at 0 for
 * READY_SI; an int8 speed at 0 and an int32 tacho at 4 for OUTPUT_READ).
 *
 * Over Scratch Link this extension sends nothing today (docs/ROBOT-LAB-EV3-NXT.md "Known open"); the
 * recorder stands in for its transport so that what it WOULD send is still proven to work.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {quietConsole} from './helpers/quiet-console.mjs';

quietConsole();

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {loadExtension} = await import('../scripts/spike/load-extension.mjs');
const {bundleSource} = await import('../scripts/spike/bundled-upstream.mjs');
const EV3 = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/hubs/ev3');
const {startDirectCommand, stepDirectCommand} = await import(path.join(EV3, 'ev3-direct-commands.js'));
const {Ev3VirtualHub} = await import(path.join(EV3, 'ev3-virtual-hub.js'));

const brick = () => {
    const hub = new Ev3VirtualHub({id: 'ev3'});
    assert.deepEqual(hub.plug([
        {port: 'B', class: 'motor', ids: {}, device: 'ev3-large-motor'},
        {port: 'C', class: 'motor', ids: {}, device: 'ev3-large-motor'},
        {port: '1', class: 'sensor', ids: {}, sensor: 'force', device: 'ev3-touch'},
        {port: '2', class: 'sensor', ids: {}, sensor: 'gyro', device: 'ev3-gyro'},
        {port: '3', class: 'sensor', ids: {}, sensor: 'color', device: 'ev3-color'},
        {port: '4', class: 'sensor', ids: {}, sensor: 'distance', device: 'ev3-ultrasonic'}
    ]), []);
    return hub;
};

/** First-order bench motors (as in test/bw-sim-ev3-direct-commands.test.mjs). */
const bench = (hub, ms, probes = {}, pose = null) => {
    hub.benchSpeeds = hub.benchSpeeds || new Map();
    const end = hub.s.timeMs + ms;
    for (let t = hub.s.timeMs + 5; t <= end + 1e-9; t += 5) {
        hub.advanceTo(t);
        const readings = hub.readDrives().map(d => {
            const spec = hub.specs.get('ABCD'.indexOf(d.port));
            const w0 = hub.benchSpeeds.get(d.port) || 0;
            const radPerSec = w0 + (d.duty * spec.noLoadRadPerSec - w0) * (1 - Math.exp(-0.005 / 0.04));
            hub.benchSpeeds.set(d.port, radPerSec);
            return {port: d.port, kind: 'encoder', angleRad: 0, deltaRad: (w0 + radPerSec) / 2 * 0.005, radPerSec};
        });
        for (const [port, raw] of Object.entries(probes)) readings.push({port, kind: 'probe', device: raw.kind, raw});
        hub.writeReadings(readings, pose);
        hub.publish();
    }
};

/** The extension, its packets recorded: a block call → the packets it sent. */
const wired = () => {
    const instance = loadExtension(bundleSource('ev3comprehensive'));
    const sent = [];
    instance.ev3.backend = {send: async packet => { sent.push(Uint8Array.from(packet)); return true; }, disconnect: async () => {}};
    instance.ev3.isConnected = () => true;
    return {
        instance,
        /** Calls a block, does not wait for an answer that will not come; returns its packets. */
        packets (fn) {
            sent.length = 0;
            const result = fn();
            if (result && typeof result.catch === 'function') result.catch(() => {});
            return [...sent];
        }
    };
};

const run = (hub, packet) => {
    const ctx = startDirectCommand(packet);
    const out = stepDirectCommand(ctx, hub);
    assert.equal(out.done, true);
    assert.equal(out.error, null, `the brick ran ${ctx.trace.map(x => x.op).join(', ')}`);
    return {reply: out.reply, ops: ctx.trace.map(x => x.op)};
};
const float = (reply, at) => new DataView(reply.buffer, reply.byteOffset + 5 + at, 4).getFloat32(0, true);

test('motors: run (SPEED + START on the B+C bit field), run for degrees (STEP_SPEED to its tacho count), stop', () => {
    const {instance, packets} = wired();
    const hub = brick();
    const [start] = packets(() => instance.motorRun({PORT: 'BC', POWER: 40}));
    assert.deepEqual(run(hub, start).ops, ['opOUTPUT_SPEED', 'opOUTPUT_START']);
    for (const i of [1, 2]) assert.deepEqual([hub.s.outputs[i].started, hub.s.outputs[i].level], [true, {kind: 'speed', value: 40}]);
    bench(hub, 300);
    assert.ok(hub.s.outputs[1].angleDeg > 50, 'B turns');
    const [stop] = packets(() => instance.motorStop({PORT: 'BC', BRAKE: 'brake'}));
    run(hub, stop);
    assert.deepEqual(hub.readDrives().filter(d => d.port !== 'A').map(d => d.decay), ['brake', 'brake']);
    const from = hub.s.outputs[1].angleDeg;
    bench(hub, 500);
    const [degrees] = packets(() => instance.motorRunDegrees({PORT: 'B', POWER: 50, DEGREES: 360}));
    assert.deepEqual(run(hub, degrees).ops, ['opOUTPUT_STEP_SPEED']);
    assert.equal(hub.s.outputs[1].busy, true);
    bench(hub, 3000);
    assert.equal(hub.s.outputs[1].busy, false, 'the cycle ended on its count');
    assert.ok(hub.s.outputs[1].angleDeg - from >= 360, `${(hub.s.outputs[1].angleDeg - from).toFixed(1)}°`);
});

test('tank drive: TIME_POWER on B (left) and C (right), ending with a brake', () => {
    const {instance, packets} = wired();
    const hub = brick();
    const [p] = packets(() => instance.tankDrive({LEFT: 30, RIGHT: 50, VALUE: 1, UNIT: 'seconds'}));
    assert.deepEqual(run(hub, p).ops, ['opOUTPUT_TIME_POWER', 'opOUTPUT_TIME_POWER']);
    assert.deepEqual([hub.s.outputs[1].job.value, hub.s.outputs[2].job.value], [30, 50]);
    assert.equal(hub.s.outputs[2].job.brake, true);
    bench(hub, 1100);
    assert.equal(hub.s.outputs[1].busy || hub.s.outputs[2].busy, false);
    assert.ok(hub.s.outputs[2].angleDeg > hub.s.outputs[1].angleDeg, 'the right side, at 50 %, turned further');
});

test('motor position: OUTPUT_READ\'s reply has the speed at global 0 and the tacho at 4', () => {
    const {instance, packets} = wired();
    const hub = brick();
    run(hub, packets(() => instance.motorRun({PORT: 'C', POWER: 30}))[0]);
    bench(hub, 400);
    const [read] = packets(() => instance.motorPosition({PORT: 'C'}));
    const {reply, ops} = run(hub, read);
    assert.deepEqual(ops, ['opOUTPUT_READ']);
    assert.equal(reply[4], 0x02);
    const view = new DataView(reply.buffer, reply.byteOffset + 5);
    assert.equal(view.getInt32(4, true), Math.trunc(hub.s.outputs[2].angleDeg));
    assert.ok(Math.abs(view.getInt8(0) - 30) <= 3, `speed ${view.getInt8(0)} %`);
});

test('sensors: touch, colour (reflected, colour id), ultrasonic (cm, inch), gyro (angle, its reset) — a float at global 0', () => {
    const {instance, packets} = wired();
    const hub = brick();
    bench(hub, 5, {1: {kind: 'force', pressed: true}, 3: {kind: 'color', color: 5, reflection: 47},
        4: {kind: 'distance', distance: 372, rangeMm: 372}}, {headingDeg: -90, rateDegPerSec: 0});
    const si = fn => {
        const [p] = packets(fn);
        return float(run(hub, p).reply, 0);
    };
    assert.equal(si(() => instance.touchSensor({PORT: '1'})), 1);
    assert.equal(si(() => instance.colorSensor({PORT: '3', MODE: 'reflected'})), 47);
    assert.equal(si(() => instance.colorSensor({PORT: '3', MODE: 'color'})), 3, 'SPIKE green (5) is EV3 green (3)');
    assert.ok(Math.abs(si(() => instance.ultrasonicSensor({PORT: '4', UNIT: 'cm'})) - 37.2) < 1e-4);
    // The extension converts inches itself: it reads cm (mode 0) for both units.
    assert.ok(Math.abs(si(() => instance.ultrasonicSensor({PORT: '4', UNIT: 'inch'})) - 37.2) < 1e-4);
    assert.equal(si(() => instance.gyroSensor({PORT: '2', MODE: 'angle'})), -90, 'turned left a quarter');
    const [reset] = packets(() => instance.gyroReset({PORT: '2'}));
    assert.deepEqual(run(hub, reset).ops, ['opINPUT_DEVICE CLR_CHANGES']);
    bench(hub, 5, {}, {headingDeg: -80, rateDegPerSec: 0});
    assert.equal(si(() => instance.gyroSensor({PORT: '2', MODE: 'angle'})), 10);
});

test('sound and screen: a tone, text, a clear — recorded by the brick as events', () => {
    const {instance, packets} = wired();
    const hub = brick();
    run(hub, packets(() => instance.playTone({FREQ: 440, DURATION: 500}))[0]);
    assert.equal(hub.events.at(-1).kind, 'tone');
    assert.equal(hub.events.at(-1).frequency, 440);
    for (const p of packets(() => instance.screenClear())) run(hub, p);
    assert.ok(hub.events.some(e => e.op === 'FILLWINDOW'));
    for (const p of packets(() => instance.screenText({TEXT: 'Hi', X: 10, Y: 20}))) run(hub, p);
    assert.ok(hub.events.some(e => e.op === 'TEXT' && e.text === 'Hi'), JSON.stringify(hub.events.map(e => e.op)));
});
