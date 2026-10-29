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
        ['C3',440], ['B#4',440], ['Db4',440], ['a4',440], ['',440], ['C4x',440]]) {
        assert.equal(runNote(note), expected, note);
    }
});
