import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';

const rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const part = '32524.dat';
const catalog = new Map(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts.map(p => [p.part, p]));

test('a repeated selected ID moves once and undo/redo preserve the move', () => {
    const model = {version: 1, parts: [
        {id: 'p1', part, position: [0, 0, 0], rotation},
        {id: 'p2', part, position: [40, 0, 0], rotation}
    ]};
    const editor = createEditor({model, catalog});
    editor.apply({type: 'moveMany', ids: ['p1', 'p2', 'p1'], delta: [10, 5, 0]});
    assert.deepEqual(editor.model.parts.map(p => p.position), [[10, 5, 0], [50, 5, 0]]);
    editor.undo();
    assert.deepEqual(editor.model.parts.map(p => p.position), [[0, 0, 0], [40, 0, 0]]);
    editor.redo();
    assert.deepEqual(editor.model.parts.map(p => p.position), [[10, 5, 0], [50, 5, 0]]);
});
