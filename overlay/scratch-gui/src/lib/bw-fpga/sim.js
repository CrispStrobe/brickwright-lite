/**
 * The gate-level tier: simulating a synthesised design, gate by gate.
 *
 * This is the piece that gives the pin bridge something to drive. port-bridge.js
 * says where a port lands and drive.js puts a value on it; until now nothing
 * produced the values, so every output correctly read "undriven". This produces
 * them.
 *
 * WHAT IT WRAPS, and the two subpaths that matter:
 *
 *   digitaljs        -> its HEADLESS core (lib/circuit.js). The package's
 *                       `browser` entry is the full visual editor, which pulls
 *                       jquery-ui AND elkjs; elkjs is EPL-2.0 and outside our
 *                       allowed set. The headless core reaches neither. Webpack
 *                       is aliased to it deliberately; see webpack.config.js.
 *   yosys2digitaljs  -> its `core` subpath (dist/core.js), the pure Yosys-JSON
 *                       to digitaljs-JSON conversion. The `node` subpath shells
 *                       out to Yosys and pulls temp-file dependencies, one of
 *                       which is WTFPL-only. `core` requires exactly 3vl
 *                       (BSD-2), big-integer (Unlicense) and hashmap (MIT).
 *
 * Neither alias is cosmetic: taking the default entry of either package pulls
 * in licences we do not ship and megabytes we do not need.
 *
 * WHY THE ENGINE IS INJECTED RATHER THAN IMPORTED HERE. digitaljs's `node`
 * export condition points at its ESM source, which fails to load under Node at
 * all -- `@joint/core` is CommonJS and does not provide the named exports that
 * source destructures. Its working CommonJS build is not deep-importable either,
 * because the package's `exports` map declares no subpaths
 * (ERR_PACKAGE_PATH_NOT_EXPORTED). So there is no single specifier that works in
 * both Node and a webpack browser build.
 *
 * Passing the class in solves that and is better anyway: this module holds the
 * simulation LOGIC and no third-party import, so the tests exercise it without
 * the dependency, and the one licence-sensitive import lives at the single call
 * site that knows which build it is on.
 *
 * WHAT THIS DOES NOT DO. It does not synthesise -- a Yosys netlist has to come
 * from somewhere, which is TN3. It does not model timing: gate-level here means
 * logic and nets, evaluated to a settled state, which is exactly what the
 * `gate-level` MACHINE_SEMANTICS value was added to mean and no more.
 *
 * @module
 */

import {Vector3vl} from '3vl';
import {yosys2digitaljs} from 'yosys2digitaljs/core';

/** Settling is bounded: a design with a combinational loop must not hang the tab. */
const MAX_SETTLE_STEPS = 10000;

/**
 * Convert a Yosys netlist into a digitaljs circuit.
 * @returns {{circuit: object|null, problems: Array}}
 */
export function fromYosys (netlist) {
    try {
        return {circuit: yosys2digitaljs(netlist), problems: []};
    } catch (e) {
        return {circuit: null, problems: [{code: 'conversion-failed',
            reason: `The netlist could not be converted for simulation: ${e.message}`}]};
    }
}

/**
 * A settled gate-level simulation of one design.
 *
 * Inputs are set by PORT NAME, which is the same name the .cst places and the
 * bridge binds, so the three layers agree without a translation table.
 */
export class GateLevelSim {
    /**
     * @param {object} circuitJson  a digitaljs circuit
     * @param {{HeadlessCircuit: Function}} engine  digitaljs's headless core
     */
    constructor (circuitJson, engine) {
        if (!engine || typeof engine.HeadlessCircuit !== 'function') {
            throw new TypeError('GateLevelSim needs digitaljs\'s HeadlessCircuit passed in; '
                + 'see the module comment for why it is not imported here.');
        }
        this._circuit = new engine.HeadlessCircuit(circuitJson);
        this._settleFailed = false;
    }

    /** Drive one input port from a boolean, a number or a bit string. */
    setInput (port, value, bits = 1) {
        const bin = typeof value === 'string'
            ? value.padStart(bits, '0')
            : (typeof value === 'number' ? value : (value ? 1 : 0))
                .toString(2).padStart(bits, '0').slice(-bits);
        this._circuit.setInput(port, Vector3vl.fromBin(bin, bits));
        return this;
    }

    /**
     * Run until nothing is pending.
     * A combinational loop never settles, so this is BOUNDED and reports rather
     * than spinning: an unsettled result is not a wrong answer, it is no answer.
     */
    settle () {
        let steps = 0;
        while (this._circuit.hasPendingEvents) {
            if (++steps > MAX_SETTLE_STEPS) {
                this._settleFailed = true;
                return {settled: false, steps,
                    reason: `The design did not settle in ${MAX_SETTLE_STEPS} steps. `
                        + 'That is usually a combinational loop — a gate whose output feeds '
                        + 'its own input with nothing clocked in between.'};
            }
            this._circuit.updateGates();
        }
        this._settleFailed = false;
        return {settled: true, steps};
    }

    /**
     * Advance a clocked design by whole clock cycles.
     *
     * The clock is a top-level INPUT port -- the .cst places it on a pin, the
     * bridge binds it, and here we drive it -- NOT a free-running device. So time
     * is exactly the edges we apply: each cycle drives the clock low then high,
     * settling after each edge so a posedge-triggered flip-flop captures. That is
     * what lets the tab single-step a counter and read the board between clicks.
     *
     * BOUNDED like {@link settle}: if any edge fails to settle the run stops at
     * that cycle and reports, rather than spinning. `cycles` in the result is how
     * many completed.
     * @returns {{settled: boolean, cycles: number, steps: number, reason?: string}}
     */
    tickClock (clockPort, cycles = 1) {
        let steps = 0;
        for (let i = 0; i < cycles; i++) {
            for (const level of [0, 1]) {
                this.setInput(clockPort, level, 1);
                const r = this.settle();
                steps += r.steps;
                if (!r.settled) {
                    return {settled: false, cycles: i, steps, reason: r.reason};
                }
            }
        }
        this._settleFailed = false;
        return {settled: true, cycles, steps};
    }

    /** One output port, as a bit string ('0', '1', 'x' for undefined). */
    getOutput (port) {
        return this._circuit.getOutput(port).toBin();
    }

    /**
     * Every output, as {port: boolean} — the shape drive.js consumes.
     * A bit that is not a clean 0 or 1 is OMITTED rather than coerced: an
     * undefined signal is not a low one, and inventing a level here would put a
     * confident wrong value on a real pin.
     */
    outputValues (ports) {
        const values = {};
        const undefined_ = [];
        for (const [name, p] of Object.entries(ports || {})) {
            if (p.direction !== 'output') continue;
            let bin;
            try {
                bin = this.getOutput(name);
            } catch {
                continue;
            }
            if (/[^01]/.test(bin)) {
                undefined_.push({code: 'undefined-output', port: name,
                    reason: `"${name}" settled to ${bin}, which is not a driven level. `
                        + 'It is left off the board rather than guessed at.'});
                continue;
            }
            values[name] = bin.length === 1 ? bin === '1' : parseInt(bin, 2);
        }
        return {values, problems: undefined_};
    }
}
