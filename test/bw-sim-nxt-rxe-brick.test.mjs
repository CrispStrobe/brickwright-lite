// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Programs on the Virtual NXT (docs/NXT-RXE-VM.md; docs/ROBOT-LAB-EV3-NXT.md "L2"): an NBC-compiled `.rxe`
 * (test/fixtures/nxt-rxe/) downloaded with the system-command BYTES a host sends — OPEN WRITE, WRITE in
 * chunks, CLOSE — then STARTPROGRAM, GETCURRENTPROGRAMNAME, the mailboxes while it runs, STOPPROGRAM;
 * the motors on a first-order bench (as test/bw-sim-nxt-direct-commands.test.mjs) and in the Robot Lab
 * on the nxt-bumper-bot (Jolt physics). No network.
 *
 * Telegram layouts and statuses are written out here from LEGO's Bluetooth Developer Kit Appendix 1 and
 * the firmware's communication module and loader ([F §…] docs/NXT-PROTOCOL-FACTS.md, [V §…]
 * docs/NXT-RXE-VM.md): OPEN WRITE 0x81 (name 20, size ULONG) → status, handle; WRITE 0x83 (handle, data)
 * → status, handle, count UWORD; CLOSE 0x84 (handle) → status, handle; DELETE 0x85 (name) → status, name;
 * FIND FIRST 0x86 (pattern) / FIND NEXT 0x87 (handle) → status, handle, name 20, size ULONG. Loader
 * statuses: 0x87 file not found, 0x8B file is busy, 0x8F file exists, 0x84 end of file expected.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const {executeTelegram} = await import(path.join(SIM, 'hubs/nxt/nxt-direct-commands.js'));
const {NxtVirtualHub} = await import(path.join(SIM, 'hubs/nxt/nxt-virtual-hub.js'));
const {hubRegistry} = await import(path.join(SIM, 'hubs/index.js'));

const fixture = name => Array.from(readFileSync(path.join(ROOT, 'test/fixtures/nxt-rxe', `${name}.rxe`)));
const le32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const s32 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const name20 = text => [...text].map(c => c.charCodeAt(0)).concat(Array(20).fill(0)).slice(0, 20);
const text = (b, from, n = 20) => String.fromCharCode(...b.slice(from, from + n).filter(c => c));
const exec = (hub, bytes) => {
    const r = executeTelegram(Uint8Array.from(bytes), hub);
    return r.reply ? Array.from(r.reply) : null;
};

const brick = () => {
    const hub = new NxtVirtualHub({id: 'nxt'});
    assert.deepEqual(hub.plug([
        {port: 'A', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: 'B', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: 'C', class: 'motor', ids: {}, device: 'nxt-motor'},
        {port: '1', class: 'sensor', ids: {}, sensor: 'force', device: 'nxt-touch'},
        {port: '4', class: 'sensor', ids: {}, sensor: 'distance', device: 'nxt-ultrasonic'}
    ]), []);
    return hub;
};

/** The bench: each motor's shaft approaches duty × no-load speed with a 40 ms time constant (5 ms steps). */
const TAU_S = 0.04;
const benchSpeeds = new WeakMap();
const bench = (hub, ms, probes = () => ({})) => {
    const end = hub.s.timeMs + ms;
    if (!benchSpeeds.has(hub)) benchSpeeds.set(hub, new Map());
    const speeds = benchSpeeds.get(hub);
    for (let t = hub.s.timeMs + 5; t <= end + 1e-9; t += 5) {
        hub.advanceTo(t);
        const readings = hub.readDrives().map(d => {
            const spec = hub.specs.get('ABC'.indexOf(d.port));
            const w0 = speeds.get(d.port) || 0;
            const radPerSec = w0 + (d.duty * spec.noLoadRadPerSec - w0) * (1 - Math.exp(-0.005 / TAU_S));
            speeds.set(d.port, radPerSec);
            return {port: d.port, kind: 'encoder', angleRad: 0, deltaRad: (w0 + radPerSec) / 2 * 0.005, radPerSec};
        });
        for (const [port, raw] of Object.entries(probes(t))) readings.push({port, kind: 'probe', device: raw.kind, raw});
        hub.writeReadings(readings);
        hub.publish();
    }
};

