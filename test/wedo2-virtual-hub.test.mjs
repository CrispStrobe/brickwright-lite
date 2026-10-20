// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's WeDo 2.0 Smart Hub, byte by byte (overlay/scratch-gui/src/lib/bw-sim/hubs/wedo2/;
 * docs/WEDO-HUB-PROTOCOL-NOTES.md). Its GATT protocol is its own, not LWP3. The expected bytes are
 * written out by hand from the public sources the notes doc cites — LEGO's WeDo 2.0 SDK service
 * definitions (as quoted there), scratch-vm's extensions/scratch3_wedo2 (generateInputCommand,
 * generateOutputCommand, _onMessage) and node-poweredup's wedo2smarthub.ts port map — not with
 * the module's own encoders.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const {Wedo2VirtualHub, WEDO2_PROFILE, motionDetect, MOTION_RANGE_MM, wedo2Hub} = await import(path.join(SIM, 'hubs/wedo2/wedo2-virtual-hub.js'));
const {validateHubProfile} = await import(path.join(SIM, 'hubs/hub-profile.js'));
const {hubRegistry} = await import(path.join(SIM, 'hubs/index.js'));

const UUID = n => `0000${n}-1212-efde-1523-785feabcd123`;
const ATTACHED_IO = UUID('1527');
const INPUT_VALUES = UUID('1560');
const INPUT_COMMAND = UUID('1563');
const OUTPUT_COMMAND = UUID('1565');
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
const bytes = text => Uint8Array.from(text.split(/\s+/).filter(Boolean).map(h => parseInt(h, 16)));

const rover = () => {
    const hub = new Wedo2VirtualHub({id: 'hub'});
    assert.deepEqual(hub.plug([{port: 'A', class: 'motor', ids: {lpf2: 1}}, {port: 'B', class: 'sensor', ids: {lpf2: 35}, sensor: 'proximity'}]), []);
    const up = [];
    hub.setSink((uuid, b) => up.push([uuid, hex(b)]));
    return {hub, up};
};

test('the WeDo 2.0 profile validates; ports A and B; registered; it refuses a third port', () => {
    assert.deepEqual(validateHubProfile(WEDO2_PROFILE), []);
    assert.deepEqual(WEDO2_PROFILE.ports.map(p => p.id), ['A', 'B']);
    assert.deepEqual(WEDO2_PROFILE.parts, ['19071.dat']);
    assert.ok(hubRegistry.has('wedo2'));
    assert.ok(wedo2Hub.createVirtualHub({id: 'x'}) instanceof Wedo2VirtualHub);
    const hub = new Wedo2VirtualHub();
    assert.equal(hub.plug([{port: 'C', class: 'motor', ids: {}}])[0].code, 'port-unknown');
});

test('Attached IO (1527) on subscription: connect id, attached, hub index, IO type — motor 0x01 on 1, motion 0x23 on 2', () => {
    const {hub, up} = rover();
    hub.startNotifications(ATTACHED_IO);
    const msgs = up.filter(([u]) => u === ATTACHED_IO).map(([, m]) => m.slice(0, 11));
    // scratch3_wedo2 _onMessage reads data[0] (connect id 1 or 2), data[1] (attached) and data[3] (type).
    assert.deepEqual(msgs.slice(0, 2), ['01 01 00 01', '02 01 00 23']);
    // The internal devices (node-poweredup portMap): current 3 (0x15), voltage 4 (0x14), piezo 5 (0x16), RGB LED 6 (0x17).
    assert.deepEqual(msgs.slice(2), ['03 01 00 15', '04 01 00 14', '05 01 00 16', '06 01 00 17']);
});

test('Output Command (1565) motor power: [connect id, 1, 1, Int8]; 0 floats, 127 brakes, the duty is the power', () => {
    const {hub} = rover();
    hub.onWrite(OUTPUT_COMMAND, bytes('01 01 01 64'));
    assert.deepEqual(hub.readDrives(), [{port: 'A', mode: 'pwm', duty: 1, decay: 'brake'}]);
    hub.onWrite(OUTPUT_COMMAND, bytes('01 01 01 ce'));
    assert.deepEqual(hub.readDrives(), [{port: 'A', mode: 'pwm', duty: -0.5, decay: 'brake'}]);
    hub.onWrite(OUTPUT_COMMAND, bytes('01 01 01 7f'));
    assert.deepEqual(hub.readDrives(), [{port: 'A', mode: 'pwm', duty: 0, decay: 'brake'}]);
    hub.onWrite(OUTPUT_COMMAND, bytes('01 01 01 00'));
    assert.deepEqual(hub.readDrives(), [{port: 'A', mode: 'pwm', duty: 0, decay: 'coast'}]);
    // A tone on the piezo (connect id 5): command 2, length 4, frequency and duration UInt16 LE (the notes doc's
    // 440 Hz for one second: 05 02 04 b8 01 e8 03).
    hub.onWrite(OUTPUT_COMMAND, bytes('05 02 04 b8 01 e8 03'));
    assert.deepEqual(hub.tones.at(-1), {hz: 440, ms: 1000, atMs: 0});
    // RGB on the LED (connect id 6): command 4, length 3.
    hub.onWrite(OUTPUT_COMMAND, bytes('06 04 03 00 00 ff'));
    assert.deepEqual(hub.led, {r: 0, g: 0, b: 255});
});

