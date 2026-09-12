/**
 * THE RESIDUE RATCHET — the remainder a declared file differs from upstream
 * BEYOND its declared divergences, ratcheted to zero.
 *
 * `vendor-identity` forgives a declared file's WHOLE byte-difference: once a file
 * has any ledger entry it is classified `diverged` and every further difference
 * rides in free. docs/VENDORING-REGIME.md § "The hole" names it and carries the
 * measurement; the verdict is not restated here, because the copy that used to
 * stand in this paragraph said the edit "reds every other vendor gate" — the exact
 * inverse of the finding, in the header of the gate that exists BECAUSE it reds
 * nothing. This one attributes each changed REGION to a declared entry and
 * counts what no entry claims. That count may only fall; its terminal value is
 * zero, at which point a declared file differs from upstream by exactly what the
 * ledger says and nothing else.
 *
 * ## Why a ratchet and not "residue must be zero today"
 *
 * The bridges (z80-debug, m6502-debug) carry a large residue that is not a defect
 * to fix in this commit: it is a convergence held on the owner's veto/dedup ruling
 * (see VENDORING-REGIME and the ledger dispositions). A ratchet records the
 * measured remainder and forbids it GROWING, which closes the hole — an
 * undetectable new divergence now reds by count — while the deadline on the
 * declared entries drives the existing remainder down.
 *
 * i8086 is at ZERO since 2026-09-11, and how it got there is worth the space. Its
 * floor used to be one lite-ahead run -- the restore-side displayRevision bump --
 * which could not be resolved inside lite because it was upstream work. It was sent
 * up as bw-board `b4ec3a9` and came back at this pin, so the run is gone.
 *
 * WHAT SURVIVED THE CONVERGENCE WAS THE PROSE. Once the code matched, the whole
 * remaining run was COMMENT -- lite's note saying `Lite-only (upstream lacks it)`,
 * which the landing had made false. So the number did NOT move when the code
 * converged, and read as an incomplete convergence. Read a stuck residue line by
 * line before concluding the convergence failed.
 *
 * ## What the number counts, and how a region is attributed
 *
 * Contiguous runs of changed, SUBSTANTIVE, unclaimed lines, split by direction; a
 * structural-only run (a bare brace, a lone `return n;`) is a diff boundary
 * artifact and is not counted. Attribution and the claim model live in
 * scripts/lib/vendor-residue.mjs; the diff algorithm is pinned there so the count
 * is a property of the trees, not of whoever runs it.
 *
 * ## Judged only against the tree at the pin
 *
 * The residue is meaningful only against upstream AT THE PIN. Off-pin, or with no
 * upstream tree on disk, this SPEAKS (reports what it found) and SKIPS — a byte
 * difference against an unknown commit is a report about someone's branch, not a
 * divergence. The schema checks (every entry declares a region; no catch-all is
 * claimed region-only) need no upstream and always run.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {residueForFile, claimsFromFileCfg, catchAllWithoutBlock} from '../scripts/lib/vendor-residue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs/VENDOR-DIVERGENCE-I8086-MACHINE.md');
const PINS = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));

/**
 * THE RATCHET. Lower these; never raise them. A rise means a declared file grew a
 * divergence no entry explains — send it upstream, sync it down, or (with a
 * measured reason) declare it, which lowers this number by claiming it. A fall
 * means someone paid residue down: write the smaller number here in the same
 * commit, so the number is the truth and not a high-water mark.
 */
const RESIDUE = {
    // EMPTY. The terminal value, reached 2026-09-11: no declared file remains, so
    // there is no file left to carry residue. m6502-debug.js was the last, and it
    // left by the front door rather than by being forgiven -- `replayToInputBoundary`
    // went UPSTREAM (bw-board), and lite now takes the file byte-identical.
    //
    // THE MAP STAYS, EMPTY, and the test below asserts it against a measurement.
    // Deleting it would delete the thing that notices the first file to come back.
};

