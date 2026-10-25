/**
 * A logic gate → its TRANSISTOR realisation (CMOS). This is the honest bridge
 * from the FPGA editor (Boolean logic) to the Circuit tab (real components): the
 * Circuit tab has no logic-gate part, but it HAS nmos/pmos transistors, so the
 * way to "build this gate in circuits" is to build the CMOS gate a chip actually
 * uses — a pull-up network of PMOS to VCC and a pull-down network of NMOS to GND.
 *
 * (Honesty: an FPGA implements logic in LUTs, not discrete transistors. This is
 * "here is how this gate is built from transistors" — the silicon underneath the
 * logic — not the FPGA's literal fabric. That framing belongs in any UI.)
 *
 * `gateToCmos(type)` returns a transistor netlist; `switchLevelEval` is a pure
 * switch-level simulator (nmos conducts when its gate is 1, pmos when 0; the
 * output is pulled to whichever rail a conducting path reaches) so the topology
 * is PROVED to compute the gate — no SPICE needed. Framework-free, unit-tested.
 *
 * @module
 */

// A transistor: {kind:'nmos'|'pmos', gate, a, b} conducts between nets a and b
// when its gate net is 1 (nmos) or 0 (pmos). VCC=1, GND=0 are the rails.
const nmos = (gate, a, b) => ({kind: 'nmos', gate, a, b});
const pmos = (gate, a, b) => ({kind: 'pmos', gate, a, b});

/** The CMOS netlist for a gate type. Composite gates chain sub-gates via internal
 *  nets. Returns {inputs, output, transistors}. Null for a type with no CMOS form
 *  here (the caller keeps it as logic). */
export function gateToCmos (type) {
    switch (type) {
    case 'not':
    case 'buffer': {
        // A CMOS inverter: PMOS pulls `n` high when in=0, NMOS pulls it low when in=1.
        const inv = (i, o) => [pmos(i, 'vcc', o), nmos(i, 'gnd', o)];
        if (type === 'not') return {inputs: ['a'], output: 'out', transistors: inv('a', 'out')};
        // buffer = two inverters in series
        return {inputs: ['a'], output: 'out', transistors: [...inv('a', 'n1'), ...inv('n1', 'out')]};
    }
    case 'nand': {
        // pull-up: 2 PMOS in PARALLEL to out; pull-down: 2 NMOS in SERIES to gnd.
        return {inputs: ['a', 'b'], output: 'out', transistors: [
            pmos('a', 'vcc', 'out'), pmos('b', 'vcc', 'out'),
            nmos('a', 'out', 'm'), nmos('b', 'm', 'gnd')
        ]};
    }
    case 'nor': {
        // pull-up: 2 PMOS in SERIES; pull-down: 2 NMOS in PARALLEL.
        return {inputs: ['a', 'b'], output: 'out', transistors: [
            pmos('a', 'vcc', 'm'), pmos('b', 'm', 'out'),
            nmos('a', 'out', 'gnd'), nmos('b', 'out', 'gnd')
        ]};
    }
    case 'and': {
        // NAND then an inverter.
        return {inputs: ['a', 'b'], output: 'out', transistors: [
            pmos('a', 'vcc', 'nd'), pmos('b', 'vcc', 'nd'), nmos('a', 'nd', 'm'), nmos('b', 'm', 'gnd'),
            pmos('nd', 'vcc', 'out'), nmos('nd', 'gnd', 'out')
        ]};
    }
    case 'or': {
        // NOR then an inverter.
        return {inputs: ['a', 'b'], output: 'out', transistors: [
            pmos('a', 'vcc', 'm'), pmos('b', 'm', 'nr'), nmos('a', 'nr', 'gnd'), nmos('b', 'nr', 'gnd'),
            pmos('nr', 'vcc', 'out'), nmos('nr', 'gnd', 'out')
        ]};
    }
    default:
        return null; // xor/xnor/arith/etc. — not given a discrete CMOS form here
    }
}

/**
 * Switch-level simulation of a transistor netlist. A net is 1 if a conducting
 * path reaches VCC, 0 if it reaches GND; transistor conduction depends on gate
 * net values, so it iterates to a fixpoint (composite gates have internal nets).
 *
 * @returns {0|1|undefined} the output net's value (undefined = floating/unresolved)
 */
export function switchLevelEval (netlist, inputs) {
    const val = {vcc: 1, gnd: 0};
    for (const [k, v] of Object.entries(inputs || {})) val[k] = v ? 1 : 0;
    const nets = new Set(['vcc', 'gnd']);
    for (const t of netlist.transistors) { nets.add(t.a); nets.add(t.b); nets.add(t.gate); }

    for (let iter = 0; iter < netlist.transistors.length + 4; iter++) {
        // Conducting transistors, given what we currently know of their gates.
        const edges = [];
        for (const t of netlist.transistors) {
            const g = val[t.gate];
            if (g === undefined) continue;
            const on = t.kind === 'nmos' ? g === 1 : g === 0;
            if (on) edges.push([t.a, t.b]);
        }
        // Which nets a conducting path reaches each rail from.
        const reach = rail => {
            const seen = new Set([rail]);
            const stack = [rail];
            while (stack.length) {
                const n = stack.pop();
                for (const [a, b] of edges) {
                    if (a === n && !seen.has(b)) { seen.add(b); stack.push(b); }
                    if (b === n && !seen.has(a)) { seen.add(a); stack.push(a); }
                }
            }
            return seen;
        };
        const hi = reach('vcc');
        const lo = reach('gnd');
        let changed = false;
        for (const n of nets) {
            if (n === 'vcc' || n === 'gnd' || (inputs && n in inputs)) continue;
            const v = hi.has(n) ? 1 : lo.has(n) ? 0 : undefined;
            if (val[n] !== v) { val[n] = v; changed = true; }
        }
        if (!changed) break;
    }
    return val[netlist.output];
}
