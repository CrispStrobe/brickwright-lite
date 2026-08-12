#!/usr/bin/env node
// Sync the vendored bw-board simulation engine into the overlay.
//
// bw-board is the board layer: netlist, the four STC12 port modes as Thévenin equivalents,
// a closed-form fast path with an MNA solver behind it, instruments and transducers. It is
// MIT and has NO runtime dependencies, which is what lets it ship inside this bundle.
//
// Vendored rather than npm-installed, for the same reason everything else here is: the fork
// is frozen and self-contained. Same contract as sync-sb3creator.mjs.
//
//   --check      exit non-zero (without writing) if a vendored file is stale, for CI.
//   --dir <path> read from a local bw-board checkout instead of over HTTP.

import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const REF = process.env.BWBOARD_REF || 'main';
const RAW = `https://raw.githubusercontent.com/CrispStrobe/bw-board/${REF}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'overlay', 'scratch-gui', 'src', 'lib', 'bw-board');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;

// DISCOVER the file list; do not hardcode it. A fixed list silently drops files the engine
// grows (it gained validate.js the day this script was written) and produces a vendored copy
// that fails at webpack time with a missing-module error far from the cause.
const FALLBACK = [
    ...["analog-ics","chip-composer","dc-motor","digital-ics","display","h-bridge","logic-gates","misc-parts","motor-drivers","named-parts","power","relay","sensors","servo","timer-555"].map(f => `src/devices/${f}.js`),
    'src/index.js', 'src/board.js', 'src/types.js', 'src/pin-model.js', 'src/mna.js',
    'src/infer-netlist.js', 'src/scripted-mcu.js', 'src/conformance.js',
    'src/emu8051-adapter.js', 'src/validate.js'
];
// bw-board grew a `src/devices/` subdirectory. Globbing only the top level
// missed it entirely, and `index.js` imports `./devices/chip-composer.js`, so
// the vendored engine referenced files that were never copied. One level of
// nesting is enough for what bw-board has; a second would need recursion, and
// the import check below fails loudly if one ever appears.
// Node-only modules that import node: builtins and must NOT be vendored
// into the browser bundle.  pin-functions.js reads bw-parts sidecars via
// fs and is explicitly marked NODE-ONLY in bw-board's index.js.
const EXCLUDE = new Set(['pin-functions.js']);

const listSrc = async () => {
    const root = path.join(srcDir, 'src');
    const out = [];
    for (const e of await readdir(root, {withFileTypes: true})) {
        if (e.isDirectory()) {
            for (const f of await readdir(path.join(root, e.name))) {
                if (f.endsWith('.js') && !EXCLUDE.has(f)) out.push(`src/${e.name}/${f}`);
            }
        } else if (e.name.endsWith('.js') && !EXCLUDE.has(e.name)) {
            out.push(`src/${e.name}`);
        }
    }
    return out.sort();
};

const FILES = srcDir ? await listSrc() : FALLBACK;

async function readSource (rel) {
    if (srcDir) return readFile(path.join(srcDir, rel), 'utf8');
    const res = await fetch(`${RAW}/${rel}`);
    if (!res.ok) throw new Error(`fetch ${rel} @ ${REF}: HTTP ${res.status}`);
    return res.text();
}

await mkdir(dest, {recursive: true});
let stale = 0;
for (const rel of FILES) {
    // Keep the layout under src/ rather than flattening to a basename: a file
    // in devices/ imports its siblings by relative path, and flattening would
    // break every one of them.
    const out = path.join(dest, rel.replace(/^src\//, ''));
    await mkdir(path.dirname(out), {recursive: true});
    let next;
    try {
        next = await readSource(rel);
    } catch (e) {
        console.log(`  SKIP  ${path.basename(rel)} (${e.message})`);
        continue;
    }
    const current = await readFile(out, 'utf8').catch(() => null);
    if (current === next) { console.log(`  ok    ${path.basename(rel)}`); continue; }
    stale++;
    if (check) console.log(`  STALE ${path.basename(rel)}`);
    else { await writeFile(out, next); console.log(`  wrote ${path.basename(rel)}`); }
}

// A vendored engine that quietly grew a dependency would break the bundle at build time,
// so fail loudly here instead.
// `readdir` returns directories too, and bw-board grew a `devices/` subdirectory
// this session — reading one as a file threw EISDIR and aborted the vendor, which
// is the only path anything reaches users by. Enumerate the actual files.
const vendoredFiles = async () => {
    const out = [];
    for (const e of await readdir(dest, {withFileTypes: true})) {
        if (e.isDirectory()) {
            for (const sub of await readdir(path.join(dest, e.name))) out.push(path.join(e.name, sub));
        } else {
            out.push(e.name);
        }
    }
    return out;
};

// avr8js is the one allowed external dependency: the adapter imports the
// emulator package, which is installed in packages/scratch-gui.
const ALLOWED_PACKAGES = new Set(['avr8js', 'rp2040js']);

if (!check) {
    for (const f of await vendoredFiles()) {
        const src = await readFile(path.join(dest, f), 'utf8');
        for (const m of src.matchAll(/^\s*import\s[^'"\n]*['"]([^'".][^'"]*)['"]/gm)) {
            if (!ALLOWED_PACKAGES.has(m[1])) {
                throw new Error(`${f} imports a package (${m[1]}); bw-board must stay dependency-free (allowed: ${[...ALLOWED_PACKAGES].join(', ')})`);
            }
        }
    }
}

// Every relative import must resolve inside the vendored copy. This is the check that would
// have caught validate.js going missing, at the point of vendoring rather than at build time.
if (!check) {
    const files = await vendoredFiles();
    const present = new Set(files.map(f => path.basename(f)));
    for (const f of files) {
        const src = await readFile(path.join(dest, f), 'utf8');
        // Match only a genuine module specifier — a `from '...'` clause or a
        // side-effect `import '...'`. Taking the first quoted string on any
        // import/export line reads a default parameter value as a specifier;
        // that false positive aborted the whole vendor in the circuit-ui
        // script. Less exposed here because only `./…` is captured, but it is
        // the same bug waiting for the first `export function f({p = './x'})`.
        for (const m of src.matchAll(
            /^\s*(?:import|export)\b[^\n]*?\bfrom\s*['"](\.\/[^'"]+)['"]|^\s*import\s*['"](\.\/[^'"]+)['"]/gm
        )) {
            const target = path.basename(m[1] || m[2]);
            if (!present.has(target)) {
                throw new Error(`${f} imports ${m[1]}, which was not vendored — the file list is incomplete`);
            }
        }
    }
    console.log(`  checked ${present.size} files: imports all resolve, no packages`);
}

if (check && stale) { console.error(`\n${stale} stale — run: npm run sync:bwboard`); process.exit(1); }
console.log(check ? '\nvendored engine up to date.' : `\nsynced from bw-board@${REF}. Next: npm run integrate`);
