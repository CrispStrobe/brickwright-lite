import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram} from './helpers/bw-vm.mjs';
import {instrumentProjectHistory, changeProjectTitle} from '../overlay/scratch-gui/src/lib/bw-project-history.js';
import {
    activateUndoSurface, getUndoState, redoActiveSurface, undoActiveSurface
} from '../overlay/scratch-gui/src/lib/global-undo.js';
import {
    clearProjectHistory, moveHistory, recordProjectEdit
} from '../overlay/scratch-gui/src/lib/bw-undo-coordinator.js';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect width="2" height="1" fill="#ff2121"/></svg>';
const fixture = async () => {
    const {vm} = await runProgram('SPRITE Actor:\nWHEN flag clicked:\n  move 1 steps', {
        storage: true, frames: 1, uploads: [
            {mode: 'add', sprite: 'Actor', name: 'Second', svg},
            {mode: 'add', sprite: 'Actor', name: 'Third', svg}
        ]
    });
    instrumentProjectHistory(vm);
    clearProjectHistory();
    activateUndoSurface('test-project-only');
    const actor = vm.runtime.targets.find(t => t.isOriginal && !t.isStage);
    vm.setEditingTarget(actor.id);
    return {vm, actor};
};
const names = target => target.sprite.costumes.map(costume => costume.name);
const sprites = vm => vm.runtime.targets.filter(t => t.isOriginal && !t.isStage).map(t => t.getName());

test('a user title edit undoes and redoes without recording project loading', async () => {
    clearProjectHistory();
    activateUndoSurface('test-project-only');
    let title = 'Before';
    const apply = value => { title = value; };
    try {
        changeProjectTitle(title, 'After', apply);
        assert.equal(title, 'After');
        assert.deepEqual(getUndoState().project.past, ['Project: Rename “Before” → “After”']);
        await undoActiveSurface(); assert.equal(title, 'Before');
        await redoActiveSurface(); assert.equal(title, 'After');
        assert.equal(getUndoState().project.past.length, 1);
        changeProjectTitle(title, title, apply);
        assert.equal(getUndoState().project.past.length, 1, 'an unchanged title adds no step');
        apply('Loaded title');
        assert.equal(getUndoState().project.past.length, 1, 'ordinary Redux/loading writes do not become user edits');
    } finally { clearProjectHistory(); }
});

test('two concurrent script copies are independent reversible steps, with their local variables', async () => {
    const {vm, actor} = await fixture();
    try {
        await vm.duplicateSprite(actor.id);
        const target = vm.runtime.targets.find(t => t.isOriginal && !t.isStage && t !== actor);
        clearProjectHistory();
        actor.createVariable('copy-local', 'Private', '');
        actor.variables['copy-local'].value = 42;
        const block = {id: 'copy-source', opcode: 'data_setvariableto', next: null, parent: null,
            inputs: {}, fields: {VARIABLE: {name: 'VARIABLE', value: 'Private', id: 'copy-local', variableType: ''}},
            topLevel: true, shadow: false, x: 0, y: 0};
        const initialBlocks = Object.keys(target.blocks._blocks).length;
        const initialVariables = Object.keys(target.variables);
        await Promise.all([vm.shareBlocksToTarget([block], target.id, actor.id),
            vm.shareBlocksToTarget([block], target.id, actor.id)]);
        assert.equal(Object.keys(target.blocks._blocks).length, initialBlocks + 2);
        assert.equal(getUndoState().project.past.length, 2);
        const shared = Object.values(target.blocks._blocks).filter(b => b.opcode === 'data_setvariableto');
        assert.equal(shared.length, 2);
        const id = shared[0].fields.VARIABLE.id;
        assert.equal(target.variables[id].value, 0, 'Scratch initializes a newly shared local variable to zero');
        assert.equal(actor.variables['copy-local'].value, 42, 'the source variable is unchanged');
        await undoActiveSurface();
        assert.equal(Object.keys(target.blocks._blocks).length, initialBlocks + 1);
        assert.equal(target.variables[id].value, 0, 'the first copy still owns the variable');
        await undoActiveSurface();
        assert.equal(Object.keys(target.blocks._blocks).length, initialBlocks);
        assert.deepEqual(Object.keys(target.variables), initialVariables);
        await redoActiveSurface(); await redoActiveSurface();
        assert.equal(Object.keys(target.blocks._blocks).length, initialBlocks + 2);
        assert.equal(target.variables[id].value, 0);
        assert.equal(getUndoState().project.past.length, 2);
    } finally { vm.quit(); clearProjectHistory(); }
});

