/**
 * Truth-table → circuit, checked against the maths: the generated gate model,
 * evaluated EXHAUSTIVELY over every input, must reproduce the exact table it was
 * built from — for any function. Plus it must synthesise to clean Verilog. Same
 * oracle idea as the learning-path grader, now proving the synthesiser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {synthesizeTruthTable, truthTableFrom} from '../overlay/scratch-gui/src/lib/bw-fpga/synthesize.js';
import {evalModel} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';
import {modelToVerilog} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

// Build a circuit from `fn`, then assert it computes `fn` for EVERY input.
function proves (inputs, outputs, fn) {
    const table = truthTableFrom(inputs, outputs, fn);
    const model = synthesizeTruthTable(table);
    assert.deepEqual(modelToVerilog(model).problems, [], 'the synthesised circuit is legal HDL');
    for (const row of table.rows) {
        const inp = {}; for (const nm of inputs) inp[nm] = row[nm];
        const {outputs: got, settled} = evalModel(model, inp);
        assert.equal(settled, true);
        for (const o of outputs) {
            assert.equal(got[o], row[o], `${o} wrong at ${JSON.stringify(inp)}`);
        }
    }
}

test('synthesises XOR from its truth table', () => {
    proves(['a', 'b'], ['y'], r => ({y: r.a ^ r.b}));
});

test('synthesises a 3-input majority', () => {
    proves(['a', 'b', 'c'], ['y'], r => ({y: (r.a + r.b + r.c) >= 2 ? 1 : 0}));
});

test('synthesises a 2:1 mux (sel ? b : a)', () => {
    proves(['a', 'b', 'sel'], ['y'], r => ({y: r.sel ? r.b : r.a}));
});

test('synthesises a multi-output function (half adder) in one pass', () => {
    proves(['a', 'b'], ['sum', 'carry'], r => ({sum: r.a ^ r.b, carry: r.a & r.b}));
});

test('a full adder (4 inputs, 2 outputs) round-trips exactly', () => {
    proves(['a', 'b', 'cin'], ['sum', 'cout'], r => ({
        sum: r.a ^ r.b ^ r.cin,
        cout: (r.a & r.b) | (r.b & r.cin) | (r.a & r.cin)
    }));
});

test('constant outputs collapse to a tied literal', () => {
    const always0 = synthesizeTruthTable(truthTableFrom(['a', 'b'], ['z'], () => ({z: 0})));
    assert.match(modelToVerilog(always0).verilog, /assign z = 1'b0;/);
    const always1 = synthesizeTruthTable(truthTableFrom(['a', 'b'], ['z'], () => ({z: 1})));
    assert.match(modelToVerilog(always1).verilog, /assign z = 1'b1;/);
});

test('a single-input pass-through needs no gates', () => {
    const model = synthesizeTruthTable(truthTableFrom(['a'], ['y'], r => ({y: r.a})));
    assert.equal(model.nodes.filter(n => n.kind === 'gate').length, 0, 'y = a is just a wire');
    assert.equal(evalModel(model, {a: 1}).outputs.y, 1);
    assert.equal(evalModel(model, {a: 0}).outputs.y, 0);
});
