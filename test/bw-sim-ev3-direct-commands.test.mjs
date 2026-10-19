// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * EV3 direct commands, byte for byte (hubs/ev3/ev3-direct-commands.js, ev3-virtual-hub.js,
 * ev3-peripheral.js; docs/ROBOT-LAB-EV3-NXT.md).
 *
 * Every frame below is written out HERE from LEGO's public documents, not produced by the code
 * under test: the "EV3 Communication Developer Kit" [CDK] §4 (frame: length LE, message counter
 * LE, type 0x00 reply / 0x80 no reply, allocation bytes llllllgg gggggggg), §4.1 (reply: length,
 * counter, 0x02 DIRECT_REPLY / 0x04 DIRECT_REPLY_ERROR, then the globals) and its worked
 * examples §4.2.2–§4.2.6 (their hex, with the counter filled in), and the "EV3 Firmware
 * Developer Kit" [FDK] §3.4 (parameter encoding), §4.8–§4.10 and §5 (device types).
 *
 * The motors here turn on a bench with no physics: a first-order motor (its speed approaches duty ×
 * its no-load speed with a 40 ms time constant) (enough to watch a cycle end on its tacho count). The physics runs in
 * test/bw-sim-ev3-hub.test.mjs.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EV3 = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/hubs/ev3');
const {readParam, parseFrame, startDirectCommand, stepDirectCommand} = await import(path.join(EV3, 'ev3-direct-commands.js'));
const {Ev3VirtualHub, SPEED_FULL_SCALE_DPS} = await import(path.join(EV3, 'ev3-virtual-hub.js'));
const {createEv3Session} = await import(path.join(EV3, 'ev3-peripheral.js'));
const {hubRegistry} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/hubs/index.js'));
const {validateHubProfile} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/hubs/hub-profile.js'));

const hex = text => Uint8Array.from(text.replace(/\s+/g, '').match(/../g).map(h => parseInt(h, 16)));
const f32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return [...b]; };
const i32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return [...b]; };

/** A brick with large motors on B and C, medium on A, touch 1, colour 3, ultrasonic 4, gyro 2. */
const brick = () => {
    const hub = new Ev3VirtualHub({id: 'ev3'});
    const refusals = hub.plug([
        {port: 'A', class: 'motor', ids: {}, device: 'ev3-medium-motor'},
        {port: 'B', class: 'motor', ids: {}, device: 'ev3-large-motor'},
        {port: 'C', class: 'motor', ids: {}, device: 'ev3-large-motor'},
        {port: '1', class: 'sensor', ids: {}, sensor: 'force', device: 'ev3-touch'},
        {port: '2', class: 'sensor', ids: {}, sensor: 'gyro', device: 'ev3-gyro'},
        {port: '3', class: 'sensor', ids: {}, sensor: 'color', device: 'ev3-color'},
        {port: '4', class: 'sensor', ids: {}, sensor: 'distance', device: 'ev3-ultrasonic'}
    ]);
    assert.deepEqual(refusals, []);
    return hub;
};

/** The bench motor's mechanical time constant, s (a wheel on the motor: tens of ms). */
const TAU_S = 0.04;
const benchSpeeds = new WeakMap();
const bench = (hub, ms, probes = {}, pose = null) => {
    const end = hub.s.timeMs + ms;
    if (!benchSpeeds.has(hub)) benchSpeeds.set(hub, new Map());
    const speeds = benchSpeeds.get(hub);
    for (let t = hub.s.timeMs + 5; t <= end + 1e-9; t += 5) {
        hub.advanceTo(t);
        const readings = hub.readDrives().map(d => {
            const spec = hub.specs.get('ABCD'.indexOf(d.port));
            // First order: the shaft approaches duty × no-load speed with a time constant TAU_S
            // (braked or floating at duty 0: it slows down the same way).
            const w0 = speeds.get(d.port) || 0;
            const radPerSec = w0 + (d.duty * spec.noLoadRadPerSec - w0) * (1 - Math.exp(-0.005 / TAU_S));
            speeds.set(d.port, radPerSec);
            return {port: d.port, kind: 'encoder', angleRad: 0, deltaRad: (w0 + radPerSec) / 2 * 0.005, radPerSec};
        });
        for (const [port, raw] of Object.entries(probes)) readings.push({port, kind: 'probe', device: raw.kind, raw});
        hub.writeReadings(readings, pose);
        hub.publish();
    }
};

