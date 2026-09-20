/**
 * Folding output pins into a seven-segment number: lowest pin is the LSB, so a
 * counter on pins 15–18 reads 0,1,2,3,… as it counts. Pure — no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pinsToValue} from '../overlay/scratch-gui/src/lib/bw-fpga/pin-value.js';

test('the lowest pin is the least-significant bit', () => {
    const pins = [{pin: 15, high: true}, {pin: 16, high: false}, {pin: 17, high: false}, {pin: 18, high: false}];
    assert.equal(pinsToValue(pins), 1);
});

test('a 4-bit counter reads 0..15 regardless of pin order in the array', () => {
    const at = n => [15, 16, 17, 18].map((pin, i) => ({pin, high: Boolean((n >> i) & 1)}));
    for (let n = 0; n < 16; n++) {
        assert.equal(pinsToValue(at(n)), n);
        // shuffled input must give the same number (order is by pin, not array)
        assert.equal(pinsToValue([...at(n)].reverse()), n);
    }
});

test('no pins is zero, and non-contiguous pins still pack by rank', () => {
    assert.equal(pinsToValue([]), 0);
    // pins 2 and 9: 2 is bit0, 9 is bit1
    assert.equal(pinsToValue([{pin: 9, high: true}, {pin: 2, high: true}]), 0b11);
    assert.equal(pinsToValue([{pin: 9, high: true}, {pin: 2, high: false}]), 0b10);
});
