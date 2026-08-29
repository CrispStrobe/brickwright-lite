/**
 * D29 and D25, proven against the REAL vendored WASM rather than a stub.
 *
 * This file exists because both defects were recorded from source reading and
 * both records were wrong. D29 said the pinned emu8051 build "does not export
 * `_emu_dbg_set_bp_write`" — it did, all along; the claim came from a comment
 * in the module rather than from instantiating the binary, and a lesson hint
 * was written around it. D25 said a cycle step was a capability the 6502 debug
 * target needed — the 6502 core executes whole instructions and cannot.
 *
 * So every assertion here loads `overlay/scratch-gui/src/lib/emu8051/emu8051.js`
 * — the actual vendored artifact this app ships — and asks it.
 *
 * Skips loudly if the vendored WASM is missing, because a silent skip in a
 * file whose whole purpose is "stop trusting the comment" would be the same
 * mistake again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WASM_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js');
const DEBUG_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/emu8051-debug.js');

const have = existsSync(WASM_JS) && existsSync(DEBUG_JS);
if (!have) console.log('# SKIP: the vendored emu8051 WASM is not present');

/** MOV 30h,#00 ; MOV 30h,#42 ; SJMP $ — one watched byte, one real change. */
const WATCH_HEX = ':0800000075300075304280FEEE\n:00000001FF\n';
/** MOV DPTR,#1234h ; NOP ; NOP — a 2-cycle instruction then 1-cycle ones. */
const CYCLE_HEX = ':05000000901234000025\n:00000001FF\n';

async function targetWith (hex) {
    const {default: createEmu8051} = await import(WASM_JS);
    const {createEmu8051DebugTarget} = await import(DEBUG_JS);
    const wasm = await createEmu8051();
    wasm._emu_init(1);
    wasm._emu_set_fosc(11059200);
    wasm._emu_set_vcc(5.0);
    const t = createEmu8051DebugTarget(wasm);
    wasm.ccall('emu_load_hex', 'number', ['string', 'number'], [hex, hex.length]);
    t.reset();
    return {t, wasm};
}

/** Drive a step or a run to completion the way an animation frame would. */
function settle (t) {
    for (let i = 0; i < 4096 && t.state() === 'running'; i++) t.runFor(1000);
}

// ── D29 ──────────────────────────────────────────────────────────────────

test('the VENDORED build exports the watchpoint API — the thing D29 said it did not', async () => {
    if (!have) return;
    const {wasm} = await targetWith(WATCH_HEX);
    assert.equal(typeof wasm._emu_dbg_set_bp_write, 'function',
        'D29 recorded this export as absent from the pinned build. It was present.');
    // And the halt reason, which is what was ACTUALLY missing.
    for (const fn of ['_emu_dbg_halt_is_watch', '_emu_dbg_halt_watch_addr',
        '_emu_dbg_halt_watch_value', '_emu_dbg_halt_watch_prev', '_emu_dbg_halt_bp']) {
        assert.equal(typeof wasm[fn], 'function', `${fn} must be exported for the UI to report a hit`);
    }
});

test('a write to a watched address halts, and the halt names the address and the value', async () => {
    if (!have) return;
    const {t} = await targetWith(WATCH_HEX);
    assert.ok(t.capabilities().breakpoints.includes('write'),
        'the vendored build offers write breakpoints');

    const seen = [];
    t.onHalt(why => seen.push(why));
    const handle = t.setBreakpoint({kind: 'write', space: 'iram', addr: 0x30});
    assert.equal(typeof handle, 'number', `watchpoint refused: ${JSON.stringify(handle)}`);

    t.run();
    settle(t);

    assert.equal(t.state(), 'halted', 'the write stopped the program');
    const why = seen.at(-1);
    assert.equal(why.cause, 'watchpoint', 'its own cause, so a UI need not inspect the bp table');
    assert.equal(why.bp, handle, 'the breakpoint is named, not matched by PC');
    assert.equal(why.space, 'iram');
    assert.equal(why.addr, 0x30);
    assert.equal(why.value, 0x42);
    assert.equal(why.prev, 0x00, 'the transition, which is the evidence');
});

