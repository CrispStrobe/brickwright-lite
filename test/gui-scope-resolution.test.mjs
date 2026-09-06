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
