import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require = createRequire(import.meta.url);
const createRegistry = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/kind-registry.js');

test('kind source is complete, pinned to the original SDK and reproducible', () => {
    assert.equal(createRegistry.sourceIdentity.sourceSha256, 'de733abb60f73a70f32134af4a1fc72f4de24e1c9b175069d74b5cdf1c112567');
    execFileSync(process.execPath, ['scripts/generate-arcade-kind-source.mjs', '--check'], {stdio: 'pipe'});
});
test('builtin allocation and independent per-program dynamic kinds match original observations', () => {
    const first = createRegistry();
    assert.deepEqual(['Player','Projectile','Food','Enemy'].map(name => first.builtin(name)), [1000,1,1001,1002]);
    assert.equal(first.create(), 1003);
    assert.equal(first.create(), 1004);
    const next = createRegistry();
    assert.equal(next.create(), 1003);
    assert.equal(first.create(), 1005);
    first.reset();
    assert.equal(first.create(), 1003);
});
test('unused declared kinds and original Text initializer consume IDs before custom allocation', () => {
    const kinds = createRegistry();
    const text = kinds.create();
    kinds.bindName('Text', text);
    const custom = kinds.create();
    kinds.bindName('Custom', custom);
    assert.equal(text, 1003);
    assert.equal(custom, 1004);
    assert.equal(kinds.create(), 1005);
    assert.equal(kinds.normalize('Text'), text);
    assert.equal(kinds.normalize('Custom'), custom);
    // The registry executes supplied initializers; selecting their original order
    // remains the compiler/source-preparation integration's responsibility.
});
test('aliases capture numeric identities, names are metadata, and unknown names never allocate', () => {
    const kinds = createRegistry();
    const custom = kinds.create();
    kinds.bindName('Custom', custom);
    kinds.bindName('Alias', custom);
    const capturedHandlerKind = kinds.normalize('Alias');
    assert.equal(kinds.same('Custom','Alias'), true);
    assert.equal(kinds.same('Player',1000), true);
    const next = kinds.create();
    kinds.bindName('Alias', next);
    assert.equal(capturedHandlerKind, custom);
    assert.equal(kinds.same('Custom','Alias'), false);
    assert.equal(kinds.displayName(custom), 'Custom');
    assert.equal(kinds.displayName(next), 'Alias');
    assert.throws(() => kinds.normalize('Missing'), /Unregistered/);
    assert.throws(() => kinds.normalize(''), /Unregistered/);
    assert.throws(() => kinds.bindName('Player', next), /constant/);
    assert.equal(kinds.create(), 1005);
});
test('fractional and negative numeric kinds keep original values without rounded identities', () => {
    const kinds = createRegistry();
    assert.equal(kinds.normalize(1.5), 1.5);
    assert.equal(kinds.normalize('1.5'), 1.5);
    assert.equal(kinds.normalize(-2), -2);
    assert.equal(kinds.normalize('-2'), -2);
    assert.equal(kinds.same(1.5,1), false);
    assert.equal(kinds.normalize('1e3'), 1000);
    assert.equal(Object.is(kinds.normalize(-0), -0), true);
    assert.equal(kinds.same(Number.NaN, Number.NaN), false, 'numeric handler comparison keeps original strict equality');
});

test('typed absent kinds preserve original default/no-op inputs without allocating an ID', () => {
    const kinds = createRegistry();
    assert.equal(kinds.normalize(undefined), undefined);
    assert.equal(kinds.normalize(null), null);
    // Caller-specific create/setKind behavior remains separate from identity.
    assert.equal(kinds.create(), 1003);
    assert.throws(() => kinds.normalize('undefined'), /Unregistered/);
    assert.throws(() => kinds.normalize('null'), /Unregistered/);
});
