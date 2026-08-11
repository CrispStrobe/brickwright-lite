import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runDrc} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/drc.js';

function picoCircuit(sourceKind, sourceParams = {}) {
    return {
        parts: [
            {id: 'pico', kind: 'pi_pico', terminals: ['gp0'], params: {}},
            {id: 'source', kind: sourceKind, terminals: sourceKind === 'vcc' ? ['vcc'] : ['pos', 'neg'], params: sourceParams},
        ],
        wires: [{
            from: {part: 'pico', terminal: 'gp0'},
            to: {part: 'source', terminal: sourceKind === 'vcc' ? 'vcc' : 'pos'},
            netId: 'net-5v',
        }],
        breadboards: new Map(),
    };
}

test('Pico GPIO connected to +5V receives a voltage-domain warning', () => {
    const warnings = runDrc(picoCircuit('vcc'), {powered: true});
    assert.equal(warnings.some(w => w.rule === 'pico-voltage' && w.pinId === 'gp0'), true);
});

test('Pico GPIO connected to a 3.3V source is not flagged as 5V', () => {
    const warnings = runDrc(picoCircuit('vsource', {volts: 3.3}), {powered: true});
    assert.equal(warnings.some(w => w.rule === 'pico-voltage'), false);
});