/** Runs one frame to its end; returns the reply bytes (or null) and the trace. */
const run = (hub, frame) => {
    const ctx = startDirectCommand(frame);
    const out = stepDirectCommand(ctx, hub);
    assert.equal(out.done, true, `the command finished (blocked on ${out.blocked})`);
    return {reply: out.reply ? [...out.reply] : null, trace: ctx.trace, error: out.error};
};

test('the EV3 is a registered hub family: outputs A–D, inputs 1–4, PWM drive; it refuses what it cannot take', () => {
    const profile = hubRegistry.get('ev3').profile;
    assert.deepEqual(validateHubProfile(profile), []);
    assert.deepEqual(profile.ports.map(p => p.id), ['A', 'B', 'C', 'D', '1', '2', '3', '4']);
    assert.deepEqual(profile.parts, ['95646.dat']);
    const hub = hubRegistry.create('ev3', {id: 'ev3'});
    const refusals = hub.plug([
        {port: '1', class: 'motor', ids: {}, device: 'ev3-large-motor'},
        {port: 'A', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: '2', class: 'sensor', ids: {}, sensor: 'color', device: 'spike-color'},
        {port: 'E', class: 'motor', ids: {}, device: 'ev3-large-motor'}
    ]);
    assert.deepEqual(refusals.map(r => r.code), ['port-refuses-device', 'port-refuses-device', 'port-refuses-device', 'port-unknown']);
});

test('parameter encoding [FDK §3.4]: short and long constants, variables, strings', () => {
    // 0 0 s vvvvv: short constants, 6-bit two's complement.
    assert.deepEqual(readParam([0x05], 0), {pc: 1, kind: 'const', value: 5});
    assert.deepEqual(readParam([0x3f], 0), {pc: 1, kind: 'const', value: -1});
    assert.deepEqual(readParam([0x20], 0), {pc: 1, kind: 'const', value: -32});
    // 0 1 g iiiii: short variables (0x60 = global 0, 0x44 = local 4).
    assert.deepEqual(readParam([0x60], 0), {pc: 1, kind: 'var', global: true, index: 0, handle: false});
    assert.deepEqual(readParam([0x44], 0), {pc: 1, kind: 'var', global: false, index: 4, handle: false});
    // 1 0 - - - bbb: long constants of 1, 2, 4 bytes; 0x84 a zero-terminated string.
    assert.equal(readParam([0x81, 0xce], 0).value, -50);
    assert.equal(readParam([0x82, 0xe8, 0x03], 0).value, 1000);
    assert.equal(readParam([0x83, 0x00, 0x00, 0x01, 0x00], 0).value, 65536);
    assert.deepEqual(readParam([0x84, 0x75, 0x69, 0x00, 0x99], 0), {pc: 4, kind: 'string', text: 'ui'});
    // 1 1 g - - bbb: long variable, index in the following byte (0xE1 = global, 1 byte).
    assert.deepEqual(readParam([0xe1, 0x20], 0), {pc: 2, kind: 'var', global: true, index: 32, handle: false});
});

test('the frame [CDK §4]: length, counter, type, 10 bits of globals and 6 of locals', () => {
    const f = parseFrame(hex('0700 3412 00 0105 01 00'));
    assert.equal(f.length, 7);
    assert.equal(f.counter, 0x1234);
    assert.equal(f.type, 0x00);
    assert.equal(f.globals, 0x101, 'byte 5 + the two low bits of byte 6');
    assert.equal(f.locals, 1, 'the six high bits of byte 6');
    assert.throws(() => parseFrame(hex('0900 3412 00 0105 01')), /says 9 bytes follow, 6 do/);
});

