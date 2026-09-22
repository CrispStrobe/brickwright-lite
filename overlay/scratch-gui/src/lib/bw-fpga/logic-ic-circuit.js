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

import {gateToLogicIc, icGatePins, gatesPerPackage} from './logic-ic.js';

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

/**
 * The same 4-bit addition as ONE part.
 *
 * The ripple adder above is twenty gates in five packages. The 74HC283 is a
 * 4-bit binary adder in a single 16-pin chip — the identical function, bought
 * instead of built. That is the whole idea of integration, and it is the reason
 * nobody wires adders out of XOR gates any more.
 *
 * It is not a `gates` spec: there are no gates to pack, just one part whose pins
 * ARE the interface. `chip` marks that shape, and the builder wires it directly.
 */
export const ADDER_CHIP_4 = Object.freeze({
    id: 'adder_chip_4',
    label: '4-bit adder (one chip)',
    hint: 'the same sums as the twenty-gate version, from a single 16-pin part.',
    chip: '74hc283',
    chipLabel: '74HC283',
    inputs: ['a0', 'b0', 'a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'cin'],
    outputs: ['s0', 's1', 's2', 's3', 'cout'],
    gates: []
});

/**
 * A D flip-flop: the first REALISATION that remembers.
 *
 * Everything else on the ladder is combinational — the LEDs follow the switches
 * and forget instantly. A 74HC74 holds its output until the next clock edge,
 * which is where storage, and therefore computing, starts.
 *
 * `pins` maps the challenge's net names onto the part's actual pin names, and
 * `tieHigh` handles the thing that catches everybody: the async preset and
 * clear are ACTIVE LOW, so leaving them unconnected (or low) means the part
 * never holds anything. They are tied to VCC.
 */
export const DFF_CHIP = Object.freeze({
    id: 'dff',
    label: 'D flip-flop',
    hint: 'set d, press the clock switch, and q takes the value — then change d and watch q NOT move until the next edge.',
    chip: '74hc74',
    chipLabel: '74HC74',
    inputs: ['d', 'clk'],
    outputs: ['q'],
    pins: {d: '1d', clk: '1clk', q: '1q'},
    tieHigh: ['1pre', '1clr'],
    sequential: true,
    gates: []
});

export const IC_CIRCUITS = Object.freeze({
    half_adder: HALF_ADDER, full_adder: FULL_ADDER,
    ripple_adder_4: RIPPLE_ADDER_4, adder_chip_4: ADDER_CHIP_4, dff: DFF_CHIP
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
    const single = Boolean(spec && spec.chip);
    if (!spec || (!single && (!Array.isArray(spec.gates) || !spec.gates.length))) {
        throw new Error('buildLogicIcCircuit needs a spec with gates, or a single `chip`');
    }
    if (!circuit || typeof circuit.addPart !== 'function' || typeof circuit.addWire !== 'function') {
        throw new TypeError('buildLogicIcCircuit needs a live circuit with addPart/addWire (window.__circuit)');
    }
    for (const g of (spec.gates || [])) {
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
    // Worst case one package per gate (all different types); usually far fewer.
    const maxPacks = single ? 1 : spec.gates.length;
    const nCols = Math.ceil(maxPacks / PER_COL);
    const colRows = Math.min(maxPacks, PER_COL);
    const rightX = 380 + (nCols * COL) + 60;

    const vcc = circuit.addPart('vcc', {}, 60, 40); join('vcc', vcc.id, 'vcc');
    const gnd = circuit.addPart('gnd', {}, 60, 160 + (Math.max(colRows, 5) * ROW));
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

    // PACK the gates into the parts you would actually buy. A 74HC86 is a QUAD
    // XOR — four gates in one 14-pin package — so realising each gate as its own
    // whole chip made a 4-bit adder twenty packages when it is really five. The
    // board now matches the shopping list, and the parts list the Circuit tab
    // already generates becomes something you could order.
    //
    // Packages get reference designators (U1, U2, …), the way a schematic names
    // them, rather than being named after one of the gates they happen to hold.
    const packages = [];
    const openPackage = kind => packages.find(p => p.kind === kind && p.used < p.capacity);
    const placeGate = type => {
        const ic = gateToLogicIc(type);
        let pack = openPackage(ic.chip);
        if (!pack) {
            const n = packages.length;
            const part = circuit.addPart(ic.chip, {},
                380 + (Math.floor(n / PER_COL) * COL), 140 + ((n % PER_COL) * ROW), `U${n + 1}`);
            pack = {id: part.id, kind: ic.chip, label: ic.label, ref: `U${n + 1}`,
                capacity: gatesPerPackage(type), used: 0, gates: []};
            join('vcc', part.id, 'vcc');
            join('gnd', part.id, 'gnd');
            packages.push(pack);
        }
        const slot = pack.used + 1;
        pack.used = slot;
        return {pack, pins: icGatePins(type, slot), slot};
    };

    if (single) {
        const part = circuit.addPart(spec.chip, {}, 420, 200, 'U1');
        join('vcc', part.id, 'vcc');
        join('gnd', part.id, 'gnd');
        // One part; `pins` maps net names to pin names where they differ.
        const pinOf = net => (spec.pins && spec.pins[net]) || net;
        for (const net of [...spec.inputs, ...spec.outputs]) join(net, part.id, pinOf(net));
        // Control pins that must be held inactive. On a 74HC74 the async preset
        // and clear are ACTIVE LOW: leave them floating and the part never holds.
        for (const pin of (spec.tieHigh || [])) join('vcc', part.id, pin);
        for (const pin of (spec.tieLow || [])) join('gnd', part.id, pin);
        packages.push({id: part.id, kind: spec.chip, label: spec.chipLabel || spec.chip,
            ref: 'U1', capacity: 1, used: 1, gates: []});
    }

    // A gate's `in` names either an input net or another gate's `out` net —
    // either way it is just a net, so chip-to-chip wiring falls out of join().
    const chips = (spec.gates || []).map(g => {
        const {pack, pins, slot} = placeGate(g.type);
        g.in.forEach((net, i) => join(net, pack.id, pins.inputs[i]));
        join(g.out, pack.id, pins.output);
        pack.gates.push({type: g.type, out: g.out, slot});
        return {id: pack.id, kind: pack.kind, type: g.type, out: g.out, ref: pack.ref, slot};
    });

    // Tie every LEFTOVER gate's inputs to ground. A floating CMOS input is not
    // a neutral thing: it drifts around the switching threshold and makes the
    // package draw current and oscillate. Real boards tie unused inputs off, so
    // this one does too — and the learner can see why the spare gates are wired
    // to nothing in particular.
    for (const pack of packages) {
        for (let slot = pack.used + 1; slot <= pack.capacity; slot++) {
            const type = pack.gates[0].type;
            for (const pin of icGatePins(type, slot).inputs) join('gnd', pack.id, pin);
        }
    }

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

    return {spec, chips, packages, inputs, outputs};
}
