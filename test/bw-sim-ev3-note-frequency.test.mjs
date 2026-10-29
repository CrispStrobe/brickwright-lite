// SPDX-License-Identifier: BSD-3-Clause
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Ev3Vm} from '../overlay/scratch-gui/src/lib/bw-sim/routes/ev3-vm/ev3-vm.js';

// Synthetic RBF exercises actual VM operand decoding and a global DATA16 result.
function runNote (note) {
    const code = [0x63, 0x84, ...Buffer.from(note, 'ascii'), 0, 0x60, 0x0a];
    const bytes = new Uint8Array(28 + code.length);
    bytes.set(Buffer.from('LEGO')); const view = new DataView(bytes.buffer);
    view.setUint32(4, bytes.length, true); view.setUint16(8, 104, true);
    view.setUint16(10, 1, true); view.setUint32(12, 2, true); view.setUint32(16, 28, true);
    bytes.set(code, 28);
    const vm = new Ev3Vm(); assert.deepEqual(vm.start(bytes), {ok: true});
    vm.advanceTo(10, {}); assert.notEqual(vm.status, 'error', JSON.stringify(vm.error));
    return vm.s.globals[0] | (vm.s.globals[1] << 8);
}

test('NOTE_TO_FREQ decodes notes, writes DATA16 and uses firmware fallback', () => {
    for (const [note, expected] of [['C4',262], ['C#4',277], ['A4',440], ['A#5',932], ['B6',1976],
        ['C3',440], ['B#4',440], ['Db4',440], ['a4',440], ['',440], ['C4x',440], ['C4\n',440]]) {
        assert.equal(runNote(note), expected, note);
    }
});

test('compiled EV3 program emits every supported note and unmatched-name fallback', async () => {
    const {readFileSync} = await import('node:fs');
    const bytes = readFileSync(new URL('./fixtures/ev3-rbf/note-frequency.rbf', import.meta.url));
    const vm = new Ev3Vm();
    assert.deepEqual(vm.start(bytes), {ok: true});
    const writes = [];
    vm.advanceTo(1000, {nowMs: () => 1000, event: (kind, value) => {
        if (kind === 'write') writes.push(value.value);
    }});
    assert.notEqual(vm.status, 'error', JSON.stringify(vm.error));
    assert.deepEqual(writes, [262,277,294,311,330,349,370,392,415,440,466,494,
        523,554,587,622,659,698,740,784,831,880,932,988,
        1047,1109,1175,1245,1319,1397,1480,1568,1661,1760,1865,1976,440,440,440]);
});

test('NOTE_TO_FREQ reads a live array handle', () => {
    for (const [note, expected] of [['D#5', 622], ['B#4', 440]]) {
        const code = [0x63, 0xf1, 0, 0x62, 0x0a];
        const bytes = new Uint8Array(28 + code.length);
        bytes.set(Buffer.from('LEGO')); const view = new DataView(bytes.buffer);
        view.setUint32(4, bytes.length, true); view.setUint16(8, 104, true);
        view.setUint16(10, 1, true); view.setUint32(12, 4, true); view.setUint32(16, 28, true);
        bytes.set(code, 28);
        const vm = new Ev3Vm(); assert.deepEqual(vm.start(bytes), {ok: true});
        const handle = vm._create('8', note.length + 1);
        vm.s.handles[handle].data.splice(0, note.length, ...Buffer.from(note));
        vm.s.globals[0] = handle;
        vm.advanceTo(10, {});
        assert.notEqual(vm.status, 'error', JSON.stringify(vm.error));
        assert.equal(vm.s.globals[2] | (vm.s.globals[3] << 8), expected);
    }
});

test('compiled mutable string notes use the current string contents', async () => {
    const {readFileSync} = await import('node:fs');
    const bytes = readFileSync(new URL('./fixtures/ev3-rbf/note-frequency-memory.rbf', import.meta.url));
    const vm = new Ev3Vm(); assert.deepEqual(vm.start(bytes), {ok: true});
    const writes = [];
    vm.advanceTo(1000, {nowMs: () => 1000, event: (kind, value) => {
        if (kind === 'write') writes.push(value.value);
    }});
    assert.notEqual(vm.status, 'error', JSON.stringify(vm.error));
    assert.deepEqual(writes, [262, 440]);
});

test('compiled array handle notes use live contents', async () => {
    const {readFileSync} = await import('node:fs');
    const bytes = readFileSync(new URL('./fixtures/ev3-rbf/note-frequency-handle.rbf', import.meta.url));
    const vm = new Ev3Vm(); assert.deepEqual(vm.start(bytes), {ok: true});
    const writes = [];
    vm.advanceTo(1000, {nowMs: () => 1000, event: (kind, value) => {
        if (kind === 'write') writes.push(value.value);
    }});
    assert.notEqual(vm.status, 'error', JSON.stringify(vm.error));
    assert.deepEqual(writes, [622, 440]);
});

test('NOTE_TO_FREQ rejects an invalid string handle', () => {
    const code = [0x63, 0xf1, 0, 0x62, 0x0a];
    const bytes = new Uint8Array(28 + code.length);
    bytes.set(Buffer.from('LEGO')); const view = new DataView(bytes.buffer);
    view.setUint32(4, bytes.length, true); view.setUint16(8, 104, true);
    view.setUint16(10, 1, true); view.setUint32(12, 4, true); view.setUint32(16, 28, true);
    bytes.set(code, 28);
    const vm = new Ev3Vm(); assert.deepEqual(vm.start(bytes), {ok: true});
    vm.advanceTo(10, {});
    assert.equal(vm.status, 'error'); assert.equal(vm.error.code, 'FAILBREAK');
    assert.deepEqual(vm.s.globals.slice(2, 4), [0, 0]);
});

test('compiled handle note program continues identically after snapshot restore', async () => {
    const {readFileSync} = await import('node:fs');
    const bytes = readFileSync(new URL('./fixtures/ev3-rbf/note-frequency-handle.rbf', import.meta.url));
    const original = new Ev3Vm({instrPerMs: 1});
    assert.deepEqual(original.start(bytes), {ok: true});
    original.advanceTo(2, {});
    assert.equal(original.status, 'running');
    assert.ok(original.s.handles.some(h => h && h.type === '8'), 'live array exists before snapshot');
    const resumed = new Ev3Vm(); resumed.restore(original.snapshot(), bytes);
    const outputs = [[], []];
    for (const [vm, writes] of [[original, outputs[0]], [resumed, outputs[1]]]) {
        vm.advanceTo(1000, {nowMs: () => 1000, event: (kind, value) => {
            if (kind === 'write') writes.push(value.value);
        }});
        assert.notEqual(vm.status, 'error', JSON.stringify(vm.error));
    }
    assert.deepEqual(outputs, [[622, 440], [622, 440]]);
    assert.deepEqual(resumed.s, original.s);
});
