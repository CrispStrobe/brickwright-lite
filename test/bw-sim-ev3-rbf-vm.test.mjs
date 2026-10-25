// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Virtual EV3's program VM (routes/ev3-vm/; docs/EV3-RBF-VM.md), on its own: lmsasm programs
 * assembled by the owner's hosted compiler (test/fixtures/ev3-rbf/, never compiled here, no network)
 * run against a recording stand-in for the brick and are observed only through what the brick sees —
 * the console writes each program ends with (UI_WRITE VALUE32 / VALUEF / PUT_STRING), tones, output
 * calls — never through the VM's variables.
 *
 * HOW EXPECTATIONS ARE DERIVED. From the program text and the instruction set's C semantics as LEGO's
 * EV3 Firmware Developer Kit and lms2012 define them ([V §…] below is docs/EV3-RBF-VM.md): integers
 * wrap to their width; integer division truncates, and by zero gives the type's MAX for a positive
 * dividend and MIN (-MAX) for a negative one; MOVE to a narrower type saturates; a float moved to an
 * integer truncates; ROUND is half away from zero; a CALL copies inputs in and outputs back; object 1
 * is the one that starts. Never by running the VM and copying what it printed.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VM_DIR = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/routes/ev3-vm');
const {Ev3Vm, SNAPSHOT_FORMAT, MAX_HANDLES} = await import(path.join(VM_DIR, 'ev3-vm.js'));
const {parseRbf} = await import(path.join(VM_DIR, 'rbf-file.js'));
const {OP, OPCODE_NAMES, FILE} = await import(path.join(VM_DIR, 'ev3-bytecodes.js'));
const {freshFs, readFile, putFile, resolveProgramPath, resolvePath, WORKING_DIR, USER_SPACE_BYTES, STATUS: FILE_STATUS} =
    await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-files.js'));

const FIXTURES = ['wall-stopper', 'motor-timed', 'motor-degrees', 'touch-wait', 'arithmetic', 'arrays', 'threads', 'subcalls',
    'sound-timers', 'unimplemented', 'data-files'];
const fixture = name => readFileSync(path.join(ROOT, 'test/fixtures/ev3-rbf', `${name}.rbf`));

/** A brick that records what the program does to it (the direct commands' BRICK methods the fixtures reach). */
const recorder = ({touch = () => 0, distance = () => 255} = {}) => {
    const fs = freshFs();
    const io = {
        fs,
        readFile: p => readFile(fs, p),
        putFile: (p, b) => putFile(fs, p, b),
        t: 0, events: [], calls: [], toneEnd: 0, busy: new Set(),
        atMs (t) { io.t = t; },
        nowMs: () => io.t,
        event (kind, detail) { io.events.push({t: io.t, kind, ...detail}); },
        tone (volume, frequency, duration) {
            io.toneEnd = io.t + duration;
            io.event('tone', {volume, frequency, duration});
        },
        soundBusy: () => io.t < io.toneEnd,
        soundBreak () {
            io.toneEnd = 0;
            io.event('sound-stop', {});
        },
        sleepMinutes: () => 30,
        readInput: (layer, no) => ({values: [no === 0 ? touch(io.t) : no === 3 ? distance(io.t) : 0]}),
        outputSet: (...a) => io.calls.push(['set', io.t, ...a]),
        outputStart: (...a) => io.calls.push(['start', io.t, ...a]),
        outputStop: (...a) => io.calls.push(['stop', io.t, ...a]),
        outputReset: (...a) => io.calls.push(['reset', io.t, ...a]),
        outputClearCount: (...a) => io.calls.push(['clear', io.t, ...a]),
        outputProfile (layer, nos, job) {
            io.calls.push(['profile', io.t, layer, nos, job]);
            // An ideal motor: a timed cycle takes its time, a degree cycle completes at once.
            if (job.unit === 'ms') {
                io.busy.add(nos);
                const until = io.t + job.steps.reduce((a, b) => a + b, 0);
                io.busyUntil = {...io.busyUntil, [nos]: until};
            }
        },
        outputSync: (...a) => io.calls.push(['sync', io.t, ...a]),
        outputBusy: (layer, nos) => Object.entries(io.busyUntil || {}).some(([n, until]) => (Number(n) & nos) && io.t < until),
        outputRead: (layer, no) => ({speed: 0, tacho: 100 + no}),
        outputCount: (layer, no) => 200 + no
    };
    return io;
};

