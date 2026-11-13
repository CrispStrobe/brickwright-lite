// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMemoryMachineStore} from '../overlay/scratch-gui/src/lib/bw-machines/machine-store.js';

const machine = (id, title = id) => ({id, title, machine: 'i80386',
    executionMode: 'functional', bios: {kind: 'bochs-lgpl'},
    slots: {hdd: {url: `${id}.img`}}});

for (const envelope of [false, true]) {
    test(`failed ${envelope ? 'envelope' : 'array'} import preserves the entire saved library`, async () => {
        const store = createMemoryMachineStore([machine('saved', 'Original'), machine('other')]);
        const before = await store.export();
        const incoming = [machine('saved', 'Replacement'), machine('new'),
            {...machine('broken'), machine: 'unknown-cpu'}];
        await assert.rejects(store.import(envelope ? {version: 1, machines: incoming} : incoming),
            /unknown machine kind/);
        assert.deepEqual(await store.export(), before);
        assert.equal(await store.get('new'), null);
    });
}

test('failure to clone an imported config also leaves the library unchanged', async () => {
    const store = createMemoryMachineStore([machine('saved', 'Original')]);
    const before = await store.export();
    await assert.rejects(store.import([machine('saved', 'Replacement'),
        {...machine('bad-json'), provenance: {unsupported: 1n}}]), /BigInt/);
    assert.deepEqual(await store.export(), before);
});

test('a sparse input cannot commit an earlier replacement', async () => {
    const store = createMemoryMachineStore([machine('saved', 'Original')]);
    const before = await store.export();
    const incoming = [machine('saved', 'Replacement')];
    incoming.length = 2;
    await assert.rejects(store.import(incoming), /invalid machine config/);
    assert.deepEqual(await store.export(), before);
});

test('successful import preserves last-entry-wins order and detached return values', async () => {
    const store = createMemoryMachineStore([machine('saved', 'Original'), machine('other')]);
    const incoming = [machine('saved', 'First'), machine('new'), machine('saved', 'Last')];
    const imported = await store.import({version: 1, machines: incoming});
    assert.deepEqual(imported.map(row => row.title), ['First', 'new', 'Last']);
    assert.equal((await store.get('saved')).title, 'Last');
    assert.equal((await store.get('other')).title, 'other');
    imported[2].title = 'Changed';
    imported[2].slots.hdd.url = 'changed.img';
    assert.equal((await store.get('saved')).title, 'Last');
    assert.equal((await store.get('saved')).slots.hdd.url, 'saved.img');
    const before = await store.export();
    assert.deepEqual(await store.import([]), []);
    assert.deepEqual(await store.export(), before);
});

test('machine store source and package mirror agree', () => {
    const path = 'scratch-gui/src/lib/bw-machines/machine-store.js';
    assert.equal(readFileSync(new URL(`../overlay/${path}`, import.meta.url), 'utf8'),
        readFileSync(new URL(`../packages/${path}`, import.meta.url), 'utf8'));
});
