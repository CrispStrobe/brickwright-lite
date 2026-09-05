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
 * hang cannot itself reach the job ceiling (healthy job + 8 min < 30), and
 * below so nobody "fixes" a slow gate by giving it a budget that is really the
 * job's. The parse mirrors test/gate-coverage.test.mjs: the build job's steps,
 * one `- name:` block each.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(path.join(ROOT, '.github/workflows/build.yml'), 'utf8');

/** The build job's steps as {name, timeout} — same slicing as gate-coverage's parser. */
const buildJobSteps = text => {
    const lines = text.split('\n');
    const start = lines.findIndex(l => /^  build:$/.test(l));
    const end = lines.findIndex((l, i) => i > start && /^  [a-z][a-z-]*:$/.test(l));
    assert.ok(start >= 0, 'build.yml has no `build:` job — the parse is wrong, not the file');
    const body = lines.slice(start, end === -1 ? lines.length : end);
    const steps = [];
    let current = null;
    for (const line of body) {
        if (/^      - /.test(line)) {
            if (current) steps.push(current);
            current = {name: '', timeout: null};
        }
        if (!current) continue;
        const name = line.match(/^      (?:- )?name:\s*(.*)$/);
        if (name) current.name = name[1];
        // A trailing comment carries the measured maximum the budget was derived from.
        const t = line.match(/^        timeout-minutes:\s*(\d+)\s*(?:#.*)?$/);
        if (t) current.timeout = Number(t[1]);
    }
    if (current) steps.push(current);
    return steps;
};

const isBrowserStep = step => /^Browser (?:gates?|benchmark) — /.test(step.name);
const JOB_TIMEOUT = Number((yml.match(/^  build:\n(?:.*\n){0,3}?\s+timeout-minutes:\s*(\d+)/m) || [])[1]);
const MAX_STEP_BUDGET = 8;
const MIN_STEP_BUDGET = 3;

test('the parse found the browser steps it is about to reason over', () => {
    const steps = buildJobSteps(yml).filter(isBrowserStep);
    assert.ok(steps.length >= 30, `only ${steps.length} browser steps parsed — build.yml carries ~40; the parse is wrong before anything is concluded`);
    assert.ok(JOB_TIMEOUT >= 20, `the build job's own timeout-minutes was not found (${JOB_TIMEOUT})`);
});

test('every browser step carries its own timeout-minutes', () => {
    const missing = buildJobSteps(yml).filter(isBrowserStep).filter(s => s.timeout === null).map(s => s.name);
    assert.deepEqual(missing, [], `browser step(s) without a timeout-minutes — a hang there dies as a "cancelled" run at the job ceiling with no step named:\n  ${missing.join('\n  ')}`);
});

test('budgets are bounded: no single hang reaches the job ceiling, and none is the job\'s own', () => {
    const steps = buildJobSteps(yml).filter(isBrowserStep).filter(s => s.timeout !== null);
    const over = steps.filter(s => s.timeout > MAX_STEP_BUDGET).map(s => `${s.name} (${s.timeout})`);
    const under = steps.filter(s => s.timeout < MIN_STEP_BUDGET).map(s => `${s.name} (${s.timeout})`);
    assert.deepEqual(over, [], `budget above ${MAX_STEP_BUDGET} min — the measured maximum of any gate is under 3 min; a bigger budget is a hang waiting to become a cancelled run`);
    assert.deepEqual(under, [], `budget under ${MIN_STEP_BUDGET} min — a loaded runner makes a healthy gate flaky at that size`);
    assert.ok(MAX_STEP_BUDGET < JOB_TIMEOUT - 10, `a step budget of ${MAX_STEP_BUDGET} leaves no room under the ${JOB_TIMEOUT}-minute job ceiling for a healthy run`);
});

test('the invariant can fail: a browser step with its budget removed is reported by name', () => {
    const mutated = yml.replace(/(- name: Browser gate — circuit UX\n)\s+timeout-minutes: \d+[^\n]*\n/, '$1');
    assert.notEqual(mutated, yml, 'mutation anchor did not match — the fixture step or its budget moved');
    const missing = buildJobSteps(mutated).filter(isBrowserStep).filter(s => s.timeout === null).map(s => s.name);
    assert.deepEqual(missing, ['Browser gate — circuit UX']);
});
