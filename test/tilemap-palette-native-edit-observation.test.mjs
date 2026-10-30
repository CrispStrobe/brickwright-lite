import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {inspectTilemapPalette, observeTilemapPalette} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-palette.js';
import {DEFAULT_PROJECT_PALETTE, paletteHex} from '../overlay/scratch-gui/src/lib/arcade-project-palette.js';

const {default: Blocks} = await importGuiDependency('scratch-vm/src/engine/blocks.js');
const block = (id, opcode, next, parent, extra = {}) => ({id, opcode, next, parent,
    inputs: {}, fields: {}, shadow: false, topLevel: parent === null, ...extra});
const installProgram = blocks => {
    blocks.createBlock(block('text', 'text', null, 'palette',
        {fields: {TEXT: {name: 'TEXT', value: paletteHex(DEFAULT_PROJECT_PALETTE)}}, shadow: true, topLevel: false}));
    blocks.createBlock(block('palette', 'arcade_setPalette', null, 'declaration',
        {inputs: {DATA: {name: 'DATA', block: 'text', shadow: 'text'}}}));
    blocks.createBlock(block('declaration', 'arcade_declareSourceScalar', 'palette', 'start'));
    blocks.createBlock(block('start', 'arcade_whenSourceStarts', 'declaration', null));
};
const fixture = () => {
    const runtime = new EventEmitter();
    runtime.emitProjectChanged = () => runtime.emit('PROJECT_CHANGED');
    const blocks = new Blocks(runtime);
    runtime.targets = [{id: 'source-target', isOriginal: true, blocks}];
    const vm = new EventEmitter(); vm.runtime = runtime;
    installProgram(blocks);
    return {vm, blocks};
};
const flush = () => Promise.resolve();

test('actual recursive source-stack deletion completes without palette observation interrupting the mutator', async () => {
    const {vm, blocks} = fixture(), observed = [], transient = [];
    // Independently establish the real engine's intermediate missing-child
    // state. Only this test witness catches it; the mutator is not mocked.
    const witness = () => { try { inspectTilemapPalette(vm); } catch (error) { transient.push(error); } };
    vm.runtime.on('PROJECT_CHANGED', witness);
    const release = observeTilemapPalette(vm, palette => observed.push(palette));
    try {
        assert.equal(observed[0].kind, 'constant');
        assert.doesNotThrow(() => blocks.deleteBlock('start'));
        assert.ok(transient.some(error => error.message === 'Startup stack has a missing block'));
        assert.deepEqual(Object.keys(blocks._blocks), []);
        assert.deepEqual(blocks.getScripts(), []);
        assert.equal(observed.length, 1, 'no synchronous intermediate projection');
        await flush();
        assert.equal(observed.length, 2);
        assert.equal(observed[1].kind, 'default');
        assert.equal(Object.hasOwn(observed[1], 'error'), false);
    } finally { release(); vm.runtime.removeListener('PROJECT_CHANGED', witness); }
});

test('a queued actual Blocks delete-create edit batch coalesces load and target notifications after reconstruction', async () => {
    const {vm, blocks} = fixture(), observed = [], release = observeTilemapPalette(vm, palette => observed.push(palette));
    try {
        await new Promise((resolve, reject) => queueMicrotask(() => {
            try {
                blocks.deleteBlock('start');
                installProgram(blocks);
                vm.emit('PROJECT_LOADED'); vm.emit('targetsUpdate');
                resolve();
            } catch (error) { reject(error); }
        }));
        await flush();
        assert.equal(observed.length, 2, 'one completed batch, not one read per recursive event');
        assert.ok(observed.every(palette => palette.kind === 'constant' && !Object.hasOwn(palette, 'error')));
        assert.deepEqual(observed[1], inspectTilemapPalette(vm));
        assert.equal(blocks.getBlock('start').next, 'declaration');
        assert.equal(blocks.getBlock('declaration').next, 'palette');
        assert.equal(blocks.getBlock('palette').inputs.DATA.block, 'text');
        assert.deepEqual(Object.keys(blocks._blocks).sort(), ['declaration', 'palette', 'start', 'text']);
    } finally { release(); }
});

test('a persistent malformed source chain reports its actual unavailable-preview error while the direct inspector stays strict', async () => {
    const {vm, blocks} = fixture(), observed = [], release = observeTilemapPalette(vm, palette => observed.push(palette));
    try {
        // A deliberately invalid direct engine edit removes the child without
        // unlinking its parent. It must not become an accepted source palette.
        assert.doesNotThrow(() => blocks.deleteBlock('declaration'));
        assert.throws(() => inspectTilemapPalette(vm), {message: 'Startup stack has a missing block'});
        await flush();
        const refused = observed.at(-1);
        assert.equal(refused.kind, 'unavailable'); assert.equal(refused.colors, null);
        assert.equal(refused.signature, null);
        assert.ok(refused.error instanceof Error);
        assert.equal(refused.error.message, 'Startup stack has a missing block');
        assert.equal(refused.errorMessage, 'Startup stack has a missing block');
        installProgram(blocks); await flush();
        assert.equal(observed.at(-1).kind, 'constant');
        assert.equal(Object.hasOwn(observed.at(-1), 'error'), false);
    } finally { release(); }
});

test('release fences scheduled and retained callbacks and an independent replacement watcher observes only its own VM', async () => {
    const {vm: oldVM} = fixture(), old = [];
    const releaseOld = observeTilemapPalette(oldVM, palette => old.push(palette));
    const retained = oldVM.runtime.listeners('PROJECT_CHANGED')[0];
    oldVM.runtime.emit('PROJECT_CHANGED'); releaseOld();
    const {vm: freshVM} = fixture(), fresh = [];
    const releaseFresh = observeTilemapPalette(freshVM, palette => fresh.push(palette));
    try {
        retained(); oldVM.runtime.emit('PROJECT_CHANGED');
        oldVM.emit('PROJECT_LOADED'); oldVM.emit('targetsUpdate');
        await flush();
        assert.equal(old.length, 1); assert.equal(fresh.length, 1);
        assert.equal(oldVM.runtime.listenerCount('PROJECT_CHANGED'), 0);
        assert.equal(oldVM.listenerCount('PROJECT_LOADED'), 0);
        assert.equal(oldVM.listenerCount('targetsUpdate'), 0);
        freshVM.runtime.emit('PROJECT_CHANGED'); releaseFresh();
        await flush();
        assert.equal(fresh.length, 1, 'disposed queued delivery is revoked');
        assert.equal(freshVM.runtime.listenerCount('PROJECT_CHANGED'), 0);
    } finally { releaseOld(); releaseFresh(); }
});
