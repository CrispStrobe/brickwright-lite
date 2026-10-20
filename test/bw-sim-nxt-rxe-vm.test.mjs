// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Virtual NXT's program VM (routes/nxt-vm/; docs/NXT-RXE-VM.md), on its own: NXC programs compiled
 * by NBC (test/fixtures/nxt-rxe/, never compiled here, no network) run against a recording stand-in for
 * the brick, observed only through what the brick sees — the display calls, tones, output updates,
 * mailboxes — never through the VM's dataspace.
 *
 * HOW EXPECTATIONS ARE DERIVED. From NXC's C semantics (int is 16 bits, long 32, byte unsigned 8;
 * truncating division; `%` takes the dividend's sign), from facts read in LEGO's NXT firmware 1.29 and
 * cited in docs/NXT-RXE-VM.md ([V §…] below) — division by zero gives 0, modulo by zero the dividend;
 * a REPLACE whose new value is an array writes that array's ELEMENTS; an out-of-range INDEX is ERR_ARG —
 * and from the program text (Wait(250) is 250 ms). Never by running the VM and copying what it printed.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VM_DIR = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm');
const {NxtVm, SNAPSHOT_FORMAT} = await import(path.join(VM_DIR, 'nxt-vm.js'));
const {parseRxe, VM_STATUS} = await import(path.join(VM_DIR, 'rxe-file.js'));
const {OP, UPDATE} = await import(path.join(VM_DIR, 'nxt-bytecodes.js'));
const {SYSCALL_NAMES, IMPLEMENTED_SYSCALLS} = await import(path.join(VM_DIR, 'nxt-syscalls.js'));

const fixture = name => readFileSync(path.join(ROOT, 'test/fixtures/nxt-rxe', `${name}.rxe`));

/** A brick that records what the program does to it; motors are ideal (a limited move ends at once). */
const recorder = ({usDistance = () => 255, inbox = []} = {}) => {
    const outs = [0, 1, 2].map(() => ({runState: 0, tachoCount: 0, blockTachoCount: 0, rotationCount: 0, actualSpeed: 0}));
    const io = {
        updates: [], modes: [], tones: [], ls: [], sent: [],
        outputStatus: p => outs[p],
        applyOutput (p, o, flags) {
            io.updates.push({p, flags, power: o.power, mode: o.mode, runState: o.runState, tachoLimit: o.tachoLimit, regMode: o.regMode});
            if (flags & UPDATE.RESET_COUNT) outs[p].tachoCount = 0;
            if (flags & UPDATE.RESET_ROTATION_COUNT) outs[p].rotationCount = 0;
            if (flags & UPDATE.TACHO_LIMIT && o.tachoLimit > 0 && o.runState) {
                // The move completes at once on its count.
                const dir = o.power < 0 ? -1 : 1;
                outs[p].tachoCount += dir * o.tachoLimit;
                outs[p].rotationCount += dir * o.tachoLimit;
                outs[p].runState = 0;
            } else if (flags & (UPDATE.MODE | UPDATE.SPEED)) outs[p].runState = o.runState;
        },
        inputValues: () => ({raw: 1023, normalized: 1023, scaled: 0}),
        setInputMode: (p, type, mode) => io.modes.push({p, type, mode}),
        resetInputScaled: () => {},
        playTone: (frequency, ms) => io.tones.push({frequency, ms}),
        lsWrite: (p, bytes, rx) => { io.ls.push({p, bytes, rx}); return 0; },
        lsStatus: () => ({status: 0, bytesReady: 1}),
        lsRead: () => ({status: 0, data: [usDistance()]}),
        messageWrite: (q, bytes) => { io.sent.push({q, text: String.fromCharCode(...bytes.filter(b => b))}); return 0; },
        messageRead: (q, remove) => {
            if (!inbox.length) return {status: 0x40};
            const m = inbox[0];
            if (remove) inbox.shift();
            return {status: 0, message: [...m].map(c => c.charCodeAt(0)).concat(0)};
        }
    };
    return io;
};

