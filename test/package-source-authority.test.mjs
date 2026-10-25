import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPackageSourceResolver} from './helpers/package-source.mjs';

function fixture (t) {
    const root = mkdtempSync(path.join(tmpdir(), 'bw-package-authority-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const add = (registry, value) => {
        const dir = path.join(root, registry, 'node_modules/bw-board');
        mkdirSync(path.join(dir, 'src'), {recursive: true});
        writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'bw-board', type: 'module', exports: {'./probe': './src/probe.js'}}));
        writeFileSync(path.join(dir, 'src/probe.js'), `export default ${JSON.stringify(value)};`);
        return path.join(dir, 'src/probe.js');
    };
    return {root, add};
}

test('upstream source resolves root package exports, never the GUI registry', async t => {
    const {root, add} = fixture(t);
    const expected = add('', 'root');
    add('packages/scratch-gui', 'gui');
    const resolve = createPackageSourceResolver(root);
    assert.equal(resolve('bw-board/probe'), expected);
    assert.equal((await import(resolve('bw-board/probe'))).default, 'root');
    assert.throws(() => resolve('bw-board/src/probe.js'), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
});

test('missing root package fails even with a prepared GUI and copied source', t => {
    const {root, add} = fixture(t);
    add('packages/scratch-gui', 'gui');
    const copy = path.join(root, 'overlay/scratch-gui/src/lib/bw-board');
    mkdirSync(copy, {recursive: true});
    writeFileSync(path.join(copy, 'probe.js'), 'export default "stale";');
    assert.throws(() => createPackageSourceResolver(root)('bw-board/probe'), /Missing root-installed upstream package/);
});

test('resolver rejects unrelated dependencies and missing exported files', t => {
    const {root, add} = fixture(t);
    add('', 'root');
    const resolve = createPackageSourceResolver(root);
    assert.throws(() => resolve('avr8js'), /Not an upstream source package/);
    rmSync(path.join(root, 'node_modules/bw-board/src/probe.js'));
    assert.throws(() => resolve('bw-board/probe'), {code: 'MODULE_NOT_FOUND'});
});
