/** Recorded-event evidence from the real vendored emu8051 WASM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WASM_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js');
const DEBUG_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/emu8051-debug.js');
const have = existsSync(WASM_JS) && existsSync(DEBUG_JS);
if (!have) console.log('# SKIP: the vendored emu8051 WASM is not present');

const CLOCK_HZ = 11059200;
const CYCLE_HEX = ':05000000901234000025\n:00000001FF\n';
const WATCH_HEX = ':0800000075300075304280FEEE\n:00000001FF\n';
/** MOV P1,#FEh ; MOV P1,#FFh ; SJMP $ */
const PIN_HEX = ':080000007590FE7590FF80FE73\n:00000001FF\n';
/** MOV P1,#FEh ; MOV P1,#FFh ; SJMP back to the first MOV */
const PIN_LOOP_HEX = ':080000007590FE7590FF80F879\n:00000001FF\n';

async function fixture(hex) {
    return (await fixtureWithWasm(hex)).target;
}

async function fixtureWithWasm(hex) {
    const {default: createEmu8051} = await import(WASM_JS);
    const {createEmu8051DebugTarget} = await import(DEBUG_JS);
    const wasm = await createEmu8051();
    wasm._emu_init(1);
    wasm._emu_set_fosc(CLOCK_HZ);
    wasm._emu_set_vcc(5.0);
    const target = createEmu8051DebugTarget(wasm, {clockHz: CLOCK_HZ});
    wasm.ccall('emu_load_hex', 'number', ['string', 'number'], [hex, hex.length]);
    target.reset();
    return {target, wasm};
}

function settle(target) {
    for (let i = 0; i < 4096 && target.state() === 'running'; i++) target.runFor(1000);
    assert.equal(target.state(), 'halted', 'requested step/watchpoint did not settle');
}

function withoutExports(wasm, names) {
    const hidden = new Set(names);
    return new Proxy(wasm, {
        get: (target, key) => hidden.has(key) ? undefined : target[key],
        has: (target, key) => !hidden.has(key) && key in target
    });
}

test('8051 advertises only the event evidence its native exports provide', async () => {
    if (!have) return;
    const target = await fixture(CYCLE_HEX);
    const caps = target.capabilities();
    assert.ok(caps.events.includes('instruction'));
    assert.equal(caps.events.includes('bus'), caps.steps.includes('cycle'));
    assert.equal(caps.events.includes('memory'), caps.breakpoints.includes('write'));
    assert.equal(caps.extensions.busSignals, false,
        'an oscillator boundary must not be promoted to an address/data/control trace');
    assert.equal(caps.extensions.memoryEvidence,
        caps.breakpoints.includes('write') ? 'change-watchpoint-only' : 'none');
    assert.ok(caps.events.includes('signal'));
    assert.equal(caps.extensions.signalEvidence, 'native-pin-history');
    assert.equal(caps.extensions.pinHistoryCapacity, 4096);
});

test('native pin history emits retained sub-instruction edges with native timestamps', async () => {
    if (!have) return;
    const target = await fixture(PIN_HEX);
    const events = [];
    target.onDebugEvent(event => events.push(event));
    target.step('insn', 1);
    settle(target);

    const pins = events.filter(event => event.kind === 'signal' && event.phase === 'pin-change');
    assert.deepEqual(pins.map(event => event.signal), [
        {name: 'P1.0', value: false, mode: 'quasi'}
    ]);
    assert.equal(pins[0].fidelity, 'recorded');
    assert.equal(pins[0].time.domain, '8051-simulation-ns-reset-1');
    assert.ok(pins[0].time.ticks <= target.timeNs());
    assert.ok(events.indexOf(pins[0]) < events.findIndex(event => event.phase === 'retire'),
        'the pin edge happened within the instruction and precedes its retire event');
});

test('a partial pin-history ABI advertises no signal events', async () => {
    if (!have) return;
    const {default: createEmu8051} = await import(WASM_JS);
    const {createEmu8051DebugTarget} = await import(DEBUG_JS);
    const wasm = await createEmu8051();
    wasm._emu_init(1);
    const target = createEmu8051DebugTarget(withoutExports(wasm, ['_emu_pin_history_head']));
    assert.ok(!target.capabilities().events.includes('signal'));
    assert.equal(target.capabilities().extensions.signalEvidence, 'none');
});

