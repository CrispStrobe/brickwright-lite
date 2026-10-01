// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {execFileSync} from 'node:child_process';
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const sha = process.argv[2], repo = process.env.GITHUB_REPOSITORY;
    if (!/^[a-f0-9]{40}$/.test(sha || '') || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('commit and GITHUB_REPOSITORY are required');
    const api = endpoint => JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repo}/${endpoint}`], {encoding: 'utf8'}));
    const runs = api(`actions/runs?head_sha=${sha}&per_page=100`).flatMap(page => page.workflow_runs);
    const build = runs.filter(run => run.path === '.github/workflows/build.yml' && run.event === 'push' && run.head_branch === 'main')
        .sort((a, b) => b.id - a.id)[0];
    const jobs = build ? api(`actions/runs/${build.id}/jobs?filter=latest&per_page=100`).flatMap(page => page.jobs) : [];
    const problems = validationProblems(runs, jobs, sha);
    if (problems.length) throw new Error(`Refusing production publication of ${sha}: ${problems.join('; ')}`);
    console.log(`Validated main ${sha}: complete build and all applicable supporting workflows succeeded`);
}
