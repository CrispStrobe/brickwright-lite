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
    label: 'Half adder',
    hint: 'a=1 b=1 darkens the sum and lights the carry, which is 1 + 1 = 10 in binary.',
    inputs: ['a', 'b'],
    gates: [
        {type: 'xor', in: ['a', 'b'], out: 'sum'},
        {type: 'and', in: ['a', 'b'], out: 'carry'}
    ],
    outputs: ['sum', 'carry']
});

/**
 * A full adder: sum = a XOR b XOR cin, cout = (a AND b) OR (cin AND (a XOR b)).
 *
 * Five chips, and the first spec where one chip's output feeds another's input:
 * `n1` (a XOR b) is computed once and read by both the sum XOR and the carry
 * AND, exactly as the textbook "two half adders and an OR" construction does.
 * `n1`, `t1` and `t2` are internal nets — no LED, nothing to read — so only sum
 * and cout get one.
 */
export const FULL_ADDER = Object.freeze({
    id: 'full_adder',
    label: 'Full adder',
    hint: 'turning all three on lights BOTH LEDs, which is 1 + 1 + 1 = 11 in binary.',
    inputs: ['a', 'b', 'cin'],
    gates: [
        {type: 'xor', in: ['a', 'b'], out: 'n1'},      // half adder 1: sum bit
        {type: 'and', in: ['a', 'b'], out: 't1'},      // half adder 1: carry
        {type: 'xor', in: ['n1', 'cin'], out: 'sum'},  // half adder 2: sum bit
        {type: 'and', in: ['n1', 'cin'], out: 't2'},   // half adder 2: carry
        {type: 'or', in: ['t1', 't2'], out: 'cout'}    // either carry carries
    ],
    outputs: ['sum', 'cout']
});

/**
 * An n-bit ripple-carry adder: n full adders chained, each stage's carry-out
 * becoming the next stage's carry-in. That chaining IS the lesson — it is also
 * why the thing is slow in real silicon, because bit 3's answer cannot settle
 * until bit 0's carry has rippled all the way up.
 *
 * Inputs are a0..a(n-1), b0..b(n-1), cin (little-endian, a0 is the ones bit);
 * outputs are sum0..sum(n-1) and cout. Five chips per bit.
 */
export function rippleAdder (n) {
    const gates = [];
    const inputs = [];
    for (let i = 0; i < n; i++) inputs.push(`a${i}`, `b${i}`);
    inputs.push('cin');
    for (let i = 0; i < n; i++) {
        const carryIn = i === 0 ? 'cin' : `c${i}`;
        const carryOut = i === n - 1 ? 'cout' : `c${i + 1}`;
        gates.push(
            {type: 'xor', in: [`a${i}`, `b${i}`], out: `n${i}`},
            {type: 'and', in: [`a${i}`, `b${i}`], out: `p${i}`},
            {type: 'xor', in: [`n${i}`, carryIn], out: `sum${i}`},
            {type: 'and', in: [`n${i}`, carryIn], out: `q${i}`},
            {type: 'or', in: [`p${i}`, `q${i}`], out: carryOut}
        );
    }
    const outputs = [];
    for (let i = 0; i < n; i++) outputs.push(`sum${i}`);
    outputs.push('cout');
    return Object.freeze({
        id: `ripple_adder_${n}`,
        label: `${n}-bit adder`,
        hint: `set a to ${'1'.repeat(n)} and add 1 — every sum LED goes dark and the carry lights, `
            + `which is how counting rolls over.`,
        inputs, gates, outputs
    });
}

/**
 * Rows that drive EVERY stage of an n-bit ripple adder through its whole truth
 * table, without enumerating the input space.
 *
 * A 4-bit adder has 9 inputs — 512 combinations, and on the real board that is
 * minutes of simulation, which is not a thing to do inside a click. Brute force
 * stops being the tool here, which is itself worth a learner knowing: you cover
 * a big circuit, you do not exhaust it.
 *
 * The coverage criterion is exact rather than a vibe: each stage i is a full
 * adder over (a_i, b_i, c_i), so the set must make all EIGHT of those triples
 * appear at every stage. c_i is not an input — it arrives from the stage below —
 * so the rows are chosen by simulating the carry in pure arithmetic and keeping
 * any row that shows some stage a triple nothing has shown it yet.
 *
 * Deterministic: the same rows every run, in ascending order.
 *
 * @param {number} n  bit width
 * @returns {Array<Object>} input maps ({a0, b0, …, cin})
 */
