import test from 'node:test';
import assert from 'node:assert/strict';
import {Emitter} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';

const number = value => [1, [4, String(value)]];
const linked = id => [2, id];
const block = (opcode, NUM1, NUM2) => ({opcode, inputs: {NUM1, NUM2}, fields: {}});
const evaluate = (expression, randint) => Function('Math', 'randint', `return ${expression}`)(
    {idiv: (left, right) => ((left | 0) / (right | 0)) | 0}, randint);
function quotient(left, right, outer = 0) {
    const blocks = {
        divide: block('operator_divide', number(left), number(right)),
        result: block('bitops_or', linked('divide'), number(outer))
    };
    return {blocks, emitter: new Emitter(blocks)};
}

for (const [left, right, expected] of [
    [1, 0.5, 2], [-7.9, 2.9, -2], [4294967297, 2, -2147483648],
    [7, -2, -3], [1, 0, 0], [0, 0, 0]
]) test(`export preserves quotient-only coercion of ${left} / ${right}`, () => {
    const {blocks, emitter} = quotient(left, right);
    const expression = emitter.reporter(blocks.result);
    assert.equal(evaluate(expression), expected, expression);
    assert.doesNotMatch(expression, /Math\.idiv/);
    assert.deepEqual(emitter.unsupported, []);
});

test('explicit operand coercions around the division are Math.idiv itself', () => {
    const blocks = {
        left: block('bitops_or', number(1), number(0)),
        right: block('bitops_or', number(0.5), number(0)),
        divide: block('operator_divide', linked('left'), linked('right')),
        result: block('bitops_or', linked('divide'), number(0))
    };
    const emitter = new Emitter(blocks);
    const expression = emitter.reporter(blocks.result);
    assert.equal(expression, 'Math.idiv(1, 0.5)');
    assert.equal(evaluate(expression), 0);
    assert.deepEqual(emitter.unsupported, []);
});

test('actual connected operand reporters execute once in left-to-right order', () => {
    const {blocks, emitter} = quotient(0, 0);
    blocks.left = {opcode: 'operator_random', inputs: {FROM: number(11), TO: number(11)}};
    blocks.right = {opcode: 'operator_random', inputs: {FROM: number(22), TO: number(22)}};
    blocks.divide.inputs = {NUM1: linked('left'), NUM2: linked('right')};
    const trace = [];
    const expression = emitter.reporter(blocks.result);
    assert.equal(evaluate(expression, (from, to) => {
        assert.equal(from, to);
        trace.push(from);
        return from === 11 ? 1 : 0.5;
    }), 2);
    assert.deepEqual(trace, [11, 22]);
});

test('current outer operand edit retains the edited bitwise operation', () => {
    const {blocks, emitter} = quotient(1, 0.5, 1);
    const expression = emitter.reporter(blocks.result);
    assert.equal(evaluate(expression), 3);
    assert.equal(expression, '((1 / 0.5) | 1)');
});
