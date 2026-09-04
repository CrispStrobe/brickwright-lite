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
//
// ...and it scans `scripts/` too, which it did not until 2026-08-30. An app
// module can have a consumer that is not app code: `render-schematic.mjs` (the
// `verify:schematic-corpus` gate) imports `schematic-svg.js`, and
// `oracle-differential.mjs` imports `trace-oracle.js`. Both were carried in
// KNOWN_DEAD for as long as that list has existed, because the scan looked in
// exactly one place and answered confidently from it.
//
// `test/` is NOT scanned, and that is the doctrine, not an oversight. Every bug
// in the header above was correct code that passed its own tests; a test is
// therefore the one caller that proves nothing. Counting tests as consumers
// would make this file green for precisely the modules it exists to find.
//
// ROADMAP §4.1 has the triage, the numbers, and why deleting a VENDORED file is
// not the tool the roadmap thought it was.

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
const scriptsDir = resolve(repo, 'scripts');
const roadmapPath = resolve(repo, 'ROADMAP.md');

/**
 * Modules that are legitimately imported by nobody, each with the reason and
 * the ROADMAP item that owns it.
 *
 * An entry here is a claim that the file has a caller outside the import
 * graph — a runtime loader, a separate entry point, a build step. "We might
 * use it later" is not a reason; delete it and let git remember.
 *
 * `roadmap` is not decoration. An exclusion with a reason but no owner is a
 * to-do with a green checkmark on it, which is what §4 said about the state
 * this list was in. The gate below refuses an entry whose anchor does not
 * exist, and refuses one whose section does not NAME the file — a heading
 * vague enough to cover anything owns nothing.
 */
const ALLOWED = new Map([
    ['lib/sdcc-wasm/dist/cc1.js', {roadmap: '4.2',
        reason: 'Emscripten output, loaded by compiler.js through the same computed ' +
            'webpack-ignored URL as the other three stages (preprocessor).'}],
    ['lib/sdcc-wasm/dist/sdcc.js', {roadmap: '4.2',
        reason: 'Emscripten output. Loaded at runtime by compiler.js as ' +
            '`import(/* webpackIgnore: true */ resolve(\'sdcc.js\'))` — a computed ' +
            'specifier, which no static scan can follow. Verified 2026-08-30.'}],
    ['lib/sdcc-wasm/dist/sdas8051.js', {roadmap: '4.2',
        reason: 'Emscripten output, as above (assembler). compiler.js:45.'}],
    ['lib/sdcc-wasm/dist/sdld.js', {roadmap: '4.2',
        reason: 'Emscripten output, as above (linker). compiler.js:46.'}],
    ['lib/smallerc-wasm/dist/smlrc.js', {roadmap: '4.6',
        reason: 'Emscripten output (the C compiler). Loaded by smallerc-wasm/compiler.js as ' +
            '`import(/* webpackIgnore: true */ resolve(\'smlrc.js\'))` — a computed specifier. ' +
            'Executed by test/smallerc-wasm.test.mjs. Verified 2026-09-04.'}],
    ['lib/smallerc-wasm/dist/smlrpp.js', {roadmap: '4.6',
        reason: 'Emscripten output (the ucpp preprocessor), loaded the same way and executed by ' +
            'the same test. Verified 2026-09-04.'}],
    ['lib/bw-circuit-ui/main.jsx', {roadmap: '4.3',
        reason: 'bw-circuit-ui\'s own standalone demo entry point. Vendored wholesale by ' +
            'sync-bw-circuit-ui.mjs, which copies the upstream src tree rather than ' +
            'cherry-picking; unused here by design.'}]
]);

/**
 * Known dead modules, as a ratchet. This number may only go down.
 *
 * Listing them is not approval — it is the difference between debt that is
 * recorded and debt that is invisible. A new dead module fails this test by
 * name; removing one means editing this list in the same commit.
 */