test('[CDK §4.2.2] motors B and C at speed 50 for 900 + 180 degrees, braking at the end', () => {
    const hub = brick();
    // 1200 xxxx 80 0000 AE 00 06 8132 00 828403 82B400 01 — counter 0x0007.
    const {reply, trace} = run(hub, hex('1200 0700 80 0000 AE 00 06 8132 00 828403 82B400 01'));
    assert.equal(reply, null, 'no reply asked');
    assert.deepEqual(trace.map(x => x.op), ['opOUTPUT_STEP_SPEED']);
    const [, b, c] = hub.s.outputs;
    for (const p of [b, c]) {
        assert.equal(p.busy, true);
        assert.deepEqual(p.job.steps, [0, 900, 180]);
        assert.equal(p.job.regulated, true);
        assert.equal(p.job.brake, true);
    }
    assert.equal(hub.s.outputs[0].busy, false, 'A is not in the bit field 0x06');
    bench(hub, 4000);
    for (const p of [b, c]) {
        assert.equal(p.busy, false, 'the cycle ended');
        assert.ok(p.angleDeg >= 1080 && p.angleDeg < 1080 + 10, `ended on its tacho count: ${p.angleDeg.toFixed(1)}°`);
        assert.equal(p.decay, 'brake');
    }
});

test('[CDK §4.2.3] READY_SI on port 3 mode 0 into global 0: the reply carries the float', () => {
    const hub = brick();
    bench(hub, 5, {3: {kind: 'color', color: 10, reflection: 63}});
    // 0D00 xxxx 00 0400 99 1D 00 02 00 00 01 60 — counter 0x002A, 4 bytes of globals.
    const {reply} = run(hub, hex('0D00 2A00 00 0400 99 1D 00 02 00 00 01 60'));
    // Reply: length 7, counter, 0x02 DIRECT_REPLY, 4 bytes = float 63.0.
    assert.deepEqual(reply, [0x07, 0x00, 0x2a, 0x00, 0x02, ...f32(63)]);
});

test('[CDK §4.2.4] port 1 as COLOR (mode 2): a colour id 0–7', () => {
    const hub = brick();
    hub.plug([{port: '1', class: 'sensor', ids: {}, sensor: 'color', device: 'ev3-color'}]);
    bench(hub, 5, {1: {kind: 'color', color: 9, reflection: 40}});
    const {reply} = run(hub, hex('0D00 0100 00 0400 99 1D 00 00 00 02 01 60'));
    assert.deepEqual(reply.slice(5), f32(5), 'SPIKE red (9) is EV3 red (5)');
    assert.equal(hub.s.inputs[0].mode, 2, 'the mode is set on the port');
});

test('[CDK §4.2.5] a 1 kHz tone at level 2 for 1 s; [CDK §4.2.6] clear, picture, update', () => {
    const hub = brick();
    run(hub, hex('0F00 0000 80 0000 94 01 8102 82E803 82E803'));
    assert.deepEqual(hub.events.at(-1), {t: 0, kind: 'tone', volume: 2, frequency: 1000, duration: 1000});
    assert.equal(hub.soundBusy(), true);
    bench(hub, 1000);
    assert.equal(hub.soundBusy(), false, 'the tone lasts its duration');
    const picture = hex('2C00 0000 80 0000 84 13 00 820000 820000 84 1C 01 820000 823200 84 75692F6D696E6473746F726D732E72676600 84 00');
    const {trace} = run(hub, picture);
    assert.deepEqual(trace.map(x => x.op), ['opUI_DRAW FILLWINDOW', 'opUI_DRAW BMPFILE', 'opUI_DRAW UPDATE']);
    assert.deepEqual(hub.events.filter(e => e.kind === 'draw').map(e => e.op), ['FILLWINDOW', 'BMPFILE', 'UPDATE']);
    assert.equal(hub.events.find(e => e.op === 'BMPFILE').name, 'ui/mindstorms.rgf');
});

test('INPUT_DEVICE_LIST [FDK §4.8]: inputs at 0–3, outputs at 16–19 [FDK §5 types], what the stock extension polls', () => {
    const hub = brick();
    // 98 81 20 60 E1 20 20: LENGTH 32 into global 0 …, CHANGED into global 32 (0xE1 0x20), 33 bytes.
    const {reply} = run(hub, hex('0B00 0000 00 2100 98 8120 60 E120')); // 0x21 = 33 globals
    assert.equal(reply[4], 0x02);
    const types = reply.slice(5, 5 + 32);
    assert.deepEqual(types.slice(0, 4), [16, 32, 29, 30], 'touch, gyro, colour, ultrasonic on 1–4');
    assert.deepEqual(types.slice(16, 20), [8, 7, 7, 126], 'medium A, large B and C, nothing on D');
    assert.equal(reply[5 + 32], 0, 'changed');
});

