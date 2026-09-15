/**
 * The pin bridge: a design's top-level ports -> real terminals on a board part.
 *
 * TN2b of docs/TANG-NANO.md, and the reason the FPGA work is part of THIS app
 * rather than a separate one. "Write Verilog, watch it light an LED on the
 * breadboard beside it" needs exactly one thing that does not exist anywhere
 * else: a mapping from an HDL port, through a Gowin pin number, to a terminal
 * the circuit engine can drive and read.
 *
 * WHAT THIS DOES NOT DO, on purpose: it does not simulate. It answers "can this
 * port reach the board, and where" and nothing else, so it is useful before
 * synthesis (TN3) or any gate-level tier (digitaljs) exists, and stays useful
 * after.
 *
 * THE DISTINCTION THAT MATTERS. A pin can be perfectly valid silicon and still
 * be unreachable on a breadboard. The Tang Nano 20K's HDMI pairs (33-40), its
 * 27 MHz clock (4), its UART (69/70) and its SPI flash (59-62) are all real
 * FPGA pins that are NOT on either header. A design that places a port there is
 * not wrong -- it just cannot be wired to an LED, and saying so early is the
 * whole value.
 *
 * Refusals are NAMED, never silent, matching the execution-policy contract that
 * an unavailable request returns a reason rather than degrading.
 *
 * @module
 */

import {splitBit} from './cst.js';

/** Terminals of a board part, indexed by the FPGA pin they expose. */
export function pinIndex (part) {
    const byPin = new Map();
    for (const t of part?.terminals || []) {
        if (typeof t._fpgaPin === 'number') byPin.set(t._fpgaPin, t);
    }
    return byPin;
}

const sharesOnboard = terminal => /also drives the onboard/i.test(terminal?._note || '');

/**
 * Bind parsed constraints to a board part.
 *
 * @returns {{bindings: Array, refusals: Array, warnings: Array}}
 *   bindings  port -> {port, base, index, pin, terminal, sharedWith}
 *   refusals  a port that cannot reach this board, each with a code and reason
 *   warnings  a port that reaches it but with a caveat the user should read
 */
export function bindPorts (constraints, part, {ioStandard = 'LVCMOS33'} = {}) {
    const byPin = pinIndex(part);
    const bindings = [];
    const refusals = [];
    const warnings = [];
    const claimed = new Map();

    const entries = constraints instanceof Map
        ? Array.from(constraints.values())
        : Array.from(constraints || []);

    for (const c of entries) {
        const {base, index} = splitBit(c.port);
        for (const pin of c.pins || []) {
            const terminal = byPin.get(pin);

            if (!terminal) {
                refusals.push({code: 'pin-not-on-header', port: c.port, pin,
                    reason: `Pin ${pin} is not brought out to a header on ${part?.kind}. `
                        + 'It may still be a valid FPGA pin -- the HDMI pairs, the clock input, '
                        + 'the UART and the SPI flash all are -- but nothing on the breadboard '
                        + 'can reach it.'});
                continue;
            }

            const already = claimed.get(pin);
            if (already) {
                refusals.push({code: 'pin-claimed-twice', port: c.port, pin,
                    reason: `Pin ${pin} is already placed by "${already}". Two ports driving one `
                        + 'pin is a short on real silicon, not a last-one-wins.'});
                continue;
            }
            claimed.set(pin, c.port);

            const standard = c.attrs?.IO_TYPE;
            if (standard && standard.toUpperCase() !== ioStandard.toUpperCase()) {
                warnings.push({code: 'io-standard-mismatch', port: c.port, pin,
                    reason: `"${c.port}" asks for IO_TYPE=${standard}, but every header bank on `
                        + `${part?.kind} is ${ioStandard}. The pin will not drive the level you expect.`});
            }

            if (sharesOnboard(terminal)) {
                warnings.push({code: 'shares-onboard-hardware', port: c.port, pin,
                    terminal: terminal.name,
                    reason: `Pin ${pin} (${terminal.name}) also drives onboard hardware, so this port `
                        + 'moves the board\'s own LED as well as whatever is wired to the header.'});
            }

            bindings.push({port: c.port, base, index, pin,
                terminal: terminal.name,
                sharedWith: sharesOnboard(terminal) ? (terminal._note || null) : null});
        }
    }

    bindings.sort((a, b) => a.pin - b.pin);
    return {bindings, refusals, warnings};
}

/**
 * The whole question in one call: which ports of this design reach this board?
 * `netlistPorts` is optional; when given (a Yosys JSON `modules[top].ports`
 * object, or any {name: {direction}} map) a constrained port that the design
 * does not declare is refused rather than bound to nothing.
 */
export function bridge ({constraints, part, netlistPorts = null, ioStandard} = {}) {
    const result = bindPorts(constraints, part, {ioStandard});

    if (netlistPorts) {
        const declared = new Set(Object.keys(netlistPorts));
        const kept = [];
        for (const b of result.bindings) {
            if (declared.has(b.base) || declared.has(b.port)) {
                kept.push({...b, direction: (netlistPorts[b.base] || netlistPorts[b.port])?.direction ?? null});
                continue;
            }
            result.refusals.push({code: 'port-not-in-design', port: b.port, pin: b.pin,
                reason: `The constraints place "${b.port}", but the design does not declare it. `
                    + 'A constraint for a port that no longer exists is how a rename silently '
                    + 'unplugs a signal.'});
        }
        result.bindings = kept;

        for (const name of declared) {
            if (!result.bindings.some(b => b.base === name || b.port === name)) {
                result.refusals.push({code: 'port-unplaced', port: name,
                    reason: `The design declares "${name}" but nothing places it, so it reaches no pin.`});
            }
        }
    }

    return result;
}
