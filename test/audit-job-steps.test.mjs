/**
 * The in-job audit that a green job hid no skipped gate: each verdict can fire.
 *
 * The script is judged on saved job payloads, not the live API, because the
 * thing to prove is the judgement — a step conclusion table in, a verdict out —
 * and the API only ever shows you the run you are in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {judge, run} from '../scripts/audit-job-steps.mjs';

const step = (name, conclusion) => ({name, status: 'completed', conclusion});
const AUDIT = 'Audit — every browser gate ran';
const base = [
    step('Install', 'success'), step('Build the editor', 'success'),
    step('Browser gate — circuit UX', 'success'), step('Browser gate — editor', 'success'),
    step('Browser benchmark — 8086 desktop and mobile', 'success'), step(AUDIT, null)
];

test('all browser gates ran: ok, and the count is the count', () => {
    const v = judge(base);
    assert.equal(v.verdict, 'ok');
    assert.equal(v.ran, 3);
});

test('a skipped gate in a job with no failing step is the lie, named', () => {
    const steps = base.map(s => s.name === 'Browser gate — editor' ? step(s.name, 'skipped') : s);
    const v = judge(steps);
    assert.equal(v.verdict, 'skipped-in-green');
    assert.deepEqual(v.skipped, ['Browser gate — editor']);
});

test('a skipped gate after a real failure is a note, not a second red', () => {
    const steps = base.map(s => s.name === 'Build the editor' ? step(s.name, 'failure')
        : isGate(s.name) ? step(s.name, 'skipped') : s);
    const v = judge(steps);
    assert.equal(v.verdict, 'skipped-after-red');
    assert.deepEqual(v.failedEarlier, ['Build the editor']);
    assert.equal(v.skipped.length, 3);
});

test('a timed-out gate counts as red, so the gates after it are a note', () => {
    const steps = base.map(s => s.name === 'Browser gate — circuit UX' ? step(s.name, 'timed_out')
        : s.name === 'Browser gate — editor' ? step(s.name, 'skipped') : s);
    assert.equal(judge(steps).verdict, 'skipped-after-red');
});

test('a job with no browser gates is a misplaced audit, not a pass', () => {
    assert.equal(judge([step('Install', 'success'), step(AUDIT, null)]).verdict, 'no-gates');
});

test('the audit step itself is never counted as an earlier failure', () => {
    const steps = base.map(s => s.name === AUDIT ? step(s.name, 'failure') : s);
    assert.equal(judge(steps).verdict, 'ok');
});

function isGate (name) {
    return /^Browser (?:gates?|benchmark) — /.test(name);
}

const sinks = () => { const out = {logs: [], errors: []}; return {out, log: m => out.logs.push(m), error: m => out.errors.push(m)}; };

test('an API failure is an ABSENCE — red, but the message never says a gate was skipped', async () => {
    const {out, log, error} = sinks();
    const code = await run(async () => { throw new Error('GitHub HTTP 403: rate limit (after one retry; first attempt: GitHub HTTP 403)'); },
        {jobName: 'build', attempt: 1}, {log, error});
    assert.equal(code, 1);
    assert.match(out.errors[0], /could not audit this run: GitHub HTTP 403/);
    assert.doesNotMatch(out.errors.join('\n'), /skipped with no earlier failure/, 'an absence must not read as a finding');
});

test('a finding names the gate and does not read as an absence', async () => {
    const {out, log, error} = sinks();
    const jobs = [{name: 'build', run_attempt: 1, steps: base.map(s => s.name === 'Browser gate — editor' ? step(s.name, 'skipped') : s)}];
    const code = await run(async () => jobs, {jobName: 'build', attempt: 1}, {log, error});
    assert.equal(code, 1);
    assert.match(out.errors[0], /skipped with no earlier failure/);
    assert.match(out.errors[0], /Browser gate — editor/);
    assert.doesNotMatch(out.errors[0], /could not audit/);
});

test('the job cannot be found: red as an absence, not as a finding', async () => {
    const {out, log, error} = sinks();
    const code = await run(async () => [{name: 'corpus', run_attempt: 1, steps: []}], {jobName: 'build', attempt: 1}, {log, error});
    assert.equal(code, 1);
    assert.match(out.errors[0], /could not audit this run: expected exactly one job/);
});

// ---- Under a matrix of shards (2026-09-06) ----------------------------------

import {expectedForShard} from '../scripts/audit-job-steps.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const heavyLeg = {shard: 'heavy', mine: ['Browser benchmark — 8086 desktop and mobile'], others: ['Browser gate — circuit UX', 'Browser gate — editor']};
const inHeavy = base.map(s => isGate(s.name) && !heavyLeg.mine.includes(s.name) ? step(s.name, 'skipped') : s);

test('shard: gates assigned elsewhere show skipped here and that is ok; the count is this leg\'s count', () => {
    const v = judge(inHeavy, undefined, heavyLeg);
    assert.equal(v.verdict, 'ok');
    assert.equal(v.ran, 1);
    assert.deepEqual(v.skipped, []);
});

test('shard: a gate assigned HERE that ended skipped is still the lie, named', () => {
    const steps = inHeavy.map(s => s.name === heavyLeg.mine[0] ? step(s.name, 'skipped') : s);
    const v = judge(steps, undefined, heavyLeg);
    assert.equal(v.verdict, 'skipped-in-green');
    assert.deepEqual(v.skipped, heavyLeg.mine);
});

test('shard: a gate assigned elsewhere that RAN here is a double run, failed by name', () => {
    const steps = inHeavy.map(s => s.name === 'Browser gate — editor' ? step(s.name, 'success') : s);
    const v = judge(steps, undefined, heavyLeg);
    assert.equal(v.verdict, 'ran-in-wrong-shard');
    assert.deepEqual(v.wrongShard, ['Browser gate — editor (success)']);
});

test('shard: a gate in the job that no clause assigns is failed by name, before anything else', () => {
    const steps = [...inHeavy, step('Browser gate — brand new, no clause', 'success')];
    const v = judge(steps, undefined, heavyLeg);
    assert.equal(v.verdict, 'unassigned-gate');
    assert.deepEqual(v.unassigned, ['Browser gate — brand new, no clause']);
});

test('shard: the leg is found by its DISPLAY name, and a leg named only by GITHUB_JOB is an absence, not a finding', async () => {
    const jobs = [{name: 'browser (heavy)', run_attempt: 1, steps: inHeavy}, {name: 'browser (light)', run_attempt: 1, steps: base}];
    const yml = readFileSync(path.resolve(import.meta.dirname, '..', '.github', 'workflows', 'build.yml'), 'utf8');
    let s = sinks();
    let code = await run(async () => jobs, {jobName: 'browser', attempt: 1, shard: 'heavy', workflowText: yml}, {log: s.log, error: s.error});
    assert.equal(code, 1);
    assert.match(s.out.errors[0], /could not audit this run: expected exactly one job named "browser", found 0/);
    assert.doesNotMatch(s.out.errors.join('\n'), /skipped with no earlier failure/);
});

test('shard: the audit refuses a workflow whose clauses are not a partition, as a workflow defect, before judging any step', async () => {
    const yml = readFileSync(path.resolve(import.meta.dirname, '..', '.github', 'workflows', 'build.yml'), 'utf8');
    const broken = yml.replace(/(- name: Browser gate — circuit UX\n(?:.*\n){0,3}?\s+if: [^\n]*?) && matrix\.shard == '[a-z]+'/, '$1');
    assert.notEqual(broken, yml, 'mutation anchor');
    const s = sinks();
    const code = await run(async () => { throw new Error('must not be reached'); }, {jobName: 'browser (heavy)', attempt: 1, shard: 'heavy', workflowText: broken}, {log: s.log, error: s.error});
    assert.equal(code, 1);
    assert.match(s.out.errors[0], /not a partition of the gates/);
    assert.match(s.out.errors[0], /no shard clause.*Browser gate — circuit UX/);
    const e = expectedForShard(yml, 'heavy');
    assert.ok(e.ok && e.mine.length >= 4 && e.others.length >= 30, `the real workflow partitions: heavy ${e.mine.length}, others ${e.others.length}`);
});