test('native pin history uses its write head after wrap and reports the exact loss', async () => {
    if (!have) return;
    const {target, wasm} = await fixtureWithWasm(PIN_LOOP_HEX);
    const events = [];
    target.onDebugEvent(event => events.push(event));

    // Bypass the adapter's normal per-budget drain so the native ring really
    // wraps. The program changes P1.0 twice per loop.
    wasm._emu_run(15000);
    const count = wasm._emu_pin_history_count() >>> 0;
    const head = wasm._emu_pin_history_head() >>> 0;
    assert.ok(count > 4096, `test program produced only ${count} pin edges`);
    assert.equal(head, count,
        'black-box ABI check: head/count are cumulative next-write/event counters in this pin');

    const ptr = wasm._emu_pin_history_get((head - 1) >>> 0);
    const raw = new DataView(wasm.HEAPU8.buffer);
    const expectedLast = {
        name: `P${raw.getUint8(ptr + 8)}.${raw.getUint8(ptr + 9)}`,
        value: raw.getUint8(ptr + 11) !== 0,
        mode: ['quasi', 'pushpull', 'input', 'opendrain'][raw.getUint8(ptr + 10)]
    };

    // A harmless debugger write invokes the adapter drain without adding a
    // pin transition of its own.
    target.writeMem('iram', 0x20, new Uint8Array([0]));
    const gap = events.find(event => event.phase === 'history-gap');
    const pins = events.filter(event => event.phase === 'pin-change');
    assert.equal(gap.signal.value, count - 4096);
    assert.equal(pins.length, 4096);
    assert.deepEqual(pins.at(-1).signal, expectedLast,
        'the final decoded event must come from head-1, not a frozen pre-wrap cursor');
    assert.ok(pins[0].time.ticks < pins.at(-1).time.ticks,
        'retained post-wrap events preserve native chronological order');
});

test('an old build may keep write breakpoints without claiming decoded memory events', async () => {
    if (!have) return;
    const {default: createEmu8051} = await import(WASM_JS);
    const {createEmu8051DebugTarget} = await import(DEBUG_JS);
    const wasm = await createEmu8051();
    wasm._emu_init(1);
    const target = createEmu8051DebugTarget(withoutExports(wasm,
        ['_emu_dbg_halt_is_watch', '_emu_dbg_halt_bp']));
    const caps = target.capabilities();
    assert.ok(caps.breakpoints.includes('write'), 'native change watchpoints still exist');
    assert.ok(!caps.events.includes('memory'), 'the old ABI cannot decode their address/value evidence');
    assert.equal(caps.fidelity.memory, 'unsupported');
});

test('real single instruction and oscillator steps emit distinct recorded evidence', async () => {
    if (!have) return;
    const target = await fixture(CYCLE_HEX);
    const events = [];
    target.onDebugEvent(event => events.push(event));

    target.step('cycle', 1);
    settle(target);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].time.domain, '8051-oscillator-reset-1');
    assert.equal(events[0].kind, 'bus');
    assert.equal(events[0].phase, 'oscillator-clock');
    assert.equal(events[0].fidelity, 'recorded');
    assert.equal(events[0].pcBefore, 0);
    assert.equal(events[0].pcAfter, 3,
        'the visible PC advances during the first clock; this bus event is deliberately not a retire');
    assert.equal(events[0].signals, undefined, 'the WASM exports no bus signals');

    target.step('cycle', 1);
    settle(target);
    assert.equal(events[1].pcAfter, 3);
    assert.equal(events[1].time.ticks - events[0].time.ticks, 1n,
        'each emitted oscillator boundary advances the configured clock by exactly one');

    const instructionTarget = await fixture(CYCLE_HEX);
    const instructionEvents = [];
    instructionTarget.onDebugEvent(event => instructionEvents.push(event));
    instructionTarget.step('insn', 1);
    settle(instructionTarget);
    assert.equal(instructionEvents[0].kind, 'instruction');
    assert.equal(instructionEvents[0].phase, 'retire');
    assert.equal(instructionEvents[0].pcBefore, 0);
    assert.equal(instructionEvents[0].pcAfter, 3);
    assert.deepEqual(instructionEvents[0].instruction, {address: 0});
});

test('native write-watchpoint emits the measured before/after transition', async () => {
    if (!have) return;
    const target = await fixture(WATCH_HEX);
    const events = [];
    const unsubscribe = target.onDebugEvent(event => events.push(event));
    target.setBreakpoint({kind: 'write', space: 'iram', addr: 0x30});
    target.run();
    settle(target);

    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'memory');
    assert.equal(events[0].phase, 'change-watchpoint');
    assert.deepEqual(events[0].memory, {
        space: 'iram', address: 0x30, width: 1, direction: 'write', before: 0, value: 0x42
    });
    unsubscribe();
    target.reset();
    target.run();
    for (let i = 0; i < 200 && target.state() === 'running'; i++) target.runFor(1000);
    assert.equal(events.length, 1, 'unsubscribed listeners still received target evidence');
});
