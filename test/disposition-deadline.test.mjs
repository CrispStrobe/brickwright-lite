import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A DISPOSITION IS AN INTENTION, AND AN INTENTION WITH NO DEADLINE IS A DECISION
 * NOT TO ACT.
 *
 * The divergence ledger records, for every piece of lite-only work inside a
 * vendored tree, what is to become of it: `upstream:` (send it up, then the
 * entry retires) or `stays` (it is ours on purpose). Until this file existed,
 * nothing distinguished an entry marked `upstream` last week from one marked
 * `upstream` a year ago. The ratchet stops the COUNT drifting; it says nothing
 * about an entry sitting at the same count forever.
 *
 * So every entry carries `markedAt`, and an `upstream` entry that is still here
 * after BUDGET_DAYS reds by name. The remedy is one of exactly two things, and
 * the failure text says both: send the work upstream and retire the entry, or
 * change its disposition to `stays` with the reason. What is not available is
 * leaving it.
 *
 * THIS GATE IS A CLOCK, SO IT CAN RED ON A DAY NOBODY PUSHED. That is the
 * point and not a defect — a deadline that only fires when someone happens to
 * commit is not a deadline. The failure names the entry, the date it was
 * marked, and how many days over it is, so a red arriving on a quiet Tuesday
 * reads as what it is.
 *
 * WHAT THIS DOES NOT SEE: whether the upstream trip actually happened (an entry
 * can be retired without the patch landing — `vendor-identity` catches that,
 * because the file would no longer match what a sync produces); whether a
 * `stays` disposition is honest; and any divergence that was never written
 * down at all, which is the residue problem and a different instrument.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = path.join(ROOT, 'docs');

// EVERY divergence ledger, not the one that happens to have entries today. A
// gate pointed at a named file has the population somebody handed it; two of
// the three ledgers are empty of entries right now, and the day one gains an
// entry it must already be covered rather than wait for someone to remember.
const LEDGERS = () => readdirSync(DOCS_DIR)
    .filter(f => /^VENDOR-DIVERGENCE-.*\.md$/.test(f))
    .sort()
    .map(f => path.join(DOCS_DIR, f));

// Thirty days is one pin-bump cadence with room to spare: measured over
// 2026-08/09 this repo moved the bw-board pin roughly weekly, so an entry that
// survives thirty days has watched about four syncs go past without being sent.
const BUDGET_DAYS = 30;

// A liteBehind DEBT is cheaper to pay than an `upstream` intention — running the
// sync is a local operation (`npm run sync:bwboard` then review), not an upstream
// round-trip that has to land in another repo and come back on a pin bump. So its
// budget is HALF: a debt that has watched two pin bumps go past (the pin moves
// roughly weekly, so ~14 days) without being synced is overdue, where an upstream
// intention gets four bumps. Derived from cadence, not copied from 30.
const LITE_BEHIND_BUDGET_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Every entry in the ledger, flattened, with the file it belongs to. */
export function ledgerEntries (markdown) {
    const out = [];
    for (const block of markdown.matchAll(/```json\n([\s\S]*?)\n```/g)) {
        let spec;
        try { spec = JSON.parse(block[1]); } catch { continue; }
        for (const [file, body] of Object.entries(spec.files || {})) {
            for (const entry of body.liteOnly || []) out.push({ file, ...entry });
        }
    }
    return out;
}

/**
 * The liteBehind entries — a DEBT (upstream moved and we have not caught up),
 * which is a different key from liteOnly and gets a SHORTER budget below. Read
 * explicitly rather than folding liteBehind under the liteOnly/`upstream` path,
 * so a debt cannot borrow an intention's clock by accident.
 */
export function liteBehindEntries (markdown) {
    const out = [];
    for (const block of markdown.matchAll(/```json\n([\s\S]*?)\n```/g)) {
        let spec;
        try { spec = JSON.parse(block[1]); } catch { continue; }
        for (const [file, body] of Object.entries(spec.files || {})) {
            for (const entry of body.liteBehind || []) out.push({ file, ...entry });
        }
    }
    return out;
}

