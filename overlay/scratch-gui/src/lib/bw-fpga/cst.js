/**
 * Gowin constraint (.cst) parsing — pure text in, plain data out.
 *
 * A .cst is how a Gowin design says which FPGA pin a top-level port lands on,
 * and it is the ONLY place that information exists: a Verilog module declares
 * `output led`, and nothing in the HDL says that `led` is pin 15. Synthesis
 * does not invent it either. So any bridge from a design to a real board runs
 * through this file.
 *
 * Deliberately no I/O, no FPGA knowledge and no board knowledge: it reports
 * what the text says, and port-bridge.js decides whether that is reachable.
 *
 * The two directives that matter:
 *
 *   IO_LOC  "led[0]" 15;
 *   IO_PORT "led[0]" IO_TYPE=LVCMOS33 PULL_MODE=NONE DRIVE=8;
 *
 * @module
 */

const LINE_COMMENT = /\/\/.*$|#.*$/;
const IO_LOC = /^IO_LOC\s+"([^"]+)"\s+([0-9,\s]+);?$/i;
const IO_PORT = /^IO_PORT\s+"([^"]+)"\s+(.*?);?$/i;

/** Split `name[3]` into its base and index; a plain name has index null. */
export function splitBit (port) {
    const m = /^(.*?)\[(\d+)\]$/.exec(port);
    return m ? {base: m[1], index: Number(m[2])} : {base: port, index: null};
}

/**
 * Parse a .cst into `{constraints, problems}`.
 *
 * A malformed line is a NAMED problem carrying its line number, never a silent
 * skip: a dropped constraint is a port that quietly goes nowhere, which is the
 * failure this whole layer exists to make impossible.
 */
export function parseCst (text) {
    const constraints = new Map();
    const problems = [];
    const lines = String(text ?? '').split(/\r?\n/);

    lines.forEach((raw, i) => {
        const line = raw.replace(LINE_COMMENT, '').trim();
        if (!line) return;
        const lineNumber = i + 1;

        const loc = IO_LOC.exec(line);
        if (loc) {
            const port = loc[1];
            const pins = loc[2].split(',').map(p => p.trim()).filter(Boolean);
            if (!pins.length || pins.some(p => !/^\d+$/.test(p))) {
                problems.push({code: 'bad-pin', lineNumber, port,
                    reason: `IO_LOC for "${port}" does not name a numeric pin.`});
                return;
            }
            if (constraints.has(port)) {
                problems.push({code: 'duplicate-port', lineNumber, port,
                    reason: `"${port}" is placed more than once; the later IO_LOC wins in Gowin, `
                        + 'so the two lines disagree about where the signal goes.'});
            }
            const existing = constraints.get(port) || {};
            constraints.set(port, {...existing, port, pins: pins.map(Number), lineNumber});
            return;
        }

        const io = IO_PORT.exec(line);
        if (io) {
            const port = io[1];
            const attrs = {};
            for (const m of io[2].matchAll(/([A-Za-z_][\w]*)\s*=\s*([^\s;]+)/g)) {
                attrs[m[1].toUpperCase()] = m[2];
            }
            const existing = constraints.get(port) || {port, pins: []};
            constraints.set(port, {...existing, attrs});
            return;
        }

        problems.push({code: 'unparsed-line', lineNumber,
            reason: `Not an IO_LOC or IO_PORT directive: ${line}`});
    });

    // A port given attributes but never placed is the quiet failure case: it
    // looks configured and lands nowhere.
    for (const c of constraints.values()) {
        if (!c.pins || !c.pins.length) {
            problems.push({code: 'port-not-placed', port: c.port,
                reason: `"${c.port}" has IO_PORT attributes but no IO_LOC, so it is not on any pin.`});
        }
    }

    return {constraints, problems};
}