const run = (name, ms = 3000, io = recorder(), options = {}) => {
    const vm = new NxtVm(options);
    const r = vm.start(fixture(name), {name: `${name}.rxe`});
    assert.deepEqual(r, {ok: true}, `${name} loads`);
    vm.advanceTo(ms, io);
    const events = vm.drainEvents();
    return {vm, io, events, texts: events.filter(e => e.kind === 'display' && e.what === 'text').map(e => e.text)};
};

test('every fixture is an NXT executable the 1.29 firmware accepts: format 0.6, at least one ready clump', () => {
    for (const name of ['motor-timed', 'rotate-motor', 'touch-bumper', 'ultrasonic-stop', 'arithmetic', 'arrays-strings',
        'tasks-mutex', 'subroutines', 'sound-timing', 'mailbox']) {
        const r = parseRxe(fixture(name));
        assert.equal(r.ok, true, `${name}: ${r.detail}`);
        assert.deepEqual(r.program.version, [0, 6], name);
        assert.ok(r.program.clumps.some(c => c.fireCount === 0), name);
    }
});

test('bad files are refused with the firmware\'s statuses: ERR_VER for the format, ERR_FILE for an inconsistent file', () => {
    const good = Uint8Array.from(fixture('motor-timed'));
    const refused = (bytes, status, why) => {
        const r = parseRxe(bytes);
        assert.equal(r.ok, false, why);
        assert.equal(r.status, status, `${why}: ${r.detail}`);
        assert.equal(r.code, VM_STATUS[status]);
        // The VM stops there too: it never runs, and says why.
        const vm = new NxtVm();
        assert.equal(vm.start(bytes).status, status);
        assert.equal(vm.status, 'error');
        assert.equal(vm.error.code, status);
    };
    const patch = (at, ...values) => { const b = good.slice(); values.forEach((v, k) => { b[at + k] = v; }); return b; };
    refused(patch(0, 0x6d), 'ERR_VER', 'no "MindstormsNXT"');
    refused(patch(15, 3), 'ERR_VER', 'format minor 3: older than the oldest compatible 0.4 [V §File]');
    refused(patch(14, 2), 'ERR_VER', 'format major 2: newer than the firmware\'s 1');
    refused(good.slice(0, 20), 'ERR_FILE', 'shorter than the header');
    refused(good.slice(0, good.length - 2), 'ERR_FILE', 'one code word missing: the sections no longer add up');
    refused(patch(16 + 18, 0, 0), 'ERR_FILE', 'zero clumps');
    refused(patch(16 + 18, 255, 0), 'ERR_FILE', '255 clumps: the "no clump" sentinel');
    refused(patch(16 + 20, 0, 0), 'ERR_FILE', 'no code');
    // Every clump waits on another: nothing is ready to run.
    const program = parseRxe(good).program;
    const clumpsAt = good.length - 2 * program.code.length - 4 * program.clumps.length -
        program.clumps.reduce((n, c) => n + c.dependents.length, 0);
    const blocked = good.slice();
    for (let i = 0; i < program.clumps.length; i++) blocked[clumpsAt + 4 * i] = Math.max(1, blocked[clumpsAt + 4 * i]);
    refused(blocked, 'ERR_FILE', 'no clump with fire count 0');
});

test('arithmetic: 8/16/32-bit integers, overflow, division by zero, logic, comparisons', () => {
    const {texts, vm} = run('arithmetic');
    assert.equal(vm.status, 'stopped');
    assert.deepEqual(texts, [
        '12', '22', '-85', // 17 + -5, 17 - -5, 17 * -5
        '-3', '2', // C: 17 / -5 truncates to -3; 17 % -5 is 2 (the dividend's sign)
        '-17', '300000', // -a; a long, 100000 * 3
        '-8', // (17 & 6) | (-5 ^ 3) = 0 | -8
        '4', '4', // byte 250 + 10 wraps to 4; unsigned int 65530 + 10 wraps to 4
        '0', '17', // x / 0 is 0, x % 0 is x on the brick [V §Arithmetic]
        '1', '1', '0', // 17 > -5; false || true; !(true) && true
        '4', // abs(-5) + sign(-5)
        '-32768', // int 32767 + 1
        '1', '-3', // the ternary; long -7 / 2 truncates
        '68', '8' // 17 << 2, 17 >> 1
    ]);
});