/** A host's download: OPEN WRITE, WRITE in 32-byte chunks (as legonxt sends them), CLOSE — every reply checked. */
const download = (hub, name, bytes) => {
    const open = exec(hub, [0x01, 0x81, ...name20(name), ...le32(bytes.length)]);
    assert.deepEqual(open.slice(0, 3), [0x02, 0x81, 0x00], `OPEN WRITE ${name}`);
    assert.equal(open.length, 4);
    const handle = open[3];
    for (let at = 0; at < bytes.length; at += 32) {
        const chunk = bytes.slice(at, at + 32);
        assert.deepEqual(exec(hub, [0x01, 0x83, handle, ...chunk]), [0x02, 0x83, 0x00, handle, chunk.length, 0]);
    }
    assert.deepEqual(exec(hub, [0x01, 0x84, handle]), [0x02, 0x84, 0x00, handle], 'CLOSE');
};

test('the flash files: OPEN WRITE / WRITE / CLOSE, FIND FIRST / NEXT, OPEN READ / READ, DELETE, and their errors', () => {
    const hub = brick();
    const rxe = fixture('motor-timed');
    download(hub, 'motor.rxe', rxe);
    assert.deepEqual(hub.s.files['motor.rxe'], rxe, 'the file holds exactly the bytes sent');
    // The same name again: FILE EXISTS.
    assert.equal(exec(hub, [0x01, 0x81, ...name20('motor.rxe'), ...le32(10)])[2], 0x8f);
    // A file closed before it is complete is not kept; writing past its size is END OF FILE EXPECTED.
    let h = exec(hub, [0x01, 0x81, ...name20('short.rxe'), ...le32(4)])[3];
    assert.deepEqual(exec(hub, [0x01, 0x83, h, 1, 2, 3, 4, 5, 6]), [0x02, 0x83, 0x84, h, 4, 0], 'four of six bytes fit');
    exec(hub, [0x01, 0x84, h]);
    assert.equal(hub.s.files['short.rxe'], undefined, 'overflowed: discarded');
    h = exec(hub, [0x01, 0x81, ...name20('half.rxe'), ...le32(4)])[3];
    exec(hub, [0x01, 0x83, h, 1, 2]);
    exec(hub, [0x01, 0x84, h]);
    assert.equal(hub.s.files['half.rxe'], undefined, 'incomplete: discarded');
    assert.equal(exec(hub, [0x01, 0x84, h])[2], 0x88, 'closing it again: HANDLE ALREADY CLOSED');
    download(hub, 'other.rxe', fixture('arithmetic'));
    hub.putFile('song.rso', [1, 2, 3]);
    // FIND FIRST *.rxe, then FIND NEXT until FILE NOT FOUND.
    let r = exec(hub, [0x01, 0x86, ...name20('*.rxe')]);
    assert.equal(r.length, 28);
    assert.deepEqual([r[2], text(r, 4), s32(r, 24)], [0x00, 'motor.rxe', rxe.length]);
    const found = [text(r, 4)];
    for (;;) {
        r = exec(hub, [0x01, 0x87, r[3]]);
        assert.equal(r.length, 28);
        if (r[2] !== 0) break;
        found.push(text(r, 4));
    }
    assert.equal(r[2], 0x87);
    assert.deepEqual(found.sort(), ['motor.rxe', 'other.rxe']);
    assert.equal(exec(hub, [0x01, 0x86, ...name20('*.rbt')])[2], 0x87, 'nothing matches');
    // OPEN READ and READ give the bytes back.
    const opened = exec(hub, [0x01, 0x80, ...name20('song.rso')]);
    assert.deepEqual(opened, [0x02, 0x80, 0x00, opened[3], ...le32(3)]);
    assert.deepEqual(exec(hub, [0x01, 0x82, opened[3], 5, 0]), [0x02, 0x82, 0x85, opened[3], 5, 0, 1, 2, 3, 0, 0],
        'five asked, three there: END OF FILE, zero-padded');
    exec(hub, [0x01, 0x84, opened[3]]);
    // DELETE answers the name back.
    assert.deepEqual(exec(hub, [0x01, 0x85, ...name20('song.rso')]), [0x02, 0x85, 0x00, ...name20('song.rso')]);
    assert.deepEqual(exec(hub, [0x01, 0x85, ...name20('song.rso')]).slice(0, 3), [0x02, 0x85, 0x87], 'gone');
    // GET DEVICE INFO's free flash counts what the files take.
    const info = exec(hub, [0x01, 0x9b]);
    assert.equal(s32(info, 29), 65536 - rxe.length - fixture('arithmetic').length);
});

