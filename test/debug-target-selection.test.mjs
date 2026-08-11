import {test} from 'node:test';
import assert from 'node:assert/strict';

import {selectDebugTargetKind} from '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

test('Arduino devices automatically select the ATmega328P backend', () => {
    assert.equal(selectDebugTargetKind('arduino-uno'), 'avr8js');
    assert.equal(selectDebugTargetKind('arduino-nano'), 'avr8js');
    assert.equal(selectDebugTargetKind('atmega328p'), 'avr8js');
});

test('Pico does not silently fall back to an unrelated emulator', () => {
    assert.equal(selectDebugTargetKind('pico'), 'rp2040js');
});

test('an explicit transport selection remains authoritative', () => {
    assert.equal(selectDebugTargetKind('arduino-uno', 'serial'), 'serial');
});
