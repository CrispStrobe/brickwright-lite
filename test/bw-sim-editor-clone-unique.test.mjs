import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';

const rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const catalog = new Map([
    ['motor.dat', {part: 'motor.dat', motor: {output: ['out']}}],
    ['beam.dat', {part: 'beam.dat', category: 'beam'}]
]);

test('multi-part duplicate copies each selected part once and preserves its group and pen', () => {
    const model = {version: 1, parts: [
        {id: 'p1', part: 'motor.dat', position: [0, 0, 0], rotation, port: 'A'},
        {id: 'p2', part: 'beam.dat', position: [0, 0, 40], rotation, pen: true}
    ], groups: [{id: 'g1', name: 'assembly', parts: ['p1', 'p2']}]};
    const editor = createEditor({model, catalog});
    editor.apply({type: 'cloneMany', ids: ['p1', 'p2', 'p1'], offset: [40, 0, 0]});
    assert.equal(editor.model.parts.length, 4);
    const copies = editor.model.parts.slice(2);
    assert.deepEqual(copies.map(p => p.id), ['p3', 'p4']);
    assert.equal(copies[0].port, 'A');
    assert.equal(copies[1].pen, true);
    assert.deepEqual(editor.model.groups[1].parts, ['p3', 'p4']);
    editor.undo();
    assert.equal(editor.model.parts.length, 2);
    editor.redo();
    assert.deepEqual(editor.model.groups[1].parts, ['p3', 'p4']);
    assert.equal(editor.model.parts.length, 4);
});
