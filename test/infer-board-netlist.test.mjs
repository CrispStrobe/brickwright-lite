import {test} from 'node:test';
import assert from 'node:assert/strict';

import {inferNetlist} from '../overlay/scratch-gui/src/lib/bw-board/infer-netlist.js';

test('Pico inferred netlists use GP header names instead of STC port placeholders', () => {
    const result = inferNetlist({
        device: 'pico',
        pins: [{name: 'led1', where: 'GP0', direction: 'output', activeLow: false}]
    });
    const mcu = result.parts.find(part => part.id === 'MCU');
    assert.deepEqual(mcu.terminals, ['GP0']);
    assert.ok(result.nets.some(net => net.terminals.some(
        terminal => terminal.part === 'MCU' && terminal.terminal === 'GP0'
    )));
});

test('STC inferred netlists retain port/bit pin names', () => {
    const result = inferNetlist({
        device: 'stc12c5a60s2',
        pins: [{name: 'led1', port: 1, bit: 0, direction: 'output', activeLow: true}]
    });
    assert.deepEqual(result.parts.find(part => part.id === 'MCU').terminals, ['P1.0']);
});
