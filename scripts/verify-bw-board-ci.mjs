#!/usr/bin/env node
/**
 * Verify that Lite's exact vendored bw-board commit has green upstream evidence.
 *
 * This deliberately reads GitHub's run record instead of re-running the large
 * vector and program corpora. It belongs in networked CI/release builds, not in
 * `npm test` or the offline-capable local build.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPO = 'CrispStrobe/bw-board';
const WORKFLOW = 'ci.yml';
const API = `https://api.github.com/repos/${REPO}`;
const FULL_SHA = /^[0-9a-f]{40}$/;

export const REQUIRED_BW_BOARD_JOBS = Object.freeze({
    test: ['Test'],
    vectors: [
        'The vectors are actually here',
        'MOO reader agrees with the JSON encoding',
        '8086 core — all 646,000 vectors',
        '8086 disassembler — all 646,000, on text and length'
    ],
    corpus: [
        'The corpus is actually here',
        'The harness can tell the verdicts apart',
        '525 programs, assembled and run'
    ],
    vectors186: [
        'The v20 vectors are actually here',
        '80186 core — the fifteen added opcodes',
        '80186 disassembler — on text and length'
    ]
});

export function pinnedBwBoardSha(pinsFile = path.join(ROOT, 'vendor-pins.json')) {
    let pins;
    try {
        pins = JSON.parse(fs.readFileSync(pinsFile, 'utf8'));
    } catch (error) {
        throw new Error(`cannot read ${path.relative(ROOT, pinsFile)}: ${error.message}`);
    }
    const sha = pins['bw-board'];
    if (!FULL_SHA.test(sha || '')) {
        throw new Error(`vendor-pins.json bw-board pin is ${JSON.stringify(sha)}, not a lowercase 40-hex commit SHA`);
    }
    return sha;
}

const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryDelay(response, attempt, now) {
    const retryAfterHeader = response.headers?.get?.('retry-after');
    const retryAfter = Number(retryAfterHeader);
    if (retryAfterHeader != null && Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
    const remaining = response.headers?.get?.('x-ratelimit-remaining');
    const reset = Number(response.headers?.get?.('x-ratelimit-reset'));
    if (remaining === '0' && Number.isFinite(reset)) return Math.max(0, reset * 1000 - now());
    return attempt * 2000;
}

async function githubJson(url, {
    fetchImpl, token, sleep, now, attempts = 4
}) {
    const headers = {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'brickwright-lite-bw-board-evidence'
    };
    if (token) headers.authorization = `Bearer ${token}`;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        let response;
        try {
            response = await fetchImpl(url, {headers, signal: AbortSignal.timeout(15_000)});
        } catch (error) {
            if (attempt === attempts) throw new Error(`could not obtain upstream CI evidence: ${error.message}`);
            await sleep(attempt * 2000);
            continue;
        }
        if (response.ok) {
            try {
                return await response.json();
            } catch (error) {
                throw new Error(`GitHub returned malformed JSON for ${url}: ${error.message}`);
            }
        }

        const limited = response.status === 429 ||
            (response.status === 403 && (response.headers?.get?.('retry-after') != null ||
                response.headers?.get?.('x-ratelimit-remaining') === '0'));
        const transient = limited || response.status >= 500;
        const detail = await response.text().catch(() => '');
        const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
        if (!transient || attempt === attempts) {
            throw new Error(`could not obtain upstream CI evidence: GitHub HTTP ${response.status}${suffix}`);
        }
        const delay = retryDelay(response, attempt, now);
        // A release runner should not sit silently until a distant quota reset.
        // Fail with the reset time; rerunning after it is both faster and faithful
        // to GitHub's instruction not to keep making requests while limited.
        if (delay > 30_000) {
            throw new Error(`could not obtain upstream CI evidence: GitHub HTTP ${response.status}; ` +
                `retry window is ${Math.ceil(delay / 1000)}s away`);
        }
        await sleep(delay);
    }
    throw new Error('could not obtain upstream CI evidence');
}

async function paged(url, key, options) {
    const values = [];
    for (let page = 1; page <= 10; page++) {
        const join = url.includes('?') ? '&' : '?';
        const json = await githubJson(`${url}${join}per_page=100&page=${page}`, options);
        if (!Array.isArray(json[key]) || !Number.isInteger(json.total_count)) {
            throw new Error(`GitHub ${key} response has an unexpected schema`);
        }
        values.push(...json[key]);
        if (values.length >= json.total_count || json[key].length < 100) return values;
    }
    throw new Error(`GitHub ${key} response exceeded 1,000 records; refusing a partial search`);
}

function verifyJob(job, name, requiredSteps, sha) {
    if (job.head_sha !== sha) return `${name}: job SHA is ${job.head_sha || 'absent'}`;
    if (job.status !== 'completed' || job.conclusion !== 'success') {
        return `${name}: ${job.status || 'unknown'}/${job.conclusion || 'no conclusion'}`;
    }
    if (!Array.isArray(job.steps)) return `${name}: steps are absent`;
    for (const stepName of requiredSteps) {
        const found = job.steps.filter(step => step.name === stepName);
        if (found.length !== 1) return `${name}: required step ${JSON.stringify(stepName)} appears ${found.length} times`;
        if (found[0].status !== 'completed' || found[0].conclusion !== 'success') {
            return `${name}: step ${JSON.stringify(stepName)} is ${found[0].status}/${found[0].conclusion}`;
        }
    }
    return null;
}

export async function verifyBwBoardCi({
    sha = pinnedBwBoardSha(),
    fetchImpl = globalThis.fetch,
    token = process.env.BW_BOARD_CI_TOKEN || process.env.GH_TOKEN || '',
    sleep = sleepDefault,
    now = Date.now,
    log = console.log
} = {}) {
    if (!FULL_SHA.test(sha || '')) throw new Error(`bw-board SHA is not a lowercase 40-hex commit: ${JSON.stringify(sha)}`);
    if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable; Node 22 or a fetch implementation is required');
    const options = {fetchImpl, token, sleep, now};
    const runs = await paged(
        `${API}/actions/workflows/${WORKFLOW}/runs?head_sha=${sha}`,
        'workflow_runs', options);
    const candidates = runs
        .filter(run => run.head_sha === sha && run.status === 'completed' && run.conclusion === 'success' &&
            String(run.path || '').split('@')[0] === `.github/workflows/${WORKFLOW}`)
        .sort((a, b) => (b.run_number || b.id || 0) - (a.run_number || a.id || 0));

    if (!candidates.length) {
        const states = runs.map(run => `${run.id}:${run.status}/${run.conclusion || '-'}`).join(', ') || 'none';
        throw new Error(`no successful ${REPO} CI workflow exists for pinned SHA ${sha} (matching runs: ${states})`);
    }

    const rejected = [];
    for (const run of candidates) {
        const jobs = await paged(`${API}/actions/runs/${run.id}/jobs?filter=latest`, 'jobs', options);
        const failures = [];
        const acceptedJobs = [];
        for (const [name, steps] of Object.entries(REQUIRED_BW_BOARD_JOBS)) {
            const found = jobs.filter(job => job.name === name);
            if (found.length !== 1) {
                failures.push(`${name}: appears ${found.length} times`);
                continue;
            }
            const failure = verifyJob(found[0], name, steps, sha);
            if (failure) failures.push(failure);
            else acceptedJobs.push(found[0]);
        }
        if (failures.length) {
            rejected.push(`run ${run.id}: ${failures.join('; ')}`);
            continue;
        }
        const url = run.html_url || `https://github.com/${REPO}/actions/runs/${run.id}`;
        log(`bw-board@${sha}: upstream CI evidence is green`);
        log(`  run ${run.id}, attempt ${run.run_attempt || 1}: ${url}`);
        for (const job of acceptedJobs) log(`  ${job.name}: ${job.html_url || 'success'}`);
        return {sha, run, jobs: acceptedJobs};
    }
    throw new Error(`successful workflow runs for ${sha} lack the required evidence:\n${rejected.join('\n')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    verifyBwBoardCi().catch(error => {
        console.error(`bw-board CI evidence FAILED: ${error.message}`);
        process.exitCode = 1;
    });
}
