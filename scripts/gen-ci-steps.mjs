#!/usr/bin/env node
/**
 * The CI step census (plan T14): which workflow steps and jobs actually run,
 * read from the jobs API of the last green/completed runs of EVERY workflow —
 * the same question T13 asked of tests, one level up.
 *
 *   node scripts/gen-ci-steps.mjs --fetch    read the runs (gh api) and REWRITE
 *                                            docs/generated/ci-step-census.json
 *   node scripts/gen-ci-steps.mjs --check    exit 1 on a step nobody runs
 *
 * Per (workflow, step name), aggregated over every job instance in a run (a
 * shard's gate that runs in the sibling shard RAN): runs it appeared in, runs
 * it ran in (any conclusion but skipped), split main/branch, and the `if:`
 * clause the workflow gives it at the newest run's sha. Per (workflow, job)
 * the same. A workflow's named steps AT THAT SHA are recorded too, so a step
 * that is in the file but in no run is seen; a step younger than the readings
 * is reported, never judged.
 *
 * Measured 2026-09-07 (247 runs, 10 workflows, 169 steps): 0 steps ran in no
 * run they appeared in; 26 ran sometimes — 17 skipped once behind a failed
 * build job, the rest trigger/tag/matrix conditions by design; the only "in
 * the file, in no run" steps were younger than the readings.
 */
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJobs} from './lib/workflow-gates.mjs';
import {parseStepPointers, judgeSteps} from './lib/skip-pointers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const READINGS = path.join(ROOT, 'docs', 'generated', 'ci-step-census.json');
const RUNS_PER_WORKFLOW = 20, GREEN_MAIN = 20;
const HOUSEKEEPING = /^(Set up job|Complete job|Post |Run actions\/|Initialize containers|Stop containers)/;
const gh = args => execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 256 << 20});

/** Named steps per job of a workflow text, with their if: clauses. */
export const yamlSteps = text => {
    const out = [];
    for (const job of parseJobs(text).values()) for (const s of job.steps) if (s.name) out.push({job: job.id, name: s.name, ifs: s.ifs, line: s.line});
    return out;
};

