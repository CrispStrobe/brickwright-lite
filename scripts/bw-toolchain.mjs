#!/usr/bin/env node
/**
 * The SDCC toolchain, from a command line.
 *
 * SDCC is GPL-2.0-or-later and stopped shipping inside this BSD-3 app on
 * 2026-09-07. It is fetched from its own GPL origin only when someone asks. In
 * a browser that download lives behind Cache Storage; there is no Cache Storage
 * in Node, so this keeps its own directory. THAT IS NOT THE SAME STORE, and a
 * green run here is evidence about the algorithm — progress, cancellation,
 * resume, removal — not about the browser's cache.
 *
 * NO DEFAULT MODE, DELIBERATELY. Two defaults already exist and both answer a
 * question this command is not asking: `online` answers "what may we ship to a
 * user", and the Node branch answers "where is the staged toolchain on disk". A
 * command line has no user session to read a preference from, so inventing a
 * third default would be a third place stating one fact. It refuses and names
 * the modes instead.
 *
 *   node scripts/bw-toolchain.mjs status
 *   node scripts/bw-toolchain.mjs install [--home DIR] [--cancel-after N]
 *   node scripts/bw-toolchain.mjs remove  [--home DIR]
 *   node scripts/bw-toolchain.mjs compile FILE --mode local|online [--target T]
 */
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {fileSystemStore} from '../overlay/scratch-gui/src/lib/sdcc-wasm/toolchain-store.js';
import {
    primeToolchainCache, inspectToolchain, removeToolchain, measureToolchain,
    GPL_TOOLCHAIN_ORIGIN, TOOLCHAIN_FILES
} from '../overlay/scratch-gui/src/lib/sdcc-wasm/toolchain-source.js';

const argv = process.argv.slice(2);
const verb = argv[0];
const flag = (name, fallback = null) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? fallback : argv[at + 1];
};
const has = name => argv.includes(`--${name}`);

// The store lives under `static/sdcc-wasm/` inside its home so that the home
// itself is a valid toolchain BASE: loadToolchain resolves
// `static/sdcc-wasm/<file>` against it, exactly as it does against a web origin.
// One layout, two domains, no second convention to keep in step.
const HOME = path.resolve(flag('home') || path.join(homedir(), '.brickwright', 'sdcc-wasm'));
const STORE_DIR = path.join(HOME, 'static', 'sdcc-wasm');
const store = fileSystemStore(STORE_DIR, fsp, path);
const ORIGIN = flag('origin') || GPL_TOOLCHAIN_ORIGIN;

const die = (message, code = 2) => { console.error(message); process.exit(code); };
const mib = bytes => `${(bytes / 1048576).toFixed(1)} MiB`;

const requireMode = () => {
    const mode = flag('mode');
    if (mode !== 'local' && mode !== 'online') {
        die('a mode is required and is not defaulted: --mode local | --mode online\n' +
            '  local   compile in-process from the downloaded GPL toolchain\n' +
            '  online  send the program to the hosted compiler service\n' +
            'There is no default here on purpose: a command line has no user session ' +
            'to read a preference from.');
    }
    return mode;
};

async function status () {
    const report = await inspectToolchain(ORIGIN, {store});
    console.log(`toolchain home : ${HOME}`);
    console.log(`origin         : ${ORIGIN}`);
    console.log(`installed      : ${report.complete ? 'yes' : 'no'}` +
        ` (${report.present.length}/${TOOLCHAIN_FILES.length} files, ${mib(report.bytes)})`);
    if (!report.complete && report.present.length) {
        console.log(`partial        : missing ${report.missing.join(', ')}`);
    }
    console.log('mode           : not stored here — a mode is given per command (--mode)');
    console.log('licence        : SDCC is GPL-2.0-or-later; source offer and COPYING at');
    console.log('                 https://github.com/CrispStrobe/sdcc-wasm');
    return report.complete ? 0 : 1;
}

