/**
 * Build logic by placing gates, and get Verilog back — Rung 3 of the FPGA
 * visual analog (schematic → waveforms → GATE BUILDER). This closes the loop:
 * a learner wires AND/OR/NOT/DFF on a canvas, and the design becomes real
 * Verilog they can synthesise, see as a schematic, watch as waveforms, and run
 * on the board — no text typed.
 *
 * This module is the pure core: the gate vocabulary, and the model → Verilog
 * generator. It knows nothing about React or SVG, so the code it emits is fully
 * testable — the part that must be correct, because it feeds the real toolchain.
 *
 * @module
 */

/**
 * The gate vocabulary. `ins` are the input port names (in draw order); every
 * gate drives one `out`. `expr(nets)` builds the combinational expression from
 * its input nets; a `seq` gate (the flip-flop) is clocked instead and has no
 * expr.
 */
export const GATE_DEFS = {
    and: {label: 'AND', glyph: '&', ins: ['a', 'b'], expr: n => `${n.a} & ${n.b}`},
    or: {label: 'OR', glyph: '≥1', ins: ['a', 'b'], expr: n => `${n.a} | ${n.b}`},
    xor: {label: 'XOR', glyph: '=1', ins: ['a', 'b'], expr: n => `${n.a} ^ ${n.b}`},
    nand: {label: 'NAND', glyph: '&', ins: ['a', 'b'], inverting: true, expr: n => `~(${n.a} & ${n.b})`},
    nor: {label: 'NOR', glyph: '≥1', ins: ['a', 'b'], inverting: true, expr: n => `~(${n.a} | ${n.b})`},
    xnor: {label: 'XNOR', glyph: '=1', ins: ['a', 'b'], inverting: true, expr: n => `~(${n.a} ^ ${n.b})`},
    not: {label: 'NOT', glyph: '1', ins: ['a'], inverting: true, expr: n => `~${n.a}`},
    dff: {label: 'DFF', glyph: 'DFF', ins: ['d', 'clk'], seq: true}
};

/** The input ports of a node (a gate's `ins`, an output's single `in`). Inputs
 *  and constants drive only, so they have none. */
export function inputPorts (node) {
    if (node.kind === 'gate') return (GATE_DEFS[node.type] || {ins: []}).ins;
    if (node.kind === 'out') return ['in'];
    return [];
}

/** Does this node drive a net (has an `out`)? Inputs and gates do; outputs sink. */
export function hasOutput (node) {
    return node.kind === 'in' || node.kind === 'gate';
}

