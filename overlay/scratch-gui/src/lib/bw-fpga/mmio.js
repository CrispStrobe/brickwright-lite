/**
 * Memory-mapped I/O — the bridge between a PROGRAM (the Code tab's ASM/C) and an
 * FPGA design. This is how a CPU talks to custom hardware for real: the design's
 * inputs and outputs are given addresses, the program writes an input register
 * and reads an output register, and each clock the hardware reads its inputs and
 * drives its outputs. Two independent worlds meet at an address map.
 *
 * A design's ports get a default map here (inputs at 0x00.., outputs at 0x10..),
 * so any circuit you build is addressable without extra wiring. The model is
 * pure — a register bank (address→value) plus the tested gate evaluator — so the
 * whole bridge is unit-tested without a browser or an emulator.
 *
 * @module
 */
import {evalModel, stepClock} from './gate-eval.js';

const IN_BASE = 0x00;
const OUT_BASE = 0x10;

/** The named ports of a model, in declaration order. */
const portsOf = (model, kind) => ((model && model.nodes) || [])
    .filter(n => n.kind === kind && n.name).map(n => ({name: n.name, width: n.width || 1}));

/**
 * A default address map for a design: each input at 0x00,0x01,… and each output
 * at 0x10,0x11,… A `clk` input is not mapped — the clock is the bus cycle, not a
 * register a program pokes.
 *
 * @returns {Array<{addr:number, port:string, dir:'in'|'out', width:number}>}
 */
export function defaultMmioMap (model) {
    const map = [];
    let ai = 0;
    for (const p of portsOf(model, 'in')) {
        if (/clk|clock/i.test(p.name)) continue; // the clock is the bus cycle, not a register
        map.push({addr: IN_BASE + ai++, port: p.name, dir: 'in', width: p.width});
    }
    let bi = 0;
    for (const p of portsOf(model, 'out')) {
        map.push({addr: OUT_BASE + bi++, port: p.name, dir: 'out', width: p.width});
    }
    return map;
}

/** The design inputs implied by the bus: each `in`-mapped register's value. */
export function mmioInputs (map, regs) {
    const inputs = {};
    for (const e of map) if (e.dir === 'in') inputs[e.port] = Number(regs[e.addr]) || 0;
    return inputs;
}

/**
 * One bus cycle: read the input registers into the design, evaluate it against
 * the current sequential state, advance the clock, and write the design's
 * outputs back into the output registers. Returns the new register bank and
 * clock state — exactly what a program would see after touching the peripheral.
 *
 * @returns {{regs: Object, clockState: Object, outputs: Object, settled: boolean}}
 */
export function runMmioCycle (model, map, regs = {}, clockState = {}) {
    const inputs = mmioInputs(map, regs);
    const {outputs, settled} = evalModel(model, inputs, clockState);
    const nextClock = stepClock(model, inputs, clockState);
    const nextRegs = {...regs};
    for (const e of map) if (e.dir === 'out') nextRegs[e.addr] = outputs[e.port];
    return {regs: nextRegs, clockState: nextClock, outputs, settled};
}
