import test from 'node:test';
import assert from 'node:assert/strict';
import {ps2ButtonBit, ps2Delta} from '../overlay/scratch-gui/src/lib/bw-machines/ps2-pointer.js';

test('browser buttons map to PS/2 left, middle, right bits', () => {
    assert.deepEqual([0, 1, 2, 3].map(ps2ButtonBit), [1, 4, 2, 0]);
});

test('relative motion is rounded and stays within one PS/2 packet', () => {
    assert.deepEqual([-500, -1.6, 0, 1.6, 500].map(ps2Delta), [-127, -2, 0, 2, 127]);
});
