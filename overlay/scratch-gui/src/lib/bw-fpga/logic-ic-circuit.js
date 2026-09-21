// Realise a MULTI-GATE circuit from 74HC chips on the live breadboard.
//
// logic-ic-board.js realises ONE gate: one chip, a switch per input, an LED on
// the output. That is as far as a single gate goes, and it is why the realise
// challenges stop at single gates. This builds a circuit of SEVERAL chips —
// inputs shared between them, one chip's output feeding another's input where
// the spec says so, and an LED per named output — which is what a half adder
// needs: XOR for the sum, AND for the carry, both watching the same two
// switches.
//
// Built through the same live-circuit API (addPart/addWire) as every other
// realisation, so the result is a real simulated circuit: toggle the switches
// and each output LED follows its own gate.
//
// Output LEDs carry a `declName` (the 5th argument of addPart), so the grader
// can match an LED to the output it represents BY NAME rather than by where it
// happens to sit. declName survives toJSON/fromJSON, so the name is still there
// after the designer reloads the circuit to render it.

import {gateToLogicIc} from './logic-ic.js';

/** A half adder: sum = a XOR b, carry = a AND b. Two chips, two LEDs. */
export const HALF_ADDER = Object.freeze({
    id: 'half_adder',
    inputs: ['a', 'b'],
    gates: [
        {type: 'xor', in: ['a', 'b'], out: 'sum'},
        {type: 'and', in: ['a', 'b'], out: 'carry'}
    ],
    outputs: ['sum', 'carry']
});

/**
 * The multi-gate circuits a challenge can name (`circuit: 'half_adder'`), so the
 * UI's build button and the curriculum tests resolve the same spec from the same
 * place rather than each carrying their own copy.
 */
export const IC_CIRCUITS = Object.freeze({half_adder: HALF_ADDER});

/** Distinct colours so two output LEDs are told apart at a glance. */
const OUT_COLORS = ['green', 'red', 'yellow', 'blue', 'white'];

/**
 * @param {object} circuit  the live Circuit: addPart(kind, params, x, y, declName)
 *   → {id}, addWire(idA, tA, idB, tB), removePart(id), and a `parts` array.
 * @param {object} spec  {inputs:string[], gates:[{type,in:string[],out}], outputs:string[]}
 * @param {{clear?: boolean}} [opts]
 * @returns {{spec, chips:Array, inputs:Array<{name,switch}>, outputs:Array<{name,led,resistor}>}}
 */
export function buildLogicIcCircuit (circuit, spec, {clear = true} = {}) {
    if (!spec || !Array.isArray(spec.gates) || !spec.gates.length) {
        throw new Error('buildLogicIcCircuit needs a spec with gates');
    }
    if (!circuit || typeof circuit.addPart !== 'function' || typeof circuit.addWire !== 'function') {
        throw new TypeError('buildLogicIcCircuit needs a live circuit with addPart/addWire (window.__circuit)');
    }
    for (const g of spec.gates) {
        const ic = gateToLogicIc(g.type);
        if (!ic) throw new Error(`No 74xx realisation for "${g.type}"`);
        if (ic.inputs.length !== g.in.length) {
            throw new Error(`${g.type} takes ${ic.inputs.length} input(s), spec gives ${g.in.length}`);
        }
    }
    if (clear && Array.isArray(circuit.parts) && typeof circuit.removePart === 'function') {
        for (const part of [...circuit.parts]) circuit.removePart(part.id);
    }

    // Every terminal on a net, wired up as a chain at the end — a chain of ideal
    // wires is one node to the solver. Same approach as the single-gate builder.
    const conn = {};
    const join = (net, id, term) => { (conn[net] = conn[net] || []).push([id, term]); };

    const ROW = 190;
    const vcc = circuit.addPart('vcc', {}, 60, 40); join('vcc', vcc.id, 'vcc');
    const gnd = circuit.addPart('gnd', {}, 60, 120 + spec.gates.length * ROW); join('gnd', gnd.id, 'gnd');

    // Inputs: a switch pulling the net to VCC with a 100 kΩ pull-down, so an open
    // switch reads 0. One per NAMED input, shared by every gate that reads it.
    const inputs = spec.inputs.map((name, i) => {
        const sy = 120 + i * 110;
        const sw = circuit.addPart('switch', {}, 130, sy, name);
        join('vcc', sw.id, 'a'); join(name, sw.id, 'b');
        const pull = circuit.addPart('resistor', {ohms: 100000}, 130, sy + 55);
        join(name, pull.id, 'a'); join('gnd', pull.id, 'b');
        return {name, switch: sw.id, pulldown: pull.id};
    });

    // One chip per gate. A gate's `in` names either an input net or another
    // gate's `out` net — either way it is just a net, so chip-to-chip wiring
    // falls out of the same join().
    const chips = spec.gates.map((g, gi) => {
        const ic = gateToLogicIc(g.type);
        const chip = circuit.addPart(ic.chip, {}, 380, 140 + gi * ROW, g.out);
        join('vcc', chip.id, 'vcc');
        join('gnd', chip.id, 'gnd');
        g.in.forEach((net, i) => join(net, chip.id, ic.inputs[i]));
        join(g.out, chip.id, ic.output);
        return {id: chip.id, kind: ic.chip, type: g.type, out: g.out};
    });

    // An LED per named output, stacked in the order `outputs` lists them, each
    // named so the grader can find it by name and coloured so a learner can.
    const outputs = spec.outputs.map((name, i) => {
        const y = 140 + i * ROW;
        const r = circuit.addPart('resistor', {ohms: 330}, 700, y);
        const led = circuit.addPart('led', {color: OUT_COLORS[i % OUT_COLORS.length]}, 830, y, name);
        join(name, r.id, 'a');
        join(`__led_${name}`, r.id, 'b');
        join(`__led_${name}`, led.id, 'anode');
        join('gnd', led.id, 'cathode');
        return {name, resistor: r.id, led: led.id};
    });

    for (const net of Object.keys(conn)) {
        const cs = conn[net];
        for (let i = 1; i < cs.length; i++) circuit.addWire(cs[i - 1][0], cs[i - 1][1], cs[i][0], cs[i][1]);
    }

    return {spec, chips, inputs, outputs};
}