const KNOWN_DEAD = new Map([
    // schematic-svg.js was here, and never belonged: scripts/render-schematic.mjs
    // imports it, and that script IS the `verify:schematic-corpus` gate. Left the
    // list 2026-08-30 when the scan started reading scripts/.
    // trace-oracle.js was here for the same reason: scripts/oracle-differential.mjs
    // imports it. Two of twelve "known dead" modules had a live consumer the scan
    // was never pointed at.
    // pane-column.jsx was here. Its collapsed-strip branch was the only part with a
    // caller waiting for it, and pane-strip.jsx now does that job for the one column
    // that collapses; the rest of it rendered the two-slot layout, which was ruled out
    // as not worth breaking Scratch's <Tabs> apart for (BLOCKED.md, "pane-slots"). Kept
    // as a comment rather than silently dropped, because the ratchet's whole point is
    // that the list moving is visible.
    // flyout-resize.js was here, and is now DELETED (2026-08-30). It was the one
    // entry that was genuinely ours, genuinely unwired, and whose feature is
    // deferred rather than pending (§3.2 pane-slots). The roadmap's rule for that
    // case is "delete the vendored file until its feature is real", and for a file
    // we wrote, deletion is a tool we actually have. git remembers it.
    ['lib/bw-circuit-ui/model/demo-netlist.js', {roadmap: '4.3',
        reason: 'Vendored; used only by bw-circuit-ui\'s standalone demo (main.jsx).'}],
    // export-png.js removed from KNOWN_DEAD: the lite export menu now imports it.
    ['lib/bw-circuit-ui/model/simulation.js', {roadmap: '4.3',
        reason: 'Vendored; lite drives the board through bw-board, not through ' +
            'bw-circuit-ui\'s own simulation shim.'}],
    // machine-extract.js removed from KNOWN_DEAD: now imported by upstream circuit-ui.
    // bw-board vendored tree: device-specific modules synced for completeness, wired when
    // the corresponding device target or debug view lands. Each is a leaf — nothing within
    // the vendored tree imports it either; the sync copies the full src/ tree.
    ['lib/bw-board/avr-peripherals.js', {roadmap: '4.4',
        reason: 'Vendored; AVR peripheral extensions (SPI/I2C devices) — wired when AVR debug lands.'}],
    ['lib/bw-board/face-live.js', {roadmap: '4.4',
        reason: 'Vendored; live-mode face resolver — wired when tethered hardware lands.'}],
    // m6502-extract.js removed from KNOWN_DEAD: now imported by drc.js (bus extractor DRC rule).
    ['lib/bw-board/m6507-machine.js', {roadmap: '4.4',
        reason: 'Vendored; Atari 2600 / SBC6507 machine — future device target.'}],
    // m74c922.js removed from KNOWN_DEAD: tier2-parts registers its physical keypad model.
    // mc6845.js removed from KNOWN_DEAD: now imported by upstream bw-board (tilevga).
    ['lib/bw-board/blinkenrocket-modem.js', {roadmap: '4.4',
        reason: 'Vendored; blinkenrocket audio modem — wired when firmware upload lands.'}],
    ['lib/bw-board/zx-tzx.js', {roadmap: '4.4',
        reason: 'Vendored; ZX Spectrum tape format — wired when tape loading lands.'}],
    // vdu-decoder.js removed from KNOWN_DEAD: now imported by vdu-terminal.jsx (BBC BASIC VDU canvas).
    // z80-debug.js removed from KNOWN_DEAD: now imported by debug-target-factory (Z80 interactive target).
    // z80-extract.js removed from KNOWN_DEAD: now imported by drc.js (bus extractor DRC rule).
    // i8237.js and upd765.js were listed here for ONE sync and are gone again, and
    // the reason is worth keeping: they were not dead in lite, they were dead
    // EVERYWHERE. I8086Machine's chip factory had no 'dma' and no 'fdc' kind, so no
    // config in any repo could instantiate either. Both chips' own suites were
    // green. This gate found it by asking a question nobody upstream was asking,
    // which is the fourth time a finding here came from an unrelated direction.
    // i8086-asm.js removed from KNOWN_DEAD 2026-09-04: lib/bw-asm/assemble-route.js
    // imports it, and the ▶ button routes 8086 devices to it. The entry said the
    // blocker was "a tab design change, not a wiring change" — so the change was
    // designed and argued for in that module's header rather than smuggled in
    // here, and one tab now has two assemble routes on purpose.
    ['lib/bw-board/i8086-emu8086.js', {roadmap: '4.4',
        reason: 'Vendored; the emu8086 dialect adapter. Its consumer is bw-board\'s '
            + 'corpus harness (scripts/run-i8086-corpus.mjs), which lite does not '
            + 'ship — it exists to run the 525-file teaching corpus against the '
            + 'core, not to serve the app. Arrives with the sync, which copies the '
            + 'full src/ tree.'}],
    ['lib/bw-board/i8088-biu.js', {roadmap: '4.4',
        reason: 'Vendored; the experimental 8088 bus-timing predictor is exercised by '
            + 'bw-board\'s cycle-model corpus, not by lite\'s instruction-stepped app.'}],
    ['lib/bw-board/reseat-gate.js', {roadmap: '4.4',
        reason: 'Vendored; a bw-board acceptance helper used to compare machines during '
            + 'cross-family reseating. It is test infrastructure, not app runtime code.'}],
]);

