// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Programs on the Virtual EV3 (docs/EV3-RBF-VM.md; docs/ROBOT-LAB-EV3-NXT.md "L2"): an lmsasm-assembled
 * `.rbf` (test/fixtures/ev3-rbf/) downloaded with the system-command BYTES a host sends over the
 * Scratch Link socket (BEGIN_DOWNLOAD, CONTINUE_DOWNLOAD), listed and read back (LIST_FILES,
 * BEGIN_UPLOAD …), loaded and started with the direct command LEGO's Communication Developer Kit shows
 * for it (§4.2.1: opFILE LOAD_IMAGE into the user slot, then opPROGRAM_START), watched with
 * opPROGRAM_INFO and stopped with opPROGRAM_STOP; the motors on a first-order bench (as
 * test/bw-sim-ev3-direct-commands.test.mjs) and in the Robot Lab on the EV3 wall stopper (Jolt). No network.
 *
 * Layouts are written out here from the CDK [CDK §…]: a system command is length LE16, counter LE16,
 * type 0x01 (reply) / 0x81 (none), the command, its arguments; the reply is length, counter, 0x03
 * SYSTEM_REPLY / 0x05 SYSTEM_REPLY_ERROR, the command, a status, then the command's fields. BEGIN_DOWNLOAD
 * 0x92 (size LE32, path) → status, handle; CONTINUE_DOWNLOAD 0x93 (handle, data) → status, handle; status
 * 0x08 END_OF_FILE once the file is complete. Where the CDK is silent, docs/EV3-RBF-VM.md §System
 * commands cites the firmware.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim');
const EV3 = path.join(SIM, 'hubs/ev3');
const {Ev3VirtualHub} = await import(path.join(EV3, 'ev3-virtual-hub.js'));
const {createEv3Session} = await import(path.join(EV3, 'ev3-peripheral.js'));
const {hubRegistry} = await import(path.join(SIM, 'hubs/index.js'));

const fixture = name => Array.from(readFileSync(path.join(ROOT, 'test/fixtures/ev3-rbf', `${name}.rbf`)));
const hex = text => Array.from(text.replace(/\s+/g, '').match(/../g), h => parseInt(h, 16));
const le16 = v => [v & 0xff, (v >> 8) & 0xff];
const le32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const cstr = text => [...text].map(c => c.charCodeAt(0)).concat(0);
const ascii = bytes => String.fromCharCode(...bytes);

/** A brick with large motors on B and C, the touch sensor on 1 and the ultrasonic on 4. */
const brick = () => {
    const hub = new Ev3VirtualHub({id: 'ev3'});
    assert.deepEqual(hub.plug([
        {port: 'B', class: 'motor', ids: {}, device: 'ev3-large-motor'},
        {port: 'C', class: 'motor', ids: {}, device: 'ev3-large-motor'},
        {port: '1', class: 'sensor', ids: {}, sensor: 'force', device: 'ev3-touch'},
        {port: '4', class: 'sensor', ids: {}, sensor: 'distance', device: 'ev3-ultrasonic'}
    ]), []);
    return hub;
};

/** The Scratch Link session a host talks to: frames in, replies out (ev3-peripheral.js). */
const connect = hub => {
    const replies = [];
    const session = createEv3Session(() => hub, {send: bytes => replies.push(Array.from(bytes)), close: () => {}});
    let counter = 0;
    /** Sends one frame (type, then its bytes) and returns the reply to it, or null. */
    const send = (type, body) => {
        counter += 1;
        const frame = [...le16(3 + body.length), ...le16(counter), type, ...body];
        const before = replies.length;
        session.receive(Uint8Array.from(frame));
        const reply = replies.length > before ? replies.at(-1) : null;
        if (reply) assert.deepEqual(reply.slice(2, 4), le16(counter), 'the reply answers this counter');
        return reply;
    };
    return {session, replies, system: body => send(0x01, body), systemNoReply: body => send(0x81, body),
        direct: (globals, code) => send(0x00, [globals & 0xff, globals >> 8, ...code])};
};

