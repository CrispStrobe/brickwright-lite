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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
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

// THE ALLOW-LIST TURNS "ONLY A HUMAN KNOWS THE DIRECTION" INTO A FACT THE
// REPO HOLDS. Read the message this script prints when files differ: it says,
// correctly, that a difference can mean BEHIND or AHEAD and the comparison
// cannot tell which. That was true when the only evidence was "the bytes
// differ". It is no longer true for work that has been written down.
//
// docs/VENDOR-DIVERGENCE-I8086-MACHINE.md carries a JSON block naming each
// piece of lite-only work in i8086-machine.js and a regex that must match it.
// For those, the direction IS knowable: if the CURRENT vendored copy satisfies
// an entry and the INCOMING upstream text does not, then this write deletes
// forward-ported work, and the script can say so by name instead of asking
// someone to notice a red test afterwards.
//
// A tripwire tells you after the fact. This refuses.
const readVendorAllowList = async () => {
    const md = await readFile(
        path.join(here, '..', 'docs', 'VENDOR-DIVERGENCE-I8086-MACHINE.md'), 'utf8').catch(() => null);
    if (md === null) return null;          // reported below; never silently empty
    const m = md.match(/```json\n([\s\S]*?)\n```/);
    if (!m) return null;
    const spec = JSON.parse(m[1]);
    // PER FILE NOW, not the single file whose divergence someone wrote up
    // first. That single-file version protected i8086-machine.js and watched
    // fifteen other files lose 950 lines on the run that tested it.
    return new Map(Object.entries(spec.files).map(([f, cfg]) => [f, cfg.liteOnly]));
};
const allowList = await readVendorAllowList();
if (!allowList) {
    // Species 1: an empty guard is indistinguishable from a satisfied one. If
    // the doc is gone or unparseable the sync must not proceed as though the
    // protection were in force -- it must say the protection is NOT in force.
    console.error('\n  WARNING: docs/VENDOR-DIVERGENCE-I8086-MACHINE.md is missing or has no');
    console.error('  JSON allow-list block. Forward-ported work in i8086-machine.js is NOT');
    console.error('  protected on this run. Nothing below is evidence that it survived.');
}
const wouldDelete = [];
const wouldTruncate = [];
const force = process.argv.includes('--force');
// The pin the vendored copy came from — the third point of the comparison,
// read before this run overwrites it.
const OLD_PIN = await readFile(new URL('../vendor-pins.json', import.meta.url), 'utf8')
    .then(t => JSON.parse(t)['bw-board'] ?? null)
    .catch(() => null);

// --only <a.js,b.js>: restrict the sync to named files.
//
// WHY THIS EXISTS, added 2026-09-05 while bumping the pin for the first time
// in months. 28 files differed, and measuring direction per file showed they
// point BOTH WAYS: lite is behind on i8259 (32 lite-only lines against 156
// upstream) and ahead on i8086-debug (232 against 12). A blanket --force
// would have taken the five files the bump actually needs and destroyed
// roughly 900 lines of forward-ported debugger work to get them.
//
// The refusal above is right that content cannot tell direction. What it
// cannot do is act on a direction a human HAS established. Without --only the
// choice was all-or-nothing, and all-or-nothing under time pressure is how
// the nothing stops being chosen.
//
// The guard still applies to the named files: --only narrows WHAT is
// considered, it does not weaken WHAT IS CHECKED. A file that is genuinely
// behind still needs --force, and that force is now scoped to it.
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx !== -1 && process.argv[onlyIdx + 1]
    ? new Set(process.argv[onlyIdx + 1].split(',').map((s) => s.trim()).filter(Boolean))
    : null;

