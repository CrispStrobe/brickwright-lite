/**
 * THE DIVERGENCE RATCHET — divergence may only ever go DOWN.
 *
 * Owner ruling, 2026-09-10: *"we should NEVER have such instances of divergences
 * in the first place. We should ALWAYS, for OUR OWN repos, stream everything down
 * and patch everything upstream, with the ONLY exceptions being things like
 * nested relative links, which we could ALSO handle modularly."*
 *
 * ## Why this file exists rather than a sentence in the ledger
 *
 * The ledger already carried the rule. `liteAuthored.ratchet` says, in prose:
 * *"Entries may be REMOVED freely… An entry may only be ADDED together with its
 * reason in the same commit."* There was no test named `ratchet` anywhere. It was
 * a rule written down and never enforced — which is the shape that let every
 * entry in that file sit for months behind the `why` **"Forward-ported here and
 * never upstreamed"**: a history doing the work of a justification, with nothing
 * asking it to change.
 *
 * A rule nothing enforces is a preference. This is the enforcement.
 *
 * ## The numbers must be EXACT, not an upper bound
 *
 * A ceiling (`actual <= recorded`) rots: reality drops, the ceiling stays, and
 * the slack silently permits regrowth back up to a number nobody has looked at
 * since. So equality is asserted in BOTH directions. An increase fails because
 * divergence grew. A decrease also fails — and that failure is the good one: it
 * says *you retired something, come and write the smaller number down*. Every
 * retirement is therefore recorded by the person who earned it, in the same
 * commit, and the number in this file is always the truth rather than a
 * high-water mark.
 *
 * ## What this does NOT claim
 *
 * It counts declarations, not divergence. A file can silently fall behind
 * upstream on undeclared work and every number here stays put — measured
 * 2026-09-10, all eleven declared files are collectively 354 lines behind, and
 * the ledger showed nothing, because a sync REFUSES on a declared file and the
 * refusal was being read as a decision. This gate is the floor under that work,
 * not a substitute for it. `vendor-identity.test.mjs` is what judges content.
 *
 * ## The end state, REACHED 2026-09-11 — and why this file did not go away
 *
 * Zero. Every count here is 0: the vendored tree is a pure mirror of upstream
 * plus the transformations `scripts/lib/vendor-rewrites.mjs` performs by
 * construction. A ratchet whose terminal value is 0 is a plan; one with no
 * terminal value is a budget.
 *
 * THIS PARAGRAPH USED TO END "and at that point this file and the ledger both go
 * away". That was written as a promise and it is wrong, which only became
 * visible on the day it came due:
 *
 *   - Zero is where a ratchet is WEAKEST, not where it retires. While the counts
 *     were non-zero, a broken counter showed up as a wrong number. At zero, a
 *     counter that returns 0 because it is broken agrees with every expectation
 *     in this file. Measured: hardwiring `counts()` to zeros left five of six
 *     cases green. Only the fabricated-ledger control below caught it.
 *   - Nothing else notices regrowth. The gate that judges CONTENT
 *     (`vendor-identity`) reds when a vendored file stops matching upstream —
 *     but a NEW declared divergence is, to that gate, a file with an excuse.
 *     This ratchet is what makes adding the excuse cost something.
 *   - Deleting a gate at the moment its subject is empty is the same move as
 *     deleting an anti-vacuity floor because it went red at the goal state. Both
 *     leave the check absent exactly when nothing is left watching.
 *
 * So the file stays, and its job changed rather than ended: the numbers are
 * asserted at 0 against the real ledger, and the machinery that produces them is
 * proved separately against a fixture with a known answer. Those are two claims,
 * and until 2026-09-11 they were being made as one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs/VENDOR-DIVERGENCE-I8086-MACHINE.md');

/**
 * THE RATCHET. Lower these; never raise them.
 *
 * Raising a number is not a merge conflict to resolve — it is the change the
 * owner's ruling forbids. If a lane genuinely cannot avoid a new divergence, the
 * number moves only with a `stays:` disposition on the new entry carrying a
 * MEASURED reason, and that is a decision to take in the open rather than a
 * count to edit.
 */
const RATCHET = {
    files: 0,              // declared-divergent files with named identifier entries
    entries: 0,            // liteOnly entries across those files
    lineLevelOnly: 0,      // files carrying undeclared-identifier line divergence
    liteAuthored: 0        // lite-authored files living inside the vendored root
};

/**
 * THE DECOMPOSITION, pinned for the same reason the total is.
 *
 * BOTH ARE EMPTY AS OF 2026-09-11, and the reason each entry left is worth more
 * than the zero. The last one to go was `m6502-debug-replay-boundary`, the only
 * `stays:` in the ledger, filed on a measurement that said it *"LEAVES THIS
 * LEDGER'S SCOPE ... needs a design decision and its own lane"*.
 *
 * It needed neither. Re-reading it, the thing it said could not be decided was
 * how CONSUMERS should behave when a target lacks `replayToInputBoundary` --
 * which is a caller's question, and not a reason the METHOD could not live
 * upstream. The method went to bw-board, where it is now an ordinary capability
 * of the 6502 target with the suite it had never had, and lite takes the file
 * byte-identical. A `stays:` justified by a hard question about something ELSE
 * is the shape to look for: the hard question was real and it was not this
 * entry's.
 *
 * THE MAPS STAY, AT ZERO, rather than being deleted with the entries. An empty
 * map that is asserted-empty reds the day something is added without being
 * decomposed; a deleted map reds nothing, and the decomposition has to be
 * re-invented by whoever adds the second entry.
 */
