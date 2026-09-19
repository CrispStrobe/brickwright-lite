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
    add: {label: 'ADD', glyph: '+', ins: ['a', 'b'], expr: n => `${n.a} + ${n.b}`},
    sub: {label: 'SUB', glyph: '-', ins: ['a', 'b'], expr: n => `${n.a} - ${n.b}`},
    mul: {label: 'MUL', glyph: '*', ins: ['a', 'b'], expr: n => `${n.a} * ${n.b}`},
    mux: {label: 'MUX', glyph: '?', ins: ['sel', 'd0', 'd1'], expr: n => `${n.sel} ? ${n.d1} : ${n.d0}`},
    and: {label: 'AND', glyph: '&', ins: ['a', 'b'], expr: n => `${n.a} & ${n.b}`},
    or: {label: 'OR', glyph: '≥1', ins: ['a', 'b'], expr: n => `${n.a} | ${n.b}`},
    xor: {label: 'XOR', glyph: '=1', ins: ['a', 'b'], expr: n => `${n.a} ^ ${n.b}`},
    nand: {label: 'NAND', glyph: '&', ins: ['a', 'b'], inverting: true, expr: n => `~(${n.a} & ${n.b})`},
    nor: {label: 'NOR', glyph: '≥1', ins: ['a', 'b'], inverting: true, expr: n => `~(${n.a} | ${n.b})`},
    xnor: {label: 'XNOR', glyph: '=1', ins: ['a', 'b'], inverting: true, expr: n => `~(${n.a} ^ ${n.b})`},
    not: {label: 'NOT', glyph: '1', ins: ['a'], inverting: true, expr: n => `~${n.a}`},
    eq: {label: 'EQ', glyph: '==', ins: ['a', 'b'], expr: n => `${n.a} == ${n.b}`},
    neq: {label: 'NEQ', glyph: '!=', ins: ['a', 'b'], expr: n => `${n.a} != ${n.b}`},
    lt: {label: 'LT', glyph: '<', ins: ['a', 'b'], expr: n => `${n.a} < ${n.b}`},
    gt: {label: 'GT', glyph: '>', ins: ['a', 'b'], expr: n => `${n.a} > ${n.b}`},
    lte: {label: 'LTE', glyph: '<=', ins: ['a', 'b'], expr: n => `${n.a} <= ${n.b}`},
    gte: {label: 'GTE', glyph: '>=', ins: ['a', 'b'], expr: n => `${n.a} >= ${n.b}`},
    shl: {label: 'SHL', glyph: '<<', ins: ['a', 'b'], expr: n => `${n.a} << ${n.b}`},
    shr: {label: 'SHR', glyph: '>>', ins: ['a', 'b'], expr: n => `${n.a} >> ${n.b}`},
    concat: {label: 'CONCAT', glyph: '{}', ins: ['a', 'b'], expr: n => `{${n.a}, ${n.b}}`},
    slice: {label: 'SLICE', glyph: '[:]', ins: ['in'], expr: (n, g) => `${n.in}[${g.hi || 0}:${g.lo || 0}]`},
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
    return node.kind === 'in' || node.kind === 'gate' || node.kind === 'instance' || node.kind === 'memory' || node.kind === 'const';
}

/** The ports a subcircuit exposes, derived from its own input/output nodes when
 *  a module does not declare them explicitly. dir is 'in'/'out'. */
export function derivePorts (def) {
    const ports = [];
    for (const n of (def && def.nodes) || []) {
        if (n.kind === 'in') ports.push({name: n.name, dir: 'in', width: n.width || 1});
        else if (n.kind === 'out') ports.push({name: n.name, dir: 'out', width: n.width || 1});
    }
    return ports;
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
    const problems = [];
    const modules = (model && model.modules) || [];
    // Port maps of every subcircuit, so an instance knows its ports' directions.
    const moduleDefs = {};
    for (const m of modules) moduleDefs[m.name] = {ports: m.ports && m.ports.length ? m.ports : derivePorts(m)};

    const chunks = [];
    for (const m of modules) chunks.push(emitModule(m, m.name, moduleDefs, problems));
    chunks.push(emitModule(model, moduleName, moduleDefs, problems));
    return {verilog: chunks.join('\n') + '\n', problems};
}