async function install () {
    // The licence is disclosed at the MOMENT OF DOWNLOAD, not buried in a file
    // nobody opens. This is the point where a user pulls GPL software from a
    // separate origin into a BSD-3 app, and it is the thing that makes the
    // separation visible to the person it protects.
    console.log('About to download SDCC (Small Device C Compiler) 4.5.0 as WebAssembly.');
    console.log('  Licence : GPL-2.0-or-later — NOT the licence of this application.');
    console.log('  Source  : https://github.com/CrispStrobe/sdcc-wasm (COPYING, written');
    console.log('            offer of corresponding source, and a SHA-256 per binary)');
    console.log(`  Into    : ${STORE_DIR}`);
    console.log('');

    const controller = new AbortController();
    const cancelAfter = Number(flag('cancel-after', '0')) || 0;
    let fetched = 0;
    const onSigint = () => {
        console.log('\ncancelling — files already downloaded are kept, and install resumes from them');
        controller.abort();
    };
    process.on('SIGINT', onSigint);

    // Weighted, because one file is half the download. Nine equal steps would
    // stall on runtime.json (3.3 of 6.4 MB) and read as frozen.
    let sizes = null;
    let totalBytes = 0;
    try {
        ({sizes, total: totalBytes} = await measureToolchain(ORIGIN, {fetch}));
    } catch {
        // A HEAD that fails is not a reason not to download; the bar just loses
        // its denominator and reports files instead of a percentage.
        sizes = null;
    }

    try {
        const stored = await primeToolchainCache(ORIGIN, {
            store, sizes, totalBytes,
            signal: controller.signal,
            fetch: async (url, init) => {
                const response = await fetch(url, init);
                if (++fetched === cancelAfter) controller.abort();
                return response;
            },
            onProgress: ({name, index, total, state, bytesDone, totalBytes: all}) => {
                if (state === 'fetching') return;
                const n = String(index + 1).padStart(2);
                const share = all ? ` · ${mib(bytesDone)} of ${mib(all)}` : '';
                const what = state === 'present' ? 'already here' : 'done';
                console.log(`  [${n}/${total}] ${name} — ${what}${share}`);
            }
        });
        const report = await inspectToolchain(ORIGIN, {store});
        console.log(`\ninstalled ${stored.length}/${TOOLCHAIN_FILES.length} files, ${mib(report.bytes)}`);
        return 0;
    } catch (error) {
        if (error && error.name === 'AbortError') {
            const report = await inspectToolchain(ORIGIN, {store});
            console.error(`\ncancelled with ${report.present.length}/${TOOLCHAIN_FILES.length} files kept.`);
            console.error('Run install again to continue from here — it refetches only what is missing.');
            return 3;
        }
        console.error(`\ninstall failed: ${error && error.message ? error.message : error}`);
        return 1;
    } finally {
        process.removeListener('SIGINT', onSigint);
    }
}

async function remove () {
    const before = await inspectToolchain(ORIGIN, {store});
    const removed = await removeToolchain(ORIGIN, {store});
    console.log(removed.length
        ? `removed ${removed.length} file(s), freeing ${mib(before.bytes)} from ${STORE_DIR}`
        : `nothing to remove in ${STORE_DIR}`);
    return 0;
}

async function compile () {
    const mode = requireMode();
    const file = argv[1];
    if (!file || file.startsWith('--')) die('compile needs a source file: compile FILE --mode ...');
    const target = flag('target', 'stc12c5a60s2');
    const source = await fsp.readFile(path.resolve(file), 'utf8');

    if (mode === 'online') {
        const url = flag('service', 'https://stc-compiler.vercel.app/compile');
        const response = await fetch(url, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({code: source, language: 'c', target, format: 'hex', symbols: true})
        });
        const out = await response.json();
        if (!out.success) die(`online compile refused: ${out.error || 'no reason given'}`, 1);
        console.log(`online : ${target} built by ${url} — ${out.bytes || '?'} bytes`);
        return 0;
    }

    const report = await inspectToolchain(ORIGIN, {store});
    if (!report.complete) {
        die(`local compile needs the toolchain, and ${report.missing.length} file(s) are missing.\n` +
            `Run: node scripts/bw-toolchain.mjs install --home ${HOME}`, 1);
    }
    // The home IS the base, which is why the store lives under static/sdcc-wasm.
    globalThis.document = {baseURI: pathToFileURL(`${HOME}/`).href};
    const {compile: compileLocal} = await import(
        '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js');
    const out = await compileLocal(source, {target, symbols: true});
    if (!out.success) die(`local compile failed: ${out.error || 'no reason given'}`, 1);
    console.log(`local  : ${target} built in-process from ${STORE_DIR}`);
    return 0;
}

const verbs = {status, install, remove, compile};
if (!verb || has('help') || verb === 'help' || !verbs[verb]) {
    console.error(`usage: bw-toolchain <status|install|remove|compile> [options]

  status                     what is installed, where, and under which licence
  install [--cancel-after N] download the toolchain (Ctrl-C cancels; resumes)
  remove                     delete it and free the space
  compile FILE --mode M      build one program, local or online

  --home DIR      where the toolchain lives (default ~/.brickwright/sdcc-wasm)
  --origin URL    where to fetch it from (default the GPL origin)

There is no default mode for compile. See the header for why.`);
    process.exit(verb && verb !== 'help' && !has('help') ? 2 : 0);
}
process.exit(await verbs[verb]());
