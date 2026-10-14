/**
 * The schematic MODEL: a digitaljs `{devices, connectors}` graph becomes nodes
 * with sided ports and edges carrying their net name. This is the picture of a
 * synthesised design, so the model must be faithful — every gate a node, every
 * net an edge, inputs on the left and outputs on the right — and it must survive
 * an unrecognised cell rather than dropping it.
 *
 * Tested against a hand-written digitaljs circuit, so it needs no yosys2digitaljs
 * and no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSchematicModel, toElkGraph, NODE_SIZE} from
    '../overlay/scratch-gui/src/lib/bw-fpga/schematic.js';

// a AND b -> y, the shape yosys2digitaljs emits for one gate.
const AND_CIRCUIT = {
    devices: {
        dev0: {type: 'Input', net: 'a', bits: 1},
        dev1: {type: 'Input', net: 'b', bits: 1},
        dev2: {type: 'Output', net: 'y', bits: 1},
        dev3: {type: 'And', label: 'g1', bits: 1}
    },
    connectors: [
        {from: {id: 'dev0', port: 'out'}, to: {id: 'dev3', port: 'in1'}, name: 'a'},
        {from: {id: 'dev1', port: 'out'}, to: {id: 'dev3', port: 'in2'}, name: 'b'},
        {from: {id: 'dev3', port: 'out'}, to: {id: 'dev2', port: 'in'}, name: 'y'}
    ]
};

test('every device becomes a node and every connector an edge', () => {
    const m = buildSchematicModel(AND_CIRCUIT);
    assert.equal(m.nodes.length, 4, 'two inputs, one output, one gate');
    assert.equal(m.edges.length, 3, 'three nets');
    assert.deepEqual(m.problems, []);
});

test('inputs and outputs are labelled by their net; the gate carries a glyph', () => {
    const m = buildSchematicModel(AND_CIRCUIT);
    const byId = Object.fromEntries(m.nodes.map(n => [n.id, n]));
    assert.equal(byId.dev0.kind, 'input');
    assert.equal(byId.dev0.label, 'a', 'an input is named by its net');
    assert.equal(byId.dev2.kind, 'output');
    assert.equal(byId.dev2.label, 'y');
    assert.equal(byId.dev3.kind, 'gate');
    assert.equal(byId.dev3.glyph, '&', 'an AND gate draws as &');
    assert.equal(byId.dev3.inverting, false);
});

test('ports land on the correct side: outputs east, inputs west', () => {
    const m = buildSchematicModel(AND_CIRCUIT);
    const gate = m.nodes.find(n => n.id === 'dev3');
    const sides = Object.fromEntries(gate.ports.map(p => [p.name, p.side]));
    assert.equal(sides.in1, 'in');
    assert.equal(sides.in2, 'in');
    assert.equal(sides.out, 'out', 'the driver port is an output');
    const inp = m.nodes.find(n => n.id === 'dev0');
    assert.equal(inp.ports[0].side, 'out', 'an Input device DRIVES its net');
});

test('an edge carries its net name and endpoints as node.port ids', () => {
    const m = buildSchematicModel(AND_CIRCUIT);
    const e = m.edges.find(x => x.net === 'y');
    assert.ok(e, 'the output net is an edge');
    assert.equal(e.from.port, 'dev3.out');
    assert.equal(e.to.port, 'dev2.in');
});

test('a NOT gate is marked inverting; an unknown cell keeps its type as a label', () => {
    const m = buildSchematicModel({
        devices: {a: {type: 'Input', net: 'a'}, n: {type: 'Not'}, w: {type: 'Weirdo42'}, o: {type: 'Output', net: 'z'}},
        connectors: [
            {from: {id: 'a', port: 'out'}, to: {id: 'n', port: 'in'}, name: 'a'},
            {from: {id: 'n', port: 'out'}, to: {id: 'w', port: 'in'}, name: 't'},
            {from: {id: 'w', port: 'out'}, to: {id: 'o', port: 'in'}, name: 'z'}
        ]
    });
    assert.equal(m.nodes.find(n => n.type === 'Not').inverting, true);
    const unknown = m.nodes.find(n => n.type === 'Weirdo42');
    assert.equal(unknown.glyph, 'Weirdo42', 'an unrecognised cell is shown by name, never dropped');
});

test('an unconnected IO device still gets its single terminal port', () => {
    const m = buildSchematicModel({devices: {i: {type: 'Input', net: 'lonely'}}, connectors: []});
    const node = m.nodes[0];
    assert.equal(node.ports.length, 1);
    assert.equal(node.ports[0].side, 'out');
});

test('toElkGraph fixes port sides and carries every edge', () => {
    const m = buildSchematicModel(AND_CIRCUIT);
    const elk = toElkGraph(m);
    assert.equal(elk.children.length, 4);
    assert.equal(elk.edges.length, 3);
    const gate = elk.children.find(c => c.id === 'dev3');
    assert.equal(gate.properties['org.eclipse.elk.portConstraints'], 'FIXED_SIDE');
    const outPort = gate.ports.find(p => p.id === 'dev3.out');
    assert.equal(outPort.properties['org.eclipse.elk.port.side'], 'EAST');
    const inPort = gate.ports.find(p => p.id === 'dev3.in1');
    assert.equal(inPort.properties['org.eclipse.elk.port.side'], 'WEST');
    assert.ok(gate.width >= NODE_SIZE.gate.w);
});