// liteRemoved is a DECISION (may hold steady forever); liteBehind is a DEBT (may
// only fall). Counted separately so the ratchet can tell peace from obligation.
// ZERO since 2026-09-11. The i8086 CycleEstimator removal is GONE -- not
// converged, DISSOLVED: bw-board 5afadcd made the estimator an injected option
// instead of a module-scope import, so lite takes i8086-machine.js byte-identical
// and simply does not pass one. A removal stops being a divergence when the thing
// removed stops being mandatory.
const LITE_REMOVED = 0;
const LITE_BEHIND = 0;  // none yet; the bridges become the first when the convergence lands

const readAllowList = () => JSON.parse(fs.readFileSync(DOC, 'utf8').match(/```json\n([\s\S]*?)\n```/)[1]);

const headAtPin = (dir, repo) => {
    const pin = PINS[repo] ?? null;
    let head = null;
    try { head = execSync(`git -C ${JSON.stringify(dir)} rev-parse HEAD`, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); }
    catch { /* not a checkout */ }
    return {head, pin, atPin: Boolean(pin) && head === pin};
};

// The pinned upstream src dir, resolved the way vendor-identity resolves it: only
// an explicit env-var checkout at the pin JUDGES; a sibling or off-pin tree SPEAKS.
const pinnedSrcDir = (envVar = 'BW_BOARD_DIR', repo = 'bw-board') => {
    const candidates = [process.env[envVar], path.resolve(ROOT, `../../${repo}`), path.resolve(ROOT, `../${repo}`)].filter(Boolean);
    const TMP = fs.realpathSync(os.tmpdir());
    const outsideTmp = (d) => { try { return !fs.realpathSync(d).startsWith(TMP); } catch { return false; } };
    const dir = candidates.map(d => path.join(d, 'src')).filter(d => fs.existsSync(d))
        .filter(d => process.env[envVar] ? true : outsideTmp(d))[0];
    const {head, pin, atPin} = dir && process.env[envVar] ? headAtPin(dir, repo) : {head: null, pin: PINS[repo] ?? null, atPin: false};
    return {dir, pinned: Boolean(process.env[envVar]) && atPin, head, pin, candidates};
};

const declaredFiles = (spec) => Object.entries(spec.files);

test('the region checks FIND the defects planted for them — the machinery, not the tree', () => {
    // DRIVEN AGAINST A FABRICATED LEDGER, NOT THE REAL ONE, AND THAT IS THE POINT.
    //
    // This test used to read the real ledger and refuse an empty result:
    // `assert.ok(declaredFiles(spec).length >= 1, 'the ledger declares no files')`.
    // That floor was correct for as long as the ledger had entries and wrong on
    // the day it did not -- the terminal state of a ratchet whose stated goal is
    // zero is exactly the state its own anti-vacuity check called a parse failure.
    //
    // Deleting the floor is not the fix either: with an empty ledger the loop
    // below iterates nothing, `missing` and `catchAll` stay empty, and the region
    // checks pass without having examined anything. A region checker that has
    // stopped working agrees with a clean tree, perfectly, forever.
    //
    // So the checks run over a spec BUILT to fail them. Each fixture entry is a
    // known defect of exactly the shape this test exists to catch, and the
    // assertion is that they are all FOUND. The real ledger's emptiness is then
    // asserted separately, by the test below, as a measurement rather than as the
    // absence of a complaint.
    const spec = SYNTHETIC_BAD;
    const missing = [], catchAll = [];
    let entries = 0;
    for (const [file, cfg] of declaredFiles(spec)) {
        const {claims, missingRegion} = claimsFromFileCfg(cfg);
        entries += (cfg.liteOnly?.length ?? 0) + (cfg.liteRemoved?.length ?? 0) + (cfg.liteBehind?.length ?? 0);
        for (const id of missingRegion) missing.push(`${file}:${id}`);
        for (const id of catchAllWithoutBlock(claims)) catchAll.push(`${file}:${id}`);
    }
    assert.equal(entries, 4,
        `the fabricated ledger parsed ${entries} entries, not 4 — the reader cannot see `
        + 'entries that ARE there, so every region check below is passing over an empty '
        + 'set and would pass over a real ledger full of undeclared regions too');
    assert.deepEqual(missing.sort(), ['bad-a.js:no-region', 'bad-b.js:also-no-region'],
        '\n  THE REGION CHECKER DID NOT FIND THE MISSING REGIONS PLANTED FOR IT.\n  found: '
        + missing.join(', ') +
        '\n\n  Two entries in the fixture have no `region`/`regions` at all. If they are not\n'
        + '  reported here, this check cannot report a real one either, and its silence on\n'
        + '  the live ledger means nothing.\n');
    assert.deepEqual(catchAll, ['bad-c.js:bare-catch-all'],
        '\n  THE CATCH-ALL CHECKER DID NOT FIND THE BARE CATCH-ALL PLANTED FOR IT.\n  found: '
        + catchAll.join(', ') +
        '\n\n  One fixture entry claims `<module>` with no `block` anchor -- the shape that\n'
        + '  swallows a whole file. Not reporting it here means not reporting it anywhere.\n');
});

