// Run-on-CP/M: run a real Z80 CP/M `.COM` in the browser and read back the disk
// afterwards — the Z80/CP/M twin of `dos-compile.js`, and the primitive behind a
// code-tab "ACK Pascal/C via CP/M" route (ACK cross-compiles a Z80 CP/M `.COM`
// on the host; this runs it).
//
// It rests entirely on the pinned bw-board Z80 machine plus the lite BDOS layer
// (`cpm-z80.js`): no CP/M image, no pin bump. Mount inputs in the `files` Map,
// run, read outputs back out of the same Map.

import {createCpmZ80Bench} from './cpm-z80-bench.js';

const asKeyBytes = k => (typeof k === 'string'
    ? [...k].map(c => c.charCodeAt(0))
    : Array.isArray(k) ? k : []);

const asFileBytes = d => (d instanceof Uint8Array ? d
    : typeof d === 'string' ? new TextEncoder().encode(d)
        : new Uint8Array(d || 0));

/**
 * Run one Z80 CP/M program to completion with a mounted disk, and return the
 * disk afterwards (so a caller reads back files the program wrote) plus its
 * console output. Same shape as `runDosProgram`.
 *
 * @param {object} opts
 * @param {Uint8Array} opts.bytes the `.COM` image (loads at 0x0100)
 * @param {Map<string,Uint8Array>|Record<string,Uint8Array|string>} [opts.files] the disk
 * @param {string|number[]} [opts.keys] keystrokes fed to the program (console input)
 * @param {number} [opts.maxSteps=20000000] a bound so a runaway program cannot hang the tab
 * @returns {Promise<{files: Map, screen: string, screenText: string[], exitCode: number,
 *                    terminated: boolean, exhausted: boolean, steps: number}>}
 */
export async function runCpmProgram(opts = {}) {
    if (!(opts.bytes instanceof Uint8Array) || !opts.bytes.length) {
        throw new Error('runCpmProgram: no program bytes');
    }
    // CP/M filenames are uppercase 8.3; normalise the mounted disk so a program
    // that opens "FOO.DAT" finds a file mounted as "foo.dat".
    const files = new Map();
    const src = opts.files instanceof Map ? opts.files.entries() : Object.entries(opts.files || {});
    for (const [name, data] of src) files.set(String(name).toUpperCase(), asFileBytes(data));

    const chars = [];
    const bench = await createCpmZ80Bench({
        bytes: opts.bytes,
        files,
        keys: asKeyBytes(opts.keys),
        onChar: ch => chars.push(ch)
    });
    const max = opts.maxSteps || 20_000_000;
    let steps = 0;
    while (!bench.terminated && steps < max) { bench.step(); steps += 1; }
    let screenText = [];
    try { screenText = bench.screenText(); } catch { /* renderer optional */ }
    return {
        files,
        screen: chars.join(''),
        screenText,
        exitCode: bench.exitCode,
        terminated: bench.terminated,
        exhausted: !bench.terminated && steps >= max,
        steps
    };
}

/**
 * Run a program that ACK (or any host cross-compiler) already produced for
 * Z80/CP/M. ACK's compiler is a HOST tool (`ack -mcpm`), so the compile happens
 * off the Z80; this is stage two — the produced `.COM` run on the CP/M bench,
 * with the same disk Map so any data files it reads/writes flow through.
 *
 * @param {object} opts
 * @param {Uint8Array} opts.com the Z80 CP/M `.COM` ACK emitted
 * @param {Record<string, Uint8Array|string>} [opts.files] data files to mount
 * @param {string|number[]} [opts.keys]
 * @param {number} [opts.maxSteps]
 * @returns {Promise<object>} the runCpmProgram result, with `output` = the mounted disk
 */
export async function runAckCpmOutput(opts = {}) {
    if (!(opts.com instanceof Uint8Array)) throw new Error('runAckCpmOutput: no .COM bytes');
    return runCpmProgram({
        bytes: opts.com,
        files: opts.files || {},
        keys: opts.keys,
        maxSteps: opts.maxSteps
    });
}
