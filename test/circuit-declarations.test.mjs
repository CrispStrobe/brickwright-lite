import {test} from 'node:test';
import assert from 'node:assert/strict';

import {circuitToDeclarations} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/declarations.js';

function circuit(kind, terminal) {
    const parts = [
        {id: 'board', kind, declName: 'board1'},
        {id: 'led', kind: 'led', declName: 'led1', params: {activeLow: false}}
    ];
    const wires = [{from: {part: 'board', terminal}, to: {part: 'led', terminal: 'anode'}}];
    return circuitToDeclarations(parts, wires);
}

test('Arduino board wiring emits numbered pin declarations', () => {
    const result = circuit('arduino_uno', 'd13');
    assert.equal(result.device, 'arduino-uno');
    assert.deepEqual(result.pins[0], {
        name: 'led1', where: 'D13', pin: 'D13', direction: 'output', activeLow: true
    });
});

test('Pico wiring emits GP declarations without pretending it is executable', () => {
    const result = circuit('pi_pico', 'gp0');
    assert.equal(result.device, 'pico');
    assert.equal(result.pins[0].where, 'GP0');
    assert.equal(result.pins[0].port, undefined);
});
