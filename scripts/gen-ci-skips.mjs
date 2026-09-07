#!/usr/bin/env node
/**
 * The CI skip census (plan T13): which tests CI skips, how often, and whether
 * they have EVER executed there — read from the unit and corpus steps' TAP on
 * the last green main runs, never typed.
 *
 *   node scripts/gen-ci-skips.mjs --fetch    read the last RUNS green main runs (gh api) and
 *                                            REWRITE docs/generated/ci-skip-census.json
 *   node scripts/gen-ci-skips.mjs --check    exit 1 if a never-executed test has no pointer
 *
 * Per skipped test: the runs it EXISTED in (its `# Subtest:` line), the runs it
 * was SKIPPED in, the runs it EXECUTED in, and its class —
 *   a  never executed in any run it existed in (permanent in CI),
 *   b  executed in some runs (environment-dependent: the reason names the variable),
 *   c  skipped by a corpus/floor rule (the reason says so).
 * The file is found by the test-name literal in test/ (the TAP carries no file);
 * an unmatched name is written as "?" and the test reddens on it.
 *
 * Measured 2026-09-07 (runs 34099997406 … 34131143343): 21 skipped, 18 class a,
 * 3 class b (all BW_BOARD_DIR), 0 class c; corpus job 0 skips.
 */
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parsePointers, judgeSkips} from './lib/skip-pointers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const READINGS = path.join(ROOT, 'docs', 'generated', 'ci-skip-census.json');
const RUNS = 20, JOBS = new Set(['build', 'corpus']);
const gh = args => execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 256 << 20});

export const classify = (t) => t.executed > 0 ? 'b' : /\b(floor|corpus rule|sample)\b/i.test(t.reason) ? 'c' : 'a';

/**
 * Which string literals does a source file hold, as their STATIC segments? A
 * template `${f} --dir <x> refuses` is [" --dir <x> refuses"]; a plain string is
 * one segment. A run-time value (a TAP name, a skip reason) MATCHES a literal
 * when every segment occurs in it, in order, and some segment is at least
 * `minSeg` characters — so a name built at run time is still owned by the file
 * that holds its template, and a reason is still live while its template is.
 */
export const literalSegments = src => {
    const out = [];
    let i = 0;
    const n = src.length;
    // A template literal, with `${…}` nesting (a template inside a placeholder
    // is the shape pin-only-moves-with-flag uses); returns [segments, end].
    const template = start => {
        const segs = []; let cur = ''; let j = start + 1;
        while (j < n) {
            const c = src[j];
            if (c === '\\') { cur += src[j + 1] || ''; j += 2; continue; }
            if (c === '`') { if (cur) segs.push(cur); return [segs, j + 1]; }
            if (c === '$' && src[j + 1] === '{') {
                if (cur) segs.push(cur); cur = '';
                let depth = 1; j += 2;
                while (j < n && depth) {
                    if (src[j] === '`') { j = template(j)[1]; continue; }
                    if (src[j] === '{') depth++; else if (src[j] === '}') depth--;
                    j++;
                }
                continue;
            }
            cur += c; j++;
        }
        if (cur) segs.push(cur);
        return [segs, j];
    };
    while (i < n) {
        const c = src[i];
        if (c === '`') { const [segs, end] = template(i); if (segs.length) out.push(segs); i = end; continue; }
        if (c === "'" || c === '"') {
            let j = i + 1, cur = '';
            while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { cur += src[j + 1] || ''; j += 2; } else { cur += src[j]; j++; } }
            if (cur) out.push([cur]);
            i = j + 1; continue;
        }
        if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; } // a comment's quotes are not literals
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
        i++;
    }
    return out;
};
/**
 * How much of a run-time value do a file's literals COVER? Each literal's
 * segments are located in order in the value; the characters they land on are
 * covered. "STC_COMPILER_DIR unset" is fully covered by the plain literal
 * 'STC_COMPILER_DIR' plus the template `${envVar} unset`; a retired reason is
 * covered only by stray words (measured: the retired 8086 corpus reason
 * scored 0.18 against its file; a live firmware reason with the file name in a
 * placeholder scored 0.76). A value belongs to a source at COVER or more.
 */