test('arrays, nested arrays, structs and strings', () => {
    const {texts} = run('arrays-strings');
    assert.deepEqual(texts, [
        '5', // ArrayInit(arr, 7, 5)
        '49', // arr[2] = 42; 42 + arr[0]
        '8', // ArraySubset 3 + the 5 of arr
        '126', // (7 + 42 + 7) + (7 + 7 + 42 + 7 + 7)
        'NXT-2006', '2006', '8', // StrCat with NumToStr; SubStr(t, 4, 4); StrLen
        '123', // StrToNum("123abc"): the leading number
        'equal', // "NXT" == "NXT": strings compare as wholes
        '78', // StrToByteArray: 'N'
        '25', // grid[1][2] of a 2 × 3 grid of 5s, + 2 rows × 10
        // grid[1][2] = 9 compiles to a REPLACE of grid[1] whose new value is the row ARRAY: the firmware
        // then writes the row's elements (numbers) into grid's elements (arrays), which takes nothing
        // [V §Arrays] — so the cell keeps its 5 on a real brick too.
        '5',
        '12', // p.x * p.y
        '14', // pts[0].y + pts[1].y = 4 + 10
        '107' // a copy is separate storage: copy[0] = 1 leaves arr[0] = 7
    ]);
});

test('functions, subroutines, inline and safecall', () => {
    const {texts, events} = run('subroutines');
    assert.deepEqual(texts, ['144', '42', '6', '5040', '81']);
    // beep() plays 880 Hz for 100 ms, then waits 100 ms: the next number appears ≥ 100 ms after the tone.
    const tone = events.find(e => e.kind === 'tone');
    assert.deepEqual([tone.frequency, tone.duration], [880, 100]);
    const after = events.find(e => e.kind === 'display' && e.text === '42');
    assert.ok(after.t - tone.t >= 100 && after.t - tone.t < 110, `${after.t - tone.t} ms`);
});

test('three tasks: Precedes starts both workers, the mutex keeps 100 read-yield-write updates whole, Follows waits for both', () => {
    const {texts, events, vm} = run('tasks-mutex');
    // 50 × +1 and 50 × +2, each a read, a Yield (Wait 1) and a write inside Acquire/Release: no update is lost.
    assert.deepEqual(texts, ['150']);
    const shown = events.find(e => e.kind === 'display');
    // Each worker's 50 rounds hold a 1 ms Yield; under the mutex they cannot overlap: ≥ 100 ms in all.
    assert.ok(shown.t >= 100, `reported at ${shown.t} ms`);
    assert.equal(vm.status, 'stopped');
});

test('Wait, CurrentTick, FirstTick, tones and Random', () => {
    const {texts, io, events} = run('sound-timing');
    assert.deepEqual(io.tones, [{frequency: 440, ms: 200}, {frequency: 880, ms: 100}]);
    const dt = Number(texts[0]);
    // Wait(250) + Wait(150), plus the few instructions between the ticks.
    assert.ok(dt >= 400 && dt <= 405, `CurrentTick advanced ${dt} ms`);
    assert.deepEqual(texts.slice(1), ['1', '1'], 'FirstTick ≤ the first CurrentTick; 0 ≤ Random(10) < 10');
    const second = events.filter(e => e.kind === 'tone')[1];
    assert.ok(second.t >= 251 && second.t <= 253, `the second tone after Wait(250): ${second.t} ms`);
});

