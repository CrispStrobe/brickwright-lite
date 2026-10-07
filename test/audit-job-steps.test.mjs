/**
 * The in-job audit that a green job hid no skipped gate: each verdict can fire.
 *
 * The script is judged on saved job payloads, not the live API, because the
 * thing to prove is the judgement — a step conclusion table in, a verdict out —
 * and the API only ever shows you the run you are in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {judge, run, fetchJobs} from '../scripts/audit-job-steps.mjs';

const step = (name, conclusion) => ({name, status: 'completed', conclusion});
const AUDIT = 'Audit — every browser gate ran';
const base = [
    step('Install', 'success'), step('Build the editor', 'success'),
    step('Browser gate — circuit UX', 'success'), step('Browser gate — editor', 'success'),
    step('Browser benchmark — 8086 desktop and mobile', 'success'), step(AUDIT, null)
];

const apiEnv = {GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '42', GH_TOKEN: 'test-only',
    BW_JOB_NAME: 'browser (heavy)', GITHUB_RUN_ATTEMPT: '2'};
const apiJob = {id: 123, name: apiEnv.BW_JOB_NAME, run_id: 42, run_attempt: 2};
const jsonResponse = body => ({ok: true, json: async () => body});

test('API listing identifies the job, direct endpoint supplies its step conclusions', async () => {
    const calls = [];
    const detail = {...apiJob, steps: base};
    const jobs = await fetchJobs(async (url, options) => {
        calls.push({url, options});
        return jsonResponse(url.includes('/actions/jobs/') ? detail :
            {total_count: 1, jobs: [{...apiJob, steps: [{name: 'Install', status: 'in_progress'}]}]});
    }, {env: apiEnv, sleep: async () => assert.fail('no retry expected')});
    assert.deepEqual(jobs, [detail]);
    assert.equal(calls.length, 2);
    assert.ok(new URL(calls[1].url).pathname.endsWith('/actions/jobs/123'));
    assert.equal(calls[1].options.headers['Cache-Control'], 'no-cache');
});

test('repeated API polls bypass cached incomplete snapshots even in the same clock millisecond', async () => {
    const cache = new Map(), calls = [];
    let completed = false;
    const fetchCached = async (url, options) => {
        calls.push(url);assert.equal(options.cache, 'no-store');
        if (!cache.has(url)) cache.set(url, url.includes('/actions/jobs/') ?
            {...apiJob, steps: [{name: 'Browser gate — fixture', status: completed ? 'completed' : 'in_progress', conclusion: completed ? 'success' : null}]} :
            {total_count: 1, jobs: [apiJob]});
        return jsonResponse(cache.get(url));
    };
    const options = {env: apiEnv, now: () => 123, sleep: async () => assert.fail('no retry expected')};
    const first = await fetchJobs(fetchCached, options);completed = true;
    const second = await fetchJobs(fetchCached, options);
    assert.equal(first[0].steps[0].status, 'in_progress');
    assert.equal(second[0].steps[0].status, 'completed');
    assert.equal(new Set(calls).size, 4, 'both listing and detail receive a new cache key');
});

test('direct endpoint cannot substitute another run, attempt, matrix leg or job', async () => {
    for (const mutation of [{run_id: 43}, {run_attempt: 1}, {name: 'browser (light)'}, {id: 124}]) {
        let sleeps = 0;
        await assert.rejects(fetchJobs(async url => jsonResponse(url.includes('/actions/jobs/') ?
            {...apiJob, ...mutation, steps: base} : {total_count: 1, jobs: [apiJob]}),
        {env: apiEnv, sleep: async ms => {assert.equal(ms, 15000); sleeps++;}}), /identity does not match/);
        assert.equal(sleeps, 1);
    }
});

test('unreadable direct endpoint fails closed rather than falling back to listing steps', async () => {
    await assert.rejects(fetchJobs(async url => url.includes('/actions/jobs/') ?
        {ok: false, status: 503, text: async () => 'unavailable'} :
        jsonResponse({total_count: 1, jobs: [{...apiJob, steps: base}]}),
    {env: apiEnv, sleep: async () => {}}), /GitHub job HTTP 503/);
});

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

// A SYNTHETIC workflow with the same shape as build.yml's browser job. The
// real one is test/browser-gate-shards.test.mjs's business: judging it here
// too meant a gate added without a clause produced seven reds for one cause
// (main f80a4abe2, the two Pico gates), and a set-equality read for the worker.
const SYNTH_YML = [
    'jobs:', '  browser:', '    name: browser (${{ matrix.shard }})', '    strategy:', '      fail-fast: false', '      matrix:', '        shard: [heavy, light]', '    steps:',
    '      - name: Install', '      - name: Serve the built app', '        id: serve',
    '      - name: Browser gate — circuit UX', "        if: ${{ steps.serve.outcome == 'success' && matrix.shard == 'light' }}",
    '      - name: Browser gate — editor', "        if: ${{ steps.serve.outcome == 'success' && matrix.shard == 'light' }}",
    '      - name: Browser benchmark — 8086 desktop and mobile', "        if: ${{ steps.serve.outcome == 'success' && matrix.shard == 'heavy' }}",
    '      - name: Audit — every browser gate ran', '        if: always()', ''
].join('\n');
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
    const yml = SYNTH_YML;
    let s = sinks();
    let code = await run(async () => jobs, {jobName: 'browser', attempt: 1, shard: 'heavy', workflowText: yml}, {log: s.log, error: s.error});
    assert.equal(code, 1);
    assert.match(s.out.errors[0], /could not audit this run: expected exactly one job named "browser", found 0/);
    assert.doesNotMatch(s.out.errors.join('\n'), /skipped with no earlier failure/);
});

test('shard: the audit refuses a workflow whose clauses are not a partition, as a workflow defect, before judging any step', async () => {
    const yml = SYNTH_YML;
    const broken = yml.replace(" && matrix.shard == 'light' }}", ' }}'); // circuit UX loses its clause
    assert.notEqual(broken, yml, 'mutation anchor');
    const s = sinks();
    const code = await run(async () => { throw new Error('must not be reached'); }, {jobName: 'browser (heavy)', attempt: 1, shard: 'heavy', workflowText: broken}, {log: s.log, error: s.error});
    assert.equal(code, 1);
    assert.match(s.out.errors[0], /not a partition of the gates/);
    assert.match(s.out.errors[0], /no shard clause.*Browser gate — circuit UX/);
    const e = expectedForShard(yml, 'heavy');
    assert.ok(e.ok && e.mine.length === 1 && e.others.length === 2, `the synthetic workflow partitions: heavy ${e.mine.length}, others ${e.others.length}`);
});

test('shard: a gate elsewhere the API has not reported yet (null conclusion) is not a double run', () => {
    const steps = inHeavy.map(s => s.name === 'Browser gate — editor' ? {name: s.name, status: 'queued', conclusion: null} : s);
    assert.equal(judge(steps, undefined, heavyLeg).verdict, 'ok', 'run 34015453480: three light gates read null in the heavy leg and were called a double run');
});

test('the audit re-reads while a step before it is unreported, then judges the settled read', async () => {
    const settled = [{name: 'browser (heavy)', run_attempt: 1, steps: inHeavy}];
    const lagging = [{name: 'browser (heavy)', run_attempt: 1, steps: inHeavy.map(s => s.name === 'Browser gate — circuit UX' ? {name: s.name, status: 'in_progress', conclusion: null} : s)}];
    const yml = SYNTH_YML;
    let reads = 0;
    const slept = [];
    const s = sinks();
    const code = await run(async () => (++reads <= 2 ? lagging : settled), {jobName: 'browser (heavy)', attempt: 1, shard: 'heavy', workflowText: yml},
        {log: s.log, error: s.error, sleep: async ms => { slept.push(ms); }});
    assert.equal(code, 0, s.out.errors.join('\n'));
    assert.equal(reads, 3, 'two lagging reads, then the settled one');
    assert.deepEqual(slept, [10000, 10000]);
    assert.match(s.out.logs.join('\n'), /not yet reported complete/);
});

test('a step still unreported after the retries is an ABSENCE — red, never a finding', async () => {
    const lagging = [{name: 'browser (heavy)', run_attempt: 1, steps: inHeavy.map(s => s.name === 'Browser gate — circuit UX' ? {name: s.name, status: 'in_progress', conclusion: null} : s)}];
    const yml = SYNTH_YML;
    const s = sinks();
    const code = await run(async () => lagging, {jobName: 'browser (heavy)', attempt: 1, shard: 'heavy', workflowText: yml}, {log: s.log, error: s.error, sleep: async () => {}});
    assert.equal(code, 1);
    assert.match(s.out.errors[0], /could not audit this run: 1 step\(s\) still not reported complete/);
    assert.doesNotMatch(s.out.errors.join('\n'), /double run|skipped with no earlier failure/);
});

test('the re-read waits only on steps BEFORE the audit: the post-job steps the API lists after it are always queued while it runs', async () => {
    const withPost = [{name: 'browser (heavy)', run_attempt: 1, steps: [...inHeavy,
        {name: 'Post Run actions/setup-node@x', status: 'queued', conclusion: null},
        {name: 'Complete job', status: 'queued', conclusion: null}]}];
    const yml = SYNTH_YML;
    const slept = [];
    const s = sinks();
    const code = await run(async () => withPost, {jobName: 'browser (heavy)', attempt: 1, shard: 'heavy', workflowText: yml}, {log: s.log, error: s.error, sleep: async ms => { slept.push(ms); }});
    assert.equal(code, 0, s.out.errors.join('\n'));
    assert.deepEqual(slept, [], 'queued post-job steps must not trigger a single re-read');
});

test('a null step assigned ELSEWHERE triggers the re-read too (the loop is not narrowed to this leg)', async () => {
    const yml = SYNTH_YML;
    const lagging = [{name: 'browser (heavy)', run_attempt: 1, steps: inHeavy.map(s => s.name === 'Browser gate — editor' ? {name: s.name, status: 'queued', conclusion: null} : s)}];
    const settled = [{name: 'browser (heavy)', run_attempt: 1, steps: inHeavy}];
    let reads = 0;
    const s = sinks();
    const code = await run(async () => (++reads === 1 ? lagging : settled), {jobName: 'browser (heavy)', attempt: 1, shard: 'heavy', workflowText: yml}, {log: s.log, error: s.error, sleep: async () => {}});
    assert.equal(code, 0);
    assert.equal(reads, 2);
});