const run = (name, ms = 3000, io = recorder(), options = {}) => {
    const vm = new Ev3Vm(options);
    const r = vm.start(fixture(name), {name: `${name}.rbf`});
    assert.deepEqual(r, {ok: true}, `${name} loads`);
    vm.advanceTo(ms, io);
    const writes = io.events.filter(e => e.kind === 'write').map(e => (e.value !== undefined ? e.value : e.text));
    return {vm, io, writes};
};
const f32 = x => Math.fround(x);

test('every fixture is an EV3 image: LEGO sign, its size, object 1 a VMTHREAD (the object the firmware starts)', () => {
    for (const name of FIXTURES) {
        const bytes = fixture(name);
        const r = parseRbf(bytes);
        assert.equal(r.ok, true, `${name}: ${r.detail}`);
        assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'LEGO', name);
        assert.equal(r.program.size, bytes.length, `${name}: the header's image size is the file's`);
        assert.equal(r.program.objects[1].kind, 'vmthread', name);
        assert.equal(r.program.objects[1].trigger, 0, name);
    }
    const t = parseRbf(fixture('threads')).program.objects;
    assert.deepEqual(t.slice(1).map(o => `${o.kind}:${o.owner}:${o.trigger}`), ['vmthread:0:0', 'subcall:0:1', 'block:1:1', 'vmthread:0:0']);
    assert.deepEqual(parseRbf(fixture('subcalls')).program.objects[2].params.map(p => [p.in, p.out, p.type]),
        [[true, false, 2], [true, false, 2], [false, true, 2], [true, false, 0]], 'Add3: IN_32 IN_32 OUT_32 IN_8');
});

test('bad images are refused with a reason: sign, a size that does not cover the headers or the file, no objects, an object outside the image', () => {
    const good = Array.from(fixture('arithmetic'));
    const bad = (edit, status) => {
        const b = good.slice();
        edit(b);
        const r = parseRbf(b);
        assert.equal(r.ok, false);
        assert.equal(r.status, status, r.detail);
        return r;
    };
    bad(b => { b[0] = 0x4d; }, 'BAD_SIGN');
    bad(b => { b[4] = 10; b[5] = 0; }, 'BAD_SIZE');
    bad(b => { b.length = 40; }, 'BAD_SIZE');
    bad(b => { b[10] = 0; b[11] = 0; }, 'NO_OBJECTS');
    bad(b => { b[16] = 0xff; b[17] = 0xff; }, 'BAD_OBJECT');
    // A refused image never runs: the VM reports why.
    const vm = new Ev3Vm();
    const b = good.slice();
    b[0] = 0x4d;
    assert.equal(vm.start(b).ok, false);
    assert.equal(vm.status, 'error');
    assert.equal(vm.error.code, 'BAD_SIGN');
});

test('arithmetic: wrap-around, truncating division, division by zero, MOD32, conversions, logic, comparisons, floats', () => {
    const {vm, writes} = run('arithmetic');
    assert.equal(vm.status, 'stopped');
    assert.equal(vm.s.ending, 'ok');
    assert.deepEqual(writes, [
        (2000000000 + 2000000000) | 0, // ADD32 wraps
        -7, -42,
        -3, // -17 / 5 truncates toward zero
        2147483647, -2147483647, // 9 / 0 → DATA32_MAX; -9 / 0 → DATA32_MIN (-MAX) [V §Arithmetic]
        2, // MOD32 17 5
        ((32000 + 1000) << 16) >> 16, // ADD16 wraps, MOVE16_32 widens
        ((100 + 100) << 24) >> 24, // ADD8 wraps
        127, // MOVE32_8 300 saturates
        7, -7, // MOVEF_32 truncates toward zero
        0x0f0f & 0x00ff, 0x0f00 | 0x00f0, 0xff ^ 0x0f, 3 << 4,
        1, 11, // CP_LT32 -1 1; SELECT32 on it
        3.75, 0.25, f32(Math.SQRT2), -3, -3, 3.5, -12 // ROUND -2.5 is -3 (half away from zero); FLOOR -2.5 is -3
    ]);
});

