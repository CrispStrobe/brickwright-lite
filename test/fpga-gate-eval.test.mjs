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

// The live canvas colours each wire by its SOURCE node's value and shows each
// output by name — so evalModel must expose both. This pins that contract.
test('evalModel exposes per-node values (wire colours) and named outputs', () => {
    const model = {
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
    const {values, outputs} = evalModel(model, {a: 1, b: 1});
    assert.equal(values.a, 1, 'the input wire carries its value');
    assert.equal(values.g, 1, 'the gate output wire is coloured 1 & 1 = 1');
    assert.equal(outputs.y, 1, 'the named output reads 1');
    // toggling one input recolours downstream
    assert.equal(evalModel(model, {a: 1, b: 0}).values.g, 0);
});

// The sequential family (T/SR/JK flip-flops) advances by the tested stepClock.
test('T, SR and JK flip-flops step correctly', () => {
    const ff = (type, ins) => ({nodes: [...ins.map(n => ({id: n, kind: 'in', name: n})),
        {id: 'f', kind: 'gate', type}, {id: 'q', kind: 'out', name: 'q'}],
    edges: [...ins.map(n => ({from: {node: n, port: 'out'}, to: {node: 'f', port: n}})),
        {from: {node: 'f', port: 'out'}, to: {node: 'q', port: 'in'}}]});

    // T-FF toggles when t=1, holds when t=0
    let m = ff('tff', ['t', 'clk']); let s = {};
    const seq = []; for (let i = 0; i < 4; i++) { seq.push(evalModel(m, {t: 1}, s).outputs.q); s = stepClock(m, {t: 1}, s); }
    assert.deepEqual(seq, [0, 1, 0, 1], 'T-FF divides the clock by two');
    s = stepClock(m, {t: 0}, {f: 1}); assert.equal(s.f, 1, 't=0 holds');

    // SR-FF: set dominates path, reset clears, else holds
    m = ff('srff', ['s', 'r', 'clk']);
    assert.equal(stepClock(m, {s: 1, r: 0}, {}).f, 1, 'set → 1');
    assert.equal(stepClock(m, {s: 0, r: 1}, {f: 1}).f, 0, 'reset → 0');
    assert.equal(stepClock(m, {s: 0, r: 0}, {f: 1}).f, 1, 'hold');

    // JK-FF: j&k toggles, j sets, k resets, else holds
    m = ff('jkff', ['j', 'k', 'clk']);
    assert.equal(stepClock(m, {j: 1, k: 1}, {f: 0}).f, 1, 'j&k toggles');
    assert.equal(stepClock(m, {j: 1, k: 0}, {f: 0}).f, 1, 'j sets');
    assert.equal(stepClock(m, {j: 0, k: 1}, {f: 1}).f, 0, 'k resets');
    assert.equal(stepClock(m, {j: 0, k: 0}, {f: 1}).f, 1, 'hold');
});

// ── the datapath: multi-bit buses compute (what the Run-mode number field drives) ──
test('a 4-bit adder/subtracter/mux/comparator computes on bus values', () => {
    const model = {
        nodes: [
            {id: 'a', kind: 'in', name: 'a', width: 4}, {id: 'b', kind: 'in', name: 'b', width: 4},
            {id: 'add', kind: 'gate', type: 'add', width: 4}, {id: 'sub', kind: 'gate', type: 'sub', width: 4},
            {id: 'sum', kind: 'out', name: 'sum', width: 4}, {id: 'dif', kind: 'out', name: 'dif', width: 4}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'add', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'add', port: 'b'}},
            {from: {node: 'a', port: 'out'}, to: {node: 'sub', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'sub', port: 'b'}},
            {from: {node: 'add', port: 'out'}, to: {node: 'sum', port: 'in'}},
            {from: {node: 'sub', port: 'out'}, to: {node: 'dif', port: 'in'}}
        ]
    };
    const r1 = evalModel(model, {a: 5, b: 9}).outputs;
    assert.equal(r1.sum, 14, '5+9');
    const r2 = evalModel(model, {a: 12, b: 7}).outputs;
    assert.equal(r2.sum, 3, '12+7 wraps in 4 bits');
    assert.equal(evalModel(model, {a: 9, b: 4}).outputs.dif, 5, '9-4');
});

test('a comparator and a mux select on bus values', () => {
    const model = {
        nodes: [
            {id: 'a', kind: 'in', name: 'a', width: 4}, {id: 'b', kind: 'in', name: 'b', width: 4},
            {id: 'gt', kind: 'gate', type: 'gt'}, {id: 'm', kind: 'gate', type: 'mux', width: 4},
            {id: 'big', kind: 'out', name: 'big', width: 4}, {id: 'agtb', kind: 'out', name: 'agtb'}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'gt', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'gt', port: 'b'}},
            {from: {node: 'gt', port: 'out'}, to: {node: 'agtb', port: 'in'}},
            {from: {node: 'gt', port: 'out'}, to: {node: 'm', port: 'sel'}},
            {from: {node: 'a', port: 'out'}, to: {node: 'm', port: 'd1'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'm', port: 'd0'}},
            {from: {node: 'm', port: 'out'}, to: {node: 'big', port: 'in'}}
        ]
    };
    assert.equal(evalModel(model, {a: 11, b: 6}).outputs.agtb, 1, '11 > 6');
    assert.equal(evalModel(model, {a: 11, b: 6}).outputs.big, 11, 'mux picks the larger');
    assert.equal(evalModel(model, {a: 3, b: 8}).outputs.big, 8, 'mux picks the larger');
});

// ── multi-bit registers: a real counter counts (not stuck at 1) ──
test('a 4-bit register accumulates — q+1 counts 0..15 and wraps', () => {
    const model = {
        nodes: [
            {id: 'one', kind: 'const', value: 1, width: 4}, {id: 'q', kind: 'gate', type: 'dff', width: 4},
            {id: 'add', kind: 'gate', type: 'add', width: 4}, {id: 'out', kind: 'out', name: 'q', width: 4}
        ],
        edges: [
            {from: {node: 'q', port: 'out'}, to: {node: 'add', port: 'a'}},
            {from: {node: 'one', port: 'out'}, to: {node: 'add', port: 'b'}},
            {from: {node: 'add', port: 'out'}, to: {node: 'q', port: 'd'}},
            {from: {node: 'q', port: 'out'}, to: {node: 'out', port: 'in'}}
        ]
    };
    let st = {}; const seen = [];
    for (let i = 0; i < 18; i++) { seen.push(evalModel(model, {}, st).outputs.q); st = stepClock(model, {}, st); }
    assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1], 'counts and wraps at 16');
});

test('a 1-bit toggle flip-flop still toggles after the register fix', () => {
    const model = {
        nodes: [{id: 'one', kind: 'const', value: 1}, {id: 't', kind: 'gate', type: 'tff'}, {id: 'q', kind: 'out', name: 'q'}],
        edges: [{from: {node: 'one', port: 'out'}, to: {node: 't', port: 't'}},
            {from: {node: 't', port: 'out'}, to: {node: 'q', port: 'in'}}]
    };
    let st = {}; const seen = [];
    for (let i = 0; i < 6; i++) { seen.push(evalModel(model, {}, st).outputs.q); st = stepClock(model, {}, st); }
    assert.deepEqual(seen, [0, 1, 0, 1, 0, 1]);
});
