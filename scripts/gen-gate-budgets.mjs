#!/usr/bin/env node
/**
 * Every browser gate's timeout-minutes is DERIVED from measurement, never typed (plan T12).
 *
 * The per-gate budgets of 2026-09-05 were "~3× each step's maximum over the last five main
 * runs, floor 3, cap 8", written once by hand with the measurement in a trailing comment. By
 * 2026-09-07, 18 of 49 literals sat above what 20 green runs derive, one 8-minute budget stood
 * on a 124 s outlier that never recurred, and a new gate had guessed "6". A number that was
 * measured once and then typed is a number that rots.
 *
 *   node scripts/gen-gate-budgets.mjs --fetch      read the last main runs from the Actions API
 *                                                  and REWRITE docs/generated/browser-gate-readings.json
 *   node scripts/gen-gate-budgets.mjs              apply the readings file to build.yml: every
 *                                                  browser gate's timeout-minutes becomes its
 *                                                  derivation, with the derivation in its comment
 *   node scripts/gen-gate-budgets.mjs --check      exit 1 if build.yml disagrees with the readings
 *
 * THE DERIVATION, stated once here and asserted by test/browser-gate-budgets.test.mjs:
 *   budget = ceil(p95(last 20 green readings) × FACTOR / 60), floor FLOOR, cap CAP.
 *   Fewer than MIN_READINGS readings → PROVISIONAL: the budget is max(FLOOR, the literal), and
 *   the comment says PROVISIONAL and the count, so a new gate carries a guess that is called one.
 *   A derivation above CAP is written as the cap and the comment says CAPPED with the raw
 *   derivation: the step keeps less than FACTOR× headroom and the comment says it is the one a
 *   slower runner reds first. Nothing is clamped silently.
 *
 * The readings file carries the run ids it was built from and is never hand-edited (the
 * pin-move-chain shape: the test reddens when a gate in build.yml has no entry, or an entry
 * names a gate that is gone — regenerate). Readings are per STEP NAME, so a renamed step starts
 * provisional, which is the honest state. Each step also keeps its all-time MAX with the run it
 * came from, carried forward from the previous readings file when the run has aged out of the
 * scan — lowering a budget must not lose the memory of why it was high (the 124 s listings run
 * of 2026-09-05 is what a future red is diagnosed against).
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJobs, gateJob, isBrowserStep} from './lib/workflow-gates.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const READINGS = path.join(ROOT, 'docs', 'generated', 'browser-gate-readings.json');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'build.yml');
export const FACTOR = 3, FLOOR = 3, CAP = 8, MIN_READINGS = 5, KEEP = 20, RUNS = 80;

export const p95 = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };

/** The derivation for one step. Pure. */
export const derive = (entry, literal) => {
    const secs = ((entry && entry.readings) || []).map(r => r.seconds);
    const max = entry && entry.max ? entry.max : null;
    if (secs.length < MIN_READINGS) return {provisional: true, n: secs.length, budget: Math.max(FLOOR, literal || FLOOR), p95: secs.length ? p95(secs) : null, max};
    const p = p95(secs);
    const raw = Math.ceil(p * FACTOR / 60);
    if (raw > CAP) return {provisional: false, n: secs.length, p95: p, budget: CAP, capped: raw, max};
    return {provisional: false, n: secs.length, p95: p, budget: Math.max(FLOOR, raw), max};
};

/** The comment the generator writes beside timeout-minutes. Pure. */
export const commentFor = (d, newestRun) => {
    const max = d.max ? `; max ${d.max.seconds} s in run ${d.max.run}` : '';
    if (d.provisional) return `# PROVISIONAL — ${d.n} reading(s), fewer than ${MIN_READINGS}; derived once ${MIN_READINGS} green runs exist${max} (gen-gate-budgets.mjs)`;
    if (d.capped) return `# CAPPED: p95 ${d.p95} s × ${FACTOR} → ${d.capped} min exceeds the cap of ${CAP}; budget is the cap, ${(CAP * 60 / d.p95).toFixed(1)}× p95 — the one gate with no headroom above, a slower runner reds it first; over ${d.n} green runs to ${newestRun}${max} (gen-gate-budgets.mjs)`;
    return `# derived: p95 ${d.p95} s × ${FACTOR} → ${d.budget} min over ${d.n} green runs to ${newestRun}${max} (gen-gate-budgets.mjs)`;
};

