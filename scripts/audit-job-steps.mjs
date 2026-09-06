#!/usr/bin/env node
/**
 * A GREEN JOB MUST NOT HIDE A SKIPPED GATE.
 *
 * 2026-09-05, twice: a job reported success while a browser gate inside it had
 * been `skipped` — once because an `if:` named a status function and silenced
 * the seventeen steps after it (build.yml's own comments record run 62385f4c5),
 * once because a merge moved steps into a job whose conditions no longer held.
 * Every one of those greens was read, by people, as "the gate passed". The
 * reviewer's remedy has been a per-step audit by hand: open the run, count the
 * browser steps, check none says skipped. This step does that audit inside the
 * job, so the job cannot be green with a skipped gate in it.
 *
 * Runs as the LAST step of the job that holds the browser gates, `if: always()`.
 * It asks the Actions API for this run's jobs, finds its own job, and:
 *
 *   - if any `Browser gate…` / `Browser benchmark…` step ended `skipped` while
 *     NO earlier step failed, fails, naming the skipped steps — that is the lie;
 *   - if an earlier step did fail, prints the skipped list as a note and exits 0:
 *     the job is already red for the real reason, and a second red for the same
 *     cause is noise;
 *   - if it cannot see its own job (API, permissions), FAILS — a check that
 *     cannot see is not a check that passed.
 *
 * SHARDS (2026-09-06). The browser job is a matrix of shards, one body, each
 * gate's `if:` naming the shard it belongs to (scripts/lib/workflow-gates.mjs
 * reads those clauses; they are the only list). With `--shard <name>` the audit
 * judges THIS leg against that list: a gate assigned here that ended skipped
 * is the lie above; a gate assigned elsewhere must show skipped here — one that
 * ran is a double run, failed by name; a gate in this job's steps with no
 * assignment is failed by name; and the partition itself (every gate exactly
 * one existing shard, no shard empty, companions matching) is re-checked from
 * the checked-out build.yml, so a workflow edit that dodges the unit tests
 * still fails inside the job. BW_JOB_NAME carries the leg's display name
 * (`browser (heavy)`), because the API reports that and GITHUB_JOB stays
 * `browser` for every leg.
 *
 * `--file jobs.json` feeds it a saved jobs payload instead of the API, which is
 * how test/audit-job-steps.test.mjs proves each branch above can fire.
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseJobs, partition, isBrowserStep} from './lib/workflow-gates.mjs';

const RED = new Set(['failure', 'cancelled', 'timed_out']);

/**
 * Judge one job's steps. Pure; exported for the tests.
 * @param {Array<{name: string, status: string, conclusion: string|null}>} steps - the job's steps in order
 * @param {string} selfName - this audit step's own name, excluded from "earlier failed"
 * @param {{shard: string, mine: string[], others: string[]}} [expected] - under a matrix: the
 *   gates assigned to this leg and to the other legs (from the workflow's clauses)
 * @returns {{verdict: 'ok'|'skipped-in-green'|'skipped-after-red'|'no-gates'|'ran-in-wrong-shard'|'unassigned-gate',
 *   skipped: string[], failedEarlier: string[], ran: number, wrongShard: string[], unassigned: string[]}}
 */
export const judge = (steps, selfName = 'Audit — every browser gate ran', expected = null) => {
    const others = steps.filter(s => s.name !== selfName);
    const allBrowser = others.filter(s => isBrowserStep(s.name));
    const failedEarlier = others.filter(s => RED.has(s.conclusion)).map(s => s.name);
    let browser = allBrowser;
    const wrongShard = [];
    const unassigned = [];
    if (expected) {
        const mine = new Set(expected.mine), elsewhere = new Set(expected.others);
        for (const s of allBrowser) {
            if (mine.has(s.name)) continue;
            if (elsewhere.has(s.name)) { if (s.conclusion !== 'skipped') wrongShard.push(`${s.name} (${s.conclusion})`); }
            else unassigned.push(s.name);
        }
        browser = allBrowser.filter(s => mine.has(s.name));
    }
    const skipped = browser.filter(s => s.conclusion === 'skipped').map(s => s.name);
    const ran = browser.filter(s => s.conclusion === 'success').length;
    const base = {skipped, failedEarlier, ran, wrongShard, unassigned};
    if (unassigned.length) return {verdict: 'unassigned-gate', ...base};
    if (wrongShard.length) return {verdict: 'ran-in-wrong-shard', ...base};
    if (browser.length === 0) return {verdict: 'no-gates', ...base};
    if (skipped.length === 0) return {verdict: 'ok', ...base};
    return {verdict: failedEarlier.length ? 'skipped-after-red' : 'skipped-in-green', ...base};
};

