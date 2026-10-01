// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validationProblems, REQUIRED_BUILD_JOBS, githubPages} from '../scripts/verify-vercel-main-checks.mjs';
const sha = 'a'.repeat(40);
const run = (path, extra = {}) => ({id: 1, path: `.github/workflows/${path}.yml`, head_sha: sha,
    head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', ...extra});
const jobs = REQUIRED_BUILD_JOBS.map(name => ({name, status: 'completed', conclusion: 'success'}));
test('only the exact successful main build is accepted', () => {
    assert.deepEqual(validationProblems([run('build')], jobs, sha), []);
    for (const extra of [{head_sha: 'b'.repeat(40)}, {head_branch: 'feature'}, {event: 'pull_request'},
        {status: 'in_progress'}, {conclusion: 'failure'}]) {
        assert.ok(validationProblems([run('build', extra)], jobs, sha).length);
    }
});
test('superseded, missing and failed browser/FPGA checks cannot publish', () => {
    for (const job of jobs) for (const conclusion of ['skipped', 'failure', 'cancelled']) {
        assert.ok(validationProblems([run('build')], jobs.map(value => value === job ? {...value, conclusion} : value), sha).length);
    }
    assert.ok(validationProblems([run('build')], jobs.slice(1), sha).length);
});
test('supporting checks must pass when applicable and the newest rerun wins', () => {
    for (const path of ['debugger', 'vendor-freshness']) {
        assert.deepEqual(validationProblems([run('build'), run(path)], jobs, sha), []);
        assert.ok(validationProblems([run('build'), run(path, {conclusion: 'failure'})], jobs, sha).length);
        assert.ok(validationProblems([run('build'), run(path), run(path, {id: 2, status: 'in_progress', conclusion: null})], jobs, sha).length);
    }
});

test('validation fetches all API pages and fails on denied or malformed evidence', async () => {
    const urls = [];
    const records = await githubPages('owner/repo', 'actions/runs?head_sha=abc', 'workflow_runs', 'synthetic-token',
        async (url, options) => {
            urls.push(url);
            assert.equal(options.headers.authorization, 'Bearer synthetic-token');
            return {ok: true, json: async () => ({workflow_runs: urls.length === 1 ? Array(100).fill({id: 1}) : [{id: 2}]})};
        });
    assert.equal(records.length, 101);
    assert.ok(urls[1].endsWith('per_page=100&page=2'));
    await assert.rejects(githubPages('owner/repo', 'actions/runs?head_sha=abc', 'workflow_runs', 'synthetic-token',
        async () => ({ok: false, status: 403})), /403/);
    await assert.rejects(githubPages('owner/repo', 'actions/runs?head_sha=abc', 'workflow_runs', 'synthetic-token',
        async () => ({ok: true, json: async () => ({})})), /missing/);
});
