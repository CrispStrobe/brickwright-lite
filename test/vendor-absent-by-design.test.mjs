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
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
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
    // THE FUNCTIONAL PROOF, and it needs a DIFFERENT TREE than every other
    // BW_BOARD_DIR reader.
    //
    // `BW_BOARD_DIR` means the tree AT THE PIN -- that is what the census, the
    // two provenance tests and vendor-identity all want. This one cannot use
    // it: sync-bw-board refuses a source BEHIND the default branch before it
    // ever reaches the absent-by-design check, so at the pin this test fails
    // for a reason that has nothing to do with what it asserts. Measured, not
    // assumed: at d5850e6 it exits with "BEHIND origin default 8f46f2c".
    //
    // So it reads its own variable, and when only the pin tree is offered it
    // SKIPS BY NAME SAYING WHICH SHA IT NEEDED. A skip that does not say what
    // it wanted is how a check stays unrun for weeks -- vendor-identity's
    // inventory went stale behind exactly that.
    const dir = process.env.BW_BOARD_HEAD_DIR; // gate-shapes-allow: named skip below
    if (!dir) {
        t.skip(process.env.BW_BOARD_DIR
            ? 'BW_BOARD_HEAD_DIR unset -- BW_BOARD_DIR is the tree AT THE PIN and the sync '
              + 'refuses a source behind the default branch, so the unscoped-sync refusal is '
              + 'NOT verified here; point BW_BOARD_HEAD_DIR at a bw-board checkout on the '
              + 'default branch'
            : 'BW_BOARD_HEAD_DIR unset -- the unscoped-sync refusal is NOT verified here');
        return;
    }
    const before = new Set(readdirSync(VENDORED));
    // Contents before the run, so the tree can be put back without git.
    // FILES ONLY: this directory has subdirectories (devices/), and readdirSync
    // returns those too -- reading one throws EISDIR, which is how the first
    // version of this snapshot failed.
    const snapshot = new Map([...before]
        .filter((f) => statSync(join(VENDORED, f)).isFile())
        .map((f) => [f, readFileSync(join(VENDORED, f), 'utf8')]));
    let out = '';
    try {
        out = execFileSync('node', [SYNC, '--dir', dir], { encoding: 'utf8', cwd: repo });
    } catch (e) {
        out = `${e.stdout || ''}${e.stderr || ''}`;   // refusals exit non-zero, by design
    }
    // A TREE THAT HAS SINCE FALLEN BEHIND IS NOT A FAILING GUARD. "head" is a
    // moving target: point this at a checkout that was the tip an hour ago and
    // the sync refuses it for being behind the default branch, long before it
    // reaches the absent-by-design check. Without this branch the test fails
    // with "i8088-cycles.js was not refused by name", which reads as the guard
    // being broken when the guard never ran. It cost me a diagnosis; it should
    // not cost the next reader one.
    if (/BEHIND origin default/.test(out)) {
        t.skip('BW_BOARD_HEAD_DIR is behind bw-board\'s default branch, so the sync refused it '
            + 'before reaching the absent-by-design check -- the refusal is NOT verified here. '
            + 'Pull that checkout.');
        return;
    }
    for (const f of ['i8088-cycles.js', 'i8088-timing.js']) {
        assert.match(out, new RegExp(`REFUSED ${f.replace('.', '\\.')} \\(absent by design`),
            `${f} was not refused by name`);
    }
    const after = readdirSync(VENDORED).filter((f) => !before.has(f));
    // THE RUN MUTATES THE TREE and this test must not leave it dirty. An
    // unscoped sync legitimately UPDATES files that exist -- that is its job --
    // and this test only asserts about ones it CREATES. Leaving the updates
    // behind means the next command sees a dirty worktree it did not make, and
    // in the worst case someone commits it.
    //
    // RESTORED FROM A SNAPSHOT, NOT BY `git checkout`. The first version shelled
    // out to git, and the shape audit was right to flag it: AMBIENT-BINDING,
    // "'git' resolved from PATH -- the gate may be exercising a tool the build
    // does not ship". A marker would have declared the dependency; taking the
    // snapshot removes it, which is the better answer to a rule that says fix
    // the shape rather than raise the baseline.
    for (const [file, text] of snapshot) {
        if (readFileSync(join(VENDORED, file), 'utf8') !== text) {
            writeFileSync(join(VENDORED, file), text);
        }
    }
    assert.deepEqual(after, [],
        `an unscoped sync created ${after.join(', ')} -- the whole point of this entry kind`);
});
