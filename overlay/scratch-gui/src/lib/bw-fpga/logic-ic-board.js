// Realise a logic gate as a real 74HC chip on the live breadboard — the same
// "show it in Circuits" path as the CMOS transistor builder (cmos-board.js), one
// rung up: a soldered part instead of six transistors.
//
// Built through the live-circuit API the demo board and the CMOS builder use
// (addPart/addWire), so the result is a real, simulated circuit: power the chip,
// toggle the input switches, and the output LED follows the gate through the
// chip's own digital model.

import {gateToLogicIc} from './logic-ic.js';

/**
 * @param {object} circuit  the live Circuit (window.__circuit): addPart(kind,
 *   params, x, y) → {id}, addWire(idA, tA, idB, tB), removePart(id), and a
 *   `parts` array.
 * @param {string} gateType  not/and/or/nand/nor/xor
 * @param {{clear?: boolean}} [opts]
 * @returns {{gateType, chip:string, inputs:Array, output:{resistor,led}}}
 */
export function buildLogicIcGate (circuit, gateType, {clear = true} = {}) {
    const spec = gateToLogicIc(gateType);
    if (!spec) throw new Error(`No 74xx realisation for "${gateType}" — keep it as logic.`);
    if (!circuit || typeof circuit.addPart !== 'function' || typeof circuit.addWire !== 'function') {
        throw new TypeError('buildLogicIcGate needs a live circuit with addPart/addWire (window.__circuit)');
    }
    if (clear && Array.isArray(circuit.parts) && typeof circuit.removePart === 'function') {
        for (const part of [...circuit.parts]) circuit.removePart(part.id);
    }

    // Collect every terminal on each net, then wire the net as a chain — the
    // same approach cmos-board.js uses, so a net of ideal wires is one node.
    const conn = {};
    const join = (net, id, term) => { (conn[net] = conn[net] || []).push([id, term]); };

    const COL = 130;
    const TOP = 120;
    const BOT = 300;

    // Power rails on the left, the chip in the middle, inputs down the left, the
    // output LED on the right — the shape a breadboard build actually takes.
    const vcc = circuit.addPart('vcc', {}, 60, 40); join('vcc', vcc.id, 'vcc');
    const gnd = circuit.addPart('gnd', {}, 60, BOT + 120); join('gnd', gnd.id, 'gnd');

    const chip = circuit.addPart(spec.chip, {}, 320, (TOP + BOT) / 2);
    join('vcc', chip.id, 'vcc');
    join('gnd', chip.id, 'gnd');

    // Each input: a switch pulling its pin to VCC, a 100 kΩ resistor pulling it to
    // GND — open reads 0, closed reads 1 — exactly the CMOS builder's input stage.
    const inputs = spec.inputs.map((pin, i) => {
        const sy = 120 + i * 110;
        const net = `in${i}`;
        const sw = circuit.addPart('switch', {}, 130, sy);
        join('vcc', sw.id, 'a'); join(net, sw.id, 'b');
        const pull = circuit.addPart('resistor', {ohms: 100000}, 130, sy + 55);
        join(net, pull.id, 'a'); join('gnd', pull.id, 'b');
        join(net, chip.id, pin); // the switch's net IS the chip's input pin
        return {pin, net, switch: sw.id, pulldown: pull.id};
    });

    // The output pin drives a current-limited LED to ground — lit when the gate
    // outputs 1.
    const rightX = 320 + 3 * COL;
    const r = circuit.addPart('resistor', {ohms: 330}, rightX, (TOP + BOT) / 2);
    const led = circuit.addPart('led', {}, rightX + COL, (TOP + BOT) / 2);
    join('__out', chip.id, spec.output); join('__out', r.id, 'a');
    join('__ledn', r.id, 'b'); join('__ledn', led.id, 'anode');
    join('gnd', led.id, 'cathode');

    for (const net of Object.keys(conn)) {
        const cs = conn[net];
        for (let i = 1; i < cs.length; i++) circuit.addWire(cs[i - 1][0], cs[i - 1][1], cs[i][0], cs[i][1]);
    }

    return {gateType, chip: chip.id, inputs, output: {resistor: r.id, led: led.id}};
}
