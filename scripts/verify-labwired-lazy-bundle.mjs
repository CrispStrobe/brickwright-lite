#!/usr/bin/env node
/** The heavy tier must stay OUT of the app's first load.
 *
 *  WHAT THIS PROTECTS
 *  ------------------
 *  labwired is a 20 MB wasm engine (about 2 MB brotli). It is optional by
 *  construction: `lib/labwired-engine.js` loads it behind a `webpackIgnore`d
 *  dynamic import from `static/`, and every consumer reaches THAT module through
 *  its own dynamic import into a chunk called `labwired-probe`. Both halves are
 *  one-character edits away from being undone — drop the `webpackChunkName`
 *  comment, or turn either `import(...)` into a static `import ... from`, and the
 *  loader lands in the entry bundle. Nothing else would notice: the app would
 *  still work, still pass every unit suite, and still run the engine. It would
 *  just have grown the first paint by the loader and, for a build that also
 *  inlined the glue, by rather more.
 *
 *  So the assertion is about WHERE the code is, which is only answerable from a
 *  real build. That is why this is a build gate rather than a unit test:
 *  `npm test` runs BEFORE `npm run build` in CI, so a test that inspected
 *  build/ would skip on every CI run and be worth nothing.
 *
 *  THE MARKER, AND WHY IT IS THIS ONE
 *  ----------------------------------
 *  `static/labwired/labwired_wasm_bg.wasm` is a string literal inside
 *  labwired-engine.js. A string literal is the one thing minification, mangling
 *  and module concatenation all leave intact, so its PRESENCE in a file is proof
 *  that module's code is in that file. Chunk names are not usable for this: the
 *  webpack runtime in the entry bundle lists every lazy chunk's name by
 *  construction, so grepping for "labwired-probe" finds a hit in the main bundle
 *  on a perfectly correct build.
 *
 *  ANTI-VACUITY
 *  ------------
 *  A gate that greps for an absent string passes just as happily when the string
 *  was renamed, the module was deleted, or the build produced nothing. So the
 *  same marker is REQUIRED to be present in the lazy chunk. If the marker ever
 *  stops being a discriminator, this fails on the positive half rather than
 *  going quietly green on the negative one.
 */
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {join, resolve, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// BW_BUILD exists so this gate can be MUTATION-TESTED without a 30-minute
// rebuild: point it at a copy of build/, break the copy (inline the marker into
// the entry bundle, or delete the lazy chunk), and watch each check go red.
// A gate nobody has seen fail is a guess about a gate.
const build = process.env.BW_BUILD
    ? resolve(process.env.BW_BUILD)
    : join(root, 'packages', 'scratch-gui', 'build');

/** The literal that says "labwired-engine.js's code is in this file". */
const MARKER = 'static/labwired/labwired_wasm_bg.wasm';
/** Where the lazy import is supposed to land — the webpackChunkName on both
 *  call sites (debug-panel's availability probe and debug-runner's attach). */
const CHUNK = join(build, 'chunks', 'labwired-probe.js');

const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

// No build is a MISUSE of this gate, not a condition to tiptoe around: CI runs
// it directly after `npm run build`, so an absent build there means the build
// step lied. Skipping would turn that into a green line.
if (!existsSync(join(build, 'index.html'))) {
    console.error('verify-labwired-lazy-bundle: packages/scratch-gui/build/index.html is missing.\n'
        + 'This gate inspects a real build; build first:\n'
        + '  node scripts/integrate.mjs && cd packages/scratch-gui && npm run build');
    process.exit(1);
}

const html = readFileSync(join(build, 'index.html'), 'utf8');

// The EAGER set: every script the document itself pulls, plus anything else
// sitting at the build root (a vendor chunk that the HTML preloads rather than
// <script>s would otherwise slip past). Union, because either route is "loaded
// before the user has done anything".
const fromHtml = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1])
    .map(s => s.replace(/^\.?\//, ''))
    .filter(s => !/^https?:/.test(s));
const atRoot = readdirSync(build).filter(f => f.endsWith('.js'));
const eager = [...new Set([...fromHtml, ...atRoot])]
    .map(rel => join(build, rel))
    .filter(p => existsSync(p) && statSync(p).isFile());

// A gate that inspects nothing cannot fail. Say so out loud.
check('the build has eager scripts to inspect at all', eager.length > 0,
    eager.map(p => basename(p)).join(', '));
check('the entry bundle is among them',
    eager.some(p => /^gui\./.test(basename(p))),
    eager.map(p => basename(p)).join(', ') || '(none)');

const contaminated = eager.filter(p => readFileSync(p, 'utf8').includes(MARKER));
check('no eagerly-loaded script carries the labwired loader',
    contaminated.length === 0,
    contaminated.length
        ? `${contaminated.map(p => basename(p)).join(', ')} contains "${MARKER}" — the loader `
          + 'is in the first load. Check that both import() call sites are still dynamic and '
          + 'still carry /* webpackChunkName: "labwired-probe" */.'
        : `${eager.length} file(s) clean`);

// The positive half: the code has to be SOMEWHERE, and that somewhere is the
// lazy chunk. Without this the negative check above passes on a build that
// dropped labwired entirely.
check('the labwired-probe chunk exists', existsSync(CHUNK), 'chunks/labwired-probe.js');
if (existsSync(CHUNK)) {
    const src = readFileSync(CHUNK, 'utf8');
    check('the loader is in that chunk, so the marker still discriminates',
        src.includes(MARKER), `${(statSync(CHUNK).size / 1024).toFixed(1)} KiB`);
    // It holds a loader, not an engine. If this ever runs into megabytes,
    // something imported the glue rather than fetching it.
    check('the chunk holds a loader, not an engine',
        statSync(CHUNK).size < 256 * 1024, `${(statSync(CHUNK).size / 1024).toFixed(1)} KiB`);
    check('nothing preloads or prefetches it into the first load',
        !html.includes('labwired-probe'),
        'index.html must not reference the chunk; it is requested on demand');
}

// Informational, not asserted: the artifact is an optional deploy input, so a
// build without it is legitimate (the engine is simply not offered). Printing
// its size keeps the number in the log next to the claim it justifies.
const wasm = join(build, 'static', 'labwired', 'labwired_wasm_bg.wasm');
console.log(existsSync(wasm)
    ? `note  the engine itself is served as a static asset: ${(statSync(wasm).size / 1048576).toFixed(1)} MiB, fetched on demand`
    : 'note  no engine artifact in this build (npm run sync:labwiredwasm) — the tier is simply not offered');

if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nOK — the heavy tier is lazy: nothing in the first load knows how to reach it.');
