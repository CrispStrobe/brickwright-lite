// SPDX-License-Identifier: BSD-3-Clause
import {createHash} from 'node:crypto';

export const LIMITS = Object.freeze({inputBytes: 8 * 1024 * 1024, jobs: 1000,
    stepsPerWindow: 200, windows: 1000, totalSteps: 200000});
const terminal = new Set(['success', 'failure', 'cancelled', 'timed_out', 'action_required']);
const debuggerName = /debugger|debug[- ](?:contract|gate|smoke|history|record|reverse|cycle)/i;
const need = (ok, reason) => { if (!ok) throw new Error(reason); };
const at = value => {
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? time : null;
};
const sha = raw => createHash('sha256').update(raw).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function metrics(runRaw, jobsRaw) {
    for (const raw of [runRaw, jobsRaw]) {
        need(Buffer.isBuffer(raw) && raw.length <= LIMITS.inputBytes, 'input exceeds byte bound');
    }
    const run = JSON.parse(runRaw.toString('utf8'));
    const payload = JSON.parse(jobsRaw.toString('utf8'));
    need(object(run), 'run metadata must be an object');
    const runId = run.id ?? run.run_id;
    need(Number.isSafeInteger(runId) && runId > 0, 'run metadata requires a positive integer id');
    need(object(payload) && Array.isArray(payload.jobs), 'complete jobs object required');
    const jobs = payload.jobs;
    need(Number.isSafeInteger(payload.total_count) && payload.total_count >= 0 &&
        payload.total_count === jobs.length, 'jobs payload is paginated, incomplete or has malformed total_count');
    need(jobs.length <= LIMITS.jobs, 'jobs exceed bound');
    const started = at(run.created_at ?? run.run_started_at);
    need(started !== null, 'run payload has no valid created_at');
    const ids = new Set();
    let stepCount = 0; let windowCount = 0;
    // Admit the full union before producing any report. No truncation or filtering.
    for (const job of jobs) {
        need(object(job) && Number.isSafeInteger(job.id) && job.id > 0 && !ids.has(job.id),
            'job metadata requires a unique positive integer id');
        ids.add(job.id);
        need(job.run_id === runId, 'job/run identity mismatch');
        need(typeof job.name === 'string' && Array.isArray(job.steps), 'job name/steps metadata required');
        need(job.conclusion === null || typeof job.conclusion === 'string', 'job conclusion metadata required');
        stepCount += job.steps.length;
        windowCount += Math.ceil(job.steps.length / LIMITS.stepsPerWindow);
        need(stepCount <= LIMITS.totalSteps && windowCount <= LIMITS.windows, 'step/window union exceeds bound');
        for (const step of job.steps) {
            need(object(step) && typeof step.name === 'string' &&
                (step.conclusion === null || typeof step.conclusion === 'string'), 'malformed step metadata');
        }
        for (const entry of [job, ...job.steps]) {
            for (const key of ['started_at', 'completed_at']) {
                need(entry[key] === null || (typeof entry[key] === 'string' && at(entry[key]) !== null),
                    'missing or malformed timestamp metadata');
            }
        }
    }
    let runnerSeconds = 0; let billedRunnerMinutes = 0;
    const verdicts = []; const measuredJobs = []; const windows = [];
    const unmeasuredJobIds = []; const clampedNegativeJobIds = [];
    for (const job of jobs) {
        const from = at(job.started_at); const to = at(job.completed_at);
        const seconds = from === null || to === null ? 0 : Math.max(0, (to - from) / 1000);
        if (from === null || to === null) unmeasuredJobIds.push(job.id);
        else if (to < from) clampedNegativeJobIds.push(job.id);
        runnerSeconds += seconds;
        if (seconds) billedRunnerMinutes += Math.ceil(seconds / 60);
        measuredJobs.push({id: job.id, name: job.name, conclusion: job.conclusion,
            runnerSeconds: seconds, billedRunnerMinutes: seconds ? Math.ceil(seconds / 60) : 0});
        for (let offset = 0; offset < job.steps.length; offset += LIMITS.stepsPerWindow) {
            const count = Math.min(LIMITS.stepsPerWindow, job.steps.length - offset);
            windows.push({jobId: job.id, offset, count});
            for (const step of job.steps.slice(offset, offset + count)) {
                const completed = at(step.completed_at);
                if (debuggerName.test(step.name) && completed !== null && terminal.has(step.conclusion)) {
                    verdicts.push({job: job.name, step: step.name, conclusion: step.conclusion,
                        completedAt: step.completed_at, millisecondsFromRunCreation: Math.max(0, completed - started)});
                }
            }
        }
        if (debuggerName.test(job.name) && to !== null && terminal.has(job.conclusion)) {
            verdicts.push({job: job.name, step: null, conclusion: job.conclusion,
                completedAt: job.completed_at, millisecondsFromRunCreation: Math.max(0, to - started)});
        }
    }
    verdicts.sort((a, b) => a.millisecondsFromRunCreation - b.millisecondsFromRunCreation);
    return {schema: 2, profile: 'bounded-step-windows-v1',
        inputs: {runSha256: sha(runRaw), jobsSha256: sha(jobsRaw)}, limits: LIMITS,
        counts: {jobs: jobs.length, steps: stepCount, windows: windowCount}, windows,
        coverage: {unmeasuredJobIds, clampedNegativeJobIds},
        runId, workflow: run.name ?? run.workflow_name ?? null,
        conclusion: run.conclusion ?? null, jobs: measuredJobs, runnerSeconds,
        runnerMinutes: Number((runnerSeconds / 60).toFixed(3)), billedRunnerMinutes,
        firstDebuggerVerdict: verdicts[0] || null, debuggerVerdicts: verdicts};
}