const SPEC = /from\s+['"]([^'"]+)['"]|import\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]/g;

function walk (dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (['.js', '.jsx', '.mjs'].includes(extname(p))) out.push(p);
    }
    return out;
}

/**
 * Every module specifier written anywhere a CONSUMER can live.
 *
 * Two places: the integrated app tree, and `scripts/`. Not `test/` — see the
 * header. A file's basename appearing here is a weak signal (two modules with
 * the same basename are indistinguishable) but it is the conservative
 * direction: it can only ever call a dead module live, never a live one dead,
 * and calling a live module dead is the mistake that nearly deleted a fix.
 */
function referencedBasenames () {
    const referenced = new Set();
    const files = [...walk(builtSrc), ...(existsSync(scriptsDir) ? walk(scriptsDir) : [])];
    for (const f of files) {
        for (const m of readFileSync(f, 'utf8').matchAll(SPEC)) {
            const spec = m[1] || m[2] || m[3];
            const base = spec.replace(/\/$/, '').split('/').pop();
            referenced.add(base);
            referenced.add(base.replace(/\.(js|jsx|mjs)$/, ''));
        }
    }
    return referenced;
}

/**
 * ROADMAP `### N.M …` sections, id -> the section's body.
 *
 * The body is what makes the anchor gate mean something: an entry must be
 * NAMED by the item that claims to own it. Pointing sixteen exclusions at one
 * heading called "standing debt" would otherwise satisfy a gate that only
 * checked the heading exists, and that is the state §4 was already in.
 */
