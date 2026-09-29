import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRESETS} from '../overlay/scratch-gui/src/reducers/pane-layout.js';

// WHY THIS EXISTS. BLOCKED.md carried "IN PROGRESS: pane-slots (gui.jsx)" for
// weeks, saying "the reducer models content slots (upper/lower per column) and
// gui.jsx reads only .size". That stopped being true — gui.jsx decides the first
// TabPanel's content from `middle.upper` — but nothing pinned it, so the entry
// stayed open and a reader had no way to tell the note from the code. A slot the
// reducer models and nobody reads is the failure mode; this makes it visible.

const gui = readFileSync(
    new URL('../overlay/scratch-gui/src/components/gui/gui.jsx', import.meta.url), 'utf8');

test('gui.jsx reads the middle column CONTENT slot, not only its size', () => {
    assert.match(gui, /paneLayout\?\.middle\?\.upper/,
        'gui.jsx must consume middle.upper — without it every preset renders the ' +
        'same panel and the reducer\'s content model is decoration');
});

test('every size the presets declare is read, and so is the content id', () => {
    for (const column of ['left', 'middle', 'right']) {
        assert.match(gui, new RegExp(`paneLayout\\?\\.${column}\\?\\.size`),
            `gui.jsx must read ${column}.size`);
    }
});

test('the code preset differs from blocks in the slot gui.jsx actually reads', () => {
    // If these agreed, the assertion above could pass while the preset did
    // nothing — the content swap has to be observable in the consumed field.
    assert.notEqual(PRESETS.code.middle.upper, PRESETS.blocks.middle.upper,
        'the code preset must change the middle content id, not just sizes');
    assert.equal(PRESETS.blocks.middle.upper, 'blocks-canvas');
    assert.equal(PRESETS.code.middle.upper, 'code');
});

test('the default gui.jsx falls back to is a content id a preset really uses', () => {
    const fallback = /paneLayout\?\.middle\?\.upper \|\| '([^']+)'/.exec(gui);
    assert.ok(fallback, 'the middle content read must carry an explicit fallback');
    const declared = new Set(Object.values(PRESETS).map(p => p.middle.upper));
    assert.ok(declared.has(fallback[1]),
        `gui.jsx falls back to '${fallback[1]}', which no preset declares — a default ` +
        `nothing can produce is a branch that never runs (presets use: ${[...declared].join(', ')})`);
});
