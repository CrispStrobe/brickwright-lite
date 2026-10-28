// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's MINDSTORMS model limits, closed (docs/ROBOT-LAB-EV3-NXT.md "NXT motor sync, buttons and
 * listening"; the firmware facts: docs/NXT-PROTOCOL-FACTS.md §Sync, §Buttons):
 *   - ultrasonic listening: sensors.js ultrasonicHeard → the EV3's listen mode and the NXT's event capture;
 *   - NXT MOTOR_SYNC as the firmware's output driver runs it (pairing, the tacho-difference PID, turn ratio,
 *     the pair's tacho limit);
 *   - the NXT's buttons: pressButton, ReadButton (the hub and the VM's system call).
 * The motors turn on the same first-order bench as test/bw-sim-nxt-direct-commands.test.mjs.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const {executeTelegram} = await import(path.join(SIM, 'hubs/nxt/nxt-direct-commands.js'));
const {NxtVirtualHub, NXT_BUTTON, BUTTON_LONG_MS} = await import(path.join(SIM, 'hubs/nxt/nxt-virtual-hub.js'));
const {ultrasonicHeard, US_HEAR_REACH_M} = await import(path.join(SIM, 'sensors.js'));
const {ev3SensorSi, ev3SensorPct, ev3SensorRaw, EV3_TYPE} = await import(path.join(SIM, 'devices/ev3-sensors.js'));
const {usRead, usWrite, usFreshState, US_COMMAND} = await import(path.join(SIM, 'devices/nxt-sensors.js'));
const {SYSCALLS} = await import(path.join(SIM, 'routes/nxt-vm/nxt-syscalls.js'));

const le32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const exec = (hub, bytes) => executeTelegram(Uint8Array.from(bytes), hub);

const brick = () => {
    const hub = new NxtVirtualHub({id: 'nxt'});
    assert.deepEqual(hub.plug([
        {port: 'A', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: 'B', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: 'C', class: 'motor', ids: {}, device: 'nxt-motor'}
    ]), []);
    return hub;
};

/** A first-order bench per port; `load` slows a port's shaft (a factor on its no-load speed). */
const bench = (hub, ms, load = {}, speeds = (hub._bench ||= new Map())) => {
    const end = hub.s.timeMs + ms;
    for (let t = hub.s.timeMs + 5; t <= end + 1e-9; t += 5) {
        hub.advanceTo(t);
        hub.writeReadings(hub.readDrives().map(d => {
            const spec = hub.specs.get('ABC'.indexOf(d.port));
            const w0 = speeds.get(d.port) || 0;
            const w = w0 + (d.duty * spec.noLoadRadPerSec * (load[d.port] ?? 1) - w0) * (1 - Math.exp(-0.005 / 0.04));
            speeds.set(d.port, w);
            return {port: d.port, kind: 'encoder', angleRad: 0, deltaRad: (w0 + w) / 2 * 0.005, radPerSec: w};
        }));
    }
};

// SETOUTPUTSTATE, no reply: port, power, mode MOTORON|BRAKE|REGULATED (0x07), regulation MOTOR_SYNC (2), turn ratio, RUNNING.
const sync = (hub, port, power, turn, limit = 0) => exec(hub, [0x80, 0x04, port, power & 0xff, 0x07, 0x02, turn & 0xff, 0x20, ...le32(limit)]);
const deg = (hub, k) => hub.s.outputs[k].angleDeg;

test('MOTOR_SYNC pairs A+B, else A+C, else B+C; a port synchronised alone runs unregulated', () => {
    const hub = brick();
    sync(hub, 1, 50, 0);
    assert.equal(hub.syncPair(), null, 'B alone');
    bench(hub, 300);
    assert.ok(Math.abs(hub.s.outputs[1].duty - 0.5) < 1e-9, 'alone: duty = power');
    sync(hub, 2, 50, 0);
    assert.deepEqual(hub.syncPair(), [1, 2]);
    sync(hub, 0, 50, 0);
    assert.deepEqual(hub.syncPair(), [0, 1], 'A takes B first');
});

test('turn ratio 0: the PID holds the two tacho counts together when one shaft is loaded', () => {
    const hub = brick();
    sync(hub, 1, 60, 0);
    sync(hub, 2, 60, 0);
    bench(hub, 3000, {C: 0.7});
    const diff = deg(hub, 1) - deg(hub, 2);
    assert.ok(deg(hub, 1) > 1000, `B turned ${deg(hub, 1)}`);
    assert.ok(Math.abs(diff) < 40, `synchronised tacho: B−C ${diff.toFixed(1)}°`);
    // The correction slows the first (B) and drives the second (C) harder than its power.
    assert.ok(hub.s.outputs[1].duty < 0.6 && hub.s.outputs[2].duty > 0.6, 'B slowed, C pushed');
    // Unsynchronised, the same load leaves C far behind.
    const free = brick();
    exec(free, [0x80, 0x04, 1, 60, 0x01, 0x00, 0, 0x20, ...le32(0)]);
    exec(free, [0x80, 0x04, 2, 60, 0x01, 0x00, 0, 0x20, ...le32(0)]);
    bench(free, 3000, {C: 0.7});
    assert.ok(deg(free, 1) - deg(free, 2) > 300, 'open loop drifts apart');
});