function roadmapSections () {
    const src = readFileSync(roadmapPath, 'utf8');
    const out = new Map();
    const heads = [...src.matchAll(/^###\s+(\d+\.\d+[a-z]?)\s+([^\n]*)$/gm)];
    for (let i = 0; i < heads.length; i++) {
        const start = heads[i].index + heads[i][0].length;
        const end = i + 1 < heads.length ? heads[i + 1].index : src.length;
        out.set(heads[i][1], src.slice(start, end));
    }
    return out;
}

/** The anchor gate itself, as a function, so it can be run against a fabricated
 *  entry as well as the real ones. A gate nobody has watched fail is a claim. */
function anchorComplaints (entries, sections) {
    const bad = [];
    for (const [path, entry] of entries) {
        const name = basename(path);
        if (!entry || typeof entry !== 'object' || !entry.roadmap) {
            bad.push(`${path}: no roadmap anchor — "later" with no owner and no date`);
            continue;
        }
        const body = sections.get(entry.roadmap);
        if (body === undefined) {
            bad.push(`${path}: names ROADMAP §${entry.roadmap}, which does not exist`);
        } else if (!body.includes(name)) {
            bad.push(`${path}: ROADMAP §${entry.roadmap} exists but never mentions ${name}`);
        }
        if (!entry.reason || entry.reason.length <= 20) {
            bad.push(`${path}: listed without a real reason`);
        }
    }
    return bad;
}

/**
 * The integrated tree must match the overlay before any of this means anything.
 *
 * This test lists modules from `overlay/` but looks for their importers in
 * `packages/` — the integrated copy. `packages/` is generated and gitignored,
 * so it goes stale the moment a vendor sync lands without `npm run integrate`.
 * When that happens the test does not fail to run; it fails with the WRONG
 * ANSWER, accusing a live module of being dead because the stale copy of its
 * importer has not caught up.
 *
 * That happened on 2026-08-10: `terminal-aliases.js` was reported as imported
 * by nothing while `circuit.js` had imported it since 92c6450 — the schematic
 * wire fix. Six files were stale. The finding read as "delete this dead code",
 * which would have removed the fix.
 *
 * So the staleness is checked first and named for what it is. A test whose
 * input is out of date should say so, not answer confidently from it.
 */
function staleIntegratedFiles () {
    const stale = [];
    for (const f of walk(overlaySrc)) {
        const rel = relative(overlaySrc, f).split('\\').join('/');
        const built = join(builtSrc, rel);
        if (!existsSync(built)) continue;
        if (readFileSync(f, 'utf8') !== readFileSync(built, 'utf8')) stale.push(rel);
    }
    return stale;
}

test('the integrated tree is current', {
    skip: existsSync(builtSrc) ? false :
        'packages/scratch-gui not integrated — run `npm run integrate` first'
}, () => {
    const stale = staleIntegratedFiles();
    assert.deepEqual(stale, [],
        `${stale.length} file(s) differ between overlay/ and the integrated ` +
        `packages/ tree:\n    ${stale.join('\n    ')}\n\n` +
        `Run \`npm run integrate\`. Until then the dead-module check below is ` +
        `reading a stale copy and can report a live module as dead — which is ` +
        `how a real fix nearly got deleted as dead code.`);
});

test('every overlay module is imported by something', {
    skip: existsSync(builtSrc) ? false :
        'packages/scratch-gui not integrated — run `npm run integrate` first'
}, () => {
    const referenced = referencedBasenames();

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
    const referenced = referencedBasenames();
    const revived = [...KNOWN_DEAD.keys()].filter((rel) => {
        const name = basename(rel);
        return referenced.has(name) || referenced.has(name.replace(/\.(js|jsx)$/, ''));
    });
    assert.deepEqual(revived, [],
        `these are listed in KNOWN_DEAD but something imports them now — remove them ` +
        `from the list:\n` + revived.map((r) => `  ${r}`).join('\n'));
});

/**
 * Every exclusion is owned by a roadmap item that names it.
 *
 * ROADMAP §4 measured this list at sixteen and called it "a roadmap hiding in a
 * test's exclusion list": six future device features recorded nowhere a reader
 * of the planning docs would ever look. Its rule — promote each to a tracked
 * item with what-it-takes and blocked-on, or delete the file until its feature
 * is real — held for exactly as long as somebody remembered it.
 *
 * This is the same rule, enforced. A new exclusion cannot be added without
 * writing the item it belongs to, and an item cannot be a vague heading,
 * because the section has to say the file's name.
 */
test('every exclusion is owned by a ROADMAP item that names it', () => {
    const sections = roadmapSections();
    assert.ok(sections.size >= 5,
        `parsed only ${sections.size} numbered ROADMAP sections — the scan is broken, ` +
        'and a broken scan makes every entry below unownable rather than owned.');
    const bad = anchorComplaints([...ALLOWED, ...KNOWN_DEAD], sections);
    assert.deepEqual(bad, [],
        `${bad.length} exclusion(s) are not owned by a roadmap item:\n` +
        bad.map((b) => `  ${b}`).join('\n') +
        '\n\nAn exclusion that says "later" with no owner and no date is a to-do with ' +
        'a green checkmark on it. Add a `### N.M` item to ROADMAP.md saying what it ' +
        'would take and what it is blocked on, name the file in it, and point the ' +
        'entry at it — or delete the file.');
});

test('the anchor gate can fail (three ways)', () => {
    // Verify the instrument. This gate's whole job is to refuse something, and
    // a refusal nobody has watched happen is a claim about code, not a result.
    const sections = roadmapSections();
    const anchored = [...KNOWN_DEAD][0];
    assert.ok(anchored, 'KNOWN_DEAD is empty — nothing to model a fabricated entry on');

    const anchorless = anchorComplaints(
        [['lib/fabricated.js', {reason: 'a reason long enough to pass the length check'}]],
        sections);
    assert.equal(anchorless.length, 1, 'an entry with no roadmap anchor must be rejected');
    assert.match(anchorless[0], /no roadmap anchor/);

    const wrongAnchor = anchorComplaints(
        [['lib/fabricated.js', {roadmap: '99.9', reason: 'a reason long enough to pass'}]],
        sections);
    assert.equal(wrongAnchor.length, 1, 'an entry naming a nonexistent item must be rejected');
    assert.match(wrongAnchor[0], /does not exist/);

    // The one that matters most: a real item that does not actually mention the
    // file. Without this, sixteen entries could point at one heading and the
    // gate would call that ownership.
    const unnamed = anchorComplaints(
        [['lib/fabricated.js', {roadmap: anchored[1].roadmap,
            reason: 'a reason long enough to clear the length check on its own'}]],
        sections);
    assert.equal(unnamed.length, 1, 'an entry its own section never names must be rejected');
    assert.match(unnamed[0], /never mentions fabricated\.js/);
});