test('download, STARTPROGRAM, GETCURRENTPROGRAMNAME, the mailboxes while it runs, STOPPROGRAM', () => {
    const hub = brick();
    download(hub, 'echo.rxe', fixture('mailbox'));
    assert.equal(exec(hub, [0x00, 0x00, ...name20('nothere.rxe')])[2], 0xc0, 'a missing file: 0xC0 [F §Commands]');
    assert.deepEqual(exec(hub, [0x00, 0x00, ...name20('echo.rxe')]), [0x02, 0x00, 0x00]);
    assert.deepEqual(exec(hub, [0x00, 0x11]), [0x02, 0x11, 0x00, ...name20('echo.rxe')]);
    // The running program's file cannot be deleted.
    assert.equal(exec(hub, [0x01, 0x85, ...name20('echo.rxe')])[2], 0x8b, 'FILE IS BUSY');
    bench(hub, 50);
    assert.equal(exec(hub, [0x00, 0x13, 0x0a, 0x00, 0x01])[2], 0x40, 'nothing answered yet: mailbox empty');
    // MESSAGEWRITE inbox 0 (the program's MAILBOX1): "hi" + terminator.
    assert.deepEqual(exec(hub, [0x00, 0x09, 0x00, 0x03, 0x68, 0x69, 0x00]), [0x02, 0x09, 0x00]);
    bench(hub, 50);
    // The program answers on queue 10 — a master's MESSAGEREAD of remote inbox 10.
    const r = exec(hub, [0x00, 0x13, 0x0a, 0x00, 0x01]);
    assert.equal(r.length, 64);
    assert.deepEqual([r[2], r[4], text(r, 5, r[4])], [0x00, 8, 'echo:hi']);
    assert.ok(hub.events.some(e => e.kind === 'display' && e.text === 'hi'), 'it showed the message');
    assert.deepEqual(exec(hub, [0x00, 0x01]), [0x02, 0x01, 0x00], 'STOPPROGRAM');
    assert.deepEqual(exec(hub, [0x00, 0x11]), [0x02, 0x11, 0xec, ...Array(20).fill(0)], 'no program now');
    assert.deepEqual(exec(hub, [0x00, 0x01]), [0x02, 0x01, 0xec]);
    assert.equal(exec(hub, [0x00, 0x09, 0x00, 0x02, 0x41, 0x00])[2], 0xec, 'the mailboxes are gone with it');
    assert.deepEqual(hub.s.lastProgram, {name: 'echo.rxe', how: 'abort', error: null});
});

test('a file the VM refuses: STARTPROGRAM succeeds, the program never runs, the refusal is named', () => {
    const hub = brick();
    const bad = fixture('motor-timed');
    bad[15] = 3; // format 0.3: older than the brick runs
    hub.putFile('old.rxe', bad);
    assert.deepEqual(exec(hub, [0x00, 0x00, ...name20('old.rxe')]), [0x02, 0x00, 0x00]);
    assert.equal(exec(hub, [0x00, 0x11])[2], 0xec, 'not running');
    assert.equal(hub.s.lastProgram.error.code, 'ERR_VER');
    assert.ok(hub.events.some(e => e.kind === 'program-refused' && e.status === 'ERR_VER'));
});

