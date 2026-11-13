// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/editor/editor-view3d.js', import.meta.url), 'utf8');
// Run the shipped async paste closure and disposal's entry, without a renderer.
// The rest of disposal releases WebGL/DOM resources and is outside this boundary.
const lifetime = source.match(/^    let disposed = false;$/m)?.[0] || '';
const paste = source.slice(source.indexOf('    const paste = async () => {'), source.indexOf('    const undo = () => {'));
const dispose = source.slice(source.indexOf('    const dispose = () => {'), source.indexOf('        unsubscribe();', source.indexOf('    const dispose = () => {')));
const fixture = ({local = false, denied = false} = {}) => {
    const events = [];
    let resolve, reject;
    const read = new Promise((yes, no) => { resolve = yes; reject = no; });
    const navigator = {clipboard: {readText: () => {
        events.push('read');
        if (denied) throw Error('clipboard denied');
        return read;
    }}};
    const api = new Function('navigator', 'clipboard', 'systemHasCopy', 'pasteText',
        `${lifetime} ${paste} ${dispose}}; return {paste, dispose};`)(
        navigator, local ? [{}] : [], false, text => { events.push(['paste', text]); return true; });
    return {...api, events, resolve, reject};
};

for (const outcome of ['resolve', 'reject']) {
    test(`pending clipboard ${outcome} after closing the view does not paste`, async () => {
        const f = fixture();
        const pending = f.paste();
        assert.deepEqual(f.events, ['read']);
        f.dispose();
        outcome === 'resolve' ? f.resolve('external model') : f.reject(Error('permission denied'));
        assert.equal(await pending, false);
        assert.deepEqual(f.events, ['read']);
    });
}

test('a closed view refuses both clipboard reads and immediate local paste', async () => {
    for (const local of [false, true]) {
        const f = fixture({local});
        f.dispose();
        f.resolve('external model');
        assert.equal(await f.paste(), false);
        assert.deepEqual(f.events, []);
    }
});

test('an open view still pastes the completed clipboard read', async () => {
    const f = fixture();
    const pending = f.paste();
    f.resolve('external model');
    assert.equal(await pending, true);
    assert.deepEqual(f.events, ['read', ['paste', 'external model']]);
});

test('an open view keeps local and denied-clipboard fallbacks', async () => {
    for (const options of [{local: true}, {denied: true}, {}]) {
        const f = fixture(options);
        const pending = f.paste();
        if (!options.local && !options.denied) f.reject(Error('permission denied'));
        assert.equal(await pending, true);
        assert.deepEqual(f.events, options.local ? [['paste', null]] : ['read', ['paste', null]]);
    }
});
