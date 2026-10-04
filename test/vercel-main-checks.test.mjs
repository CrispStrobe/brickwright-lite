// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePushPaths} from '../scripts/lib/doc-triggers.mjs';
import {validationProblems, REQUIRED_BUILD_JOBS, githubPages, excludedDocumentation,
    documentationComparison, loadValidation} from '../scripts/verify-vercel-main-checks.mjs';
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

const base = 'b'.repeat(40);
const paths = parsePushPaths(readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8')).entries;
const comparison = (files = [{filename: 'docs/unused-validation-note.md', status: 'modified'}]) => ({
    status: 'ahead', base_commit: {sha: base}, merge_base_commit: {sha: base},
    total_commits: 1, commits: [{sha}], files
});
const ancestor = run('build', {head_sha: base});

test('inheritance uses ordered actual Build paths and only excluded unshipped Markdown', () => {
    for (const filename of ['LANES.md', 'README.md', 'docs/unused-validation-note.md']) {
        assert.equal(excludedDocumentation(filename, paths), true);
    }
    for (const filename of ['scripts/solver.mjs', 'vendor-pins.json', '.github/workflows/build.yml',
        'docs/generated/report.md', 'overlay/scratch-gui/examples/example/intro.md', 'unexcluded.md',
        '../README.md', 'docs/../README.md']) {
        assert.equal(excludedDocumentation(filename, paths), false, filename);
    }
    const reincluded = paths.filter(path => path.startsWith('docs/') && !path.includes('*'));
    assert.ok(reincluded.length > 0);
    for (const filename of reincluded) assert.equal(excludedDocumentation(filename, paths), false, filename);
    assert.equal(excludedDocumentation('docs/unused-validation-note.md', ['**', '!docs/*.md', 'docs/*.md']), false);
    assert.throws(() => excludedDocumentation('README.md', ['!README.md']), /inclusive/);
    assert.throws(() => excludedDocumentation('README.md', ['**', '!R?ADME.md']), /Unsupported/);
    assert.throws(() => excludedDocumentation('docs/unused.md', ['**', '!docs/*.md', 'docs/**/unused.md']), /Unsupported/);
});

test('complete ancestral comparison is required; rename cannot launder executable changes', () => {
    assert.equal(documentationComparison(comparison(), base, sha, paths), true);
    assert.equal(documentationComparison(comparison([{filename: 'README.md', previous_filename: 'LANES.md',
        status: 'renamed'}]), base, sha, paths), true);
    for (const value of [null, {...comparison(), status: 'diverged'}, {...comparison(), base_commit: {sha}},
        {...comparison(), merge_base_commit: {sha}}, {...comparison(), total_commits: 2},
        {...comparison(), total_commits: 250}, {...comparison(), commits: [{sha: base}]},
        {...comparison(), files: undefined}, {...comparison(), files: Array(300).fill(comparison().files[0])},
        comparison([{filename: 'README.md', previous_filename: 'src/solver.js', status: 'renamed'}]),
        comparison([{filename: 'README.md', status: 'renamed'}]),
        comparison([{filename: 'README.md', status: 'unknown'}]),
        comparison([{filename: 'vendor-pins.json', status: 'modified'}])]) {
        assert.equal(documentationComparison(value, base, sha, paths), false);
    }
});

function evidenceRequest ({current = [], previous = [ancestor], diff = comparison(), checkedJobs = jobs,
    history = [ancestor], denied = null} = {}) {
    const urls = [];
    const request = async url => {
        urls.push(url);
        if (denied && url.includes(denied)) return {ok: false, status: 403};
        let body;
        if (url.includes(`actions/runs?head_sha=${sha}`)) body = {workflow_runs: current};
        else if (url.includes(`actions/runs?head_sha=${base}`)) body = {workflow_runs: previous};
        else if (url.includes('actions/workflows/build.yml/runs?')) body = {workflow_runs: history};
        else if (url.includes('compare/')) body = diff;
        else if (url.includes('/jobs?')) body = {jobs: checkedJobs};
        else throw new Error(`Unexpected evidence request ${url}`);
        return {ok: true, json: async () => body};
    };
    return {request, urls};
}
const inspect = async (options, implementation = {loadValidation, validationProblems}) => {
    const mock = evidenceRequest(options);
    const result = await implementation.loadValidation('owner/repo', sha, 'synthetic-token', paths, mock.request);
    return {...result, urls: mock.urls, problems: implementation.validationProblems(result.runs, result.jobs, sha, result)};
};

test('filtered docs-only current main inherits full green push checks, never manual/PR checks', async () => {
    const result = await inspect({current: [run('vendor-freshness')]});
    assert.equal(result.buildSha, base);
    assert.deepEqual(result.problems, []);
    assert.ok(result.urls.some(url => url.includes(`compare/${base}...${sha}`)));
    assert.ok(result.urls.some(url => url.includes('actions/runs/1/jobs?')));
    for (const extra of [{event: 'workflow_dispatch'}, {event: 'pull_request'}, {head_branch: 'feature'}]) {
        assert.ok((await inspect({history: [{...ancestor, ...extra}]})).problems.length);
    }
});

test('present current Build and newer ancestor reruns cannot be hidden behind old success', async () => {
    for (const extra of [{status: 'in_progress', conclusion: null}, {conclusion: 'failure'}, {conclusion: 'cancelled'}]) {
        const current = await inspect({current: [run('build', extra)]});
        assert.equal(current.buildSha, sha);
        assert.ok(current.problems.length);
        assert.equal(current.urls.some(url => url.includes('compare/')), false);
        assert.ok((await inspect({previous: [ancestor, {...ancestor, ...extra, id: 2}]})).problems.length);
    }
});

test('inherited build still needs every real job and both heads applicable supporting checks', async () => {
    for (const job of jobs) {
        assert.ok((await inspect({checkedJobs: jobs.filter(value => value !== job)})).problems.length);
        assert.ok((await inspect({checkedJobs: jobs.map(value => value === job ? {...value, conclusion: 'skipped'} : value)})).problems.length);
    }
    for (const path of ['debugger', 'vendor-freshness']) {
        for (const checkSha of [sha, base]) {
            const failed = run(path, {head_sha: checkSha, conclusion: 'failure'});
            assert.ok((await inspect({current: checkSha === sha ? [failed] : [],
                previous: checkSha === base ? [ancestor, failed] : [ancestor]})).problems.length);
        }
    }
});

test('unsafe/truncated/missing comparisons and denied API authority fail closed', async () => {
    for (const diff of [comparison([{filename: 'src/solver.js', status: 'modified'}]), {},
        {...comparison(), files: Array(300).fill(comparison().files[0])}]) {
        assert.ok((await inspect({diff})).problems.length);
    }
    for (const denied of ['compare/', 'actions/workflows/', `head_sha=${base}`, '/jobs?']) {
        await assert.rejects(inspect({denied}), /403/);
    }
});

test('three executable security mutants fail their real admission assertions without touching source', async () => {
    const original = readFileSync(new URL('../scripts/verify-vercel-main-checks.mjs', import.meta.url), 'utf8');
    const mutant = async (anchor, replacement) => {
        assert.equal(original.split(anchor).length - 1, 1, 'mutation anchor must be unique');
        const source = original.replace(anchor, replacement).replace("'./lib/doc-triggers.mjs'",
            JSON.stringify(new URL('../scripts/lib/doc-triggers.mjs', import.meta.url).href));
        return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    };
    const rename = await mutant('excludedDocumentation(file.previous_filename, entries)', 'true');
    const laundered = comparison([{filename: 'README.md', previous_filename: 'src/solver.js', status: 'renamed'}]);
    assert.throws(() => assert.equal(rename.documentationComparison(laundered, base, sha, paths), false),
        assert.AssertionError, 'source-to-doc rename mutant must red');
    const bypass = await mutant('if (!build) {', 'if (true) {');
    const hidden = await inspect({current: [run('build', {conclusion: 'failure'})]}, bypass);
    assert.throws(() => assert.ok(hidden.problems.length > 0), assert.AssertionError,
        'failed-current-build bypass mutant must red');
    const omitted = await mutant("if (!job || job.status !== 'completed' || job.conclusion !== 'success')", 'if (false)');
    const missing = await inspect({checkedJobs: []}, omitted);
    assert.throws(() => assert.ok(missing.problems.length > 0), assert.AssertionError,
        'missing-browser-job bypass mutant must red');
    assert.equal(readFileSync(new URL('../scripts/verify-vercel-main-checks.mjs', import.meta.url), 'utf8'), original);
});
