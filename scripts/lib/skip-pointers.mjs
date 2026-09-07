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
