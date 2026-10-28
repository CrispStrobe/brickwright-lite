// The Robot Lab RCX VM (slice R5): NQC programs compiled by the in-repo
// nqc-wasm, run in the clean-room bytecode VM, observed only at its ports.
//
// HOW PROGRAMS GET HERE. Every program below is NQC source compiled at test
// time by overlay/scratch-gui/src/lib/nqc-wasm (the same WASM build the
// editor ships; test/nqc-wasm.test.mjs proves it byte-identical to native
// NQC 3.2 r1). No bytecode is hand-written. The single exception is (g),
// which overwrites ONE opcode byte of a compiled image to manufacture an
// opcode that does not exist — the point there is the error path, not the
// meaning of any instruction.
//
// HOW EXPECTATIONS ARE DERIVED. From NQC/firmware semantics, stated in a
// comment beside each assertion — never by running the VM and copying what it
// printed. NQC facts used: Wait(n) and PlayTone durations are in 10 ms ticks;
// Timer(n) counts 100 ms, FastTimer(n) 10 ms (RCX2); ints are 16-bit signed
// with C operators; SENSOR_TOUCH is boolean mode, 1 when pressed; a pressed
// touch sensor shorts the input, so its raw reading is LOW (an open input
// reads high); SENSOR_ROTATION counts 16 per turn and ClearSensor zeroes it;
// OnFwd = forward + on, Off = brake, Float = coast; a program's outputs start
// at full power (7) forward, which NQC's start-up code sets explicitly.
//
// TIMING TOLERANCE. The VM charges every bytecode a fixed interpretation time
// (250 µs by default, rcx-vm.js header), so an output changes a fraction of
// a millisecond after the time the NQC semantics name. Tolerances below are
// "a few instructions plus the sampling step", never wider.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    loadToolchain, compileWithToolchain
} from '../overlay/scratch-gui/src/lib/nqc-wasm/compiler.js';
import {
    RcxVm, createRcxVm, SNAPSHOT_FORMAT
} from '../overlay/scratch-gui/src/lib/bw-sim/routes/rcx-vm/rcx-vm.js';
import {OPCODES} from '../overlay/scratch-gui/src/lib/bw-sim/routes/rcx-vm/rcx-bytecode.js';
import {loadRcxProgram} from '../overlay/scratch-gui/src/lib/bw-sim/routes/rcx-vm/rcx-program.js';
import {parseRcxImage} from '../overlay/scratch-gui/src/lib/rcx/rcx-protocol.js';

const toolchain = await loadToolchain();

async function compile (source, target = 'RCX2') {
    const out = await compileWithToolchain(source, target, toolchain);
    assert.equal(out.ok, true, out.log);
    return out.bytes;
}

/** Raw ADC readings of a touch sensor (passive switch to ground). */
const TOUCH_RELEASED = 1023;   // open circuit: reads at the top of the range
const TOUCH_PRESSED = 30;      // closed: near zero

/**
 * Run `vm` for `ms` in steps of `stepMs`, calling `inputsAt(t)` before each
 * step (t = the step's start, ms) and returning one record per step.
 */
function drive (vm, ms, stepMs, inputsAt = () => undefined) {
    const trace = [];
    for (let t = 0; t < ms; t += stepMs) {
        const outputs = vm.advance(stepMs, {inputs: inputsAt(vm.nowMs)});
        trace.push({t: vm.nowMs, outputs});
    }
    return trace;
}

/** Collapse a trace of one output into [{from, to, key}] runs of equal state. */
function runsOf (trace, port, keyOf = o => `${o.mode}/${o.direction}`) {
    const runs = [];
    for (const {t, outputs} of trace) {
        const key = keyOf(outputs[port]);
        const last = runs[runs.length - 1];
        if (last && last.key === key) last.to = t;
        else runs.push({from: t, to: t, key});
    }
    return runs;
}

// ---------------------------------------------------------------- loading