export const COVER = 0.6; // a placeholder can be a 29-character firmware file name inside a 118-character reason
export const coverage = (value, segsList) => {
    const hit = new Uint8Array(value.length);
    for (const segs of segsList) {
        let at = 0; const spans = [];
        for (const x of segs) { const i = value.indexOf(x, at); if (i < 0) { spans.length = 0; break; } spans.push([i, i + x.length]); at = i + x.length; }
        for (const [s, e] of spans) hit.fill(1, s, e);
    }
    return value.length ? hit.reduce((n, b) => n + b, 0) / value.length : 0;
};
export const literalMatches = (value, segsList) => coverage(value, segsList) >= COVER;
/** The census machinery may not vouch for itself: a test that QUOTES a test name is not the test's file. */
export const SELF = new Set(['test/ci-skip-census.test.mjs']);
const segsOf = new WeakMap();
const segs = entry => { if (!segsOf.has(entry)) segsOf.set(entry, literalSegments(entry[1])); return segsOf.get(entry); };
/** The test file that owns a TAP name: exact, else the file whose literals cover it best (ties: all of them). */
export const fileFor = (name, testFiles) => {
    const exact = testFiles.filter(([, src]) => src.includes(name)).map(([f]) => f);
    if (exact.length) return exact;
    const scored = testFiles.map(entry => [entry[0], coverage(name, segs(entry))]).filter(([, c]) => c >= COVER);
    const best = Math.max(0, ...scored.map(([, c]) => c));
    const owners = scored.filter(([, c]) => c === best).map(([f]) => f);
    return owners.length ? owners : ['?'];
};
/** Is a reason still what the file's source says — exact, or covered by the file's literals? */
export const reasonLive = (reason, src) => src.includes(reason) || literalMatches(reason, literalSegments(src));
/** Pure: from {run: {job: tapText}} to the census rows. */
export const census = (logs, testFiles) => {
    const exists = new Map(), skipped = new Map(), reasons = new Map(), jobOf = new Map();
    for (const [run, jobs] of Object.entries(logs)) for (const [job, text] of Object.entries(jobs)) {
        for (const raw of text.split('\n')) {
            const l = raw.replace(/^\d{4}-\d\d-\d\dT\S+ /, ''); // the Actions log's timestamp, when there is one
            const sub = l.match(/^# Subtest: (.*)$/);
            if (sub) { (exists.get(sub[1]) || exists.set(sub[1], new Set()).get(sub[1])).add(run); continue; }
            const m = l.match(/^\s*(?:not )?ok \d+ - (.*?) # SKIP ?(.*)$/);
            if (m) { (skipped.get(m[1]) || skipped.set(m[1], new Set()).get(m[1])).add(run); reasons.set(m[1], m[2] || '(no reason)'); jobOf.set(m[1], job); }
        }
    }
    const rows = [...skipped].map(([name, s]) => {
        const ex = exists.get(name) || new Set();
        const file = fileFor(name, testFiles).join('+');
        const src = (testFiles.find(([f]) => f === file) || [])[1] || '';
        const t = {job: jobOf.get(name), name, reason: reasons.get(name), file, existed: ex.size, skipped: s.size, executed: [...ex].filter(r => !s.has(r)).length, reasonLive: reasonLive(reasons.get(name), src)};
        t.class = classify(t);
        return t;
    });
    return rows.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
};

const fetchLogs = () => {
    const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
    const runs = JSON.parse(gh(['run', 'list', '--repo', repo, '--workflow', 'build.yml', '--branch', 'main', '--status', 'success', '--limit', String(RUNS), '--json', 'databaseId,headSha']));
    const logs = {};
    for (const r of runs) {
        const jobs = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${r.databaseId}/jobs?per_page=100`])).jobs.filter(j => JOBS.has(j.name));
        logs[r.databaseId] = {};
        for (const j of jobs) {
            const text = gh(['api', `repos/${repo}/actions/jobs/${j.id}/logs`]);
            logs[r.databaseId][j.name] = text.split('\n').filter(l => /(# Subtest: |# SKIP|^\S+ # skipped )/.test(l)).join('\n');
        }
    }
    return {repo, runs: runs.map(r => ({run: r.databaseId, sha: r.headSha.slice(0, 9)})), logs};
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const testFiles = readdirSync(path.join(ROOT, 'test')).filter(f => f.endsWith('.test.mjs') && !SELF.has(`test/${f}`)).map(f => [`test/${f}`, readFileSync(path.join(ROOT, 'test', f), 'utf8')]);
    if (process.argv.includes('--fetch')) {
        const {repo, runs, logs} = fetchLogs();
        const tests = census(logs, testFiles);
        writeFileSync(READINGS, JSON.stringify({generatedAt: new Date().toISOString(), repo, branch: 'main', runs, jobs: [...JOBS], tests}, null, 1) + '\n');
        // `--fetch` REWRITES A TRACKED FILE. It reads like a read-only flag and is
        // not one: brickwright-lite-ea ran it inside a lane worktree on 2026-09-07,
        // `git add -A` swept 143 lines of readings into an unrelated source commit,
        // and the rebase conflict that followed cost a diagnosis. So the file is
        // named on stdout every time, with what to do about it.
        console.log(`::notice::${path.relative(ROOT, READINGS)} was REWRITTEN by --fetch. It is tracked: commit it on its own, or \`git checkout\` it before committing unrelated work — never sweep it in with \`git add -A\`.`);
        console.log(`ci-skip-census: ${tests.length} skipped test(s) over ${runs.length} green runs — class a ${tests.filter(t => t.class === 'a').length}, b ${tests.filter(t => t.class === 'b').length}, c ${tests.filter(t => t.class === 'c').length}; written to ${path.relative(ROOT, READINGS)}`);
    }
    const readings = JSON.parse(readFileSync(READINGS, 'utf8'));
    const pointers = parsePointers(readFileSync(path.join(ROOT, 'LANES.md'), 'utf8'));
    // Readings are history: a reason the file's source no longer carries was retired since, and the
    // live check (check-test-run, on the run's own census) judges its successor. Reported, not judged.
    const retired = readings.tests.filter(t => !t.reasonLive);
    for (const t of retired) console.log(`  retired since the readings: ${path.basename(t.file)} "${t.reason.slice(0, 60)}…"`);
    const v = judgeSkips(readings.tests.filter(t => t.reasonLive).map(t => ({file: t.file, name: t.name, reason: t.reason})), pointers, {root: ROOT});
    const problems = [...v.unpointed, ...v.moved, ...v.undated, ...v.deadWorkflow, ...readings.tests.filter(t => t.file === '?').map(t => `"${t.name}": no test file holds this name — the name is built at run time; put the literal in the file`)];
    for (const p of problems) console.log(`  ${p}`);
    console.log(problems.length ? `${problems.length} skipped test(s) without a live pointer` : 'every skipped test in CI points at where it executes');
    if (process.argv.includes('--check') && problems.length) process.exit(1);
}