const PER_FILE = {};

/** Exact, like everything else here: a `stays:` appearing or retiring is a decision. */
const DISPOSITIONS = {upstream: 0, stays: 0};

const spec = () => {
    const md = readFileSync(DOC, 'utf8');
    const m = md.match(/```json\n([\s\S]*?)\n```/);
    assert.ok(m, 'the divergence ledger has no JSON block');
    return JSON.parse(m[1]);
};

const counts = (d = spec()) => {
    return {
        files: Object.keys(d.files).length,
        entries: Object.values(d.files).reduce((n, v) => n + v.liteOnly.length, 0),
        lineLevelOnly: d.lineLevelOnly.files.length,
        liteAuthored: Object.keys(d.liteAuthored.files).length
    };
};

test('divergence may only go DOWN — the ratchet is exact, not a ceiling', () => {
    const now = counts();
    for (const [key, recorded] of Object.entries(RATCHET)) {
        assert.equal(now[key], recorded,
            now[key] > recorded
                ? `${key} GREW from ${recorded} to ${now[key]}. The owner's ruling is that everything `
                  + 'goes upstream; a new divergence needs a `stays:` disposition with a MEASURED '
                  + 'reason, taken as a decision rather than by raising this number.'
                : `${key} FELL from ${recorded} to ${now[key]} — good. Lower RATCHET.${key} to `
                  + `${now[key]} in this commit, so the number stays the truth rather than a `
                  + 'high-water mark with slack that permits regrowth.');
    }
});

test('the decomposition is pinned, not just the total', () => {
    const d = spec();
    const per = Object.fromEntries(
        Object.entries(d.files).map(([file, cfg]) => [file, cfg.liteOnly.length]));

    assert.deepEqual(per, PER_FILE,
        'the per-file split moved. Update PER_FILE in the same commit and say which lane '
        + 'moved it — a total that stays 13 while the split changes is a lane finishing '
        + 'and another growing, reported as no change.');

    // The two numbers are pinned against each other so they cannot drift apart:
    // a decomposition maintained beside a total is two builders of one value.
    const summed = Object.values(PER_FILE).reduce((n, v) => n + v, 0);
    assert.equal(summed, RATCHET.entries,
        `PER_FILE sums to ${summed} but RATCHET.entries is ${RATCHET.entries} — one of the `
        + 'two was edited alone, and whichever is wrong has been reading as confirmation '
        + 'of the other.');
});

test('the upstream/stays split is exact, and a `stays:` is named', () => {
    const d = spec();
    const now = {upstream: 0, stays: 0};
    const staysIds = [];
    for (const [file, cfg] of Object.entries(d.files)) {
        for (const e of cfg.liteOnly) {
            if (/^stays\b/.test(e.disposition)) { now.stays++; staysIds.push(`${file} -> ${e.id}`); }
            else if (/^upstream\b/.test(e.disposition)) now.upstream++;
        }
    }
    assert.deepEqual(now, DISPOSITIONS,
        `the disposition split is now ${JSON.stringify(now)} against a recorded `
        + `${JSON.stringify(DISPOSITIONS)}. A new \`stays:\` is the owner's ruling being `
        + 'set aside for one entry and is a decision to take in the open; a `stays:` '
        + 'becoming `upstream:` is good and this number moves down in that commit. '
        + `Current \`stays:\` entries: ${staysIds.join(', ') || '(none)'}`);

    // Not vacuous: the counters above only move if the regexes match something.
    assert.equal(now.upstream + now.stays, RATCHET.entries,
        'some entry matched neither `upstream` nor `stays`, so the split above counted '
        + 'past it — the disposition-shape test is the one that should have caught that');
});

test('every entry carries a disposition, and it is upstream: or stays:', () => {
    // The inverted default made `why` insufficient: an entry must now say where
    // it is GOING or, with a measurement, why it is not. An entry with neither is
    // one nobody has decided, which is the state the whole ledger was in.
    const d = spec();
    const bad = [];
    for (const [file, cfg] of Object.entries(d.files)) {
        for (const e of cfg.liteOnly) {
            const disp = e.disposition;
            if (typeof disp !== 'string' || !/^(upstream|stays)\b/.test(disp)) {
                bad.push(`${file} -> ${e.id}: ${disp === undefined ? 'NO disposition' : disp.slice(0, 40)}`);
            }
        }
    }
    assert.deepEqual(bad, [],
        'every liteOnly entry needs a disposition beginning `upstream:` or `stays:` — '
        + '"forward-ported here and never upstreamed" is a history, not a reason');

    for (const key of ['lineLevelOnly', 'liteAuthored']) {
        assert.ok(typeof d[key].disposition === 'string' && d[key].disposition.length > 40,
            `${key} needs a disposition of its own; it is a category, and a category nobody `
            + 'has decided is as unowned as an entry nobody has decided');
    }
});

