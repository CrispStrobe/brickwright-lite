/**
 * Every workflow step and job runs somewhere the readings can see (plan T14) —
 * T13's rule one level up. docs/generated/ci-step-census.json (scripts/gen-ci-steps.mjs
 * --fetch, never hand-edited) holds, per workflow, the steps in the file at the
 * readings' sha and what each did across the last runs; this test holds it to:
 *
 *   - a workflow in the tree with no completed run → "a workflow nobody runs";
 *   - a step in the file at that sha but in no run → "a step in no run";
 *   - a step or job that appeared and ran in none → a pointer under "Steps that
 *     run elsewhere" in LANES.md (where its condition holds, dated) or red;
 *   - a step younger than the readings is reported, not judged.
 *
 * Measured 2026-09-07 over 247 runs of 10 workflows, 169 steps: none ran in no
 * run it appeared in; 26 ran sometimes, each explained by an upstream failure,
 * a trigger, a tag, a matrix leg, or an outcome guard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {parseStepPointers, judgeSteps, STEP_HEADING} from '../scripts/lib/skip-pointers.mjs';
import {census, yamlSteps, why, workflowSource, READINGS} from '../scripts/gen-ci-steps.mjs';

test('a new workflow sources its own branch run until main has actually run it', () => {
    const main = {workflow: 'old.yml', branch: 'main', sha: 'main', createdAt: '2026-09-08'};
    const branch = {workflow: 'new.yml', branch: 'feature', sha: 'branch', createdAt: '2026-09-07'};
    assert.equal(workflowSource([main, branch], 'new.yml', main), branch);
    const older = {...branch, sha: 'older', createdAt: '2026-09-06'};
    assert.equal(workflowSource([older, branch, main], 'new.yml', main), branch);
    const promoted = {...older, branch: 'main', sha: 'promoted'};
    assert.equal(workflowSource([branch, promoted, main], 'new.yml', main), promoted);
    assert.equal(workflowSource([main], 'unrun.yml', main), main);
});

const ROOT = path.resolve(import.meta.dirname, '..');
const readings = JSON.parse(readFileSync(READINGS, 'utf8'));
const pointers = parseStepPointers(readFileSync(path.join(ROOT, 'LANES.md'), 'utf8'));

test('the readings are the generator\'s: they name their runs and sha, and cover every workflow in the tree', () => {
    assert.ok(readings.headSha && readings.runs.length >= 20 && readings.runs.every(r => Number.isInteger(r.run)), 'the readings name the runs and the sha they were read at');
    const inTree = readdirSync(path.join(ROOT, '.github/workflows')).filter(f => f.endsWith('.yml')).sort();
    const younger = inTree.filter(wf => !readings.workflowsInTree.includes(wf));
    assert.deepEqual(readings.workflowsInTree.filter(wf => !inTree.includes(wf)), [], 'readings for workflow(s) the tree no longer has — regenerate (node scripts/gen-ci-steps.mjs --fetch)');
    assert.deepEqual(younger, [], 'workflow(s) in the tree the readings never saw — regenerate:\n  ' + younger.join('\n  '));
});

test('every step and job runs somewhere the readings can see; steps younger than the readings are reported', t => {
    const problems = judgeSteps(readings, pointers);
    assert.deepEqual(problems, [], 'step(s) nobody runs:\n  ' + problems.join('\n  '));
    // steps in the CURRENT file that the file at the readings' sha did not have: younger, not judged
    const younger = [];
    for (const wf of readings.workflowsInTree) {
        const now = yamlSteps(readFileSync(path.join(ROOT, '.github/workflows', wf), 'utf8')).map(s => s.name);
        for (const n of now) if (!readings.workflows[wf].stepsInFile.includes(n)) younger.push(`${wf} :: ${n}`);
    }
    if (younger.length) t.diagnostic(`younger than the readings (${readings.headSha}), judged on the next --fetch: ${younger.join('; ')}`);
    const all = Object.values(readings.workflows).flatMap(w => Object.values(w.steps));
    for (const s of all.filter(s => s.class === 'sometimes')) assert.ok(s.why, 'a sometimes step carries its why');
});

test('mutation: the four shapes that must redden, and a dated pointer that clears one', () => {
    const base = {headSha: 'abc123456', workflowsInTree: ['a.yml', 'b.yml'], workflows: {
        'a.yml': {runs: 5, stepsInFile: ['one', 'two'], inFileInNoRun: [], steps: {one: {existed: 5, ran: 5, class: 'always'}, two: {existed: 5, ran: 3, class: 'sometimes', why: 'trigger'}}, jobs: {j: {existed: 5, ran: 5, class: 'always'}}},
        'b.yml': {runs: 2, stepsInFile: ['x'], inFileInNoRun: [], steps: {x: {existed: 2, ran: 2, class: 'always'}}, jobs: {}}
    }};
    assert.deepEqual(judgeSteps(base, []), []);
    const never = structuredClone(base); never.workflows['a.yml'].steps.two = {existed: 5, ran: 0, class: 'never', clause: "github.event_name == 'schedule'"};
    assert.match(judgeSteps(never, [])[0], /a\.yml :: "two": appeared in 5 run\(s\) and ran in none — a step nobody runs; point at where its condition holds \(clause: github\.event_name == 'schedule'\)/);
    const ptr = parseStepPointers(`${STEP_HEADING}\n- a.yml :: two :: the schedule trigger at 03:00 UTC, run 123 on 2026-09-07\n`);
    assert.deepEqual(judgeSteps(never, ptr), [], 'a dated pointer clears it');
    const undated = parseStepPointers(`${STEP_HEADING}\n- a.yml :: two :: somewhere, someday\n`);
    assert.match(judgeSteps(never, undated)[0], /a pointer without a date is a claim nobody can check/);
    const inNoRun = structuredClone(base); inNoRun.workflows['a.yml'].inFileInNoRun = ['three']; inNoRun.workflows['a.yml'].stepsInFile.push('three');
    assert.match(judgeSteps(inNoRun, [])[0], /a\.yml :: "three": in the file at abc123456 but in none of 5 run\(s\) — a step in no run/);
    inNoRun.workflows['a.yml'].sourceSha = 'branch123';
    assert.match(judgeSteps(inNoRun, [])[0], /in the file at branch123/);
    const noRuns = structuredClone(base); noRuns.workflows['b.yml'].runs = 0;
    assert.match(judgeSteps(noRuns, [])[0], /b\.yml: no completed run in the readings — a workflow nobody runs/);
    assert.deepEqual(judgeSteps(noRuns, parseStepPointers(`${STEP_HEADING}\n- b.yml :: * :: runs on tags only, last 2026-09-01\n`)), []);
    const job = structuredClone(base); job.workflows['a.yml'].jobs.j = {existed: 5, ran: 0, class: 'never'};
    assert.match(judgeSteps(job, [])[0], /a\.yml :: job "j": appeared in 5 run\(s\) and ran in none — a job nobody runs/);
});

test('the census over runs (mutation): a shard\'s gate that ran one job over RAN; a skip behind a failed job is an upstream failure', () => {
    const yaml = "jobs:\n  browser:\n    steps:\n      - name: gate A\n        if: ${{ matrix.shard == 'heavy' }}\n      - name: gate B\n        if: ${{ matrix.shard == 'light' }}\n      - name: measure\n        if: ${{ github.event_name == 'workflow_dispatch' }}\n";
    const run = (id, branch, aHeavy, bLight, measure, buildOk = true) => ({run: id, workflow: 'w.yml', branch, jobs: [
        {name: 'build', conclusion: buildOk ? 'success' : 'failure', steps: [{name: 'unit', conclusion: buildOk ? 'success' : 'skipped'}]},
        {name: 'browser (heavy)', conclusion: 'success', steps: [{name: 'gate A', conclusion: aHeavy}, {name: 'gate B', conclusion: 'skipped'}, {name: 'measure', conclusion: measure}]},
        {name: 'browser (light)', conclusion: 'success', steps: [{name: 'gate A', conclusion: 'skipped'}, {name: 'gate B', conclusion: bLight}, {name: 'measure', conclusion: measure}]}
    ]});
    const w = census([run(1, 'main', 'success', 'success', 'skipped'), run(2, 'x', 'success', 'success', 'success'), run(3, 'y', 'success', 'success', 'success', false)], {'w.yml': yaml});
    const s = w['w.yml'].steps;
    assert.deepEqual([s['gate A'].class, s['gate B'].class], ['always', 'always'], 'skipped in one shard, ran in the other: ran');
    assert.equal(s.measure.class, 'sometimes'); assert.match(s.measure.why, /^trigger/);
    assert.equal(s.unit.class, 'sometimes'); assert.match(s.unit.why, /^upstream failure/);
    assert.deepEqual(w['w.yml'].jobs.browser, {existed: 3, ran: 3, existedMain: 1, ranMain: 1, class: 'always'});
    assert.deepEqual(w['w.yml'].inFileInNoRun, []);
    const w2 = census([run(1, 'main', 'skipped', 'success', 'skipped')], {'w.yml': yaml});
    assert.equal(w2['w.yml'].steps['gate A'].class, 'never', 'skipped in every shard of every run: never');
    assert.deepEqual(yamlSteps(yaml).map(s => s.name), ['gate A', 'gate B', 'measure']);
    assert.match(why("matrix.os == 'macos-latest'", false), /^matrix/); assert.match(why("startsWith(github.ref, 'refs/tags/')", false), /^tag/); assert.match(why("steps.order.outputs.stale != 'true'", false), /^outcome guard/);
});
