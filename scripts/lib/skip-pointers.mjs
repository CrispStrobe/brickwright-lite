/**
 * A skipped test in CI must point at the ONE place it does execute (plan T13).
 *
 * Measured 2026-09-07 over the last 20 green main runs: 21 tests skipped in the
 * unit step, 18 of them in EVERY run they existed in — twelve for a firmware
 * the same workflow fetches one job over, four for sibling checkouts only a
 * box has, one for a variable nothing sets, one for a corpus at an absolute box
 * path, one for a network differential. Five files had no record anywhere of
 * ever having run. A skip with a reason is honest about THIS run; it says
 * nothing about whether the gate runs at all. The pointer does.
 *
 * The pointer lives in LANES.md under the heading "## Skips that execute
 * elsewhere", one line per (file, reason):
 *
 *   - test/<file>.test.mjs :: <the skip reason, VERBATIM> :: <where> <YYYY-MM-DD> <who>
 *
 * `where` is either `box` (a run on a named machine with the precondition met,
 * dated) or `workflow <.github/workflows/x.yml>` (a workflow that runs the file
 * with the precondition met — the file must exist and name the test, or name
 * the `step '<name>'` the pointer quotes, for a step that sets the variable
 * the whole set then runs under). The key
 * is the file AND the reason string exactly as the TAP prints it: a reason
 * edited in the test without the pointer moving is red naming both, because
 * the pointer vouched for a different skip.
 *
 * Nothing here is a kept list of tests: the skips come from the run's own
 * census (scripts/lib/test-census-reporter.mjs, `skipped` per file), or from
 * the readings docs/generated/ci-skip-census.json that scripts/gen-ci-skips.mjs
 * builds from CI's TAP.
 */
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

export const HEADING = '## Skips that execute elsewhere';
const POINTER = /^- (test\/\S+\.test\.mjs) :: (.+?) :: (.+)$/;
const DATE = /\b(20\d\d-\d\d-\d\d)\b/;
const WORKFLOW = /workflow (\.github\/workflows\/[\w.-]+\.ya?ml)/;
const STEP = /step '([^']+)'/;

