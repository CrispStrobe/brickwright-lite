/**
 * The gate builder's Verilog generator — the part that must be correct, because
 * it feeds the real toolchain. A model of gates and wires becomes structural
 * Verilog; an unconnected input is tied low WITH a named problem rather than
 * emitting illegal HDL; a flip-flop is clocked. Pure, so no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {modelToVerilog, modelToCst, inputPorts, hasOutput, GATE_DEFS, parseVerilogPorts} from
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

test('modelToCst places each I/O on a pin — a clock on 4, outputs on LED pins', () => {
    const model = {
        nodes: [
            {id: 'ck', kind: 'in', name: 'clk'}, {id: 'd', kind: 'in', name: 'd'},
            {id: 'g', kind: 'gate', type: 'dff'}, {id: 'q', kind: 'out', name: 'led'}
        ],
        edges: []
    };
    const {cst, problems} = modelToCst(model);
    assert.deepEqual(problems, []);
    assert.match(cst, /IO_LOC "clk" 4;/, 'a clock-named input goes to pin 4');
    assert.match(cst, /IO_LOC "led" 15;/, 'the first output goes to the first LED pin');
    assert.match(cst, /IO_LOC "d" 74;/, 'a non-clock input goes to a spare header pin');
    assert.match(cst, /IO_PORT "led" IO_TYPE=LVCMOS33;/, 'each pin gets a level constraint');
    // gates are not ports and must not be placed
    assert.doesNotMatch(cst, /"g"/);
});

// ── hierarchy: a subcircuit becomes a module, reused via instances ──
const HALF_ADDER = {
    name: 'half_adder',
    nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
        {id: 'x', kind: 'gate', type: 'xor'}, {id: 'c', kind: 'gate', type: 'and'},
        {id: 's', kind: 'out', name: 'sum'}, {id: 'co', kind: 'out', name: 'carry'}
    ],
    edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 'x', port: 'a'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'x', port: 'b'}},
        {from: {node: 'a', port: 'out'}, to: {node: 'c', port: 'a'}},
        {from: {node: 'b', port: 'out'}, to: {node: 'c', port: 'b'}},
        {from: {node: 'x', port: 'out'}, to: {node: 's', port: 'in'}},
        {from: {node: 'c', port: 'out'}, to: {node: 'co', port: 'in'}}
    ]
};

test('a subcircuit is emitted as its own module and instantiated in the top', () => {
    const model = {
        modules: [HALF_ADDER],
        nodes: [
            {id: 'i1', kind: 'in', name: 'p'}, {id: 'i2', kind: 'in', name: 'q'},
            {id: 'ha', kind: 'instance', module: 'half_adder'},
            {id: 'o1', kind: 'out', name: 's'}, {id: 'o2', kind: 'out', name: 'cout'}
        ],
        edges: [
            {from: {node: 'i1', port: 'out'}, to: {node: 'ha', port: 'a'}},
            {from: {node: 'i2', port: 'out'}, to: {node: 'ha', port: 'b'}},
            {from: {node: 'ha', port: 'sum'}, to: {node: 'o1', port: 'in'}},
            {from: {node: 'ha', port: 'carry'}, to: {node: 'o2', port: 'in'}}
        ]
    };
    const {verilog, problems} = modelToVerilog(model);
    assert.deepEqual(problems, []);
    assert.match(verilog, /module half_adder\(input a, input b, output sum, output carry\);/);
    assert.match(verilog, /assign w_x = a \^ b;/, 'the subcircuit body is generated');
    // the top instantiates it, wiring the parent nets to the module ports
    assert.match(verilog, /half_adder ha\(\.a\(p\), \.b\(q\), \.sum\(w_ha_sum\), \.carry\(w_ha_carry\)\);/);
    assert.match(verilog, /assign s = w_ha_sum;/, 'an instance output drives its own wire');
});

test('two instances of a subcircuit get independent wires (a full-adder from two half-adders)', () => {
    const model = {
        modules: [HALF_ADDER],
        nodes: [
            {id: 'h1', kind: 'instance', module: 'half_adder'},
            {id: 'h2', kind: 'instance', module: 'half_adder'},
            {id: 'a', kind: 'in', name: 'a'}, {id: 'o', kind: 'out', name: 'y'}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'h1', port: 'a'}},
            {from: {node: 'h1', port: 'sum'}, to: {node: 'h2', port: 'a'}},
            {from: {node: 'h2', port: 'sum'}, to: {node: 'o', port: 'in'}}
        ]
    };
    const {verilog} = modelToVerilog(model);
    assert.match(verilog, /wire w_h1_sum;/);
    assert.match(verilog, /wire w_h2_sum;/, 'each instance has its own output wires');
    assert.match(verilog, /half_adder h2\(\.a\(w_h1_sum\)/, 'one instance feeds the next');
});

test('an instance of an unknown module is a named problem', () => {
    const {problems} = modelToVerilog({
        nodes: [{id: 'u', kind: 'instance', module: 'nope'}, {id: 'o', kind: 'out', name: 'y'}],
        edges: [{from: {node: 'u', port: 'out'}, to: {node: 'o', port: 'in'}}]
    });
    assert.ok(problems.some(p => p.code === 'unknown-module'));
});

// ── buses: a multi-bit port/gate declares its width ──
test('a multi-bit input, gate and output declare [N-1:0]', () => {
    const model = {
        nodes: [
            {id: 'a', kind: 'in', name: 'a', width: 4}, {id: 'b', kind: 'in', name: 'b', width: 4},
            {id: 'g', kind: 'gate', type: 'and', width: 4}, {id: 'y', kind: 'out', name: 'y', width: 4}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'g', port: 'b'}},
            {from: {node: 'g', port: 'out'}, to: {node: 'y', port: 'in'}}
        ]
    };
    const {verilog} = modelToVerilog(model);
    assert.match(verilog, /input \[3:0\] a, input \[3:0\] b, output \[3:0\] y/);
    assert.match(verilog, /wire \[3:0\] w_g;/);
    assert.match(verilog, /assign w_g = a & b;/, 'the operator is bit-parallel over the bus');
});

test('a bus port is constrained one pin per bit (a single pin would fail P&R)', () => {
    const {cst} = modelToCst({nodes: [
        {id: 'i', kind: 'in', name: 'sw', width: 2},
        {id: 'o', kind: 'out', name: 'y', width: 4}
    ]});
    // the 4-bit output takes four LED pins, as name[i]
    assert.match(cst, /IO_LOC "y\[0\]" 15;/);
    assert.match(cst, /IO_LOC "y\[3\]" 18;/);
    // the 2-bit input takes two spare pins
    assert.match(cst, /IO_LOC "sw\[0\]" 74;/);
    assert.match(cst, /IO_LOC "sw\[1\]" 76;/);
    // a 1-bit clock still takes pin 4 by name (no bit index)
    const clk = modelToCst({nodes: [{id: 'c', kind: 'in', name: 'clk'}]}).cst;
    assert.match(clk, /IO_LOC "clk" 4;/);
    assert.doesNotMatch(clk, /clk\[/);
});

test('a memory node emits a synchronous single-port RAM (Yosys infers a $mem)', () => {
    const model = {nodes: [
        {id: 'clk', kind: 'in', name: 'clk'}, {id: 'a', kind: 'in', name: 'addr', width: 4},
        {id: 'd', kind: 'in', name: 'din', width: 8}, {id: 'we', kind: 'in', name: 'we'},
        {id: 'ram', kind: 'memory', dataWidth: 8, addrWidth: 4},
        {id: 'o', kind: 'out', name: 'q', width: 8}
    ], edges: [
        {from: {node: 'clk', port: 'out'}, to: {node: 'ram', port: 'clk'}},
        {from: {node: 'a', port: 'out'}, to: {node: 'ram', port: 'addr'}},
        {from: {node: 'd', port: 'out'}, to: {node: 'ram', port: 'din'}},
        {from: {node: 'we', port: 'out'}, to: {node: 'ram', port: 'we'}},
        {from: {node: 'ram', port: 'dout'}, to: {node: 'o', port: 'in'}}
    ]};
    const {verilog, problems} = modelToVerilog(model);
    assert.deepEqual(problems, []);
    assert.match(verilog, /reg \[7:0\] mem_ram \[0:15\];/, 'a 16 x 8-bit reg array');
    assert.match(verilog, /if \(we\) mem_ram\[addr\] <= din;/, 'write on write-enable');
    assert.match(verilog, /w_ram <= mem_ram\[addr\];/, 'a registered (synchronous) read');
    assert.match(verilog, /assign q = w_ram;/, 'the read data drives the output');
});

test('a memory with no clock wired is a named problem', () => {
    const {problems} = modelToVerilog({nodes: [
        {id: 'ram', kind: 'memory'}, {id: 'o', kind: 'out', name: 'q'}
    ], edges: [{from: {node: 'ram', port: 'dout'}, to: {node: 'o', port: 'in'}}]});
    assert.ok(problems.some(p => p.code === 'memory-no-clock'));
});

test('constant, buffer and controlled-inverter emit the right Verilog', () => {
    const model = {nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'e', kind: 'in', name: 'e'},
        {id: 'k', kind: 'const', value: 1},
        {id: 'b', kind: 'gate', type: 'buffer'}, {id: 'c', kind: 'gate', type: 'cinv'},
        {id: 'yb', kind: 'out', name: 'yb'}, {id: 'yc', kind: 'out', name: 'yc'}, {id: 'yk', kind: 'out', name: 'yk'}
    ], edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 'b', port: 'a'}}, {from: {node: 'b', port: 'out'}, to: {node: 'yb', port: 'in'}},
        {from: {node: 'a', port: 'out'}, to: {node: 'c', port: 'a'}}, {from: {node: 'e', port: 'out'}, to: {node: 'c', port: 'inv'}},
        {from: {node: 'c', port: 'out'}, to: {node: 'yc', port: 'in'}},
        {from: {node: 'k', port: 'out'}, to: {node: 'yk', port: 'in'}}
    ]};
    const {verilog, problems} = modelToVerilog(model);
    assert.deepEqual(problems, []);
    assert.match(verilog, /assign w_b = a;/, 'buffer passes through');
    assert.match(verilog, /assign w_c = e \? ~a : a;/, 'controlled inverter');
    assert.match(verilog, /assign yk = 1'b1;/, 'a constant drives a literal');
});

test('a Code block is a raw-Verilog module — emitted verbatim and instantiated', () => {
    const code = 'module adder8(input [7:0] a, input [7:0] b, output [7:0] sum);\n  assign sum = a + b;\nendmodule';
    const {name, ports} = parseVerilogPorts(code);
    assert.equal(name, 'adder8');
    assert.deepEqual(ports, [{name: 'a', dir: 'in', width: 8}, {name: 'b', dir: 'in', width: 8}, {name: 'sum', dir: 'out', width: 8}]);
    const model = {
        modules: [{name, verilog: code, ports}],
        nodes: [{id: 'a', kind: 'in', name: 'a', width: 8}, {id: 'b', kind: 'in', name: 'b', width: 8},
            {id: 'u', kind: 'instance', module: 'adder8'}, {id: 's', kind: 'out', name: 'sum', width: 8}],
        edges: [{from: {node: 'a', port: 'out'}, to: {node: 'u', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'u', port: 'b'}},
            {from: {node: 'u', port: 'sum'}, to: {node: 's', port: 'in'}}]
    };
    const {verilog, problems} = modelToVerilog(model);
    assert.deepEqual(problems, []);
    assert.match(verilog, /module adder8\(input \[7:0\] a, input \[7:0\] b, output \[7:0\] sum\);/, 'emitted verbatim');
    assert.match(verilog, /adder8 u\(\.a\(a\), \.b\(b\), \.sum\(w_u_sum\)\);/, 'and instantiated');
});

test('parseVerilogPorts handles shared-keyword ports and bus widths', () => {
    assert.deepEqual(parseVerilogPorts('module g(input a, b, output y);').ports,
        [{name: 'a', dir: 'in', width: 1}, {name: 'b', dir: 'in', width: 1}, {name: 'y', dir: 'out', width: 1}]);
    assert.equal(parseVerilogPorts('module m(output [3:0] q);').ports[0].width, 4);
});

test('a tunnel is a NAMED net — same-named tunnels share one wire, no drawn edge', () => {
    const model = {nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 't1', kind: 'tunnel', name: 'sig'},
        {id: 't2', kind: 'tunnel', name: 'sig'}, {id: 'y', kind: 'out', name: 'y'}
    ], edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 't1', port: 'in'}},
        {from: {node: 't2', port: 'out'}, to: {node: 'y', port: 'in'}}
    ]};
    const {verilog, problems} = modelToVerilog(model);
    assert.deepEqual(problems, []);
    assert.equal((verilog.match(/wire w_tun_sig;/g) || []).length, 1, 'the net is declared once');
    assert.match(verilog, /assign w_tun_sig = a;/, 'driven where the signal enters');
    assert.match(verilog, /assign y = w_tun_sig;/, 'read where it exits — no wire between the tunnels');
});

test('a tunnel driven from two places is a named problem', () => {
    const {problems} = modelToVerilog({nodes: [
        {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
        {id: 't1', kind: 'tunnel', name: 'n'}, {id: 't2', kind: 'tunnel', name: 'n'}, {id: 'y', kind: 'out', name: 'y'}
    ], edges: [
        {from: {node: 'a', port: 'out'}, to: {node: 't1', port: 'in'}},
        {from: {node: 'b', port: 'out'}, to: {node: 't2', port: 'in'}},
        {from: {node: 't1', port: 'out'}, to: {node: 'y', port: 'in'}}
    ]});
    assert.ok(problems.some(p => p.code === 'tunnel-multiple-drivers'));
});