/** A host's download: BEGIN_DOWNLOAD with the size and path, then CONTINUE_DOWNLOAD in 100-byte chunks. */
const download = (link, filePath, bytes, chunk = 100) => {
    const begin = link.system([0x92, ...le32(bytes.length), ...cstr(filePath)]);
    assert.deepEqual(begin.slice(4, 7), [0x03, 0x92, 0x00], `BEGIN_DOWNLOAD ${filePath}`);
    assert.equal(begin.length, 8);
    const handle = begin[7];
    for (let at = 0; at < bytes.length; at += chunk) {
        const last = at + chunk >= bytes.length;
        const r = link.system([0x93, handle, ...bytes.slice(at, at + chunk)]);
        assert.deepEqual(r.slice(4), [0x03, 0x93, last ? 0x08 : 0x00, handle], `CONTINUE_DOWNLOAD at ${at}`);
    }
};

/** CDK §4.2.1: opFILE LOAD_IMAGE USER_SLOT name → GV0(0) size, GV0(4) address; opPROGRAM_START USER_SLOT GV0(0) GV0(4) 0. */
const startProgram = (link, filePath) => link.direct(8, [
    0xc0, 0x08, 0x82, 0x01, 0x00, 0x84, ...cstr(filePath), 0x60, 0x64,
    0x03, 0x01, 0x60, 0x64, 0x00
]);
/** opPROGRAM_INFO GET_STATUS USER_SLOT → GV0(0). */
const status = link => link.direct(1, [0x0c, 0x16, 0x01, 0x60])[5];

