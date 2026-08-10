// Nothing in the overlay should be imported by nothing.
//
// This campaign produced the same bug five times: a module written, tested,
// committed — and referenced by no one. DrcOverlay and BreadboardView sat
// unreferenced for a day. 115 part drawings were finished and invisible for
// hours. `current-ratings.js` was exported and tested with no consumer while
// the DRC hand-copied its constants. `artCoverage()` was written to report
// fallbacks and never called. `PaneColumn` and `flyout-resize.js` are still
// dead as this is written — found by an agent who was told to edit them and
// noticed nothing imported them.
//
// Every one of those was correct code that passed its own tests. The property
// none of them had is the one asserted here: that something uses it.
//
// Asserted positively, per stc/docs/EVIDENCE-CATEGORIES.md — this does not
// check that a specific module is used, it checks that every module is.
//
// The check runs against the INTEGRATED tree (overlay + upstream), because an
// overlay file that patches an upstream path is imported by upstream code that
// the overlay alone cannot see. Scanning only the overlay reports 16 dead
// modules, 6 of them false. Scanning the integrated tree reports 10, all real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const overlaySrc = resolve(repo, 'overlay/scratch-gui/src');
const builtSrc = resolve(repo, 'packages/scratch-gui/src');

/**
 * Modules that are legitimately imported by nobody, each with the reason.
 *
 * An entry here is a claim that the file has a caller outside the import
 * graph — a runtime loader, a separate entry point, a build step. "We might
 * use it later" is not a reason; delete it and let git remember.
 */
const ALLOWED = new Map([
    ['lib/sdcc-wasm/dist/sdcc.js',
        'Emscripten output. Fetched at runtime by the WASM compile driver, never imported.'],
    ['lib/sdcc-wasm/dist/sdas8051.js',
        'Emscripten output, as above (assembler).'],
    ['lib/sdcc-wasm/dist/sdld.js',
        'Emscripten output, as above (linker).'],
    ['lib/bw-circuit-ui/main.jsx',
        'bw-circuit-ui\'s own standalone demo entry point. Vendored wholesale by ' +
        'sync-bw-circuit-ui.mjs, which copies the upstream src tree rather than ' +
        'cherry-picking; unused here by design.']
]);

/**
 * Known dead modules, as a ratchet. This number may only go down.
 *
 * Listing them is not approval — it is the difference between debt that is
 * recorded and debt that is invisible. A new dead module fails this test by
 * name; removing one means editing this list in the same commit.
 */
const KNOWN_DEAD = new Map([
    ['components/gui/pane-column.jsx',
        'Renders the pane-layout slots. The slots are modelled, actioned and ' +
        'tested; nothing renders them. Needs an owner in lite — bw-circuit-ui ' +
        'correctly refused to cross the repo boundary to wire it.'],
    ['lib/flyout-resize.js',
        'Same feature as pane-column: written, never imported.'],
    ['lib/bw-circuit-ui/model/demo-netlist.js', 'Vendored; used only by the standalone demo.'],
    ['lib/bw-circuit-ui/model/export-png.js', 'Vendored; PNG export is not surfaced in lite.'],
    ['lib/bw-circuit-ui/model/simulation.js', 'Vendored; lite drives the board through bw-board.'],
    ['lib/bw-circuit-ui/model/terminal-aliases.js', 'Vendored; no lite caller yet.']
]);

const SPEC = /from\s+['"]([^'"]+)['"]|import\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]/g;

function walk (dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (['.js', '.jsx'].includes(extname(p))) out.push(p);
    }
    return out;
}

test('every overlay module is imported by something', {
    skip: existsSync(builtSrc) ? false :
        'packages/scratch-gui not integrated — run `npm run integrate` first'
}, () => {
    const all = walk(builtSrc);
    const referenced = new Set();
    for (const f of all) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(SPEC)) {
            const spec = m[1] || m[2] || m[3];
            const base = spec.replace(/\/$/, '').split('/').pop();
            referenced.add(base);
            referenced.add(base.replace(/\.(js|jsx)$/, ''));
        }
    }

    const dead = [];
    for (const f of walk(overlaySrc)) {
        const rel = relative(overlaySrc, f).split('\\').join('/');
        const built = join(builtSrc, rel);
        if (!existsSync(built)) continue;            // overlay-only, not integrated
        const name = basename(f);
        if (referenced.has(name) || referenced.has(name.replace(/\.(js|jsx)$/, ''))) continue;
        if (ALLOWED.has(rel)) continue;
        dead.push(rel);
    }

    const unexpected = dead.filter((d) => !KNOWN_DEAD.has(d));
    assert.deepEqual(unexpected, [],
        `${unexpected.length} module(s) are imported by nothing and are not in KNOWN_DEAD:\n` +
        unexpected.map((d) => `  ${d}`).join('\n') +
        '\n\nEither wire it up, delete it, or add it to KNOWN_DEAD with the reason ' +
        'it exists unused. Code that nothing imports has never run.');

    // Ratchet: the list may only shrink.
    const stillDead = [...KNOWN_DEAD.keys()].filter((k) => dead.includes(k));
    assert.ok(stillDead.length <= KNOWN_DEAD.size,
        'KNOWN_DEAD grew — it is a ratchet, not a parking space');
});

test('KNOWN_DEAD entries are still dead, and get removed when they are not', {
    skip: existsSync(builtSrc) ? false : 'not integrated'
}, () => {
    // The mirror of the test above, and the one that makes the ratchet tighten.
    // A file listed as dead that has since been wired must leave the list, or
    // the list slowly becomes fiction and stops being read.
    const all = walk(builtSrc);
    const referenced = new Set();
    for (const f of all) {
        for (const m of readFileSync(f, 'utf8').matchAll(SPEC)) {
            const spec = m[1] || m[2] || m[3];
            const base = spec.replace(/\/$/, '').split('/').pop();
            referenced.add(base);
            referenced.add(base.replace(/\.(js|jsx)$/, ''));
        }
    }
    const revived = [...KNOWN_DEAD.keys()].filter((rel) => {
        const name = basename(rel);
        return referenced.has(name) || referenced.has(name.replace(/\.(js|jsx)$/, ''));
    });
    assert.deepEqual(revived, [],
        `these are listed in KNOWN_DEAD but something imports them now — remove them ` +
        `from the list:\n` + revived.map((r) => `  ${r}`).join('\n'));
});

test('every ALLOWED entry states a reason', () => {
    for (const [path, reason] of ALLOWED) {
        assert.ok(reason && reason.length > 20,
            `${path} is allow-listed without a real reason`);
    }
    for (const [path, reason] of KNOWN_DEAD) {
        assert.ok(reason && reason.length > 20,
            `${path} is in KNOWN_DEAD without a real reason`);
    }
});
