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
    let x = 60; let y = 60;
    const at = () => { const p = [x, y]; x += 100; if (x > 560) { x = 60; y += 100; } return p; };

    const vcc = circuit.addPart('vcc', {}, ...at()); join('vcc', vcc.id, 'vcc');
    const gnd = circuit.addPart('gnd', {}, ...at()); join('gnd', gnd.id, 'gnd');

    // The transistors: nmos/pmos, terminals gate/drain/source (a=drain, b=source).
    const transistors = netlist.transistors.map(t => {
        const [px, py] = at();
        const p = circuit.addPart(t.kind, {}, px, py);
        join(t.gate, p.id, 'gate');
        join(t.a, p.id, 'drain');
        join(t.b, p.id, 'source');
        return {id: p.id, kind: t.kind};
    });

    // Each input: a switch pulling the net to VCC, a resistor pulling it to GND —
    // so an open switch reads 0 and a closed one reads 1.
    const inputs = netlist.inputs.map(net => {
        const sw = circuit.addPart('switch', {}, ...at());
        join('vcc', sw.id, 'a'); join(net, sw.id, 'b');
        const pull = circuit.addPart('resistor', {ohms: 100000}, ...at());
        join(net, pull.id, 'a'); join('gnd', pull.id, 'b');
        return {net, switch: sw.id, pulldown: pull.id};
    });

    // The output: a current-limited LED to ground, lit when the gate outputs 1.
    const r = circuit.addPart('resistor', {ohms: 330}, ...at());
    join(netlist.output, r.id, 'a');
    const led = circuit.addPart('led', {}, ...at());
    join('__ledn', r.id, 'b'); join('__ledn', led.id, 'anode'); join('gnd', led.id, 'cathode');

    // Wire each net: chain its terminals together (A–B, B–C, …); the solver
    // treats a chain of ideal wires as one node.
    for (const net of Object.keys(conn)) {
        const cs = conn[net];
        for (let i = 1; i < cs.length; i++) circuit.addWire(cs[i - 1][0], cs[i - 1][1], cs[i][0], cs[i][1]);
    }

    return {gateType, transistors, inputs, output: {resistor: r.id, led: led.id}};
}