/** Days between `markedAt` and `now`, or null if the date is unusable. */
export function daysHeld (markedAt, now) {
    if (typeof markedAt !== 'string' || !ISO.test(markedAt)) return null;
    const then = Date.parse(`${markedAt}T00:00:00Z`);
    return Number.isFinite(then) ? Math.floor((now - then) / DAY) : null;
}

const isUpstream = d => typeof d === 'string' && d.trim().toLowerCase().startsWith('upstream');

test.describe('a disposition has a deadline', () => {
    const ledgers = LEDGERS();
    const entries = ledgers.flatMap(doc =>
        ledgerEntries(readFileSync(doc, 'utf8'))
            .map(e => ({ ...e, doc: path.basename(doc) })));

    test.it('the ledger was read at all', () => {
        // Species 1: every assertion below is satisfied by an empty list. A
        // renamed document, a changed fence or a JSON parse failure would all
        // report a clean bill of health for a ledger nobody looked at.
        assert.ok(ledgers.length >= 3,
            `only ${ledgers.length} VENDOR-DIVERGENCE-*.md found in docs/ — there are three `
            + 'vendored upstreams and each has a ledger; a scan over fewer is a scan over a '
            + 'population somebody handed it');
        // THE THIRD FLOOR TO RETIRE ITSELF AT ZERO, and the pattern is worth naming
        // because it is not a coincidence: `>= 10 entries` and `some entry is
        // upstream:` were both correct species-1 defences while entries existed,
        // and both became permanent reds on the day the ledgers emptied. An
        // anti-vacuity check anchored to a live corpus REFUSES ITS OWN GOAL STATE
        // — and the repair a person reaches for under a red gate is deletion,
        // which leaves the check vacuous exactly when nothing else is watching.
        //
        // The fix is the same one the divergence and residue ratchets took: keep
        // the corpus claim where it still has a corpus (there are three ledgers,
        // and that has not changed), and prove the PARSER separately, against a
        // fabricated ledger whose answer is known. Then zero entries is a
        // measurement rather than a reading a broken parser also produces.
        const FABRICATED = [
            '```json',
            JSON.stringify({files: {'fab.js': {liteOnly: [
                {id: 'fab-overdue', disposition: 'upstream: fixture', markedAt: '2020-01-01'},
                {id: 'fab-stays', disposition: 'stays -- fixture', markedAt: '2020-01-01'}
            ]}}}),
            '```'
        ].join('\n');
        const parsed = ledgerEntries(FABRICATED);
        assert.equal(parsed.length, 2,
            `the ledger parser found ${parsed.length} entries in a document built to contain `
            + 'exactly 2. It cannot see entries that ARE there, so its 0 on the real ledgers '
            + 'says nothing about the real ledgers and every deadline below is unchecked.');
        assert.equal(parsed.filter(e => isUpstream(e.disposition)).length, 1,
            'the `upstream:` discriminator matched the wrong number of fabricated entries, so '
            + 'a real overdue entry would not be recognised as one either');
        assert.ok(daysHeld(parsed[0].markedAt, Date.now()) > 1000,
            'daysHeld returned nothing usable for a 2020 date — an entry could be '
            + 'years overdue and this gate would compute no age for it');

        // And the real ledgers. Zero is the goal state, so it is asserted rather
        // than left as the absence of a complaint: with the parser proven above,
        // an empty read is a measurement. A NON-empty read is fine too — it just
        // means there is something for the deadline tests below to judge.
        const upstreamEntries = entries.filter(e => isUpstream(e.disposition));
        assert.ok(entries.length === 0 || upstreamEntries.length > 0,
            `${entries.length} ledger entries exist and NONE is dispositioned \`upstream\`, so `
            + 'every one of them has been excused. That is the state the inverted default was '
            + 'ruled against: a ledger of `stays` is a fork with paperwork.');
    });

    test.it('every entry records WHEN its disposition was assigned', () => {
        const missing = entries
            .filter(e => !ISO.test(e.markedAt ?? ''))
            .map(e => `${e.doc} ${e.file}:${e.id} (markedAt=${JSON.stringify(e.markedAt)})`);
        assert.deepEqual(missing, [],
            'these entries carry a disposition with no `markedAt`, so nothing can tell a '
            + 'decision taken last week from one taken last year:\n    ' + missing.join('\n    ')
            + '\n\n  Add "markedAt": "YYYY-MM-DD" beside the disposition — the date the '
            + 'decision was MADE, not today\'s date.');
    });

    test.it('no `upstream` entry has outlived its budget', () => {
        const now = Date.now();
        const overdue = entries
            .filter(e => isUpstream(e.disposition))
            .map(e => ({ e, held: daysHeld(e.markedAt, now) }))
            .filter(({ held }) => held !== null && held > BUDGET_DAYS)
            .map(({ e, held }) => `${e.doc} ${e.file}:${e.id} — marked ${e.markedAt}, held ${held} days `
                + `(${held - BUDGET_DAYS} over)`);

        assert.deepEqual(overdue, [],
            '\n  DIVERGENCE MARKED `upstream` THAT HAS NOT GONE UPSTREAM:\n    '
            + overdue.join('\n    ')
            + `\n\n  A disposition is an intention, and after ${BUDGET_DAYS} days an intention `
            + 'nobody acted on is a decision not to act. Two remedies, and no third:\n'
            + '    1. Send the work upstream, land it there, bump the pin, retire the entry.\n'
            + '    2. Change the disposition to `stays` and say WHY it is ours to keep.\n\n'
            + '  This gate is a clock: it can red on a day nobody pushed, which is what a '
            + 'deadline is for.\n');
    });

    test.it('the clock arithmetic is driven, not assumed', () => {
        // Fired at CONSTRUCTED dates. The live ledger cannot test the boundary,
        // because it only holds whatever dates it happens to hold today.
        const now = Date.parse('2026-10-11T12:00:00Z');
        assert.equal(daysHeld('2026-10-11', now), 0, 'marked today is zero days held');
        assert.equal(daysHeld('2026-09-11', now), 30, 'exactly at the budget');
        assert.equal(daysHeld('2026-09-10', now), 31, 'one day over');
        assert.equal(daysHeld('not-a-date', now), null, 'an unusable date is not silently zero');
        assert.equal(daysHeld(undefined, now), null);
        assert.equal(daysHeld('2026-9-1', now), null, 'a non-ISO spelling is refused, not parsed');
    });

    test.it('the BUDGET is what the check actually applies', () => {
        // M3: widening BUDGET_DAYS reds nothing while no entry is near the
        // boundary — the live ledger can only hold the dates it holds. So the
        // selection runs against CONSTRUCTED entries at the boundary, using the
        // same predicate and the same constant as the assertion above.
        const now = Date.parse('2026-12-01T00:00:00Z');
        const at = days => new Date(now - days * DAY).toISOString().slice(0, 10);
        const sample = [
            { file: 'f.js', id: 'inside', disposition: 'upstream: x', markedAt: at(BUDGET_DAYS) },
            { file: 'f.js', id: 'over', disposition: 'upstream: x', markedAt: at(BUDGET_DAYS + 1) },
            { file: 'f.js', id: 'stays-old', disposition: 'stays', markedAt: at(3650) }
        ];
        const overdue = sample
            .filter(e => isUpstream(e.disposition))
            .filter(e => (daysHeld(e.markedAt, now) ?? 0) > BUDGET_DAYS)
            .map(e => e.id);
        assert.deepEqual(overdue, ['over'],
            `with BUDGET_DAYS=${BUDGET_DAYS}, exactly the entry one day past it is overdue — `
            + 'a `stays` entry ten years old is not, and one exactly at the budget is not');
    });

    test.it('the upstream test matches the dispositions in use and not the others', () => {
        assert.equal(isUpstream('upstream: lane A — machine-checkpoint.js'), true);
        assert.equal(isUpstream('  UPSTREAM: shouting still counts'), true);
        assert.equal(isUpstream('stays — this is lite\'s own'), false);
        assert.equal(isUpstream('sync: take upstream\'s form'), false);
        assert.equal(isUpstream(undefined), false);
    });

    // --- liteBehind: a DEBT, on its own shorter clock -------------------------
    //
    // liteRemoved and liteBehind are separate keys (VENDORING-REGIME.md): a
    // removal is a decision that may stand, a liteBehind is a debt that must be
    // synced down. A debt ages too, and faster — see LITE_BEHIND_BUDGET_DAYS. The
    // liteBehind path is SEPARATE from the `upstream` path above on purpose: its
    // dispositions read `sync:`, which `isUpstream` deliberately does not match,
    // so a debt can never borrow the longer intention clock.
    const behind = ledgers.flatMap(doc =>
        liteBehindEntries(readFileSync(doc, 'utf8')).map(e => ({ ...e, doc: path.basename(doc) })));

    test.it('a liteBehind `sync:` disposition is not caught by the upstream clock', () => {
        // The guard against the accident named in the ruling: were `isUpstream`
        // to match `sync:`, every debt would silently inherit the 30-day budget
        // instead of its own 14. It must not.
        assert.equal(isUpstream('sync: adopt upstream\'s expanded comment'), false);
        assert.equal(isUpstream('sync'), false);
        assert.ok(LITE_BEHIND_BUDGET_DAYS < BUDGET_DAYS,
            'a sync debt is cheaper to pay than an upstream trip, so its budget must be shorter');
    });

    test.it('every liteBehind entry records WHEN the debt was marked', () => {
        // Vacuous while no debt exists, and correct the day one does — the
        // write-the-absence-check-before-the-subject shape. The arithmetic itself
        // is driven at constructed dates below, where it cannot be vacuous.
        const missing = behind
            .filter(e => !ISO.test(e.markedAt ?? ''))
            .map(e => `${e.doc} ${e.file}:${e.id} (markedAt=${JSON.stringify(e.markedAt)})`);
        assert.deepEqual(missing, [],
            'these liteBehind debts carry no `markedAt`, so the sync clock cannot start:\n    '
            + missing.join('\n    ') + '\n\n  Add "markedAt": "YYYY-MM-DD" — the date the debt was noticed.');
    });

    test.it('no liteBehind debt has outlived its shorter budget', () => {
        const now = Date.now();
        const overdue = behind
            .map(e => ({ e, held: daysHeld(e.markedAt, now) }))
            .filter(({ held }) => held !== null && held > LITE_BEHIND_BUDGET_DAYS)
            .map(({ e, held }) => `${e.doc} ${e.file}:${e.id} — marked ${e.markedAt}, held ${held} days `
                + `(${held - LITE_BEHIND_BUDGET_DAYS} over the ${LITE_BEHIND_BUDGET_DAYS}-day sync budget)`);
        assert.deepEqual(overdue, [],
            '\n  A liteBehind DEBT HAS NOT BEEN SYNCED DOWN:\n    ' + overdue.join('\n    ')
            + `\n\n  A debt is not an intention: the remedy is one thing, run the sync\n`
            + '  (`npm run sync:bwboard`), reconcile, and retire the entry. If it turns out\n'
            + '  lite means to keep the difference, it was never liteBehind — move it to a\n'
            + '  `stays` liteOnly entry with the reason.\n');
    });

    test.it('the liteBehind budget is what the check applies, driven at constructed dates', () => {
        // M3, for the shorter budget: the live ledger holds no debt today, so the
        // selection runs against constructed entries at the boundary, with the same
        // predicate and the same constant as the assertion above.
        const now = Date.parse('2026-12-01T00:00:00Z');
        const at = days => new Date(now - days * DAY).toISOString().slice(0, 10);
        const sample = [
            { file: 'f.js', id: 'inside', markedAt: at(LITE_BEHIND_BUDGET_DAYS) },
            { file: 'f.js', id: 'over', markedAt: at(LITE_BEHIND_BUDGET_DAYS + 1) },
            { file: 'f.js', id: 'upstream-age', markedAt: at(BUDGET_DAYS) } // over the sync budget, under the upstream one
        ];
        const overdue = sample
            .filter(e => (daysHeld(e.markedAt, now) ?? 0) > LITE_BEHIND_BUDGET_DAYS)
            .map(e => e.id);
        assert.deepEqual(overdue, ['over', 'upstream-age'],
            `with LITE_BEHIND_BUDGET_DAYS=${LITE_BEHIND_BUDGET_DAYS}, a debt one day past it is overdue, and `
            + 'a debt as old as the 30-day UPSTREAM budget is well past the shorter sync one — which is the '
            + 'point of giving a debt its own, shorter clock.');
    });
});
