/**
 * THE THIRD VENDORED UPSTREAM FINALLY HAS A JUDGE.
 *
 * `vendor-identity.test.mjs` holds bw-board and bw-circuit-ui to byte equality
 * with upstream at the pin. It has never held sb3-creator to anything, and said
 * so in its own comment:
 *
 *     "sb3-creator already has a CI pin-proof though no judge-test consumes it
 *      yet, and a third caller must inherit this, not a third special case."
 *
 * So "zero divergences" was a claim about two of three upstreams. The third was
 * clean — measured 2026-09-12, fourteen of fourteen identical — but nothing
 * would have noticed if it stopped being, which is the same state the licences
 * were in for their entire lives.
 *
 * ## Why this is not a third `declaresEveryDivergence` call
 *
 * That gate's model is A DIRECTORY THAT MIRRORS UPSTREAM: it walks a vendored
 * root and maps each path to the same path under `<upstream>/src`. Both of its
 * callers are shaped that way.
 *
 * sb3-creator is not. Fourteen named files are lifted out of `src/utils/` into
 * lite's own `lib/` — a directory full of lite's own modules — AND RENAMED
 * (`pythonToPseudocode.js` -> `sb3-creator-python.js`). There is no root to walk
 * whose contents are all vendored, and no path identity to map by. Forcing it
 * through the walk would report several hundred of lite's own files as
 * undeclared lite-authored code.
 *
 * What it DOES inherit is the part that matters and the part that was missing:
 * the pin discipline (only a checkout AT the pin may judge; anything else skips
 * BY NAME), and the claim itself — vendored content equals upstream content
 * after the transformation the sync performs by construction.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SB3_CREATOR_FILES, SB3_CREATOR_IMPORT_REWRITES, SB3_CREATOR_POSSIBLE_REWRITES,
    applySb3CreatorRewrites} from '../scripts/lib/vendor-rewrites.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'overlay/scratch-gui/src/lib');
const PIN = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'))['sb3-creator'];

/**
 * A checkout at the pin, or null. Same rule the other two obey: an explicit
 * env-var dir whose HEAD equals the pin JUDGES; anything else SPEAKS, and this
 * gate skips by name rather than comparing against a peer's feature branch.
 *
 * `pinned` IS THE JUDGING PREDICATE, NOT `atPin`. `atPin` says only that the
 * tree we happened to find sits at the pin -- and the tree we happened to find
 * may be a sibling nobody named. Reading `atPin` therefore let an UNNAMED
 * sibling JUDGE this gate whenever it coincidentally sat at the pin, which is
 * exactly the rule the paragraph above claims to enforce. The prose was right
 * and the predicate was one word away from it.
 *
 * `named` exists so the skip can say WHOSE head it is reporting. HEAD is read
 * for a sibling too, because "a sibling is at <sha> but the pin is <sha>" is the
 * sentence that tells someone what to do -- but a message branching on `head`
 * alone would then write "SB3_CREATOR_DIR is at <sha>" when the variable is
 * unset and the sha belongs to a tree nobody named.
 */
const pinnedDir = () => {
    const candidates = [process.env.SB3_CREATOR_DIR,
        path.resolve(ROOT, '../../sb3-creator'), path.resolve(ROOT, '../sb3-creator')].filter(Boolean);
    const TMP = fs.realpathSync(os.tmpdir());
    const outsideTmp = (d) => {
        try { return !fs.realpathSync(d).startsWith(TMP); } catch { return false; }
    };
    // THE /tmp RULE IS ABOUT IMPLICIT SIBLINGS, NOT ABOUT AN EXPLICIT ANSWER. It
    // exists so a scratch checkout somebody left beside the repo is never picked
    // up as the upstream nobody named. `SB3_CREATOR_DIR` IS somebody naming one,
    // so it is exempt -- which is what the other three resolvers do
    // (`process.env[envVar] ? true : outsideTmp(d)`), and what the paragraph above
    // this function already claims: "an explicit env-var dir whose HEAD equals the
    // pin JUDGES". Applied unconditionally, as it was when this resolver was
    // copied, an explicit dir under /tmp was discarded and the skip then read
    // "no sb3-creator checkout found" while NAMING the directory it had just
    // rejected. vendor-identity.test.mjs says of its own resolver that two
    // resolutions of "which upstream" would be two answers and the wrong one
    // would be the one nobody re-read; this was the fourth copy and the clause it
    // lost was the one that makes it usable outside CI.
    const dir = candidates.filter(d => fs.existsSync(path.join(d, 'src/utils')))
        .filter(d => process.env.SB3_CREATOR_DIR ? true : outsideTmp(d))[0];
    const named = Boolean(process.env.SB3_CREATOR_DIR);
    if (!dir) return {dir: null, head: null, atPin: false, pinned: false, named, candidates};
    let head = null;
    try { head = execSync(`git -C ${JSON.stringify(dir)} rev-parse HEAD`, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); } catch { /* not a checkout */ }
    const atPin = head === PIN;
    return {dir, head, atPin, pinned: named && atPin, named, candidates};
};

test('the file map is populated, and every vendored copy is on disk', () => {
    // Species 1: a map of nothing satisfies the identity claim below perfectly.
    assert.ok(SB3_CREATOR_FILES.length >= 10,
        `only ${SB3_CREATOR_FILES.length} mapped file(s) — the map was emptied or the extraction `
        + 'from sync-sb3creator.mjs went wrong, and an identity check over nothing passes');
    const missing = SB3_CREATOR_FILES
        .map(([local]) => local)
        .filter(local => !fs.existsSync(path.join(LIB, local)));
    assert.deepEqual(missing, [],
        `these files are mapped as vendored but are not in ${path.relative(ROOT, LIB)}: `
        + missing.join(', '));
});

