import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {placePart} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const part = '32524.dat';
const catalog = new Map(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts.map(p => [p.part, p]));
const model = () => ({version: 1, parts: Array.from({length: 100}, (_, i) => ({
    id: `p${101 + i}`, part, position: [0, 0, i * 40], rotation: identity.slice()
}))});
const placement = {part, position: [200, 0, 0], rotation: identity};

for (const [name, place] of [
    ['placement helper', m => placePart(m, placement)],
    ['editor', m => { const editor = createEditor({model: m, catalog}); editor.apply({type: 'place', ...placement}); return editor.model; }]
]) {
    test(`${name} chooses a free ID after 100 consecutive collisions`, () => {
        const result = place(model());
        assert.equal(result.parts.at(-1).id, 'p201');
        assert.equal(new Set(result.parts.map(p => p.id)).size, result.parts.length);
    });
}
