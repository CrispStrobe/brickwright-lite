/** External-input logging at the real emu8051 adapter boundary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WASM_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js');
const ADAPTER_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/emu8051-adapter.js');
const have = existsSync(WASM_JS) && existsSync(ADAPTER_JS);
if (!have) console.log('# SKIP: vendored emu8051 WASM is not present');

async function fixture(mode = 'poll') {
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
    adapter.attachBoard(board);
    return {adapter, calls, digital, analog};
}

test('poll boundary logs initial and changed pin/ADC inputs exactly once', async () => {
    if (!have) return;
    const {adapter, digital, analog} = await fixture();
    const inputs = [];
    adapter.onInput(input => inputs.push(input));
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

test('poll-mode replay validates and applies recorded inputs without re-logging them', async () => {
    if (!have) return;
    const {adapter, calls} = await fixture();
    const inputs = [];
    adapter.onInput(input => inputs.push(input));
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

test('push mode refuses latch replay while the live board callback owns input', async () => {
    if (!have) return;
    const {adapter} = await fixture('push');
    const result = adapter.applyReplayInput({producer: 'emu8051.pin',
        payload: {port: 1, bit: 0, level: 0}});
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'live-board-input-authority');
});