test('turn ratio 50: the first stands while the second turns; 100: they turn opposite at the same speed', () => {
    const half = brick();
    sync(half, 1, 75, 50);
    sync(half, 2, 75, 50);
    bench(half, 4000);
    assert.ok(deg(half, 2) > 2000, `C turned ${deg(half, 2)}`);
    assert.ok(Math.abs(deg(half, 1)) < 0.1 * deg(half, 2), `B nearly still: ${deg(half, 1).toFixed(0)}° against ${deg(half, 2).toFixed(0)}°`);
    const spin = brick();
    sync(spin, 1, 75, 100);
    sync(spin, 2, 75, 100);
    bench(spin, 4000);
    const [b, c] = [deg(spin, 1), deg(spin, 2)];
    assert.ok(b < -1500 && c > 1500, `opposite: B ${b.toFixed(0)}°, C ${c.toFixed(0)}°`);
    assert.ok(Math.abs(b + c) < 0.1 * c, 'the same speed');
    // Negative ratio: the second is the slow one.
    const neg = brick();
    sync(neg, 1, 75, -50);
    sync(neg, 2, 75, -50);
    bench(neg, 4000);
    assert.ok(deg(neg, 1) > 2000 && Math.abs(deg(neg, 2)) < 0.1 * deg(neg, 1), 'turn ratio −50: C stands');
    // Each is capped at its own power with a turn ratio.
    assert.ok(Math.abs(spin.s.outputs[1].duty) <= 0.75 + 1e-9 && Math.abs(spin.s.outputs[2].duty) <= 0.75 + 1e-9);
});

test('a synchronised tacho limit with a turn ratio ends both when the selected motor reaches it', () => {
    const hub = brick();
    // Ratio > 0, forwards: the second (C) governs.
    sync(hub, 1, 75, 50, 720);
    sync(hub, 2, 75, 50, 720);
    bench(hub, 6000);
    for (const k of [1, 2]) assert.equal(hub.s.outputs[k].runState, 0x00, `port ${'ABC'[k]} idle`);
    assert.ok(deg(hub, 2) >= 720 && deg(hub, 2) < 820, `C ended at ${deg(hub, 2).toFixed(0)}°`);
    assert.ok(Math.abs(deg(hub, 1)) < 150, `B ${deg(hub, 1).toFixed(0)}°`);
    assert.equal(hub.syncPair(), null);
});

test('turning synchronisation on clears the controller', () => {
    const hub = brick();
    sync(hub, 1, 75, 100);
    sync(hub, 2, 75, 100);
    bench(hub, 1000);
    assert.notEqual(hub.s.sync.turnSum, 0);
    sync(hub, 1, 75, 0);
    assert.deepEqual([hub.s.sync.turnSum, hub.s.sync.errorSum, hub.s.sync.lastError, hub.s.sync.correction], [0, 0, 0, 0]);
});

test('buttons: pressButton holds a button, releases count short or long, ReadButton reads and clears', () => {
    const hub = brick();
    assert.equal(hub.pressButton(9, true), false, 'no such button');
    hub.pressButton(NXT_BUTTON.enter, true);
    assert.deepEqual(hub.readButton(NXT_BUTTON.enter), {pressed: true, count: 0});
    bench(hub, 100);
    hub.pressButton(NXT_BUTTON.enter, false);
    hub.pressButton(NXT_BUTTON.enter, true);
    bench(hub, BUTTON_LONG_MS + 100);
    hub.pressButton(NXT_BUTTON.enter, false);
    const b = hub.s.buttons[NXT_BUTTON.enter];
    assert.deepEqual([b.shortReleases, b.longReleases], [1, 1]);
    assert.deepEqual(hub.readButton(NXT_BUTTON.enter, true), {pressed: false, count: 2});
    assert.deepEqual(hub.readButton(NXT_BUTTON.enter), {pressed: false, count: 0}, 'reset cleared both');
    // The state travels with the mirror.
    hub.pressButton(NXT_BUTTON.left, true);
    const copy = new NxtVirtualHub({id: 'm'});
    copy.importState(hub.exportState());
    assert.deepEqual(copy.readButton(NXT_BUTTON.left), {pressed: true, count: 0});
});

