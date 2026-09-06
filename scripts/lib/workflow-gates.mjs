/**
 * One parser for build.yml's browser gates, shared by the tests that hold the
 * gate shape (test/browser-gate-timeouts.test.mjs, test/browser-gate-shards.test.mjs)
 * and by the in-job audit (scripts/audit-job-steps.mjs) — so what the tests
 * assert and what the audit expects are read from the same lines.
 *
 * Shards. The browser job is one body under `strategy.matrix.shard`; every
 * gate step (and each of its companion steps — uploads, follow-ups) carries
 * exactly one clause `matrix.shard == '<name>'` in its `if:`. That clause IS
 * the shard list: there is no second list that has to agree with it. A gate
 * without a clause would run in every shard (twice the time, and upload-
 * artifact v4 refuses a second artifact of the same name); a clause naming a
 * shard the matrix lacks would never run and stay green. `partition()` reports
 * both, by name.
 */
import {readFileSync} from 'node:fs';

export const isBrowserStep = name => /^Browser (?:gates?|benchmark) — /.test(String(name || ''));
export const AUDIT_STEP = 'Audit — every browser gate ran';
export const SERVE_STEP = 'Serve the built app';

/** Every job as {id, timeout, name, shards, steps: [{job, name, timeout, ifs, line}]}, from the `jobs:` block. */
export const parseJobs = text => {
    const lines = text.split('\n');
    const jobsAt = lines.findIndex(l => l === 'jobs:');
    if (jobsAt < 0) throw new Error('no top-level jobs: block — the parse is wrong, not the file');
    const jobs = new Map();
    let job = null;
    let step = null;
    for (let i = jobsAt + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^\S/.test(line) && line.trim() !== '') break; // left the jobs block
        const j = line.match(/^  ([a-z][a-z-]*):$/);
        if (j) {
            job = {id: j[1], timeout: null, name: null, shards: [], steps: []};
            jobs.set(j[1], job);
            step = null;
            continue;
        }
        if (!job) continue;
        const jt = line.match(/^    timeout-minutes:\s*(\d+)\s*(?:#.*)?$/);
        if (jt) job.timeout = Number(jt[1]);
        const jn = line.match(/^    name:\s*(.*)$/);
        if (jn) job.name = jn[1].trim();
        const sh = line.match(/^        shard:\s*\[([^\]]*)\]/);
        if (sh) job.shards = sh[1].split(',').map(s => s.trim()).filter(Boolean);
        if (/^      - /.test(line)) {
            step = {job: job.id, name: '', timeout: null, ifs: null, line: i + 1};
            job.steps.push(step);
        }
        if (!step) continue;
        const cond = line.match(/^        if:\s*(.*)$/);
        if (cond) step.ifs = cond[1].trim();
        const name = line.match(/^      (?:- )?name:\s*(.*)$/);
        if (name) step.name = name[1];
        const t = line.match(/^        timeout-minutes:\s*(\d+)\s*(?:#.*)?$/);
        if (t) step.timeout = Number(t[1]);
    }
    return jobs;
};

/** The job that holds the browser gates (null if none, or if more than one does). */
export const gateJob = jobs => {
    const holders = [...jobs.values()].filter(j => j.steps.some(s => isBrowserStep(s.name)));
    return holders.length === 1 ? holders[0] : null;
};

/** Every shard a step's if: names, in order. */
export const shardsOf = step => [...String(step.ifs || '').matchAll(/matrix\.shard\s*==\s*'([a-z][a-z0-9-]*)'/g)].map(m => m[1]);

/**
 * Is the shard assignment a partition of the gates? Pure over parsed jobs.
 * @returns {{
 *   shards: string[], byShard: Map<string, string[]>,
 *   unassigned: string[], multi: string[], unknownShard: string[], emptyShards: string[],
 *   companionMismatch: string[]
 * }}
 */
export const partition = jobs => {
    const job = gateJob(jobs);
    const out = {shards: job ? job.shards : [], byShard: new Map(), unassigned: [], multi: [], unknownShard: [], emptyShards: [], companionMismatch: []};
    if (!job) return out;
    for (const s of job.shards) out.byShard.set(s, []);
    let current = null;   // the shard of the gate whose companions follow
    let afterServe = false;
    for (const step of job.steps) {
        if (step.name === SERVE_STEP) { afterServe = true; current = null; continue; }
        if (step.name === AUDIT_STEP) break;
        const shards = shardsOf(step);
        if (isBrowserStep(step.name)) {
            if (shards.length === 0) out.unassigned.push(step.name);
            else if (shards.length > 1) out.multi.push(`${step.name} (${shards.join(', ')})`);
            else if (!job.shards.includes(shards[0])) out.unknownShard.push(`${step.name} (${shards[0]})`);
            else out.byShard.get(shards[0]).push(step.name);
            current = shards[0] || null;
            continue;
        }
        // A named non-gate step with its own clause (the Measure step) owns its
        // followers the way a gate does.
        if (afterServe && step.name && shards.length === 1 && job.shards.includes(shards[0])) { current = shards[0]; continue; }
        // A companion (upload, follow-up) after a gate belongs to that gate's shard.
        if (afterServe && current && shards.join(',') !== current) {
            out.companionMismatch.push(`line ${step.line}${step.name ? ` "${step.name}"` : ''} after a ${current} gate carries [${shards.join(', ') || 'no clause'}]`);
        }
    }
    for (const [s, gates] of out.byShard) if (gates.length === 0) out.emptyShards.push(s);
    return out;
};

export const readWorkflow = file => readFileSync(file, 'utf8');
