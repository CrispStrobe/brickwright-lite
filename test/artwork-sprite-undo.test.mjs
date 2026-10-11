import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram} from './helpers/bw-vm.mjs';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {blankLayer, layersDocument} from '../overlay/scratch-gui/src/lib/bw-pixel-layers.js';
import {captureTargetArtwork, restoreTargetArtwork, setCostumeDocument, getCostumeDocument,
    syncAnimationResources, copyCostumeDocument} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';

const resource = {id: '12345678-1234-4234-8234-123456789abc', name: 'Walk'};
const timeline = binding => {
    const first = blankLayer('ink', 'Ink', 2, 1);
    first.pixels = new Uint8Array([2, 3]);
    const hidden = blankLayer('hidden', 'Hidden detail', 2, 1);
    hidden.visible = false;
    hidden.pixels = new Uint8Array([5, 7]);
    const second = blankLayer('ink', 'Ink', 2, 1);
    second.pixels = new Uint8Array([9, 10]);
    return layersDocument([first, hidden], 2, 1, 3, 'ink', ARCADE_PALETTE, {
        resource: binding, activeFrameId: 'first', frames: [
            {id: 'first', durationMs: 100, layers: [first, hidden], activeLayerId: 'ink'},
            {id: 'second', durationMs: 100, layers: [second], activeLayerId: 'ink'}
        ]
    });
};
const fixture = async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect width="2" height="1" fill="#ff2121"/></svg>';
    const {vm} = await runProgram('SPRITE Actor:\nWHEN flag clicked:\n  move 1 steps', {
        storage: true, frames: 1, uploads: [
            {mode: 'add', sprite: 'Actor', name: 'Timeline', svg},
            {mode: 'add', sprite: 'Actor', name: 'Published', svg}
        ]
    });
    const target = vm.runtime.targets.find(t => t.isOriginal && !t.isStage);
    assert.equal(target.sprite.costumes.length, 3);
    const docs = [getCostumeDocument(target.sprite.costumes[0]), timeline(null), timeline(resource)];
    target.sprite.costumes.forEach((costume, i) => setCostumeDocument(costume, docs[i]));
    syncAnimationResources(vm);
    return {vm, target, docs};
};
const deleteAndUndo = async (vm, target) => {
    const undo = vm.deleteSprite(target.id);
    assert.equal(vm.runtime.targets.includes(target), false);
    syncAnimationResources(vm);
    assert.equal(vm.runtime.bwArcadeAnimationResources.size, 0);
    await undo(); // Real VM exportSprite ZIP -> addSprite -> newly deserialized costumes.
    const restored = vm.runtime.targets.find(t => t.isOriginal && !t.isStage);
    assert.notEqual(restored, target);
    return restored;
};

test('actual sprite Undo restores every source document and published UUID after ZIP reconstruction', async () => {
    const {vm, target, docs} = await fixture();
    try {
        const snapshots = captureTargetArtwork(target);
        const originalCostumes = [...target.sprite.costumes];
        const restored = await deleteAndUndo(vm, target);
        restored.sprite.costumes.forEach((costume, i) => {
            assert.notEqual(costume, originalCostumes[i]);
            assert.deepEqual([...costume.asset.data], [...originalCostumes[i].asset.data]);
        });
        assert.equal(getCostumeDocument(restored.sprite.costumes[2]).animation, undefined,
            'VM ZIP alone does not carry the WeakMap editable source');
        restoreTargetArtwork(restored, snapshots, vm);
        assert.deepEqual(restored.sprite.costumes.map(getCostumeDocument), docs);
        assert.deepEqual([...vm.runtime.bwArcadeAnimationResources.keys()], [resource.id]);
        assert.equal(vm.runtime.bwArcadeAnimationResources.get(resource.id).name, resource.name);
        const duplicate = {...restored.sprite.costumes[2]};
        restored.sprite.costumes.push(duplicate);
        copyCostumeDocument(restored.sprite.costumes[2], duplicate, vm);
        assert.notEqual(getCostumeDocument(duplicate).animation.resource.id, resource.id);
        assert.equal(getCostumeDocument(restored.sprite.costumes[2]).animation.resource.id, resource.id);
        assert.equal(vm.runtime.bwArcadeAnimationResources.size, 2);
    } finally { vm.quit(); }
});

test('sprite Undo rejects a later mismatched asset without attaching earlier source documents', async () => {
    const {vm, target} = await fixture();
    try {
        const snapshots = captureTargetArtwork(target);
        const restored = await deleteAndUndo(vm, target);
        const before = restored.sprite.costumes.map(getCostumeDocument);
        const registry = vm.runtime.bwArcadeAnimationResources;
        snapshots[2].renderedMd5ext = 'wrong.svg';
        assert.throws(() => restoreTargetArtwork(restored, snapshots, vm), /costume asset differs/);
        assert.deepEqual(restored.sprite.costumes.map(getCostumeDocument), before);
        assert.equal(vm.runtime.bwArcadeAnimationResources, registry);
        assert.throws(() => restoreTargetArtwork(restored, snapshots.slice(1), vm), /costume count differs/);
        assert.throws(() => restoreTargetArtwork(target, snapshots, vm), /no longer in this project/);
    } finally { vm.quit(); }
});

test('sprite Undo duplicate resource validation rolls back all tentative source attachments', async () => {
    const {vm, target} = await fixture();
    try {
        const snapshots = captureTargetArtwork(target);
        const restored = await deleteAndUndo(vm, target);
        const before = restored.sprite.costumes.map(getCostumeDocument);
        const registry = vm.runtime.bwArcadeAnimationResources;
        snapshots[1].document = structuredClone(snapshots[2].document);
        assert.throws(() => restoreTargetArtwork(restored, snapshots, vm), /Duplicate animation resource ID/);
        assert.deepEqual(restored.sprite.costumes.map(getCostumeDocument), before);
        assert.equal(vm.runtime.bwArcadeAnimationResources, registry);
        // A corrected retry remains possible, with the original UUID.
        snapshots[1].document = timeline(null);
        restoreTargetArtwork(restored, snapshots, vm);
        assert.deepEqual([...vm.runtime.bwArcadeAnimationResources.keys()], [resource.id]);
    } finally { vm.quit(); }
});
