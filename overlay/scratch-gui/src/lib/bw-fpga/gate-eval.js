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
    and: (a, b) => a & b, or: (a, b) => a | b, xor: (a, b) => a ^ b,
    nand: (a, b) => 1 - (a & b), nor: (a, b) => 1 - (a | b), xnor: (a, b) => 1 - (a ^ b),
    not: a => 1 - a
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
        if (n.kind === 'in') values[n.id] = inputs[n.name] ? 1 : 0;
        else if (n.kind === 'const') values[n.id] = n.value ? 1 : 0;
        else if (n.kind === 'gate' && GATE_DEFS[n.type] && GATE_DEFS[n.type].seq) {
            values[n.id] = dffState[n.id] ? 1 : 0; // a flip-flop drives its state
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
            const v = args.some(a => a === 'x') ? 'x' : OPS[g.type](...args);
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
 * @returns {Object} the new {dffNodeId: 0|1} (an 'x' d-input holds the flop at 0)
 */
export function stepClock (model, inputs = {}, dffState = {}) {
    const {values} = evalModel(model, inputs, dffState);
    const feed = driverMap(model);
    const next = {};
    for (const n of (model.nodes || [])) {
        if (n.kind === 'gate' && GATE_DEFS[n.type] && GATE_DEFS[n.type].seq) {
            const src = feed.get(`${n.id}.d`);
            const d = src === undefined ? 0 : values[src];
            next[n.id] = d === 1 ? 1 : 0;
        }
    }
    return next;
}
