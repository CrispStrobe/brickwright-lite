/**
 * The browser gates' unconditional sleeping is a number, and it may only shrink.
 *
 * WHY THIS IS A GATE AND NOT JUST A REPORT
 * ----------------------------------------
 * `docs/MEASURED-THRESHOLDS.md` asks, of every number that bounds a verdict,
 * who measured it. `waitForTimeout(N)` is not such a number — it bounds
 * nothing, decides nothing, and a threshold inventory is right to skip it.
 * Which is exactly why nobody has ever had to justify one, and why there are
 * now 249 of them against 119 bounds.
 *
 * A fixed sleep is a guess about how long the app needs, and it is the one kind
 * of guess that cannot be checked by watching: it costs exactly what it was
 * given, every time. Too short is a flake nobody can reproduce. Too long is
 * wall-clock on every CI run forever. The only thing an outside observer can do
 * is refuse to let the total grow silently.
 *
 * So: a ratchet, with the measurement in the source next to it, per the rule
 * that a re-measurement is written back so nobody repeats it.
 *
 * HOW TO CHANGE THESE NUMBERS
 * ---------------------------
 * DOWN, freely — replace a sleep with a wait for the condition it is standing
 * in for (`waitForSelector`, `waitForFunction`), then lower the ceiling to the
 * new total in the same commit.
 *
 * UP only with a reason in the commit message. Adding a browser gate is a
 * legitimate reason. "The test got flaky so I raised the sleep" is the failure
 * this ratchet exists to make visible: it is the cheapest possible fix and it
 * charges every future CI run for it.
 */
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');

const censusJson = () => JSON.parse(execFileSync('node',
    [path.join(ROOT, 'scripts', 'aggregate-timeouts.mjs'), '--census', '--json'],
    {cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26}));

// MEASURED 2026-08-24 on branch probe/lite-timeout-thresholds, by
// scripts/aggregate-timeouts.mjs --census. Every ceiling here is the observed
// value with ZERO headroom, which is the correct state for a ratchet: nothing
// can be added without this going red.
//
//   run by CI            26 bounds   64 sleeps   61.9 s
//   runnable, not in CI  53 bounds  130 sleeps  192.2 s
//   _tmp- scratch        40 bounds   55 sleeps  155.5 s
//   TOTAL               119 bounds  249 sleeps  409.6 s
//
// The 119 agrees exactly with sb3-creator's independently written
// scripts/threshold-inventory.mjs, which is what makes the 249 — a population
// that inventory does not collect at all — worth believing.
//
// EXACT values below, not the report's rounded ones. Setting `ciSleepMs` from the
// table's "61.9 s" made the ratchet red on the tree it was measured against:
// the true total is 61,930 ms. A ceiling read off a rounded display is a
// threshold whose evidence is a formatting decision.
const CEILING = {
    ciSleepMs: 61_930,      // 64 sleeps across the five CI browser gates
    ciSleeps: 64,
    totalSleeps: 249,       // 409,590 ms repository-wide
    scratchFiles: 10        // _tmp- scripts that contain waits
};

describe('the wait census: fixed sleeps are counted, and may only shrink', () => {
    const c = censusJson();
    const isScratch = (f) => /(^|\/)_tmp-/.test(f);
    const ci = new Set(c.ci);
    const ciSleeps = c.census.sleeps.filter((s) => ci.has(s.file));

    test('the census parsed a real tree (instrument before subject)', () => {
        // Every assertion below is a sum over a list, and a broken scan returns
        // an empty list — which reads as "no sleeps at all", the best possible
        // news, from the worst possible cause.
        assert.ok(c.census.parsed >= 100,
            `the census parsed only ${c.census.parsed} files; expected at least 100. `
            + 'The scan is broken and every total below would be a clean sweep over nothing.');
        assert.ok(c.census.bounds.length >= 100,
            `only ${c.census.bounds.length} bounding literals found; expected ~119. The Property `
            + 'visitor has stopped matching `timeout:` and the bounds population is invisible.');
        assert.ok(ciSleeps.length > 0,
            'no fixed sleeps found in any script CI runs. Either CI stopped running the browser '
            + 'gates or the CI_GATES resolution broke; both make the ratchet below vacuous.');
    });

    test('the five CI browser gates sleep no longer than the day this was measured', () => {
        const total = ciSleeps.reduce((a, s) => a + s.value, 0);
        assert.ok(total <= CEILING.ciSleepMs,
            `the scripts CI runs now spend ${(total / 1000).toFixed(1)} s in waitForTimeout() per run, `
            + `up from the measured ${(CEILING.ciSleepMs / 1000).toFixed(1)} s. That time is spent whether `
            + 'or not the app is ready, on every CI run, forever.\n'
            + 'If a gate got flaky, the fix is to wait for the CONDITION (waitForSelector / '
            + 'waitForFunction), not to sleep longer. If you added a gate, raise this ceiling in the '
            + 'same commit and say so.');
        assert.ok(ciSleeps.length <= CEILING.ciSleeps,
            `${ciSleeps.length} fixed sleeps in CI-run scripts, up from ${CEILING.ciSleeps}.`);
    });

    test('the repository-wide sleep count does not grow', () => {
        assert.ok(c.census.sleeps.length <= CEILING.totalSleeps,
            `${c.census.sleeps.length} fixed sleeps across scripts/ and test/, up from `
            + `${CEILING.totalSleeps}. A new one needs the same justification as any other `
            + 'unmeasured number bounding CI.');
    });

    test('the _tmp- scratch scripts do not multiply', () => {
        // 10 tracked files whose names say they are temporary, holding 40 of
        // the repository's 119 bounding literals and 155.5 s of sleeps. They
        // are a third of the "unmeasured timeouts" population and nothing runs
        // them.
        // Not deleted here — that is someone else's call, and several may still
        // be useful probes — but they may not grow while wearing a name that
        // says they are already gone.
        const files = new Set([...c.census.bounds, ...c.census.sleeps]
            .map((r) => r.file).filter(isScratch));
        assert.ok(files.size <= CEILING.scratchFiles,
            `${files.size} \`_tmp-\` scripts now carry waits, up from ${CEILING.scratchFiles}:\n  `
            + [...files].sort().join('\n  ')
            + '\nA file named _tmp- that outlives its afternoon is not temporary, it is untracked '
            + 'debt with a misleading name. Promote it or delete it.');
    });
});
