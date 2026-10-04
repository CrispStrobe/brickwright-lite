// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {parsePushPaths} from './lib/doc-triggers.mjs';

export const REQUIRED_BUILD_JOBS = ['build', 'browser (light)', 'browser (heavy)', 'corpus', 'fpga surface (flag-on)'];

const latestPush = (runs, path, sha) => runs.filter(run => run.path === path && run.head_sha === sha &&
    run.head_branch === 'main' && run.event === 'push').sort((a, b) => b.id - a.id)[0];

export function validationProblems (runs, jobs, sha, {buildSha = sha} = {}) {
    const problems = [];
    const build = latestPush(runs, '.github/workflows/build.yml', buildSha);
    if (!build || build.status !== 'completed' || build.conclusion !== 'success') problems.push('main build has not succeeded');
    for (const name of REQUIRED_BUILD_JOBS) {
        const job = jobs.find(job => job.name === name);
        if (!job || job.status !== 'completed' || job.conclusion !== 'success') problems.push(`${name} has not succeeded`);
    }
    // These workflows have path filters. Require success when present at this
    // commit; their absence does not invent a required check for unrelated edits.
    for (const checkSha of new Set([sha, buildSha])) {
        for (const path of ['.github/workflows/debugger.yml', '.github/workflows/vendor-freshness.yml']) {
            const run = latestPush(runs, path, checkSha);
            if (run && (run.status !== 'completed' || run.conclusion !== 'success')) problems.push(`${path} has not succeeded`);
        }
    }
    return problems;
}

// Deliberately narrower than a general glob engine: only the existing workflow's
// simple ordered path patterns, and only unshipped root/top-level Markdown.
// Unsupported policy syntax fails closed rather than guessing its meaning.
export function excludedDocumentation (filename, entries) {
    if (typeof filename !== 'string' || !/^(?:[^/]+|docs\/[^/]+)\.md$/.test(filename) ||
        filename.includes('..') || filename.includes('\\')) return false;
    if (entries[0] !== '**') throw new Error('Build paths must start with the inclusive ** rule');
    let included = true;
    for (const entry of entries) {
        const pattern = entry.startsWith('!') ? entry.slice(1) : entry;
        if (!/^[\w./*-]+$/.test(pattern) ||
            (pattern.includes('*') && pattern !== '**' && pattern !== 'docs/*.md')) {
            throw new Error('Unsupported Build path pattern');
        }
        const matches = pattern === '**' || (pattern === 'docs/*.md' ? /^docs\/[^/]+\.md$/.test(filename) : filename === pattern);
        if (matches) included = !entry.startsWith('!');
    }
    return !included;
}

export function documentationComparison (comparison, base, sha, entries) {
    // GitHub caps comparison files at 300 and commits at 250. Reject even the
    // boundary rather than accepting a potentially truncated authority receipt.
    if (comparison?.status !== 'ahead' || comparison.base_commit?.sha !== base ||
        comparison.merge_base_commit?.sha !== base || !Number.isInteger(comparison.total_commits) ||
        comparison.total_commits < 1 || comparison.total_commits >= 250 ||
        !Array.isArray(comparison.commits) || comparison.commits.length !== comparison.total_commits ||
        comparison.commits.at(-1)?.sha !== sha || !Array.isArray(comparison.files) ||
        comparison.files.length >= 300) return false;
    return comparison.files.every(file => ['added', 'modified', 'removed', 'renamed'].includes(file.status) &&
        excludedDocumentation(file.filename, entries) &&
        (file.status !== 'renamed' || (typeof file.previous_filename === 'string' &&
            excludedDocumentation(file.previous_filename, entries))));
}

async function githubJson (repo, endpoint, token, request) {
    const response = await request(`https://api.github.com/repos/${repo}/${endpoint}`, {
        headers: {authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28'},
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`GitHub validation API returned ${response.status}`);
    return response.json();
}

export async function loadValidation (repo, sha, token, entries, request = fetch) {
    const runs = await githubPages(repo, `actions/runs?head_sha=${sha}`, 'workflow_runs', token, request);
    let buildSha = sha;
    let build = latestPush(runs, '.github/workflows/build.yml', sha);
    // Never hide a present pending/failed/cancelled current-main Build behind
    // historical green checks. Inheritance is only for a filtered-out Build.
    if (!build) {
        const history = await githubJson(repo,
            'actions/workflows/build.yml/runs?branch=main&event=push&status=success&per_page=10', token, request);
        if (!Array.isArray(history.workflow_runs)) throw new Error('GitHub validation response is missing its records');
        for (const candidate of history.workflow_runs.sort((a, b) => b.id - a.id)) {
            if (candidate.path !== '.github/workflows/build.yml' || candidate.head_branch !== 'main' ||
                candidate.event !== 'push' || candidate.status !== 'completed' || candidate.conclusion !== 'success' ||
                !/^[a-f0-9]{40}$/.test(candidate.head_sha || '') || candidate.head_sha === sha) continue;
            const comparison = await githubJson(repo, `compare/${candidate.head_sha}...${sha}`, token, request);
            if (!documentationComparison(comparison, candidate.head_sha, sha, entries)) continue;
            const ancestorRuns = await githubPages(repo, `actions/runs?head_sha=${candidate.head_sha}`,
                'workflow_runs', token, request);
            // Re-read all runs: a newer failed/pending ancestor rerun must win
            // over the success-filtered discovery record.
            build = latestPush(ancestorRuns, '.github/workflows/build.yml', candidate.head_sha);
            runs.push(...ancestorRuns);
            buildSha = candidate.head_sha;
            break;
        }
    }
    const jobs = build ? await githubPages(repo, `actions/runs/${build.id}/jobs?filter=latest`, 'jobs', token, request) : [];
    return {runs, jobs, buildSha};
}

export async function githubPages (repo, endpoint, key, token, request = fetch) {
    const items = [];
    for (let page = 1; page <= 100; page++) {
        const response = await request(`https://api.github.com/repos/${repo}/${endpoint}&per_page=100&page=${page}`, {
            headers: {authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28'},
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`GitHub validation API returned ${response.status}`);
        const body = await response.json();
        if (!Array.isArray(body[key])) throw new Error('GitHub validation response is missing its records');
        items.push(...body[key]);
        if (body[key].length < 100) return items;
    }
    throw new Error('GitHub validation pagination limit exceeded');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const sha = process.argv[2], repo = process.env.GITHUB_REPOSITORY;
    if (!/^[a-f0-9]{40}$/.test(sha || '') || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('commit and GITHUB_REPOSITORY are required');
    const token = process.env.GH_TOKEN;
    if (!token) throw new Error('GH_TOKEN is required for validation');
    const policy = parsePushPaths(readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8'));
    if (policy.hasPathsIgnore || !policy.entries.length) throw new Error('Unsupported Build paths policy');
    const {runs, jobs, buildSha} = await loadValidation(repo, sha, token, policy.entries);
    const problems = validationProblems(runs, jobs, sha, {buildSha});
    if (process.argv.includes('--eligibility')) {
        console.log(`ready=${problems.length === 0}`);
        if (problems.length) console.error(`Production job skipped while validation is incomplete: ${problems.join('; ')}`);
        process.exit(0);
    }
    if (problems.length) throw new Error(`Refusing production publication of ${sha}: ${problems.join('; ')}`);
    console.log(`Validated main ${sha}: complete push build ${buildSha} and all applicable supporting workflows succeeded`);
}
