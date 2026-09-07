/**
 * Every test CI skips points at the ONE place it executes (plan T13).
 *
 * Measured 2026-09-07 from the unit step's TAP on 20 green main runs: 21
 * skipped tests, 18 of them never executed in any run they existed in, five
 * files with no record anywhere of ever running. A skip reason is honest about
 * one run; the pointer — LANES.md, "Skips that execute elsewhere", keyed by file
 * and the VERBATIM reason — is what says the gate runs at all. This test holds
 * the readings docs/generated/ci-skip-census.json (scripts/gen-ci-skips.mjs
 * --fetch, never hand-edited) to the pointers, and proves the shapes that must
 * redden: a skip with no pointer, a reason edited without the pointer moving,
 * a pointer without a date, a workflow pointer that names nothing, and a census
 * reporter that lost a skip. check-test-run.mjs applies the same judge to the
 * LIVE run's census on every unit step.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parsePointers, judgeSkips, skipsFromCensus, tapSkips, expiredTemporary, HEADING} from '../scripts/lib/skip-pointers.mjs';
import {census, classify, fileFor, reasonLive, READINGS} from '../scripts/gen-ci-skips.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const lanes = readFileSync(path.join(ROOT, 'LANES.md'), 'utf8');
const readings = JSON.parse(readFileSync(READINGS, 'utf8'));
const pointers = parsePointers(lanes);

test('the readings are the generator\'s and name their runs; every skipped test resolved to a file', () => {
    assert.ok(readings.runs && readings.runs.length >= 10 && readings.runs.every(r => Number.isInteger(r.run)), 'the readings name the runs they came from');
    const unresolved = readings.tests.filter(t => t.file === '?').map(t => t.name);
    assert.deepEqual(unresolved, [], 'skipped test(s) whose name no file holds — the name is built at run time; put the literal in the file:\n  ' + unresolved.join('\n  '));
    for (const t of readings.tests) assert.ok(t.existed >= t.skipped && t.executed === t.existed - t.skipped, `${t.name}: existed/skipped/executed do not add up`);
});

test('every skipped test in the readings points at where it executes; pointers are dated and their workflows name the file', t => {
    assert.ok(pointers.length > 0, `no "${HEADING}" section in LANES.md`);
    // Readings are history. A reason the file's source no longer carries was retired since the
    // runs were read; its successor is judged LIVE by check-test-run on the next run's census.
    const retired = readings.tests.filter(x => !x.reasonLive);
    if (retired.length) t.diagnostic(`retired since the readings (judged live in CI): ${retired.map(x => `${path.basename(x.file)} "${x.reason.slice(0, 50)}…"`).join('; ')}`);
    const v = judgeSkips(readings.tests.filter(x => x.reasonLive).map(x => ({file: x.file, name: x.name, reason: x.reason})), pointers, {root: ROOT});
    assert.deepEqual(v.undated, [], v.undated.join('\n'));
    assert.deepEqual(v.deadWorkflow, [], v.deadWorkflow.join('\n'));
    assert.deepEqual(v.moved, [], 'reason(s) edited without the pointer moving:\n  ' + v.moved.join('\n  '));
    assert.deepEqual(v.unpointed, [], 'gate(s) nobody runs:\n  ' + v.unpointed.join('\n  '));
});

test('a TEMPORARY pointer expires by the readings: once its test has executed in CI, the line is red (ratchet)', () => {
    const expired = expiredTemporary(pointers, readings.tests);
    assert.deepEqual(expired, [], 'TEMPORARY pointer(s) whose test now executes in CI — remove them:\n  ' + expired.join('\n  '));
    // mutation: the same pointers against readings where one temporary test ran once
    const tmp = pointers.find(p => /\bTEMPORARY\b/.test(p.where));
    if (tmp) {
        const ran = readings.tests.map(t => path.basename(t.file) === path.basename(tmp.file) && t.reason === tmp.reason ? {...t, executed: 1} : t);
        assert.match(expiredTemporary(pointers, ran)[0], /TEMPORARY pointer but ".*" executed in CI in 1 of \d+ run\(s\) — remove the line/);
        const gone = readings.tests.filter(t => !(path.basename(t.file) === path.basename(tmp.file) && t.reason === tmp.reason));
        assert.match(expiredTemporary(pointers, gone)[0], /no such skip any more — remove the line/);
    }
    const synthetic = parsePointers(`${HEADING}\n- test/x.test.mjs :: X unset :: box 2026-09-07 someone — TEMPORARY until CI fetches X\n- test/y.test.mjs :: Y unset :: box 2026-09-07 someone\n`);
    assert.deepEqual(expiredTemporary(synthetic, [{file: 'test/x.test.mjs', name: 'a', reason: 'X unset', existed: 5, skipped: 5, executed: 0}]), []);
    assert.equal(expiredTemporary(synthetic, [{file: 'test/x.test.mjs', name: 'a', reason: 'X unset', existed: 5, skipped: 4, executed: 1}]).length, 1);
    assert.equal(expiredTemporary(synthetic, [{file: 'test/y.test.mjs', name: 'b', reason: 'Y unset', existed: 5, skipped: 0, executed: 5}]).length, 1, 'x has no reading at all → expired; y is not temporary → nothing');
});

test('mutation: the five shapes that must redden', () => {
    const skips = [{file: 'test/x.test.mjs', name: 'a', reason: 'X unset'}];
    const good = parsePointers(`${HEADING}\n\n- test/x.test.mjs :: X unset :: box somewhere 2026-09-07 someone\n`);
    assert.deepEqual(judgeSkips(skips, good), {unpointed: [], moved: [], undated: [], deadWorkflow: []});
    // no pointer at all
    assert.match(judgeSkips(skips, []).unpointed[0], /x\.test\.mjs: "a" skipped \("X unset"\) and nothing says where it executes — a gate nobody runs/);
    // the reason moved
    const moved = judgeSkips([{file: 'test/x.test.mjs', name: 'a', reason: 'X is not set'}], good);
    assert.equal(moved.unpointed.length, 0); assert.match(moved.moved[0], /"X is not set" but the pointer\(s\) at LANES\.md:3 vouch for "X unset" — the reason moved/);
    // undated
    const undated = parsePointers(`${HEADING}\n- test/x.test.mjs :: X unset :: box somewhere, someone\n`);
    assert.match(judgeSkips(skips, undated).undated[0], /a pointer without a date is a claim nobody can check/);
    // a workflow pointer that names nothing / does not exist
    const wf = parsePointers(`${HEADING}\n- test/x.test.mjs :: X unset :: workflow .github/workflows/build.yml 2026-09-07\n- test/x.test.mjs :: Y unset :: workflow .github/workflows/no-such.yml 2026-09-07\n- test/x.test.mjs :: Z unset :: workflow .github/workflows/build.yml step 'Run unit tests' 2026-09-07\n- test/x.test.mjs :: W unset :: workflow .github/workflows/build.yml step 'No such step' 2026-09-07\n`);
    const dw = judgeSkips([], wf, {root: ROOT}).deadWorkflow;
    assert.equal(dw.length, 3, dw.join('\n')); assert.match(dw[0], /never names x\.test\.mjs/); assert.match(dw[1], /does not exist/); assert.match(dw[2], /nor a step 'No such step'/);
    // the section ends at the next heading
    assert.equal(parsePointers(`${HEADING}\n- test/x.test.mjs :: r :: box 2026-09-07\n## next\n- test/y.test.mjs :: r :: box 2026-09-07\n`).length, 1);
    // a live pointer is exact: the same file with a whitespace-different reason is "moved", not matched
    const live = pointers[0];
    assert.equal(judgeSkips([{file: live.file, name: 'n', reason: live.reason + ' '}], pointers).moved.length, 1);
});

test('the census reporter records every skip form with its reason, and the TAP cross-check sees a lost one', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skip-census-'));
    writeFileSync(path.join(dir, 'a.test.mjs'), [
        "import test from 'node:test';",
        "test('runs', () => {});",
        "test('opt skip', {skip: 'because X'}, () => {});",
        "test('bare skip', {skip: true}, () => {});",
        "test('t.skip', t => { t.skip('inside'); });"
    ].join('\n'));
    const out = path.join(dir, 'census.json'), tap = path.join(dir, 'run.tap');
    // The spawn must not inherit NODE_TEST_CONTEXT: under it the inner `node --test` behaves as a
    // runner CHILD (frames on stdout, no reporter file) — the census file simply never appears.
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const tapText = execFileSync(process.execPath, ['--test', '--test-reporter=tap', '--test-reporter-destination=stdout', `--test-reporter=${path.join(ROOT, 'scripts/lib/test-census-reporter.mjs')}`, `--test-reporter-destination=${out}`, path.join(dir, 'a.test.mjs')], {encoding: 'utf8', env});
    writeFileSync(tap, tapText);
    const c = JSON.parse(readFileSync(out, 'utf8'));
    const skips = skipsFromCensus(c);
    assert.deepEqual(skips.map(s => [path.basename(s.file), s.name, s.reason]), [['a.test.mjs', 'opt skip', 'because X'], ['a.test.mjs', 'bare skip', '(no reason)'], ['a.test.mjs', 't.skip', 'inside']]);
    assert.equal(tapSkips(tapText).length, 3, 'the TAP printed three # SKIP lines');
    // a census that lost a skip disagrees with the TAP by count
    const lost = {files: {[path.join(dir, 'a.test.mjs')]: {...Object.values(c.files)[0], skipped: skips.slice(1)}}};
    assert.notEqual(skipsFromCensus(lost).length, tapSkips(tapText).length);
});

test('the classifier and the census over TAP text (mutation)', () => {
    const files = [['test/x.test.mjs', "test('alpha runs here', ...)\ntest('beta needs Z', ...)"]];
    const logs = {
        1: {build: '# Subtest: alpha runs here\nok 1 - alpha runs here\n# Subtest: beta needs Z\nok 2 - beta needs Z # SKIP Z unset'},
        2: {build: '# Subtest: alpha runs here\nok 1 - alpha runs here # SKIP Z unset\n# Subtest: beta needs Z\nok 2 - beta needs Z # SKIP Z unset'}
    };
    const rows = census(logs, files);
    assert.deepEqual(rows.map(r => [r.name, r.existed, r.skipped, r.executed, r.class, r.file]), [['alpha runs here', 2, 1, 1, 'b', 'test/x.test.mjs'], ['beta needs Z', 2, 2, 0, 'a', 'test/x.test.mjs']]);
    assert.equal(classify({executed: 0, reason: 'below the corpus floor of 5'}), 'c');
    // a name built at run time is found by its literal windows
    // (a synthetic name: quoting a REAL test name here would make this file its "owner" — the
    // generator excludes this file (SELF) for that reason, and the fixture stays synthetic too)
    const tpl = [['test/t.test.mjs', "for (const s of scripts) test(`${s} --dir <somewhere else> declines politely and leaves widgets.json untouched`, {skip: !dir && `${VAR} unset`}, ...)"]];
    assert.deepEqual(fileFor('sync-x.mjs --dir <somewhere else> declines politely and leaves widgets.json untouched', tpl), ['test/t.test.mjs']);
    assert.deepEqual(fileFor('a name from nowhere at all, really', tpl), ['?']);
    assert.equal(reasonLive('SB3_CREATOR_DIR unset', "const VAR = 'SB3_CREATOR_DIR'; skip: `${VAR} unset`"), true, 'a templated reason is live while its template is');
    assert.equal(reasonLive('no corpus checkout at /mnt/x — set I8086_CORPUS', "skip: 'RETRO_CORPUS_8086_DIR unset — not verified here'"), false, 'a reason the source no longer holds is retired');
    assert.equal(reasonLive('anything at all', "const s = 'utf8'; const t = `${a} b`;"), false, 'a short segment vouches for nothing');
    assert.equal(census({1: {build: 'ok 1 - nobody holds this name # SKIP why'}}, files)[0].file, '?');
});
