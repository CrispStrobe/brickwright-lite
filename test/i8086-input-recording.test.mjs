import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {I8086Machine, BLINK8086, TIERA8088} from '../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createI8086DebugTarget} from '../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {createI8086Adapter} from '../overlay/scratch-gui/src/lib/bw-board/i8086-adapter.js';
import {applyRecordedTargetInput} from '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

test('recorder gate persists a valid input before applying it and blocks logging failure', () => {
    const order = [];
    const target = {
        canApplyReplayInput: () => true,
        debugTime: () => ({domain: 'cpu', ticks: 7})
    };
    const session = {
        status: () => ({active: true}),
        appendInput: input => { order.push(['log', input]); return {accepted: true}; }
    };
    assert.equal(applyRecordedTargetInput({target, recordingSession: session,
        producer: 'i8086.nmi', payload: {}, apply: () => { order.push(['apply']); return true; }}), true);
    assert.deepEqual(order.map(row => row[0]), ['log', 'apply']);
    assert.deepEqual(order[0][1].time, {domain: 'cpu', ticks: 7});

    let applied = false;
    session.appendInput = () => ({accepted: false});
    assert.equal(applyRecordedTargetInput({target, recordingSession: session,
        producer: 'i8086.nmi', payload: {}, apply: () => { applied = true; }}), false);
    assert.equal(applied, false);
});

test('8086 replay applicator validates and applies GPIO, key, serial, NMI, and ROM mutations', () => {
    const machine = new I8086Machine({...TIERA8088, chips: [
        ...TIERA8088.chips,
        {kind: 'uart16550', name: 'uart1', at: 0x10}
    ]});
    const target = createI8086DebugTarget({machine});
    assert.equal(target.applyReplayInput({producer: 'i8086.gpio',
        payload: {chip: 'ppi1', port: 'c', bit: 2, level: 1}}).accepted, true);
    assert.equal(target.applyReplayInput({producer: 'i8086.key', payload: {scancode: 0x1e}}).accepted, true);
    assert.equal(target.applyReplayInput({producer: 'i8086.serial', payload: {byte: 0x41}}).accepted, true);
    assert.equal(target.applyReplayInput({producer: 'i8086.nmi', payload: {}}).accepted, true);
    assert.equal(machine._nmiPending, true);
    assert.equal(target.applyReplayInput({producer: 'i8086.rom',
        payload: {bytes: Uint8Array.of(0x90), at: 0xffff0}}).accepted, true);
    assert.equal(machine.mem[0xffff0], 0x90);
    assert.equal(target.applyReplayInput({producer: 'i8086.serial', payload: {byte: 999}}).accepted, false);
    assert.equal(target.applyReplayInput({producer: 'unknown', payload: {}}).accepted, false);
});

test('a board-sampled 8086 withdraws checkpoints because its external pin source is unlogged', () => {
    const adapter = createI8086Adapter({config: BLINK8086});
    adapter.attachBoard({readPin: () => 1, setPin() {}, advanceTo() {}});
    const target = createI8086DebugTarget(adapter);
    assert.deepEqual(target.capabilities().recording, []);
    assert.throws(() => target.captureCheckpoint(), /machine state is incomplete/);
});

test('all user-facing 8086 runner mutations pass through the recording gate', () => {
    const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    for (const producer of ['i8086.serial', 'i8086.key', 'i8086.gpio', 'i8086.rom', 'i8086.nmi']) {
        assert.match(source, new RegExp(`applyI8086Input\\('${producer.replace('.', '\\.')}'`));
    }
});