test('motors as the stock Scratch EV3 extension drives them: TIME_SPEED with ramps, GET_COUNT, STOP coast', () => {
    const hub = brick();
    // The stock extension's turnOnFor(1000 ms) at power 50 on port B (bit field 2): ramp 50 ms each side.
    const {reply} = run(hub, hex('1200 0000 80 0000 AF 00 02 8132 8132 828403 8132 01'));
    assert.equal(reply, null);
    assert.deepEqual(hub.s.outputs[1].job.steps, [50, 900, 50]);
    assert.equal(hub.s.outputs[1].job.unit, 'ms');
    bench(hub, 600);
    assert.equal(hub.s.outputs[1].busy, true);
    bench(hub, 500);
    assert.equal(hub.s.outputs[1].busy, false, 'over after 1000 ms');
    const turned = hub.s.outputs[1].angleDeg;
    // Its poll: GET_COUNT of port number 1 (the stock extension's comment: a NUMBER, not a bit field) into global 0.
    const count = run(hub, hex('0900 0100 00 0400 B3 00 01 60'));
    assert.deepEqual(count.reply.slice(5), i32(Math.trunc(turned)));
    // 90% of 1050 °/s regulated, for 1 s with 50 ms ramps: the ideal bench turns ~ 500 °/s × 0.95 s.
    const expected = 0.5 * SPEED_FULL_SCALE_DPS[7] * 0.95;
    assert.ok(Math.abs(turned - expected) < 40, `${turned.toFixed(0)}° vs ${expected.toFixed(0)}°`);
    run(hub, hex('0900 0000 80 0000 A3 00 02 00'));
    assert.equal(hub.s.outputs[1].decay, 'coast');
});

test('OUTPUT_READ, OUTPUT_RESET and CLR_COUNT keep two counters; POLARITY turns a motor round', () => {
    const hub = brick();
    run(hub, hex('0D00 0000 80 0000 A4 00 01 8132 A6 00 01')); // POWER A 50, START A
    bench(hub, 200);
    const a = hub.s.outputs[0];
    assert.ok(a.angleDeg > 0);
    run(hub, hex('0800 0000 80 0000 A2 00 01')); // RESET A: the tacho count
    bench(hub, 100);
    const read = run(hub, hex('0A00 0000 00 0800 A8 00 00 60 64')); // READ port 0: speed → g0, tacho → g4
    const speed = (read.reply[5] << 24) >> 24;
    const tacho = new DataView(Uint8Array.from(read.reply.slice(9)).buffer).getInt32(0, true);
    assert.ok(speed > 40 && speed <= 55, `speed ${speed} % of full scale`);
    assert.ok(tacho > 0 && tacho < a.angleDeg, `the tacho counts from the reset (${tacho} < ${a.angleDeg.toFixed(0)})`);
    const count = run(hub, hex('0900 0000 00 0400 B3 00 00 60'));
    assert.equal(new DataView(Uint8Array.from(count.reply.slice(5)).buffer).getInt32(0, true), Math.trunc(a.angleDeg), 'the sensor count did not reset');
    run(hub, hex('0900 0000 80 0000 A7 00 01 3F')); // POLARITY A -1 (short constant 0x3F)
    const before = a.angleDeg;
    bench(hub, 100);
    assert.ok(a.angleDeg > before, 'the firmware counts in its own direction');
    assert.ok(hub.readDrives().find(d => d.port === 'A').duty < 0, 'the motor turns the other way');
});

