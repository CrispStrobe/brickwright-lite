/**
 * Evaluate a gate model in the browser — the live half of the gate builder
 * (Rung 3's playground). The same model the Verilog generator emits from can be
 * RUN here directly: toggle an input, and every wire and output settles to its
 * value instantly, offline, with no synthesis round-trip. Stepping a clock
 * advances the flip-flops. Synthesis then becomes "put it on real hardware",
 * not the only way to see anything happen.
 *
 * Pure and framework-free, so the logic — the part that must match what the
 * generated Verilog would do — is fully tested. It ties an unconnected input
 * low, exactly as modelToVerilog does, so the live view predicts the hardware.
 *
 * @module
 */
import {GATE_DEFS, hasOutput} from './gate-builder.js';

// Combinational evaluators, on 0/1 operands. An 'x' (unknown) operand makes the
// result 'x' — the live view never invents a level.
const OPS = {
    add: (a, b) => a + b,
    sub: (a, b) => a - b,
    mul: (a, b) => a * b,
    mux: (sel, d0, d1) => sel ? d1 : d0,
    and: (a, b) => a & b, or: (a, b) => a | b, xor: (a, b) => a ^ b,
    nand: (a, b) => ~(a & b), nor: (a, b) => ~(a | b), xnor: (a, b) => ~(a ^ b),
    not: a => ~a,
    buffer: a => a,
    cinv: (a, inv) => (inv ? ~a : a),
    eq: (a, b) => a === b ? 1 : 0,
    neq: (a, b) => a !== b ? 1 : 0,
    lt: (a, b) => a < b ? 1 : 0,
    gt: (a, b) => a > b ? 1 : 0,
    lte: (a, b) => a <= b ? 1 : 0,
    gte: (a, b) => a >= b ? 1 : 0,
    shl: (a, b) => a << b,
    shr: (a, b) => a >> b,
    concat: (a, b, w, g) => (a << (g.widthB || 0)) | b,
    slice: (inVal, w, g) => (inVal >> (g.lo || 0)) & ((1 << ((g.hi || 0) - (g.lo || 0) + 1)) - 1)
};

/** Map every sink port `${node}.${port}` to the node id that drives it. */
function driverMap (model) {
    const feed = new Map();
    const byId = Object.fromEntries((model.nodes || []).map(n => [n.id, n]));
    for (const e of (model.edges || [])) {
        const src = byId[e.from && e.from.node];
        if (src && hasOutput(src)) feed.set(`${e.to.node}.${e.to.port}`, e.from.node);
    }
    return feed;
}

/**
 * Settle the whole model to values, given the inputs and the current flip-flop
 * state. Returns every node's output value and the design's outputs.
 *
 * @param {{nodes:Array, edges:Array}} model
 * @param {Object} inputs  {inputName: 0|1|boolean}
 * @param {Object} dffState {dffNodeId: 0|1}
 * @returns {{values: Object, outputs: Object, settled: boolean}}
 *   values: nodeId -> 0|1|'x' (a node's driven output); outputs: outName -> 0|1|'x'.
 */
export function evalModel (model, inputs = {}, dffState = {}) {
    const nodes = (model && model.nodes) || [];
    const feed = driverMap(model);
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const values = {};

    // A driven port's value comes from the driving node's output. An input drives
    // its own level; a flip-flop drives its stored state; an unwired input is
    // tied low, matching modelToVerilog.
    const netInto = (nodeId, port) => {
        const src = feed.get(`${nodeId}.${port}`);
        return src === undefined ? 0 : (values[src] === undefined ? 'x' : values[src]);
    };

    for (const n of nodes) {
        if (n.kind === 'in') values[n.id] = Number(inputs[n.name]) || 0;
        else if (n.kind === 'const') values[n.id] = Number(n.value) || 0;
        else if (n.kind === 'gate' && GATE_DEFS[n.type] && GATE_DEFS[n.type].seq) {
            // A captured unknown stays unknown. Number('x') is NaN, and the old
            // `Number(...) || 0` silently fabricated a low level one render after
            // the flop had correctly captured x.
            values[n.id] = dffState[n.id] === 'x' ? 'x' : (Number(dffState[n.id]) || 0);
        }
    }

    const comb = nodes.filter(n => n.kind === 'gate' && GATE_DEFS[n.type] && !GATE_DEFS[n.type].seq);
    let settled = true;
    // Iterate to a fixpoint. A combinational loop never settles; bound it by the
    // gate count and report rather than spin.
    let changed = true;
    let guard = comb.length + 2;
    while (changed && guard-- > 0) {
        changed = false;
        for (const g of comb) {
            const def = GATE_DEFS[g.type];
            const args = def.ins.map(port => netInto(g.id, port));
            const vUnmasked = args.some(a => a === 'x') ? 'x' : OPS[g.type](...args, g.width, g);
            const w = g.width || 1;
            const v = vUnmasked === 'x' ? 'x' : (w >= 32 ? Number(BigInt(vUnmasked) & ((1n << BigInt(w)) - 1n)) : (vUnmasked & ((1 << w) - 1)) >>> 0);
            if (values[g.id] !== v) { values[g.id] = v; changed = true; }
        }
    }
    if (changed) settled = false; // still moving after the bound → a loop

    const outputs = {};
    for (const n of nodes) {
        if (n.kind === 'out') outputs[n.name] = netInto(n.id, 'in');
    }
    return {values, outputs, settled};
}

/**
 * Advance the flip-flops one clock edge: each flip-flop takes the value on its
 * `d` input, evaluated against the CURRENT state. Returns the next state.
 *
 * @returns {Object} the new {dffNodeId: 0|1|'x'} (an unknown d-input stays unknown)
 */
export function stepClock (model, inputs = {}, dffState = {}) {
    const {values} = evalModel(model, inputs, dffState);
    const feed = driverMap(model);
    const next = {};
    for (const n of (model.nodes || [])) {
        if (n.kind === 'gate' && GATE_DEFS[n.type] && GATE_DEFS[n.type].seq) {
            const gd = GATE_DEFS[n.type];
            const nets = {};
            for (const port of gd.ins) {
                if (port === 'clk') continue;
                const src = feed.get(`${n.id}.${port}`);
                nets[port] = src === undefined ? 0 : (values[src] === 'x' ? 'x' : values[src]);
            }
            const cur = dffState[n.id] === 'x' ? 'x' : (Number(dffState[n.id]) || 0);
            const step = gd.seqStep || (m => m.d);
            next[n.id] = Object.values(nets).some(v => v === 'x') ? 'x' : (step(nets, cur) ? 1 : 0);
        }
    }
    return next;
}