test('a script copy finishing after project replacement cannot restore old History', async () => {
    const {vm} = await runProgram('SPRITE Actor:\nWHEN flag clicked:\n  move 1 steps', {frames: 1});
    instrumentProjectHistory(vm);
    clearProjectHistory();
    activateUndoSurface('test-project-only');
    const actor = vm.runtime.targets.find(target => target.isOriginal && !target.isStage);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    const manager = vm.extensionManager;
    const isLoaded = manager.isExtensionLoaded.bind(manager);
    const loadExtension = manager.loadExtensionURL.bind(manager);
    manager.isExtensionLoaded = id => id === 'pen' ? false : isLoaded(id);
    manager.loadExtensionURL = id => {
        if (id !== 'pen') return loadExtension(id);
        entered();
        return pending;
    };
    try {
        const json = vm.toJSON();
        const block = {id: 'pending-copy', opcode: 'pen_clear', next: null, parent: null,
            inputs: {}, fields: {}, topLevel: true, shadow: false, x: 0, y: 0};
        const first = vm.shareBlocksToTarget([block], actor.id);
        await started;
        const queued = vm.shareBlocksToTarget([block], actor.id);
        // Attach immediately so a rejected stale queue does not escape the test.
        const completed = Promise.allSettled([first, queued]);
        await vm.loadProject(json);
        assert.ok(!vm.runtime.targets.includes(actor), 'the real loader replaced the original target');
        assert.deepEqual(getUndoState().project.past, []);
        const current = vm.runtime.targets.find(target => target.isOriginal && !target.isStage);
        let copiedCurrent = false;
        const fresh = vm.shareBlocksToTarget([{...block, id: 'current-copy', opcode: 'motion_movesteps'}], current.id);
        const currentResult = fresh.then(() => { copiedCurrent = true; });
        // Drain this event-loop turn while the old extension remains blocked.
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(copiedCurrent, true, 'new-project copies must not wait on the old extension load');
        await currentResult;
        const currentHistory = getUndoState().project.past;
        assert.equal(currentHistory.length, 1);
        release();
        const results = await completed;
        assert.deepEqual(getUndoState().project.past, currentHistory, 'late work must not resurrect cleared History');
        assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled'],
            'a queued copy from the replaced project is cancelled before calling the VM');
        assert.ok(vm.runtime.targets.every(target => Object.values(target.blocks._blocks)
            .every(current => current.opcode !== 'pen_clear')), 'old work cannot alter the loaded project');
        vm.renameSprite(current.id, 'Current project');
        assert.equal(getUndoState().project.past.length, 2, 'new-project edits still record normally');
    } finally {
        release();
        vm.quit();
        clearProjectHistory();
    }
});

test('deleting a costume is undone in place and redone, many times', async () => {
    const {vm, actor} = await fixture();
    try {
        const before = names(actor);
        assert.equal(before.length, 3);
        vm.deleteCostume(1);
        assert.deepEqual(names(actor), [before[0], before[2]]);
        assert.deepEqual(getUndoState().project.past, [`Costumes: Remove “${before[1]}”`]);
        assert.equal(await undoActiveSurface(), true);
        assert.deepEqual(names(actor), before, 'restored at its old position, not at the end');
        assert.equal(await redoActiveSurface(), true);
        assert.deepEqual(names(actor), [before[0], before[2]]);
        assert.equal(await undoActiveSurface(), true);
        assert.deepEqual(names(actor), before);
    } finally {
        vm.quit();
        clearProjectHistory();
    }
});

test('the Edit menu Restore and the history never restore the same costume twice', async () => {
    const {vm, actor} = await fixture();
    try {
        const before = names(actor);
        const restore = vm.deleteCostume(0);
        restore();
        assert.deepEqual(names(actor), before);
        await undoActiveSurface();
        assert.deepEqual(names(actor), before, 'history undo after menu Restore is a no-op');
    } finally {
        vm.quit();
        clearProjectHistory();
    }
});

test('renames, reorders and duplicates are steps too, and History walks them back', async () => {
    const {vm, actor} = await fixture();
    try {
        const original = names(actor);
        vm.renameCostume(0, 'Renamed');
        vm.reorderCostume(actor.id, 0, 2);
        await vm.duplicateCostume(0);
        vm.renameSprite(actor.id, 'Hero');
        assert.equal(getUndoState().project.past.length, 4);
        assert.equal(actor.getName(), 'Hero');
        assert.equal(await moveHistory(-4, 'project'), 4);
        assert.deepEqual(names(actor), original);
        assert.equal(actor.getName(), 'Actor');
        assert.equal(await moveHistory(4, 'project'), 4);
        assert.equal(actor.getName(), 'Hero');
        assert.equal(names(actor).length, 4);
        assert.equal(names(actor)[3], 'Renamed', 'renamed, moved to the end, then one duplicate before it');
    } finally {
        vm.quit();
        clearProjectHistory();
    }
});