test('an nqc-wasm image loads: tasks and subroutines by number, symbols, target', async () => {
    const bytes = await compile('int x; task main() { start other; helper(); } ' +
        'task other() { x = 1; } sub helper() { x = 2; }');
    const out = loadRcxProgram(bytes);
    assert.equal(out.ok, true, out.detail);
    const {program} = out;
    assert.equal(program.target, 3, 'RCX2, the target nqc-wasm was asked for');
    assert.ok(program.tasks[0] && program.tasks[1], 'main is task 0, other task 1');
    assert.equal(program.tasks.filter(Boolean).length, 2);
    assert.ok(program.subroutines[0], 'helper is subroutine 0');
    assert.ok(program.symbols.some(s => s.kind === 'variable' && s.name === 'x'));
});

test('images for firmwares the VM does not model are refused, not misrun', async () => {
    const scout = await compileWithToolchain('task main() { }', 'Scout', toolchain);
    assert.equal(loadRcxProgram(scout.bytes).error, 'UNSUPPORTED_TARGET');
    assert.equal(loadRcxProgram(new Uint8Array([1, 2, 3])).ok, false);
    const vm = new RcxVm();
    assert.equal(vm.load(new Uint8Array(16)).error, 'BAD_MAGIC');
    assert.equal(vm.status, 'idle');
});

// ---------------------------------------------------------------- (a)

test('(a) OnFwd(OUT_A); Wait(100); Off(OUT_A): forward for 1 s, then brake', async () => {
    const vm = createRcxVm(await compile('task main() { OnFwd(OUT_A); Wait(100); Off(OUT_A); }'));
    const trace = drive(vm, 1500, 1);
    const runs = runsOf(trace, 0, o => `${o.mode}/${o.direction}/${o.power}`);
    // Before any instruction output A is floating; OnFwd turns it on forward at
    // the power NQC's start-up code set (7). Wait(100) = 100 × 10 ms = 1000 ms,
    // then Off = brake ('off'), which persists: the program has ended.
    assert.deepEqual(runs.map(r => r.key), ['on/1/7', 'off/1/7']);
    const onAt = runs[0].from;
    const offAt = runs[1].from;
    assert.ok(onAt <= 1, `on within the first millisecond (at ${onAt})`);
    assert.ok(Math.abs((offAt - onAt) - 1000) <= 2, `on for ${offAt - onAt} ms, expected 1000`);
    // B and C were never switched on: float throughout.
    for (const {outputs} of trace) {
        assert.equal(outputs[1].mode, 'float');
        assert.equal(outputs[2].mode, 'float');
    }
    assert.equal(vm.status, 'stopped', 'main fell off its end; no task runs');
});

// ---------------------------------------------------------------- (b)

test('(b) two tasks toggle two outputs concurrently, each at its own period', async () => {
    const vm = createRcxVm(await compile(`
        task main() {
            start blinker;
            while (true) { OnFwd(OUT_A); Wait(20); Off(OUT_A); Wait(20); }
        }
        task blinker() {
            while (true) { OnRev(OUT_C); Wait(50); Float(OUT_C); Wait(50); }
        }`));
    const trace = drive(vm, 3000, 1);
    // A: on-forward 200 ms, brake 200 ms (Wait(20) = 200 ms each).
    const a = runsOf(trace, 0);
    // C: on-reverse 500 ms, float 500 ms (Wait(50)).
    const c = runsOf(trace, 2);
    const whole = runs => runs.slice(1, -1); // first/last are cut by the window
    for (const r of whole(a)) {
        assert.ok(['on/1', 'off/1'].includes(r.key), r.key);
        assert.ok(Math.abs((r.to - r.from + 1) - 200) <= 3, `A ${r.key} lasted ${r.to - r.from + 1} ms`);
    }
    for (const r of whole(c)) {
        assert.ok(['on/-1', 'float/-1'].includes(r.key), r.key);
        assert.ok(Math.abs((r.to - r.from + 1) - 500) <= 3, `C ${r.key} lasted ${r.to - r.from + 1} ms`);
    }
    // 3 s / 200 ms = 15 phases of A; 3 s / 500 ms = 6 of C — in the SAME 3 s,
    // so neither task starved the other.
    assert.ok(a.length >= 14 && a.length <= 16, `A had ${a.length} phases`);
    assert.ok(c.length >= 6 && c.length <= 7, `C had ${c.length} phases`);
    assert.deepEqual(vm.runningTasks, [0, 1]);
});