test('arrays by handle (create, fill, write past the end, append, size, copy, init), byte arrays, strings', () => {
    const {vm, writes} = run('arrays');
    assert.equal(vm.s.ending, 'ok');
    assert.deepEqual(writes, [
        42, // ARRAY_WRITE 2 then ARRAY_READ 2
        99, // writing index 6 of a 4-element array grows it
        5, // ARRAY_APPEND after index 6 is index 7
        8, // its size
        99, // COPY into a 1-element array copies all 8
        60, // INIT32 10 20 30, summed
        3, // WRITE8 3 at index 3 of an ARRAY8, READ8 back
        5, // "n=042"
        1, // COMPARE with 'n=042'
        'n=042', '042' // NUMBER_TO_STRING 42 with 3 figures pads with zeros
    ]);
});

test('subcalls: inputs copied in, outputs and in/outs copied back, a float out, a nested call, a string in and out', () => {
    const {vm, writes} = run('subcalls');
    assert.equal(vm.s.ending, 'ok');
    assert.deepEqual(writes, [
        33, // Add3(10, 20, R, 3) = 10 + 20 + 3
        42, -8, // DoubleIt doubles its in/out 32- and 16-bit parameters
        49, // SquareViaAdd(7) calls Add3 seven times
        6, // "Hi EV3"
        5.25, // 42 / 8 through the OUT_F parameter
        'Hi EV3'
    ]);
});

test('threads: OBJECT_START, a sub shared by two threads (the second waits), a BLOCK by OBJECT_TRIG, OBJECT_WAIT', () => {
    const {vm, writes} = run('threads', 2000);
    assert.equal(vm.s.ending, 'ok');
    const [counter, mainDone, secondDone, blockRan, order] = writes;
    assert.equal(counter, 5 * 1 + 5 * 100, 'every Bump counted');
    assert.equal(mainDone, 1);
    assert.equal(secondDone, 1);
    assert.equal(blockRan, 2, 'the block ran once per OBJECT_TRIG');
    assert.equal(order, 23, 'MAIN waited for SECOND to end before appending its 3');
});

test('sound and timers: SOUND_READY waits for the tone, SOUND_TEST, TIMER_WAIT/READY, TIMER_READ, RANDOM, KEEP_ALIVE', () => {
    const {vm, io, writes} = run('sound-timers', 2000, recorder(), {seed: 7});
    assert.equal(vm.s.ending, 'ok');
    const [start, elapsed, busy, idle, rand, minutes] = writes;
    assert.ok(start >= 0 && start <= 1, `TIMER_READ counts from the program's start: ${start}`);
    assert.equal(elapsed, 300 + 250, 'the 300 ms tone, then a 250 ms wait');
    assert.equal(busy, 1);
    assert.equal(idle, 0);
    assert.ok(rand >= 10 && rand <= 20, `RANDOM(10, 20): ${rand}`);
    assert.equal(minutes, 30);
    const tones = io.events.filter(e => e.kind === 'tone');
    assert.deepEqual(tones.map(e => [e.frequency, e.duration]), [[440, 300], [660, 100]]);
    assert.equal(tones[1].t - tones[0].t, 300, 'the second tone after the first ended');
    assert.ok(io.events.some(e => e.kind === 'sound-stop'));
});