test('a deleted sprite comes back, and older steps follow it to its new target', async () => {
    const {vm, actor} = await fixture();
    try {
        const costumes = names(actor);
        vm.deleteCostume(2);
        vm.deleteSprite(actor.id);
        assert.deepEqual(sprites(vm), []);
        assert.equal(await undoActiveSurface(), true);
        assert.deepEqual(sprites(vm), ['Actor']);
        const restored = vm.runtime.targets.find(t => t.isOriginal && !t.isStage);
        assert.notEqual(restored, actor);
        assert.equal(await undoActiveSurface(), true, 'the costume step resolves the rebuilt sprite');
        assert.deepEqual(names(restored), costumes);
        assert.equal(await redoActiveSurface(), true);
        assert.equal(await redoActiveSurface(), true);
        assert.deepEqual(sprites(vm), [], 'redo deletes the sprite again');
    } finally {
        vm.quit();
        clearProjectHistory();
    }
});

for (const kind of ['costume', 'sound']) {
test(`${kind} edits follow their asset identities through repeated sprite restoration`, async () => {
    const {vm, actor} = await fixture();
    try {
        if (kind === 'sound') {
            // One silent PCM sample: asset identity/ZIP restoration, not audio playback.
            const wav = Buffer.alloc(46);
            wav.write('RIFF', 0); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8);
            wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
            wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
            wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
            wav.write('data', 36); wav.writeUInt32LE(2, 40);
            const storage = vm.runtime.storage;
            const asset = storage.createAsset(storage.AssetType.Sound, 'wav', new Uint8Array(wav), null, true);
            for (const name of ['First', 'Second', 'Third']) {
                await vm.addSound({name, asset, md5: `${asset.assetId}.wav`, dataFormat: 'wav', rate: 8000, sampleCount: 1});
            }
            clearProjectHistory();
        }
        const list = target => target.sprite[`${kind}s`].map(item => item.name);
        const suffix = kind === 'sound' ? 'Sound' : 'Costume';
        const original = list(actor);
        vm[`rename${suffix}`](1, 'Renamed');
        vm[`reorder${suffix}`](actor.id, 1, 2);
        await vm[`duplicate${suffix}`](2);
        const edited = list(actor);
        assert.equal(edited.length, original.length + 1);
        let deletedItems = actor.sprite[`${kind}s`].slice();
        vm.deleteSprite(actor.id);
        for (let pass = 0; pass < 2; pass++) {
            assert.equal(await undoActiveSurface(), true, 'restore the sprite through the real ZIP importer');
            const restored = vm.runtime.targets.find(target => target.isOriginal && !target.isStage);
            assert.notEqual(restored, actor);
            restored.sprite[`${kind}s`].forEach((item, index) => {
                assert.notEqual(item, deletedItems[index], 'the importer reconstructed each asset object');
                assert.equal(item.assetId, deletedItems[index].assetId, 'the serialized asset identity is preserved');
            });
            assert.deepEqual(list(restored), edited);
            assert.equal(await moveHistory(-3, 'project'), 3, 'undo duplicate, reorder and rename on rebuilt assets');
            assert.deepEqual(list(restored), original);
            assert.equal(await moveHistory(3, 'project'), 3);
            assert.deepEqual(list(restored), edited);
            deletedItems = restored.sprite[`${kind}s`].slice();
            assert.equal(await redoActiveSurface(), true, 'redo sprite deletion before another reconstruction');
            assert.deepEqual(sprites(vm), []);
        }
    } finally { vm.quit(); clearProjectHistory(); }
});
}

test('stage drags and sprite info edits are one step each', async () => {
    const {vm, actor} = await fixture();
    try {
        actor.setXY(0, 0);
        vm.startDrag(actor.id);
        vm.postSpriteInfo({x: 10, y: 5, force: true});
        vm.postSpriteInfo({x: 40, y: 20, force: true});
        vm.stopDrag(actor.id);
        vm.postSpriteInfo({visible: false});
        vm.postSpriteInfo({direction: 45});
        assert.equal(getUndoState().project.past.length, 3, 'one drag, two field edits');
        assert.equal(await moveHistory(-3, 'project'), 3);
        assert.deepEqual([actor.x, actor.y, actor.visible, actor.direction], [0, 0, true, 90]);
        assert.equal(await moveHistory(3, 'project'), 3);
        assert.deepEqual([actor.x, actor.y, actor.visible, actor.direction], [40, 20, false, 45]);
    } finally {
        vm.quit();
        clearProjectHistory();
    }
});

test('loading a project clears the structural history', async () => {
    const {vm} = await runProgram('SPRITE Actor:\nWHEN flag clicked:\n  move 1 steps', {frames: 1});
    try {
        instrumentProjectHistory(vm);
        const json = vm.toJSON();
        recordProjectEdit({label: 'Delete costume “x”', undo: () => {}});
        assert.equal(getUndoState().project.past.length, 1);
        await vm.loadProject(json);
        assert.equal(getUndoState().project.past.length, 0);
    } finally {
        vm.quit();
        clearProjectHistory();
    }
});