test('motors by time: OnFwd, OnRev, Float, a regulated OnFwdReg and Off reach the output module as updates', () => {
    const {io} = run('motor-timed', 3000);
    const a = io.updates.filter(u => u.p === 0 && u.flags & UPDATE.MODE);
    // The brick's reset before the program and OnFwd fall in the same millisecond: OnFwd's FLAGS write
    // replaces the reset's before the output module runs, so A's first update is OnFwd's (NXC's OnFwd
    // itself resets the tacho and block counts).
    const [fwd, rev, float] = a;
    assert.ok(fwd.flags & UPDATE.RESET_COUNT && fwd.flags & UPDATE.RESET_BLOCK_COUNT);
    assert.deepEqual([fwd.power, fwd.mode & 0x03, fwd.runState], [75, 0x03, 0x20], 'OnFwd: 75, MOTORON|BRAKE, RUNNING');
    assert.deepEqual([rev.power, rev.mode & 0x03], [-50, 0x03], 'OnRev: -50');
    // NBC's Float: MOTORON off, run state IDLE (it leaves the BRAKE bit set; what the hardware does with
    // BRAKE while the motor is off is the brick model's question, docs/NXT-RXE-VM.md "Open").
    assert.deepEqual([float.mode & 0x01, float.runState, float.power], [0, 0, 0], 'Float: off, idle');
    const b = io.updates.filter(u => u.p === 1 && u.flags & UPDATE.MODE);
    const reg = b.find(u => u.power === 40);
    assert.deepEqual([reg.mode & 0x04, reg.regMode], [0x04, 1], 'OnFwdReg B: REGULATED, MOTOR_SPEED');
    const off = io.updates.filter(u => u.flags & UPDATE.MODE).at(-1);
    assert.deepEqual([off.power, off.mode & 0x03], [0, 0x03], 'Off: power 0, MOTORON|BRAKE');
});

test('RotateMotor: a tacho-limited move, polled on its run state, then the counts', () => {
    const {texts, io, vm} = run('rotate-motor', 5000);
    assert.equal(vm.status, 'stopped', JSON.stringify(vm.error));
    const limited = io.updates.filter(u => u.p === 0 && u.flags & UPDATE.TACHO_LIMIT && u.tachoLimit > 0);
    assert.deepEqual(limited.map(u => [u.tachoLimit, u.power]), [[360, 75], [180, -50]],
        'RotateMotor(A, 75, 360), then RotateMotor(A, 50, -180) runs backwards');
    // Tacho count after the first move: 360; rotation count 360, then 360 − 180; the run state idle.
    assert.deepEqual(texts, ['360', '360', '180', '0']);
});

test('the ultrasonic sensor through the low-speed system calls: write [0x02, 0x42], read one byte', () => {
    let distance = 100;
    const io = recorder({usDistance: () => {
        distance -= 5;
        return distance;
    }});
    const {texts, vm} = run('ultrasonic-stop', 2000, io);
    assert.equal(vm.status, 'stopped');
    assert.ok(io.modes.some(m => m.p === 3 && m.type === 0x0b), 'port 4: LOWSPEED_9V');
    assert.deepEqual(io.ls[0], {p: 3, bytes: [0x02, 0x42], rx: 1}, 'address 0x02, register 0x42, one byte back');
    // It stops at the first reading ≤ 20 (20), then reads once more (15).
    assert.deepEqual(texts, ['15']);
    const last = io.updates.filter(u => u.flags & UPDATE.MODE).at(-1);
    assert.equal(last.power, 0, 'Off');
});

test('mailboxes: the program reads inbox 1 (queue 0) and answers on the response queue (10)', () => {
    const io = recorder({inbox: ['hello']});
    const {texts, vm} = run('mailbox', 500, io);
    assert.deepEqual(io.sent, [{q: 10, text: 'echo:hello'}]);
    assert.deepEqual(texts, ['ready', 'hello']);
    assert.equal(vm.status, 'running', 'it keeps running until stopped');
    assert.equal(vm.abort(), true);
    assert.equal(vm.status, 'stopped');
    assert.equal(vm.s.ending, 'abort');
});

