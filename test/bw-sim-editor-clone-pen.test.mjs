import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';

const rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const part = '32524.dat';
const catalog = new Map(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts.map(p => [p.part, p]));
const model = () => ({version: 1, parts: [
    {id: 'p1', part, position: [0, 0, 0], rotation: rotation.slice(), pen: true, color: 4},
    {id: 'p2', part, position: [0, 0, 40], rotation: rotation.slice(), color: 2}
]});

for (const [name, command] of [
    ['single', {type: 'clone', id: 'p1'}],
    ['multiple', {type: 'cloneMany', ids: ['p1', 'p2']}]
]) {
    test(`${name} duplication retains pen settings through undo and redo`, () => {
        const editor = createEditor({model: model(), catalog});
        editor.apply(command);
        const copies = editor.model.parts.slice(2);
        assert.equal(copies[0].pen, true);
        assert.equal(copies[0].color, 4);
        if (copies.length > 1) assert.equal(copies[1].pen, undefined);
        editor.undo();
        assert.equal(editor.model.parts.length, 2);
        editor.redo();
        assert.equal(editor.model.parts[2].pen, true);
    });
}