/**
 * A LEDGER BUILT TO FAIL, so the checks that read the real one are known to work.
 *
 * Every entry here is a defect of a shape the region checks exist to catch:
 * two with no region at all, one claiming a catch-all with no block anchor, and
 * one correctly formed so the fixture cannot pass by reporting everything.
 */
const SYNTHETIC_BAD = {
    files: {
        'bad-a.js': {liteOnly: [{id: 'no-region', disposition: 'upstream: fixture'}]},
        'bad-b.js': {liteOnly: [
            {id: 'also-no-region', disposition: 'upstream: fixture'},
            {id: 'well-formed', disposition: 'upstream: fixture', region: 'someFunction'}
        ]},
        'bad-c.js': {liteOnly: [
            {id: 'bare-catch-all', disposition: 'upstream: fixture', region: '<module>'}
        ]}
    }
};

test('THE REAL LEDGER IS EMPTY — measured, not inferred from a quiet gate', () => {
    // The separation the test above depends on. Those checks now prove the
    // MACHINERY works; this one proves the TREE is clean. Neither can stand in
    // for the other, and collapsing them is what produced an anti-vacuity floor
    // that refused its own goal state.
    const spec = readAllowList();
    assert.deepEqual(Object.keys(spec.files), [],
        'a declared-divergent file is back in the ledger. The residue ratchet is at its '
        + 'terminal value, so this is not a number to raise — it is a fork to send upstream.');
    assert.deepEqual(RESIDUE, {},
        'RESIDUE names files the ledger no longer declares, or the ledger regrew and RESIDUE '
        + 'was edited to match instead of the divergence being sent upstream');
});

test('and the REAL ledger has no entry missing a region or claiming a bare catch-all', () => {
    // The same two checks, over the live tree. Empty today, and the test above is
    // what makes that emptiness worth anything: these two tests together say
    // "the checker works AND it found nothing", which is a different claim from
    // either one alone.
    const spec = readAllowList();
    const missing = [], catchAll = [];
    for (const [file, cfg] of declaredFiles(spec)) {
        const {claims, missingRegion} = claimsFromFileCfg(cfg);
        for (const id of missingRegion) missing.push(`${file}:${id}`);
        for (const id of catchAllWithoutBlock(claims)) catchAll.push(`${file}:${id}`);
    }
    assert.deepEqual(missing, [],
        '\n  LEDGER ENTRIES WITH NO REGION:\n    ' + missing.join('\n    ') +
        '\n\n  The residue ratchet attributes each changed line to a declared region. An entry\n' +
        '  with no `region`/`regions` claims nothing, so its divergence counts as residue and\n' +
        '  the schema is adopted only half-way. Add the region DERIVED by running the\n' +
        '  attributor (scripts/lib/vendor-residue.mjs), never by inspection.\n');
    assert.deepEqual(catchAll, [],
        '\n  CATCH-ALL REGIONS CLAIMED WITHOUT A BLOCK:\n    ' + catchAll.join('\n    ') +
        '\n\n  `<module>`/`<setup>`/`<class-body>`/`<api>` are never a single divergence, so a\n' +
        '  region-only claim there swallows the whole span — the hole, one layer in. Give the\n' +
        '  entry a `block` anchor (or `blocks`) delimiting exactly its divergent lines.\n');
});

