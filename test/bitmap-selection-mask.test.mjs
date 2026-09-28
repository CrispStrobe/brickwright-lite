import {test} from 'node:test';
import assert from 'node:assert/strict';

const {lassoMask, opaqueBounds, wandMask} =
    await import('../overlay/scratch-paint/src/helper/bit-tools/bw-selection-mask.js');

test('bitmap lasso selects its edge and interior without selecting the surrounding box', () => {
    const mask = lassoMask([[1, 1], [5, 1], [1, 5]], 7, 7);
    assert.equal(mask[(2 * 7) + 2], 1);
    assert.equal(mask[(4 * 7) + 1], 1);
    assert.equal(mask[(5 * 7) + 5], 0);
});

test('bitmap wand uses connected RGBA pixels, tolerance, and transparent boundary', () => {
    const colours = [[255, 0, 0, 255], [250, 4, 0, 255], [0, 0, 0, 0], [255, 0, 0, 255],
        [255, 0, 0, 255], [0, 0, 255, 255], [0, 0, 0, 0], [255, 0, 0, 255]];
    const data = Uint8ClampedArray.from(colours.flat());
    const exact = wandMask(data, 4, 2, 0, 0);
    assert.equal(exact[0], 1);
    assert.equal(exact[1], 0);
    assert.equal(exact[3], 0);
    const broad = wandMask(data, 4, 2, 0, 0, 5);
    assert.equal(broad[1], 1);
    assert.equal(broad[2], 0);
    assert.deepEqual(opaqueBounds(broad, data, 4, 2), {x: 0, y: 0, width: 2, height: 2});
});
