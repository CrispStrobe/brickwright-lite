/**
 * The generated-circuit layout: inputs on the left, the output on the right,
 * gates in between by depth, and nodes in a column never on top of each other.
 * Pure — no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {layerPositions} from '../overlay/scratch-gui/src/lib/bw-fpga/auto-layout.js';
import {synthesizeTruthTable, truthTableFrom} from '../overlay/scratch-gui/src/lib/bw-fpga/synthesize.js';

test('inputs sit left of gates, which sit left of the output', () => {
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
    const p = layerPositions(model);
    assert.equal(p.a.x, 0);
    assert.equal(p.b.x, 0);
    assert.ok(p.g.x > p.a.x, 'the gate is right of the inputs');
    assert.ok(p.y.x > p.g.x, 'the output is right of the gate');
    assert.notEqual(p.a.y, p.b.y, 'two inputs in the same column do not overlap');
});

test('every node in a shared column gets a distinct y (no overlaps)', () => {
    const model = synthesizeTruthTable(truthTableFrom(['a', 'b', 'c'], ['y'], r => ({y: (r.a + r.b + r.c) >= 2 ? 1 : 0})));
    const p = layerPositions(model);
    const byCol = {};
    for (const n of model.nodes) {
        const {x, y} = p[n.id];
        (byCol[x] = byCol[x] || []).push(y);
    }
    for (const [x, ys] of Object.entries(byCol)) {
        assert.equal(ys.length, new Set(ys).size, `column x=${x} has overlapping nodes`);
    }
    // Every node is placed.
    assert.equal(Object.keys(p).length, model.nodes.length);
});

test('a feedback cycle does not hang the layout', () => {
    // A flip-flop feeding back into its own logic: preds form a cycle.
    const model = {
        nodes: [{id: 'q', kind: 'gate', type: 'dff'}, {id: 'g', kind: 'gate', type: 'not'}],
        edges: [
            {from: {node: 'q', port: 'out'}, to: {node: 'g', port: 'a'}},
            {from: {node: 'g', port: 'out'}, to: {node: 'q', port: 'd'}}
        ]
    };
    const p = layerPositions(model); // must return, not spin
    assert.equal(Object.keys(p).length, 2);
});