/**
 * What the workflow assigns to each shard, and whether that assignment is a
 * partition. Pure over the workflow text; exported for the tests.
 * @returns {{ok: boolean, problems: string[], mine: string[], others: string[]}}
 */
export const expectedForShard = (workflowText, shard) => {
    const p = partition(parseJobs(workflowText));
    const problems = [];
    if (p.shards.length === 0) problems.push('the job holding the browser gates declares no matrix shard list');
    if (!p.shards.includes(shard)) problems.push(`this leg's shard "${shard}" is not in the matrix [${p.shards.join(', ')}]`);
    for (const g of p.unassigned) problems.push(`gate with no shard clause (would run in every shard): ${g}`);
    for (const g of p.multi) problems.push(`gate with more than one shard clause: ${g}`);
    for (const g of p.unknownShard) problems.push(`gate naming a shard the matrix lacks (would never run): ${g}`);
    for (const s of p.emptyShards) problems.push(`shard with no gates: ${s}`);
    for (const c of p.companionMismatch) problems.push(`companion step not on its gate's shard: ${c}`);
    const mine = p.byShard.get(shard) || [];
    const others = [...p.byShard.entries()].filter(([s]) => s !== shard).flatMap(([, gates]) => gates);
    return {ok: problems.length === 0, problems, mine, others};
};

/**
 * This run's jobs from the Actions API. One retry, because the workflow token
 * shares a rate limit with every other run in flight and a busy afternoon has
 * already produced a 403 on the same token today.
 */
const fetchJobs = async (fetchImpl = fetch) => {
    const {GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: runId, GH_TOKEN, GITHUB_TOKEN} = process.env;
    const token = GH_TOKEN || GITHUB_TOKEN;
    if (!repo || !runId || !token) throw new Error('GITHUB_REPOSITORY, GITHUB_RUN_ID and GH_TOKEN are required outside --file mode');
    const once = async () => {
        const jobs = [];
        for (let page = 1; page <= 10; page++) {
            const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`, {
                headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
            });
            if (!res.ok) throw new Error(`GitHub HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
            const body = await res.json();
            jobs.push(...(body.jobs || []));
            if (jobs.length >= (body.total_count || 0) || !(body.jobs || []).length) break;
        }
        return jobs;
    };
    try { return await once(); } catch (first) {
        await new Promise(r => setTimeout(r, 15000));
        try { return await once(); } catch (second) { throw new Error(`${second.message} (after one retry; first attempt: ${first.message})`); }
    }
};

/**
 * The whole judgement as a function of how the jobs are loaded, so the tests
 * can drive every exit — including the one where the API cannot be read.
 * @param {() => Promise<Array>} loadJobs - resolves to this run's jobs
 * @param {{jobName: string, attempt: number, shard?: string, workflowText?: string}} where - which job is
 *   "this job"; under a matrix, which shard this leg is and the workflow text to read the clauses from
 * @param {{log: Function, error: Function}} out - sinks
 * @returns {Promise<number>} the process exit code
 */
