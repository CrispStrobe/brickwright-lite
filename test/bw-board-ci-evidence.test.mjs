import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {REQUIRED_BW_BOARD_JOBS, verifyBwBoardCi} from '../scripts/verify-bw-board-ci.mjs';

const SHA = 'a'.repeat(40);
const response = (body, status = 200, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {get: name => headers[name.toLowerCase()] ?? null},
    json: async () => body,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body)
});

const successfulRun = (id = 42) => ({
    id, run_number: id, run_attempt: 1, head_sha: SHA, status: 'completed', conclusion: 'success',
    path: '.github/workflows/ci.yml', html_url: `https://example.test/run/${id}`
});
const successfulJobs = () => Object.entries(REQUIRED_BW_BOARD_JOBS).map(([name, steps], i) => ({
    id: i + 1, name, head_sha: SHA, status: 'completed', conclusion: 'success',
    html_url: `https://example.test/job/${name}`,
    steps: steps.map(step => ({name: step, status: 'completed', conclusion: 'success'}))
}));

function fakeGitHub({runs = [successfulRun()], jobs = successfulJobs(), intercept} = {}) {
    const calls = [];
    const fetchImpl = async url => {
        calls.push(url);
        const custom = intercept?.(url, calls.length);
        if (custom) return custom;
        if (url.includes('/workflows/ci.yml/runs?')) return response({total_count: runs.length, workflow_runs: runs});
        if (url.includes('/jobs?')) return response({total_count: jobs.length, jobs});
        throw new Error(`unexpected URL ${url}`);
    };
    return {fetchImpl, calls};
}

test('accepts the exact pin only when every required upstream job and step is green', async () => {
    const gh = fakeGitHub();
    const result = await verifyBwBoardCi({sha: SHA, fetchImpl: gh.fetchImpl, log: () => {}});
    assert.equal(result.run.id, 42);
    assert.deepEqual(result.jobs.map(job => job.name), Object.keys(REQUIRED_BW_BOARD_JOBS));
    assert.equal(gh.calls.length, 2, 'the normal verification costs two API requests');
});

test('a later failed rerun does not erase an earlier valid immutable-SHA receipt', async () => {
    const runs = [{...successfulRun(44), conclusion: 'failure'}, successfulRun(43)];
    const result = await verifyBwBoardCi({...fakeGitHub({runs}), sha: SHA, log: () => {}});
    assert.equal(result.run.id, 43);
});

test('refuses a wrong SHA or a missing, duplicate, skipped, or hollow required job', async t => {
    const cases = {
        'wrong job SHA': successfulJobs().map((job, i) => i ? job : {...job, head_sha: 'b'.repeat(40)}),
        'missing job': successfulJobs().slice(1),
        'duplicate job': [...successfulJobs(), successfulJobs()[0]],
        'skipped job': successfulJobs().map((job, i) => i ? job : {...job, conclusion: 'skipped'}),
        'missing step': successfulJobs().map((job, i) => i ? job : {...job, steps: []})
    };
    for (const [name, jobs] of Object.entries(cases)) {
        await t.test(name, async () => {
            await assert.rejects(verifyBwBoardCi({sha: SHA, ...fakeGitHub({jobs}), log: () => {}}),
                /lack the required evidence/);
        });
    }
    await assert.rejects(verifyBwBoardCi({sha: 'short', ...fakeGitHub(), log: () => {}}), /40-hex/);
});

test('uses an older qualifying run when a newer successful run has incomplete jobs', async () => {
    const runs = [successfulRun(44), successfulRun(43)];
    const complete = successfulJobs();
    const fetchImpl = async url => {
        if (url.includes('/workflows/')) return response({total_count: 2, workflow_runs: runs});
        const jobs = url.includes('/runs/44/') ? complete.slice(1) : complete;
        return response({total_count: jobs.length, jobs});
    };
    const result = await verifyBwBoardCi({sha: SHA, fetchImpl, log: () => {}});
    assert.equal(result.run.id, 43);
});

test('API absence and malformed data fail closed, while transient failures retry', async () => {
    await assert.rejects(verifyBwBoardCi({sha: SHA,
        fetchImpl: async () => response('gone', 404), sleep: async () => {}, log: () => {}}),
    /could not obtain.*404/);
    await assert.rejects(verifyBwBoardCi({sha: SHA,
        fetchImpl: async () => response({}, 200), log: () => {}}), /unexpected schema/);

    let calls = 0;
    const good = fakeGitHub();
    const fetchImpl = async url => {
        calls++;
        if (calls === 1) return response('busy', 503);
        return good.fetchImpl(url);
    };
    await verifyBwBoardCi({sha: SHA, fetchImpl, sleep: async () => {}, log: () => {}});
    assert.equal(calls, 3);
});

test('rate limiting honors a short retry-after and reports a distant reset without sleeping', async () => {
    let calls = 0;
    const good = fakeGitHub();
    const delays = [];
    const fetchImpl = async url => {
        calls++;
        if (calls === 1) return response('limited', 429, {'retry-after': '2'});
        return good.fetchImpl(url);
    };
    await verifyBwBoardCi({sha: SHA, fetchImpl, sleep: async ms => delays.push(ms), log: () => {}});
    assert.deepEqual(delays, [2000]);

    await assert.rejects(verifyBwBoardCi({sha: SHA,
        fetchImpl: async () => response('limited', 403,
            {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '200'}),
        now: () => 100_000, sleep: async () => assert.fail('must not sleep past the bounded release wait'),
        log: () => {}}), /retry window is 100s away/);
});

test('networked production paths verify evidence before vendoring or building', () => {
    const build = fs.readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
    const vercel = fs.readFileSync(new URL('../scripts/vercel-build.sh', import.meta.url), 'utf8');
    const release = fs.readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
    const mobile = fs.readFileSync(new URL('../.github/workflows/mobile.yml', import.meta.url), 'utf8');
    assert.ok(build.indexOf('npm run verify:bwboard-ci') < build.indexOf('npm run vendor'));
    assert.ok(vercel.indexOf('npm run verify:bwboard-ci') < vercel.indexOf('node scripts/vendor.mjs'));
    assert.match(release, /bash scripts\/vercel-build\.sh/);
    assert.match(mobile, /bash scripts\/vercel-build\.sh/);
});