test('motors: a power for one second, TIME and STEP cycles, OUTPUT_READY waits, OUTPUT_READ and GET_COUNT', () => {
    const timed = run('motor-timed', 4000);
    assert.equal(timed.vm.s.ending, 'ok');
    const calls = timed.io.calls.map(([what, t, ...args]) => [what, t, ...args]);
    const at = what => calls.filter(c => c[0] === what);
    assert.deepEqual(at('set')[0].slice(2), [0, 2, 'power', 50]);
    assert.equal(at('stop')[0][1] - at('start')[0][1], 1000, 'B ran for one second');
    const [tp, ts] = at('profile');
    assert.deepEqual(tp.slice(2), [0, 4, {regulated: false, unit: 'ms', value: 60, steps: [100, 600, 100], brake: true}]);
    assert.deepEqual(ts.slice(2), [0, 6, {regulated: true, unit: 'ms', value: -30, steps: [0, 500, 0], brake: false}]);
    assert.equal(ts[1] - tp[1], 800, 'OUTPUT_READY waited for the 800 ms TIME_POWER cycle');

    const degrees = run('motor-degrees');
    assert.equal(degrees.vm.s.ending, 'ok');
    assert.deepEqual(degrees.io.calls.filter(c => c[0] === 'profile').map(c => c.slice(2)), [
        [0, 2, {regulated: false, unit: 'degrees', value: 50, steps: [30, 300, 30], brake: true}],
        [0, 4, {regulated: true, unit: 'degrees', value: -40, steps: [0, 180, 0], brake: true}]
    ]);
    assert.deepEqual(degrees.io.calls.find(c => c[0] === 'sync').slice(2), [0, 6, {speed: 30, turn: 0, unit: 'degrees', amount: 360, brake: true}]);
    // OUTPUT_READ's tacho and GET_COUNT come from the brick (the stand-in answers 100 + port, 200 + port).
    assert.deepEqual(degrees.writes, [101, 102, 201, 101]);
});

test('touch: the program drives until the touch sensor reads pressed, then stops and beeps', () => {
    const {vm, io} = run('touch-wait', 3000, recorder({touch: t => (t >= 1200 ? 1 : 0)}));
    assert.equal(vm.s.ending, 'ok');
    const stop = io.calls.find(c => c[0] === 'stop');
    assert.ok(stop[1] >= 1200 && stop[1] <= 1201, `stopped when pressed: ${stop[1]} ms`);
    assert.deepEqual(stop.slice(2), [0, 6, true]);
    assert.deepEqual(io.events.filter(e => e.kind === 'tone').map(e => e.frequency), [880]);
});

test('the wall stopper: power 40 on B and C until the ultrasonic reads under 15 cm, then brake', () => {
    const {vm, io, writes} = run('wall-stopper', 3000, recorder({distance: t => Math.max(3, 60 - t / 40)}));
    assert.equal(vm.s.ending, 'ok');
    const stop = io.calls.find(c => c[0] === 'stop');
    // JR_GTF loops while the distance is above 15 cm: 60 - t/40 is 15 at t = 1800 ms.
    assert.ok(stop[1] >= 1800 && stop[1] <= 1801, `stopped at ${stop[1]} ms`);
    assert.deepEqual(writes, ['wall']);
});

test('the scheduler: object 1 alone starts; a program whose object 1 is a subcall ends at once', () => {
    // threads.rbf with its objects 1 and 2 swapped in the header: object 1 is the subcall.
    const b = Array.from(fixture('threads'));
    const h1 = b.slice(16, 28);
    const h2 = b.slice(28, 40);
    b.splice(16, 24, ...h2, ...h1);
    const vm = new Ev3Vm();
    assert.deepEqual(vm.start(b), {ok: true});
    vm.advanceTo(10, recorder());
    assert.equal(vm.status, 'stopped');
    assert.equal(vm.s.instructions, 0, 'nothing ran: no object was RUNNING');
});

test('the instruction budget: a busy program gets instrPerMs byte codes each millisecond', () => {
    const io = recorder();
    const a = new Ev3Vm({instrPerMs: 50});
    a.start(fixture('touch-wait'));
    a.advanceTo(100, io);
    assert.equal(a.s.instructions, 100 * 50);
    const b = new Ev3Vm();
    b.start(fixture('touch-wait'));
    b.advanceTo(10, recorder());
    assert.equal(b.s.instructions, 10 * 200, 'the default, 200 per ms');
});

