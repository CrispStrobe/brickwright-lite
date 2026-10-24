import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {metrics, LIMITS} from '../scripts/lib/ci-run-metrics-windowed.mjs';

const start = '2026-01-01T00:00:00Z';
const later = seconds => new Date(Date.parse(start) + seconds * 1000).toISOString();
const run = {id: 42, name: 'Build', created_at: start, conclusion: 'failure'};
const step = (name = 'ordinary', completed = 20, conclusion = 'success') =>
    ({name, conclusion, started_at: later(1), completed_at: later(completed)});
const job = (id = 1, steps = [], conclusion = 'success') =>
    ({id, run_id: 42, name: `job-${id}`, conclusion, started_at: later(10), completed_at: later(131), steps});
const raw = value => Buffer.from(JSON.stringify(value));
const report = jobs => metrics(raw(run), raw({total_count: jobs.length, jobs}));
async function cli(script, jobs) {
    const dir = await mkdtemp(join(process.cwd(), '.ci-metrics-controls-'));
    try {
        await writeFile(join(dir, 'run.json'), raw(run));
        await writeFile(join(dir, 'jobs.json'), raw({total_count: jobs.length, jobs}));
        return spawnSync(process.execPath, [script, '--run', join(dir, 'run.json'), '--jobs', join(dir, 'jobs.json')],
            {encoding: 'utf8', env: {...process.env, GITHUB_STEP_SUMMARY: ''}});
    } finally { await rm(dir, {recursive: true, force: true}); }
}

test('windowed report agrees with the actual legacy CLI on every existing metric', async () => {
    const jobs = [job(1, [step('debugger contract', 35), step('install', 90)]),
        job(2, [step('debug smoke failure', 41, 'failure')], 'failure'),
        job(3, [step('debug reverse cancelled', 45, 'cancelled')], 'cancelled')];
    jobs[1].completed_at = later(71); // 61 seconds, billed independently.
    jobs[2].completed_at = later(9); // Actual GitHub metadata can have clock skew.
    const result = await cli('scripts/report-ci-run-metrics.mjs', jobs);
    assert.equal(result.status, 0, result.stderr);
    const original = JSON.parse(result.stdout); const next = report(jobs);
    for (const key of Object.keys(original).filter(key => key !== 'schema')) assert.deepEqual(next[key], original[key], key);
    assert.deepEqual(next.coverage, {unmeasuredJobIds: [], clampedNegativeJobIds: [3]});
    assert.equal(next.jobs.length, 3);
    assert.equal(next.runnerSeconds, 182);
    assert.equal(next.billedRunnerMinutes, 5);
    assert.equal(next.debuggerVerdicts.length, 3);
    const output = await cli('scripts/report-ci-run-metrics-windowed.mjs', jobs);
    assert.equal(output.status, 0, output.stderr);
    assert.deepEqual(JSON.parse(output.stdout), next);
});

test('late windows contribute the earliest verdict without multiplying job costs', async () => {
    const steps = Array.from({length: 401}, () => step());
    steps[0] = step('debugger early window', 90);
    steps[200] = step('debugger middle window', 80, 'failure');
    steps[400] = step('debugger late window', 35, 'cancelled');
    const jobs = [job(1, steps, 'cancelled')]; const next = report(jobs);
    assert.deepEqual(next.counts, {jobs: 1, steps: 401, windows: 3});
    assert.deepEqual(next.windows, [{jobId: 1, offset: 0, count: 200},
        {jobId: 1, offset: 200, count: 200}, {jobId: 1, offset: 400, count: 1}]);
    assert.equal(next.firstDebuggerVerdict.step, 'debugger late window');
    assert.equal(next.firstDebuggerVerdict.millisecondsFromRunCreation, 35000);
    assert.equal(next.debuggerVerdicts.length, 3);
    assert.equal(next.runnerSeconds, 121);
    assert.equal(next.billedRunnerMinutes, 3);
    const original = await cli('scripts/report-ci-run-metrics.mjs', jobs);
    assert.notEqual(original.status, 0);
    assert.match(original.stderr, /exceeds its step bound/);
});