test('RotateMotor on the bench: A turns 360° and back 180° on its count; the program ends and the brick resets', t => {
    const hub = brick();
    download(hub, 'rot.rxe', fixture('rotate-motor'));
    exec(hub, [0x80, 0x00, ...name20('rot.rxe')]);
    const angles = [];
    for (let k = 0; k < 120 && hub.currentProgramName(); k++) {
        bench(hub, 50);
        angles.push(hub.s.outputs[0].angleDeg);
    }
    assert.equal(hub.currentProgramName(), null, 'the program ended');
    const shown = hub.events.filter(e => e.kind === 'display').map(e => Number(e.text));
    // What the program printed: TachoCount and RotationCount after +360, RotationCount after −180, run state.
    assert.equal(shown.length, 4, JSON.stringify(hub.events.slice(-8)));
    // NXC's RotateMotor on one motor is an UNREGULATED limited move: it ends at the count and brakes, so it
    // overshoots by the braking distance (on this bench a few degrees), then holds (regulated, power 0).
    t.diagnostic(`shown: ${shown.join(', ')}`);
    assert.ok(shown[0] >= 360 && shown[0] <= 372, `TachoCount ${shown[0]}`);
    assert.equal(shown[1], shown[0], 'RotationCount: reset with TachoCount at the start');
    assert.ok(Math.abs(shown[1] - 180 - shown[2]) <= 12, `RotationCount after the 180° back ${shown[2]}`);
    assert.equal(shown[3], 0, 'run state IDLE after the move');
    assert.ok(Math.max(...angles) > 340, 'the shaft went out');
    assert.equal(hub.s.lastProgram.how, 'ok');
    // The end resets the devices: A off and idle, counters cleared.
    const st = executeTelegram(Uint8Array.from([0x00, 0x06, 0x00]), hub).reply;
    assert.deepEqual([st[5], st[8], s32(st, 13), s32(st, 21)], [0, 0, 0, 0], 'mode 0, IDLE, TachoCount 0, RotationCount 0');
});

test('OnFwd + Wait on the bench: A runs forward 500 ms, then back 500 ms, then floats', () => {
    const hub = brick();
    hub.putFile('timed.rxe', fixture('motor-timed'));
    exec(hub, [0x80, 0x00, ...name20('timed.rxe')]);
    bench(hub, 450);
    assert.ok(hub.s.outputs[0].measuredDps > 300, `forward at 75: ${hub.s.outputs[0].measuredDps} °/s`);
    const out = hub.s.outputs[0].angleDeg;
    bench(hub, 500);
    assert.ok(hub.s.outputs[0].measuredDps < -150, 'backwards at 50');
    assert.ok(hub.s.outputs[0].angleDeg < out, 'it came back');
    bench(hub, 1300);
    assert.ok(Math.abs(hub.s.outputs[1].measuredDps) < 20, 'B stopped by Off');
    bench(hub, 300);
    assert.equal(hub.currentProgramName(), null);
});

test('the ultrasonic stop on the bench: SensorUS over I2C until 20 cm, then Off', () => {
    const hub = brick();
    hub.putFile('us.rxe', fixture('ultrasonic-stop'));
    exec(hub, [0x80, 0x00, ...name20('us.rxe')]);
    // The wall approaches with the robot: 600 mm minus what B has turned (1 mm a degree, our bench).
    const distance = () => Math.max(0, 600 - hub.s.outputs[1].angleDeg);
    bench(hub, 4000, () => ({4: {kind: 'distance', distance: distance()}}));
    assert.equal(hub.currentProgramName(), null, 'it stopped and ended');
    const shown = hub.events.filter(e => e.kind === 'display').map(e => Number(e.text));
    assert.equal(shown.length, 1);
    assert.ok(shown[0] <= 20 && shown[0] >= 10, `stopped at ${shown[0]} cm`);
});

