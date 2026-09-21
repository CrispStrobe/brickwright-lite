/**
 * Driving bound ports into the circuit engine — the far end of the pin bridge.
 *
 * port-bridge.js answers "where does this port land". This answers "and now
 * make the breadboard see it". Together they are the whole of TN2b: an FPGA
 * design's output moving a real LED on the virtual breadboard beside it.
 *
 * Gowin I/O is push-pull CMOS, so an output is 'pushpull' and an input is
 * 'input' (high-Z from the circuit's side). There is no open-drain mode here
 * because the bridge does not yet read IO_TYPE's drive attributes -- when it
 * does, that belongs in this function and nowhere else.
 *
 * This module holds no simulation of its own. The design's port VALUES come
 * from whatever is modelling the fabric (nothing, today; digitaljs over a Yosys
 * netlist, later), and the engine does the electrical work. That separation is
 * why this file stays small and stays true when the tier above it changes.
 *
 * @module
 */

/** Resolve one binding's bit out of a {port: value} map. */
function bitFor (binding, values) {
    if (Object.prototype.hasOwnProperty.call(values, binding.port)) {
        return {found: true, value: Boolean(values[binding.port])};
    }
    if (!Object.prototype.hasOwnProperty.call(values, binding.base)) {
        return {found: false, value: false};
    }
    const raw = values[binding.base];
    if (binding.index === null) return {found: true, value: Boolean(raw)};
    if (Array.isArray(raw)) return {found: true, value: Boolean(raw[binding.index])};
    if (typeof raw === 'number') {
        return {found: true, value: Boolean((raw >>> binding.index) & 1)};
    }
    if (typeof raw === 'string') {
        // "1011", MSB first, the way a waveform is usually written down.
        const bit = raw[raw.length - 1 - binding.index];
        return {found: true, value: bit === '1'};
    }
    return {found: true, value: Boolean(raw)};
}

/**
 * Apply port values to a circuit through bound terminals.
 *
 * @param {{setPin: Function}} circuit  a bw-circuit-ui Circuit (or anything
 *   exposing setPin(terminal, mode, driveHigh))
 * @param {Array} bindings  from bridge()/bindPorts()
 * @param {Object} values   {portOrBase: boolean|number|array|string}
 * @returns {{applied: Array, unset: Array}} unset names a binding no value
 *   covered, so a half-driven design is visible rather than silently floating.
 */
export function applyPortValues (circuit, bindings, values = {}) {
    const applied = [];
    const unset = [];

    for (const b of bindings || []) {
        if (b.direction === 'input') {
            // The design READS this pin, so the FPGA must not drive it: high-Z
            // and let the breadboard decide the level.
            circuit.setPin(b.terminal, 'input');
            applied.push({...b, mode: 'input', driveHigh: null});
            continue;
        }
        const {found, value} = bitFor(b, values);
        if (!found) {
            unset.push({code: 'no-value-for-port', port: b.port, terminal: b.terminal,
                reason: `Nothing drives "${b.port}", so ${b.terminal} was left as it was. `
                    + 'An undriven output is a floating pin, not a low one.'});
            continue;
        }
        circuit.setPin(b.terminal, 'pushpull', value);
        applied.push({...b, mode: 'pushpull', driveHigh: value});
    }

    return {applied, unset};
}

/**
 * Read the circuit BACK into the design — the other half of the loop. For each
 * INPUT binding the design reads (its pin left high-Z by applyPortValues), read
 * the level the breadboard is driving onto that pin via `board.readPin(terminal)`
 * and assemble it into the design's input values. So a button/switch wired to an
 * input pin drives the FPGA logic, and its outputs light the LEDs — a real
 * hardware sandbox, both directions.
 *
 * @param {Array} bindings  from bridge() (carry `direction`)
 * @param {{readPin: Function}} board  exposes readPin(terminal) → 0|1
 * @returns {Object} {portOrBase: 0|1|number} — buses assembled LSB-first by bit index
 */
export function readBoardInputs (bindings, board) {
    const out = {};
    if (!board || typeof board.readPin !== 'function') return out;
    const buses = {};
    for (const b of bindings || []) {
        if (b.direction !== 'input') continue;
        let bit;
        try { bit = board.readPin(b.terminal) ? 1 : 0; } catch (e) { continue; } // unknown/unwired pin
        if (b.index === undefined || b.index === null) out[b.port] = bit;
        else { (buses[b.base] = buses[b.base] || {})[b.index] = bit; }
    }
    for (const [base, bits] of Object.entries(buses)) {
        let v = 0;
        for (const [i, val] of Object.entries(bits)) v |= (val << Number(i));
        out[base] = v;
    }
    return out;
}
