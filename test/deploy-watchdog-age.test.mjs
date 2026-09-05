/**
 * The deploy watchdog cancels build runs that have been EXECUTING too long.
 *
 * The failure this guards is not a hung build going unnoticed — it is the
 * opposite: a HEALTHY build killed as "stuck" because its wait for a runner
 * was counted as work. On a box that queues for ten or twenty minutes that is
 * not a corner case, it is the common case, and the resulting `cancelled`
 * reads as "somebody chose to stop it", so nobody investigates. A main branch
 * getting zero verdicts looks exactly like a quiet one.
 *
 * The subtlety is that a run reports `in_progress` as soon as GitHub accepts
 * it, while its jobs can still be queued with `started_at: null`. Such a run
 * has no execution age YET — which is not the same as an age of zero. Treating
 * the absence as a measurement invents precisely the queue time the caller was
 * trying to exclude.
 *
 * Asserted against fixtures rather than a live queue, because the interesting
 * states (queued-long, started-recently, never-started) do not co-occur on
 * demand — and asserted on the RETURNED SET, not on the workflow's source
 * text, so a rewrite that keeps the behaviour keeps the gate.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {stuckRuns} from '../scripts/watchdog-stuck-runs.mjs';

const NOW = Date.parse('2026-09-05T08:00:00Z');
const ago = minutes => new Date(NOW - (minutes * 60000)).toISOString();
const ids = runs => stuckRuns(runs, NOW).map(run => run.id).sort();

test('a run that has waited a long time but never started is not stuck', () => {
    // The real shape from 2026-09-05: five main runs cancelled while queued.
    const runs = [{id: 'queued-40m', run_started_at: ago(40),
        jobs: [{started_at: null}, {started_at: null}]}];
    assert.deepEqual(ids(runs), [],
        'a queued run was judged by its creation time, which is the queue-time bug');
});

test('a run with no jobs at all is not stuck either', () => {
    assert.deepEqual(ids([{id: 'no-jobs', run_started_at: ago(90), jobs: []}]), []);
    assert.deepEqual(ids([{id: 'undefined-jobs', run_started_at: ago(90)}]), []);
});

test('a run executing past the budget is stuck, and its age is the EXECUTION age', () => {
    // Created 50 minutes ago, started 35 minutes ago: 35 is the answer, not 50.
    const runs = [{id: 'stuck', run_started_at: ago(50), jobs: [{started_at: ago(35)}]}];
    const found = stuckRuns(runs, NOW);
    assert.deepEqual(found.map(r => r.id), ['stuck']);
    assert.equal(found[0].ageMinutes, 35, 'age was measured from creation, not from start');
});

test('a healthy build that waited a long time for a runner survives', () => {
    // Waited 30 minutes, compiling for 8. Measured from creation it looks 38
    // minutes old and dies; measured from start it is a normal build.
    const runs = [{id: 'healthy', run_started_at: ago(38), jobs: [{started_at: ago(8)}]}];
    assert.deepEqual(ids(runs), []);
});

test('the earliest started job defines the run age, not the latest', () => {
    // A run whose first job started 40 minutes ago is 40 minutes into
    // execution even if a later job started moments ago.
    const runs = [{id: 'multi', run_started_at: ago(45),
        jobs: [{started_at: ago(2)}, {started_at: ago(40)}, {started_at: null}]}];
    assert.deepEqual(ids(runs), ['multi']);
});

test('the budget is a boundary, not a suggestion', () => {
    const at = m => [{id: `run-${m}`, run_started_at: ago(60), jobs: [{started_at: ago(m)}]}];
    assert.deepEqual(ids(at(25)), [], '25 minutes is within budget');
    assert.deepEqual(ids(at(26)), ['run-26']);
    assert.deepEqual(stuckRuns(at(11), NOW, {maxMinutes: 10}).map(r => r.id), ['run-11'],
        'the budget is not honoured when overridden');
});

test('the workflow calls the script instead of re-deriving the age in shell', () => {
    // Behaviour above is only protective if the workflow actually runs it. This
    // is a source assertion ON PURPOSE and it is deliberately narrow: it checks
    // that the script is invoked and that the discredited fallback is gone,
    // not how the surrounding shell is spelled.
    const yml = readFileSync(path.join(import.meta.dirname, '..',
        '.github/workflows/deploy-watchdog.yml'), 'utf8');
    // Asserted on the INVOCATION, not the name. The first version of this
    // check used includes('scripts/watchdog-stuck-runs.mjs') and stayed green
    // when the call was replaced with `cat >/dev/null`, because the comment
    // above the call mentions the script by name. A gate that matches its
    // subject's documentation instead of its subject is the species this repo
    // keeps finding; it found it here by mutation rather than by review.
    assert.match(yml, /\n\s*echo "\$payload" \| node scripts\/watchdog-stuck-runs\.mjs/,
        'the watchdog no longer pipes the gathered runs through the stuck-run selector');
    assert.ok(!/started="\$created"/.test(yml),
        'the run-creation-time fallback is back: a queued run will be aged by its queue time');
});