test('the VM\'s ReadButton reads the brick\'s buttons; an index past them is ERR_INVALID_PORT', () => {
    const hub = brick();
    const io = hub._programIo();
    const call = SYSCALLS.find(c => c.name === 'ReadButton');
    const run = (index, reset) => {
        const mem = {1: index, 4: reset};
        call.run({_get: id => mem[id] ?? 0, _set: (id, v) => { mem[id] = v; }}, [0, 1, 2, 3, 4], io);
        return {result: mem[0] | 0, pressed: mem[2], count: mem[3]};
    };
    hub.pressButton(NXT_BUTTON.exit, true);
    assert.deepEqual(run(NXT_BUTTON.exit, 0), {result: 0, pressed: 1, count: 0});
    hub.pressButton(NXT_BUTTON.exit, false);
    assert.deepEqual(run(NXT_BUTTON.exit, 1), {result: 0, pressed: 0, count: 1});
    assert.deepEqual(run(NXT_BUTTON.exit, 0), {result: 0, pressed: 0, count: 0});
    const bad = run(4, 0);
    assert.notEqual(bad.result, 0);
    assert.deepEqual([bad.pressed, bad.count], [0, 0]);
});

// ---- listening ----------------------------------------------------------------------------------------

/** A scene of bodies at fixed poses; castRay hits a wall body only when it is listed. */
const scene = (bodies, wallAtM = null) => ({
    bodyPose: id => {
        const b = bodies.find(x => x.id === id);
        return b ? {position: b.position, rotation: [0, 0, 0, 1]} : null;
    },
    castRay: (origin, dir, max) => (wallAtM !== null && wallAtM < max ? {distance: wallAtM, body: 'wall'} : null)
});
const usDevice = (body, port, device, origin, direction, hub = 'h') => ({sensor: 'distance', body, port, hub, device,
    probe: {origin, direction}});
const mech = devices => ({version: 2, bodies: [{id: 'r1', position: [0, 0, 0], rotation: [0, 0, 0, 1]},
    {id: 'r2', position: [1, 0, 0], rotation: [0, 0, 0, 1]}], devices});

test('ultrasonicHeard: another MINDSTORMS ultrasonic pinging towards the listener, in reach, nothing between', () => {
    const listener = usDevice('r1', '4', 'ev3-ultrasonic', [0, 0, 0], [1, 0, 0]);
    const facing = usDevice('r2', '1', 'nxt-ultrasonic', [1, 0, 0], [-1, 0, 0], 'h2');
    const away = usDevice('r2', '1', 'nxt-ultrasonic', [1, 0, 0], [1, 0, 0], 'h2');
    const spike = usDevice('r2', 'A', 'spike-distance', [1, 0, 0], [-1, 0, 0], 'h2');
    const s = {body: 'r1', port: '4', hub: 'h'};
    const m = mech([listener, facing]);
    assert.equal(ultrasonicHeard(scene(m.bodies), m, {origin: [0, 0, 0]}, s), 1);
    assert.equal(ultrasonicHeard(scene(m.bodies, 0.5), m, {origin: [0, 0, 0]}, s), 0, 'a wall between');
    const m2 = mech([listener, away]);
    assert.equal(ultrasonicHeard(scene(m2.bodies), m2, {origin: [0, 0, 0]}, s), 0, 'pinging away');
    const m3 = mech([listener, spike]);
    assert.equal(ultrasonicHeard(scene(m3.bodies), m3, {origin: [0, 0, 0]}, s), 0, 'SPIKE\'s sensor is not one');
    assert.equal(ultrasonicHeard(scene(m.bodies), mech([listener]), {origin: [0, 0, 0]}, s), 0, 'alone: not heard by itself');
    // The other robot drives away: its pose now, past the reach.
    const moved = [m.bodies[0], {...m.bodies[1], position: [US_HEAR_REACH_M + 0.5, 0, 0]}];
    assert.equal(ultrasonicHeard(scene(moved), m, {origin: [0, 0, 0]}, s), 0, 'out of reach');
});

test('the EV3\'s listen mode (2) reads 1 while another sensor is heard; the distance modes are unchanged', () => {
    const us = EV3_TYPE.ultrasonic;
    assert.deepEqual(ev3SensorSi(us, 2, {probe: {rangeMm: 300, usHeard: 0}}), [0]);
    assert.deepEqual(ev3SensorSi(us, 2, {probe: {rangeMm: 300, usHeard: 1}}), [1]);
    assert.deepEqual(ev3SensorPct(us, 2, {probe: {usHeard: 2}}), [100]);
    assert.deepEqual(ev3SensorRaw(us, 2, {probe: {usHeard: 1}}), [1]);
    assert.deepEqual(ev3SensorSi(us, 0, {probe: {rangeMm: 300, usHeard: 1}}), [30]);
});

test('the NXT\'s event capture: the first measurement byte reads 1 while another sensor is heard', () => {
    const state = usFreshState();
    usWrite(state, 0x41, [US_COMMAND.eventCapture], {rangeMm: 300});
    assert.deepEqual(usRead(0x42, 2, {rangeMm: 300, usHeard: 0}, state), [0, 255]);
    assert.deepEqual(usRead(0x42, 2, {rangeMm: 300, usHeard: 1}, state), [1, 255]);
    usWrite(state, 0x41, [US_COMMAND.continuous], {rangeMm: 300});
    assert.deepEqual(usRead(0x42, 1, {rangeMm: 300, usHeard: 1}, state), [30], 'continuous measures again');
});
