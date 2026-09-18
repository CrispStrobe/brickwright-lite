/**
 * ORACLE tests for the live gate evaluator — it is checked not against a handful
 * of hand-picked cases but against the KNOWN-CORRECT boolean function of each
 * circuit, EXHAUSTIVELY over every input combination. The reference is the maths:
 * a full-adder must equal a^b^cin / majority(a,b,cin); a mux must equal sel?b:a.
 * If gate-eval ever computes real logic wrongly, one of these goes red.
 *
 * Pure — the evaluator is JS, the oracle is JS, no browser or toolchain needed.
 * (The heavier oracle — this same design synthesised and simulated by digitaljs,
 * the reference SIMULATOR — is a browser drive; this validates the logic itself.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {evalModel, stepClock} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';

// Enumerate 0/1 over `names`, calling fn with an inputs object each time.
function forAllInputs (names, fn) {
    const n = names.length;
    for (let bits = 0; bits < (1 << n); bits++) {
        const inputs = {};
        names.forEach((nm, i) => { inputs[nm] = (bits >> i) & 1; });
        fn(inputs);
    }
}

// A full adder built ONLY from primitive gates:
//   sum  = a ^ b ^ cin
//   cout = (a & b) | (cin & (a ^ b))
const FULL_ADDER = {
    nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'}, {id: 'c', kind: 'in', name: 'cin'},
        {id: 'x1', kind: 'gate', type: 'xor'},   // a ^ b
        {id: 'x2', kind: 'gate', type: 'xor'},   // (a^b) ^ cin = sum
        {id: 'a1', kind: 'gate', type: 'and'},   // a & b
        {id: 'a2', kind: 'gate', type: 'and'},   // cin & (a^b)
        {id: 'o1', kind: 'gate', type: 'or'},    // cout
        {id: 'sum', kind: 'out', name: 'sum'}, {id: 'cout', kind: 'out', name: 'cout'}
    ],
    edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 'x1', port: 'a'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'x1', port: 'b'}},
        {from: {node: 'x1', port: 'out'}, to: {node: 'x2', port: 'a'}},
        {from: {node: 'c', port: 'out'}, to: {node: 'x2', port: 'b'}},
        {from: {node: 'x2', port: 'out'}, to: {node: 'sum', port: 'in'}},
        {from: {node: 'a', port: 'out'}, to: {node: 'a1', port: 'a'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'a1', port: 'b'}},
        {from: {node: 'c', port: 'out'}, to: {node: 'a2', port: 'a'}},
        {from: {node: 'x1', port: 'out'}, to: {node: 'a2', port: 'b'}},
        {from: {node: 'a1', port: 'out'}, to: {node: 'o1', port: 'a'}},
        {from: {node: 'a2', port: 'out'}, to: {node: 'o1', port: 'b'}},
        {from: {node: 'o1', port: 'out'}, to: {node: 'cout', port: 'in'}}
    ]
};

test('ORACLE: the gate-built full adder equals a^b^cin / majority for ALL inputs', () => {
    forAllInputs(['a', 'b', 'cin'], inp => {
        const {outputs, settled} = evalModel(FULL_ADDER, inp);
        assert.equal(settled, true);
        const refSum = inp.a ^ inp.b ^ inp.cin;
        const refCout = (inp.a & inp.b) | (inp.b & inp.cin) | (inp.a & inp.cin);
        assert.equal(outputs.sum, refSum, `sum wrong at ${JSON.stringify(inp)}`);
        assert.equal(outputs.cout, refCout, `cout wrong at ${JSON.stringify(inp)}`);
    });
});

// A 2:1 mux from gates: out = (a & ~sel) | (b & sel)
const MUX = {
    nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'}, {id: 's', kind: 'in', name: 'sel'},
        {id: 'ns', kind: 'gate', type: 'not'},
        {id: 'g0', kind: 'gate', type: 'and'}, {id: 'g1', kind: 'gate', type: 'and'},
        {id: 'o', kind: 'gate', type: 'or'}, {id: 'y', kind: 'out', name: 'y'}
    ],
    edges: [
        {from: {node: 's', port: 'out'}, to: {node: 'ns', port: 'a'}},
        {from: {node: 'a', port: 'out'}, to: {node: 'g0', port: 'a'}},
        {from: {node: 'ns', port: 'out'}, to: {node: 'g0', port: 'b'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'g1', port: 'a'}},
        {from: {node: 's', port: 'out'}, to: {node: 'g1', port: 'b'}},
        {from: {node: 'g0', port: 'out'}, to: {node: 'o', port: 'a'}},
        {from: {node: 'g1', port: 'out'}, to: {node: 'o', port: 'b'}},
        {from: {node: 'o', port: 'out'}, to: {node: 'y', port: 'in'}}
    ]
};

test('ORACLE: the gate-built 2:1 mux equals sel ? b : a for ALL inputs', () => {
    forAllInputs(['a', 'b', 'sel'], inp => {
        const {outputs} = evalModel(MUX, inp);
        assert.equal(outputs.y, inp.sel ? inp.b : inp.a, `mux wrong at ${JSON.stringify(inp)}`);
    });
});

test('ORACLE: a D flip-flop tracks its input one cycle late, over a random stimulus', () => {
    const dff = {
        nodes: [
            {id: 'ck', kind: 'in', name: 'clk'}, {id: 'd', kind: 'in', name: 'd'},
            {id: 'f', kind: 'gate', type: 'dff'}, {id: 'q', kind: 'out', name: 'q'}
        ],
        edges: [
            {from: {node: 'd', port: 'out'}, to: {node: 'f', port: 'd'}},
            {from: {node: 'ck', port: 'out'}, to: {node: 'f', port: 'clk'}},
            {from: {node: 'f', port: 'out'}, to: {node: 'q', port: 'in'}}
        ]
    };
    // Reference: q(t) = d(t-1), starting at 0.
    let state = {};
    let refQ = 0;
    // deterministic pseudo-random stimulus, so a failure reproduces
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 1;
    for (let t = 0; t < 40; t++) {
        const d = rnd();
        assert.equal(evalModel(dff, {d}, state).outputs.q, refQ, `q wrong at cycle ${t}`);
        state = stepClock(dff, {d}, state);
        refQ = d;
    }
});
