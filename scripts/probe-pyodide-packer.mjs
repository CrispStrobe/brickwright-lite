#!/usr/bin/env node
/**
 * A developer instrument, NOT a CI gate: run Apicula's `gowin_pack` inside
 * Pyodide and report the bitstream it produces, so the claim that a Gowin
 * bitstream can be packed in a browser is a measurement anyone can repeat.
 *
 * WHY IT EXISTS. docs/TANG-NANO.md §8c said, on 2026-09-16, that there is NO
 * path from a GPL core to real silicon through this app: the hosted route
 * refuses copyleft by policy (decision 19) and the local route could not
 * finish, because `gowin_pack` is Python and nothing packs a Gowin bitstream
 * in JavaScript or WebAssembly. Pyodide was named as "the only route around
 * it, and it is unproven".
 *
 * It is proven now, and §8c is corrected. Two things the plan had wrong:
 *
 *   Apicula's `[pure]` extra is NOT the pure-Python path. It ADDS msgpack and
 *   cattrs; it never removes `fastcrc`, which is a compiled Rust extension
 *   with no pure wheel, so `micropip.install('apycula[pure]')` fails exactly
 *   as the bare install does.
 *
 *   It does not need to. `apycula/crc16.py` already guards its fastcrc import
 *   with try/except ImportError and falls back to a 256-entry table. fastcrc
 *   is a SPEED dependency that setup.py lists as a hard one. Installing with
 *   deps=False and supplying numpy and msgspec by hand gets the whole packer,
 *   with a warning about performance and nothing else.
 *
 * WHAT IT DOES NOT DO. It does not assert. It packs and reports; the caller
 * reads the report. test/fpga-pyodide-packer.test.mjs is where pass/fail
 * lives, and what it asserts is BYTE-IDENTITY with the native packer, because
 * "it produced a bitstream" is not the claim — "it produced THE bitstream" is.
 *
 * WHY IT RUNS HERE AT ALL. Pyodide is ordinary Emscripten WebAssembly. It
 * needs neither WasmGC nor try_table, which is what keeps the YoWASP tools off
 * this Node 20 box (see lib/bw-fpga/wasm-capabilities.js). The packer half of
 * TN6b is therefore testable on runtimes where the synthesis half is not.
 *
 * PYODIDE IS NOT A DEPENDENCY OF THIS REPO. 17 MB installed to serve one
 * probe is a bad trade, so it is installed on demand into artifacts/ and the
 * gate skips loudly when it is absent, naming the command.
 *
 * Usage:
 *   node scripts/probe-pyodide-packer.mjs               # both designs, in node
 *   node scripts/probe-pyodide-packer.mjs --install     # fetch pyodide first
 *   node scripts/probe-pyodide-packer.mjs --design blink
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PYODIDE_DIR = path.join(ROOT, 'artifacts', 'pyodide');
export const PYODIDE_ENTRY = path.join(PYODIDE_DIR, 'node_modules', 'pyodide', 'pyodide.mjs');
export const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'fpga');

/**
 * The version of Apicula this packs with, and the chipdb name for the Tang
 * Nano 20K's part. `family` is the CHIPDB name and `device` is the ordering
 * code; conflating them cost bw-synth a CI round, so both are spelled out
 * wherever either appears.
 */
export const APYCULA = 'apycula==0.32';
export const FAMILY = 'GW2A-18C';

/**
 * The designs, and what the NATIVE toolchain packs them to.
 *
 * These hashes are the whole point of the fixture. They were produced on
 * 2026-09-17 by the real flow on this machine — yowasp-yosys 0.69.0.0.post1233,
 * yowasp-nextpnr-himbaechel-gowin 0.11.1.0.post826, Apycula 0.32 from PyPI,
 * native CPython 3.12 with fastcrc present — and the `*-pnr.json` fixtures are
 * that flow's nextpnr output, committed so the packer can be tested without
 * 261 MB of toolchain.
 *
 * `blink` is a tied-high output: it proves the packer runs. `counter` is 36
 * LUT4 and 26 DFF: it proves the packer runs on a design that has logic in it.
 */
export const DESIGNS = Object.freeze({
    blink: Object.freeze({
        pnr: 'blink-pnr.json',
        sha256: '586e54acb48e90cf22e9181a63d8454efdaf9540af1ea1c41499a9c2764e257d',
        bytes: 4618782,
        note: 'one output tied high — no logic at all'
    }),
    counter: Object.freeze({
        pnr: 'counter-pnr.json',
        sha256: '2150278320683c030fa7f68ae26aafbe400be51d97767c0ee31585d078b69704',
        bytes: 4618782,
        note: '26-bit counter: 36 LUT4, 26 DFF, 6 outputs'
    })
});

