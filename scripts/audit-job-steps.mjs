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
 * `--file jobs.json` feeds it a saved jobs payload instead of the API, which is
 * how test/audit-job-steps.test.mjs proves each branch above can fire.
 */
import {readFileSync} from 'node:fs';

const isBrowserStep = name => /^Browser (?:gates?|benchmark) — /.test(String(name || ''));
const RED = new Set(['failure', 'cancelled', 'timed_out']);

/**
 * Judge one job's steps. Pure; exported for the tests.
 * @param {Array<{name: string, status: string, conclusion: string|null}>} steps - the job's steps in order
 * @param {string} selfName - this audit step's own name, excluded from "earlier failed"
 * @returns {{verdict: 'ok'|'skipped-in-green'|'skipped-after-red'|'no-gates', skipped: string[], failedEarlier: string[], ran: number}}
 */
export const judge = (steps, selfName = 'Audit — every browser gate ran') => {
    const others = steps.filter(s => s.name !== selfName);
    const browser = others.filter(s => isBrowserStep(s.name));
    const skipped = browser.filter(s => s.conclusion === 'skipped').map(s => s.name);
    const failedEarlier = others.filter(s => RED.has(s.conclusion)).map(s => s.name);
    const ran = browser.filter(s => s.conclusion === 'success').length;
    if (browser.length === 0) return {verdict: 'no-gates', skipped, failedEarlier, ran};
    if (skipped.length === 0) return {verdict: 'ok', skipped, failedEarlier, ran};
    return {verdict: failedEarlier.length ? 'skipped-after-red' : 'skipped-in-green', skipped, failedEarlier, ran};
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
 * @param {{jobName: string, attempt: number}} where - which job is "this job"
 * @param {{log: Function, error: Function}} out - sinks
 * @returns {Promise<number>} the process exit code
 */
export const run = async (loadJobs, {jobName, attempt}, {log, error}) => {
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
    const {verdict, skipped, failedEarlier, ran} = judge(mine[0].steps || []);
    log(`browser gates that ran: ${ran}; skipped: ${skipped.length}; earlier red steps: ${failedEarlier.length}`);
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
    run(loadJobs, {jobName: process.env.GITHUB_JOB || 'build', attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0)},
        {log: console.log, error: console.error}).then(code => process.exit(code));
}
