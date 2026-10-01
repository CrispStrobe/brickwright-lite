// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {pathToFileURL} from 'node:url';

export const REQUIRED_BUILD_JOBS = ['build', 'browser (light)', 'browser (heavy)', 'corpus', 'fpga surface (flag-on)'];

export function validationProblems (runs, jobs, sha) {
    const problems = [];
    const latest = path => runs.filter(run => run.path === path && run.head_sha === sha &&
        run.head_branch === 'main' && run.event === 'push').sort((a, b) => b.id - a.id)[0];
    const build = latest('.github/workflows/build.yml');
    if (!build || build.status !== 'completed' || build.conclusion !== 'success') problems.push('main build has not succeeded');
    for (const name of REQUIRED_BUILD_JOBS) {
        const job = jobs.find(job => job.name === name);
        if (!job || job.status !== 'completed' || job.conclusion !== 'success') problems.push(`${name} has not succeeded`);
    }
    // These workflows have path filters. Require success when present at this
    // commit; their absence does not invent a required check for unrelated edits.
    for (const path of ['.github/workflows/debugger.yml', '.github/workflows/vendor-freshness.yml']) {
        const run = latest(path);
        if (run && (run.status !== 'completed' || run.conclusion !== 'success')) problems.push(`${path} has not succeeded`);
    }
    return problems;
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
    const runs = await githubPages(repo, `actions/runs?head_sha=${sha}`, 'workflow_runs', token);
    const build = runs.filter(run => run.path === '.github/workflows/build.yml' && run.event === 'push' && run.head_branch === 'main')
        .sort((a, b) => b.id - a.id)[0];
    const jobs = build ? await githubPages(repo, `actions/runs/${build.id}/jobs?filter=latest`, 'jobs', token) : [];
    const problems = validationProblems(runs, jobs, sha);
    if (process.argv.includes('--eligibility')) {
        console.log(`ready=${problems.length === 0}`);
        if (problems.length) console.error(`Production job skipped while validation is incomplete: ${problems.join('; ')}`);
        process.exit(0);
    }
    if (problems.length) throw new Error(`Refusing production publication of ${sha}: ${problems.join('; ')}`);
    console.log(`Validated main ${sha}: complete build and all applicable supporting workflows succeeded`);
}