test('a same-value store does NOT halt — the honest limit, pinned as behaviour', async () => {
    if (!have) return;
    // MOV 30h,#00 ; MOV 30h,#00 ; SJMP $ onto a byte already 0.
    const SAME = ':0800000075300075300080FE30\n:00000001FF\n';
    const {t} = await targetWith(SAME);
    t.setBreakpoint({kind: 'write', space: 'iram', addr: 0x30});
    t.run();
    for (let i = 0; i < 200 && t.state() === 'running'; i++) t.runFor(1000);
    assert.equal(t.state(), 'running',
        'this is a CHANGE detector, not a store detector. If it ever starts firing here, ' +
        'the UI wording and the lesson hint both need re-reading.');
});

test('a halt that is not a watchpoint carries no address to misread', async () => {
    if (!have) return;
    const {t} = await targetWith(CYCLE_HEX);
    const seen = [];
    t.onHalt(why => seen.push(why));
    t.step('insn', 1);
    settle(t);
    const why = seen.at(-1);
    assert.equal(why.cause, 'step');
    assert.equal(why.addr, undefined);
    assert.equal(why.value, undefined);
});

// ── D25 ──────────────────────────────────────────────────────────────────

test('the vendored build offers a cycle step, and it is strictly finer than an instruction', async () => {
    if (!have) return;
    const {t} = await targetWith(CYCLE_HEX);
    assert.ok(t.capabilities().steps.includes('cycle'),
        'the vendored emu8051 declares a cycle step');
    assert.ok(!t.capabilities().steps.includes('line'),
        'and still withholds `line`, which it would silently turn into an instruction');

    const count = async kind => {
        const {t: u} = await targetWith(CYCLE_HEX);
        let n = 0;
        while (u.regs().pc < 4 && n < 20) {
            assert.equal(u.step(kind, 1), undefined, `${kind} was refused`);
            settle(u);
            n++;
        }
        return n;
    };

    const cycles = await count('cycle');
    const insns = await count('insn');
    // The CONTRAST is the gate. Equal counts would mean the cycle step is an
    // instruction step with a different label on the button.
    assert.equal(insns, 2, 'two instruction steps reach PC 4');
    assert.equal(cycles, 3, 'three cycle steps reach PC 4 (MOV DPTR costs two clocks)');
    assert.ok(cycles > insns);
});

test('the engines that cannot step a cycle refuse by name, and say why', async () => {
    // The honest-refusal half of D25. These four cores execute a whole
    // instruction per call, so a cycle button on them would be the D5 lie.
    const {M6502Machine, EATER6502} = await import(
        path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/m6502-machine.js'));
    const {createM6502DebugTarget} = await import(
        path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/m6502-debug.js'));

    const m = new M6502Machine(EATER6502, {});
    m.loadRom([0xa9, 0x01, 0xdb]);
    m.mem[0xfffc] = 0x00; m.mem[0xfffd] = 0x80;
    m.reset();
    const t = createM6502DebugTarget({machine: m, timeNs: () => 0n});

    assert.ok(!t.capabilities().steps.includes('cycle'),
        'the 6502 must not advertise a cycle step it cannot take');
    const refusal = t.step('cycle');
    assert.match(refusal.unsupported, /no cycle step/i);
    assert.match(refusal.unsupported, /instruction step with a different label/i,
        'the refusal explains rather than just declining');
    assert.equal(typeof t.regs().cycles, 'number',
        'and points at the number it CAN report: what the instruction cost');
});

test('the cycle counter the drawer SHOWS advances by exactly one per cycle step', async () => {
    if (!have) return;
    // The drawer derives cycles from program time — `Math.round(tNs/1e9 * hz)`
    // — and says so rather than presenting a derived number as a counted one.
    // emu8051 exports no hardware cycle counter, so that derivation is the only
    // honest source. This test exists because a derived number is exactly the
    // kind that can drift: at 11.0592 MHz one clock is 90.42 ns, and if the
    // emulator's time were rounded per step the display could move by 0 or 2.
    // Measured: it moves by 1, every time, because the emulator accumulates
    // whole nanoseconds (90, 90, 91, …) and the rounding recovers the cycle.
    const {t} = await targetWith(CYCLE_HEX);
    const hz = 11059200;
    const shown = () => Math.round((Number(t.timeNs()) / 1e9) * hz);

    let prev = shown();
    const deltas = [];
    for (let i = 0; i < 8; i++) {
        t.step('cycle', 1);
        settle(t);
        const now = shown();
        deltas.push(now - prev);
        prev = now;
    }
    assert.deepEqual(deltas, [1, 1, 1, 1, 1, 1, 1, 1],
        'every cycle step must move the displayed cycle count by exactly one');
});