test('the instruction budget: a busy program gets instrPerMs instructions each millisecond', () => {
    const slow = run('arithmetic', 1000, recorder(), {instrPerMs: 5});
    const fast = run('arithmetic', 1000, recorder(), {instrPerMs: 50});
    const end = r => r.events.find(e => e.kind === 'program-end').t;
    assert.deepEqual(slow.texts, fast.texts, 'the same results');
    assert.ok(end(slow) > 5 * end(fast), `5/ms ends at ${end(slow)} ms, 50/ms at ${end(fast)} ms`);
    // Instructions ≈ budget × busy milliseconds.
    assert.ok(slow.vm.s.instructions <= 5 * end(slow));
});

test('snapshot / restore mid-program gives the same continuation (the physics worker\'s mirror)', () => {
    const a = new NxtVm();
    const ioA = recorder();
    a.start(fixture('tasks-mutex'));
    a.advanceTo(37, ioA);
    const snap = a.snapshot();
    assert.equal(snap.format, SNAPSHOT_FORMAT);
    const b = new NxtVm();
    b.restore(JSON.parse(JSON.stringify(snap)), fixture('tasks-mutex'));
    const ioB = recorder();
    a.drainEvents();
    b.drainEvents();
    a.advanceTo(500, ioA);
    b.advanceTo(500, ioB);
    assert.deepEqual(b.drainEvents(), a.drainEvents());
    assert.deepEqual(b.s, a.s);
    assert.throws(() => new NxtVm().restore(snap), /give its bytes/, 'another program needs its bytes');
});

test('what the VM does not implement stops the program with a named error, never a guess', () => {
    // FLATTEN (0x1D) in place of the first NUMTOSTRING of `arithmetic`: same size family (6 bytes).
    const bytes = Uint8Array.from(fixture('arithmetic'));
    const program = parseRxe(bytes).program;
    const codeAt = bytes.length - 2 * program.code.length;
    const pc = program.code.findIndex(w => (w & 0xff) === OP.NUMTOSTRING && !(w & 0x0800));
    bytes[codeAt + 2 * pc] = OP.FLATTEN;
    const vm = new NxtVm();
    vm.start(bytes);
    vm.advanceTo(100, recorder());
    assert.equal(vm.status, 'error');
    assert.equal(vm.error.code, 'UNIMPLEMENTED_OPCODE');
    assert.equal(vm.error.opcode, 'FLATTEN');
    assert.equal(vm.error.pc, pc);
    // A system call not implemented: FileOpenRead (0) in place of DrawText (13), its argument cluster unchanged.
    const calls = Uint8Array.from(fixture('arithmetic'));
    const sys = program.code.findIndex(w => (w & 0xff) === OP.SYSCALL && !(w & 0x0800));
    assert.equal(program.code[sys + 1], 13, 'DrawText');
    calls[codeAt + 2 * (sys + 1)] = 0;
    const vm2 = new NxtVm();
    vm2.start(calls);
    vm2.advanceTo(100, recorder());
    assert.equal(vm2.error.code, 'UNIMPLEMENTED_SYSCALL');
    assert.match(vm2.error.message, /FileOpenRead/);
    // A shift (LSL) is an opcode the 1.29 firmware itself does not execute: its ERR_INSTR.
    const shift = Uint8Array.from(fixture('arithmetic'));
    shift[codeAt + 2 * pc] = OP.LSL;
    const vm3 = new NxtVm();
    vm3.start(shift);
    vm3.advanceTo(100, recorder());
    assert.equal(vm3.error.code, 'ERR_INSTR');
    assert.equal(vm3.error.status, -2);
    // The syscall table: 48 calls; those implemented are named in docs/NXT-RXE-VM.md.
    assert.equal(SYSCALL_NAMES.length, 48);
    assert.deepEqual(IMPLEMENTED_SYSCALLS, [9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 31]);
});