test('liteRemoved (a decision) and liteBehind (a debt) are counted separately', () => {
    const spec = readAllowList();
    let removed = 0, behind = 0;
    for (const [, cfg] of declaredFiles(spec)) {
        removed += cfg.liteRemoved?.length ?? 0;
        behind += cfg.liteBehind?.length ?? 0;
    }
    assert.equal(removed, LITE_REMOVED,
        `liteRemoved count is ${removed}, ratchet says ${LITE_REMOVED}. A removal is a DECISION and may ` +
        'hold steady, but a NEW one is still a decision to take in the open with a reason, and a ' +
        'retired one lowers this number — update LITE_REMOVED in the same commit either way.');
    assert.equal(behind, LITE_BEHIND,
        `liteBehind count is ${behind}, ratchet says ${LITE_BEHIND}. A liteBehind is a DEBT that may ` +
        'only fall; it is not liteRemoved and must not share its key, or the ratchet cannot tell ' +
        'peace from obligation. Lower LITE_BEHIND when a debt is paid; a rise needs a new entry with ' +
        'its `markedAt` and is answerable to the liteBehind deadline.');
});

test('the residue matches the ratchet exactly, both directions (needs the pinned bw-board tree)', t => {
    const {dir: srcDir, pinned, head, pin, candidates} = pinnedSrcDir();
    if (!srcDir) {
        t.diagnostic(`SKIPPED, NOT PASSED: upstream not found. Looked in: ${candidates.join(', ')}.`);
        t.skip('upstream tree not on disk — residue NOT verified against the pin');
        return;
    }
    const spec = readAllowList();
    const vendorRoot = path.join(ROOT, spec.vendoredRoots[0]);
    const measured = {}, dead = [];
    for (const [file, cfg] of declaredFiles(spec)) {
        const {claims} = claimsFromFileCfg(cfg);
        const r = residueForFile(path.join(srcDir, file), path.join(vendorRoot, file), claims);
        measured[file] = {ahead: r.aheadRuns.length, behind: r.behindRuns.length};
        for (const id of r.deadClaims) dead.push(`${file}:${id}`);
    }
    if (!pinned) {
        t.diagnostic(`sibling tree ${srcDir}: residue = ${JSON.stringify(measured)}`);
        t.skip(process.env.BW_BOARD_DIR && head
            ? `BW_BOARD_DIR is at ${head.slice(0, 9)} but the pin is ${pin?.slice(0, 9)} — a tree off the pin may SPEAK, not JUDGE`
            : 'a sibling bw-board checkout was found but its commit is unknown — set BW_BOARD_DIR to a checkout at the pin (CI does)');
        return;
    }
    // A dead claim (anchor matches nothing) is a claim that has silently stopped
    // covering anything, which quietly turns its divergence back into residue.
    assert.deepEqual(dead, [],
        '\n  LEDGER CLAIMS WHOSE ANCHOR MATCHES NOTHING IN THE FILE:\n    ' + dead.join('\n    ') +
        '\n\n  The block/contains anchor no longer appears, so the claim covers no lines and its\n' +
        '  divergence is silently residue again. Fix the anchor, or retire the entry if the\n' +
        '  work is gone.\n');
    assert.deepEqual(measured, RESIDUE,
        '\n  THE RESIDUE HAS MOVED FROM THE RATCHET.\n\n  measured: ' + JSON.stringify(measured) +
        '\n  ratchet:  ' + JSON.stringify(RESIDUE) +
        '\n\n  A count that GREW: a declared file now differs from upstream in a way no entry\n' +
        '  claims. Send it upstream, sync it down, or declare it with a region (which claims\n' +
        '  it and lowers the number). A count that FELL: good — write the smaller number into\n' +
        '  RESIDUE in this commit, so it stays the truth rather than a ceiling with slack.\n');
    t.diagnostic(`residue verified against ${path.basename(path.dirname(srcDir))} at the pin: ${JSON.stringify(measured)}`);
});
