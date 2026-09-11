/**
 * THE RESIDUE RATCHET — the remainder a declared file differs from upstream
 * BEYOND its declared divergences, ratcheted to zero.
 *
 * `vendor-identity` forgives a declared file's WHOLE byte-difference: once a file
 * has any ledger entry it is classified `diverged` and every further difference
 * rides in free. docs/VENDORING-REGIME.md names the hole and proves it — changing
 * `this.cycles += 4` to `+= 5` in a declared file, both mirrors, reds every other
 * vendor gate. This one attributes each changed REGION to a declared entry and
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
 * declared entries drives the existing remainder down. i8086 is already at its
 * floor: one lite-ahead run, the restore-side displayRevision bump, which cannot
 * be resolved inside lite (it is upstream work) and so is residue until it lands.
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
    'i8086-machine.js': {ahead: 1, behind: 0},   // the restore-side displayRevision bump, upstream work
    'z80-debug.js': {ahead: 12, behind: 8},      // the replay-surface convergence, held on the owner's ruling
    'm6502-debug.js': {ahead: 16, behind: 4}     //   "
};

// liteRemoved is a DECISION (may hold steady forever); liteBehind is a DEBT (may
// only fall). Counted separately so the ratchet can tell peace from obligation.
const LITE_REMOVED = 1; // i8086 CycleEstimator
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

test('every declared entry declares a region, and no catch-all is claimed region-only', () => {
    const spec = readAllowList();
    // Species 1: iterate nothing and every assertion below passes. The ledger
    // declares three files with entries; refuse an empty read.
    assert.ok(declaredFiles(spec).length >= 1, 'the ledger declares no files');
    const missing = [], catchAll = [];
    let entries = 0;
    for (const [file, cfg] of declaredFiles(spec)) {
        const {claims, missingRegion} = claimsFromFileCfg(cfg);
        entries += (cfg.liteOnly?.length ?? 0) + (cfg.liteRemoved?.length ?? 0) + (cfg.liteBehind?.length ?? 0);
        for (const id of missingRegion) missing.push(`${file}:${id}`);
        for (const id of catchAllWithoutBlock(claims)) catchAll.push(`${file}:${id}`);
    }
    assert.ok(entries >= 15, `only ${entries} entries parsed — the schema or JSON shape changed and a region check over nothing passes`);
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