test('job-level verdicts and absent duration witnesses retain legacy meaning', () => {
    const missing = job(2); missing.started_at = null; missing.completed_at = null;
    const whole = job(1); whole.name = 'debug history'; whole.completed_at = later(40);
    const next = report([whole, missing]);
    assert.equal(next.firstDebuggerVerdict.step, null);
    assert.equal(next.firstDebuggerVerdict.millisecondsFromRunCreation, 40000);
    assert.deepEqual(next.coverage.unmeasuredJobIds, [2]);
    assert.equal(next.jobs[1].runnerSeconds, 0);
    assert.deepEqual(next.counts, {jobs: 2, steps: 0, windows: 0});
});

test('byte, job and global window bounds reject complete overflows', () => {
    assert.throws(() => metrics(Buffer.alloc(LIMITS.inputBytes + 1), raw({total_count: 0, jobs: []})), /byte bound/);
    assert.throws(() => report(Array.from({length: 1001}, (_, i) => job(i + 1))), /jobs exceed/);
    const jobs = Array.from({length: 1000}, (_, i) => job(i + 1, [step()]));
    jobs[0].steps = Array.from({length: 201}, () => step());
    assert.throws(() => report(jobs), /step\/window union exceeds/);
    jobs[0].steps = [step()];
    assert.equal(report(jobs).counts.windows, 1000);
});

test('complete byte digests bind whitespace as well as parsed metadata', () => {
    const payload = raw({total_count: 0, jobs: []});
    const first = metrics(raw(run), payload);
    const second = metrics(Buffer.concat([raw(run), Buffer.from('\n')]), payload);
    assert.notEqual(first.inputs.runSha256, second.inputs.runSha256);
    assert.equal(first.inputs.jobsSha256, second.inputs.jobsSha256);
    const padded = Buffer.concat([payload, Buffer.alloc(LIMITS.inputBytes - payload.length, 32)]);
    assert.deepEqual(metrics(raw(run), padded).counts, {jobs: 0, steps: 0, windows: 0});
});

test('pagination, duplicate jobs, missing counts and malformed metadata refuse', () => {
    for (const count of [undefined, null, -1, 0.5, '1', 2]) {
        assert.throws(() => metrics(raw(run), raw({total_count: count, jobs: [job()]})), /total_count/);
    }
    assert.throws(() => metrics(raw(run), raw([job()])), /complete jobs object/);
    assert.throws(() => report([job(), job()]), /unique positive integer id/);
    assert.throws(() => report([{...job(), run_id: 43}]), /job\/run identity mismatch/);
    for (const bad of [null, {...job(), steps: null}, {...job(), name: 3}, {...job(), started_at: 'invalid'},
        {...job(), steps: [{name: 'debugger', conclusion: 'success'}]},
        {...job(), steps: [{...step(), completed_at: 42}]}]) assert.throws(() => report([bad]));
    assert.throws(() => metrics(raw({...run, created_at: 'invalid'}), raw({total_count: 0, jobs: []})), /created_at/);
});

test('workflow selects the explicit bounded profile and preserves single-request inputs', async () => {
    const workflow = await readFile('.github/workflows/ci-metrics.yml', 'utf8');
    assert.match(workflow, /node scripts\/report-ci-run-metrics-windowed\.mjs --run run\.json --jobs jobs\.json/);
    assert.equal((workflow.match(/gh api /g) || []).length, 1);
    assert.match(workflow, /jobs\?per_page=100/);
    const legacy = await readFile('scripts/report-ci-run-metrics.mjs', 'utf8');
    assert.match(legacy, /const MAX_STEPS = 200;/);
    assert.match(legacy, /steps\.length > MAX_STEPS/);
});

test('CLI bounds the actual file read before JSON parsing or writing a report', async () => {
    const dir = await mkdtemp(join(process.cwd(), '.ci-metrics-input-cap-'));
    try {
        const runPath = join(dir, 'oversize.json'); const jobsPath = join(dir, 'jobs.json');
        const outputPath = join(dir, 'report.json');
        await writeFile(runPath, Buffer.alloc(LIMITS.inputBytes + 1, 32));
        await writeFile(jobsPath, raw({total_count: 0, jobs: []}));
        const result = spawnSync(process.execPath, ['scripts/report-ci-run-metrics-windowed.mjs',
            '--run', runPath, '--jobs', jobsPath, '--output', outputPath],
        {encoding: 'utf8', env: {...process.env, GITHUB_STEP_SUMMARY: ''}});
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /input exceeds byte bound/);
        assert.equal(result.stdout, '');
        await assert.rejects(readFile(outputPath), {code: 'ENOENT'});
    } finally { await rm(dir, {recursive: true, force: true}); }
});
