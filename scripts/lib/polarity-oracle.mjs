/**
 * The polarity oracle: load a bench THE WAY THE APP LOADS IT, then ask the
 * solver which level lights each declared LED.
 *
 * WHY THIS REPLACED A HAND-ROLLED HARNESS. The first census rebuilt a netlist
 * from `circuit.*.json` itself — filtering breadboards, calling
 * `terminalsForKind`, assembling nets from wires. It refused 65 of 947 shipped
 * benches, and for hours those 65 read as a fact about the corpus rather than a
 * property of the instrument. `Circuit.fromJSON`, which is what the designer
 * actually calls, builds 947 of 947. A sweep that reconstructs what the
 * application already knows how to construct will disagree with the application,
 * silently, on exactly the inputs it cannot handle.
 *
 * The refinement that completes that rule: being the product's code is not
 * enough, it has to be the product's code ON THE PATH IN QUESTION. The first
 * census was correct code asking a question the app never asks. This module is
 * right only because the circuit designer genuinely loads benches through
 * `Circuit.fromJSON`, which was checked rather than assumed.
 *
 * WHAT ELSE DISAPPEARED. The old harness found an LED's pin by tracing wires one
 * hop at a time through a resistor, after first trying to match `LED_<declared
 * name>` lexically. Both were guesses about convention. Here the PIN comes from
 * the declaration, which is authoritative, and the LED is whichever one responds
 * when that pin is driven. That is the question a learner's eye asks and it needs
 * no convention at all.
 */
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

/**
 * Wire up bw-circuit-ui exactly as `test/circuit-corpus-invariants.test.mjs`
 * does. Kept in one place so a sweep cannot drift from the gate.
 *
 * @param {string} root repository root
 * @returns {Promise<{Circuit: Function}>} the circuit model, engine injected
 */
export async function loadCircuitModel (root) {
    const cui = path.join(root, 'node_modules/bw-circuit-ui/src');
    const bwb = path.join(root, 'node_modules/bw-board/src');
    const {setEngine} = await import(path.join(cui, 'engine.js'));
    const {BoardImpl} = await import(path.join(bwb, 'board.js'));
    const {inferNetlist, checkWiring} = await import(path.join(bwb, 'infer-netlist.js'));
    const {hasDevice, getDevice} = await import(path.join(bwb, 'devices.js'));
    (await import(path.join(bwb, 'register-all.js'))).registerAllDevices();
    setEngine({
        BoardImpl, inferNetlist, checkWiring, hasDevice,
        getDevice: kind => (kind === 'stc_mcu' ? null : getDevice(kind))
    });
    const {registerSidecar} = await import(path.join(cui, 'model/parts-registry.js'));
    for (const name of readdirSync(path.join(cui, 'parts-data'))) {
        if (!name.endsWith('.json')) continue;
        const sidecar = JSON.parse(readFileSync(path.join(cui, 'parts-data', name), 'utf8'));
        if (sidecar.kind) registerSidecar(sidecar);
    }
    const {Circuit} = await import(path.join(cui, 'model/circuit.js'));
    return {Circuit};
}

const SETTLE_NS = 50_000_000n;   // 50 ms — the LED integrator needs time to sample

/**
 * Drive one pin both ways and report which LED answered, and how.
 *
 * Returns `{led, wiring}` when exactly one interpretation survives, and a
 * REASON otherwise. It never returns a polarity it did not observe: an LED that
 * is dark at both levels and one that is lit at both are different states, and
 * neither is "active high by default".
 *
 * @param {object} circuit a Circuit from fromJSON
 * @param {string} pin the header name the program declares (P1.0, d13, gp15…)
 * @param {string[]} ledIds candidate LED part ids
 * @returns {{led?: string, wiring?: string, reason?: string}}
 */
export function driveAndRead (circuit, pin, ledIds) {
    const board = circuit.board;
    const read = id => {
        try {
            const v = board.ledBrightness(id);
            return typeof v === 'number' ? v : null;
        } catch { return null; }
    };
    let low, high;
    try {
        circuit.setPin(pin, 'pushpull', false);
        circuit.advanceTo(board.timeNs + SETTLE_NS);
        low = ledIds.map(read);
        circuit.setPin(pin, 'pushpull', true);
        circuit.advanceTo(board.timeNs + SETTLE_NS);
        high = ledIds.map(read);
    } catch (e) {
        return {reason: `driving ${pin} threw: ${String(e.message).replace(/\s+/g, ' ').slice(0, 60)}`};
    }
    const lit = v => typeof v === 'number' && v > 0.01;
    const moved = [];
    for (let i = 0; i < ledIds.length; i++) {
        if (lit(low[i]) !== lit(high[i])) moved.push({id: ledIds[i], low: low[i], high: high[i]});
    }
    if (moved.length === 0) return {reason: 'no LED changed when the pin was driven'};
    // More than one LED on a pin is a real circuit (a bar graph, a bus). It is
    // not ambiguity about POLARITY unless they disagree with each other, which
    // would be a genuinely strange bench and is reported rather than averaged.
    const wirings = new Set(moved.map(m => (lit(m.low) ? 'active-low' : 'active-high')));
    if (wirings.size > 1) {
        return {reason: `LEDs on ${pin} disagree about polarity: ${moved.map(m => m.id).join(', ')}`};
    }
    return {led: moved.map(m => m.id).join('+'), wiring: [...wirings][0]};
}

/**
 * Every LED part id in a loaded circuit.
 *
 * @param {object} circuit a Circuit from fromJSON
 * @returns {string[]} part ids
 */
export const ledIdsOf = circuit => (circuit.parts || [])
    .filter(p => p.kind === 'led')
    .map(p => p.id);
