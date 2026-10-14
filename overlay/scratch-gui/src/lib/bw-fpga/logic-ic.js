// The middle rung of the ladder: a logic gate as a real 74HC-series chip.
//
// The FPGA tab already descends from an abstract gate to its CMOS transistors
// (cmos.js / cmos-board.js) — the raw silicon. This is the rung between them:
// the same gate as a 74HC logic IC, the part a person actually solders. A
// learner sees AND three ways — the symbol, the 14-pin chip, and the six
// transistors inside one of its gates — which is the whole "logic → chip →
// silicon" story the FPGA lab is for.
//
// Each 74HC gate chip carries several identical gates; we realise GATE 1. The
// pin names are bw-circuit-ui's sidecar terminals for the part, lower-cased
// (`1a`, `1b`, `1y`, plus `vcc`/`gnd`), so buildLogicIcGate can wire straight to
// them. The engine models these chips digitally (they solve through advanceTo,
// not the analog operating point), so a driven input really does light the
// output LED through the chip.

/** gate type → the 74HC chip that realises it, and gate 1's pins. */
const GATE_TO_IC = Object.freeze({
    not:  {chip: '74hc04', label: '74HC04', desc: 'hex inverter',        inputs: ['1a'],       output: '1y', gates: 6},
    and:  {chip: '74hc08', label: '74HC08', desc: 'quad 2-input AND',    inputs: ['1a', '1b'], output: '1y', gates: 4},
    or:   {chip: '74hc32', label: '74HC32', desc: 'quad 2-input OR',     inputs: ['1a', '1b'], output: '1y', gates: 4},
    nand: {chip: '74hc00', label: '74HC00', desc: 'quad 2-input NAND',   inputs: ['1a', '1b'], output: '1y', gates: 4},
    nor:  {chip: '74hc02', label: '74HC02', desc: 'quad 2-input NOR',    inputs: ['1a', '1b'], output: '1y', gates: 4},
    xor:  {chip: '74hc86', label: '74HC86', desc: 'quad 2-input XOR',    inputs: ['1a', '1b'], output: '1y', gates: 4}
});

/** The gate types this rung can realise, in a friendly order. */
export const LOGIC_IC_GATES = Object.freeze(['not', 'and', 'or', 'nand', 'nor', 'xor']);

/**
 * @param {string} type  a gate type (not/and/or/nand/nor/xor)
 * @returns {{chip, label, desc, inputs:string[], output:string}|null}
 */
export function gateToLogicIc (type) {
    return GATE_TO_IC[String(type).toLowerCase()] || null;
}

/**
 * The pins of gate `slot` (1-based) inside the package.
 *
 * "Quad NAND" means FOUR NAND gates in one 14-pin part, and "hex inverter" six;
 * the sidecar models every one of them (1a/1b/1y … 4a/4b/4y). Realising each
 * gate as its own whole chip is not how anybody builds a board — a 4-bit adder
 * would be twenty packages instead of five — so a builder packs gates into the
 * parts it would actually buy, and this says which pins that gate lands on.
 *
 * The slot number simply replaces the leading digit of gate 1's pin names.
 *
 * @param {string} type  gate type
 * @param {number} slot  1-based gate position within the package
 * @returns {{inputs: string[], output: string}|null}
 */
export function icGatePins (type, slot) {
    const spec = gateToLogicIc(type);
    if (!spec) return null;
    if (!Number.isInteger(slot) || slot < 1 || slot > spec.gates) {
        throw new RangeError(`${spec.label} has ${spec.gates} gates; there is no gate ${slot}`);
    }
    const renumber = pin => `${slot}${pin.slice(1)}`;
    return {inputs: spec.inputs.map(renumber), output: renumber(spec.output)};
}

/** How many gates one package of this type holds. */
export const gatesPerPackage = type => (gateToLogicIc(type) || {}).gates || 1;

/**
 * The gate's truth function — the oracle the board is graded against. Inputs is
 * an array of 0/1 (one per gate input); returns 0 or 1.
 */
export function evalLogicIc (type, ins) {
    const a = ins[0] ? 1 : 0;
    const b = ins[1] ? 1 : 0;
    switch (String(type).toLowerCase()) {
    case 'not':  return a ? 0 : 1;
    case 'and':  return a & b;
    case 'or':   return a | b;
    case 'nand': return (a & b) ? 0 : 1;
    case 'nor':  return (a | b) ? 0 : 1;
    case 'xor':  return a ^ b;
    default:     return null;
    }
}