export const run = async (loadJobs, {jobName, attempt, shard = null, workflowText = null}, {log, error}) => {
    let expected = null;
    if (shard) {
        // THE PARTITION FIRST, from this checkout's workflow: a bad assignment
        // is a workflow defect and is named as one, before any step is judged.
        const e = expectedForShard(workflowText, shard);
        if (!e.ok) {
            error(`::error::the browser shard assignment in build.yml is not a partition of the gates — fix the if: clauses (test/browser-gate-shards.test.mjs holds the same rule):\n  ${e.problems.join('\n  ')}`);
            return 1;
        }
        expected = {shard, mine: e.mine, others: e.others};
        log(`shard ${shard}: ${e.mine.length} gate(s) assigned here, ${e.others.length} elsewhere`);
    }
    let jobs;
    try {
        jobs = await loadJobs();
    } catch (err) {
        // AN ABSENCE, NOT A FINDING. This exit must never read as "a gate was
        // skipped": a run that could not be audited is red because it is
        // unaudited, and the message says exactly that and nothing about gates.
        error(`::error::could not audit this run: ${err.message}. No browser gate is being reported as skipped; the run is red because it is unaudited (a check that cannot see is not a check that passed).`);
        return 1;
    }
    const mine = jobs.filter(j => j.name === jobName && (!attempt || Number(j.run_attempt || attempt) === attempt));
    if (mine.length !== 1) {
        error(`::error::could not audit this run: expected exactly one job named "${jobName}", found ${mine.length} (${jobs.map(j => j.name).join(', ')}). No browser gate is being reported as skipped.`);
        return 1;
    }
    const {verdict, skipped, failedEarlier, ran, wrongShard, unassigned} = judge(mine[0].steps || [], undefined, expected);
    log(`browser gates that ran: ${ran}; skipped: ${skipped.length}; earlier red steps: ${failedEarlier.length}`);
    if (verdict === 'unassigned-gate') {
        error(`::error::browser gate(s) in this job with no shard assignment in build.yml — they ran in every shard, or in none:\n  ${unassigned.join('\n  ')}`);
        return 1;
    }
    if (verdict === 'ran-in-wrong-shard') {
        error(`::error::browser gate(s) assigned to another shard ran in this one (${shard}) — a double run, and upload-artifact refuses the second artifact of a name:\n  ${wrongShard.join('\n  ')}`);
        return 1;
    }
    if (verdict === 'no-gates') {
        error('::error::could not audit this run: this job holds no Browser gate steps — the audit is in the wrong job, or the gates moved without it.');
        return 1;
    }
    if (verdict === 'skipped-after-red') {
        // NOT A SECOND RED FOR THE SAME CAUSE. A gate skipped downstream of a
        // real failure is that failure's shadow, not a finding; reporting it as
        // one doubles the noise on exactly the runs that are hardest to read.
        // Do not "simplify" this into failing on any skipped gate.
        log(`note: ${skipped.length} browser gate(s) did not run because an earlier step failed (${failedEarlier.join('; ')}); the job is red for that reason:\n  ${skipped.join('\n  ')}`);
        return 0;
    }
    if (verdict === 'skipped-in-green') {
        error(`::error::${skipped.length} browser gate(s) ended skipped with no earlier failure — a green job would have hidden them. Check their if: conditions (build.yml's own history: an if: naming a status function silenced 17 gates):\n  ${skipped.join('\n  ')}`);
        return 1;
    }
    log('audit-job-steps: every browser gate ran');
    return 0;
};

const isMain = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split('/').pop());
if (isMain) {
    const fileArg = process.argv.indexOf('--file');
    const loadJobs = fileArg >= 0
        ? async () => JSON.parse(readFileSync(process.argv[fileArg + 1], 'utf8')).jobs
        : fetchJobs;
    const shardArg = process.argv.indexOf('--shard');
    const shard = shardArg >= 0 ? process.argv[shardArg + 1] : null;
    const wfArg = process.argv.indexOf('--workflow');
    const workflowFile = wfArg >= 0 ? process.argv[wfArg + 1] : path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.github', 'workflows', 'build.yml');
    run(loadJobs, {
        jobName: process.env.BW_JOB_NAME || process.env.GITHUB_JOB || 'build',
        attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0),
        shard,
        workflowText: shard ? readFileSync(workflowFile, 'utf8') : null
    }, {log: console.log, error: console.error}).then(code => process.exit(code));
}
