/**
 * The React Flow ↔ gate-model bridge: React Flow owns the interactive canvas,
 * but the design that synthesises is OUR model. The translation must round-trip
 * faithfully — every node's kind/type/name/width, every edge's ports — and it
 * must feed the tested Verilog generator unchanged. Pure, so no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {reactFlowToModel, modelToReactFlow} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder-rf.js';
import {modelToVerilog} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

const MODEL = {
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

test('React Flow state maps back to a model the generator accepts', () => {
    const {nodes, edges} = modelToReactFlow(MODEL);
    // React Flow shape: io/gate node types, handles carry the ports
    assert.equal(nodes.find(n => n.id === 'g').type, 'gate');
    assert.equal(nodes.find(n => n.id === 'a').type, 'io');
    const e = edges.find(x => x.source === 'g');
    assert.equal(e.sourceHandle, 'out');
    assert.equal(e.targetHandle, 'in');
    // and back to our model, then to Verilog
    const model = reactFlowToModel(nodes, edges);
    const {verilog, problems} = modelToVerilog(model);
    assert.deepEqual(problems, []);
    assert.match(verilog, /assign w_g = a & b;/);
    assert.match(verilog, /assign y = w_g;/);
});

test('a round-trip preserves kind, gate type, names and bus width', () => {
    const wide = {
        nodes: [{id: 'i', kind: 'in', name: 'bus', width: 8}, {id: 'o', kind: 'out', name: 'z', width: 8}],
        edges: [{from: {node: 'i', port: 'out'}, to: {node: 'o', port: 'in'}}]
    };
    const rf = modelToReactFlow(wide);
    const back = reactFlowToModel(rf.nodes, rf.edges);
    assert.equal(back.nodes[0].width, 8, 'a bus width survives the round trip');
    assert.equal(back.nodes[0].name, 'bus');
    assert.equal(back.nodes[0].kind, 'in');
    assert.deepEqual(back.edges[0], {from: {node: 'i', port: 'out'}, to: {node: 'o', port: 'in'}});
});

test('an instance node carries its module reference across the bridge', () => {
    const rf = modelToReactFlow({
        nodes: [{id: 'u', kind: 'instance', module: 'half_adder'}],
        edges: []
    });
    assert.equal(rf.nodes[0].type, 'instance');
    assert.equal(rf.nodes[0].data.module, 'half_adder');
    const back = reactFlowToModel(rf.nodes, rf.edges);
    assert.equal(back.nodes[0].module, 'half_adder');
    assert.equal(back.nodes[0].kind, 'instance');
});

test('missing handles default to out/in, so a simple wire still maps', () => {
    const model = reactFlowToModel(
        [{id: 'a', data: {kind: 'in', name: 'a'}}, {id: 'o', data: {kind: 'out', name: 'y'}}],
        [{source: 'a', target: 'o'}]
    );
    assert.deepEqual(model.edges[0], {from: {node: 'a', port: 'out'}, to: {node: 'o', port: 'in'}});
});

test('a 1-bit node does not carry a width field (kept minimal)', () => {
    const back = reactFlowToModel([{id: 'a', data: {kind: 'in', name: 'a', width: 1}}], []);
    assert.equal('width' in back.nodes[0], false, 'width 1 is the default and stays implicit');
});

// ── hierarchy on the canvas: a saved subcircuit library composes ──
test('reactFlowToModel carries a subcircuit library through to the generator', () => {
    const halfAdder = {
        name: 'half_adder',
        nodes: [
            {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
            {id: 'x', kind: 'gate', type: 'xor'}, {id: 's', kind: 'out', name: 'sum'}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'x', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'x', port: 'b'}},
            {from: {node: 'x', port: 'out'}, to: {node: 's', port: 'in'}}
        ]
    };
    const rfNodes = [
        {id: 'i', data: {kind: 'in', name: 'p'}},
        {id: 'j', data: {kind: 'in', name: 'q'}},
        {id: 'u', data: {kind: 'instance', module: 'half_adder'}},
        {id: 'o', data: {kind: 'out', name: 'y'}}
    ];
    const rfEdges = [
        {source: 'i', target: 'u', sourceHandle: 'out', targetHandle: 'a'},
        {source: 'j', target: 'u', sourceHandle: 'out', targetHandle: 'b'},
        {source: 'u', target: 'o', sourceHandle: 'sum', targetHandle: 'in'}
    ];
    const model = reactFlowToModel(rfNodes, rfEdges, [halfAdder]);
    assert.equal(model.modules.length, 1, 'the library travels with the design');
    const {verilog, problems} = modelToVerilog(model);
    assert.deepEqual(problems, []);
    assert.match(verilog, /module half_adder\(/, 'the subcircuit is emitted');
    assert.match(verilog, /half_adder u\(\.a\(p\), \.b\(q\), \.sum\(w_u_sum\)\);/,
        'instantiated in the top with both inputs wired');
});

test('no library means a plain flat model (no modules key)', () => {
    const m = reactFlowToModel([{id: 'a', data: {kind: 'in', name: 'a'}}], []);
    assert.equal('modules' in m, false);
});

test('a memory node round-trips kind + geometry and generates a RAM', () => {
    const model = {
        nodes: [
            {id: 'clk', kind: 'in', name: 'clk'}, {id: 'a', kind: 'in', name: 'addr', width: 2},
            {id: 'd', kind: 'in', name: 'din', width: 4}, {id: 'we', kind: 'in', name: 'we'},
            {id: 'ram', kind: 'memory', dataWidth: 4, addrWidth: 2},
            {id: 'o', kind: 'out', name: 'q', width: 4}
        ],
        edges: [
            {from: {node: 'clk', port: 'out'}, to: {node: 'ram', port: 'clk'}},
            {from: {node: 'a', port: 'out'}, to: {node: 'ram', port: 'addr'}},
            {from: {node: 'd', port: 'out'}, to: {node: 'ram', port: 'din'}},
            {from: {node: 'we', port: 'out'}, to: {node: 'ram', port: 'we'}},
            {from: {node: 'ram', port: 'dout'}, to: {node: 'o', port: 'in'}}
        ]
    };
    const rf = modelToReactFlow(model);
    const ramRf = rf.nodes.find(n => n.id === 'ram');
    assert.equal(ramRf.type, 'memory', 'the memory kind maps to the memory RF node type');
    assert.equal(ramRf.data.dataWidth, 4);
    assert.equal(ramRf.data.addrWidth, 2);
    // the dout→q wire survives with the memory output port name
    assert.ok(rf.edges.some(e => e.source === 'ram' && e.sourceHandle === 'dout'));

    const back = reactFlowToModel(rf.nodes, rf.edges);
    const ram = back.nodes.find(n => n.id === 'ram');
    assert.equal(ram.kind, 'memory');
    assert.equal(ram.dataWidth, 4);
    assert.equal(ram.addrWidth, 2);
    const {verilog, problems} = modelToVerilog(back);
    assert.deepEqual(problems, []);
    assert.match(verilog, /reg \[3:0\] mem_ram \[0:3\];/, 'a 4 x 4-bit RAM from the round-tripped model');
    assert.match(verilog, /w_ram <= mem_ram\[addr\];/, 'a registered read');
});
