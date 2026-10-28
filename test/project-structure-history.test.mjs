import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram} from './helpers/bw-vm.mjs';
import {instrumentProjectHistory} from '../overlay/scratch-gui/src/lib/bw-project-history.js';
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