// A legal Verilog identifier from a user-typed name; falls back to the id so a
// blank or odd name never emits broken HDL.
function ident (name, fallback) {
    const s = String(name || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
    return /^[A-Za-z_]/.test(s) ? s : fallback;
}

/**
 * Generate structural Verilog from a gate model.
 *
 * @param {{nodes: Array, edges: Array}} model
 *   nodes: {id, kind:'in'|'out'|'gate', type?, name?}
 *   edges: {from:{node, port:'out'}, to:{node, port}}
 * @param {{moduleName?: string}} [opts]
 * @returns {{verilog: string, problems: Array}}
 */
export function modelToVerilog (model, {moduleName = 'design'} = {}) {
    const nodes = (model && model.nodes) || [];
    const edges = (model && model.edges) || [];
    const problems = [];
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

    // Net name for whatever DRIVES a port. An input drives its own name; a gate
    // drives an internal wire; nothing else drives.
    const driverNet = node => {
        if (!node) return null;
        if (node.kind === 'in') return ident(node.name, `in_${node.id}`);
        if (node.kind === 'gate') return `w_${node.id}`;
        return null;
    };

    // For each sink port (a gate input, an output's `in`), the net feeding it.
    const feed = new Map(); // `${nodeId}.${port}` -> net
    for (const e of edges) {
        const src = byId[e.from && e.from.node];
        if (!src || !hasOutput(src)) { problems.push({code: 'edge-source-not-a-driver'}); continue; }
        feed.set(`${e.to.node}.${e.to.port}`, driverNet(src));
    }
    const netFor = (nodeId, port) => feed.get(`${nodeId}.${port}`) || null;

    const inputs = nodes.filter(n => n.kind === 'in');
    const outputs = nodes.filter(n => n.kind === 'out');
    const gates = nodes.filter(n => n.kind === 'gate');

    if (!outputs.length) problems.push({code: 'no-output', reason: 'Add at least one output so the design drives something.'});

    // Any unconnected input port is a floating signal; name it so the learner
    // can see which, and tie it low rather than emit illegal Verilog.
    const tieLow = (nodeId, port, who) => {
        const net = netFor(nodeId, port);
        if (net) return net;
        problems.push({code: 'unconnected-input',
            reason: `${who} has nothing wired to its "${port}" input, so it reads 0.`});
        return "1'b0";
    };

    const inNames = inputs.map(n => ident(n.name, `in_${n.id}`));
    const outNames = outputs.map(n => ident(n.name, `out_${n.id}`));
    const portDecls = [
        ...inNames.map(nm => `input ${nm}`),
        ...outNames.map(nm => `output ${nm}`)
    ];

    const lines = [];
    lines.push(`module ${ident(moduleName, 'design')}(${portDecls.join(', ')});`);

    // Combinational gates: a wire + a continuous assign (order-independent).
    const comb = gates.filter(g => GATE_DEFS[g.type] && !GATE_DEFS[g.type].seq);
    const seq = gates.filter(g => GATE_DEFS[g.type] && GATE_DEFS[g.type].seq);
    for (const g of comb) {
        const def = GATE_DEFS[g.type];
        const n = {};
        for (const port of def.ins) n[port] = tieLow(g.id, port, `${def.label} gate`);
        lines.push(`  wire w_${g.id};`);
        lines.push(`  assign w_${g.id} = ${def.expr(n)};`);
    }
    // Flip-flops: a reg clocked on their wired clock.
    for (const g of seq) {
        const d = tieLow(g.id, 'd', 'Flip-flop');
        const clk = netFor(g.id, 'clk');
        if (!clk) { problems.push({code: 'dff-no-clock', reason: 'A flip-flop needs a clock wired to its "clk" input.'}); }
        lines.push(`  reg w_${g.id};`);
        lines.push(`  always @(posedge ${clk || "1'b0"}) w_${g.id} <= ${d};`);
    }
    // Outputs.
    for (const o of outputs) {
        const net = tieLow(o.id, 'in', `Output "${ident(o.name, o.id)}"`);
        lines.push(`  assign ${ident(o.name, `out_${o.id}`)} = ${net};`);
    }
    lines.push('endmodule');

    return {verilog: lines.join('\n') + '\n', problems};
}

// Header pins for generated constraints, from the pins the shipped examples use
// (verified against the real Tang Nano 20K part). A named clock takes pin 4;
// outputs take LED-capable header pins; other inputs take spare header pins.
const OUT_PINS = [15, 16, 17, 18, 19, 20, 73];
const IN_PINS = [88, 74, 76, 77, 80, 81, 82, 83];

/**
 * Generate a matching Gowin .cst for a gate model, so the built design places
 * and routes. Without one the tab's default constraints — for a DIFFERENT
 * design's ports — reach nextpnr and it fails. Each input/output gets a pin:
 * a clock-named input pin 4, outputs the LED pins, other inputs spare pins.
 *
 * @param {{nodes: Array}} model
 * @returns {{cst: string, problems: Array}}
 */
export function modelToCst (model) {
    const nodes = (model && model.nodes) || [];
    const problems = [];
    const lines = [];
    let oi = 0;
    let ii = 0;
    const place = (nm, pin) => {
        lines.push(`IO_LOC "${nm}" ${pin};`);
        lines.push(`IO_PORT "${nm}" IO_TYPE=LVCMOS33;`);
    };
    for (const n of nodes) {
        if (n.kind === 'in') {
            const nm = ident(n.name, `in_${n.id}`);
            const pin = /clk|clock/i.test(n.name || '') ? 4 : IN_PINS[ii++];
            if (pin === undefined) { problems.push({code: 'out-of-pins', reason: `No spare pin for input "${nm}".`}); continue; }
            place(nm, pin);
        } else if (n.kind === 'out') {
            const nm = ident(n.name, `out_${n.id}`);
            const pin = OUT_PINS[oi++];
            if (pin === undefined) { problems.push({code: 'out-of-pins', reason: `No spare pin for output "${nm}".`}); continue; }
            place(nm, pin);
        }
    }
    return {cst: lines.join('\n') + '\n', problems};
}
