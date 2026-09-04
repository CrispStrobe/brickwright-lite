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
import { guardSource } from './lib-source-guard.mjs';
import { resolveRef, recordPin, localSha, listTree } from './lib-pin.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// bw-board's only branch is `master` — with 'main' every raw fetch 404s,
// each file "SKIP"s keeping whatever is vendored, and the run still prints
// "synced": a sync that cannot sync and a --check that cannot fail
// (found 2026-08-23 when sparse.js failed to arrive). Prefer --dir with the
// local sibling checkout; the GitHub path is the fallback.
const REPO = 'CrispStrobe/bw-board';
const REF = process.env.BWBOARD_REF || 'master';
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'overlay', 'scratch-gui', 'src', 'lib', 'bw-board');
const check = process.argv.includes('--check');
// Lite carries a few deliberate browser integrations on top of the shared
// board engine (for example its distributable RP2040 boot ROM). Freshness CI
// passes this flag so those reviewed downstream deltas are reported without
// being mistaken for an accidental stale vendor tree.
const allowStale = process.argv.includes('--allow-stale');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;
if (dirIdx !== -1 && srcDir) guardSource(srcDir);

// DISCOVER the file list; do not hardcode it. A fixed list silently drops files the engine
// grows (it gained validate.js the day this script was written) and produces a vendored copy
// that fails at webpack time with a missing-module error far from the cause.
const FALLBACK = [
    ...["analog-ics","chip-composer","dc-motor","digital-ics","display","h-bridge","logic-gates","misc-parts","motor-drivers","named-parts","power","relay","sensors","servo","timer-555"].map(f => `src/devices/${f}.js`),
    'src/index.js', 'src/board.js', 'src/types.js', 'src/pin-model.js', 'src/mna.js',
    'src/sparse.js',
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



// Remote mode fetches BY RESOLVED SHA, never by branch name: the raw
// CDN caches branch URLs for minutes, and a sync run right after a push
// silently vendored the PREVIOUS commit while claiming master (bitten
// 2026-08-23 — the E5.2 marker never arrived, the pin never moved). The
// commits API is not the raw CDN and answers with the current head; the
// sha-addressed raw URLs are immutable, so the cache cannot lie about them.
//
// `?? REF` was the last thread back to the mutable name: it looked like a
// harmless fallback and it was the whole defect wearing a different hat — one
// failed API call and every file is served from a cached branch URL again,
// silently. Resolution failing is now a failed sync (lib-pin.mjs throws).
let remoteSha = null;
if (!srcDir) remoteSha = (await resolveRef(REPO, REF)).sha;
const RAW = `https://raw.githubusercontent.com/${REPO}/${remoteSha}`;

/**
 * THE FILE LIST IS NOW ASKED FOR, NOT REMEMBERED.
 *
 * `FALLBACK` had 26 entries. 120 .js files were vendored. The 94 it did not
 * name -- the whole 8086 tier: i8086-*.js, i8254.js, i8237.js, i8251.js,
 * adc0809.js -- were never fetched in remote mode and never compared in
 * `--check`, which still printed "vendored engine up to date". A hand list
 * does not fail when it falls behind; it succeeds about less.
 *
 * So remote mode lists the tree at the RESOLVED SHA (never a branch name --
 * same reason the raw URLs are sha-addressed) and applies exactly the rules
 * `listSrc()` applies locally: files under `src/`, at most one directory deep,
 * `.js`, minus EXCLUDE. The two modes cannot now disagree about what "the
 * engine" is.
 *
 * FALLBACK IS GONE RATHER THAN KEPT AS A SAFETY NET. A net that catches a
 * failed listing by vendoring 26 of 120 files is not a safety net -- it is the
 * original defect, reached by a different route and harder to notice because
 * it only happens when something else has already gone wrong.
 */
const listRemote = async () => (await listTree(REPO, remoteSha).catch((e) => {
    // 403/429 here is the api.github.com limit: 60 requests/hour PER IP when
    // unauthenticated, shared with everything else on this address. It is a
    // FAILED SYNC and says so, rather than falling back to a short list --
    // that fallback was the defect this replaces, and reaching it only under
    // rate-limiting would make it appear exactly when nobody is watching.
    if (e.status === 403 || e.status === 429) {
        throw new Error(`GitHub API refused the tree listing (HTTP ${e.status}) — this is the `
            + 'unauthenticated 60-per-hour limit, not a missing repo. Set GITHUB_TOKEN or GH_TOKEN '
            + 'and re-run, or sync from a checkout with --dir <bw-board>. Refusing to vendor a '
            + 'partial file list.');
    }
    throw e;
}))
    .filter((p) => p.startsWith('src/') && p.endsWith('.js'))
    .filter((p) => p.split('/').length <= 3)          // src/x.js or src/dir/x.js
    .filter((p) => !EXCLUDE.has(path.basename(p)))
    .sort();

const FILES = srcDir ? await listSrc() : await listRemote();
if (!FILES.length) throw new Error('empty file list — refusing to "sync" nothing');

// cortex-m0-machine.js deep-imports rp2040js's core BY FILE PATH
// ('../node_modules/rp2040js/dist/esm/cortex-m0-core.js') because the
// package's exports map exposes only '.' and './gdb-tcp-server'. That
// relative path is correct in the bw-board checkout but not from the
// vendored location, so rewrite it to the path that reaches
// packages/scratch-gui/node_modules from src/lib/bw-board/ (three
// levels up). A plain file path bypasses the exports map, which a bare
// 'rp2040js/dist/…' specifier would trip over in webpack 5.
const DEEP_IMPORT_REWRITES = [
    [`'../node_modules/rp2040js/dist/esm/cortex-m0-core.js'`,
        `'../../../node_modules/rp2040js/dist/esm/cortex-m0-core.js'`],
];

async function readSource (rel) {
    let text;
    if (srcDir) {
        text = await readFile(path.join(srcDir, rel), 'utf8');
    } else {
        const res = await fetch(`${RAW}/${rel}`);
        if (!res.ok) throw new Error(`fetch ${rel} @ ${remoteSha}: HTTP ${res.status}`);
        text = await res.text();
    }
    for (const [from, to] of DEEP_IMPORT_REWRITES) text = text.replaceAll(from, to);
    return text;
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
    if (check) console.log(`  DIFFERS ${path.basename(rel)}`);
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

if (check && stale && !allowStale) {
    // "STALE — run the sync" WAS THE WRONG SENTENCE, and once the file list
    // covered the whole tree it became a dangerous one.
    //
    // This check compares vendored content against UPSTREAM content. A
    // difference has two possible directions and the comparison cannot tell
    // them apart: the vendored copy may be behind, or it may be AHEAD --
    // carrying work forward-ported here before it reached bw-board's master.
    // Measured 2026-09-04: all ten differences were the second kind. lite's
    // `debug-target-factory.js` has six references to the 8086 and master's
    // has none, because the tier lives on feature branches. Running the sync
    // on that advice would have OVERWRITTEN the newer files with older ones
    // and silently undone the integration.
    //
    // So it reports a direction-free fact and names both readings. The
    // remedy depends on which one is true, and only a human knows that.
    // NAME THE ACTUAL SOURCE. In --dir mode there is no remoteSha, and falling
    // back to `${REPO}@master` printed a provenance the run never consulted --
    // the same species of wrong sentence as the one this file already
    // apologises for two comments down.
    const src = srcDir ? `the checkout at ${srcDir}` : `${REPO}@${(remoteSha || '').slice(0, 7)}`;
    console.error(`\n${stale} file(s) DIFFER from ${src}.`);
    console.error('  This does NOT mean they are stale. A difference can mean the vendored');
    console.error('  copy is BEHIND upstream, or AHEAD of it (forward-ported work that has');
    console.error('  not reached upstream yet) -- and this comparison cannot tell which.');
    console.error('  `npm run sync:bwboard` OVERWRITES the vendored copy with upstream, so');
    console.error('  it is the wrong move for anything that is ahead. Check the direction');
    console.error('  first; --allow-stale accepts the differences and exits 0.');
    process.exit(1);
}

// THIS LINE IS THE ONE THAT LIED. It said "synced from bw-board@master" while
// the CDN had served the previous commit, and it would have said exactly that
// however wrong the content was, because `master` is the one part of the
// sentence guaranteed not to be about what arrived. Say the sha.
const sourceSha = srcDir ? await localSha(srcDir) : remoteSha;

// AND THIS LINE LIED IN A SECOND WAY. "vendored engine up to date" is a
// statement about FILES, and in remote mode FILES is the hand-written FALLBACK
// list -- 26 entries against 120 .js files actually vendored. The other 94,
// which include the ENTIRE 8086 tier (i8086-*.js, i8254.js, i8237.js,
// i8251.js, adc0809.js), were never compared and the summary said nothing
// about them. That is how lite's i8086-machine.js drifted from bw-board's
// without anything noticing.
//
// A check reports on the files it FOUND, never on the files that exist. So it
// says which, and a `--dir` sync (which globs the real tree) is the only mode
// entitled to the unqualified sentence.
// FILES NOW COMES FROM THE TREE, so "did the manifest cover everything?" is
// answered the other way round: what is vendored here that upstream does not
// have? Those files are UNMANAGED -- no sync will update them and no check
// will compare them -- and they are invisible unless counted.
//
// They are not necessarily wrong. Right now they are the forward-ported 8086
// tier, deliberately here ahead of bw-board's master. But "deliberate" and
// "unwatched" are different things, and the second is what this prints.
const managed = new Set(FILES.map((f) => f.replace(/^src\//, '')));
const unmanaged = (await vendoredFiles())
    .filter((f) => f.endsWith('.js') && !managed.has(f));
const coverage = unmanaged.length
    ? `\n  ${unmanaged.length} vendored file(s) are NOT in ${srcDir ? srcDir : `${REPO}@${(remoteSha || '').slice(0, 7)}`}`
      + ` and so are neither synced nor checked:\n    ${unmanaged.sort().join('\n    ')}`
    : '';
const covered = FILES.length;

console.log(check ? (stale ? `\n${stale} intentional downstream file delta(s) allowed.` : `\n${covered} vendored files up to date${coverage}.`)
    : `\nsynced from ${REPO}@${sourceSha}${srcDir ? ` (local checkout ${srcDir})` : ` (resolved from ${REF})`}.`
      + ' Next: npm run integrate');

// Record the upstream commit this sync captured, so vendor-freshness CI
// compares against the PIN, not a moving HEAD (bump = re-run this sync).
// Remote mode records too — it resolved a real sha above; leaving the
// pin untouched made a remote sync lie about what it vendored.
if (!check) {
    try {
        await recordPin('bw-board', sourceSha);
    } catch (e) { console.warn(`  (pin not recorded: ${e.message})`); }
}
