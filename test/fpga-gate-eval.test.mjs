/**
 * The live gate evaluator — it must compute what the generated Verilog would.
 * Combinational logic settles to a value, an unwired input ties low, a
 * flip-flop holds and advances on a clock step, and a combinational loop is
 * reported rather than spinning. Pure, so no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {evalModel, stepClock} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';

const andModel = {
    nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
        {id: 'g', kind: 'gate', type: 'and'}, {id: 'y', kind: 'out', name: 'y'}
    ],
    edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'g', port: 'b'}},
        {from: {node: 'g', port: 'out'}, to: {node: 'y', port: 'in'}}
    ]
};

test('a combinational AND settles to the right output for every input', () => {
    for (const [a, b, y] of [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]]) {
        const r = evalModel(andModel, {a, b}, {});
        assert.equal(r.settled, true);
        assert.equal(r.outputs.y, y, `${a} & ${b} = ${y}`);
        assert.equal(r.values.g, y, 'the gate node carries its output value');
    }
});

test('each gate operator computes correctly', () => {
    const run = (type, a, b) => {
        const m = {...andModel, nodes: andModel.nodes.map(n => n.id === 'g' ? {...n, type} : n)};
        return evalModel(m, {a, b}).outputs.y;
    };
    assert.equal(run('or', 0, 1), 1);
    assert.equal(run('xor', 1, 1), 0);
    assert.equal(run('nand', 1, 1), 0);
    assert.equal(run('nor', 0, 0), 1);
    assert.equal(run('xnor', 1, 1), 1);
});

test('a NOT chained through two gates settles (fixpoint over depth)', () => {
    const m = {
        nodes: [
            {id: 'a', kind: 'in', name: 'a'},
            {id: 'n1', kind: 'gate', type: 'not'}, {id: 'n2', kind: 'gate', type: 'not'},
            {id: 'y', kind: 'out', name: 'y'}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'n1', port: 'a'}},
            {from: {node: 'n1', port: 'out'}, to: {node: 'n2', port: 'a'}},
            {from: {node: 'n2', port: 'out'}, to: {node: 'y', port: 'in'}}
        ]
    };
    assert.equal(evalModel(m, {a: 1}).outputs.y, 1, 'double negation returns the input');
    assert.equal(evalModel(m, {a: 0}).outputs.y, 0);
});

test('an unwired input ties low, matching the generated Verilog', () => {
    const m = {...andModel, edges: andModel.edges.filter(e => e.to.port !== 'b')};
    // b unwired -> tied low -> AND is always 0
    assert.equal(evalModel(m, {a: 1}).outputs.y, 0);
});

test('a flip-flop holds its state and advances on a clock step', () => {
    const m = {
        nodes: [
            {id: 'ck', kind: 'in', name: 'clk'}, {id: 'd', kind: 'in', name: 'd'},
            {id: 'ff', kind: 'gate', type: 'dff'}, {id: 'q', kind: 'out', name: 'q'}
        ],
        edges: [
            {from: {node: 'd', port: 'out'}, to: {node: 'ff', port: 'd'}},
            {from: {node: 'ck', port: 'out'}, to: {node: 'ff', port: 'clk'}},
            {from: {node: 'ff', port: 'out'}, to: {node: 'q', port: 'in'}}
        ]
    };
    let state = {};
    // starts at 0
    assert.equal(evalModel(m, {d: 1}, state).outputs.q, 0, 'a fresh flop is 0');
    // one clock with d=1 -> next state 1
    state = stepClock(m, {d: 1}, state);
    assert.equal(evalModel(m, {d: 1}, state).outputs.q, 1, 'the flop captured d on the edge');
    // hold d=0, step -> back to 0
    state = stepClock(m, {d: 0}, state);
    assert.equal(evalModel(m, {d: 0}, state).outputs.q, 0);
});

test('a toggle flip-flop (q fed back through NOT) alternates each clock', () => {
    const m = {
        nodes: [
            {id: 'ck', kind: 'in', name: 'clk'},
            {id: 'inv', kind: 'gate', type: 'not'},
            {id: 'ff', kind: 'gate', type: 'dff'},
            {id: 'q', kind: 'out', name: 'q'}
        ],
        edges: [
            {from: {node: 'ck', port: 'out'}, to: {node: 'ff', port: 'clk'}},
            {from: {node: 'ff', port: 'out'}, to: {node: 'inv', port: 'a'}},
            {from: {node: 'inv', port: 'out'}, to: {node: 'ff', port: 'd'}},
            {from: {node: 'ff', port: 'out'}, to: {node: 'q', port: 'in'}}
        ]
    };
    let state = {};
    const seq = [];
    for (let i = 0; i < 4; i++) { seq.push(evalModel(m, {}, state).outputs.q); state = stepClock(m, {}, state); }
    assert.deepEqual(seq, [0, 1, 0, 1], 'a T flip-flop halves the clock');
});

test('a combinational loop settles to unknown, and never hangs', () => {
    // an inverter feeding itself has no defined level; 3-valued logic converges
    // it to x (a stable unknown) instead of oscillating forever.
    const m = {
        nodes: [{id: 'n', kind: 'gate', type: 'not'}, {id: 'y', kind: 'out', name: 'y'}],
        edges: [
            {from: {node: 'n', port: 'out'}, to: {node: 'n', port: 'a'}},
            {from: {node: 'n', port: 'out'}, to: {node: 'y', port: 'in'}}
        ]
    };
    const r = evalModel(m, {});
    assert.equal(r.outputs.y, 'x', 'a self-driven inverter has no defined level');
});

// A memory node is a synthesis-path feature — the 1-bit live evaluator does not
// simulate RAM. It must DEGRADE, not crash: surrounding gates still evaluate,
// and the un-simulated memory output reads 'x' rather than throwing.
test('a memory node does not break live evaluation of the rest of the design', () => {
    const model = {
        nodes: [
            {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
            {id: 'g', kind: 'gate', type: 'and'}, {id: 'y', kind: 'out', name: 'y'},
            {id: 'ck', kind: 'in', name: 'clk'},
            {id: 'ram', kind: 'memory', dataWidth: 4, addrWidth: 2},
            {id: 'q', kind: 'out', name: 'q'}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'g', port: 'b'}},
            {from: {node: 'g', port: 'out'}, to: {node: 'y', port: 'in'}},
            {from: {node: 'ck', port: 'out'}, to: {node: 'ram', port: 'clk'}},
            {from: {node: 'ram', port: 'dout'}, to: {node: 'q', port: 'in'}}
        ]
    };
    const {outputs} = evalModel(model, {a: 1, b: 1});
    assert.equal(outputs.y, 1, 'real gates still evaluate with a memory node present');
    assert.equal(outputs.q, 'x', 'the un-simulated memory output is unknown, not a crash');
    assert.doesNotThrow(() => stepClock(model, {a: 1, b: 1}));
});

test('a flip-flop preserves unknown across a known → unknown → known clock sequence', () => {
    const model = unknownD => ({
        nodes: [
            {id: 'd', kind: 'in', name: 'd'},
            {id: 'keep', kind: 'in', name: 'keep'},
            {id: 'loop', kind: 'gate', type: 'not'},
            {id: 'ff', kind: 'gate', type: 'dff'},
            {id: 'sibling', kind: 'gate', type: 'dff'},
            {id: 'q', kind: 'out', name: 'q'},
            {id: 'stable', kind: 'out', name: 'stable'}
        ],
        edges: [
            {from: {node: 'loop', port: 'out'}, to: {node: 'loop', port: 'a'}},
            {from: {node: unknownD ? 'loop' : 'd', port: 'out'}, to: {node: 'ff', port: 'd'}},
            {from: {node: 'keep', port: 'out'}, to: {node: 'sibling', port: 'd'}},
            {from: {node: 'ff', port: 'out'}, to: {node: 'q', port: 'in'}},
            {from: {node: 'sibling', port: 'out'}, to: {node: 'stable', port: 'in'}}
        ]
    });
    let state = stepClock(model(false), {d: 1, keep: 1});
    assert.deepEqual(evalModel(model(false), {}, state).outputs, {q: 1, stable: 1});

    state = stepClock(model(true), {keep: 1}, state);
    assert.equal(state.ff, 'x', 'the clock captures the unknown combinational value');
    assert.deepEqual(evalModel(model(true), {}, state).outputs, {q: 'x', stable: 1},
        'rendering keeps x while an independent flop remains known');

    state = stepClock(model(false), {d: 0, keep: 1}, state);
    assert.deepEqual(evalModel(model(false), {}, state).outputs, {q: 0, stable: 1},
        'a later known input replaces x only on a later clock edge');
});
