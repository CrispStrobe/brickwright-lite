// Build a logic gate as its CMOS TRANSISTOR circuit on the live Circuit — the
// companion to buildDemoBoard. Where the demo board shows the FPGA driving LEDs,
// this shows what a gate IS underneath: nmos/pmos wired as a pull-up/pull-down
// pair, with a switch per input and an LED on the output, so the SPICE simulator
// runs the actual gate and you can toggle inputs and watch the output.
//
// Built through the same live-circuit API as the demo board (addPart/addWire),
// so it is a real, simulatable circuit, not a picture. See cmos.js for the
// verified netlist and the honesty note (an FPGA uses LUTs, not transistors —
// this is the silicon underneath the logic).

import {gateToCmos} from './cmos.js';

/**
 * @param {object} circuit  the live Circuit (window.__circuit): addPart(kind,
 *   params, x, y) → {id}, addWire(idA, tA, idB, tB), removePart(id), `parts`.
 * @param {string} gateType  not/buffer/nand/nor/and/or
 * @param {{clear?: boolean}} [opts]
 * @returns {{gateType, transistors:Array, inputs:Array, output:object}}
 */
export function buildCmosGate (circuit, gateType, {clear = true} = {}) {
    const netlist = gateToCmos(gateType);
    if (!netlist) throw new Error(`No CMOS realisation for "${gateType}" — keep it as logic.`);
    if (!circuit || typeof circuit.addPart !== 'function' || typeof circuit.addWire !== 'function') {
        throw new TypeError('buildCmosGate needs a live circuit with addPart/addWire (window.__circuit)');
    }
    if (clear && Array.isArray(circuit.parts) && typeof circuit.removePart === 'function') {
        for (const part of [...circuit.parts]) circuit.removePart(part.id);
    }

    // Collect every terminal on each net, then wire the net up as a chain.
    const conn = {};
    const join = (net, id, term) => { (conn[net] = conn[net] || []).push([id, term]); };
    // A readable CMOS-schematic layout: VCC top-left, GND bottom-left, inputs down
    // the left, the PMOS pull-up network in a top row, the NMOS pull-down below it,
    // and the output LED at the right — the shape a textbook draws.
    const COL = 130;
    const TOP = 120;
    const BOT = 300;
    const nP = netlist.transistors.filter(t => t.kind === 'pmos').length;
    const nN = netlist.transistors.filter(t => t.kind === 'nmos').length;
    const rightX = 300 + Math.max(nP, nN) * COL;
    let pi = 0; let ni = 0;

    const vcc = circuit.addPart('vcc', {}, 60, 40); join('vcc', vcc.id, 'vcc');
    const gnd = circuit.addPart('gnd', {}, 60, BOT + 100); join('gnd', gnd.id, 'gnd');

    const transistors = netlist.transistors.map(t => {
        const px = 300 + (t.kind === 'pmos' ? pi++ : ni++) * COL;
        const py = t.kind === 'pmos' ? TOP : BOT;
        const p = circuit.addPart(t.kind, {}, px, py);
        join(t.gate, p.id, 'gate');
        // The netlist's `a` is the high-side channel terminal (VCC for a pull-up
        // PMOS, the drain for a pull-down NMOS) and `b` the low side —
        // switchLevelEval treats them symmetrically. The SPICE model does NOT: a
        // MOSFET's threshold is referenced to its SOURCE. For an NMOS the source
        // is the low side (b); for a PMOS the source is the HIGH side (a). Mapping
        // a→drain, b→source for both left every pull-up PMOS with source on the
        // output node, so as the NMOS pulled the output down the PMOS's Vgs rose
        // toward its threshold and it LEAKED — the output stuck ~4 V instead of
        // reaching ground, and the gate's LED never went dark. Assign source to
        // the correct side per kind.
        if (t.kind === 'pmos') { join(t.a, p.id, 'source'); join(t.b, p.id, 'drain'); }
        else { join(t.a, p.id, 'drain'); join(t.b, p.id, 'source'); }
        return {id: p.id, kind: t.kind};
    });

    // Each input: a switch pulling the net to VCC, a resistor pulling it to GND —
    // so an open switch reads 0 and a closed one reads 1. Stacked down the left.
    const inputs = netlist.inputs.map((net, i) => {
        const sy = 120 + i * 110;
        const sw = circuit.addPart('switch', {}, 130, sy);
        join('vcc', sw.id, 'a'); join(net, sw.id, 'b');
        const pull = circuit.addPart('resistor', {ohms: 100000}, 130, sy + 55);
        join(net, pull.id, 'a'); join('gnd', pull.id, 'b');
        return {net, switch: sw.id, pulldown: pull.id};
    });

    // The output: a current-limited LED to ground, lit when the gate outputs 1.
    const r = circuit.addPart('resistor', {ohms: 330}, rightX, (TOP + BOT) / 2);
    join(netlist.output, r.id, 'a');
    const led = circuit.addPart('led', {}, rightX + COL, (TOP + BOT) / 2);
    join('__ledn', r.id, 'b'); join('__ledn', led.id, 'anode'); join('gnd', led.id, 'cathode');

    // Wire each net: chain its terminals together (A–B, B–C, …); the solver
    // treats a chain of ideal wires as one node.
    for (const net of Object.keys(conn)) {
        const cs = conn[net];
        for (let i = 1; i < cs.length; i++) circuit.addWire(cs[i - 1][0], cs[i - 1][1], cs[i][0], cs[i][1]);
    }

    return {gateType, transistors, inputs, output: {resistor: r.id, led: led.id}};
}