/**
 * Emit one Verilog module from a {nodes, edges} definition. Nodes are inputs,
 * outputs, gates, or INSTANCES of other modules (kind:'instance', module:<name>)
 * — which is how the builder composes: build a full-adder once, drop it in many
 * times. `moduleDefs` gives each instance's ports so its wiring is generated.
 *
 * @returns {string} the module text (no trailing newline)
 */
function emitModule (def, name, moduleDefs, problems) {
    const nodes = (def && def.nodes) || [];
    const edges = (def && def.edges) || [];
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

    // The net that DRIVES a given (node, port): an input drives its own name, a
    // gate its single wire, an instance a per-output wire.
    const driverNet = (node, port) => {
        if (!node) return null;
        if (node.kind === 'in') return ident(node.name, `in_${node.id}`);
        if (node.kind === 'const') return `1'b${node.value ? 1 : 0}`;
        if (node.kind === 'gate') return `w_${node.id}`;
        if (node.kind === 'instance') return `w_${node.id}_${ident(port, 'out')}`;
        if (node.kind === 'memory') return `w_${node.id}`; // the registered read data
        return null;
    };

    const feed = new Map(); // `${nodeId}.${port}` -> net
    for (const e of edges) {
        const src = byId[e.from && e.from.node];
        if (!src || !hasOutput(src)) { problems.push({code: 'edge-source-not-a-driver'}); continue; }
        feed.set(`${e.to.node}.${e.to.port}`, driverNet(src, e.from.port));
    }
    const netFor = (nodeId, port) => feed.get(`${nodeId}.${port}`) || null;
    const tieLow = (nodeId, port, who) => {
        const net = netFor(nodeId, port);
        if (net) return net;
        problems.push({code: 'unconnected-input',
            reason: `${who} has nothing wired to its "${port}" input, so it reads 0.`});
        return "1'b0";
    };
    const busDecl = (kw, nm, width) => (width > 1 ? `${kw} [${width - 1}:0] ${nm}` : `${kw} ${nm}`);

    const inputs = nodes.filter(n => n.kind === 'in');
    const outputs = nodes.filter(n => n.kind === 'out');
    const gates = nodes.filter(n => n.kind === 'gate');
    const instances = nodes.filter(n => n.kind === 'instance');
    const memories = nodes.filter(n => n.kind === 'memory');

    if (!outputs.length && name === 'design') {
        problems.push({code: 'no-output', reason: 'Add at least one output so the design drives something.'});
    }

    const portDecls = [
        ...inputs.map(n => busDecl('input', ident(n.name, `in_${n.id}`), n.width || 1)),
        ...outputs.map(n => busDecl('output', ident(n.name, `out_${n.id}`), n.width || 1))
    ];

    const lines = [`module ${ident(name, 'design')}(${portDecls.join(', ')});`];

    for (const g of gates.filter(x => GATE_DEFS[x.type] && !GATE_DEFS[x.type].seq)) {
        const gd = GATE_DEFS[g.type];
        const n = {};
        for (const port of gd.ins) n[port] = tieLow(g.id, port, `${gd.label} gate`);
        const w = g.width || 1;
        lines.push(`  ${w > 1 ? `wire [${w - 1}:0] w_${g.id};` : `wire w_${g.id};`}`);
        lines.push(`  assign w_${g.id} = ${gd.expr(n, g)};`);
    }
    for (const g of gates.filter(x => GATE_DEFS[x.type] && GATE_DEFS[x.type].seq)) {
        const d = tieLow(g.id, 'd', 'Flip-flop');
        const clk = netFor(g.id, 'clk');
        if (!clk) problems.push({code: 'dff-no-clock', reason: 'A flip-flop needs a clock wired to its "clk" input.'});
        const w = g.width || 1;
        lines.push(`  ${w > 1 ? `reg [${w - 1}:0] w_${g.id};` : `reg w_${g.id};`}`);
        lines.push(`  always @(posedge ${clk || "1'b0"}) w_${g.id} <= ${d};`);
    }
    // Module INSTANCES — the composition primitive.
    for (const inst of instances) {
        const md = moduleDefs[inst.module];
        if (!md) { problems.push({code: 'unknown-module', reason: `Instance references unknown module "${inst.module}".`}); continue; }
        const conns = [];
        for (const p of md.ports) {
            if (p.dir === 'out') {
                const w = p.width || 1;
                lines.push(`  ${w > 1 ? `wire [${w - 1}:0] w_${inst.id}_${ident(p.name, 'out')};` : `wire w_${inst.id}_${ident(p.name, 'out')};`}`);
                conns.push(`.${ident(p.name)}(w_${inst.id}_${ident(p.name, 'out')})`);
            } else {
                conns.push(`.${ident(p.name)}(${tieLow(inst.id, p.name, `${inst.module} instance`)})`);
            }
        }
        lines.push(`  ${ident(inst.module)} ${ident(inst.id, `u_${inst.id}`)}(${conns.join(', ')});`);
    }
    // Synchronous single-port RAM: a reg array, a write on we, a registered
    // read — the shape Yosys infers as a $mem cell. addr/din/we/clk are inputs;
    // the registered read data (`w_<id>`) is the memory's output.
    for (const m of memories) {
        const dw = Math.max(1, m.dataWidth || 8);
        const aw = Math.max(1, m.addrWidth || 4);
        const clk = netFor(m.id, 'clk');
        if (!clk) problems.push({code: 'memory-no-clock', reason: 'A memory needs a clock wired to its "clk" input.'});
        const addr = tieLow(m.id, 'addr', 'Memory');
        const din = tieLow(m.id, 'din', 'Memory');
        const we = tieLow(m.id, 'we', 'Memory');
        lines.push(`  reg [${dw - 1}:0] mem_${m.id} [0:${(1 << aw) - 1}];`);
        lines.push(`  reg [${dw - 1}:0] w_${m.id};`);
        lines.push(`  always @(posedge ${clk || "1'b0"}) begin`);
        lines.push(`    if (${we}) mem_${m.id}[${addr}] <= ${din};`);
        lines.push(`    w_${m.id} <= mem_${m.id}[${addr}];`);
        lines.push('  end');
    }
    for (const o of outputs) {
        lines.push(`  assign ${ident(o.name, `out_${o.id}`)} = ${tieLow(o.id, 'in', `Output "${ident(o.name, o.id)}"`)};`);
    }
    lines.push('endmodule');
    return lines.join('\n');
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
    // A multi-bit port needs ONE pin per bit — a bus placed on a single pin
    // fails place-and-route. Each bit is constrained as name[i], the spelling the
    // generated Verilog uses.
    const placePort = (baseName, width, nextPin, who) => {
        for (let bit = 0; bit < Math.max(1, width); bit++) {
            const pin = nextPin();
            if (pin === undefined) { problems.push({code: 'out-of-pins', reason: `No spare pin for ${who} "${baseName}".`}); return; }
            place(width > 1 ? `${baseName}[${bit}]` : baseName, pin);
        }
    };
    for (const n of nodes) {
        if (n.kind === 'in') {
            const nm = ident(n.name, `in_${n.id}`);
            if ((n.width || 1) === 1 && /clk|clock/i.test(n.name || '')) { place(nm, 4); continue; }
            placePort(nm, n.width || 1, () => IN_PINS[ii++], 'input');
        } else if (n.kind === 'out') {
            const nm = ident(n.name, `out_${n.id}`);
            placePort(nm, n.width || 1, () => OUT_PINS[oi++], 'output');
        }
    }
    return {cst: lines.join('\n') + '\n', problems};
}
