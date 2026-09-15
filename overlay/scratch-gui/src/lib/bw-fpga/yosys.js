/**
 * Reading top-level ports out of a Yosys JSON netlist.
 *
 * `yosys -p 'synth_gowin -json out.json' design.v` produces this, and it is the
 * only artefact that says what a design's ports ARE. The .cst says where they
 * go; this says whether they exist. Holding both is what lets the bridge catch
 * the rename that silently unplugs a signal.
 *
 * Pure parsing: no Yosys, no toolchain, no network. A netlist is JSON, and
 * reading the port list out of it is not the expensive part of synthesis --
 * which is why this works today, long before TN3 has anywhere to run.
 *
 * SHAPE, from Yosys's own writer:
 *   { "modules": { "top": { "attributes": {"top": 1},
 *       "ports": { "led": {"direction": "output", "bits": [2]} } } } }
 *
 * Buses are ONE port with several bits, not led[0]/led[1] entries -- the .cst
 * spells them per bit, so widths are carried here and matched there.
 *
 * @module
 */

const DIRECTIONS = new Set(['input', 'output', 'inout']);

/** The module Yosys marked `(* top *)`, else the only one, else null. */
export function topModule (netlist) {
    const modules = netlist && netlist.modules;
    if (!modules || typeof modules !== 'object') return null;
    const names = Object.keys(modules);
    const marked = names.filter(n => {
        const attrs = (modules[n] && modules[n].attributes) || {};
        return attrs.top === 1 || attrs.top === '1' || attrs.top === true;
    });
    if (marked.length === 1) return {name: marked[0], module: modules[marked[0]]};
    if (marked.length > 1) return null;
    if (names.length === 1) return {name: names[0], module: modules[names[0]]};
    return null;
}

/**
 * @returns {{top: string|null, ports: Object, problems: Array}}
 *   ports is {name: {direction, width, bits}} -- the shape bridge() expects.
 */
export function readPorts (netlist) {
    const problems = [];
    const top = topModule(netlist);

    if (!top) {
        const count = Object.keys((netlist && netlist.modules) || {}).length;
        problems.push({code: 'no-top-module',
            reason: count === 0
                ? 'The netlist has no modules. Synthesis produced nothing to place.'
                : `The netlist has ${count} modules and none is uniquely marked top, so it is `
                    + 'ambiguous which one the constraints are for.'});
        return {top: null, ports: {}, problems};
    }

    const ports = {};
    const declared = (top.module && top.module.ports) || {};
    for (const [name, p] of Object.entries(declared)) {
        const direction = String((p && p.direction) || '').toLowerCase();
        if (!DIRECTIONS.has(direction)) {
            problems.push({code: 'unknown-direction', port: name,
                reason: `"${name}" has direction "${p && p.direction}", which is not input, `
                    + 'output or inout.'});
            continue;
        }
        const bits = Array.isArray(p.bits) ? p.bits : [];
        ports[name] = {direction, width: bits.length || 1, bits};
    }

    if (!Object.keys(ports).length) {
        problems.push({code: 'no-ports',
            reason: `Module "${top.name}" declares no ports, so nothing can reach a pin.`});
    }

    return {top: top.name, ports, problems};
}

/**
 * Widths declared by the design vs bits placed by the constraints.
 * A 4-bit bus with three IO_LOC lines is a real and easy mistake, and it is
 * invisible unless someone counts.
 */
export function checkWidths (ports, bindings) {
    const placed = new Map();
    for (const b of bindings || []) {
        placed.set(b.base, (placed.get(b.base) || 0) + 1);
    }
    const problems = [];
    for (const [name, p] of Object.entries(ports || {})) {
        const got = placed.get(name) || 0;
        if (got && got !== p.width) {
            problems.push({code: 'width-mismatch', port: name,
                reason: `"${name}" is ${p.width} bit(s) wide in the design but ${got} `
                    + 'bit(s) are placed. The unplaced bits reach no pin.'});
        }
    }
    return problems;
}