test('snapshot / restore mid-program gives the same continuation (the physics worker\'s mirror)', () => {
    const io = recorder();
    const a = new Ev3Vm({seed: 3});
    a.start(fixture('threads'), {name: 'threads.rbf'});
    a.advanceTo(57, io);
    const snap = JSON.parse(JSON.stringify(a.snapshot()));
    assert.equal(snap.format, SNAPSHOT_FORMAT);
    const b = new Ev3Vm();
    assert.throws(() => b.restore(snap), /give its bytes/);
    b.restore(snap, fixture('threads'));
    const ioA = recorder();
    const ioB = recorder();
    a.advanceTo(2000, ioA);
    b.advanceTo(2000, ioB);
    assert.deepEqual(b.s, a.s);
    assert.deepEqual(ioB.events, ioA.events);
});

test('what the VM does not implement stops the program with a named error, never a guess', () => {
    const {vm, writes} = run('unimplemented');
    assert.equal(vm.status, 'error');
    assert.equal(vm.error.code, 'UNIMPLEMENTED_OPCODE');
    assert.equal(vm.error.opcode, 'MAILBOX_OPEN');
    assert.match(vm.error.message, /opMAILBOX_OPEN \(0xd8\)/);
    assert.deepEqual(writes, []);
    assert.ok(vm.drainEvents().some(e => e.kind === 'error' && e.code === 'UNIMPLEMENTED_OPCODE'));
    // A byte that is no opcode (0x23 is unassigned) is the firmware's instruction break, ERR_INSTR.
    assert.equal(OPCODE_NAMES[0x23], undefined);
    const b = Array.from(fixture('unimplemented'));
    const at = parseRbf(b).program.objects[1].offset;
    b[at] = 0x23;
    const v = new Ev3Vm();
    v.start(b);
    v.advanceTo(5, recorder());
    assert.equal(v.error.code, 'ERR_INSTR');
    // An array read outside the array fails as the firmware's FAILBREAK, with the reason.
    const r = Array.from(fixture('unimplemented'));
    const code = [OP.ARRAY, 0x03, 0x01, 0x60, OP.ARRAY_READ, 0x60, 0x05, 0x40, OP.OBJECT_END];
    r.splice(at, code.length, ...code);
    const w = new Ev3Vm();
    w.start(r);
    w.advanceTo(5, recorder());
    assert.equal(w.error.code, 'FAILBREAK');
    assert.match(w.error.message, /ARRAY_READ index 5 outside the array's 1 elements/);
});

test('compiled program files preserve binary bytes, append/truncate, EOF tail and array handles', () => {
    const {vm, io, writes} = run('data-files');
    assert.equal(vm.status, 'stopped', JSON.stringify(vm.error));
    assert.deepEqual(writes, [5, 72, 0, 73, 74, 75, 0, 99, 1, 0, 7]);
    assert.deepEqual(io.readFile(resolveProgramPath('trace.bin', vm.name)), [73]);
    assert.equal(io.readFile(resolveProgramPath('missing.bin', vm.name)), null);
    assert.equal(vm.s.handles.filter(h => h?.kind === 'file').length, 0);
    assert.deepEqual(vm._array(0).data, [7, 7], 'file CLOSE must preserve the array sharing the pool');
});

const fileMachine = () => {
    const vm = new Ev3Vm();
    const name = resolvePath('../prjs/files/main.rbf');
    assert.deepEqual(vm.start(fixture('data-files'), {name}), {ok: true});
    return {vm, io: recorder()};
};

test('bare program-data paths use the image folder while explicit paths retain communication resolution', () => {
    const {vm, io} = fileMachine();
    assert.equal(io.putFile('trace.bin', [1, 2]), FILE_STATUS.SUCCESS);
    const h = vm._fileOpen('trace.bin', 'w', io).handle;
    vm._fileWrite(h, 4, {a: 'k', raw: 0x11223344}, io);
    const target = resolveProgramPath('trace.bin', vm.name);
    assert.notEqual(target, `${WORKING_DIR}/trace.bin`);
    assert.deepEqual(io.readFile(target), [68, 51, 34, 17]);
    assert.deepEqual(io.readFile('trace.bin'), [1, 2]);
    assert.equal(resolveProgramPath('../prjs/other/data.bin', vm.name), resolvePath('../prjs/other/data.bin'));
    assert.equal(resolveProgramPath('', vm.name), null);
    assert.equal(resolveProgramPath('bad\0name', vm.name), null);
});

test('missing read allocates no descriptor; empty EOF writes one zero without destroying the tail', () => {
    const {vm, io} = fileMachine();
    const array = vm._create('8', 4);
    assert.deepEqual(vm._fileOpen('missing.bin', 'r', io), {handle: 0, size: 0});
    assert.throws(() => vm._file(0), error => error.code === 'FAILBREAK');
    assert.equal(vm._array(array).count, 4);
    assert.equal(io.putFile(resolveProgramPath('empty.bin', vm.name), []), FILE_STATUS.SUCCESS);
    const opened = vm._fileOpen('empty.bin', 'r', io);
    assert.equal(opened.size, 0);
    vm.s.globals.fill(99);
    vm._fileRead(opened.handle, 4, {a: 'g', off: 0}, io);
    assert.deepEqual(vm.s.globals.slice(0, 5), [0, 99, 99, 99, 99]);
    assert.equal(vm._file(opened.handle).position, 0);
});

test('append always uses current end and zero-byte operations leave storage and pointers unchanged', () => {
    const {vm, io} = fileMachine();
    const a = vm._fileOpen('append.bin', 'a', io).handle;
    const b = vm._fileOpen('append.bin', 'a', io).handle;
    vm._fileWrite(a, 1, {a: 'k', raw: 65}, io);
    vm._fileWrite(b, 1, {a: 'k', raw: 66}, io);
    vm._fileWrite(a, 1, {a: 'k', raw: 67}, io);
    const path = resolveProgramPath('append.bin', vm.name);
    assert.deepEqual(io.readFile(path), [65, 66, 67]);
    const before = JSON.parse(JSON.stringify({state: vm.s, fs: io.fs}));
    vm._fileWrite(a, 0, {a: 'k', raw: 0}, io);
    assert.deepEqual({state: vm.s, fs: io.fs}, before);
});

test('file modes, byte spans and storage refusals do not partially write or advance the descriptor', () => {
    const {vm, io} = fileMachine();
    const h = vm._fileOpen('bounded.bin', 'w', io).handle;
    const path = resolveProgramPath('bounded.bin', vm.name);
    assert.throws(() => vm._fileRead(h, 1, {a: 'g', off: 0}, io), error => error.code === 'FAILBREAK');
    for (const count of [-1, 32768, 1.5]) assert.throws(() => vm._fileWrite(h, count, {a: 'g', off: 0}, io), error => error.code === 'FAILBREAK');
    assert.throws(() => vm._fileWrite(h, 2, {a: 'g', off: vm.s.globals.length - 1}, io), error => error.code === 'FAILBREAK');
    assert.throws(() => vm._fileWrite(h, 5, {a: 'k', raw: 1}, io), error => error.code === 'FAILBREAK');
    assert.deepEqual(io.readFile(path), []);
    assert.equal(vm._file(h).position, 0);
    const write = io.putFile;
    io.putFile = () => FILE_STATUS.SIZE_ERROR;
    assert.throws(() => vm._fileWrite(h, 1, {a: 'k', raw: 1}, io), error => error.code === 'FAILBREAK');
    assert.deepEqual(io.readFile(path), []);
    assert.equal(vm._file(h).position, 0);
    io.putFile = write;
    vm._file(h).position = USER_SPACE_BYTES;
    assert.throws(() => vm._fileWrite(h, 1, {a: 'k', raw: 1}, io), error => error.code === 'FAILBREAK');
    assert.deepEqual(io.readFile(path), []);
    const read = vm._fileOpen('bounded.bin', 'r', io).handle;
    assert.throws(() => vm._fileWrite(read, 1, {a: 'g', off: 0}, io), error => error.code === 'FAILBREAK');
    assert.throws(() => vm._fileRead(read, 1, {a: 'c', off: 0}, io), error => error.code === 'FAILBREAK');
    assert.equal(vm._file(read).position, 0);
});

test('file and array handles cannot be confused and exhausted handles cannot truncate a file', () => {
    const {vm, io} = fileMachine();
    const array = vm._create('8', 1);
    const file = vm._fileOpen('kept.bin', 'w', io).handle;
    assert.throws(() => vm._file(array), error => error.code === 'FAILBREAK');
    assert.throws(() => vm._array(file), error => error.code === 'FAILBREAK');
    assert.throws(() => vm.get({a: 'h', h: file, off: 0}, '8'), error => error.code === 'FAILBREAK');
    const path = resolveProgramPath('kept.bin', vm.name);
    io.putFile(path, [8]);
    while (vm.s.handles.filter(Boolean).length < MAX_HANDLES) vm._create('8', 0);
    assert.throws(() => vm._fileOpen('kept.bin', 'w', io), error => error.code === 'FAILBREAK');
    assert.deepEqual(io.readFile(path), [8]);
    vm.abort();
    assert.throws(() => vm._file(file), error => error.code === 'FAILBREAK');
    assert.equal(vm._array(array).count, 1);
});

test('file bytes, offsets and handle numbers survive JSON snapshot continuation', () => {
    const {vm, io} = fileMachine();
    const path = resolveProgramPath('resume.bin', vm.name);
    io.putFile(path, [11, 22, 33, 44]);
    const h = vm._fileOpen('resume.bin', 'r', io).handle;
    vm._fileRead(h, 1, {a: 'g', off: 0}, io);
    const saved = JSON.parse(JSON.stringify({vm: vm.snapshot(), fs: io.fs}));
    const other = new Ev3Vm();
    other.restore(saved.vm, fixture('data-files'));
    const otherIo = recorder();
    Object.assign(otherIo.fs, saved.fs);
    vm._fileRead(h, 4, {a: 'g', off: 1}, io);
    other._fileRead(h, 4, {a: 'g', off: 1}, otherIo);
    assert.deepEqual(other.s, vm.s);
    assert.deepEqual(otherIo.fs, io.fs);
    assert.deepEqual(vm.s.globals.slice(0, 5), [11, 22, 33, 44, 0]);
});

test('a compiled FILE CLOSE instruction rejects an array descriptor with a named VM failure', () => {
    const bytes = Uint8Array.from(fixture('data-files'));
    const at = parseRbf(bytes).program.objects[1].offset;
    bytes.set([OP.FILE, FILE.CLOSE, 0, OP.OBJECT_END], at);
    const vm = new Ev3Vm();
    vm.start(bytes);
    vm._create('8', 1);
    vm.advanceTo(5, recorder());
    assert.equal(vm.status, 'error');
    assert.equal(vm.error.code, 'FAILBREAK');
    assert.equal(vm.error.opcode, 'FILE');
    assert.deepEqual(vm._array(0).data, [0]);
});

test('MEMORY_USAGE accepts a live file descriptor and preserves its documented array-data estimate', () => {
    const bytes = Uint8Array.from(fixture('data-files'));
    const at = parseRbf(bytes).program.objects[1].offset;
    bytes.set([OP.MEMORY_USAGE, 0x60, 0x64, OP.OBJECT_END], at);
    const vm = new Ev3Vm();
    vm.start(bytes);
    const io = recorder();
    vm._create('8', 1024);
    vm._fileOpen('open.bin', 'w', io);
    vm.advanceTo(5, io);
    assert.equal(vm.status, 'stopped', JSON.stringify(vm.error));
    assert.equal(vm.get({a: 'g', off: 0}, '32'), 6144);
    assert.equal(vm.get({a: 'g', off: 4}, '32'), 6143);
});