export function carryCoverRows (n) {
    const need = new Set();
    for (let i = 0; i < n; i++) for (let t = 0; t < 8; t++) need.add(`${i}:${t}`);
    const rows = [];
    const total = 1 << ((2 * n) + 1);
    for (let bits = 0; bits < total && need.size; bits++) {
        const row = {};
        for (let i = 0; i < n; i++) {
            row[`a${i}`] = (bits >> (2 * i)) & 1;
            row[`b${i}`] = (bits >> ((2 * i) + 1)) & 1;
        }
        row.cin = (bits >> (2 * n)) & 1;
        // Ripple the carry the way the circuit will, and see what each stage sees.
        const gained = [];
        let carry = row.cin;
        for (let i = 0; i < n; i++) {
            const a = row[`a${i}`];
            const b = row[`b${i}`];
            const key = `${i}:${(a << 2) | (b << 1) | carry}`;
            if (need.has(key)) gained.push(key);
            carry = ((a + b + carry) >= 2) ? 1 : 0;
        }
        if (gained.length) {
            for (const k of gained) need.delete(k);
            rows.push(row);
        }
    }

    // Greedy picks a row the moment it gains anything, so an early row can be
    // made redundant by later ones — it gained a triple then, but nothing
    // depends on it now. Sweep backwards and drop every row the set can do
    // without: fewer rows is less simulation for the same coverage, and it makes
    // "these rows are all needed" a true statement rather than a hopeful one.
    const covers = set => {
        const seen = new Set();
        for (const row of set) {
            let carry = row.cin;
            for (let i = 0; i < n; i++) {
                const a = row[`a${i}`];
                const b = row[`b${i}`];
                seen.add(`${i}:${(a << 2) | (b << 1) | carry}`);
                carry = ((a + b + carry) >= 2) ? 1 : 0;
            }
        }
        return seen.size === n * 8;
    };
    let kept = rows;
    for (let i = kept.length - 1; i >= 0; i--) {
        const without = kept.filter((_, j) => j !== i);
        if (covers(without)) kept = without;
    }
    return kept;
}

/**
 * The multi-gate circuits a challenge can name (`circuit: 'half_adder'`), so the
 * UI's build button and the curriculum tests resolve the same spec from the same
 * place rather than each carrying their own copy.
 */
export const RIPPLE_ADDER_4 = rippleAdder(4);

export const IC_CIRCUITS = Object.freeze({
    half_adder: HALF_ADDER, full_adder: FULL_ADDER, ripple_adder_4: RIPPLE_ADDER_4
});

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

    // Chips go in a GRID, not one tall column: a 4-bit adder is twenty chips,
    // and stacked vertically that is a 3,800px strip nobody can look at. Five
    // per column, which for the adders means one column PER BIT — the layout
    // then shows the structure instead of hiding it.
    const ROW = 150;
    const COL = 300;
    const PER_COL = 5;
    const nCols = Math.ceil(spec.gates.length / PER_COL);
    const colRows = Math.min(spec.gates.length, PER_COL);
    const rightX = 380 + (nCols * COL) + 60;

    const vcc = circuit.addPart('vcc', {}, 60, 40); join('vcc', vcc.id, 'vcc');
    const gnd = circuit.addPart('gnd', {}, 60, 160 + (Math.max(colRows, spec.inputs.length) * ROW));
    join('gnd', gnd.id, 'gnd');

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
        const chip = circuit.addPart(ic.chip, {},
            380 + (Math.floor(gi / PER_COL) * COL), 140 + ((gi % PER_COL) * ROW), g.out);
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
        const r = circuit.addPart('resistor', {ohms: 330}, rightX, y);
        const led = circuit.addPart('led', {color: OUT_COLORS[i % OUT_COLORS.length]}, rightX + 130, y, name);
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
