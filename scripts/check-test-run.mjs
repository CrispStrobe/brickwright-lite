#!/usr/bin/env node
/**
 * Did the test run REPORT ON what it was handed?
 *
 * Two lies this repo has already caught in its own runner, each once by luck:
 *
 *   - build.yml:363 (run 32779945069): a `describe` body threw while the suite
 *     was being CONSTRUCTED. The runner printed `not ok 662 …` and then
 *     `# tests 1014  # pass 1013  # fail 0`, and the step went green.
 *   - 2026-09-05, a node_modules-less worktree: every acorn-dependent file
 *     threw on import, printed `not ok`, and the summary said `# tests 0
 *     # fail 0` — "nothing to see" rather than "nothing ran".
 *
 * The workflow's grep for `^not ok` catches the first shape. Nothing catches a
 * suite that VANISHES: a file the glob stopped matching, or one that produced
 * zero tests, is the same green with a smaller number, and no grep sees it.
 *
 * So, from the TAP the runner printed and the per-file census written alongside
 * it by scripts/lib/test-census-reporter.mjs (node's own reporters flatten a
 * multi-file run — TAP and junit both lose the file):
 *
 *   1. the summary exists — a runner that died before summarising is not green;
 *   2. any `not ok` at any depth is COUNTED: `# fail` + `# cancelled` > 0;
 *   3. every file scripts/list-tests.mjs says belongs to this set appears in the
 *      census with at least one test, and nothing else appears — a file that
 *      vanished, or that constructed nothing, is a failure by name;
 *   4. `# tests` is at least the file count (each file carries ≥1 test).
 *
 * The list of files comes from the same module the npm scripts use, so the
 * runner and its auditor cannot disagree about what was supposed to run.
 *
 *   node scripts/check-test-run.mjs --set fast --tap /tmp/unit.tap --census test-results/fast.census.json
 */
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {listTests} from './list-tests.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : null).filter(Boolean));
const set = args.set || 'fast';
if (!args.tap) {
    console.error('usage: check-test-run.mjs --set fast|corpus|all --tap <file> --census <file>');
    process.exit(2);
}
const expected = listTests(set);
let failed = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
};

// --- TAP ---
const tap = readFileSync(args.tap, 'utf8');
const lines = tap.split('\n');
const summary = {};
for (const l of lines) {
    const m = l.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/);
    if (m) summary[m[1]] = Number(m[2]);
}
check('the runner printed a summary', 'tests' in summary && 'fail' in summary,
    'tests' in summary ? `tests ${summary.tests}, pass ${summary.pass}, fail ${summary.fail}, cancelled ${summary.cancelled ?? 0}`
        : 'no `# tests` / `# fail` lines — the runner died before summarising, and a partial TAP reads as green to a grep');
const notOk = lines.filter(l => /^\s*not ok \d+/.test(l));
const counted = (summary.fail ?? 0) + (summary.cancelled ?? 0);
check('every `not ok` is counted by the summary', notOk.length === 0 || counted > 0,
    notOk.length === 0 ? 'no failures' : counted > 0 ? `${notOk.length} not-ok line(s), summary counts ${counted}`
        : `${notOk.length} not-ok line(s) but # fail 0 / # cancelled 0 — a suite threw while being CONSTRUCTED (build.yml:363): ${notOk[0].trim().slice(0, 100)}`);
check(`# tests is at least the ${expected.length} files in set "${set}"`, (summary.tests ?? 0) >= expected.length,
    `${summary.tests ?? 0} tests reported`);

// --- census: per-file accounting ---
if (!args.census) {
    check('a census file was given', false, 'pass --census <file> written by scripts/lib/test-census-reporter.mjs');
} else if (!existsSync(args.census)) {
    check('the census reporter wrote its file', false,
        `${args.census} does not exist — the reporter was not on the command line, or the runner died before finishing`);
} else {
    let census;
    try { census = JSON.parse(readFileSync(args.census, 'utf8')); } catch (e) { census = null; }
    check('the census file parses', Boolean(census && census.files),
        census ? `${Object.keys(census.files || {}).length} files, ${census.events} events` : 'not JSON');
    if (census && census.files) {
        const byBase = new Map(Object.entries(census.files).map(([f, c]) => [path.basename(f), c]));
        const missing = expected.filter(f => !byBase.has(path.basename(f)));
        const empty = expected.filter(f => byBase.has(path.basename(f)) && byBase.get(path.basename(f)).tests === 0);
        const unexpected = [...byBase.keys()].filter(b => !expected.some(f => path.basename(f) === b));
        check(`every one of the ${expected.length} files in set "${set}" reported tests`, missing.length === 0 && empty.length === 0,
            [...missing.map(f => `${f}: not in the run — vanished from the glob or never started`),
                ...empty.map(f => `${f}: 0 tests — constructed nothing`)].join('; ') || `${byBase.size} files, all with tests`);
        check('nothing ran that the set does not list', unexpected.length === 0,
            unexpected.length ? unexpected.join(', ') : 'no strays');
        const censusFailed = Object.values(census.files).reduce((a, c) => a + c.failed, 0);
        check('the census and the summary agree on whether anything failed',
            (censusFailed > 0) === (counted > 0),
            `census failed ${censusFailed}, summary fail+cancelled ${counted}`);
    }
}

if (failed) {
    console.error(`\n${failed} check(s) failed: the run did not report on what it was handed.`);
    process.exit(1);
}
console.log('\ncheck-test-run: the run accounts for its files');
