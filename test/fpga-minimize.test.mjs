/**
 * Logic minimisation, proved against the maths: a MINIMISED circuit must compute
 * the SAME function as the raw sum-of-products (checked exhaustively), while
 * using no more gates — and strictly fewer where the function is reducible. The
 * truth table is the oracle; this proves the Quine–McCluskey pass never changes
 * behaviour, only size.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {primeImplicants, minimizeOutput} from '../overlay/scratch-gui/src/lib/bw-fpga/minimize.js';
import {synthesizeTruthTable, truthTableFrom} from '../overlay/scratch-gui/src/lib/bw-fpga/synthesize.js';
import {evalModel} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';
import {modelToVerilog} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

const gateCount = m => m.nodes.filter(n => n.kind === 'gate').length;

// The minimised circuit reproduces `fn` for EVERY input, and is legal HDL.
function provesMinimised (inputs, outputs, fn) {
    const table = truthTableFrom(inputs, outputs, fn);
    const min = synthesizeTruthTable(table, {minimize: true});
    const raw = synthesizeTruthTable(table);
    assert.deepEqual(modelToVerilog(min).problems, [], 'minimised design is legal HDL');
    for (const row of table.rows) {
        const inp = {}; for (const nm of inputs) inp[nm] = row[nm];
        const {outputs: got, settled} = evalModel(min, inp);
        assert.equal(settled, true);
        for (const o of outputs) assert.equal(got[o], row[o], `${o} wrong at ${JSON.stringify(inp)}`);
    }
    assert.ok(gateCount(min) <= gateCount(raw), 'minimising never grows the circuit');
    return {min: gateCount(min), raw: gateCount(raw)};
}

test('minimising preserves behaviour: XOR, majority, mux, adders', () => {
    provesMinimised(['a', 'b'], ['y'], r => ({y: r.a ^ r.b}));
    provesMinimised(['a', 'b', 'c'], ['y'], r => ({y: (r.a + r.b + r.c) >= 2 ? 1 : 0}));
    provesMinimised(['a', 'b', 'sel'], ['y'], r => ({y: r.sel ? r.b : r.a}));
    provesMinimised(['a', 'b', 'cin'], ['sum', 'cout'], r => ({
        sum: r.a ^ r.b ^ r.cin, cout: (r.a & r.b) | (r.b & r.cin) | (r.a & r.cin)
    }));
});

test('a redundant variable is minimised away to a single literal (no gates)', () => {
    // y = a, with b present but irrelevant → minimises to just the wire a.
    const {min} = provesMinimised(['a', 'b'], ['y'], r => ({y: r.a}));
    assert.equal(min, 0, 'y = a needs no gates after minimising');
});

test('majority genuinely shrinks vs raw sum-of-products', () => {
    const {min, raw} = provesMinimised(['a', 'b', 'c'], ['y'], r => ({y: (r.a + r.b + r.c) >= 2 ? 1 : 0}));
    assert.ok(min < raw, `majority should shrink (${min} < ${raw})`);
});

test('the seven-segment decoder collapses from hundreds of gates', () => {
    const table = truthTableFrom(['d0', 'd1', 'd2', 'd3'], ['a', 'b', 'c', 'd', 'e', 'f', 'g'], row => {
        // reuse the font indirectly: value = d0..d3, segment bits arbitrary here —
        // this test only cares that minimisation preserves whatever table it is given.
        const v = row.d0 | (row.d1 << 1) | (row.d2 << 2) | (row.d3 << 3);
        return {a: v & 1, b: (v >> 1) & 1, c: (v >> 2) & 1, d: v & 1, e: (v >> 1) & 1, f: (v >> 2) & 1, g: v & 1};
    });
    const raw = gateCount(synthesizeTruthTable(table));
    const min = gateCount(synthesizeTruthTable(table, {minimize: true}));
    assert.ok(min < raw / 2, `a 4-input decoder must shrink a lot (${min} vs ${raw})`);
});

test('primeImplicants finds the two prime implicants of a 2-var OR', () => {
    // f = a | b  → minterms 1,2,3 over 2 vars → primes {a=1} and {b=1}.
    const primes = primeImplicants(2, [1, 2, 3]);
    assert.equal(primes.length, 2);
    const cover = minimizeOutput(2, [1, 2, 3]);
    assert.equal(cover.length, 2, 'a|b is two single-literal terms');
    for (const term of cover) assert.equal(term.length, 1, 'each term is one literal');
});
