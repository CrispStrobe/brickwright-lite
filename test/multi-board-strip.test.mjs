/**
 * The board strip above the sprite list: what a multi-board project shows in
 * the editor, and that a one-board project shows nothing new.
 *
 * The strip's logic is plain functions over the loaded runtime and the
 * editor's sprite map, so it is tested without a browser. The container is
 * checked by reading its source: it must render the pane untouched when there
 * is no board list.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {BOARDS_MAGIC, ownsSprite} from '../overlay/scratch-gui/src/lib/bw-boards/model.js';
import {runtimeBoards, boardSprites, projectPosition, publishBoardDevice} from
    '../overlay/scratch-gui/src/lib/bw-boards/editor-boards.js';

const BOARDS = [
    {name: 'Remote', stc: {device: 'microbit'}, targets: []},
    {name: 'Car', stc: {device: 'calliopemini'}, targets: ['Car', 'Wheel']}
];
const runtimeWith = comments => ({getTargetForStage: () => ({comments})});
const pairRuntime = () => runtimeWith({
    a: {text: 'stcconfig {"device":"microbit"}'},
    b: {text: `${BOARDS_MAGIC}${JSON.stringify(BOARDS)}`}
});
// The editor's sprite map: by target id, with the position among all sprites.
const SPRITES = {
    s1: {id: 's1', name: 'Sprite1', order: 0},
    s2: {id: 's2', name: 'Car', order: 1},
    s3: {id: 's3', name: 'Added in the editor', order: 2},
    s4: {id: 's4', name: 'Wheel', order: 3}
};

test('a project with one board has no strip', () => {
    assert.equal(runtimeBoards(runtimeWith({a: {text: 'stcconfig {"device":"microbit"}'}})), null);
    assert.equal(runtimeBoards(runtimeWith({})), null);
    assert.equal(runtimeBoards({getTargetForStage: () => null}), null);
    assert.equal(runtimeBoards(null), null);
    // A list of one is one board, and a corrupt list is no list.
    assert.equal(runtimeBoards(runtimeWith({b: {text: `${BOARDS_MAGIC}${JSON.stringify(BOARDS.slice(0, 1))}`}})), null);
    assert.equal(runtimeBoards(runtimeWith({b: {text: `${BOARDS_MAGIC}[{"name":`}})), null);
});

test('a loaded pair lists its boards in order', () => {
    assert.deepEqual(runtimeBoards(pairRuntime()).map(b => b.name), ['Remote', 'Car']);
});

test('each sprite is shown under exactly one board', () => {
    const boards = runtimeBoards(pairRuntime());
    const remote = boardSprites(SPRITES, boards, 0);
    const car = boardSprites(SPRITES, boards, 1);
    // The first board keeps every sprite no board lists, so one added in the editor has a home.
    assert.deepEqual(Object.keys(remote), ['s1', 's3']);
    assert.deepEqual(Object.keys(car), ['s2', 's4']);
    for (const id of Object.keys(SPRITES)) {
        assert.equal(Number(id in remote) + Number(id in car), 1, id);
    }
    assert.equal(remote.s1, SPRITES.s1, 'the entries are the editor\'s own, not copies');
    assert.equal(ownsSprite(boards, 5, 'Car'), false);
});

test('a position in a board\'s list maps to its position among all sprites', () => {
    const car = boardSprites(SPRITES, runtimeBoards(pairRuntime()), 1);
    assert.equal(projectPosition(car, 0), 1); // Car
    assert.equal(projectPosition(car, 1), 3); // Wheel
    assert.equal(projectPosition(car, 2), 4, 'past the last one: right after it');
    assert.equal(projectPosition({}, 2), 2, 'nothing shown: unchanged');
});

test('choosing a board announces its device and leaves the saved hardware block alone', () => {
    const stc = {device: 'microbit'};
    let refreshed = 0;
    const vm = {runtime: {stc}, extensionManager: {refreshBlocks: () => { refreshed++; }}};
    const events = [];
    const hadWindow = 'window' in globalThis;
    const before = globalThis.window;
    globalThis.window = {dispatchEvent: e => events.push(e.detail)};
    try {
        const device = publishBoardDevice(vm, BOARDS[1], id => ({calliopemini: 'nrf51', microbit: 'nrf52'}[id]));
        assert.equal(device, 'calliopemini');
    } finally {
        if (hadWindow) globalThis.window = before; else delete globalThis.window;
    }
    assert.equal(vm.runtime.bwDeviceId, 'calliopemini');
    assert.equal(vm.runtime.bwDeviceCore, 'nrf51');
    assert.deepEqual(events, [{key: 'bw-device-id', value: 'calliopemini'}]);
    assert.equal(refreshed, 1);
    assert.equal(vm.runtime.stc, stc, 'runtime.stc is what a save writes: still the first board\'s');
});

test('the pane renders untouched without a board list', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname,
        '../overlay/scratch-gui/src/containers/target-pane.jsx'), 'utf8');
    assert.match(src, /if \(!view\) return pane;/);
    assert.match(src, /\{\.\.\.\(view \? \{sprites: view\.sprites\} : \{\}\)\}/);
    // The unfiltered reorder is still there for one-board projects.
    assert.match(src, /this\.props\.vm\.reorderTarget\(dragInfo\.index \+ 1, dragInfo\.newIndex \+ 1\);/);
});
