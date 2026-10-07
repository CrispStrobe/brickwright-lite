import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {balancedFrom} from './helpers/js-scope.mjs';
const source = readFileSync(new URL('../overlay/scratch-vm/src/extension-support/extension-manager.js', import.meta.url), 'utf8');
const signature = 'refreshBlocks ({throwOnError = false} = {}) {';
const refreshBody = balancedFrom(source, source.indexOf(signature) + signature.length - 1, '{', '}');

test('refresh waits for runtime registration, deduplicating URL and id aliases', async () => {
    let finishRegistration;
    const registration = new Promise(resolve => { finishRegistration = resolve; });
    const calls = [];
    const dispatch = {call (service, method, info) {
        calls.push([service, method]);
        if (method === 'getInfo') return Promise.resolve({id: 'arrays'});
        assert.equal(info.id, 'arrays');
        return registration;
    }};
    const refresh = new Function('dispatch', 'log',
        `return function ({throwOnError = false} = {}) ${refreshBody}`)(dispatch,
        {error: message => { throw new Error(message); }});
    const manager = {_loadedExtensions: new Map([['arrays', 'arraysService'], ['https://example.invalid/arrays', 'arraysService']]),
        _prepareExtensionInfo: (service, info) => info};
    let completed = false;
    const refreshing = refresh.call(manager).then(() => { completed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [['arraysService', 'getInfo'], ['runtime', '_refreshExtensionPrimitives']]);
    assert.equal(completed, false, 'getInfo completion is insufficient: Blocks still needs runtime registration');
    finishRegistration();
    await refreshing;
    assert.equal(completed, true);
});

for (const failureAt of ['getInfo', '_refreshExtensionPrimitives']) {
    test(`strict refresh rejects ${failureAt} failure instead of publishing readiness`, async () => {
        const failure = new Error(`${failureAt} failed`);
        const logged = [];
        const dispatch = {call: async (service, method) => {
            if (method === failureAt) throw failure;
            return {id: 'arrays'};
        }};
        const refresh = new Function('dispatch', 'log',
            `return function ({throwOnError = false} = {}) ${refreshBody}`)(dispatch,
            {error: message => logged.push(message)});
        const manager = {_loadedExtensions: new Map([['arrays', 'arraysService']]),
            _prepareExtensionInfo: (service, info) => info};
        await assert.rejects(refresh.call(manager, {throwOnError: true}), error => error === failure);
        assert.equal(logged.length, 1);
        await refresh.call(manager); // existing background refresh retains its logging policy
        assert.equal(logged.length, 2);
    });
}

test('strict refresh drains successful siblings before rejecting a failed apply', async () => {
    let finishRegistration;
    const pending = new Promise(resolve => { finishRegistration = resolve; });
    const failure = new Error('first extension failed');
    const dispatch = {call: async (service, method) => {
        if (service === 'failed') throw failure;
        if (method === 'getInfo') return {id: 'arrays'};
        await pending;
    }};
    const refresh = new Function('dispatch', 'log',
        `return function ({throwOnError = false} = {}) ${refreshBody}`)(dispatch, {error () {}});
    const manager = {_loadedExtensions: new Map([['broken', 'failed'], ['arrays', 'healthy']]),
        _prepareExtensionInfo: (service, info) => info};
    let completed = false;
    const refreshing = refresh.call(manager, {throwOnError: true});
    const observed = refreshing.then(() => { completed = true; }, () => { completed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false, 'a late sibling cannot be allowed to overwrite the next apply');
    finishRegistration();
    await assert.rejects(refreshing, error => error === failure);
    await observed;
    assert.equal(completed, true);
});