/**
 * THE HOLE THAT OPENS THE DAY THE RATCHET REACHES ZERO, and the only test in
 * this file that does not read the real ledger.
 *
 * Every assertion above counts things in the ledger and compares the count to a
 * recorded number. While the ledger had entries, a broken counter showed up as a
 * wrong number. Now that the ledger is EMPTY and every recorded number is 0, a
 * counter that returns 0 for the wrong reason — a renamed key, a changed JSON
 * shape, a `?? []` swallowing a parse failure — agrees with every expectation in
 * this file. Zero is where a ratchet is at its weakest, not its strongest: the
 * measurement and the failure now produce the same reading.
 *
 * The anti-vacuity check this replaces could not close that. It said "the ledger
 * is non-empty OR every ratchet value is 0" — which, at the terminal value, is
 * satisfied by the second clause no matter what the first one found. It was
 * written to catch a parse failure while entries existed, and it retired itself
 * on the day it became load-bearing.
 *
 * So the counters are driven against a FABRICATED ledger with a known answer. If
 * `counts()` can find 2 files, 3 entries, 1 line-level file and 2 lite-authored
 * files in a spec that contains exactly those, then its 0 on the real ledger is a
 * measurement. If it cannot, its 0 is an artefact, and the ledger could have
 * regrown to any size with this file still green.
 *
 * THE FIXTURE IS DELIBERATELY NOT THE SHAPE THE REAL LEDGER HAD. It carries two
 * files rather than one, a mix of `upstream:` and `stays:`, and an entry in each
 * collection — so a counter that happens to work for the last shape this repo
 * held is not enough to pass it.
 */
const SYNTHETIC = {
    files: {
        'fabricated-a.js': {
            liteOnly: [
                {id: 'fab-a-one', disposition: 'upstream: not a real entry', region: 'x'},
                {id: 'fab-a-two', disposition: 'stays -- not a real entry', region: 'y'}
            ]
        },
        'fabricated-b.js': {
            liteOnly: [
                {id: 'fab-b-one', disposition: 'upstream: not a real entry', region: 'z'}
            ]
        }
    },
    lineLevelOnly: {files: ['fabricated-c.js'], disposition: 'x'.repeat(50)},
    liteAuthored: {
        files: {'fab-d.js': {reason: 'x'}, 'fab-e.js': {reason: 'x'}},
        disposition: 'x'.repeat(50)
    }
};

test('the counters find what is there — driven against a fabricated ledger', () => {
    assert.deepEqual(counts(SYNTHETIC), {files: 2, entries: 3, lineLevelOnly: 1, liteAuthored: 2},
        'counts() cannot see entries that ARE there, so its 0 on the real ledger is an '
        + 'artefact of a broken reader rather than a measurement of a clean tree. Every '
        + 'assertion in this file is currently passing for that reason.');
});

test('the disposition split is counted, not assumed — same fabricated ledger', () => {
    // The same hole, one layer down: `DISPOSITIONS` is {upstream: 0, stays: 0},
    // so a split that counts nothing at all agrees with it exactly. This drives
    // the same regexes the real test uses over a spec with one of each.
    const now = {upstream: 0, stays: 0};
    for (const cfg of Object.values(SYNTHETIC.files)) {
        for (const e of cfg.liteOnly) {
            if (/^stays\b/.test(e.disposition)) now.stays++;
            else if (/^upstream\b/.test(e.disposition)) now.upstream++;
        }
    }
    assert.deepEqual(now, {upstream: 2, stays: 1},
        'the disposition regexes match nothing even on a spec built to contain both, so '
        + '{upstream: 0, stays: 0} on the real ledger says nothing about the real ledger');
});

test('the real ledger is EMPTY, and that is read rather than assumed', () => {
    // Says the terminal state out loud, so reaching it is an assertion someone
    // made rather than a number that drifted to zero. Paired with the two tests
    // above, "empty" now means measured-empty.
    const d = spec();
    assert.deepEqual(Object.keys(d.files), [],
        'the ledger declares divergent files again. Every one of them is a fork the owner '
        + 'ruled against; send it upstream and take the file back down.');
    assert.deepEqual(d.lineLevelOnly.files, []);
    assert.deepEqual(Object.keys(d.liteAuthored.files), []);

    // The categories themselves must survive at zero: an absent key reads as
    // "never considered", and the next file to arrive would have nowhere to go.
    for (const key of ['lineLevelOnly', 'liteAuthored']) {
        assert.ok(d[key] && typeof d[key].disposition === 'string',
            `${key} was DELETED rather than emptied. Keep the category and its disposition: `
            + 'a ratchet at zero still needs somewhere to record the next arrival, and a '
            + 'missing key reads as a question nobody asked.');
    }
});
