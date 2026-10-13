import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {observeTilemapInstallations} from '../scripts/lib/arcade-tilemap-installations.mjs';

const map = pixel => ({columns: 1, rows: 1, tileSize: 16,
    indices: Uint8Array.of(1), walls: Uint8Array.of(1),
    images: [{width: 1, height: 1, pixels: Uint8Array.of(pixel)}]});
const util = id => ({thread: {id, peekStack() {return this.id;}}});
const setup = original => ({runtime: {bwArcadeDeviceState: {},
    _primitives: {arcade_setTilemap: original}}});

function checkInstallationContract(observe) {
    const vm = setup(args => {vm.runtime.bwArcadeDeviceState.tilemap = args.map;});
    const original = vm.runtime._primitives.arcade_setTilemap;
    const observer = observe({vm, blockId: 'saved'});
    try {
        vm.runtime._primitives.arcade_setTilemap({map: map(3)}, util('saved'));
        const installed = vm.runtime.bwArcadeDeviceState.tilemap;
        vm.runtime._primitives.arcade_setTilemap({map: map(2)}, util('platformer'));
        installed.images[0].pixels[0] = 7;
        assert.equal(vm.runtime.bwArcadeDeviceState.tilemap.images[0].pixels[0], 2);
        assert.equal(observer.receipts.length, 1);
        assert.deepEqual(observer.receipts[0], {blockId: 'saved', map: {
            columns: 1, rows: 1, tileSize: 16, indices: [1], walls: [1],
            images: [{width: 1, height: 1, pixels: [3]}]
        }});
    } finally {observer.restore();}
    assert.equal(vm.runtime._primitives.arcade_setTilemap, original);
}
test('captures the actual saved block installation before another script replaces it',
    () => checkInstallationContract(observeTilemapInstallations));

function checkRefusalContract(observe) {
    const vm = setup(args => {if (args.map) vm.runtime.bwArcadeDeviceState.tilemap = args.map;});
    const observer = observe({vm, blockId: 'saved'});
    try {
        vm.runtime._primitives.arcade_setTilemap({map: map(3)}, util('other'));
        vm.runtime._primitives.arcade_setTilemap({}, util('saved'));
        assert.deepEqual(observer.receipts, [], 'expected map left by another block is not a receipt');
        vm.runtime._primitives.arcade_setTilemap({map: map(2)}, util('saved'));
        assert.equal(observer.receipts.length, 1);
        assert.notEqual(observer.receipts[0].map.images[0].pixels[0], 3);
    } finally {observer.restore();}
}
test('wrong, missing and refused installations cannot certify expected saved data',
    () => checkRefusalContract(observeTilemapInstallations));

test('observer preserves receiver, arguments, return and thrown exception', () => {
    const receiver = {}, args = {map: map(3)}, context = util('saved'), result = {};
    const thrown = new Error('original refusal');
    let fail = false;
    const vm = setup(function (a, u) {
        assert.equal(this, receiver); assert.equal(a, args); assert.equal(u, context);
        if (fail) throw thrown;
        vm.runtime.bwArcadeDeviceState.tilemap = a.map;
        return result;
    });
    const observer = observeTilemapInstallations({vm, blockId: 'saved'});
    try {
        assert.equal(vm.runtime._primitives.arcade_setTilemap.call(receiver, args, context), result);
        fail = true;
        assert.throws(() => vm.runtime._primitives.arcade_setTilemap.call(receiver, args, context),
            error => error === thrown);
        assert.equal(observer.receipts.length, 1);
    } finally {observer.restore();}
});

test('missing primitive or block identity throws instead of empty-passing', () => {
    assert.throws(() => observeTilemapInstallations({vm: {}, blockId: 'saved'}), /native tilemap/);
    assert.throws(() => observeTilemapInstallations({vm: setup(() => {}), blockId: ''}), /saved block/);
});

test('serialized browser observer is self-contained and restores the real primitive', () => {
    const vm = setup(args => {vm.runtime.bwArcadeDeviceState.tilemap = args.map;});
    const original = vm.runtime._primitives.arcade_setTilemap;
    const browser = {__brickwrightStore: {getState: () => ({scratchGui: {vm}})}};
    runInNewContext('(' + observeTilemapInstallations.toString() +
        ')({blockId:"saved",expose:true})', browser);
    try {
        vm.runtime._primitives.arcade_setTilemap({map: map(3)}, util('saved'));
        assert.equal(browser.__bwTilemapInstallationProof.receipts[0].map.images[0].pixels[0], 3);
    } finally {browser.__bwTilemapInstallationProof.restore();}
    assert.equal(vm.runtime._primitives.arcade_setTilemap, original);
});

test('two serialized observers under named globals each keep only their own block (C8)', () => {
    const vm = setup(args => {vm.runtime.bwArcadeDeviceState.tilemap = args.map;});
    const original = vm.runtime._primitives.arcade_setTilemap;
    const browser = {__brickwrightStore: {getState: () => ({scratchGui: {vm}})}};
    const source = '(' + observeTilemapInstallations.toString() + ')';
    runInNewContext(source + '({blockId:"saved",expose:true})', browser);
    runInNewContext(source + '({blockId:"first",expose:"__bwFirstLevelInstallationProof"})', browser);
    try {
        vm.runtime._primitives.arcade_setTilemap({map: map(3)}, util('saved'));
        vm.runtime._primitives.arcade_setTilemap({map: map(2)}, util('first'));
        assert.equal(JSON.stringify(browser.__bwTilemapInstallationProof.receipts.map(r => r.map.images[0].pixels[0])), '[3]');
        assert.equal(JSON.stringify(browser.__bwFirstLevelInstallationProof.receipts.map(r => r.map.images[0].pixels[0])), '[2]');
    } finally {
        browser.__bwFirstLevelInstallationProof.restore();
        browser.__bwTilemapInstallationProof.restore();
    }
    assert.equal(vm.runtime._primitives.arcade_setTilemap, original);
});

test('four executable observer mutants fail the same receipt contracts', async () => {
    const source = readFileSync(new URL('../scripts/lib/arcade-tilemap-installations.mjs', import.meta.url), 'utf8');
    const cases = [
        ['stale-before-call snapshot', 'const map = runtime.bwArcadeDeviceState?.tilemap;',
            'const map = before;', checkInstallationContract],
        ['wrong block accepted', 'executingBlock === blockId && map && map !== before',
            'map && map !== before', checkInstallationContract],
        ['no-op accepted', 'executingBlock === blockId && map && map !== before',
            'executingBlock === blockId && map', checkRefusalContract],
        ['mutable pixel snapshot', 'pixels: Array.from(image.pixels)',
            'pixels: image.pixels', checkInstallationContract]
    ];
    for (const [name, anchor, replacement, contract] of cases) {
        assert.equal(source.split(anchor).length, 2, name + ': exact unique anchor');
        const mutant = await import('data:text/javascript;base64,' +
            Buffer.from(source.replace(anchor, replacement)).toString('base64'));
        assert.throws(() => contract(mutant.observeTilemapInstallations),
            error => error.code === 'ERR_ASSERTION', name + ': behavioral assertion must fail');
    }
});