// THE ALLOW-LIST EXPLAINS; THIS MEASURES. The named entries above cover ONE
// file, because it is the one whose divergence someone sat down and wrote up.
// I found out what that was worth by running this script for real against
// bw-board to test the guard: i8086-machine.js was protected and FIFTEEN OTHER
// FILES LOST 950 LINES. Reverted from git, but nothing in the tool would have
// told me -- the sync printed `wrote` fifteen times and exited 0.
//
// Measured across the whole vendored tree: 1123 lines exist here and not
// upstream, in 17 files. The tool's own comment already said all ten sampled
// differences were the AHEAD kind. So the safe default is not a curated list
// of protected files -- a list is one more thing that goes stale, and the
// fifteen files it would have needed were not on it. It is to DERIVE the
// direction from the content on every run: a write that removes lines present
// here and absent upstream is a write that destroys forward-ported work,
// whatever the file is called and whether or not anyone documented it.
//
// Refuses rather than warns, because `wrote i8086-debug.js` scrolling past is
// indistinguishable from the correct outcome. --force overrides, deliberately.
/**
 * THREE-WAY, NOT TWO-WAY. See sync-sb3creator.mjs for the measurement that
 * forced this; the rule was wrong in both scripts because I wrote it here
 * first and ported the mistake.
 *
 * Comparing the vendored copy only against the INCOMING one calls every line
 * absent from the incoming "lost" -- including lines UPSTREAM ITSELF EDITED,
 * which is the ordinary case for any real bump. Measured on sb3-creator
 * eb5b286 -> fdd9d7d it produced four refusals of which three were entirely
 * upstream's own edits, so the normal bump required --force, and --force
 * deletes the lite-only work the guard exists to protect. A gate that must be
 * bypassed to do the routine thing stops being there for the exceptional one.
 *
 * The third point is the OLD PINNED VERSION: a line is lite-only if it is in
 * the vendored copy and was not in upstream at the pin that copy came from.
 * Upstream editing its own line changes the incoming, not that set.
 *
 * Falls back to two-way when the old pin is unreadable, and says so.
 */
const linesLostBy = (current, next, base) => {
    const norm = t => t.split('\n').map(l => l.trim());
    const trivial = l => !l || l === '}' || l === '};' || l === '{';
    const incoming = new Set(norm(next));
    const liteOnly = base === null
        ? norm(current)
        : (() => { const b = new Set(norm(base)); return norm(current).filter(l => !b.has(l)); })();
    return liteOnly.filter(l => !trivial(l) && !incoming.has(l));
};

/** The file as it stood at the pin the vendored copy was taken from. */
const atOldPin = async (rel) => {
    if (!srcDir || !OLD_PIN) return null;
    try {
        const {stdout} = await execFileP('git', ['-C', srcDir, 'show', `${OLD_PIN}:${rel}`],
            {maxBuffer: 32 * 1024 * 1024});
        return stdout;
    } catch { return null; }
};
let warnedFallback = false;

// THE PIN MUST STILL BE THE OLD ONE WHEN THIS RUNS, and that is checkable
// rather than merely documented.
//
// The three-way comparison's base is `git show <pin>:<file>` — the file as it
// stood at the pin the vendored copy came from. If the pin has ALREADY been
// moved to the sha being synced (say, resolved by hand during a rebase
// conflict, which is exactly how I did it), the base becomes the INCOMING
// file. Every line upstream deleted then looks lite-only, and every line it
// added looks like work about to be lost. The guard inverts.
//
// It fails in the direction that makes the guard look broken rather than
// permissive, which is the safer half — but it is silent, and a maintainer
// reading four bogus refusals concludes the rule is wrong rather than that
// the pin moved early. So: say so, by name.
//
// The script records the new pin itself at the end. Nothing should set it
// beforehand.
const pinAlreadyMoved = async () => {
    // Never under --check: a check writes nothing, so the ordering hazard cannot
    // apply, and the nightly freshness workflow checks out each upstream AT the
    // pin, where HEAD == pin is the healthy state, not a moved pin (the first
    // nightly after this guard landed exited 2 on both vendor steps). Inside the
    // guard, not at the call site, so the next caller cannot forget it.
    if (check) return false;
    if (!srcDir || !OLD_PIN) return false;
    try {
        const {stdout} = await execFileP('git', ['-C', srcDir, 'rev-parse', 'HEAD']);
        return stdout.trim() === OLD_PIN.trim();
    } catch { return false; }
};
if (await pinAlreadyMoved()) {
    console.error('\n  PIN ALREADY MOVED: vendor-pins.json records the sha this run is syncing');
    console.error(`  FROM (${OLD_PIN.slice(0, 9)}), so the guard's three-way base is the incoming`);
    console.error('  file and every upstream edit will read as lite-only work being deleted.');
    console.error('  Restore the PREVIOUS pin and re-run; this script records the new one itself.');
    process.exit(2);
}

