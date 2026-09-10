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
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(repo, 'docs', 'VENDOR-DIVERGENCE-I8086-MACHINE.md');
const SYNC = join(repo, 'scripts', 'sync-bw-board.mjs');
const VENDORED = join(repo, 'overlay', 'scratch-gui', 'src', 'lib', 'bw-board');
const PINS = join(repo, 'vendor-pins.json');

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
    // Test the absent-file refusal against the adopted input. Source-freshness
    // has separate tests; --allow-stale below permits this deliberate pin but
    // does not bypass absentByDesign or pin-move checks.
    const dir = process.env.BW_BOARD_DIR; // gate-shapes-allow: named skip below
    if (!dir) {
        t.skip('BW_BOARD_DIR unset -- pinned-source refusal is NOT verified here');
        return;
    }
    const gitOut = (args, cwd) => {
        try { return execFileSync('git', args, { encoding: 'utf8', cwd }).trim(); }
        catch { return null; }
    };
    const expected = JSON.parse(readFileSync(PINS, 'utf8'))['bw-board'];
    const actual = gitOut(['rev-parse', 'HEAD'], dir);
    assert.equal(actual, expected, 'absent-file proof must read the exact reviewed bw-board pin');
    // THE SYNC MUST NOT WRITE INTO THE TREE THE OTHER GATES ARE READING.
    //
    // An unscoped sync UPDATES vendored files that exist -- board.js, measured
    // -- and this proof used to run it against the live worktree and put the
    // files back afterwards. `node --test` runs four files in parallel on this
    // box, so for the width of that window another test reading the same
    // directory sees upstream's newer content in lite's tree. vendor-identity
    // is exactly such a reader, and what it reports is "APPEARED (new
    // divergence nobody has written up): board.js" -- naming, precisely, the
    // files this sync touched.
    //
    // MEASURED, and it explains two separate mysteries with one cause. On the
    // 2c568ca leg vendor-identity went red on the run AFTER the content-base
    // fix and not the run before, because before the fix the sync refused
    // instantly and wrote nothing; the fix let it run, and the writes began. And
    // on main the same assertion had fired naming board.js and controller.js,
    // with the named symbols nowhere to be found in lite's tree afterwards --
    // because by the time anyone looked, the restore had already happened. A
    // failure that names real files, cannot be reproduced, and clears by itself
    // is what a race looks like from the outside.
    //
    // THE WINDOW IS NOT NARROW, which is why this shows up at all. Polled from
    // a concurrent process while this test ran: board.js in the live tree
    // differed from its committed blob for 355 of 518 samples -- SIXTY-NINE
    // PERCENT of the test's runtime. Sandboxed, 0 of 1006. A reader that
    // touches board.js while this test is running is more likely than not to
    // see upstream's copy, and across a 2400-test suite whose scheduling varies
    // run to run, that is exactly a check that is red on one run and green on
    // the next with every declared input identical.
    //
    // So the sync gets its own checkout. A throwaway git worktree at HEAD costs
    // a few hundred milliseconds, shares the object store, and has everything
    // the script needs (it imports only node builtins and scripts/lib-*). The
    // live tree is then never written at all, which is a stronger property than
    // being put back -- and it closes the window this file already documented
    // as unclosable: a crash between sync and restore can no longer leave a
    // moved pin, because the moved pin was never in this worktree.
    const sandbox = mkdtempSync(join(tmpdir(), 'bw-absent-'));
    const tree = join(sandbox, 'repo');
    execFileSync('git', ['worktree', 'add', '--detach', '--quiet', tree, 'HEAD'], { cwd: repo });
    const SYNC_S = join(tree, 'scripts', 'sync-bw-board.mjs');
    const VENDORED_S = join(tree, 'overlay', 'scratch-gui', 'src', 'lib', 'bw-board');
    const PINS_S = join(tree, 'vendor-pins.json');
    const cleanup = () => {
        try { execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: repo }); } catch { /* removed below anyway */ }
        try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* best effort */ }
    };

    // The LIVE tree, so the end of this test can assert it was never touched --
    // which is the invariant now, rather than "it was put back".
    const liveBefore = new Map(readdirSync(VENDORED)
        .filter((f) => statSync(join(VENDORED, f)).isFile())
        .map((f) => [f, readFileSync(join(VENDORED, f), 'utf8')]));
    const livePinsBefore = readFileSync(PINS, 'utf8');

    const before = new Set(readdirSync(VENDORED_S));
    // Contents before the run, so the tree can be put back without git.
    // FILES ONLY: this directory has subdirectories (devices/), and readdirSync
    // returns those too -- reading one throws EISDIR, which is how the first
    // version of this snapshot failed.
    const snapshot = new Map([...before]
        .filter((f) => statSync(join(VENDORED_S, f)).isFile())
        .map((f) => [f, readFileSync(join(VENDORED_S, f), 'utf8')]));
    // THE PIN FILE IS PART OF THE SNAPSHOT, because the run below is allowed to
    // move the pin -- see --pin. Restored before any assertion, byte-compared at
    // the end: this proof must not leave a moved pin behind.
    //
    // THE REMAINING WINDOW, and why there is no sixth check here for it. If the
    // PROCESS dies between the sync and the restore -- not far-fetched on a box
    // where sessions get OOM-killed -- the pin stays moved. lego-be asked for a
    // top-of-test guard against a previous crashed run. MEASURED instead of
    // added (2026-09-07): with vendor-pins.json moved to the tip by hand, four
    // gates in this same `test:fast` set already go red by name --
    // bw-board-census ("the snapshot describes bw-board 5547d4351 but
    // vendor-pins.json pins d8d606598 -- regenerate"), pin-move-chain,
    // i8086-bios-provenance and circuit-preset-roms-resolve. A fifth copy here
    // would be one more thing to keep in step with the pin, and worse messages.
    // What the next reader needs is the pointer, which is this comment.
    const pinsBefore = readFileSync(PINS_S, 'utf8');

    // The source is now always the current pin. Rewind the sandbox's pin to
    // the previous recorded adoption so three-way source guards have a real
    // base. This changes only the temporary Lite tree, never the input source.
    const recordedPin = JSON.parse(pinsBefore)['bw-board'];
    const sourceSha = actual;
    if (sourceSha && recordedPin === sourceSha) {
        // The most recent DIFFERENT value this file has recorded for bw-board.
        // Read from git rather than from a hardcoded fallback: a constant here
        // would be a fifth thing to keep in step with the pin.
        const shas = (gitOut(['log', '--format=%H', '--', 'vendor-pins.json'], tree) || '')
            .split('\n').filter(Boolean);
        let previous = null;
        for (const sha of shas) {
            const blob = gitOut(['show', `${sha}:vendor-pins.json`], tree);
            if (!blob) continue;
            let value;
            try { value = JSON.parse(blob)['bw-board']; } catch { continue; }
            if (value && value !== recordedPin) { previous = value; break; }
        }
        if (!previous) {
            cleanup();
            // Reported, not passed. Every recorded pin is the source sha, so
            // there is no base to sync from and this proof cannot run.
            t.diagnostic(`SKIPPED, NOT PASSED: the pin (${recordedPin.slice(0, 9)}) is the source `
                + 'tree\'s own sha and no earlier bw-board pin exists in this history, so the '
                + 'sync has no content base.');
            t.skip('pin == source sha and no previous pin to rewind to -- the per-file refusal '
                + 'is NOT verified here');
            return;
        }
        writeFileSync(PINS_S, pinsBefore.replace(recordedPin, previous));
    }

    let out = '';
    try {
        // Explicit pin movement and deliberate historical source are allowed
        // only inside this sandbox. The per-file refusal remains enforced.
        out = execFileSync('node', [SYNC_S, '--dir', dir, '--pin', '--allow-stale'], { encoding: 'utf8', cwd: tree });
    } catch (e) {
        out = `${e.stdout || ''}${e.stderr || ''}`;   // refusals exit non-zero, by design
    }
    // The tree (vendored files AND the pin) goes back before anything is
    // asserted: a failing assertion must not leave the worktree dirty, which is
    // how a moved pin could be committed by the next hand that touches it.
    const restore = () => {
        for (const [file, text] of snapshot) {
            if (readFileSync(join(VENDORED_S, file), 'utf8') !== text) writeFileSync(join(VENDORED_S, file), text);
        }
        if (readFileSync(PINS_S, 'utf8') !== pinsBefore) writeFileSync(PINS_S, pinsBefore);
    };
    const after = readdirSync(VENDORED_S).filter((f) => !before.has(f));
    restore();
    cleanup();
    assert.doesNotMatch(out, /PinMoveRefused|A file sync never moves the pin/,
        'the pin guard refused this run before the absent-by-design check -- --pin is missing '
        + 'from the invocation above, or lib-pin now refuses it for another reason');
    assert.doesNotMatch(out, /PIN ALREADY MOVED|has no content base/,
        'the sync refused for want of a content base before reaching the absent-by-design '
        + 'check -- the pin is the source tree\'s own sha and the rewind above did not take. '
        + 'Named here rather than left to be re-diagnosed: this assertion has now reported a '
        + 'broken refusal three times when the refusal simply never ran.');
    for (const f of ['i8088-cycles.js', 'i8088-timing.js']) {
        assert.match(out, new RegExp(`REFUSED ${f.replace('.', '\\.')} \\(absent by design`),
            `${f} was not refused by name`);
    }
    // THE LIVE TREE WAS NEVER TOUCHED. Stronger than "it was put back", and
    // falsifiable: point the sync back at `repo` and this reds. It is the
    // assertion that keeps the parallel readers safe.
    for (const [file, text] of liveBefore) {
        assert.equal(readFileSync(join(VENDORED, file), 'utf8'), text,
            `${file} in the LIVE vendored tree was written by this test -- the sync must run in `
            + 'the sandbox worktree, or every gate reading this directory in parallel can see '
            + 'upstream content in lite\'s tree and report a divergence that is not there');
    }
    assert.equal(readFileSync(PINS, 'utf8'), livePinsBefore, 'the LIVE pin was moved by this test');
    // (The restore above runs BEFORE the assertions, and covers both the vendored
    // files and the pin. An unscoped sync legitimately UPDATES files that exist --
    // that is its job -- and this test only asserts about ones it CREATES.
    // RESTORED FROM A SNAPSHOT, NOT BY `git checkout`: the first version shelled
    // out to git and the shape audit was right to flag it as AMBIENT-BINDING,
    // "'git' resolved from PATH -- the gate may be exercising a tool the build
    // does not ship". Taking the snapshot removes the dependency rather than
    // declaring it.)
    assert.deepEqual(after, [],
        `an unscoped sync created ${after.join(', ')} -- the whole point of this entry kind`);
});

