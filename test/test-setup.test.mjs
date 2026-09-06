import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkTestSetup} from '../scripts/check-test-setup.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const fixture = t => {
    const root = mkdtempSync(path.join(tmpdir(), 'bw-test-setup-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const put = (name, text = '{}') => {
        const dest = path.join(root, name);
        mkdirSync(path.dirname(dest), {recursive: true});
        writeFileSync(dest, text);
    };
    put('package.json', JSON.stringify({engines: {node: '22.x'}, devDependencies: {jszip: '3.10.1'}}));
    return {root, put};
};

test('preflight names wrong Node and the missing root dependency before imports fail', t => {
    const {root, put} = fixture(t);
    const errors = checkTestSetup({root, nodeVersion: '20.20.2'});
    assert.equal(errors.length, 2);
    assert.match(errors.join('\n'), /Node 22\.x.*20\.20\.2/);
    assert.match(errors.join('\n'), /npm ci --ignore-scripts/);
    put('node_modules/jszip/package.json', '{"version":"3.10.1"}');
    assert.deepEqual(checkTestSetup({root, nodeVersion: '22.23.2'}), []);
    put('node_modules/jszip/package.json', '{"version":"3.9.0"}');
    assert.match(checkTestSetup({root, nodeVersion: '22.23.2'})[0], /jszip@3.10.1/);
});

test('source setup needs no GUI; a partial tracked GUI is insufficient for integrated setup', t => {
    const {root, put} = fixture(t);
    put('node_modules/jszip/package.json', '{"version":"3.10.1"}');
    put('packages/scratch-gui/src/lib/sb3-creator.js', 'export default {};');
    const opts = {root, nodeVersion: '22.23.2', integratedRoot: path.join(root, 'packages/scratch-gui')};
    assert.deepEqual(checkTestSetup(opts), []);
    const errors = checkTestSetup({...opts, integrated: true});
    assert.equal(errors.length, 5);
    assert.match(errors.join('\n'), /scratch-vm\/src\/index.js/);
    assert.match(errors.join('\n'), /vendor, integrate, GUI install, overlays/);
});

test('runtime helper refuses missing and stale sources even with an explicit external GUI', t => {
    const {root, put} = fixture(t);
    put('test/helpers/bw-integrated.mjs', readFileSync(path.join(repo, 'test/helpers/bw-integrated.mjs')));
    put('overlay/scratch-gui/src/lib/probe.mjs', 'export const value = 42;');
    put('external/package.json');
    put('external/src/lib/probe.mjs', 'export const value = 41;');
    put('probe.mjs', "import {importIntegrated} from './test/helpers/bw-integrated.mjs';\n" +
        "console.log((await importIntegrated('src/lib/probe.mjs')).value);\n");
    const probe = env => spawnSync(process.execPath, ['probe.mjs'], {
        cwd: root, encoding: 'utf8', env: {...process.env, BW_INTEGRATED_ROOT: '', ...env}
    });
    const missing = probe({});
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing integrated runtime file/);
    const stale = probe({BW_INTEGRATED_ROOT: path.join(root, 'external')});
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /differs from this checkout's overlay/);
    put('external/src/lib/probe.mjs', 'export const value = 42;');
    const good = probe({BW_INTEGRATED_ROOT: path.join(root, 'external')});
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /42/);
    assert.match(good.stderr, /BW_INTEGRATED_ROOT/);
});

test('runtime dependency lookup never borrows an ancestor dependency', t => {
    const {root, put} = fixture(t);
    put('test/helpers/bw-integrated.mjs', readFileSync(path.join(repo, 'test/helpers/bw-integrated.mjs')));
    put('packages/scratch-gui/package.json');
    put('node_modules/probe/package.json', '{"main":"index.cjs"}');
    put('node_modules/probe/index.cjs', 'module.exports = 42;');
    put('probe.mjs', "import {requireIntegrated} from './test/helpers/bw-integrated.mjs'; requireIntegrated('probe');");
    const result = spawnSync(process.execPath, ['probe.mjs'], {
        cwd: root, encoding: 'utf8', env: {...process.env, BW_INTEGRATED_ROOT: ''}
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing integrated runtime file/);
});

test('CI runs the bounded source verdict before generated-tree work', () => {
    const workflow = readFileSync(path.join(repo, '.github/workflows/build.yml'), 'utf8');
    const install = workflow.indexOf('name: Install source-test dependencies');
    const source = workflow.indexOf('name: Run bounded source-only tests');
    const vendor = workflow.indexOf('name: Vendor the pinned permissive Scratch sources');
    assert.ok(install >= 0 && install < source && source < vendor,
        'source tests must run after their root install and before vendor/integrate spend');
    assert.match(workflow.slice(source, vendor), /run: npm run test:source/);
});
