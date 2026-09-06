/**
 * Root tests get the GUI package's dependency scope — and only through the hook.
 *
 * Both halves are proved from a directory OUTSIDE the repo, because on this
 * VPS a stray node_modules two levels above the worktree holds avr8js and would
 * make "fails without the hook" pass for the wrong reason (that stray tree is
 * exactly how the boundary stayed hidden until CI found it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOOK = path.join(ROOT, 'scripts', 'lib', 'register-gui-scope.mjs');
const guiHasDeps = existsSync(path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'avr8js'));
const probe = (args, env = {}) => spawnSync(process.execPath, [...args, '--input-type=module', '-e',
    "import('avr8js').then(m => console.log('resolved:' + typeof m.CPU)).catch(e => { console.log('failed:' + e.code); })"],
{cwd: mkdtempSync(path.join(tmpdir(), 'gui-scope-')), encoding: 'utf8', env: {...process.env, ...env}});

test('without the hook, a bare GUI dependency does not resolve from outside the GUI package', () => {
    const r = probe([]);
    assert.match(r.stdout, /^failed:ERR_MODULE_NOT_FOUND/m, r.stdout + r.stderr);
});

test('with the hook, the same import resolves from packages/scratch-gui, and the redirect is logged', {skip: !guiHasDeps && 'packages/scratch-gui/node_modules is not installed here (the corpus job has none by design)'}, () => {
    const log = path.join(mkdtempSync(path.join(tmpdir(), 'gui-scope-log-')), 'redirects.tsv');
    const r = probe(['--import', HOOK], {BW_GUI_SCOPE_LOG: log});
    assert.match(r.stdout, /^resolved:function/m, r.stdout + r.stderr);
    const logged = readFileSync(log, 'utf8');
    assert.match(logged, /^avr8js\t/m, 'the re-resolution must be recorded, not hidden');
});

test('the hook never widens to relative specifiers', {skip: !guiHasDeps && 'no GUI node_modules here'}, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gui-scope-rel-'));
    writeFileSync(path.join(dir, 'probe.mjs'), "import('./does-not-exist.js').then(() => console.log('resolved')).catch(e => console.log('failed:' + e.code));");
    const r = spawnSync(process.execPath, ['--import', HOOK, path.join(dir, 'probe.mjs')], {cwd: dir, encoding: 'utf8'});
    assert.match(r.stdout, /^failed:ERR_MODULE_NOT_FOUND/m, r.stdout + r.stderr);
});

test('every unit-test invocation carries the hook', () => {
    const scripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
    for (const name of ['test', 'test:fast', 'test:corpus']) {
        assert.match(scripts[name], /--import \.\/scripts\/lib\/register-gui-scope\.mjs/,
            `npm script "${name}" runs node --test without the GUI-scope hook; on a clean runner every root test that imports an overlay module with a bare dependency fails with "Cannot find package"`);
    }
});

// ---- Measured, then DECLARED: the allow-list and its checker -----------------

import {ALLOWED_PATH, parseLog, judge} from '../scripts/check-gui-scope.mjs';

const allowed = JSON.parse(readFileSync(ALLOWED_PATH, 'utf8'));
const entries = Object.entries(allowed).filter(([k]) => !k.startsWith('$'));
const GUI_PKG = JSON.parse(readFileSync(path.join(ROOT, 'packages', 'scratch-gui', 'package.json'), 'utf8'));

test('the allow-list is exact: bare specifiers that are GUI dependencies, each with the root tests that exist and need it', () => {
    assert.ok(entries.length > 0, 'the list must declare what CI measured, not be empty');
    for (const [specifier, entry] of entries) {
        assert.doesNotMatch(specifier, /[*?]/, `no wildcards: "${specifier}"`);
        assert.ok(GUI_PKG.dependencies[specifier] || GUI_PKG.devDependencies?.[specifier],
            `"${specifier}" is declared but is not a dependency of packages/scratch-gui — the hook could never redirect it`);
        assert.ok(Array.isArray(entry.tests) && entry.tests.length > 0, `"${specifier}" must name the root test(s) that need it`);
        for (const t of entry.tests) {
            assert.match(t, /^test\/[^/]+\.test\.mjs$/, `"${t}" is not a repo-relative root test path`);
            assert.ok(existsSync(path.join(ROOT, t)), `"${t}" is listed for "${specifier}" but does not exist — prune the entry`);
        }
        assert.equal(typeof entry.why, 'string', `"${specifier}" needs a one-line why`);
    }
});

test('the checker judges by name: undeclared specifier, undeclared test, unused entry', () => {
    const list = {avr8js: {tests: ['test/z80-cycle-provider-integration.test.mjs']}};
    const clean = judge(parseLog('avr8js\tfile:///x/avr8js-adapter.js\ttest/z80-cycle-provider-integration.test.mjs\n'), list);
    assert.deepEqual(clean, {undeclaredSpecifiers: [], undeclaredTests: [], unused: []});

    const newSpec = judge(parseLog('jszip\tfile:///x/a.js\ttest/foo.test.mjs\navr8js\tfile:///x/b.js\ttest/z80-cycle-provider-integration.test.mjs\n'), list);
    assert.deepEqual(newSpec.undeclaredSpecifiers, ['jszip']);
    assert.deepEqual(newSpec.undeclaredTests, []);

    const newTest = judge(parseLog('avr8js\tfile:///x/b.js\ttest/other.test.mjs\n'), list);
    assert.deepEqual(newTest.undeclaredSpecifiers, []);
    assert.deepEqual(newTest.undeclaredTests, ['avr8js <- test/other.test.mjs']);

    assert.deepEqual(judge(parseLog(''), list).unused, ['avr8js'], 'a declared entry that did not fire is reported, not failed');
    assert.deepEqual(judge(parseLog(''), {$comment: 'prose', ...list}).unused, ['avr8js'], 'the JSON\'s $comment is prose, never a specifier');
});

const CHECKER = path.join(ROOT, 'scripts', 'check-gui-scope.mjs');
const runChecker = logPath => spawnSync(process.execPath, [CHECKER, '--log', logPath], {cwd: ROOT, encoding: 'utf8'});

test('the checker exits 0 on the declared boundary and on an empty log, 1 by name on anything undeclared', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gui-scope-check-'));
    const declared = path.join(dir, 'declared.tsv');
    writeFileSync(declared, entries.flatMap(([s, e]) => e.tests.map(t => `${s}\tfile:///importer.js\t${t}`)).join('\n') + '\n');
    let r = runChecker(declared);
    assert.equal(r.status, 0, r.stdout + r.stderr);

    r = runChecker(path.join(dir, 'absent.tsv'));
    assert.equal(r.status, 0, 'a missing log means nothing crossed the boundary (the corpus job)');
    assert.match(r.stdout, /no redirects were logged/);

    const undeclared = path.join(dir, 'undeclared.tsv');
    writeFileSync(undeclared, 'jszip\tfile:///importer.js\ttest/some-new.test.mjs\n');
    r = runChecker(undeclared);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /::error::.*not declared.*jszip/, 'fails BY NAME');
});

test('mutation: a root test importing a GUI-only package the list lacks fails the checker end to end', {skip: !guiHasDeps && 'no GUI node_modules here'}, () => {
    // jszip is a GUI dependency and not in the allow-list; import it from a
    // tmpdir (outside the repo, so no stray parent node_modules can answer)
    // through the real hook, then feed the real log to the real checker.
    assert.ok(GUI_PKG.dependencies.jszip, 'jszip must be a GUI dependency for this mutation to mean anything');
    assert.ok(!allowed.jszip, 'jszip must NOT be in the allow-list for this mutation to mean anything');
    const dir = mkdtempSync(path.join(tmpdir(), 'gui-scope-mut-'));
    writeFileSync(path.join(dir, 'mutant.test.mjs'), "import test from 'node:test'; import JSZip from 'jszip'; test('imports', () => { if (typeof JSZip !== 'function') throw new Error('no jszip'); });");
    const log = path.join(dir, 'redirects.tsv');
    // NODE_TEST_CONTEXT is what node --test sets in its children; a nested runner
    // that inherits it would not spawn a fresh process (and would not carry the hook).
    const env = {...process.env, BW_GUI_SCOPE_LOG: log};
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--test', '--import', HOOK, path.join(dir, 'mutant.test.mjs')],
        {cwd: dir, encoding: 'utf8', env});
    assert.equal(run.status, 0, 'the hook lets the mutant PASS — that is exactly why the list has to exist:\n' + run.stdout + run.stderr);
    const logged = readFileSync(log, 'utf8');
    assert.match(logged, /^jszip\tfile:\/\/\/.*mutant\.test\.mjs\t.*mutant\.test\.mjs$/m, 'the log names the specifier, the importer and the test file:\n' + logged);
    const r = runChecker(log);
    assert.equal(r.status, 1, 'the checker must fail the undeclared redirect:\n' + r.stdout + r.stderr);
    assert.match(r.stderr, /::error::.*not declared.*jszip/);
});

test('both CI test steps run the checker right after printing the redirect summary', () => {
    const yml = readFileSync(path.join(ROOT, '.github', 'workflows', 'build.yml'), 'utf8');
    for (const set of ['fast', 'corpus']) {
        const echo = yml.indexOf(`if [ -s test-results/${set}.gui-scope.tsv ]`);
        assert.ok(echo > 0, `the ${set} step prints the redirect summary`);
        const check = yml.indexOf(`node scripts/check-gui-scope.mjs --log test-results/${set}.gui-scope.tsv`);
        assert.ok(check > echo && check - echo < 600, `the ${set} step runs the checker right after the summary, before the runner's status is returned`);
        const exit = yml.indexOf('exit "$rc"', echo);
        assert.ok(exit > check, `the ${set} step returns the test status after the checker, not before`);
    }
});
