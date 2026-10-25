import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {tapOutcomes} from '../scripts/lib/tap-outcomes.mjs';

test('TAP pending directives do not hide an ordinary or escaped-name failure', () => {
    const rows = tapOutcomes(String.raw`not ok 1 - actual pending # TODO pinned compiler discrepancy
ok 2 - pending body succeeds # TODO still pending
    not ok 3 - construction failure
not ok 4 - name with \# TODO is still a real failure
not ok 5 - lower case pending # todo reason
ok 6 - omitted # SKIP absent
not ok 7 no hyphen construction failure
not ok 8 # TODO no hyphen pending
`);
    assert.deepEqual(rows.filter(row => !row.ok && !row.directive).map(row => row.name),
        ['construction failure', String.raw`name with \# TODO is still a real failure`, 'no hyphen construction failure']);
    assert.equal(rows.filter(row => row.directive === 'TODO').length, 4);
});

test('actual Node TODO outcomes survive census and a lost pending record or hidden failure still fails the audit', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bw-todo-accounting-'));
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    try {
        mkdirSync(path.join(root, 'scripts/lib'), {recursive: true});
        mkdirSync(path.join(root, 'test'));
        for (const name of ['check-test-run.mjs', 'check-tap-failures.mjs', 'list-tests.mjs', 'lib/skip-pointers.mjs', 'lib/tap-outcomes.mjs', 'lib/test-census-reporter.mjs'])
            copyFileSync(new URL('../scripts/' + name, import.meta.url), path.join(root, 'scripts', name));
        writeFileSync(path.join(root, 'CI-POINTERS.md'), '');
        mkdirSync(path.join(root, 'docs'));writeFileSync(path.join(root, 'docs/PENDING.md'), '# pending\n');
        writeFileSync(path.join(root, 'test/fixture.test.mjs'), `import test, {describe} from 'node:test';
import assert from 'node:assert/strict';
test('ordinary pass',()=>{});
test('failed pending',{todo:'pinned discrepancy, docs/PENDING.md'},()=>{assert.equal(1,2)});
test('passing pending',{todo:'not yet qualified, docs/PENDING.md'},()=>{});
describe('pending suite',{todo:'suite planned, docs/PENDING.md'},()=>{
 test('child failure',{todo:'child pending, docs/PENDING.md'},()=>{assert.equal(1,2)});
 test('child pass',{todo:'child pending, docs/PENDING.md'},()=>{});
});
`);
        const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-reporter-destination=stdout',
            '--test-reporter=./scripts/lib/test-census-reporter.mjs', '--test-reporter-destination=census.json', 'test/fixture.test.mjs'],
        {cwd: root, env, encoding: 'utf8'});
        assert.equal(run.status, 0, run.stderr);
        const rows = tapOutcomes(run.stdout), pending = rows.filter(row => row.directive === 'TODO');
        assert.equal(pending.length, 5); assert.equal(rows.filter(row => !row.ok && !row.directive).length, 0);
        assert.match(run.stdout, /# fail 0\n/); assert.match(run.stdout, /# todo 4\n/);
        const census = JSON.parse(readFileSync(path.join(root, 'census.json'), 'utf8'));
        const bucket = Object.values(census.files)[0];
        assert.equal(bucket.tests, 6); assert.equal(bucket.passed, 1); assert.equal(bucket.failed, 0);
        assert.deepEqual(bucket.todo.map(row => [row.name, row.reason, row.passed]),
            [['failed pending', 'pinned discrepancy, docs/PENDING.md', false], ['passing pending', 'not yet qualified, docs/PENDING.md', true],
             ['child failure', 'child pending, docs/PENDING.md', false], ['child pass', 'child pending, docs/PENDING.md', true], ['pending suite', 'suite planned, docs/PENDING.md', true]]);
        assert.deepEqual(bucket.todo.map(row => row.type), ['test', 'test', 'test', 'test', 'suite']);
        writeFileSync(path.join(root, 'run.tap'), run.stdout);
        const audit = () => spawnSync(process.execPath, ['scripts/check-test-run.mjs', '--set', 'fast', '--tap', 'run.tap', '--census', 'census.json'],
            {cwd: root, env, encoding: 'utf8'});
        const good = audit(); assert.equal(good.status, 0, good.stdout + good.stderr);
        // Owner rule (2026-10-19): a TODO must name an existing docs/….md entry.
        writeFileSync(path.join(root, 'run.tap'), run.stdout.replace('pinned discrepancy, docs/PENDING.md', 'pinned discrepancy'));
        const undocumented = audit(); assert.equal(undocumented.status, 1); assert.match(undocumented.stdout, /FAIL every known-open \(TODO\) test points at the doc entry/);
        writeFileSync(path.join(root, 'run.tap'), run.stdout);
        const failureGate = () => spawnSync(process.execPath, ['scripts/check-tap-failures.mjs', 'run.tap'],
            {cwd: root, env, encoding: 'utf8'});
        assert.equal(failureGate().status, 0, 'the actual workflow failure check accepts only explicit pending outcomes');
        writeFileSync(path.join(root, 'run.tap'), run.stdout.replace('# todo 4\n', '# todo 0\n'));
        const wrongSummary = audit(); assert.equal(wrongSummary.status, 1); assert.match(wrongSummary.stdout, /FAIL pending leaf tests agree/);
        writeFileSync(path.join(root, 'run.tap'), run.stdout);
        bucket.todo.pop(); writeFileSync(path.join(root, 'census.json'), JSON.stringify(census));
        const lost = audit(); assert.equal(lost.status, 1); assert.match(lost.stdout, /FAIL the census records every TODO/);
        writeFileSync(path.join(root, 'run.tap'), 'not ok 999 - uncounted construction failure\n' + run.stdout);
        const hidden = audit(); assert.equal(hidden.status, 1); assert.match(hidden.stdout, /FAIL every `not ok` is counted/);
        const rejected = failureGate(); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /uncounted construction failure/);
    } finally {rmSync(root, {recursive: true, force: true});}
});
