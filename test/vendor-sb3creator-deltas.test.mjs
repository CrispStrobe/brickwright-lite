/**
 * THE PERMITTED-DELTA SET FOR sb3-creator IS A LIST, NOT A COUNT.
 *
 * The other two vendored trees are gated by byte identity against upstream at
 * the pin (test/vendor-identity.test.mjs). THAT COMPARISON IS WRONG HERE, and
 * getting that wrong would have been the easy mistake: sync-sb3creator.mjs
 * flattens `src/utils/<name>.js` to `src/lib/sb3-creator-<name>.js` and rewrites
 * the relative imports to match, so six of fourteen mapped files differ on disk
 * and five differ ONLY by that rewrite. A byte gate would go red on the sync
 * doing exactly what it exists to do.
 *
 * So the sync's own transform stays the authority -- it verifies thirteen of the
 * fourteen -- and this gate closes the hole the transform leaves.
 *
 * THE HOLE. The fourteenth file is reported and waved through:
 *
 *     STALE sb3-creator-examples.js  (differs from sb3-creator@main)
 *     1 intentional downstream file delta(s) allowed.
 *
 * `--allow-stale` is what vendor-freshness passes, and it makes staleness
 * non-fatal outright -- `if (check && stale && !allowStale)`. The permitted set
 * is therefore a COUNT: unbounded, unnamed, unreasoned. A sync that half-
 * finished and left five would print "5 intentional downstream file delta(s)
 * allowed" and exit 0, the message calling the accident intentional. The word
 * doing the work is "intentional" and nothing recorded whose intention it was.
 *
 * EQUALS, NOT AT-MOST. A file that stops being stale has to leave the list, or
 * the list becomes the graveyard of exemptions this repository refuses
 * everywhere else.
 *
 * Running the sync from a test is safe here and it was CHECKED rather than
 * assumed, because a test that writes into the tree other tests are reading is
 * species 34 and cost a diagnosis on 2026-09-07: `--check` leaves `git status`
 * byte-identical, verified before this test was written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'VENDOR-DIVERGENCE-SB3-CREATOR.md');
const SYNC = join(ROOT, 'scripts', 'sync-sb3creator.mjs');

const declared = () => {
    const m = readFileSync(DOC, 'utf8').match(/```json\n([\s\S]*?)\n```/);
    assert.ok(m, `${DOC} has no \`\`\`json block -- this gate reads that block, so removing ` +
        'it would silently disable the gate rather than fail');
    return JSON.parse(m[1]);
};

test('the declared deltas each say what they are and what is lost', () => {
    // The list is worth nothing if an entry can be a bare filename. Same
    // standard the absentByDesign entries are held to.
    const spec = declared();
    const entries = Object.entries(spec.deltas);
    assert.ok(entries.length > 0, 'the delta list is empty -- if nothing diverges, say so in the ' +
        'prose and delete this gate; an empty list that a count could grow past is worse than none');
    for (const [file, e] of entries) {
        assert.ok(e.what && e.what.length > 40, `${file}: no description of WHAT the delta is`);
        assert.ok(e.falsifiable && e.falsifiable.length > 20,
            `${file}: say what BREAKS or is LOST if upstream's copy replaces it, not just that it differs`);
        assert.ok(e.direction, `${file}: say which way it diverges -- a delta with no direction ` +
            'cannot be told from lite being behind');
    }
});

test('the sync reports exactly the declared deltas, no more and no fewer', t => {
    // gate-shapes-allow: skips BY NAME below, and the pointer in LANES.md says
    // which workflow supplies the tree.
    const dir = process.env.SB3_CREATOR_DIR;
    if (!dir || !existsSync(join(dir, 'src'))) {
        t.diagnostic('SKIPPED, NOT PASSED: SB3_CREATOR_DIR is unset or has no src/, so the ' +
            'permitted-delta set is NOT verified here.');
        t.skip('SB3_CREATOR_DIR unset -- the sb3-creator delta set is NOT verified here');
        return;
    }
    // NO TEMP-DIRECTORY REFUSAL HERE, and that is deliberate rather than an
    // oversight. test/vendor-identity.test.mjs refuses a candidate inside the
    // system temp directory because it FALLS BACK to `../<repo>` siblings, and
    // on a box where /tmp is shared by seventeen sessions such a fallback once
    // resolved through a symlink someone else had left there. THIS GATE HAS NO
    // FALLBACK: it reads one explicitly-set variable and skips by name when it
    // is unset, which is the same treatment that file gives an explicit
    // BW_BOARD_DIR. Refusing temp paths anyway would need an override flag to
    // stay testable from a session scratchpad, and a safety check with an
    // override is the "--allow" pattern this repository keeps having to remove.

    let out = '';
    try {
        out = execFileSync('node', [SYNC, '--check', '--dir', dir, '--allow-stale'],
            { encoding: 'utf8', cwd: ROOT });
    } catch (e) {
        out = `${e.stdout || ''}${e.stderr || ''}`;
    }

    // Species 1: prove the corpus before trusting a negative. An empty or
    // errored run reports no STALE lines, and "no STALE lines" is exactly what
    // a healthy tree looks like -- so without this, a sync that could not read
    // anything would pass this gate.
    const checked = [...out.matchAll(/^\s*(?:ok|STALE)\s+(\S+)/gm)].map(m => m[1]);
    assert.ok(checked.length >= 10,
        `the sync reported on only ${checked.length} file(s) against ${dir} -- it maps fourteen, ` +
        'so this is not that tree and an empty STALE set would prove nothing');

    const reported = [...out.matchAll(/^\s*STALE\s+(\S+)/gm)].map(m => m[1]).sort();
    const expected = Object.keys(declared().deltas).sort();

    assert.deepEqual(reported, expected,
        '\n  THE PERMITTED-DELTA SET MOVED.\n' +
        `    the sync reports: ${reported.join(', ') || '(none)'}\n` +
        `    the doc declares: ${expected.join(', ') || '(none)'}\n\n` +
        '  APPEARED means a vendored sb3-creator file now differs from the sync\'s own\n' +
        '  transform and nothing says why. Either it is deliberate -- declare it in\n' +
        '  docs/VENDOR-DIVERGENCE-SB3-CREATOR.md with what it is and what is lost if\n' +
        '  upstream\'s copy replaces it -- or a sync did not finish, in which case run\n' +
        '  npm run sync:sb3creator. The sync itself CANNOT tell you which: --allow-stale\n' +
        '  prints both as "intentional downstream file delta(s) allowed".\n\n' +
        '  GONE means a declared delta converged or was removed. Delete the entry --\n' +
        '  an inventory that can only fail one way becomes a graveyard of exemptions.\n');

    t.diagnostic(`sb3-creator: ${checked.length} mapped file(s) checked against the sync's own ` +
        `transform, ${reported.length} declared delta(s) (${reported.join(', ')})`);
});
