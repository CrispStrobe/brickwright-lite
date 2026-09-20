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

test('memory geometry and hierarchy ports survive together on one canvas', () => {
    const ports = [{name: 'a', dir: 'in', width: 4}, {name: 'q', dir: 'out', width: 4}];
    const rf = modelToReactFlow({
        nodes: [
            {id: 'block', kind: 'instance', module: 'ram_block', ports},
            {id: 'ram', kind: 'memory', dataWidth: 4, addrWidth: 2}
        ],
        edges: []
    });
    const block = rf.nodes.find(n => n.id === 'block');
    const ram = rf.nodes.find(n => n.id === 'ram');
    assert.equal(block.type, 'instance');
    assert.deepEqual(block.data.ports, ports, 'resolving the RAM merge must not erase instance handles');
    assert.equal(ram.type, 'memory');
    assert.equal(ram.data.dataWidth, 4);
    assert.equal(ram.data.addrWidth, 2);
});

test('a constant node round-trips its value and drives a literal', () => {
    const rf = modelToReactFlow({nodes: [{id: 'k', kind: 'const', value: 0}, {id: 'y', kind: 'out', name: 'y'}],
        edges: [{from: {node: 'k', port: 'out'}, to: {node: 'y', port: 'in'}}]});
    assert.equal(rf.nodes.find(n => n.id === 'k').type, 'const', 'a const maps to the const RF node');
    const back = reactFlowToModel(rf.nodes, rf.edges);
    assert.equal(back.nodes.find(n => n.id === 'k').value, 0, 'value 0 survives (not dropped as falsy)');
    assert.match(modelToVerilog(back).verilog, /assign y = 1'b0;/);
});

test('a tunnel round-trips its net name and generates a shared net', () => {
    const rf = modelToReactFlow({
        nodes: [{id: 'a', kind: 'in', name: 'a'}, {id: 't1', kind: 'tunnel', name: 'clk'},
            {id: 't2', kind: 'tunnel', name: 'clk'}, {id: 'y', kind: 'out', name: 'y'}],
        edges: [{from: {node: 'a', port: 'out'}, to: {node: 't1', port: 'in'}},
            {from: {node: 't2', port: 'out'}, to: {node: 'y', port: 'in'}}]
    });
    assert.equal(rf.nodes.find(n => n.id === 't1').type, 'tunnel');
    assert.equal(rf.nodes.find(n => n.id === 't1').data.name, 'clk');
    const back = reactFlowToModel(rf.nodes, rf.edges);
    assert.equal(back.nodes.find(n => n.id === 't1').name, 'clk');
    assert.match(modelToVerilog(back).verilog, /assign y = w_tun_clk;/);
});

test('display instruments (LED, seven-segment) are excluded from the synthesised model', () => {
    const rfNodes = [
        {id: 'a', data: {kind: 'in', name: 'a'}},
        {id: 'g', data: {kind: 'gate', gtype: 'not'}},
        {id: 'led', data: {kind: 'led'}},
        {id: 'disp', data: {kind: 'seg7'}}
    ];
    const rfEdges = [
        {source: 'a', target: 'g', sourceHandle: 'out', targetHandle: 'a'},
        {source: 'g', target: 'led', sourceHandle: 'out', targetHandle: 'in'},
        {source: 'a', target: 'disp', sourceHandle: 'out', targetHandle: 'd0'}
    ];
    const model = reactFlowToModel(rfNodes, rfEdges);
    assert.deepEqual(model.nodes.map(n => n.id), ['a', 'g']); // instruments dropped
    assert.equal(model.edges.length, 1); // only a→g survives; edges into instruments dropped
    assert.equal(model.edges[0].to.node, 'g');
});

// ── display kinds survive the bridge (loaded/template models render correctly) ──
test('modelToReactFlow maps display instruments to their own node types', () => {
    const model = {nodes: [
        {id: 'l', kind: 'led'}, {id: 's', kind: 'seg7'}, {id: 'b', kind: 'ledbank', bits: 8}
    ], edges: []};
    const rf = modelToReactFlow(model);
    const type = id => rf.nodes.find(n => n.id === id).type;
    assert.equal(type('l'), 'led'); assert.equal(type('s'), 'seg7'); assert.equal(type('b'), 'ledbank');
    assert.equal(rf.nodes.find(n => n.id === 'b').data.bits, 8, 'the bank width round-trips');
});

// ── sequential/datapath templates: they synthesise AND count ──
import {EXAMPLES} from '../overlay/scratch-gui/src/lib/bw-fpga/examples.js';
import {BUILTINS} from '../overlay/scratch-gui/src/lib/bw-fpga/builtins.js';
import {evalModel, stepClock} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-eval.js';

test('every model-bearing example synthesises to legal HDL', () => {
    for (const ex of EXAMPLES.filter(e => e.model && e.model.nodes)) {
        assert.deepEqual(modelToVerilog(ex.model).problems, [], `${ex.id} must synthesise cleanly`);
    }
});

test('the counter example and the counter→7-seg block actually count', () => {
    const runCount = model => {
        let st = {}; const seen = [];
        for (let i = 0; i < 6; i++) { seen.push(evalModel(model, {}, st).outputs.count); st = stepClock(model, {}, st); }
        return seen;
    };
    assert.deepEqual(runCount(EXAMPLES.find(e => e.id === 'counter4').model), [0, 1, 2, 3, 4, 5]);
    const c7 = BUILTINS.find(b => b.id === 'counter7seg');
    assert.deepEqual(runCount(c7.model), [0, 1, 2, 3, 4, 5]);
    // its seg7 is a display instrument — dropped from the synthesised netlist
    const back = reactFlowToModel(modelToReactFlow(c7.model).nodes, modelToReactFlow(c7.model).edges);
    assert.ok(!back.nodes.some(n => n.kind === 'seg7'), 'the display is not emitted as HDL');
    assert.deepEqual(modelToVerilog(back).problems, [], 'and the rest synthesises');
});

// ── copy/paste: cloning a selection ──
import {cloneSelection} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder-rf.js';

test('cloneSelection remaps ids, offsets positions, and keeps only internal edges', () => {
    const sel = [
        {id: 'a', position: {x: 10, y: 20}, data: {kind: 'in', name: 'a'}},
        {id: 'g', position: {x: 100, y: 20}, data: {kind: 'gate', gtype: 'not'}}
    ];
    const edges = [
        {id: 'e1', source: 'a', target: 'g', sourceHandle: 'out', targetHandle: 'a'}, // internal → copied
        {id: 'e2', source: 'g', target: 'y', sourceHandle: 'out', targetHandle: 'in'}  // to non-selected → dropped
    ];
    let ni = 0; let ei = 0;
    const {nodes, edges: ce} = cloneSelection(sel, edges, {dx: 40, dy: 40}, () => `n${ni++}`, () => `c${ei++}`);
    assert.equal(nodes.length, 2);
    assert.deepEqual(nodes.map(n => n.id), ['n0', 'n1'], 'fresh ids');
    assert.deepEqual(nodes[0].position, {x: 50, y: 60}, 'offset applied');
    assert.ok(nodes.every(n => n.selected), 'clones are selected');
    assert.equal(ce.length, 1, 'only the internal edge is copied');
    assert.equal(ce[0].source, 'n0'); assert.equal(ce[0].target, 'n1'); // remapped
    assert.equal(nodes[0].data.name, 'a', 'node data is preserved');
});