test('Input Command (1563) sensor format → Input Values (1560): [?, connect id, value] in raw, percent and SI units', () => {
    const {hub, up} = rover();
    hub.startNotifications(INPUT_VALUES);
    hub.writeReadings([{port: 'B', kind: 'probe', device: 'proximity', raw: {distanceMm: 60}}]);
    // scratch3_wedo2 generateInputCommand: 1 (sensor format), 2 (write), connect id 2, type 0x23, mode 0, delta 1 (UInt32),
    // unit 1 (percent), notifications on. 60 mm of a 150 mm range: detect 4 of 10 → 40 %.
    hub.onWrite(INPUT_COMMAND, bytes('01 02 02 23 00 01 00 00 00 01 01'));
    assert.deepEqual(up.at(-1), [INPUT_VALUES, '00 02 28']);
    // wedo2unified's format: unit 0 (raw): detect 4.
    hub.onWrite(INPUT_COMMAND, bytes('01 02 02 23 00 01 00 00 00 00 01'));
    assert.deepEqual(up.at(-1), [INPUT_VALUES, '00 02 04']);
    // Nothing in front: 10 (raw). Published once per batch, only when it changed.
    hub.writeReadings([{port: 'B', kind: 'probe', device: 'proximity', raw: {distanceMm: -1}}]);
    up.length = 0;
    hub.publish();
    assert.deepEqual(up, [[INPUT_VALUES, '00 02 0a']]);
    hub.publish();
    assert.equal(up.length, 1);
    // SI (2): a Float32 LE: 10.0 = 00 00 20 41.
    hub.onWrite(INPUT_COMMAND, bytes('01 02 02 23 00 01 00 00 00 02 01'));
    assert.deepEqual(up.at(-1), [INPUT_VALUES, '00 02 00 00 20 41']);
});

test('the motion sensor\'s detect value: 0 at the sensor, 10 at MOTION_RANGE_MM or nothing', () => {
    assert.equal(MOTION_RANGE_MM, 150);
    assert.deepEqual([0, 14, 15, 74, 75, 149, 150, 400, -1].map(motionDetect), [0, 0, 1, 4, 5, 9, 10, 10, 10]);
});

test('the tilt sensor (0x22) reports x and y in degrees, ±45, as scratch3_wedo2 reads them', () => {
    const hub = new Wedo2VirtualHub();
    hub.plug([{port: 'A', class: 'sensor', ids: {lpf2: 34}, sensor: 'tilt'}]);
    const up = [];
    hub.setSink((uuid, b) => up.push(hex(b)));
    hub.startNotifications(INPUT_VALUES);
    // Pitched 20° nose up, rolled 60° right: y = −20 (scratch3_wedo2 reads y > 0 as "down"), x clamped to −45 ("right").
    hub.writeReadings([{port: 'A', kind: 'probe', device: 'tilt', raw: {pitchDeg: 20, rollDeg: 60}}]);
    hub.onWrite(INPUT_COMMAND, bytes('01 02 01 22 00 01 00 00 00 00 01'));
    assert.deepEqual(up.at(-1), '00 01 d3 ec');
});

test('the Robot Lab API: power and stop only — the WeDo motor has no encoder', () => {
    const {hub} = rover();
    assert.deepEqual(hub.directCommand('A', {power: 40}), {ok: true});
    assert.equal(hub.readDrives()[0].duty, 0.4);
    assert.equal(hub.directCommand('A', {degrees: 90}).ok, false);
    assert.equal(hub.directCommand('A', {stop: 'hold'}).ok, false);
    assert.deepEqual(hub.directCommand('A', {stop: 'coast'}), {ok: true});
    assert.equal(hub.readDrives()[0].decay, 'coast');
});
