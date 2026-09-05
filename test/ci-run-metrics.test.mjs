import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('CI metrics report exact runner duration and earliest terminal debugger verdict offline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bw-ci-metrics-'));
    const run = join(dir, 'run.json'); const jobs = join(dir, 'jobs.json'); const output = join(dir, 'out.json');
    await writeFile(run, JSON.stringify({id: 42, name: 'Build', created_at: '2026-01-01T00:00:00Z', conclusion: 'success'}));
    await writeFile(jobs, JSON.stringify({jobs: [
        {id: 1, name: 'build', conclusion: 'success', started_at: '2026-01-01T00:00:10Z',
            completed_at: '2026-01-01T00:02:11Z', steps: [
                {name: 'Fast debugger contract verdict', conclusion: 'success', completed_at: '2026-01-01T00:00:35Z'},
                {name: 'Install', conclusion: 'success', completed_at: '2026-01-01T00:01:30Z'}]},
        {id: 2, name: 'corpus', conclusion: 'success', started_at: '2026-01-01T00:00:20Z',
            completed_at: '2026-01-01T00:01:21Z', steps: []}
    ]}));
    const result = spawnSync(process.execPath, ['scripts/report-ci-run-metrics.mjs',
        '--run', run, '--jobs', jobs, '--output', output], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.runnerSeconds, 182);
    assert.equal(report.billedRunnerMinutes, 5, 'billing rounds each runner job independently');
    assert.equal(report.firstDebuggerVerdict.millisecondsFromRunCreation, 35_000);
    assert.equal(report.firstDebuggerVerdict.step, 'Fast debugger contract verdict');
});

test('CI metrics reject unbounded job metadata before processing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bw-ci-metrics-bound-'));
    const run = join(dir, 'run.json'); const jobs = join(dir, 'jobs.json');
    await writeFile(run, JSON.stringify({created_at: '2026-01-01T00:00:00Z'}));
    await writeFile(jobs, JSON.stringify({jobs: Array.from({length: 1001}, (_, id) => ({id}))}));
    const result = spawnSync(process.execPath, ['scripts/report-ci-run-metrics.mjs',
        '--run', run, '--jobs', jobs], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exceeds its bound/);
});