// ---------------------------------------------------------------- (c)

test('(c) a loop on a touch sensor switches motor direction as the raw input changes', async () => {
    const vm = createRcxVm(await compile(`
        task main() {
            SetSensor(SENSOR_1, SENSOR_TOUCH);
            while (true) {
                if (SENSOR_1 == 1) OnRev(OUT_A); else OnFwd(OUT_A);
            }
        }`));
    // Released until 500 ms, pressed until 1000 ms, then a raw 500 — inside
    // the boolean dead band (true below 460, false above 562), so the sensor
    // keeps reading pressed — and released again from 1500 ms.
    const raw = t => (t < 500 ? TOUCH_RELEASED : t < 1000 ? TOUCH_PRESSED : t < 1500 ? 500 : TOUCH_RELEASED);
    const trace = drive(vm, 2000, 5, t => [raw(t)]);
    const at = ms => trace.find(r => r.t >= ms).outputs[0];
    assert.equal(at(100).direction, 1, 'released: forward');
    assert.equal(at(495).direction, 1);
    assert.equal(at(510).direction, -1, 'pressed: reverse within one 5 ms step');
    assert.equal(at(1400).direction, -1, 'dead band: still pressed');
    assert.equal(at(1510).direction, 1, 'released again: forward');
    assert.ok(trace.slice(1).every(r => r.outputs[0].mode === 'on'));
    assert.equal(vm.inputConfig()[0].active, false, 'a touch sensor is passive');
});

// ---------------------------------------------------------------- (d)

test('(d) ClearSensor + until (SENSOR_1 >= 16) stops on rotation counts', async () => {
    const vm = createRcxVm(await compile(`
        task main() {
            SetSensor(SENSOR_1, SENSOR_ROTATION);
            ClearSensor(SENSOR_1);
            OnFwd(OUT_A);
            until (SENSOR_1 >= 16);
            Off(OUT_A);
        }`));
    // A closed loop: the "plant" turns the sensor 1 count per 10 ms while A
    // drives forward. It starts at 100 counts — the axle had turned before —
    // so without ClearSensor the loop would exit at once.
    let counts = 100;
    let onMs = 0;
    let offAt = null;
    for (let t = 0; t < 1000; t += 5) {
        const [a] = vm.advance(5, {inputs: [{raw: 512, rotation: Math.floor(counts)}]});
        if (a.mode === 'on' && a.direction === 1) {
            onMs += 5;
            counts += 0.5;
        } else if (a.mode === 'off' && offAt === null) {
            offAt = vm.nowMs;
        }
    }
    // 16 counts at 1 count / 10 ms = 160 ms of drive, then brake; the plant's
    // count lags the VM by one 5 ms step, so allow one count period.
    assert.ok(offAt !== null, 'the motor was braked');
    assert.ok(onMs >= 160 && onMs <= 170, `drove for ${onMs} ms`);
    assert.equal(vm.sensorValue(0), 16, 'stopped at exactly the 16th count after clearing');
    assert.equal(vm.status, 'stopped');
    assert.equal(vm.inputConfig()[0].active, true, 'the rotation sensor is powered');
});

// ---------------------------------------------------------------- (e)

