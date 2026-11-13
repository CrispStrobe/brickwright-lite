import test from 'node:test';
import assert from 'node:assert/strict';
import {createI80386Adapter} from 'bw-board/i80386-adapter.js';
import {pcSet1Bytes} from '../overlay/scratch-gui/src/lib/bw-machines/pc-scancodes.js';

// Read the actual guest-facing 8042 port bus. This exercises transport, not a
// booted BIOS's decoding or a DOS application's interpretation of the keys.
test('386 adapter preserves enhanced make/break bytes through the AT keyboard FIFO', () => {
    const adapter = createI80386Adapter({profile: 'freedos-vga'});
    for (const code of ['ArrowLeft', 'Numpad4', 'ControlRight', 'ControlLeft',
        'NumpadEnter', 'NumpadDivide', 'AltRight', 'F11', 'F12']) {
        const expected = [...pcSet1Bytes(code), ...pcSet1Bytes(code, false)];
        for (const byte of expected) assert.equal(adapter.keyIn(byte), true, `${code}: admitted`);
        const actual = [];
        while (adapter.machine._in(0x64) & 1) actual.push(adapter.machine._in(0x60));
        assert.deepEqual(actual, expected, code);
        assert.equal(adapter.machine._in(0x64) & 1, 0, 'no duplicate bytes');
    }
});
