// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * NXT direct commands, byte for byte (hubs/nxt/nxt-direct-commands.js, nxt-virtual-hub.js,
 * nxt-peripheral.js; docs/ROBOT-LAB-EV3-NXT.md).
 *
 * Every telegram below is written out HERE from LEGO's "MINDSTORMS NXT Bluetooth Developer Kit"
 * (read 2026-10-20; the facts with their citations: docs/NXT-PROTOCOL-FACTS.md, cited below as [F §…]):
 * Appendix 1 (byte 0 the command type: 0x00 direct + reply, 0x80 direct no reply, 0x01 system +
 * reply, 0x02 a reply; over Bluetooth two length bytes, LSB first, precede every telegram) and
 * Appendix 2 (each command's bytes; replies 0x02, command, status, data). Field layouts of the
 * replies are re-derived here from the Appendix, independently of the code:
 *   GETOUTPUTSTATE  3 port, 4 power (SBYTE), 5 mode, 6 regulation, 7 turn ratio (SBYTE), 8 run state,
 *                   9–12 tacho limit (ULONG), 13–16 tacho count, 17–20 block tacho count,
 *                   21–24 rotation count (SLONG)                                          (25 bytes)
 *   GETINPUTVALUES  3 port, 4 valid, 5 calibrated, 6 type, 7 mode, 8–9 raw, 10–11 normalized (UWORD),
 *                   12–13 scaled, 14–15 calibrated value (SWORD)                          (16 bytes)
 *   LSREAD          3 bytes read, 4–19 data (padded)                                       (20 bytes)
 *   MESSAGEREAD     3 local inbox, 4 size, 5–63 data (padded)                              (64 bytes)
 * Statuses and behaviour the Appendix leaves open follow LEGO's open-source firmware [F §Statuses].
 * The motors turn on a first-order bench (speed → duty × no-load speed, 40 ms time constant); the physics runs in
 * test/bw-sim-nxt-hub.test.mjs.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NXT = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/hubs/nxt');
const {executeTelegram} = await import(path.join(NXT, 'nxt-direct-commands.js'));
const {NxtVirtualHub} = await import(path.join(NXT, 'nxt-virtual-hub.js'));
const {createNxtSession} = await import(path.join(NXT, 'nxt-peripheral.js'));
const {hubRegistry} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/hubs/index.js'));
const {validateHubProfile} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/hubs/hub-profile.js'));

const le32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const s32 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
const u16 = (b, i) => b[i] | (b[i + 1] << 8);

const brick = () => {
    const hub = new NxtVirtualHub({id: 'nxt'});
    assert.deepEqual(hub.plug([
        {port: 'A', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: 'B', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: 'C', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: '1', class: 'sensor', ids: {}, sensor: 'force', device: 'nxt-touch'},
        {port: '3', class: 'sensor', ids: {}, sensor: 'color', device: 'nxt-light'},
        {port: '4', class: 'sensor', ids: {}, sensor: 'distance', device: 'nxt-ultrasonic'}
    ]), []);
    return hub;
};

/** The bench motor's mechanical time constant, s (a wheel on the motor: tens of ms). */
const TAU_S = 0.04;
const benchSpeeds = new WeakMap();
const bench = (hub, ms, probes = {}) => {
    const end = hub.s.timeMs + ms;
    if (!benchSpeeds.has(hub)) benchSpeeds.set(hub, new Map());
    const speeds = benchSpeeds.get(hub);
    for (let t = hub.s.timeMs + 5; t <= end + 1e-9; t += 5) {
        hub.advanceTo(t);
        const readings = hub.readDrives().map(d => {
            const spec = hub.specs.get('ABC'.indexOf(d.port));
            // First order: the shaft approaches duty × no-load speed with a time constant TAU_S
            // (braked or floating at duty 0: it slows down the same way).
            const w0 = speeds.get(d.port) || 0;
            const radPerSec = w0 + (d.duty * spec.noLoadRadPerSec - w0) * (1 - Math.exp(-0.005 / TAU_S));
            speeds.set(d.port, radPerSec);
            return {port: d.port, kind: 'encoder', angleRad: 0, deltaRad: (w0 + radPerSec) / 2 * 0.005, radPerSec};
        });
        for (const [port, raw] of Object.entries(probes)) readings.push({port, kind: 'probe', device: raw.kind, raw});
        hub.writeReadings(readings);
        hub.publish();
    }
};

const exec = (hub, bytes) => {
    const out = executeTelegram(Uint8Array.from(bytes), hub);
    return out.reply ? [...out.reply] : null;
};

test('the NXT is a registered hub family: outputs A–C, inputs 1–4; it refuses what it cannot take', () => {
    const profile = hubRegistry.get('nxt').profile;
    assert.deepEqual(validateHubProfile(profile), []);
    assert.deepEqual(profile.ports.map(p => p.id), ['A', 'B', 'C', '1', '2', '3', '4']);
    assert.deepEqual(profile.parts, ['53788.dat']);
    const refusals = hubRegistry.create('nxt', {id: 'nxt'}).plug([
        {port: 'D', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: 'A', class: 'motor', ids: {}, device: 'ev3-large-motor'},
        {port: '2', class: 'sensor', ids: {}, sensor: 'gyro', device: 'ev3-gyro'}
    ]);
    assert.deepEqual(refusals.map(r => r.code), ['port-unknown', 'port-refuses-device', 'port-refuses-device']);
});

test('SETOUTPUTSTATE then GETOUTPUTSTATE: a regulated 360° move on A ends on its count and reports it', () => {
    const hub = brick();
    // 0x80 0x04: port 0, power 75, mode MOTORON|BRAKE|REGULATED (0x07), regulation MOTOR_SPEED (1),
    // turn ratio 0, run state RUNNING (0x20), tacho limit 360 (ULONG). No reply asked.
    assert.equal(exec(hub, [0x80, 0x04, 0x00, 75, 0x07, 0x01, 0x00, 0x20, ...le32(360)]), null);
    bench(hub, 3000);
    const r = exec(hub, [0x00, 0x06, 0x00]);
    assert.equal(r.length, 25);
    assert.deepEqual(r.slice(0, 4), [0x02, 0x06, 0x00, 0x00], 'reply, GETOUTPUTSTATE, success, port 0');
    assert.equal(r[8], 0x00, 'run state IDLE: the move is over');
    assert.equal(s32(r, 9), 360, 'the tacho limit');
    const tacho = s32(r, 13);
    assert.ok(Math.abs(tacho - 360) <= 2, `tacho count ${tacho}`);
    assert.equal(s32(r, 21), tacho, 'rotation count: nothing reset it');
    assert.equal(r[5], 0x07, 'mode as set');
    assert.equal(hub.s.outputs[0].decay, 'brake');
});

test('an unregulated move stops at its count; RESETMOTORPOSITION resets the block (TRUE) or rotation (FALSE) count', () => {
    const hub = brick();
    exec(hub, [0x80, 0x04, 0x01, 50, 0x03, 0x00, 0x00, 0x20, ...le32(180)]); // B, power 50, MOTORON|BRAKE
    bench(hub, 2000);
    const b = hub.s.outputs[1];
    assert.ok(b.angleDeg >= 180, `${b.angleDeg.toFixed(0)}° (the brake stops it past the count)`);
    exec(hub, [0x80, 0x0a, 0x01, 0x01]); // relative: block count
    let r = exec(hub, [0x00, 0x06, 0x01]);
    assert.equal(s32(r, 17), 0);
    assert.equal(s32(r, 21), Math.trunc(b.angleDeg));
    exec(hub, [0x80, 0x0a, 0x01, 0x00]); // absolute: rotation count
    r = exec(hub, [0x00, 0x06, 0x01]);
    assert.equal(s32(r, 21), 0);
    // Power -40 forever, coast mode bits (MOTORON only): turns back.
    exec(hub, [0x80, 0x04, 0x01, 0xd8, 0x01, 0x00, 0x00, 0x20, ...le32(0)]);
    bench(hub, 200);
    r = exec(hub, [0x00, 0x06, 0x01]);
    assert.ok(s32(r, 21) < 0, 'negative rotation count');
    assert.equal((r[4] << 24) >> 24, -40, 'power as an SBYTE');
    // Port 0xFF: all outputs off (MOTORON clear, BRAKE set: braked).
    exec(hub, [0x80, 0x04, 0xff, 0, 0x02, 0x00, 0x00, 0x00, ...le32(0)]);
    bench(hub, 5);
    assert.deepEqual(hub.readDrives().map(d => d.decay), ['brake', 'brake', 'brake']);
});

test('SETINPUTMODE + GETINPUTVALUES: a touch switch in BOOLEANMODE, a light sensor in PCTFULLSCALEMODE', () => {
    const hub = brick();
    exec(hub, [0x80, 0x05, 0x00, 0x01, 0x20]); // port 0: SWITCH, BOOLEANMODE
    exec(hub, [0x80, 0x05, 0x02, 0x05, 0x80]); // port 2: LIGHT_ACTIVE, PCTFULLSCALEMODE
    bench(hub, 5, {1: {kind: 'force', pressed: false}, 3: {kind: 'color', color: 10, reflection: 100}});
    let r = exec(hub, [0x00, 0x07, 0x00]);
    assert.equal(r.length, 16);
    assert.deepEqual(r.slice(0, 8), [0x02, 0x07, 0x00, 0x00, 1, 0, 0x01, 0x20]);
    assert.equal(u16(r, 10), 1023, 'released: normalized full scale');
    assert.equal(u16(r, 12), 0, 'scaled: FALSE');
    bench(hub, 5, {1: {kind: 'force', pressed: true}});
    r = exec(hub, [0x00, 0x07, 0x00]);
    assert.ok(u16(r, 10) < 500, 'pressed: low (what legonxt\'s isTouchPressed compares with 500)');
    assert.equal(u16(r, 12), 1, 'scaled: TRUE');
    r = exec(hub, [0x00, 0x07, 0x02]);
    assert.equal(r[6], 0x05);
    assert.equal(u16(r, 12), 56, 'white paper: the estimated 56 %');
});

test('the ultrasonic sensor over I2C: LSWRITE [0x02, 0x42] for one byte, LSGETSTATUS, LSREAD', () => {
    const hub = brick();
    exec(hub, [0x80, 0x05, 0x03, 0x0b, 0x00]); // port 3: LOWSPEED_9V, RAWMODE
    bench(hub, 5, {4: {kind: 'distance', distance: 237}});
    assert.deepEqual(exec(hub, [0x00, 0x0f, 0x03, 0x02, 0x01, 0x02, 0x42]), [0x02, 0x0f, 0x00]);
    assert.deepEqual(exec(hub, [0x00, 0x0e, 0x03]), [0x02, 0x0e, 0x00, 1], 'one byte ready');
    const r = exec(hub, [0x00, 0x10, 0x03]);
    assert.equal(r.length, 20);
    assert.deepEqual(r.slice(0, 5), [0x02, 0x10, 0x00, 1, 24], '24 cm (237 mm, to the centimetre)');
    // The product id register (8 bytes from 0x08): "LEGO".
    exec(hub, [0x00, 0x0f, 0x03, 0x02, 0x08, 0x02, 0x08]);
    assert.deepEqual(String.fromCharCode(...exec(hub, [0x00, 0x10, 0x03]).slice(4, 8)), 'LEGO');
    // Nothing echoes: 255.
    bench(hub, 5, {4: {kind: 'distance', distance: -1}});
    exec(hub, [0x80, 0x0f, 0x03, 0x02, 0x01, 0x02, 0x42]);
    assert.equal(exec(hub, [0x00, 0x10, 0x03])[4], 255);
    // A switch port is no I2C channel: "not configured or busy", the bytes-ready byte still there [F §LS].
    assert.deepEqual(exec(hub, [0x00, 0x0e, 0x00]), [0x02, 0x0e, 0xe0, 0]);
});

test('PLAYTONE, KEEPALIVE, GETBATTERYLEVEL, GET FIRMWARE VERSION; errors by status code', () => {
    const hub = brick();
    assert.deepEqual(exec(hub, [0x00, 0x03, 0xb8, 0x01, 0xe8, 0x03]), [0x02, 0x03, 0x00], '440 Hz, 1000 ms');
    assert.deepEqual(hub.events.at(-1), {t: 0, kind: 'tone', frequency: 440, duration: 1000});
    const keep = exec(hub, [0x00, 0x0d]);
    assert.deepEqual(keep.slice(0, 3), [0x02, 0x0d, 0x00]);
    assert.equal(s32(keep, 3), 600000, 'sleep limit, ms');
    assert.deepEqual(exec(hub, [0x00, 0x0b]), [0x02, 0x0b, 0x00, ...[9000 & 0xff, 9000 >> 8]]);
    // System command 0x88: protocol minor, major, firmware minor, major.
    // Protocol 1.124, firmware 1.29: the open-source firmware release's numbers [F §System].
    assert.deepEqual(exec(hub, [0x01, 0x88]), [0x02, 0x88, 0x00, 124, 1, 29, 1]);
    assert.deepEqual(exec(hub, [0x00, 0x42]), [0x02, 0x42, 0xbe], 'unknown command opcode: the status alone');
    // A bad port is "data contains out-of-range values" (0xC0) in the firmware, not 0xF0; GETOUTPUTSTATE
    // and GETINPUTVALUES still reply in full, zero-filled [F §Statuses].
    assert.deepEqual(exec(hub, [0x00, 0x06, 0x05]), [0x02, 0x06, 0xc0, ...Array(22).fill(0)]);
    assert.deepEqual(exec(hub, [0x00, 0x07, 0x04]), [0x02, 0x07, 0xc0, ...Array(13).fill(0)]);
    assert.equal(exec(hub, [0x00, 0x05, 0x04, 0x01, 0x20])[2], 0xc0, 'SETINPUTMODE port 4');
    assert.equal(exec(hub, [0x00, 0x0a, 0x03, 0x00])[2], 0xc0, 'RESETMOTORPOSITION port 3');
    // The power is not range-checked: stored and echoed as sent, the drive limited to ±100 [F §Outputs].
    assert.deepEqual(exec(hub, [0x00, 0x04, 0x00, 120, 0x01, 0, 0, 0x20, ...le32(0)]), [0x02, 0x04, 0x00]);
    assert.equal(exec(hub, [0x00, 0x06, 0x00])[4], 120);
    // A missing program file: 0xC0 in the firmware (the BDK's list would suggest 0xBD).
    assert.equal(exec(hub, [0x00, 0x00, ...Array(20).fill(0)])[2], 0xc0, 'STARTPROGRAM: no such file');
    assert.deepEqual(exec(hub, [0x00, 0x01]), [0x02, 0x01, 0xec], 'STOPPROGRAM: no active program');
    const name = exec(hub, [0x00, 0x11]);
    assert.deepEqual(name, [0x02, 0x11, 0xec, ...Array(20).fill(0)], 'GETCURRENTPROGRAMNAME: 0xEC, a zeroed name');
    // No program: the mailboxes do not exist — 0xEC; MESSAGEREAD still replies in full (64 bytes),
    // echoing the LOCAL inbox (byte 3) [F §Messages].
    const m = exec(hub, [0x00, 0x13, 0x0a, 0x03, 0x01]);
    assert.equal(m.length, 64);
    assert.deepEqual(m.slice(0, 5), [0x02, 0x13, 0xec, 0x03, 0]);
    assert.equal(exec(hub, [0x00, 0x09, 0x00, 0x03, 0x68, 0x69, 0x00])[2], 0xec, 'MESSAGEWRITE without a program');
});

test('the mailboxes while a program runs: remote inbox read, local inbox echoed; terminated strings only', () => {
    const hub = brick();
    hub.currentProgramName = () => 'prog.rxe'; // stands in for a running program (the .rxe VM: test/bw-sim-nxt-rxe-brick.test.mjs)
    // MESSAGEWRITE inbox 0, size 3, "hi" + terminator.
    assert.deepEqual(exec(hub, [0x00, 0x09, 0x00, 0x03, 0x68, 0x69, 0x00]), [0x02, 0x09, 0x00]);
    assert.equal(exec(hub, [0x00, 0x09, 0x00, 0x02, 0x68, 0x69])[2], 0xc0, 'unterminated: out of range');
    assert.equal(exec(hub, [0x00, 0x09, 0x00, 0x00])[2], 0xc0, 'empty: out of range');
    assert.equal(exec(hub, [0x00, 0x09, 0x00, 60, ...Array(60).fill(0)])[2], 0xc0, '60 bytes: more than 59');
    assert.equal(exec(hub, [0x00, 0x09, 25, 0x01, 0x00])[2], 0xee, 'queue 25: illegal mailbox queue');
    // MESSAGEREAD reads the queue byte 2 names (0–19) and echoes byte 3: remote 0, local 7, keep it.
    let r = exec(hub, [0x00, 0x13, 0x00, 0x07, 0x00]);
    assert.deepEqual(r.slice(0, 8), [0x02, 0x13, 0x00, 0x07, 3, 0x68, 0x69, 0x00]);
    assert.equal(r.length, 64);
    r = exec(hub, [0x00, 0x13, 0x00, 0x07, 0x01]); // again, and remove it
    assert.equal(r[4], 3);
    assert.deepEqual(exec(hub, [0x00, 0x13, 0x00, 0x07, 0x01]).slice(2, 5), [0x40, 0x07, 0], 'now empty');
    // Queues 10–19 hold what a program sends its master: the remote inbox 10.
    hub.s.queues[10].push([0x6f, 0x6b, 0x00]);
    assert.deepEqual(exec(hub, [0x00, 0x13, 0x0a, 0x00, 0x01]).slice(2, 8), [0x00, 0x00, 3, 0x6f, 0x6b, 0x00]);
    // Five messages a queue: a sixth drops the oldest.
    for (let k = 1; k <= 6; k++) exec(hub, [0x80, 0x09, 0x02, 0x02, 0x30 + k, 0x00]);
    assert.deepEqual(hub.s.queues[2].map(q => q[0] - 0x30), [2, 3, 4, 5, 6]);
});

test('TachoCount counts from power-on; each tacho limit adds to the previous move\'s target', () => {
    const hub = brick();
    // Two regulated 360° moves on A, power 75, MOTORON|BRAKE|REGULATED, MOTOR_SPEED, RUNNING [F §Outputs].
    const move = [0x80, 0x04, 0x00, 75, 0x07, 0x01, 0x00, 0x20, ...le32(360)];
    exec(hub, move);
    bench(hub, 3000);
    exec(hub, move);
    bench(hub, 3000);
    const r = exec(hub, [0x00, 0x06, 0x00]);
    const tacho = s32(r, 13);
    assert.ok(Math.abs(tacho - 720) <= 2, `TachoCount ${tacho}: not restarted by the second command`);
    assert.equal(s32(r, 9), 360, 'the tacho limit echoes the last command');
    assert.equal(s32(r, 17), tacho, 'BlockTachoCount: only RESETMOTORPOSITION TRUE resets it');
    // Backwards: power -75 for 360 → the target is 720 − 360.
    exec(hub, [0x80, 0x04, 0x00, 0xb5, 0x07, 0x01, 0x00, 0x20, ...le32(360)]);
    bench(hub, 3000);
    assert.ok(Math.abs(s32(exec(hub, [0x00, 0x06, 0x00]), 13) - 360) <= 2);
    // Running without a limit, the target follows the count: a limited move then starts where the shaft is.
    exec(hub, [0x80, 0x04, 0x00, 50, 0x01, 0x00, 0x00, 0x20, ...le32(0)]);
    bench(hub, 300);
    exec(hub, [0x80, 0x04, 0x00, 0, 0x02, 0x00, 0x00, 0x00, ...le32(0)]); // brake
    bench(hub, 500);
    const before = hub.s.outputs[0].targetDeg;
    exec(hub, [0x80, 0x04, 0x00, 75, 0x07, 0x01, 0x00, 0x20, ...le32(90)]);
    assert.equal(hub.s.outputs[0].moveStartDeg, before);
    assert.ok(Math.abs(before - hub.s.outputs[0].angleDeg) < 30, 'the target followed the free run');
});

test('GETINPUTVALUES: "calibrated?" FALSE, and the calibrated field carries the normalized value', () => {
    const hub = brick();
    exec(hub, [0x80, 0x05, 0x02, 0x05, 0x80]); // port 2: LIGHT_ACTIVE, PCTFULLSCALEMODE
    bench(hub, 5, {3: {kind: 'color', color: 10, reflection: 100}});
    const r = exec(hub, [0x00, 0x07, 0x02]);
    assert.equal(r[5], 0, 'calibrated? FALSE');
    assert.equal(u16(r, 14), u16(r, 10), 'calibrated value = normalized value [F §Inputs]');
});

test('the ultrasonic sensor\'s registers and commands (HDK Appendix 7); the I2C channel\'s statuses', () => {
    const hub = brick();
    exec(hub, [0x80, 0x05, 0x03, 0x0b, 0x00]); // port 3: LOWSPEED_9V
    bench(hub, 5, {4: {kind: 'distance', distance: 500}});
    const read = (register, n) => {
        assert.deepEqual(exec(hub, [0x00, 0x0f, 0x03, 0x02, n, 0x02, register]), [0x02, 0x0f, 0x00]);
        return exec(hub, [0x00, 0x10, 0x03]).slice(4, 4 + n);
    };
    const str = bytes => String.fromCharCode(...bytes.slice(0, bytes.indexOf(0)));
    assert.equal(str(read(0x00, 8)), 'V1.0');
    assert.equal(str(read(0x10, 8)), 'Sonar');
    assert.equal(str(read(0x14, 7)), '10E-2m', 'centimetres');
    assert.deepEqual(read(0x11, 3), [0x00, 0x01, 0x0e], 'factory zero, scale factor, scale divisor');
    assert.deepEqual(read(0x50, 3), [0x00, 0x01, 0x0e], 'actual zero, scale factor, scale divisor');
    assert.deepEqual(read(0x41, 1), [0x02], 'command state: continuous, the default');
    assert.deepEqual(read(0x42, 1), [50]);
    // Single shot (0x41 ← 0x01): one measurement when the command is written, then held.
    assert.deepEqual(exec(hub, [0x00, 0x0f, 0x03, 0x03, 0x00, 0x02, 0x41, 0x01]), [0x02, 0x0f, 0x00]);
    bench(hub, 5, {4: {kind: 'distance', distance: 1000}});
    assert.deepEqual(read(0x42, 1), [50], 'held from the shot');
    exec(hub, [0x80, 0x0f, 0x03, 0x03, 0x00, 0x02, 0x41, 0x01]);
    assert.deepEqual(read(0x42, 1), [100], 'a new shot');
    // Warm reset (0x04): continuous again, live.
    exec(hub, [0x80, 0x0f, 0x03, 0x03, 0x00, 0x02, 0x41, 0x04]);
    assert.deepEqual(read(0x41, 1), [0x02]);
    // A port above 3: out of range, the status alone; more than 16 bytes: illegal size [F §LS].
    assert.deepEqual(exec(hub, [0x00, 0x0e, 0x04]), [0x02, 0x0e, 0xc0]);
    assert.deepEqual(exec(hub, [0x00, 0x10, 0x04]), [0x02, 0x10, 0xc0]);
    assert.deepEqual(exec(hub, [0x00, 0x0f, 0x04, 0x02, 0x01, 0x02, 0x42]), [0x02, 0x0f, 0xc0]);
    assert.equal(exec(hub, [0x00, 0x0f, 0x03, 0x02, 17, 0x02, 0x42])[2], 0xed);
    // Nothing waiting: LSREAD succeeds with 0 bytes, 16 zeros.
    assert.deepEqual(exec(hub, [0x00, 0x10, 0x03]), [0x02, 0x10, 0x00, 0, ...Array(16).fill(0)]);
    // An address nobody answers: LSWRITE starts the transaction; the bus error shows in LSGETSTATUS / LSREAD.
    assert.deepEqual(exec(hub, [0x00, 0x0f, 0x03, 0x02, 0x01, 0x04, 0x42]), [0x02, 0x0f, 0x00]);
    assert.deepEqual(exec(hub, [0x00, 0x0e, 0x03]), [0x02, 0x0e, 0xdd, 0]);
    assert.deepEqual(exec(hub, [0x00, 0x10, 0x03]), [0x02, 0x10, 0xdd, 0, ...Array(16).fill(0)]);
    // A port not set to LOWSPEED: not configured (0xE0).
    assert.equal(exec(hub, [0x00, 0x0f, 0x00, 0x02, 0x01, 0x02, 0x42])[2], 0xe0);
});

test('the session: two length bytes before every telegram, both ways; split and joined sends', () => {
    const hub = brick();
    const sent = [];
    const session = createNxtSession(() => hub, {send: bytes => sent.push([...bytes])});
    const stream = [0x03, 0x00, 0x00, 0x07, 0x00, /* */ 0x02, 0x00, 0x00, 0x0d];
    session.receive(Uint8Array.from(stream.slice(0, 4)));
    assert.deepEqual(sent, []);
    session.receive(Uint8Array.from(stream.slice(4)));
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0].slice(0, 2), [16, 0], 'GETINPUTVALUES reply: 16 bytes');
    assert.deepEqual(sent[1].slice(0, 5), [7, 0, 0x02, 0x0d, 0x00]);
    // At most 64 bytes, the two length bytes not counted (Appendix 2 "Maximum command length").
    assert.throws(() => session.receive(Uint8Array.from([65, 0x00])), /more than 64/);
});

test('the hub\'s state round-trips through the worker mirror', () => {
    const a = brick();
    exec(a, [0x80, 0x04, 0x00, 75, 0x07, 0x01, 0x00, 0x20, ...le32(360)]);
    bench(a, 200);
    const b = hubRegistry.create('nxt', {id: 'nxt'});
    b.importState(a.exportState());
    benchSpeeds.set(b, new Map(benchSpeeds.get(a))); // the same shafts, turning as fast
    for (const hub of [a, b]) bench(hub, 300);
    assert.deepEqual(a.readDrives(), b.readDrives());
    assert.equal(a.s.outputs[0].angleDeg, b.s.outputs[0].angleDeg);
});