test('(e) timers and 16-bit variable arithmetic', async () => {
    const vm = createRcxVm(await compile(`
        int a, b, c, d, e, f, g, h, i, j, k, m;
        task main() {
            ClearTimer(0);
            k = 4;
            if (k <= 3) m += 1;
            if (k >= 4) m += 10;
            if (k == 4) m += 100;
            if (k != 4) m += 1000;
            if (k > 4) m += 10000;
            if (k < 5) m += 2;
            if (k > 3) m += 20000;
            a = 7;
            b = a * 6;
            c = b / 4;
            d = c - 15;
            e = abs(d);
            f = b % 5;
            g = d / 2;
            h = 32767; h += 1;
            i = 12; i &= 10; j = 12; j |= 3;
            Wait(250);
            a = Timer(0);
            b = FastTimer(0);
            ClearTimer(1);
            while (Timer(1) < 5);
            c = FastTimer(1);
        }`));
    drive(vm, 4000, 5);
    assert.equal(vm.status, 'stopped');
    const v = name => vm.getVariable(name);
    // Every comparison at its boundary (k = 4): true for >= 4, == 4, < 5,
    // > 3; false for <= 3, != 4, > 4. Globals start at 0.
    assert.equal(v('m'), 10 + 100 + 2 + 20000);
    assert.equal(v('d'), -5, '42 / 4 = 10 (integer division), 10 - 15');
    assert.equal(v('e'), 5, 'abs(-5)');
    assert.equal(v('f'), 2, '42 % 5');
    assert.equal(v('g'), -2, '-5 / 2 truncates toward zero (C semantics)');
    assert.equal(v('h'), -32768, '32767 + 1 wraps in a 16-bit int');
    assert.equal(v('i'), 8, '12 & 10');
    assert.equal(v('j'), 15, '12 | 3');
    // Wait(250) = 2.5 s after ClearTimer(0), plus a few instructions:
    assert.equal(v('a'), 25, 'Timer counts 100 ms ticks');
    assert.equal(v('b'), 250, 'FastTimer counts 10 ms ticks');
    // The loop leaves as soon as Timer(1) reaches 5 = 500 ms; the next
    // instruction reads FastTimer within a millisecond of that.
    assert.equal(v('c'), 50);
});

test('subroutines, repeat and sound events, on RCX2 and on RCX 1 bytecode', async () => {
    const source = `
        int calls;
        task main() { repeat (3) { bump(); PlaySound(SOUND_UP); } PlayTone(440, 50); }
        sub bump() { calls += 1; }`;
    // RCX2 compiles repeat to a task-local counter (decvjn); RCX 1 to the
    // firmware's loop-counter stack (loops/loopc). Both mean three passes.
    for (const target of ['RCX2', 'RCX']) {
        const vm = createRcxVm(await compile(source, target));
        drive(vm, 100, 5);
        assert.equal(vm.status, 'stopped', `${target}: ${JSON.stringify(vm.error)}`);
        assert.equal(vm.getVariable('calls'), 3, `${target}: bump() ran once per pass`);
        const events = vm.drainEvents();
        assert.equal(events.filter(e => e.kind === 'sound').length, 3);
        const tones = events.filter(e => e.kind === 'tone');
        // PlayTone(440, 50): 440 Hz for 50 × 10 ms.
        assert.deepEqual(tones.map(e => [e.frequency, e.durationMs]), [[440, 500]]);
        assert.deepEqual(vm.drainEvents(), [], 'drained');
    }
});

// ---------------------------------------------------------------- (f)

const SNAPSHOT_PROGRAM = `
    int n;
    task main() {
        SetSensor(SENSOR_1, SENSOR_TOUCH);
        start noise;
        while (true) { if (SENSOR_1 == 1) OnRev(OUT_A); else OnFwd(OUT_A); n += 1; }
    }
    task noise() {
        while (true) { SetPower(OUT_C, Random(7)); OnFwd(OUT_C); Wait(Random(30)); PlaySound(SOUND_CLICK); }
    }`;
const touchSchedule = t => [Math.floor(t / 130) % 2 ? TOUCH_PRESSED : TOUCH_RELEASED];

test('(f) restore + advance is bit-identical to continuing', async () => {
    const vm = createRcxVm(await compile(SNAPSHOT_PROGRAM), {seed: 1234});
    drive(vm, 777, 5, touchSchedule);
    const snap = vm.snapshot();
    assert.equal(snap.format, SNAPSHOT_FORMAT);
    // The worker posts snapshots between threads: they must survive that.
    const posted = structuredClone(snap);

    const run = () => {
        const trace = drive(vm, 1500, 5, touchSchedule);
        return {trace, events: vm.drainEvents(), end: JSON.stringify(vm.snapshot())};
    };
    const continued = run();
    vm.restore(posted);
    const replayed = run();
    assert.deepEqual(replayed.trace, continued.trace);
    assert.deepEqual(replayed.events, continued.events);
    assert.equal(replayed.end, continued.end);
    // Not vacuous: the stretch exercised both tasks, the sensor and Random.
    assert.ok(continued.events.filter(e => e.kind === 'sound').length > 10);
    assert.ok(new Set(continued.trace.map(r => r.outputs[0].direction)).size === 2);
    assert.ok(new Set(continued.trace.map(r => r.outputs[2].power)).size > 2);
});

