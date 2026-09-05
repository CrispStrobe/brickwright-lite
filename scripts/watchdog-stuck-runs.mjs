#!/usr/bin/env node
/**
 * Which in-flight build runs are genuinely STUCK, and which are merely waiting?
 *
 * The watchdog cancels a build that has been executing too long, so that a hung
 * run stops burning a runner for its full timeout. The whole question is what
 * "too long" is measured from, and it is easy to get wrong in a way that kills
 * healthy work:
 *
 *   - `run_started_at` is when the run was CREATED. On a box that queues for
 *     ten or twenty minutes, a build that waited twenty and has been compiling
 *     for five looks twenty-five minutes old.
 *   - A run reports `status: in_progress` as soon as GitHub accepts it. Its
 *     JOBS can still be queued, waiting for a runner, with `started_at: null`
 *     on every one of them.
 *
 * So a run with no started job has NO EXECUTION AGE YET — not an age of zero.
 * The distinction matters because the two are treated differently: an age of
 * zero is a measurement ("young, healthy"), while no age is an absence
 * ("cannot say"). Falling back to the creation time turns the absence into a
 * measurement, and the number it invents is exactly the queue time the caller
 * was trying to exclude. Such a run is skipped here and reconsidered on the
 * next tick, by which time it has either started or is still nothing to judge.
 *
 * Pure and data-in/data-out so it can be tested against fixtures rather than
 * against a live queue, which is the only place the interesting cases occur.
 */

/**
 * @param {Array<{id: (number|string), run_started_at: string,
 *                jobs: Array<{started_at: ?string}>}>} runs - in-flight runs
 * @param {number} nowMs - current time in epoch ms
 * @param {{maxMinutes?: number}} [options] - execution-age budget
 * @returns {Array<{id: (number|string), ageMinutes: number}>} runs to cancel
 */
export function stuckRuns (runs, nowMs, options = {}) {
    const maxMinutes = options.maxMinutes ?? 25;
    const out = [];
    for (const run of runs || []) {
        const starts = (run.jobs || [])
            .map(job => job && job.started_at)
            .filter(Boolean)
            .map(at => Date.parse(at))
            .filter(ms => Number.isFinite(ms));
        // No job has started: the run is queued. Not stuck, and not judgeable.
        if (!starts.length) continue;
        const ageMinutes = (nowMs - Math.min(...starts)) / 60000;
        if (ageMinutes > maxMinutes) out.push({id: run.id, ageMinutes: Math.round(ageMinutes)});
    }
    return out;
}

// CLI: runs JSON on stdin, one "<id> <ageMinutes>" per stuck run on stdout.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const text = chunks.join('').trim();
    const runs = text ? JSON.parse(text) : [];
    const budget = Number(process.env.WATCHDOG_MAX_MINUTES || 25);
    for (const run of stuckRuns(runs, Date.now(), {maxMinutes: budget})) {
        console.log(`${run.id} ${run.ageMinutes}`);
    }
}
