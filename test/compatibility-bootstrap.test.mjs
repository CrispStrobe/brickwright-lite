import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importSource, importGuiDependency} from './helpers/bw-integrated.mjs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const imports = source => [...source.matchAll(/^import\s+(?:[^;\n]*?\s+from\s+)?['"]([^'"]+)['"];?$/gm)]
    .map(match => match[1]);

test('both managed entry graphs initialize compatibility before app dependencies', () => {
    for (const [relative, first] of [
        ['src/playground/index.jsx', '../lib/compatibility-bootstrap.js'],
        ['src/index.js', './lib/compatibility-bootstrap.js']
    ]) {
        const owned = read(`overlay/scratch-gui/${relative}`);
        assert.equal(imports(owned)[0], first);
        assert.equal(read(`packages/scratch-gui/${relative}`), owned);
    }
    const bootstrap = read('overlay/scratch-gui/src/lib/compatibility-bootstrap.js');
    assert.equal(read('packages/scratch-gui/src/lib/compatibility-bootstrap.js'), bootstrap);
    assert.deepEqual(imports(bootstrap), ['core-js/fn/promise/finally.js', 'react-tooltip']);
});

test('normal compatibility modules retain Promise completion and the tooltip API on reuse', async () => {
    await importSource('src/lib/compatibility-bootstrap.js');
    const descriptor = Object.getOwnPropertyDescriptor(Function.prototype, 'toString');
    const {default: Tooltip} = await importGuiDependency('react-tooltip/dist/index.js');
    for (const method of ['show', 'hide', 'rebuild']) assert.equal(typeof Tooltip[method], 'function');
    const calls = [];
    const value = Object.freeze({value: 'fulfilled'});
    const reason = Object.freeze({reason: 'rejected'});
    assert.equal(await Promise.resolve(value).finally(() => calls.push('fulfilled')), value);
    await assert.rejects(Promise.reject(reason).finally(() => calls.push('rejected')), error => error === reason);
    assert.deepEqual(calls, ['fulfilled', 'rejected']);
    await importSource('src/lib/compatibility-bootstrap.js');
    assert.equal((await importGuiDependency('react-tooltip/dist/index.js')).default, Tooltip);
    assert.deepEqual(Object.getOwnPropertyDescriptor(Function.prototype, 'toString'), descriptor);
});

test('reusing bootstrap never repairs a later intrinsic replacement', async () => {
    await importSource('src/lib/compatibility-bootstrap.js');
    const original = Object.getOwnPropertyDescriptor(Function.prototype, 'toString');
    const replacement = function () { return original.value.apply(this, arguments); };
    try {
        Object.defineProperty(Function.prototype, 'toString', {...original, value: replacement});
        await importSource('src/lib/compatibility-bootstrap.js');
        assert.equal(Object.getOwnPropertyDescriptor(Function.prototype, 'toString').value, replacement);
    } finally {
        Object.defineProperty(Function.prototype, 'toString', original);
    }
    assert.deepEqual(Object.getOwnPropertyDescriptor(Function.prototype, 'toString'), original);
});
