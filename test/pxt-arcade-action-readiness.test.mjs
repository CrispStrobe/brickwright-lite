import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pxtActionGlobalsReady, validatePxtActionGlobals} from './helpers/pxt-arcade-runtime.mjs';

test('original input readiness requires unique present globals with exact primitive values', () => {
    assert.equal(pxtActionGlobalsReady({count: 4}, {count___17: 4}), true);
    assert.equal(pxtActionGlobalsReady({count: 4}, {count___17: 3}), false);
    assert.equal(pxtActionGlobalsReady({count: 4}, {count___17: '4'}), false);
    assert.equal(pxtActionGlobalsReady({done: undefined}, {}), false);
    assert.equal(pxtActionGlobalsReady({done: undefined}, {done___17: undefined}), true);
    assert.equal(pxtActionGlobalsReady({done: undefined}, {done___17: undefined, done___18: undefined}), false);
    assert.equal(pxtActionGlobalsReady({count: 4}, {count___17: 4, count___18: 4}), false);
});

test('original input waits reject empty and nonprimitive expectations without running the SDK', () => {
    for (const expected of [{}, null, [], {count: NaN}, {count: {}}, {count: []}, {count: () => 4}, {'': 4}]) {
        assert.throws(() => validatePxtActionGlobals(expected), /nonempty named primitive globals/);
    }
    for (const expected of [{count: 4}, {released: 2}, {done: undefined}, {text: 'done'}, {flag: false}]) {
        assert.doesNotThrow(() => validatePxtActionGlobals(expected));
    }
});
