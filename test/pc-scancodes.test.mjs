import test from 'node:test';
import assert from 'node:assert/strict';
import {pcSet1Make, pcSet1Bytes} from '../overlay/scratch-gui/src/lib/bw-machines/pc-scancodes.js';

test('Windows control keys use IBM set-1 positions', () => {
    assert.equal(pcSet1Make('ControlLeft'), 0x1d);
    assert.equal(pcSet1Make('AltLeft'), 0x38);
    assert.equal(pcSet1Make('ArrowLeft'), 0x4b);
    assert.equal(pcSet1Make('F10'), 0x44);
    assert.equal(pcSet1Make('Unknown'), null);
});


test('enhanced navigation and right modifiers retain E0 on make and break', () => {
    const keys = {
        ControlRight: 0x1d, AltRight: 0x38, NumpadEnter: 0x1c, NumpadDivide: 0x35,
        Home: 0x47, ArrowUp: 0x48, PageUp: 0x49, ArrowLeft: 0x4b,
        ArrowRight: 0x4d, End: 0x4f, ArrowDown: 0x50, PageDown: 0x51,
        Insert: 0x52, Delete: 0x53
    };
    for (const [code, byte] of Object.entries(keys)) {
        assert.deepEqual(pcSet1Bytes(code), [0xe0, byte], code);
        assert.deepEqual(pcSet1Bytes(code, false), [0xe0, byte | 0x80], code);
    }
});

test('keypad, ordinary modifiers and F11/F12 have independent non-extended bytes', () => {
    const keys = {
        ControlLeft: 0x1d, AltLeft: 0x38, Enter: 0x1c, Slash: 0x35,
        Numpad7: 0x47, Numpad8: 0x48, Numpad9: 0x49, NumpadSubtract: 0x4a,
        Numpad4: 0x4b, Numpad5: 0x4c, Numpad6: 0x4d, NumpadAdd: 0x4e,
        Numpad1: 0x4f, Numpad2: 0x50, Numpad3: 0x51, Numpad0: 0x52,
        NumpadDecimal: 0x53, NumpadMultiply: 0x37, F11: 0x57, F12: 0x58
    };
    for (const [code, byte] of Object.entries(keys)) {
        assert.deepEqual(pcSet1Bytes(code), [byte], code);
        assert.deepEqual(pcSet1Bytes(code, false), [byte | 0x80], code);
    }
    assert.equal(pcSet1Bytes('Unknown'), null);
    assert.equal(pcSet1Bytes('Unknown', false), null);
});


test('legacy XT navigation retains its original unprefixed make and break', () => {
    for (const code of ['Home', 'ArrowUp', 'PageUp', 'ArrowLeft', 'ArrowRight', 'End',
        'ArrowDown', 'PageDown', 'Insert', 'Delete']) {
        assert.deepEqual(pcSet1Bytes(code, true, false), [pcSet1Make(code)]);
        assert.deepEqual(pcSet1Bytes(code, false, false), [pcSet1Make(code) | 0x80]);
    }
    for (const code of ['ControlRight', 'AltRight', 'NumpadEnter', 'NumpadDivide',
        'Numpad4', 'NumpadAdd', 'F11', 'F12']) {
        assert.equal(pcSet1Make(code), null, 'legacy lookup remains unchanged');
        assert.equal(pcSet1Bytes(code, true, false), null, code);
        assert.equal(pcSet1Bytes(code, false, false), null, code);
    }
});
