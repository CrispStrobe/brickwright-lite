/**
 * The gate builder's Verilog generator — the part that must be correct, because
 * it feeds the real toolchain. A model of gates and wires becomes structural
 * Verilog; an unconnected input is tied low WITH a named problem rather than
 * emitting illegal HDL; a flip-flop is clocked. Pure, so no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {modelToVerilog, inputPorts, hasOutput, GATE_DEFS} from
    '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

test('a two-input AND becomes a module with the expected ports and assign', () => {
    const model = {
        nodes: [
            {id: 'i1', kind: 'in', name: 'a'},
            {id: 'i2', kind: 'in', name: 'b'},
            {id: 'g1', kind: 'gate', type: 'and'},
            {id: 'o1', kind: 'out', name: 'y'}
        ],
        edges: [
            {from: {node: 'i1', port: 'out'}, to: {node: 'g1', port: 'a'}},
            {from: {node: 'i2', port: 'out'}, to: {node: 'g1', port: 'b'}},
            {from: {node: 'g1', port: 'out'}, to: {node: 'o1', port: 'in'}}
        ]
    };
    const {verilog, problems} = modelToVerilog(model);
    assert.deepEqual(problems, [], 'a fully wired design has no problems');
    assert.match(verilog, /module design\(input a, input b, output y\);/);
    assert.match(verilog, /assign w_g1 = a & b;/);
    assert.match(verilog, /assign y = w_g1;/);
    assert.match(verilog, /endmodule/);
});

test('each gate type emits its operator, and inverting gates invert', () => {
    const one = type => {
        const model = {
            nodes: [
                {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
                {id: 'g', kind: 'gate', type}, {id: 'o', kind: 'out', name: 'y'}
            ],
            edges: [
                {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
                {from: {node: 'b', port: 'out'}, to: {node: 'g', port: 'b'}},
                {from: {node: 'g', port: 'out'}, to: {node: 'o', port: 'in'}}
            ]
        };
        return modelToVerilog(model).verilog;
    };
    assert.match(one('or'), /assign w_g = a \| b;/);
    assert.match(one('xor'), /assign w_g = a \^ b;/);
    assert.match(one('nand'), /assign w_g = ~\(a & b\);/);
    assert.match(one('nor'), /assign w_g = ~\(a \| b\);/);
});

test('a NOT gate takes one input', () => {
    const model = {
        nodes: [{id: 'a', kind: 'in', name: 'a'}, {id: 'g', kind: 'gate', type: 'not'}, {id: 'o', kind: 'out', name: 'y'}],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
            {from: {node: 'g', port: 'out'}, to: {node: 'o', port: 'in'}}
        ]
    };
    assert.match(modelToVerilog(model).verilog, /assign w_g = ~a;/);
    assert.deepEqual(inputPorts({kind: 'gate', type: 'not'}), ['a']);
});

test('a flip-flop is a clocked reg, and needs a clock', () => {
    const wired = {
        nodes: [
            {id: 'ck', kind: 'in', name: 'clk'}, {id: 'd', kind: 'in', name: 'd'},
            {id: 'f', kind: 'gate', type: 'dff'}, {id: 'o', kind: 'out', name: 'q'}
        ],
        edges: [
            {from: {node: 'd', port: 'out'}, to: {node: 'f', port: 'd'}},
            {from: {node: 'ck', port: 'out'}, to: {node: 'f', port: 'clk'}},
            {from: {node: 'f', port: 'out'}, to: {node: 'o', port: 'in'}}
        ]
    };
    const v = modelToVerilog(wired).verilog;
    assert.match(v, /reg w_f;/);
    assert.match(v, /always @\(posedge clk\) w_f <= d;/);
    assert.match(v, /assign q = w_f;/);

    // No clock wired -> a named problem, not silent.
    const noClock = {...wired, edges: wired.edges.filter(e => e.to.port !== 'clk')};
    const {problems} = modelToVerilog(noClock);
    assert.ok(problems.some(p => p.code === 'dff-no-clock'), 'a clockless flip-flop is reported');
});

test('an unconnected input ties low WITH a named problem, never illegal Verilog', () => {
    const model = {
        nodes: [{id: 'a', kind: 'in', name: 'a'}, {id: 'g', kind: 'gate', type: 'and'}, {id: 'o', kind: 'out', name: 'y'}],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
            // b is not wired
            {from: {node: 'g', port: 'out'}, to: {node: 'o', port: 'in'}}
        ]
    };
    const {verilog, problems} = modelToVerilog(model);
    assert.match(verilog, /assign w_g = a & 1'b0;/, "the missing input is tied low, not left blank");
    assert.ok(problems.some(p => p.code === 'unconnected-input' && /"b"/.test(p.reason)));
});

test('a design with no output is reported', () => {
    const {problems} = modelToVerilog({nodes: [{id: 'a', kind: 'in', name: 'a'}], edges: []});
    assert.ok(problems.some(p => p.code === 'no-output'));
});

test('odd names are sanitised to legal identifiers', () => {
    const model = {
        nodes: [{id: 'a', kind: 'in', name: '2 bad!'}, {id: 'o', kind: 'out', name: 'y'}],
        edges: [{from: {node: 'a', port: 'out'}, to: {node: 'o', port: 'in'}}]
    };
    const v = modelToVerilog(model).verilog;
    assert.doesNotMatch(v, /2 bad!/, 'the raw odd name must not reach the HDL');
    assert.match(v, /input in_a/, 'a name that cannot be an identifier falls back to the id');
});

test('the port helpers agree with the gate defs', () => {
    assert.equal(hasOutput({kind: 'in'}), true);
    assert.equal(hasOutput({kind: 'out'}), false);
    assert.deepEqual(inputPorts({kind: 'out'}), ['in']);
    assert.deepEqual(GATE_DEFS.and.ins, ['a', 'b']);
});
