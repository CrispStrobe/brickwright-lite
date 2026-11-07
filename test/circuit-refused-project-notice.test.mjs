// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const path = 'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx';
const source = read(path);

test('refused project notifications do not republish or reload the current circuit', () => {
    assert.equal(read('packages/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx'), source);
    const start = source.indexOf('        this._onBundleLoaded = event => {');
    const end = source.indexOf("        window.addEventListener('bw-project-bundle-loaded'", start);
    assert.ok(start >= 0 && end > start, 'actual bundle listener exists');
    const construct = new Function('localStorage', `return function () { ${source.slice(start, end)} return this._onBundleLoaded; };`);
    const accesses = [];
    const storage = {getItem(key) { accesses.push(['get', key]); return key === 'bw-circuit-autosave' ? '{"parts":[],"wires":[]}' : null; },
        setItem(key) { accesses.push(['set', key]); }};
    const changes = [];
    const owner = {props: {vm: {runtime: {}}}, _markReactUpdate() { changes.push('mark'); },
        setState(value) { changes.push(['state', value]); }, _applyToLiveCircuit(value) { changes.push(['apply', value]); }};
    const listener = construct(storage).call(owner);
    for (const outcome of ['future', 'invalid', 'storage-failed']) {
        listener({detail: {outcome}});
        assert.deepEqual(accesses, [], `${outcome} must not touch circuit storage`);
        assert.deepEqual(changes, [], `${outcome} must not republish the existing circuit`);
    }
    listener({detail: {outcome: 'loaded'}});
    assert.ok(accesses.some(([action, key]) => action === 'get' && key === 'bw-circuit-autosave'));
    assert.ok(changes.some(([action]) => action === 'apply'), 'successful load still publishes');
});
