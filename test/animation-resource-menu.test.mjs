import test from 'node:test';
import assert from 'node:assert/strict';
import menuItems from '../overlay/scratch-vm/src/util/bw-animation-resource-menu.js';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {EventEmitter} from 'node:events';
const asset = (name, targetId, targetName, costumeName) => ({name, source: {targetId, targetName, costumeName}});
test('duplicate animation names identify their owners, retain UUIDs and follow live renames', () => {
    const resources = new Map([
        ['first-123456', asset('Walk', 'one', 'Robot artwork', 'costume1')],
        ['second-123456', asset('Walk', 'two', 'Robot artwork2', 'costume1')],
        ['third', asset('Jump', 'one', 'Robot artwork', 'costume2')]
    ]);
    let name = 'Renamed artwork';
    const runtime = new EventEmitter();
    runtime.bwArcadeAnimationResources = resources;
    runtime.getTargetById = id => id === 'one' ? {getName: () => name} : null;
    const before = structuredClone(resources);
    const expected = [
        {text: 'Walk — Renamed artwork / costume1', value: 'first-123456'},
        {text: 'Walk — Robot artwork2 / costume1', value: 'second-123456'},
        {text: 'Jump', value: 'third'}
    ];
    assert.deepEqual(menuItems(resources, runtime), expected);
    const Arcade = loadExtensionClass('arcade');
    assert.deepEqual(new Arcade(runtime).getAnimationAssets(), expected);
    assert.deepEqual(resources, before);
    name = 'New owner';
    assert.match(menuItems(resources, runtime)[0].text, /New owner/);
    assert.deepEqual(menuItems(new Map([...resources].reverse()), runtime).reverse(), menuItems(resources, runtime));
});
test('identical owners, common UUID suffixes and label-shaped authored names remain unambiguous', () => {
    const resources = new Map([
        ['aaa123456', asset('Walk')], ['bbb123456', asset('Walk')],
        ['literal', asset('Walk — Artwork [a123456]')],
        ['owner-literal', asset('Walk — Artwork')]
    ]);
    const items = menuItems(resources);
    assert.equal(new Set(items.map(item => item.text)).size, resources.size);
    assert.deepEqual(items.map(item => item.value), [...resources.keys()]);
    assert.match(items[0].text, /\[a123456\] \(2\)$/);
    assert.equal(items[2].text, 'Walk — Artwork [a123456]');
    assert.deepEqual(menuItems(new Map([...resources].reverse())).reverse(), items);
    assert.deepEqual(menuItems(undefined), []);
});