test('a running program round-trips through the worker mirror', () => {
    const a = brick();
    a.putFile('rot.rxe', fixture('rotate-motor'));
    exec(a, [0x80, 0x00, ...name20('rot.rxe')]);
    bench(a, 300);
    const b = hubRegistry.create('nxt', {id: 'nxt'});
    b.importState(JSON.parse(JSON.stringify(a.exportState())));
    benchSpeeds.set(b, new Map(benchSpeeds.get(a)));
    assert.equal(a.stateKey(a.exportState()), b.stateKey(b.exportState()));
    for (const hub of [a, b]) bench(hub, 700);
    assert.deepEqual(b.readDrives(), a.readDrives());
    assert.equal(b.s.outputs[0].angleDeg, a.s.outputs[0].angleDeg);
    assert.deepEqual(b.vm.s, a.vm.s);
});

test('Robot Lab: the nxt-bumper-bot runs touch-bumper.rxe — drives until the bumper meets the wall, stops there', async t => {
    const {SimSession, catalogFrom, MODELS, MODELS_BASE} = await import(path.join(SIM, 'sim-session.js'));
    const {WALL} = await import(path.join(SIM, 'world/mats.js'));
    const catalog = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta', 'parts.json'), 'utf8')));
    const entry = MODELS.find(m => m.file === 'nxt-bumper-bot.ldr');
    const modelText = readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, entry.file), 'utf8');
    const {session, issues} = await SimSession.fromText(modelText, {hubState: null, catalog, mat: entry.mat});
    assert.ok(session, JSON.stringify(issues));
    try {
        const {hub, body} = session.hubs.find(h => h.profile === 'nxt');
        download(hub, 'bumper.rxe', fixture('touch-bumper'));
        assert.deepEqual(exec(hub, [0x00, 0x00, ...name20('bumper.rxe')]), [0x02, 0x00, 0x00]);
        const start = session.core.bodyPose(body).position[0];
        const track = [];
        let pressedAt = null;
        let stoppedAt = null;
        for (let k = 0; k < 400; k++) {
            session.tick(1000 / 30);
            const pose = session.core.bodyPose(body);
            track.push({t: session.time, x: pose.position[0], B: hub.s.outputs[1].angleDeg, C: hub.s.outputs[2].angleDeg});
            if (pressedAt === null && hub.getInputValues(0).scaled === 1) pressedAt = session.time;
            if (stoppedAt === null && hub.events.some(e => e.kind === 'display' && e.text === 'bumped')) stoppedAt = session.time;
            if (stoppedAt !== null && session.time > stoppedAt + 800) break;
        }
        assert.ok(pressedAt !== null, 'the bumper was pressed');
        assert.ok(stoppedAt !== null && stoppedAt - pressedAt < 100, `the program saw it: pressed ${pressedAt} ms, stopped ${stoppedAt} ms`);
        const last = track.at(-1);
        t.diagnostic(`pressed at ${(pressedAt / 1000).toFixed(2)} s; robot from x = ${start.toFixed(3)} to ${last.x.toFixed(3)} m, wall face ${WALL.faceX} m`);
        assert.ok(last.x - start > 0.1, 'it drove at the wall');
        assert.ok(last.x < WALL.faceX, 'in front of the wall');
        // Off brakes both: the motors stand still for the last half second.
        const before = track.find(p => p.t >= last.t - 500);
        for (const port of ['B', 'C']) assert.ok(Math.abs(last[port] - before[port]) < 3, `${port} stopped`);
        assert.equal(hub.currentProgramName(), 'bumper.rxe', 'still in its final Wait(1000), braking');
        assert.equal(hub.getInputValues(0).scaled, 1, 'still pressed against the wall');
    } finally {
        session.dispose();
    }
});