test('sensors in SI [FDK §5]: touch and bumps, ultrasonic cm and inch, gyro angle and its reset', () => {
    const hub = brick();
    const si = (port, mode) => {
        const {reply} = run(hub, Uint8Array.from([0x0d, 0, 0, 0, 0x00, 4, 0, 0x99, 0x1d, 0, port, 0, mode & 0x3f, 1, 0x60]));
        return new DataView(Uint8Array.from(reply.slice(5)).buffer).getFloat32(0, true);
    };
    bench(hub, 5, {1: {kind: 'force', pressed: true}, 4: {kind: 'distance', distance: 427}}, {headingDeg: 30, rateDegPerSec: 12});
    assert.equal(si(0, 0), 1);
    bench(hub, 5, {1: {kind: 'force', pressed: false}, 4: {kind: 'distance', distance: -1}}, {headingDeg: 30, rateDegPerSec: 0});
    assert.equal(si(0, 0), 0);
    assert.equal(si(0, 1), 1, 'one bump');
    assert.equal(si(3, 0), 255, 'nothing echoes: 255 cm');
    bench(hub, 5, {4: {kind: 'distance', distance: 427}});
    assert.ok(Math.abs(si(3, 0) - 42.7) < 1e-4);
    assert.ok(Math.abs(si(3, 1) - 16.8) < 1e-4, 'inch, to 0.1');
    assert.equal(si(1, 0), 30, 'gyro: the heading since plug');
    run(hub, hex('0900 0000 80 0000 99 1A 00 01')); // CLR_CHANGES port 2
    bench(hub, 5, {}, {headingDeg: 45, rateDegPerSec: 0});
    assert.equal(si(1, 0), 15, 'from the reset');
});

test('errors: an unknown opcode or a constant where an output belongs replies DIRECT_REPLY_ERROR with the counter', () => {
    const hub = brick();
    const unknown = run(hub, hex('0800 3300 00 0400 FE 00 00'));
    assert.deepEqual(unknown.reply, [0x07, 0x00, 0x33, 0x00, 0x04, 0, 0, 0, 0]);
    const constant = run(hub, hex('0900 3400 00 0400 B3 00 00 05'));
    assert.equal(constant.reply[4], 0x04);
    const outside = run(hub, hex('0900 3500 00 0100 B3 00 00 60'));
    assert.equal(outside.reply[4], 0x04, 'a 4-byte result into 1 byte of globals');
    assert.match(outside.error, /outside/);
});

test('the session: frames split across sends, replies in order, OUTPUT_READY waits for the cycle', () => {
    const hub = brick();
    const sent = [];
    const session = createEv3Session(() => hub, {send: bytes => sent.push([...bytes]), close: () => {}});
    // STEP_POWER A 40 for 0+90+0 degrees, then READY A with a reply, then a tone; delivered in pieces.
    const stream = [...hex('0F00 0100 80 0000 AC 00 01 8128 00 815A 00 01'), ...hex('0800 0200 00 0000 AA 00 01'),
        ...hex('0F00 0300 00 0000 94 01 8132 82B80B 826400')];
    session.receive(Uint8Array.from(stream.slice(0, 5)));
    session.receive(Uint8Array.from(stream.slice(5, 23)));
    session.receive(Uint8Array.from(stream.slice(23)));
    assert.deepEqual(sent, [], 'READY blocks, and the tone queued behind it waits too');
    assert.equal(session.pending, 2);
    bench(hub, 2000);
    assert.deepEqual(sent.map(r => r[2]), [0x02, 0x03], 'replies to commands 2 and 3, in order');
    assert.equal(sent[0][4], 0x02);
    assert.ok(hub.s.outputs[0].angleDeg >= 90);
    // A system command (here 0x01 BEGIN_DOWNLOAD) is not a direct command: SYSTEM_REPLY_ERROR, UNKNOWN_SYSTEM_COMMAND.
    session.receive(hex('0600 0900 01 92 0000'));
    assert.deepEqual(sent.at(-1), [0x05, 0x00, 0x09, 0x00, 0x05, 0x92, 0x0a]);
});

test('the hub\'s state round-trips through the worker mirror and steps identically', () => {
    const a = brick();
    run(a, hex('1200 0700 80 0000 AE 00 06 8132 00 828403 82B400 01'));
    bench(a, 300);
    const b = hubRegistry.create('ev3', {id: 'ev3'});
    b.importState(a.exportState());
    benchSpeeds.set(b, new Map(benchSpeeds.get(a))); // the same shafts, turning as fast
    assert.equal(a.stateKey(a.exportState()), b.stateKey(b.exportState()));
    for (const hub of [a, b]) bench(hub, 300);
    assert.deepEqual(a.readDrives(), b.readDrives());
    assert.equal(a.s.outputs[1].angleDeg, b.s.outputs[1].angleDeg);
});