test('(f) how advance() is chunked does not change what runs', async () => {
    const bytes = await compile(SNAPSHOT_PROGRAM);
    const coarse = createRcxVm(bytes, {seed: 7});
    const fine = createRcxVm(bytes, {seed: 7});
    const inputs = {inputs: [TOUCH_PRESSED]};
    coarse.advance(1000, inputs);
    for (let i = 0; i < 1000; i++) fine.advance(1, inputs);
    assert.equal(JSON.stringify(fine.snapshot()), JSON.stringify(coarse.snapshot()));
});

test('(f) a snapshot is refused by a VM holding a different program', async () => {
    const one = createRcxVm(await compile('task main() { OnFwd(OUT_A); }'));
    const two = createRcxVm(await compile('task main() { OnFwd(OUT_B); }'));
    assert.throws(() => two.restore(one.snapshot()), /snapshot is of program/);
    assert.throws(() => two.restore({format: 'nope'}), /not an rcx-vm\/1 snapshot/);
});

// ---------------------------------------------------------------- (g)

test('(g) an unknown opcode halts the VM in a named error state', async () => {
    const bytes = await compile('task main() { OnFwd(OUT_A); Wait(10); Off(OUT_A); }');
    // Find `out A, Off` (0x21 0x41) in main's chunk and replace its opcode with
    // a byte that is no RCX opcode. Located by parsing, not by a fixed offset.
    const image = parseRcxImage(bytes);
    const main = image.chunks.find(c => c.kind === 'task' && c.number === 0);
    let pc = -1;
    for (let i = 0; i + 1 < main.data.length; i++) {
        if (main.data[i] === 0x21 && main.data[i + 1] === 0x41) pc = i;
    }
    assert.ok(pc > 0, 'the compiled program contains Off(OUT_A)');
    const BOGUS = 0xff;
    assert.equal(OPCODES.has(BOGUS), false, 'premise: 0xff is not an opcode');
    const patched = bytes.slice();
    patched[main.offset + pc] = BOGUS;

    const vm = createRcxVm(patched);
    assert.equal(vm.advance(50)[0].mode, 'on', 'runs normally up to the bad byte');
    vm.advance(100);
    assert.equal(vm.status, 'error');
    assert.equal(vm.error.code, 'UNKNOWN_OPCODE');
    assert.equal(vm.error.opcode, BOGUS);
    assert.equal(vm.error.pc, pc);
    assert.equal(vm.error.task, 0);
    assert.match(vm.error.message, /0xff/);
    assert.equal(vm.outputs[0].mode, 'float', 'a halted program leaves no motor driving');
    assert.ok(vm.drainEvents().some(e => e.kind === 'error' && e.code === 'UNKNOWN_OPCODE'));
    const frozen = JSON.stringify(vm.snapshot().state.tasks);
    vm.advance(1000);
    assert.equal(JSON.stringify(vm.snapshot().state.tasks), frozen, 'nothing runs after the error');
});

test('(g) a known RCX2 opcode the VM does not implement is refused by name', async () => {
    const vm = createRcxVm(await compile(
        'task main() { SetEvent(1, SENSOR_1, EVENT_TYPE_PRESSED); OnFwd(OUT_A); }'));
    vm.advance(10);
    assert.equal(vm.status, 'error');
    assert.equal(vm.error.code, 'UNSUPPORTED_OPCODE');
    assert.match(vm.error.message, /SetEvent \(sete, 0x93\)/);
    assert.equal(vm.outputs[0].mode, 'float', 'OnFwd after it never ran');
});