/** Why a step ran only sometimes, from its clause and the runs it skipped in. Pure. */
export const why = (clause, skippedRunsHadFailure) => {
    if (skippedRunsHadFailure) return 'upstream failure — skipped only in runs where an earlier job failed';
    const c = clause || '';
    if (/event_name/.test(c)) return 'trigger — the clause names the event';
    if (/refs\/tags|startsWith\(github\.ref/.test(c)) return 'tag — runs on tag refs only';
    if (/refs\/heads\/main|github\.ref\s*==/.test(c)) return 'branch — runs on main only';
    if (/matrix\./.test(c)) return 'matrix — runs in one matrix leg';
    if (/steps\.\w+\.(outcome|outputs)/.test(c)) return 'outcome guard — behind an earlier step\'s result';
    return c ? 'clause — ' + c.slice(0, 80) : 'no clause — skipped by the runner after a failure';
};

/** Pure: from [{run, workflow, branch, sha, jobs:[{name, conclusion, steps:[{name, conclusion}]}]}] and {wf: yamlText} to the readings' body. */
export const census = (runs, yamlAtSha) => {
    const steps = {}, jobs = {};
    for (const r of runs) {
        const runFailed = r.jobs.some(j => j.conclusion === 'failure');
        const isMain = r.branch === 'main';
        const seenStep = new Set(), seenJob = new Set();
        for (const j of r.jobs) {
            const jname = j.name.replace(/ \(.*\)$/, '');
            const J = ((jobs[r.workflow] ||= {})[jname] ||= {existed: 0, ran: 0, existedMain: 0, ranMain: 0});
            if (!seenJob.has(jname)) { seenJob.add(jname); J.existed++; if (isMain) J.existedMain++; J._ran = false; }
            if (j.conclusion !== 'skipped' && !J._ran) { J._ran = true; J.ran++; if (isMain) J.ranMain++; }
            for (const s of j.steps) {
                if (HOUSEKEEPING.test(s.name)) continue;
                const S = ((steps[r.workflow] ||= {})[s.name] ||= {existed: 0, ran: 0, existedMain: 0, ranMain: 0, skippedInFailedRuns: 0, skippedInGreenRuns: 0, jobs: []});
                if (!S.jobs.includes(jname)) S.jobs.push(jname);
                const k = `${r.workflow}::${s.name}`;
                if (!seenStep.has(k)) { seenStep.add(k); S.existed++; if (isMain) S.existedMain++; S._ran = false; }
                if (s.conclusion !== 'skipped' && !S._ran) { S._ran = true; S.ran++; if (isMain) S.ranMain++; }
            }
        }
        for (const k of seenStep) { const [wf, name] = k.split('::'); const S = steps[wf][name]; if (!S._ran) { if (runFailed) S.skippedInFailedRuns++; else S.skippedInGreenRuns++; } }
    }
    const workflows = {};
    for (const wf of Object.keys(yamlAtSha)) {
        const y = yamlSteps(yamlAtSha[wf]);
        const st = steps[wf] || {};
        for (const [name, S] of Object.entries(st)) {
            delete S._ran;
            const decl = y.find(s => s.name === name);
            S.clause = decl ? decl.ifs : null;
            S.class = S.ran === 0 ? 'never' : S.ran === S.existed ? 'always' : 'sometimes';
            if (S.class === 'sometimes') S.why = why(S.clause, S.skippedInGreenRuns === 0);
        }
        for (const J of Object.values(jobs[wf] || {})) { delete J._ran; J.class = J.ran === 0 ? 'never' : J.ran === J.existed ? 'always' : 'sometimes'; }
        workflows[wf] = {
            runs: runs.filter(r => r.workflow === wf).length,
            stepsInFile: y.map(s => s.name),
            inFileInNoRun: y.filter(s => !st[s.name]).map(s => s.name),
            steps: st, jobs: jobs[wf] || {}
        };
    }
    return workflows;
};

const fetchAll = () => {
    const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const wfs = readdirSync(path.join(ROOT, '.github/workflows')).filter(f => f.endsWith('.yml'));
    const runs = [];
    for (const wf of wfs) {
        const list = JSON.parse(gh(['run', 'list', '--repo', repo, '--workflow', wf, '--limit', String(wf === 'build.yml' ? 60 : RUNS_PER_WORKFLOW), '--json', 'databaseId,headSha,headBranch,status,conclusion,createdAt']))
            .filter(r => r.status === 'completed' && r.conclusion !== 'cancelled');
        // build.yml: the last GREEN_MAIN green main runs plus every branch dispatch in the window
        const picked = wf === 'build.yml' ? [...list.filter(r => r.headBranch === 'main' && r.conclusion === 'success').slice(0, GREEN_MAIN), ...list.filter(r => r.headBranch !== 'main')] : list;
        for (const r of picked) {
            const jobs = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${r.databaseId}/jobs?per_page=100`])).jobs.map(j => ({name: j.name, conclusion: j.conclusion, steps: (j.steps || []).map(s => ({name: s.name, conclusion: s.conclusion}))}));
            runs.push({run: r.databaseId, workflow: wf, branch: r.headBranch, sha: r.headSha.slice(0, 9), createdAt: r.createdAt, jobs});
        }
    }
    // the YAML at the newest main run's sha, per workflow (a step younger than that is not judged)
    const newestMain = runs.filter(r => r.branch === 'main').sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)[0];
    const yamlAtSha = {};
    for (const wf of wfs) { try { yamlAtSha[wf] = execFileSync('git', ['show', `${newestMain.sha}:.github/workflows/${wf}`], {cwd: ROOT, encoding: 'utf8'}); } catch { yamlAtSha[wf] = ''; } }
    return {repo, runs, newestMain, yamlAtSha, wfs};
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    if (process.argv.includes('--fetch')) {
        const {repo, runs, newestMain, yamlAtSha, wfs} = fetchAll();
        const workflows = census(runs, yamlAtSha);
        const body = {generatedAt: new Date().toISOString(), repo, headSha: newestMain.sha, newestMainRun: newestMain.run, runs: runs.map(r => ({run: r.run, workflow: r.workflow, branch: r.branch, sha: r.sha})), workflowsInTree: wfs, workflows};
        writeFileSync(READINGS, JSON.stringify(body, null, 1) + '\n');
        const all = Object.values(workflows).flatMap(w => Object.values(w.steps));
        console.log(`ci-step-census: ${runs.length} runs, ${wfs.length} workflows, ${all.length} steps — never ${all.filter(s => s.class === 'never').length}, sometimes ${all.filter(s => s.class === 'sometimes').length}, always ${all.filter(s => s.class === 'always').length}; in file at ${newestMain.sha} but in no run: ${Object.values(workflows).reduce((a, w) => a + w.inFileInNoRun.length, 0)}`);
    }
    const readings = JSON.parse(readFileSync(READINGS, 'utf8'));
    const pointers = parseStepPointers(readFileSync(path.join(ROOT, 'LANES.md'), 'utf8'));
    const problems = judgeSteps(readings, pointers);
    for (const p of problems) console.log(`  ${p}`);
    console.log(problems.length ? `${problems.length} step(s)/job(s)/workflow(s) nobody runs` : 'every workflow step and job runs somewhere the readings can see');
    if (process.argv.includes('--check') && problems.length) process.exit(1);
}
