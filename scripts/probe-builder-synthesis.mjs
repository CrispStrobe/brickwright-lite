/**
 * ORACLE: the gate builder's generated Verilog is REAL — it synthesises and
 * places-and-routes on the actual toolchain, not just parses in our heads.
 *
 * For each of several designs built as gate models, this generates the Verilog +
 * constraints exactly as the tab does, POSTs them to the deployed bw-synth
 * (Yosys + nextpnr + Apicula — the reference toolchain), and asserts the service
 * returns a netlist AND a bitstream. If the codegen ever emits Verilog that does
 * not synthesise, this fails by name.
 *
 * Needs the network + the deployed service, so it is a probe SCRIPT (like
 * probe-hosted-synth.mjs), not a unit gate:
 *   BW_SYNTHESIS_ENDPOINT=https://synth.crispstro.be/api node scripts/probe-builder-synthesis.mjs
 *
 * @module
 */
import {modelToVerilog, modelToCst} from '../overlay/scratch-gui/src/lib/bw-fpga/gate-builder.js';

const ENDPOINT = process.env.BW_SYNTHESIS_ENDPOINT || 'https://synth.crispstro.be/api';
const TARGET = {family: 'GW2A-18C', device: 'GW2AR-LV18QN88C8/I7', vopt: 'family'};

// A half-adder subcircuit reused, plus a couple of flat designs — enough shapes
// (gates, an instance/module, a flip-flop) to exercise the generator's paths.
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

const DESIGNS = {
    // combinational: y = a & b
    'AND gate': {
        nodes: [
            {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'},
            {id: 'g', kind: 'gate', type: 'and'}, {id: 'y', kind: 'out', name: 'y'}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'g', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'g', port: 'b'}},
            {from: {node: 'g', port: 'out'}, to: {node: 'y', port: 'in'}}
        ]
    },
    // sequential: a D flip-flop
    'D flip-flop': {
        nodes: [
            {id: 'ck', kind: 'in', name: 'clk'}, {id: 'd', kind: 'in', name: 'd'},
            {id: 'f', kind: 'gate', type: 'dff'}, {id: 'q', kind: 'out', name: 'q'}
        ],
        edges: [
            {from: {node: 'd', port: 'out'}, to: {node: 'f', port: 'd'}},
            {from: {node: 'ck', port: 'out'}, to: {node: 'f', port: 'clk'}},
            {from: {node: 'f', port: 'out'}, to: {node: 'q', port: 'in'}}
        ]
    },
    // memory: a synchronous 4 x 4 single-port RAM (Yosys infers a $mem; the read is
    // registered). Fits the header pins once ports expand per-bit (bus CST).
    'sync RAM 4x4 (fits the header pins)': {
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
    },
    // hierarchy: a full adder from two half-adders + an OR
    'full adder (2 half-adders)': {
        modules: [HALF_ADDER],
        nodes: [
            {id: 'a', kind: 'in', name: 'a'}, {id: 'b', kind: 'in', name: 'b'}, {id: 'c', kind: 'in', name: 'cin'},
            {id: 'h1', kind: 'instance', module: 'half_adder'},
            {id: 'h2', kind: 'instance', module: 'half_adder'},
            {id: 'or', kind: 'gate', type: 'or'},
            {id: 'sum', kind: 'out', name: 'sum'}, {id: 'cout', kind: 'out', name: 'cout'}
        ],
        edges: [
            {from: {node: 'a', port: 'out'}, to: {node: 'h1', port: 'a'}},
            {from: {node: 'b', port: 'out'}, to: {node: 'h1', port: 'b'}},
            {from: {node: 'h1', port: 'sum'}, to: {node: 'h2', port: 'a'}},
            {from: {node: 'c', port: 'out'}, to: {node: 'h2', port: 'b'}},
            {from: {node: 'h2', port: 'sum'}, to: {node: 'sum', port: 'in'}},
            {from: {node: 'h1', port: 'carry'}, to: {node: 'or', port: 'a'}},
            {from: {node: 'h2', port: 'carry'}, to: {node: 'or', port: 'b'}},
            {from: {node: 'or', port: 'out'}, to: {node: 'cout', port: 'in'}}
        ]
    }
};

let failed = 0;
for (const [name, model] of Object.entries(DESIGNS)) {
    const {verilog, problems} = modelToVerilog(model, {moduleName: 'design'});
    const {cst} = modelToCst(model);
    if (problems.length) { console.log(`FAIL  ${name}: codegen problems ${JSON.stringify(problems)}`); failed++; continue; }
    let body;
    try {
        const res = await fetch(`${ENDPOINT}/synth`, {
            method: 'POST', headers: {'content-type': 'application/json'},
            body: JSON.stringify({contract: 1, target: TARGET, top: null, files: [{name: 'design.v', source: verilog}], constraints: cst})
        });
        body = await res.json();
    } catch (e) { console.log(`FAIL  ${name}: service unreachable ${e.message}`); failed++; continue; }
    const ok = body.ok !== false && (body.simNetlist || body.netlist) && body.bitstream;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ok=${body.ok !== false} netlist=${!!(body.simNetlist || body.netlist)} bitstream=${!!body.bitstream}${ok ? '' : ' — ' + (body.reason || body.code || '')}`);
    if (!ok) failed++;
}
console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS — every gate-built design synthesised on the real toolchain');
process.exit(failed ? 1 : 0);
