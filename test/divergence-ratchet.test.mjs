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
 * ## The intended end state
 *
 * Zero. Every count here reaching 0 means the vendored tree is a pure mirror of
 * upstream plus the transformations `scripts/lib/vendor-rewrites.mjs` performs by
 * construction — and at that point this file and the ledger both go away. A
 * ratchet whose terminal value is 0 is a plan; one with no terminal value is a
 * budget.
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
    files: 3,             // declared-divergent files with named identifier entries
    entries: 17,          // liteOnly entries across those files
    lineLevelOnly: 6,     // files carrying undeclared-identifier line divergence
    liteAuthored: 6       // lite-authored files living inside the vendored root
};

const spec = () => {
    const md = readFileSync(DOC, 'utf8');
    const m = md.match(/```json\n([\s\S]*?)\n```/);
    assert.ok(m, 'the divergence ledger has no JSON block');
    return JSON.parse(m[1]);
};

const counts = () => {
    const d = spec();
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

test('the ratchet is reached — a corpus of nothing satisfies the assertions above', () => {
    // Species 1: every assertion here passes vacuously against an empty ledger.
    const now = counts();
    assert.ok(now.files + now.lineLevelOnly + now.liteAuthored > 0
        || Object.values(RATCHET).every(v => v === 0),
        'the ledger read as empty while the ratchet expects entries — that is a parse failure, '
        + 'not a clean tree');
});
