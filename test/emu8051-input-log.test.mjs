/** External-input logging at the real emu8051 adapter boundary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WASM_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js');
const ADAPTER_JS = path.join(ROOT, 'node_modules/bw-board/src/emu8051-adapter.js');
const have = existsSync(WASM_JS) && existsSync(ADAPTER_JS);

async function fixture(mode = 'poll', attachBoard = true) {
    const {default: createEmu8051} = await import(WASM_JS);
    const {createEmu8051Adapter} = await import(ADAPTER_JS);
    const raw = await createEmu8051();
    const calls = {pin: [], adc: []};
    const wasm = new Proxy(raw, {get(target, key) {
        if (key === '_emu_set_pin_input') return (...args) => {
            calls.pin.push(args); return target[key](...args);
        };
        if (key === '_emu_set_adc_voltage') return (...args) => {
            calls.adc.push(args); return target[key](...args);
        };
        return target[key];
    }});
    const digital = new Map(Array.from({length: 8}, (_, bit) => [`P1.${bit}`, 1]));
    const analog = new Map(Array.from({length: 8}, (_, bit) => [`P1.${bit}`, 0]));
    const board = {
        advanceTo() {}, setPin() {},
        readPin(pin) { return digital.get(pin) ?? 1; },
        readAnalog(pin) { return analog.get(pin) ?? 0; }
    };
    const adapter = createEmu8051Adapter(wasm, {mode, ports: [1]});
    if (attachBoard) adapter.attachBoard(board);
    return {adapter, calls, digital, analog};
}

/** The same instrumented wasm with NO board — the only state that permits replay. */
const boardless = (mode = 'poll') => fixture(mode, false);

test('poll boundary logs initial and changed pin/ADC inputs exactly once', {skip: have ? false : 'the vendored emu8051 WASM is not present'}, async () => {
    const {adapter, digital, analog} = await fixture();
    const inputs = [];
    adapter.onDebugInput(input => inputs.push(input));
    adapter.runNs(1000);
    assert.equal(inputs.filter(input => input.producer === 'emu8051.pin').length, 8);
    assert.equal(inputs.filter(input => input.producer === 'emu8051.adc').length, 8);
    assert.ok(inputs.every(input => input.time.domain === '8051-input-ns'));

    adapter.runNs(1000);
    assert.equal(inputs.length, 16, 'unchanged board samples must not bloat the input log');
    digital.set('P1.0', 0);
    analog.set('P1.2', 1.25);
    adapter.runNs(1000);
    assert.deepEqual(inputs.slice(16).map(({producer, payload}) => ({producer, payload})), [
        {producer: 'emu8051.pin', payload: {port: 1, bit: 0, level: 0}},
        {producer: 'emu8051.adc', payload: {channel: 2, volts: 1.25}}
    ]);
});

test('replay reaches the NATIVE setters and does not re-log itself', {skip: have ? false : 'the vendored emu8051 WASM is not present'}, async () => {
    // BOARDLESS, AND THAT IS THE POINT OF THIS EDIT. Until the dce90bc pin this
    // ran with a board attached and asserted `{accepted: true}`. Upstream then
    // measured that a live board re-asserts its own pin values, so a replay in
    // POLL mode was accepted and silently overwritten one run slice later --
    // the guard used to test the MODE and give the board as its reason. It now
    // turns on the board, in either mode, so the accepted path is boardless.
    //
    // What this file still proves that upstream's own suite does not: the wasm
    // here is Proxy-wrapped, so it can assert the value handed to the NATIVE
    // setter, not merely that the call was accepted.
    const {adapter, calls} = await boardless();
    const inputs = [];
    adapter.onDebugInput(input => inputs.push(input));
    assert.deepEqual(adapter.applyReplayInput({producer: 'emu8051.pin',
        payload: {port: 1, bit: 3, level: 0}}), {accepted: true});
    assert.deepEqual(adapter.applyReplayInput({producer: 'emu8051.adc',
        payload: {channel: 4, volts: 2.5}}), {accepted: true});
    assert.deepEqual(calls.pin.at(-1), [1, 3, 0]);
    assert.deepEqual(calls.adc.at(-1), [4, 2.5]);
    assert.equal(inputs.length, 0, 'replay application must not recursively record itself');
    assert.equal(adapter.applyReplayInput({producer: 'emu8051.pin',
        payload: {port: 9, bit: 0, level: 1}}).accepted, false);
});

test('an ATTACHED BOARD refuses replay, in either mode', {skip: have ? false : 'the vendored emu8051 WASM is not present'}, async () => {
    // The predicate is the board, not the mode. In poll mode runNs/readPort/
    // writePort/setPortMode all reach the sync path, which reads the live board
    // and pushes its values into the core through the same native setter -- so
    // poll-with-a-board is the identical authority conflict, and before the
    // dce90bc pin it was accepted silently.
    for (const mode of ['poll', 'push']) {
        const {adapter} = await fixture(mode);
        const result = adapter.applyReplayInput({producer: 'emu8051.pin',
            payload: {port: 1, bit: 0, level: 0}});
        assert.equal(result.accepted, false, `${mode} mode with a board must refuse`);
        assert.equal(result.code, 'live-board-input-authority');
    }
});

test('reset starts a fresh monotonic input domain and republishes initial state', {skip: have ? false : 'the vendored emu8051 WASM is not present'}, async () => {
    const {adapter} = await fixture();
    const inputs = [];
    adapter.onDebugInput(input => inputs.push(input));
    adapter.runNs(1000);
    adapter.reset();
    adapter.runNs(1000);
    const afterReset = inputs.slice(16);
    assert.equal(afterReset.length, 16);
    assert.ok(afterReset.every(input => input.time.domain === '8051-input-ns-reset-1'));
    assert.ok(afterReset.every(input => input.time.ticks === 0n),
        'inputs are seated at reset time before the first execution slice');
});

test('listeners receive isolated records and ADC logs the native clamped value', {skip: have ? false : 'the vendored emu8051 WASM is not present'}, async () => {
    const {adapter, analog, calls} = await fixture();
    analog.set('P1.0', 99);
    analog.set('P1.1', Number.NaN);
    const observed = [];
    adapter.onDebugInput(input => { input.payload.level = 99; input.time.domain = 'mutated'; });
    adapter.onDebugInput(input => observed.push(input));
    adapter.runNs(1000);
    const pin = observed.find(input => input.producer === 'emu8051.pin');
    assert.equal(pin.payload.level, 1);
    assert.equal(pin.time.domain, '8051-input-ns');
    assert.deepEqual(observed.filter(input => input.producer === 'emu8051.adc').slice(0, 2)
        .map(input => input.payload.volts), [5, 0]);
    assert.deepEqual(calls.adc.slice(0, 2), [[0, 5], [1, 0]],
        'the record must contain the same clamped voltage passed to native code');
});