test('every vendored sb3-creator file equals upstream at the pin', t => {
    const {dir, head, pinned, named, candidates} = pinnedDir();
    if (!dir) {
        t.diagnostic(`SKIPPED, NOT PASSED: no sb3-creator checkout found. Looked in: ${candidates.join(', ')}.`);
        t.skip('upstream tree not on disk — byte-identity against the pin NOT verified');
        return;
    }
    if (!pinned) {
        t.diagnostic(named
            ? `SKIPPED, NOT PASSED: SB3_CREATOR_DIR=${dir} is at ${head?.slice(0, 9)} but the pin is ${PIN?.slice(0, 9)}.`
            : `SKIPPED, NOT PASSED: ${dir} is a sibling nobody named, at ${head?.slice(0, 9)}; the pin is ${PIN?.slice(0, 9)}.`);
        t.skip(named
            ? 'a tree off the pin may SPEAK, not JUDGE — point SB3_CREATOR_DIR at a checkout at the pin'
            : 'an UNNAMED sibling may SPEAK, not JUDGE, even sitting at the pin — set SB3_CREATOR_DIR');
        return;
    }

    const diverged = [];
    let compared = 0;
    for (const [local, upstream] of SB3_CREATOR_FILES) {
        const u = path.join(dir, upstream);
        if (!fs.existsSync(u)) { diverged.push(`${local}: upstream ${upstream} does not exist at the pin`); continue; }
        compared++;
        // The sync's OWN transformation, imported rather than re-implemented.
        const expected = applySb3CreatorRewrites(fs.readFileSync(u, 'utf8'));
        if (fs.readFileSync(path.join(LIB, local), 'utf8') !== expected) diverged.push(local);
    }
    assert.equal(compared, SB3_CREATOR_FILES.length,
        `only ${compared} of ${SB3_CREATOR_FILES.length} files were compared — the rest are absent `
        + 'upstream at the pin, and a partial comparison must not read as a clean one');
    assert.deepEqual(diverged, [],
        '\n  VENDORED sb3-creator FILES THAT DO NOT MATCH UPSTREAM AT THE PIN:\n    '
        + diverged.join('\n    ')
        + '\n\n  Run `npm run sync:sb3creator`, or send the change upstream. These files are\n'
        + '  compared AFTER applying the import rewrite the sync performs, so a difference\n'
        + '  here is real content drift and not the rename.\n');
    t.diagnostic(`sb3-creator at ${PIN.slice(0, 9)}: ${compared} file(s) identical after the sync's rewrite`);
});

test('the rewrite is load-bearing — without it the comparison would be wrong', () => {
    // A transformation that changes nothing would make the test above pass for
    // the wrong reason, and would hide the day the sync stops applying it.
    const sample = SB3_CREATOR_IMPORT_REWRITES[0];
    assert.ok(sample, 'the sync performs no import rewrites at all');
    const before = `import x from './${sample[0]}';`;
    assert.equal(applySb3CreatorRewrites(before), `import x from './${sample[1]}';`,
        'applySb3CreatorRewrites does not perform the rename it declares');
    assert.equal(applySb3CreatorRewrites("import x from './unrelated.js';"),
        "import x from './unrelated.js';",
        'the rewrite touches specifiers it should not, so it could mask real drift');
});

test('no upstream file imports a rename the sync does NOT handle', () => {
    // WRITTEN AS AN ABSENCE, because today the set is empty and the hazard is real.
    //
    // The file map implies THIRTEEN renames; the sync rewrites SIX. The other
    // seven are unhandled, so an upstream file that imported one of them by its
    // upstream name would be vendored in with an import pointing at a filename
    // that does not exist here — a runtime break the byte-identity test above
    // cannot see, because the vendored copy would still equal the (unrewritten)
    // upstream text.
    //
    // Measured 2026-09-12: none of the seven is imported by anything upstream.
    // That is why six entries have been sufficient. This fires on the day a
    // fourteenth import arrives, which is the only moment anyone could act on it.
    const {dir, pinned} = pinnedDir();
    if (!dir || !pinned) return;   // the identity test above already reports the skip

    const handled = new Set(SB3_CREATOR_IMPORT_REWRITES.map(([from]) => from));
    const unhandled = SB3_CREATOR_POSSIBLE_REWRITES.filter(([from]) => !handled.has(from));
    assert.ok(unhandled.length > 0,
        'every possible rename is now handled by the sync — good, and this case is obsolete: '
        + 'delete it rather than leaving a check that can no longer fail.');

    const exposed = [];
    for (const [, upstream] of SB3_CREATOR_FILES) {
        const p = path.join(dir, upstream);
        if (!fs.existsSync(p)) continue;
        const text = fs.readFileSync(p, 'utf8');
        for (const [from] of unhandled) {
            if (new RegExp(`(['"])\\./${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`).test(text)) {
                exposed.push(`${path.basename(upstream)} imports ./${from}`);
            }
        }
    }
    assert.deepEqual(exposed, [],
        '\n  AN UPSTREAM FILE IMPORTS A SIBLING THE SYNC DOES NOT RENAME:\n    '
        + exposed.join('\n    ')
        + '\n\n  The vendored copy will carry that specifier unchanged, and the file it names\n'
        + '  does not exist under lib/ — the vendored name is different. Add the pair to\n'
        + '  SB3_CREATOR_IMPORT_REWRITES in scripts/lib/vendor-rewrites.mjs, in the same\n'
        + '  commit that takes the file.\n');
});