const TAU_S = 0.04;
const benchSpeeds = new WeakMap();
const bench = (hub, ms, probes = () => ({})) => {
    const end = hub.s.timeMs + ms;
    if (!benchSpeeds.has(hub)) benchSpeeds.set(hub, new Map());
    const speeds = benchSpeeds.get(hub);
    for (let t = hub.s.timeMs + 5; t <= end + 1e-9; t += 5) {
        hub.advanceTo(t);
        const readings = hub.readDrives().map(d => {
            const spec = hub.specs.get('ABCD'.indexOf(d.port));
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

test('BEGIN_DOWNLOAD as the CDK writes it (§3.3.1): "../apps/tst/tst.rbf" relative to lms2012/sys, the reply 0600xxxx03920000', () => {
    const hub = brick();
    const link = connect(hub);
    // 1C00 xxxx 01 92 xxxxxxxx "../apps/tst/tst.rbf\0": length 0x1C, the file size, the path.
    const body = hex('92 05000000 2E2E2F617070732F7473742F7473742E72626600');
    const reply = link.system(body);
    assert.equal(body.length + 3, 0x1c);
    assert.deepEqual([reply[0], reply[1], ...reply.slice(4)], hex('0600 03920000'));
    assert.deepEqual(link.system([0x93, 0, 1, 2, 3, 4, 5]).slice(4), [0x03, 0x93, 0x08, 0x00], 'complete: END_OF_FILE');
    assert.deepEqual(hub.readFile('/home/root/lms2012/apps/tst/tst.rbf'), [1, 2, 3, 4, 5]);
    assert.deepEqual(hub.readFile('../apps/tst/tst.rbf'), [1, 2, 3, 4, 5], 'the same file by the path a host uses');
    // A no-reply download chunk is written and answered by nothing.
    const begin = link.system([0x92, ...le32(4), ...cstr('../prjs/q/q.bin')]);
    assert.equal(link.systemNoReply([0x93, begin[7], 9, 8, 7, 6]), null);
    assert.deepEqual(hub.readFile('../prjs/q/q.bin'), [9, 8, 7, 6]);
});

test('files: LIST_FILES (MD5, size, name; folders with "/"), upload, getfile, close, folders, delete, open handles, and the errors', () => {
    const hub = brick();
    const link = connect(hub);
    const rbf = fixture('wall-stopper');
    download(link, '../prjs/bw/wall.rbf', rbf);
    download(link, '../prjs/bw/notes.txt', cstr('hello').slice(0, 5), 2);

    // LIST_FILES 0x99 (max bytes LE16, path) → status, list size LE32, handle, the list [CDK §3.3.4].
    const list = link.system([0x99, ...le16(500), ...cstr('../prjs/bw/')]);
    assert.deepEqual(list.slice(4, 7), [0x03, 0x99, 0x08], 'the whole list fits: END_OF_FILE');
    const text = ascii(list.slice(12));
    assert.equal(u32(list, 7), text.length);
    const md5 = bytes => createHash('md5').update(Uint8Array.from(bytes)).digest('hex').toUpperCase();
    const size = n => n.toString(16).toUpperCase().padStart(8, '0');
    assert.deepEqual(text.split('\n').filter(Boolean).sort(), [
        './', '../', `${md5([104, 101, 108, 108, 111])} ${size(5)} notes.txt`, `${md5(rbf)} ${size(rbf.length)} wall.rbf`
    ].sort());
    const parent = ascii(link.system([0x99, ...le16(500), ...cstr('../prjs')]).slice(12));
    assert.ok(parent.split('\n').includes('bw/'), parent);
    // A list longer than asked for continues: CONTINUE_LIST_FILES 0x9A (handle, max bytes) → status, handle, the rest.
    const first = link.system([0x99, ...le16(10), ...cstr('../prjs/bw')]);
    assert.deepEqual(first.slice(4, 7), [0x03, 0x99, 0x00]);
    const rest = link.system([0x9a, first[11], ...le16(500)]);
    assert.deepEqual(rest.slice(4, 8), [0x03, 0x9a, 0x08, first[11]]);
    assert.equal(ascii([...first.slice(12), ...rest.slice(8)]), text);
    // A folder that is not there: SYSTEM_REPLY_ERROR, UNKNOWN_ERROR, handle 0xFF.
    assert.deepEqual(link.system([0x99, ...le16(100), ...cstr('../prjs/none/')]).slice(4), [0x05, 0x99, 0x0a, 0, 0, 0, 0, 0xff]);

    // BEGIN_UPLOAD 0x94 (bytes LE16, path) → status, size LE32, handle, data; CONTINUE_UPLOAD 0x95 (handle, bytes).
    const up = link.system([0x94, ...le16(40), ...cstr('../prjs/bw/wall.rbf')]);
    assert.deepEqual(up.slice(4, 7), [0x03, 0x94, 0x00]);
    assert.equal(u32(up, 7), rbf.length);
    const more = link.system([0x95, up[11], ...le16(1000)]);
    assert.deepEqual(more.slice(4, 8), [0x03, 0x95, 0x08, up[11]], 'the end: END_OF_FILE, and the handle is closed');
    assert.deepEqual([...up.slice(12), ...more.slice(8)], rbf);
    assert.deepEqual(link.system([0x95, up[11], ...le16(10)]).slice(4, 7), [0x05, 0x95, 0x01], 'closed: UNKNOWN_HANDLE');
    assert.deepEqual(link.system([0x94, ...le16(10), ...cstr('../prjs/bw/none.rbf')]).slice(4, 7), [0x05, 0x94, 0x01]);
    // BEGIN_GETFILE 0x96 keeps its handle at the end; CLOSE_FILEHANDLE 0x98 (handle) → status, handle.
    const get = link.system([0x96, ...le16(100), ...cstr('../prjs/bw/notes.txt')]);
    assert.deepEqual(get.slice(4, 7), [0x03, 0x96, 0x08]);
    assert.deepEqual(get.slice(12), [104, 101, 108, 108, 111]);
    // LIST_OPEN_HANDLES 0x9D → status, a bit per handle in use.
    const open = link.system([0x9d]);
    assert.deepEqual(open.slice(4, 7), [0x03, 0x9d, 0x00]);
    assert.ok(open[7 + (get[11] >> 3)] & (1 << (get[11] & 7)), 'the getfile handle is open');
    assert.deepEqual(link.system([0x98, get[11]]).slice(4), [0x03, 0x98, 0x00, get[11]]);
    assert.deepEqual(link.system([0x98, get[11]]).slice(4), [0x05, 0x98, 0x01, get[11]], 'twice: UNKNOWN_HANDLE');

    // CREATE_DIR 0x9B / DELETE_FILE 0x9C (path) → status; NO_PERMISSION (0x05) where mkdir / remove refuse.
    assert.deepEqual(link.system([0x9b, ...cstr('../prjs/new')]).slice(4), [0x03, 0x9b, 0x00]);
    assert.deepEqual(link.system([0x9b, ...cstr('../prjs/new')]).slice(4), [0x05, 0x9b, 0x05], 'exists');
    assert.deepEqual(link.system([0x9c, ...cstr('../prjs/bw')]).slice(4), [0x05, 0x9c, 0x05], 'not empty');
    assert.deepEqual(link.system([0x9c, ...cstr('../prjs/bw/notes.txt')]).slice(4), [0x03, 0x9c, 0x00]);
    assert.equal(hub.readFile('../prjs/bw/notes.txt'), null);
    assert.deepEqual(link.system([0x9c, ...cstr('../prjs/new')]).slice(4), [0x03, 0x9c, 0x00], 'an empty folder');
    // A system command the brick lacks (WRITEMAILBOX): SYSTEM_REPLY_ERROR, UNKNOWN_ERROR.
    assert.deepEqual(link.system([0x9e, 3, ...cstr('abc'), ...le16(1), 7]).slice(4), [0x05, 0x9e, 0x0a]);
});

test('LOAD_IMAGE + PROGRAM_START (CDK §4.2.1) run a downloaded program; PROGRAM_INFO and PROGRAM_STOP; a missing file never starts', () => {
    const hub = brick();
    const link = connect(hub);
    download(link, '../prjs/bw/timed.rbf', fixture('motor-timed'));
    assert.equal(status(link), 0x40, 'STOPPED before');
    // A file that is not there: size 0, address 0 — and PROGRAM_START does not start it.
    const none = startProgram(link, '../prjs/bw/none.rbf');
    assert.deepEqual(none.slice(4), [0x02, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(hub.currentProgram(), null);
    const reply = startProgram(link, '../prjs/bw/timed.rbf');
    assert.equal(reply[4], 0x02, 'DIRECT_REPLY');
    assert.equal(u32(reply, 5), fixture('motor-timed').length, 'LOAD_IMAGE: the size');
    assert.notEqual(u32(reply, 9), 0, 'LOAD_IMAGE: an image address');
    assert.equal(hub.currentProgram(), '/home/root/lms2012/prjs/bw/timed.rbf');
    assert.equal(status(link), 0x10, 'RUNNING');
    bench(hub, 600);
    assert.ok(hub.s.outputs[1].angleDeg > 100, `B runs at power 50: ${hub.s.outputs[1].angleDeg.toFixed(0)}°`);
    // A second start while it runs is ignored, as by the brick (the user slot is not STOPPED).
    assert.deepEqual(startProgram(link, '../prjs/bw/timed.rbf').slice(4), [0x02, 0, 0, 0, 0, 0, 0, 0, 0]);
    // opPROGRAM_STOP USER_SLOT.
    assert.deepEqual(link.direct(0, [0x02, 0x01]).slice(4), [0x02]);
    assert.equal(status(link), 0x40);
    assert.equal(hub.s.lastProgram.how, 'abort');
    assert.ok(hub.events.some(e => e.kind === 'program-end'));
});

test('a program on the bench: motor-timed runs B one second, the TIME cycles; it ends and the brick stops the outputs', () => {
    const hub = brick();
    const link = connect(hub);
    download(link, '../prjs/bw/timed.rbf', fixture('motor-timed'));
    startProgram(link, '../prjs/bw/timed.rbf');
    const samples = [];
    for (let k = 0; k < 600; k++) {
        bench(hub, 5);
        samples.push({t: hub.s.timeMs, B: hub.s.outputs[1].angleDeg, C: hub.s.outputs[2].angleDeg, running: Boolean(hub.currentProgram())});
    }
    const end = samples.find(p => !p.running);
    assert.ok(end, 'the program ended');
    // B for 1000 ms, then C's 800 ms TIME_POWER cycle, then B and C 500 ms backwards: ≈ 2300 ms.
    assert.ok(end.t >= 2300 && end.t <= 2320, `ended at ${end.t} ms`);
    const at = t => samples.find(p => p.t >= t);
    assert.ok(at(1000).B > 200, 'B turned forwards in its second');
    assert.ok(Math.abs(at(1000).C) < 1, 'C waited');
    assert.ok(at(1800).C > 200, 'C turned forwards in its cycle');
    assert.ok(at(2300).C < at(1800).C, 'then backwards');
    assert.equal(hub.s.lastProgram.how, 'ok');
    // The UI's STOP_ALL: no job, nothing started, nothing busy.
    for (const p of hub.s.outputs) assert.deepEqual([p.job, p.started, p.busy], [null, false, false]);
});

test('the wall stopper on the bench: B and C until the ultrasonic reads under 15 cm, then braked', () => {
    const hub = brick();
    const link = connect(hub);
    download(link, '../prjs/bw/wall.rbf', fixture('wall-stopper'));
    startProgram(link, '../prjs/bw/wall.rbf');
    // The wall comes closer as B turns: 60 cm minus 0.1 cm per degree.
    bench(hub, 3000, () => ({4: {kind: 'ev3-ultrasonic', rangeMm: Math.max(30, 600 - hub.s.outputs[1].angleDeg)}}));
    const written = hub.events.filter(e => e.kind === 'write').map(e => e.text);
    assert.deepEqual(written, ['wall']);
    assert.equal(hub.s.lastProgram.how, 'ok');
    const cm = hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
    assert.ok(cm <= 15 && cm > 3, `stopped at ${cm} cm`);
});

test('a refused image: PROGRAM_START accepts the command, the program never runs, the refusal is named', () => {
    const hub = brick();
    const link = connect(hub);
    const bad = fixture('arithmetic');
    bad[0] = 0x4d;
    download(link, '../prjs/bw/bad.rbf', bad);
    assert.equal(startProgram(link, '../prjs/bw/bad.rbf')[4], 0x02);
    assert.equal(hub.currentProgram(), null);
    assert.equal(hub.s.lastProgram.error.code, 'BAD_SIGN');
    assert.ok(hub.events.some(e => e.kind === 'program-refused' && e.status === 'BAD_SIGN'));
    assert.equal(link.direct(1, [0x0c, 0x18, 0x01, 0x60])[5], 2, 'GET_PRGRESULT: FAIL');
});

test('a running program round-trips through the worker mirror', () => {
    const a = brick();
    const link = connect(a);
    download(link, '../prjs/bw/timed.rbf', fixture('motor-timed'));
    startProgram(link, '../prjs/bw/timed.rbf');
    bench(a, 300);
    const b = hubRegistry.create('ev3', {id: 'ev3'});
    b.importState(JSON.parse(JSON.stringify(a.exportState())));
    benchSpeeds.set(b, new Map(benchSpeeds.get(a)));
    assert.equal(a.stateKey(a.exportState()), b.stateKey(b.exportState()));
    for (const hub of [a, b]) bench(hub, 1400);
    assert.deepEqual(b.readDrives(), a.readDrives());
    assert.equal(b.s.outputs[1].angleDeg, a.s.outputs[1].angleDeg);
    assert.deepEqual(b.vm.s, a.vm.s);
});

test('Robot Lab: the EV3 wall stopper runs wall-stopper.rbf — drives at the wall, stops before it', async t => {
    const {SimSession, catalogFrom, MODELS, MODELS_BASE} = await import(path.join(SIM, 'sim-session.js'));
    const {WALL} = await import(path.join(SIM, 'world/mats.js'));
    const catalog = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta', 'parts.json'), 'utf8')));
    const entry = MODELS.find(m => m.file === 'ev3-wall-stopper.ldr');
    const modelText = readFileSync(path.join(ROOT, 'overlay/scratch-gui', MODELS_BASE, entry.file), 'utf8');
    const {session, issues} = await SimSession.fromText(modelText, {hubState: null, catalog, mat: entry.mat});
    assert.ok(session, JSON.stringify(issues));
    try {
        const {hub, body} = session.hubs.find(h => h.profile === 'ev3');
        const link = connect(hub);
        download(link, '../prjs/wall/wall.rbf', fixture('wall-stopper'));
        assert.equal(startProgram(link, '../prjs/wall/wall.rbf')[4], 0x02);
        const start = session.core.bodyPose(body).position[0];
        const track = [];
        let wallAt = null;
        for (let k = 0; k < 400; k++) {
            session.tick(1000 / 30);
            const pose = session.core.bodyPose(body);
            track.push({t: session.time, x: pose.position[0], B: hub.s.outputs[1].angleDeg, C: hub.s.outputs[2].angleDeg});
            if (wallAt === null && hub.events.some(e => e.kind === 'write' && e.text === 'wall')) wallAt = session.time;
            if (wallAt !== null && session.time > wallAt + 1000) break;
        }
        assert.ok(wallAt !== null, 'the program saw the wall');
        const last = track.at(-1);
        const cm = hub.readInput(0, 3, 0, 0, 'READY_SI').values[0];
        t.diagnostic(`saw the wall at ${(wallAt / 1000).toFixed(2)} s; robot from x = ${start.toFixed(3)} to ${last.x.toFixed(3)} m (wall face ${WALL.faceX} m), ${cm} cm`);
        assert.ok(last.x - start > 0.2, 'it drove at the wall');
        assert.ok(last.x < WALL.faceX, 'in front of the wall');
        assert.ok(cm > 2 && cm < 15, `stopped before the wall: ${cm} cm`);
        const before = track.find(p => p.t >= last.t - 500);
        for (const port of ['B', 'C']) assert.ok(Math.abs(last[port] - before[port]) < 3, `${port} stopped`);
        assert.equal(hub.s.lastProgram.how, 'ok', 'the program ended after its half-second wait');
    } finally {
        session.dispose();
    }
});
