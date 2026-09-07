/**
 * A FILE LITE DELIBERATELY DOES NOT HAVE IS A DECISION, AND THE SYNC HAS TO
 * KNOW IT.
 *
 * The vendor allow-list had three entry kinds — `liteOnly`,
 * `graftedFromUpstream`, `liteRemoved` — and all three describe a file that
 * EXISTS here, and all three match on line content.
 *
 * So on 2026-09-07, syncing the pin for a licence-string change, an unscoped
 * run refused six files by name (correctly) and then CREATED two more that lite
 * had removed on purpose: `i8088-cycles.js` and `i8088-timing.js`, the
 * CycleEstimator path upstream added in 9256cf7 and lite dropped — roughly
 * 983 KB of bundle, 975 KB of it one table, for a timing mode lite does not
 * expose anywhere.
 *
 * No guard fired, and none could have. With no local copy there are no lines to
 * compare, so a line-level rule has nothing to match. The absence WAS the
 * decision and the allow-list had no way to say so. It was caught by reading
 * the run's output before committing it, which is not a mechanism.
 *
 * `absentByDesign` is a claim about a FILE rather than about lines in one,
 * consulted where the sync would create a file that is not there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(repo, 'docs', 'VENDOR-DIVERGENCE-I8086-MACHINE.md');
const SYNC = join(repo, 'scripts', 'sync-bw-board.mjs');
const VENDORED = join(repo, 'overlay', 'scratch-gui', 'src', 'lib', 'bw-board');

const spec = () => JSON.parse(readFileSync(DOC, 'utf8').match(/```json\n([\s\S]*?)\n```/)[1]);

test('the two removed CycleEstimator files are declared, with a reason', () => {
    const absent = spec().absentByDesign;
    assert.ok(absent, 'the allow-list declares no absentByDesign at all');
    for (const f of ['i8088-cycles.js', 'i8088-timing.js']) {
        assert.ok(absent[f], `${f} is not declared absent by design`);
        assert.ok(absent[f].why && absent[f].why.length > 40,
            `${f}: an entry without a reason is a silent exclusion wearing a schema`);
        assert.ok(absent[f].falsifiable && absent[f].falsifiable.length > 20,
            `${f}: say what BREAKS if the file is taken, not just that it should not be`);
    }
});

test('every declared absent file really is absent here', () => {
    // The entry claims a fact about this tree. If the file is present, either
    // someone took it deliberately and the entry is stale, or the sync created
    // it and nobody noticed — and a stale entry protecting a file that exists
    // is a guard that will never fire again.
    const present = new Set(readdirSync(VENDORED));
    for (const f of Object.keys(spec().absentByDesign ?? {})) {
        assert.ok(!present.has(f),
            `${f} is declared absent by design and IS present -- the entry is stale, `
            + 'or the file arrived without a decision');
    }
});

test('the refusal is checked before the line-level guards, and --force does not lift it', () => {
    // Source-level, because the ORDER is the property. A file with no local
    // copy reaches the line guards with `current === null`, and every one of
    // them is written to skip that case -- so a check placed after them can
    // never fire. And --force is for overwriting work you have decided to
    // lose; there is nothing here to lose, so lifting the refusal with it
    // would be lifting the wrong lever.
    const src = readFileSync(SYNC, 'utf8');
    const atAbsent = src.indexOf('absentByDesign?.has(');
    const atLineGuard = src.indexOf('allowList && allowList.has(path.basename(rel)) && current !== null');
    assert.ok(atAbsent > 0, 'the sync no longer consults absentByDesign');
    assert.ok(atLineGuard > 0, 'the line-level guard moved; this test needs re-anchoring');
    assert.ok(atAbsent < atLineGuard,
        'the absent-by-design check must come FIRST -- after the line guards it is dead code');

    const clause = src.slice(atAbsent - 200, atAbsent + 200);
    assert.doesNotMatch(clause, /!force/,
        '--force must not bypass this: it overwrites work you chose to lose, and '
        + 'here there is nothing to lose -- creating the file IS the mistake');
});

test('an unscoped sync writes nothing new and refuses both by name', (t) => {
    // THE FUNCTIONAL PROOF. Gated on BW_BOARD_DIR and skipped BY NAME when it
    // is unset: a test that defaults to a sibling checkout path binds to one
    // box, and a skip that says nothing reads as a pass.
    const dir = process.env.BW_BOARD_DIR; // gate-shapes-allow: named skip below
    if (!dir) {
        t.skip('BW_BOARD_DIR unset -- the unscoped-sync refusal is NOT verified here');
        return;
    }
    const before = new Set(readdirSync(VENDORED));
    let out = '';
    try {
        out = execFileSync('node', [SYNC, '--dir', dir], { encoding: 'utf8', cwd: repo });
    } catch (e) {
        out = `${e.stdout || ''}${e.stderr || ''}`;   // refusals exit non-zero, by design
    }
    for (const f of ['i8088-cycles.js', 'i8088-timing.js']) {
        assert.match(out, new RegExp(`REFUSED ${f.replace('.', '\\.')} \\(absent by design`),
            `${f} was not refused by name`);
    }
    const after = readdirSync(VENDORED).filter((f) => !before.has(f));
    assert.deepEqual(after, [],
        `an unscoped sync created ${after.join(', ')} -- the whole point of this entry kind`);
});
