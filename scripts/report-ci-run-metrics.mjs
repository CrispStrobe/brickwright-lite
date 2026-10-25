#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_JOBS = 1000;
const MAX_STEPS = 200;
const terminal = new Set(['success', 'failure', 'cancelled', 'timed_out', 'action_required']);
const debuggerName = /debugger|debug[- ](?:contract|gate|smoke|history|record|reverse|cycle)/i;

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) =>
    value.startsWith('--') ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
if (!args.run || !args.jobs) {
    throw new Error('usage: report-ci-run-metrics.mjs --run run.json --jobs jobs.json [--output report.json]');
}
const load = async path => {
    const text = await readFile(path, 'utf8');
    if (Buffer.byteLength(text) > MAX_INPUT_BYTES) throw new Error(`${path} exceeds ${MAX_INPUT_BYTES} bytes`);
    return JSON.parse(text);
};
const run = await load(args.run);
const jobsPayload = await load(args.jobs);
const jobs = Array.isArray(jobsPayload) ? jobsPayload : jobsPayload.jobs;
if (!Array.isArray(jobs) || jobs.length > MAX_JOBS) throw new Error('jobs payload is missing or exceeds its bound');
if (Number.isSafeInteger(jobsPayload.total_count) && jobsPayload.total_count !== jobs.length) {
    throw new Error('jobs payload is paginated or incomplete');
}
const at = value => {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : null;
};
const started = at(run.created_at ?? run.run_started_at);
if (started === null) throw new Error('run payload has no valid created_at');

let runnerSeconds = 0;
let billedRunnerMinutes = 0;
const verdicts = [];
const measuredJobs = [];
for (const job of jobs) {
    const steps = Array.isArray(job.steps) ? job.steps : [];
    if (steps.length > MAX_STEPS) throw new Error(`job ${job.name || job.id} exceeds its step bound`);
    const from = at(job.started_at); const to = at(job.completed_at);
    const seconds = from === null || to === null ? 0 : Math.max(0, (to - from) / 1000);
    runnerSeconds += seconds;
    if (seconds) billedRunnerMinutes += Math.ceil(seconds / 60);
    measuredJobs.push({id: job.id, name: job.name, conclusion: job.conclusion,
        runnerSeconds: seconds, billedRunnerMinutes: seconds ? Math.ceil(seconds / 60) : 0});
    for (const step of steps) {
        const completed = at(step.completed_at);
        if (debuggerName.test(step.name || '') && completed !== null && terminal.has(step.conclusion)) {
            verdicts.push({job: job.name, step: step.name, conclusion: step.conclusion,
                completedAt: step.completed_at, millisecondsFromRunCreation: Math.max(0, completed - started)});
        }
    }
    if (debuggerName.test(job.name || '') && to !== null && terminal.has(job.conclusion)) {
        verdicts.push({job: job.name, step: null, conclusion: job.conclusion,
            completedAt: job.completed_at, millisecondsFromRunCreation: Math.max(0, to - started)});
    }
}
verdicts.sort((a, b) => a.millisecondsFromRunCreation - b.millisecondsFromRunCreation);
const report = {schema: 1, runId: run.id ?? run.run_id ?? null, workflow: run.name ?? run.workflow_name ?? null,
    conclusion: run.conclusion ?? null, jobs: measuredJobs, runnerSeconds,
    runnerMinutes: Number((runnerSeconds / 60).toFixed(3)), billedRunnerMinutes,
    firstDebuggerVerdict: verdicts[0] || null, debuggerVerdicts: verdicts};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) await writeFile(args.output, json);
else process.stdout.write(json);
if (process.env.GITHUB_STEP_SUMMARY) {
    const first = report.firstDebuggerVerdict;
    await writeFile(process.env.GITHUB_STEP_SUMMARY,
        `### CI cost and debugger latency\n\n` +
        `- Runner time: ${report.runnerMinutes} min (${report.billedRunnerMinutes} billed job-minutes)\n` +
        `- First debugger verdict: ${first ? `${(first.millisecondsFromRunCreation / 1000).toFixed(1)} s — ${first.step || first.job}` : 'not observed'}\n`,
    {flag: 'a'});
}
