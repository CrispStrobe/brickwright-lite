import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';
const source = readFileSync(new URL('../overlay/scratch-vm/src/extension-support/extension-manager.js', import.meta.url), 'utf8');

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
        `return function () ${scopeAfter(source, 'refreshBlocks () {')}`)(dispatch,
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