await mkdir(dest, {recursive: true});
let stale = 0;
for (const rel of FILES) {
    if (only && !only.has(path.basename(rel))) continue;
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
    // ORDER MATTERS, AND I GOT IT WRONG FIRST. The coarse guard ran first and
    // `continue`d, so the named tier never executed and its WHAT BREAKS line --
    // the entire reason that tier exists -- never printed. A refusal that says
    // "170 lines" tells you to stop; one that says "you save, reload, and the
    // machine comes back subtly wrong" tells you what you are about to lose.
    // Losing the second to a `continue` made the coarse guard strictly worse
    // than the thing it was generalising.
    //
    // So: named first, for the files someone has written up. Coarse second,
    // for everything else -- it still cannot be bypassed by an undocumented
    // file, because a file the named tier does not cover falls straight
    // through to it.
    if (!check && !force && allowList && allowList.has(path.basename(rel)) && current !== null) {
        const lost = allowList.get(path.basename(rel)).filter(d => {
            const re = new RegExp(d.contains);
            return re.test(current) && !re.test(next);
        });
        if (lost.length) {
            wouldDelete.push({file: path.basename(rel), lost});
            console.log(`  REFUSED ${path.basename(rel)} (would delete ${lost.length} named divergence(s) -- see below)`);
            continue;
        }
    }

    // Content-derived guard, for every file the named tier did not cover.
    if (!check && !force && current !== null) {
        const base = await atOldPin(rel);
        if (base === null && !warnedFallback) {
            warnedFallback = true;
            console.error('  NOTE: the old pinned version is not readable here, so the guard is');
            console.error("  using the two-way rule, which reports upstream's own edits as losses.");
        }
        // Upstream did not touch this file since the old pin: the vendored copy
        // differs from the incoming only by what lite added on top, so keep it.
        // Not a refusal -- a permanently lite-only addition must not make every
        // bump refuse, or the guard becomes the thing people --force past.
        if (base !== null && base === next) {
            const kept = linesLostBy(current, next, base).length;
            if (kept) { console.log(`  kept  ${path.basename(rel)} (unchanged upstream since ${OLD_PIN.slice(0, 9)}; ${kept} lite-only line(s) preserved)`); continue; }
        }
        const lost = linesLostBy(current, next, base);
        if (lost.length) {
            wouldTruncate.push({file: path.basename(rel), count: lost.length, sample: lost.slice(0, 3)});
            console.log(`  REFUSED ${path.basename(rel)} (would delete ${lost.length} line(s) that exist only here)`);
            continue;
        }
    }
    if (check) console.log(`  DIFFERS ${path.basename(rel)}`);
    else { await writeFile(out, next); console.log(`  wrote ${path.basename(rel)}`); }
}

if (wouldDelete.length) {
    console.error('\nREFUSED TO OVERWRITE forward-ported work:\n');
    for (const {file, lost} of wouldDelete) {
        for (const d of lost) console.error(`  ${file}: ${d.id}\n      WHAT BREAKS: ${d.falsifiable}\n      ${d.why}\n`);
    }
    console.error('  These are recorded in docs/VENDOR-DIVERGENCE-I8086-MACHINE.md as work');
    console.error('  that lives here and not upstream. Upstream does not have them, so this');
    console.error('  sync would delete them -- and the machine would still construct and no');
    console.error('  other test would fail, which is exactly why this refuses rather than');
    console.error('  warns. Upstream the work, or graft the upstream change by hand and');
    console.error('  leave the entry in place. If the work is genuinely obsolete, delete its');
    console.error('  entry from the allow-list in the same commit that drops it.');
}

if (wouldTruncate.length) {
    const total = wouldTruncate.reduce((n, f) => n + f.count, 0);
    console.error(`\nREFUSED: ${total} line(s) in ${wouldTruncate.length} file(s) exist here and not upstream.\n`);
    for (const f of wouldTruncate) {
        console.error(`  ${f.file}  (${f.count} lines)`);
        for (const l of f.sample) console.error(`      - ${l.slice(0, 96)}`);
    }
    console.error('\n  A sync OVERWRITES the vendored copy with upstream, so every one of those');
    console.error('  lines would be gone. The machine would still construct and no other test');
    console.error('  would fail -- which is why this refuses instead of warning.');
    console.error('\n  This is measured from the content, not read from a list, so it stays');
    console.error('  true for files nobody has documented. If upstream genuinely supersedes');
    console.error('  this work, --force. Check the direction first: the ten differences');
    console.error('  sampled on 2026-09-04 were ALL forward-ported work, none were stale.');
}

if (wouldDelete.length || wouldTruncate.length) process.exit(1);

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