// ---- THE REVERSE DIRECTION -------------------------------------------------
//
// Everything above asserts that every DECLARED absent file really is absent.
// Nothing asserted the other way: that every file which IS absent has been
// accounted for. So the ledger could be incomplete while this suite stayed
// green, which is how `pin-functions.js` sat undeclared across many pin bumps.
// Found by lego-b9; the derivation below is why the obvious repair was wrong.
//
// TWO MECHANISMS KEEP A FILE OUT OF LITE, AND THEY DIFFER IN KIND:
//
//   `absentByDesign` (this manifest) means WE CHOSE NOT TO TAKE THIS. It is
//   reversible, it carries `why` and `falsifiable`, and the CycleEstimator pair
//   is exactly that — lite removed a feature and could take it back tomorrow.
//
//   `EXCLUDE` (sync-bw-board.mjs) means THIS CANNOT BE TAKEN. `pin-functions.js`
//   does `import { readFileSync } from 'node:fs'` and is marked NODE-ONLY in
//   upstream's own index.js. A browser bundle cannot import node:fs. Nobody will
//   ever "reverse" that while the file is what it is.
//
// Filing the second under the first would put a true fact (it is absent) in a
// place that implies a false reason (we decided), and invite a future reader to
// undo something that was never a choice. So this asserts the UNION and reads
// EXCLUDE from the sync itself rather than restating it — a copy here would be a
// third place stating one fact, and would go stale the first time the sync moved.
//
// THIS TEST INSPECTS THE TREE; IT DOES NOT PERFORM A SYNC. That matters for
// predicting what a mutation does: removing a name from EXCLUDE does not make
// the file appear on disk, it makes an absent file unaccounted — so the
// assertion FAILS. Stated because the opposite reading is defensible until the
// mechanism is named.
test('every file absent from lite is accounted for, by decision or by impossibility', t => {
    const dir = process.env.BW_BOARD_DIR; // gate-shapes-allow: named skip below
    if (!dir || !statSync(join(dir, 'src'), {throwIfNoEntry: false})) {
        t.skip('BW_BOARD_DIR unset or has no src/ -- the reverse direction is NOT verified here');
        return;
    }
    const upstream = readdirSync(join(dir, 'src'))
        .filter(f => f.endsWith('.js')).sort();
    const vendored = new Set(readdirSync(VENDORED).filter(f => f.endsWith('.js')));

    // READ, never restate: the sync's own exclusion set is the authority for
    // "cannot be taken", so this follows it when it changes.
    const syncSrc = readFileSync(SYNC, 'utf8');
    const excludeMatch = syncSrc.match(/const EXCLUDE = new Set\(\[([^\]]*)\]\)/);
    assert.ok(excludeMatch,
        'sync-bw-board.mjs no longer declares `const EXCLUDE = new Set([...])` — this test reads ' +
        'that set as the authority for "cannot be vendored"; if it moved, point this at its new home ' +
        'rather than hardcoding a copy here');
    const excluded = new Set([...excludeMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
    assert.ok(excluded.size > 0, 'the sync declares an empty EXCLUDE set — expected at least one node-only module');

    const declared = new Set(Object.keys(spec().absentByDesign ?? {}));
    const unaccounted = upstream.filter(f => !vendored.has(f) && !declared.has(f) && !excluded.has(f));

    assert.deepEqual(unaccounted, [],
        `these upstream files are absent from lite and nothing says why:\n` +
        unaccounted.map(f => `  ${f}`).join('\n') +
        `\n\nEither it was a DECISION — add it to absentByDesign with a why and a falsifiable ` +
        `sentence — or it CANNOT be vendored, in which case it belongs in sync-bw-board.mjs's ` +
        `EXCLUDE set with the technical reason. Do not put the second kind in the first: an ` +
        `absentByDesign entry reads as a choice and invites someone to reverse it.`);

    // The population is small enough today to state, so a future reader can see
    // at a glance whether it grew: 3 absent of ~190, 2 declared and 1 excluded.
    const absent = upstream.filter(f => !vendored.has(f));
    assert.ok(absent.length >= declared.size + excluded.size - 1,
        `accounting lists more files than are actually absent (${absent.length} absent, ` +
        `${declared.size} declared, ${excluded.size} excluded) — a stale entry names a file ` +
        `that came back`);
});
