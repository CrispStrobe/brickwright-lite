// The 74HC-chip realisation's pure core: the gate → chip map and the truth
// oracle. The board test (fpga-logic-ic-board.test.mjs) grades a real circuit
// against evalLogicIc; this holds the map itself honest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {gateToLogicIc, evalLogicIc, LOGIC_IC_GATES} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic.js';

test('every offered gate maps to a real 74HC chip with gate-1 pins', () => {
    const expected = {
        not: '74hc04', and: '74hc08', or: '74hc32', nand: '74hc00', nor: '74hc02', xor: '74hc86'
    };
    for (const type of LOGIC_IC_GATES) {
        const spec = gateToLogicIc(type);
        assert.ok(spec, `${type} must map to a chip`);
        assert.equal(spec.chip, expected[type], `${type} -> ${expected[type]}`);
        assert.ok(spec.output === '1y', 'gate 1 output is 1y');
        assert.ok(spec.inputs.length === (type === 'not' ? 1 : 2), `${type} arity`);
        assert.ok(spec.inputs.every(p => /^1[ab]$/.test(p)), 'inputs are gate-1 pins');
    }
});

test('an unknown gate has no realisation', () => {
    assert.equal(gateToLogicIc('mux'), null);
    assert.equal(gateToLogicIc('xnor'), null);
});

test('evalLogicIc is the textbook truth table', () => {
    assert.equal(evalLogicIc('not', [0]), 1);
    assert.equal(evalLogicIc('not', [1]), 0);
    for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        assert.equal(evalLogicIc('and', [a, b]), a & b);
        assert.equal(evalLogicIc('or', [a, b]), a | b);
        assert.equal(evalLogicIc('nand', [a, b]), (a & b) ? 0 : 1);
        assert.equal(evalLogicIc('nor', [a, b]), (a | b) ? 0 : 1);
        assert.equal(evalLogicIc('xor', [a, b]), a ^ b);
    }
});