/** @returns {{file, reason, where, date: string|null, workflow: string|null, line: number}[]} */
export const parsePointers = text => {
    const lines = text.split('\n');
    const at = lines.indexOf(HEADING);
    if (at < 0) return [];
    const out = [];
    for (let i = at + 1; i < lines.length; i++) {
        if (/^## /.test(lines[i])) break;
        const m = lines[i].match(POINTER);
        if (!m) continue;
        const d = m[3].match(DATE), w = m[3].match(WORKFLOW), st = m[3].match(STEP);
        out.push({file: m[1], reason: m[2], where: m[3], date: d ? d[1] : null, workflow: w ? w[1] : null, step: st ? st[1] : null, line: i + 1});
    }
    return out;
};

/**
 * Pure verdict over skips [{file, name, reason}] and pointers.
 * @returns {{unpointed: string[], moved: string[], undated: string[], deadWorkflow: string[]}}
 */
export const judgeSkips = (skips, pointers, {root = null} = {}) => {
    const unpointed = [], moved = [], undated = [], deadWorkflow = [];
    for (const p of pointers) {
        if (!p.date) undated.push(`LANES.md:${p.line} ${p.file} — a pointer without a date is a claim nobody can check`);
        if (p.workflow && root) {
            const wf = path.join(root, p.workflow);
            if (!existsSync(wf)) deadWorkflow.push(`LANES.md:${p.line} ${p.file} → ${p.workflow} does not exist`);
            else {
                const text = readFileSync(wf, 'utf8');
                if (!text.includes(path.basename(p.file)) && !(p.step && text.includes(`name: ${p.step}`))) deadWorkflow.push(`LANES.md:${p.line} ${p.file} → ${p.workflow} never names ${path.basename(p.file)}${p.step ? ` nor a step '${p.step}'` : ''}`);
            }
        }
    }
    for (const s of skips) {
        const file = s.file.replace(/^.*\/(test\/)/, '$1');
        const base = path.basename(file);
        const same = pointers.filter(p => path.basename(p.file) === base);
        if (same.some(p => p.reason === s.reason)) continue;
        if (same.length) moved.push(`${base}: "${s.name}" skips with "${s.reason}" but the pointer(s) at LANES.md:${same.map(p => p.line).join(',')} vouch for "${same[0].reason}" — the reason moved; re-verify where it executes and move the pointer`);
        else unpointed.push(`${base}: "${s.name}" skipped ("${s.reason}") and nothing says where it executes — a gate nobody runs; add a pointer under "${HEADING}" in LANES.md`);
    }
    return {unpointed, moved, undated, deadWorkflow};
};

/** Skips from a census file's `files` map: [{file, name, reason}]. */
export const skipsFromCensus = census => Object.entries(census.files || {}).flatMap(([file, c]) => (c.skipped || []).map(s => ({file, name: s.name, reason: s.reason})));

/** `# SKIP` lines in a TAP text, for the cross-check against the census. */
export const tapSkips = tap => tap.split('\n').map(l => l.match(/^\s*(?:not )?ok \d+ - (.*?) # SKIP ?(.*)$/)).filter(Boolean).map(m => ({name: m[1], reason: m[2] || '(no reason)'}));

/**
 * A pointer marked TEMPORARY vouches for a skip that is about to move into CI
 * (the firmware fetch of 2026-09-07). It expires the moment the readings show
 * the test EXECUTED in CI, or show no such skip at all — a ratchet, so the
 * ledger cannot keep a claim past its use. Pure over the readings' tests.
 * @returns {string[]} expired pointers, by line
 */
export const expiredTemporary = (pointers, tests) => pointers
    .filter(p => /\bTEMPORARY\b/.test(p.where))
    .flatMap(p => {
        const base = path.basename(p.file);
        const same = tests.filter(t => path.basename(t.file) === base && t.reason === p.reason);
        if (!same.length) return [`LANES.md:${p.line} ${base}: TEMPORARY pointer but the readings show no such skip any more — remove the line`];
        const ran = same.filter(t => t.executed > 0);
        return ran.length ? [`LANES.md:${p.line} ${base}: TEMPORARY pointer but "${ran[0].name}" executed in CI in ${ran[0].executed} of ${ran[0].existed} run(s) — remove the line`] : [];
    });

// ---- steps (plan T14): the same rule one level up ------------------------------------------
export const STEP_HEADING = '## Steps that run elsewhere';
const STEP_POINTER = /^- (\S+\.ya?ml) :: (.+?) :: (.+)$/;

/** `- <workflow>.yml :: <step or job name> :: <where the condition holds> <date>` lines under STEP_HEADING. */
export const parseStepPointers = text => {
    const lines = text.split('\n');
    const at = lines.indexOf(STEP_HEADING);
    if (at < 0) return [];
    const out = [];
    for (let i = at + 1; i < lines.length; i++) {
        if (/^## /.test(lines[i])) break;
        const m = lines[i].match(STEP_POINTER);
        if (!m) continue;
        const d = m[3].match(DATE);
        out.push({workflow: m[1], name: m[2], where: m[3], date: d ? d[1] : null, line: i + 1});
    }
    return out;
};

/**
 * Pure verdict over the step readings (docs/generated/ci-step-census.json):
 *   - a workflow in the tree with no completed run is "a workflow nobody runs";
 *   - a step in the file at the readings' sha that appears in no run is "a step in no run";
 *   - a step or job that appeared and ran in NO run needs a pointer, else "a step nobody runs";
 *   - a pointer without a date is red.
 * A workflow or step younger than the readings' sha is the caller's to report, not judge.
 */
export const judgeSteps = (readings, pointers) => {
    const out = [];
    for (const p of pointers) if (!p.date) out.push(`LANES.md:${p.line} ${p.workflow} :: ${p.name} — a pointer without a date is a claim nobody can check`);
    const pointed = (wf, name) => pointers.some(p => p.workflow === wf && p.name === name);
    for (const wf of readings.workflowsInTree || []) {
        const w = readings.workflows[wf];
        if (!w || w.runs === 0) { if (!pointed(wf, '*')) out.push(`${wf}: no completed run in the readings — a workflow nobody runs; dispatch it once, or point at where it runs under "${STEP_HEADING}" (name '*')`); continue; }
        for (const name of w.inFileInNoRun) if (!pointed(wf, name)) out.push(`${wf} :: "${name}": in the file at ${w.sourceSha || readings.headSha} but in none of ${w.runs} run(s) — a step in no run`);
        for (const [name, s] of Object.entries(w.steps)) if (s.class === 'never' && !pointed(wf, name)) out.push(`${wf} :: "${name}": appeared in ${s.existed} run(s) and ran in none — a step nobody runs; point at where its condition holds (clause: ${s.clause || 'none'})`);
        for (const [name, j] of Object.entries(w.jobs)) if (j.class === 'never' && !pointed(wf, name)) out.push(`${wf} :: job "${name}": appeared in ${j.existed} run(s) and ran in none — a job nobody runs`);
    }
    return out;
};