export const INSTALL_HINT =
    'node scripts/probe-pyodide-packer.mjs --install   (~17 MB into artifacts/, gitignored)';

/** Install pyodide into artifacts/, out of the way of this repo's own tree. */
export function installPyodide () {
    mkdirSync(PYODIDE_DIR, {recursive: true});
    // The manifest is not a formality. Without one, npm walks UP, finds this
    // repo's package.json and installs pyodide into the repo's own tree —
    // which is the opposite of keeping it out of the way, and silent.
    writeFileSync(path.join(PYODIDE_DIR, 'package.json'),
        JSON.stringify({name: 'bw-pyodide-probe', private: true, version: '0.0.0'}, null, 2));
    execFileSync('npm', ['install', '--no-save', '--silent', 'pyodide'],
        {cwd: PYODIDE_DIR, stdio: 'inherit'});
}

/**
 * Pack one design and return what came out. Throws on a packer failure rather
 * than reporting a hash for a bitstream nobody produced.
 */
export async function packWithPyodide (design, {loadPyodide} = {}) {
    const spec = DESIGNS[design];
    if (!spec) throw new Error(`no such design: ${design}`);

    const load = loadPyodide
        || (await import(pathToFileURL(PYODIDE_ENTRY).href)).loadPyodide;
    const t0 = Date.now();
    const py = await load({stdout: () => {}, stderr: () => {}});
    await py.loadPackage(['micropip', 'numpy'], {messageCallback: () => {}});

    // deps=False is load-bearing, not a shortcut: the dependency that has no
    // pure wheel (fastcrc) is one the packer does not need, and asking for it
    // is the only thing that fails. numpy and msgspec are supplied above and
    // here because skipping deps skips the ones it DOES need too.
    //
    // It is also a workaround for someone else's packaging bug, and it goes
    // away when that is fixed upstream: setup.py declares fastcrc as required
    // while apycula/crc16.py treats it as optional. The one-line fix is written
    // at CrispStrobe/apicula, branch fastcrc-optional-on-wasm, and proven
    // necessary and sufficient against a repacked release wheel (§8d). When it
    // lands and ships, this argument comes out and deps stay on.
    await py.runPythonAsync(`
import micropip
await micropip.install('msgspec')
await micropip.install(${JSON.stringify(APYCULA)}, deps=False)
`);
    const ready = Date.now() - t0;

    py.FS.writeFile('/in.json', readFileSync(path.join(FIXTURES, spec.pnr)));
    const t1 = Date.now();
    const failure = await py.runPythonAsync(`
import sys, warnings
warnings.simplefilter('ignore')          # the fastcrc speed warning, expected
from apycula import gowin_pack
sys.argv = ['gowin_pack', '-d', ${JSON.stringify(FAMILY)}, '-o', '/out.fs', '/in.json']
try:
    gowin_pack.main()
    ''
except SystemExit as e:
    '' if not e.code else f'SystemExit {e.code}'
except Exception as e:
    f'{type(e).__name__}: {e}'
`);
    if (failure) throw new Error(`gowin_pack failed in pyodide: ${failure}`);

    const bitstream = Buffer.from(py.FS.readFile('/out.fs'));
    return {
        design,
        bytes: bitstream.length,
        sha256: createHash('sha256').update(bitstream).digest('hex'),
        readyMs: ready,
        packMs: Date.now() - t1
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const argv = process.argv.slice(2);
    if (argv.includes('--install')) installPyodide();
    if (!existsSync(PYODIDE_ENTRY)) {
        process.stderr.write(`pyodide is not installed. Run:\n  ${INSTALL_HINT}\n`);
        process.exit(2);
    }
    const which = argv.includes('--design')
        ? [argv[argv.indexOf('--design') + 1]]
        : Object.keys(DESIGNS);

    for (const design of which) {
        const spec = DESIGNS[design];
        const r = await packWithPyodide(design);
        const same = r.sha256 === spec.sha256;
        process.stdout.write(
            `${design.padEnd(8)} ${spec.note}\n`
            + `  toolchain ready in ${(r.readyMs / 1000).toFixed(1)}s, packed in `
            + `${(r.packMs / 1000).toFixed(1)}s\n`
            + `  ${r.bytes} bytes  ${r.sha256}\n`
            + `  vs native        ${spec.sha256}\n`
            + `  ${same ? 'IDENTICAL' : 'DIFFERENT — this is the interesting case'}\n\n`);
    }
}