// ---- fetch --------------------------------------------------------------------------------
const gh = args => execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 64 << 20});
export const fetchReadings = (gateNames, previous) => {
    const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const runs = JSON.parse(gh(['run', 'list', '--repo', repo, '--branch', 'main', '--workflow', 'build.yml', '--limit', String(RUNS), '--json', 'databaseId,headSha,createdAt,conclusion']))
        .filter(r => r.conclusion !== 'cancelled');
    const all = {};
    for (const name of gateNames) all[name] = [];
    for (const r of runs) {
        const jobs = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${r.databaseId}/jobs?per_page=100`])).jobs || [];
        for (const j of jobs) {
            if (!String(j.name).startsWith('browser')) continue;
            for (const s of j.steps || []) {
                if (!(s.name in all) || s.conclusion !== 'success' || !s.started_at || !s.completed_at) continue; // a step build.yml no longer has is not a reading
                const seconds = Math.round((Date.parse(s.completed_at) - Date.parse(s.started_at)) / 1000);
                all[s.name].push({run: r.databaseId, sha: r.headSha.slice(0, 9), seconds});
            }
        }
    }
    const steps = {};
    for (const [name, rs] of Object.entries(all)) {
        const kept = rs.slice(0, KEEP); // runs come newest first
        const prior = previous && previous.steps && previous.steps[name] && previous.steps[name].max;
        let max = prior || null; // the memory of why a budget was high outlives the scan window
        for (const r of rs) if (!max || r.seconds > max.seconds) max = {seconds: r.seconds, run: r.run, sha: r.sha};
        steps[name] = {n: kept.length, p95: kept.length ? p95(kept.map(r => r.seconds)) : null, max, readings: kept};
    }
    return {generatedAt: new Date().toISOString(), repo, branch: 'main', newestRun: runs[0] && runs[0].databaseId, runsScanned: runs.length, keepPerStep: KEEP, factor: FACTOR, floor: FLOOR, cap: CAP, minReadings: MIN_READINGS, steps};
};

// ---- apply / check ------------------------------------------------------------------------
/** Rewrite every browser gate's timeout-minutes line from the readings. Pure over text; returns {text, changes, findings}. */
export const applyToWorkflow = (yml, readings) => {
    const job = gateJob(parseJobs(yml));
    const lines = yml.split('\n');
    const changes = [], findings = [];
    for (const step of job.steps) {
        if (!isBrowserStep(step.name)) continue;
        const d = derive(readings.steps[step.name], step.timeout);
        if (d.capped) findings.push(`${step.name}: p95 ${d.p95} s derives ${d.capped} min, above the cap of ${CAP} — written as the cap, ${(CAP * 60 / d.p95).toFixed(1)}× p95`);
        // the step's timeout-minutes line and its BW_STEP_BUDGET_MIN hand-off, within the step
        for (let i = step.line; i < lines.length && !(i > step.line && /^      - /.test(lines[i])); i++) {
            const m = lines[i].match(/^(\s+timeout-minutes:\s*)(\d+)(\s*#.*)?$/);
            if (m) {
                const next = `${m[1]}${d.budget}  ${commentFor(d, readings.newestRun)}`;
                if (lines[i] !== next) { changes.push(`${step.name}: ${m[2]} → ${d.budget}${d.provisional ? ' (provisional)' : d.capped ? ' (capped)' : ''}`); lines[i] = next; }
                continue;
            }
            const b = lines[i].match(/BW_STEP_BUDGET_MIN=(\d+)/);
            if (b && Number(b[1]) !== d.budget) { changes.push(`${step.name}: BW_STEP_BUDGET_MIN=${b[1]} → ${d.budget}`); lines[i] = lines[i].replace(/BW_STEP_BUDGET_MIN=\d+/, `BW_STEP_BUDGET_MIN=${d.budget}`); }
        }
    }
    return {text: lines.join('\n'), changes, findings};
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    if (process.argv.includes('--fetch')) {
        const names = gateJob(parseJobs(readFileSync(WORKFLOW, 'utf8'))).steps.map(s => s.name).filter(isBrowserStep);
        let previous = null;
        try { previous = JSON.parse(readFileSync(READINGS, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } // no previous file is the first run, not an error
        const r = fetchReadings(names, previous);
        writeFileSync(READINGS, JSON.stringify(r, null, 1) + '\n');
        // `--fetch` REWRITES A TRACKED FILE. It reads like a read-only flag and is
        // not one: brickwright-lite-ea ran it inside a lane worktree on 2026-09-07,
        // `git add -A` swept 143 lines of readings into an unrelated source commit,
        // and the rebase conflict that followed cost a diagnosis. So the file is
        // named on stdout every time, with what to do about it.
        console.log(`::notice::${path.relative(ROOT, READINGS)} was REWRITTEN by --fetch. It is tracked: commit it on its own, or \`git checkout\` it before committing unrelated work — never sweep it in with \`git add -A\`.`);
        console.log(`readings: ${Object.keys(r.steps).length} step(s) over ${r.runsScanned} runs, newest ${r.newestRun}, written to ${path.relative(ROOT, READINGS)}`);
    }
    const readings = JSON.parse(readFileSync(READINGS, 'utf8'));
    const yml = readFileSync(WORKFLOW, 'utf8');
    const {text, changes, findings} = applyToWorkflow(yml, readings);
    for (const f of findings) console.log(`::warning::${f}`);
    if (process.argv.includes('--check')) {
        for (const c of changes) console.log(`  would change ${c}`);
        if (changes.length) { console.error(`build.yml disagrees with the readings on ${changes.length} line(s) — run node scripts/gen-gate-budgets.mjs`); process.exit(1); }
        console.log('build.yml agrees with docs/generated/browser-gate-readings.json');
    } else {
        writeFileSync(WORKFLOW, text);
        for (const c of changes) console.log(`  ${c}`);
        console.log(`${changes.length} line(s) rewritten`);
    }
}
