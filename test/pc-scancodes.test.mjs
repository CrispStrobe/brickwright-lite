import test from 'node:test';
import assert from 'node:assert/strict';
import {pcSet1Make} from '../overlay/scratch-gui/src/lib/bw-machines/pc-scancodes.js';

test('Windows control keys use IBM set-1 positions', () => {
    assert.equal(pcSet1Make('ControlLeft'), 0x1d);
    assert.equal(pcSet1Make('AltLeft'), 0x38);
    assert.equal(pcSet1Make('ArrowLeft'), 0x4b);
    assert.equal(pcSet1Make('F10'), 0x44);
    assert.equal(pcSet1Make('Unknown'), null);
});
