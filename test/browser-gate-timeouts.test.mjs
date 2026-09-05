/**
 * Every browser step in build.yml carries its own timeout-minutes.
 *
 * Measured 2026-09-05: the build job's `timeout-minutes: 30` was the day's
 * "unexplained canceller". GitHub reports a timed-out JOB as `cancelled`, so
 * four of the last five cancelled main builds — each dying at 30.4 minutes of
 * job time — read as supersession, and nothing named the step. It was one
 * browser gate (the since-reverted SVG-sanitizer probe) running twenty minutes
 * in a job that is healthy at 17–19. A per-step budget makes the next hang a
 * red step WITH A NAME, at most eight minutes in.
 *
 * This test holds the shape: a browser step added without a budget fails here,
 * by name, before it can hang a run. Budgets are bounded above so that a single
 * hang cannot itself reach the job ceiling (healthy job + 8 min < ceiling), and
 * below so nobody "fixes" a slow gate by giving it a budget that is really the
 * job's.
 *
 * The parse finds the browser steps in WHATEVER job holds them. It is
 * deliberately not keyed on `build:`: lego-be's lane/split-browser-gates moves
 * them into a `browser` job, and a parser sliced on `build:` then finds zero
 * steps and — without the count check in the first test — passes every
 * assertion over an empty set. The ceiling that bounds the steps is the
 * timeout of the job that holds them, wherever that is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(process.env.BW_BUILD_YML || path.join(ROOT, '.github/workflows/build.yml'), 'utf8');

/** Every job as {id, timeout, steps: [{job, name, timeout}]}, from the `jobs:` block. */
const parseJobs = text => {
    const lines = text.split('\n');
    const jobsAt = lines.findIndex(l => l === 'jobs:');
    assert.ok(jobsAt >= 0, 'build.yml has no top-level jobs: block — the parse is wrong, not the file');
    const jobs = new Map();
    let job = null;
    let step = null;
    for (const line of lines.slice(jobsAt + 1)) {
        if (/^\S/.test(line) && line.trim() !== '') break; // left the jobs block
        const j = line.match(/^  ([a-z][a-z-]*):$/);
        if (j) {
            job = {id: j[1], timeout: null, steps: []};
            jobs.set(j[1], job);
            step = null;
            continue;
        }
        if (!job) continue;
        const jt = line.match(/^    timeout-minutes:\s*(\d+)\s*(?:#.*)?$/);
        if (jt) job.timeout = Number(jt[1]);
        if (/^      - /.test(line)) {
            step = {job: job.id, name: '', timeout: null};
            job.steps.push(step);
        }
        if (!step) continue;
        const name = line.match(/^      (?:- )?name:\s*(.*)$/);
        if (name) step.name = name[1];
        // A trailing comment carries the measured maximum the budget was derived from.
        const t = line.match(/^        timeout-minutes:\s*(\d+)\s*(?:#.*)?$/);
        if (t) step.timeout = Number(t[1]);
    }
    return jobs;
};

const isBrowserStep = step => /^Browser (?:gates?|benchmark) — /.test(step.name);
const browserSteps = text => [...parseJobs(text).values()].flatMap(j => j.steps).filter(isBrowserStep);
/** The jobs that hold browser steps, and the one ceiling that bounds them if there is exactly one. */
const ceilingFor = text => {
    const holders = [...parseJobs(text).values()].filter(j => j.steps.some(isBrowserStep));
    return {holders: holders.map(j => j.id), timeout: holders.length === 1 ? holders[0].timeout : null};
};
const MAX_STEP_BUDGET = 8;
const MIN_STEP_BUDGET = 3;

test('the parse found the browser steps it is about to reason over', () => {
    const steps = browserSteps(yml);
    assert.ok(steps.length >= 30, `only ${steps.length} browser steps parsed — build.yml carries ~40; the parse is wrong before anything is concluded`);
    const {holders, timeout} = ceilingFor(yml);
    assert.equal(holders.length, 1, `browser steps are spread over jobs ${holders.join(', ')} — one job must hold them so one ceiling bounds them`);
    assert.ok(timeout >= 20, `the job holding the browser steps (${holders[0]}) has no timeout-minutes of its own (${timeout})`);
});

test('every browser step carries its own timeout-minutes', () => {
    const missing = browserSteps(yml).filter(s => s.timeout === null).map(s => `${s.name} (job ${s.job})`);
    assert.deepEqual(missing, [], `browser step(s) without a timeout-minutes — a hang there dies as a "cancelled" run at the job ceiling with no step named:\n  ${missing.join('\n  ')}`);
});

test('budgets are bounded: no single hang reaches the job ceiling, and none is the job\'s own', () => {
    const steps = browserSteps(yml).filter(s => s.timeout !== null);
    const over = steps.filter(s => s.timeout > MAX_STEP_BUDGET).map(s => `${s.name} (${s.timeout})`);
    const under = steps.filter(s => s.timeout < MIN_STEP_BUDGET).map(s => `${s.name} (${s.timeout})`);
    assert.deepEqual(over, [], `budget above ${MAX_STEP_BUDGET} min — the measured maximum of any gate is under 3 min; a bigger budget is a hang waiting to become a cancelled run`);
    assert.deepEqual(under, [], `budget under ${MIN_STEP_BUDGET} min — a loaded runner makes a healthy gate flaky at that size`);
    const {timeout} = ceilingFor(yml);
    assert.ok(MAX_STEP_BUDGET < timeout - 10, `a step budget of ${MAX_STEP_BUDGET} leaves no room under the ${timeout}-minute ceiling of the job holding the gates`);
});

test('the invariant can fail: a browser step with its budget removed is reported by name', () => {
    const mutated = yml.replace(/(- name: Browser gate — circuit UX\n)\s+timeout-minutes: \d+[^\n]*\n/, '$1');
    assert.notEqual(mutated, yml, 'mutation anchor did not match — the fixture step or its budget moved');
    const missing = browserSteps(mutated).filter(s => s.timeout === null).map(s => s.name);
    assert.deepEqual(missing, ['Browser gate — circuit UX']);
});
