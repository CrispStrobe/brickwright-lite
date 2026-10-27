import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {
    activateUndoSurface, getUndoState, notifyUndoState, redoActiveSurface, registerUndoSurface, undoActiveSurface
} from '../overlay/scratch-gui/src/lib/global-undo.js';
import {
    clearProjectHistory, isNewEdit, moveHistory, recordProjectEdit, timeline
} from '../overlay/scratch-gui/src/lib/bw-undo-coordinator.js';

const root = path.resolve(import.meta.dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');

// A counter editor: `value` moves through a linear history like a real editor's stack.
const counter = name => {
    const past = [], future = [];
    const editor = {
        value: 0,
        edit (to) {
            past.push(editor.value);
            future.length = 0;
            editor.value = to;
            notifyUndoState();
        },
        unregister: registerUndoSurface(name, {
            canUndo: () => past.length > 0,
            canRedo: () => future.length > 0,
            depth: () => ({undo: past.length, redo: future.length}),
            undo: () => {
                future.push(editor.value);
                editor.value = past.pop();
                return true;
            },
            redo: () => {
                past.push(editor.value);
                editor.value = future.pop();
                return true;
            }
        })
    };
    return editor;
};

test('a new edit is told apart from undo and redo, including on a capped stack', () => {
    assert.equal(isNewEdit({undo: 2, redo: 0}, {undo: 3, redo: 0}), true);
    assert.equal(isNewEdit({undo: 2, redo: 1}, {undo: 3, redo: 0}), false, 'a redo is not an edit');
    assert.equal(isNewEdit({undo: 3, redo: 0}, {undo: 2, redo: 1}), false, 'an undo is not an edit');
    assert.equal(isNewEdit({undo: 2, redo: 2}, {undo: 3, redo: 0}), true, 'an edit after undos drops redo');
    assert.equal(isNewEdit({undo: 100, redo: 2}, {undo: 100, redo: 0}), true, 'capped stack: redo dropped');
    assert.equal(isNewEdit(undefined, {undo: 1, redo: 0}), false);
});

test('Redo and multi-step history move the active editor back and forth', async () => {
    clearProjectHistory();
    const editor = counter('test-history');
    try {
        activateUndoSurface('test-history');
        for (let i = 1; i <= 60; i++) editor.edit(i);
        assert.equal(getUndoState().undoDepth, 60);
        assert.equal(await moveHistory(-10), 10);
        assert.equal(editor.value, 50);
        assert.equal(await moveHistory(-50), 50);
        assert.equal(editor.value, 0);
        assert.equal(await moveHistory(-5), 0, 'stops at the start');
        assert.equal(getUndoState().canUndo, false);
        assert.equal(getUndoState().redoDepth, 60);
        assert.equal(redoActiveSurface(), true);
        assert.equal(editor.value, 1);
        assert.equal(await moveHistory(100), 59);
        assert.equal(editor.value, 60);
        assert.equal(getUndoState().canRedo, false);
    } finally {
        editor.unregister();
    }
});

test('Undo reverts whichever came last: a project edit or the editor edit', async () => {
    clearProjectHistory();
    const editor = counter('test-order');
    const project = [];
    try {
        activateUndoSurface('test-order');
        editor.edit(1);
        recordProjectEdit({label: 'Delete costume “a”', undo: () => project.push('restore a'),
            redo: () => project.push('delete a')});
        editor.edit(2);
        assert.deepEqual(getUndoState().project.past, ['Delete costume “a”']);

        assert.equal(undoActiveSurface(), true, 'the newest step is the editor edit');
        assert.equal(editor.value, 1);
        assert.equal(await undoActiveSurface(), true, 'then the project edit');
        assert.deepEqual(project, ['restore a']);
        assert.deepEqual(getUndoState().project.future, ['Delete costume “a”']);
        assert.equal(undoActiveSurface(), true, 'then the older editor edit');
        assert.equal(editor.value, 0);

        assert.equal(redoActiveSurface(), true);
        assert.equal(editor.value, 1);
        assert.equal(await redoActiveSurface(), true);
        assert.deepEqual(project, ['restore a', 'delete a']);
    } finally {
        editor.unregister();
        clearProjectHistory();
    }
});

test('the History list merges editor and project steps in order, each named by area and action', async () => {
    clearProjectHistory();
    const past = [], future = [];
    let value = 0;
    const unregister = registerUndoSurface('test-named', {
        label: 'Blocks',
        depth: () => ({undo: past.length, redo: future.length}),
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
        steps: () => ({past: past.map(step => step.label), future: future.map(step => step.label).reverse()}),
        undo: () => { future.push(past.pop()); value--; return true; },
        redo: () => { past.push(future.pop()); value++; return true; }
    });
    const edit = label => { past.push({label}); future.length = 0; value++; notifyUndoState(); };
    try {
        activateUndoSurface('test-named');
        edit('Add whenflagclicked');
        recordProjectEdit({label: 'Costumes: Remove “c”', undo: () => {}, redo: () => {}});
        edit('Move movesteps');
        assert.deepEqual(timeline(), {past: ['Blocks: Move movesteps', 'Costumes: Remove “c”', 'Blocks: Add whenflagclicked'],
            future: []});
        assert.equal(await moveHistory(-2, 'all'), 2, 'two entries back = the editor step, then the project step');
        assert.deepEqual(timeline(), {past: ['Blocks: Add whenflagclicked'],
            future: ['Costumes: Remove “c”', 'Blocks: Move movesteps']});
        assert.equal(value, 1);
        assert.equal(await moveHistory(2, 'all'), 2);
        assert.equal(value, 2);
        assert.deepEqual(timeline().future, []);
    } finally {
        unregister();
        clearProjectHistory();
    }
});

test('a project step that cannot be reverted is dropped and reported, not left to fail again', async () => {
    clearProjectHistory();
    activateUndoSurface('test-none');
    recordProjectEdit({label: 'Delete sprite “gone”', undo: () => {
        throw new Error('That sprite is no longer in this project');
    }});
    assert.equal(await undoActiveSurface(), false);
    assert.match(getUndoState().error, /no longer in this project/);
    assert.deepEqual(getUndoState().project, {past: [], future: []});
});

test('a throwing editor does not break the control', () => {
    const unregister = registerUndoSurface('test-throws', {
        canUndo: () => true,
        undo: () => {
            throw new Error('boom');
        }
    });
    try {
        activateUndoSurface('test-throws');
        assert.equal(undoActiveSurface(), false);
        assert.match(getUndoState().error, /boom/);
    } finally {
        unregister();
    }
});

test('every editor with a history registers with the menu-bar control, with redo', () => {
    const surfaces = {
        blocks: 'overlay/scratch-gui/src/containers/blocks.jsx',
        code: 'overlay/scratch-gui/src/lib/codemirror-editor.jsx',
        widgets: 'overlay/scratch-gui/src/components/tw-pseudocode/controller-panel-view.jsx',
        pixel: 'overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx',
        tilemap: 'overlay/scratch-gui/src/components/tw-pseudocode/tilemap-editor.jsx',
        sounds: 'overlay/scratch-gui/src/containers/sound-editor.jsx',
        fpga: 'overlay/scratch-gui/src/components/tw-pseudocode/fpga-gate-builder-rf.jsx',
        robots: 'overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx'
    };
    for (const [surface, file] of Object.entries(surfaces)) {
        const source = read(file);
        assert.match(source, new RegExp(`registerUndoSurface\\('${surface}'`), `${surface} is not registered`);
        const at = source.indexOf(`registerUndoSurface('${surface}'`);
        assert.match(source.slice(at, at + 1200), /redo/, `${surface} has no redo`);
    }
    // scratch-paint is its own package: it reaches the control through the global bridge.
    const paint = read('overlay/scratch-paint/src/hocs/undo-hoc.jsx');
    assert.match(paint, /registerUndoSurface\('costumes'/);
    assert.match(read('overlay/scratch-gui/src/lib/global-undo.js'), /globalThis\.__bwGlobalUndo = /);
    // The first-load core stays small; the history coordinator is lazy.
    assert.doesNotMatch(read('overlay/scratch-gui/src/lib/global-undo.js'), /^import /m);

    const menu = read('overlay/scratch-gui/src/components/menu-bar/menu-bar.jsx');
    for (const id of ['bw-global-undo', 'bw-global-redo', 'bw-global-history']) {
        assert.match(menu, new RegExp(`data-testid="${id}"`));
    }
    assert.match(menu, /redoActiveSurface\(\)/);
    assert.match(read('overlay/scratch-gui/src/components/menu-bar/settings-menu.jsx'),
        /emit\('bw-open-history-panel', \{view: 'autosave'\}\)/);
});

test('editor tabs fail in place instead of replacing the app with the crash page', () => {
    const hoc = read('overlay/scratch-gui/src/lib/error-boundary-hoc.jsx');
    assert.match(hoc, /EditorErrorBoundary/);
    assert.doesNotMatch(hoc, /^import .*containers\/error-boundary/m);
    const gui = read('overlay/scratch-gui/src/components/gui/gui.jsx');
    for (const name of ['Code', 'Circuit', 'FPGA', 'Robots']) {
        assert.match(gui, new RegExp(`<EditorErrorBoundary name="${name}">`), `${name} tab is not isolated`);
    }
    const costumes = read('overlay/scratch-gui/src/containers/costume-tab.jsx');
    for (const name of ['Paint editor', 'Pixel editor', 'Tilemap editor']) {
        assert.match(costumes, new RegExp(`<EditorErrorBoundary name="${name}">`));
    }
    assert.match(read('overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx'),
        /<EditorErrorBoundary name="Project palette">/);
});

test('the safety net loads after first paint, never at startup', () => {
    const entry = read('overlay/scratch-gui/src/playground/render-gui.jsx');
    assert.match(entry, /import\(\/\* webpackChunkName: "bw-project-safety" \*\/ '\.\.\/lib\/bw-project-safety\.js'\)/);
    assert.doesNotMatch(entry, /^import .*bw-project-safety/m);
    for (const file of ['components/menu-bar/menu-bar.jsx', 'components/gui/gui.jsx']) {
        assert.doesNotMatch(read(`overlay/scratch-gui/src/${file}`), /^import .*(bw-autosave|bw-project-history|bw-undo-coordinator|history-panel)/m,
            `${file} must not import the lazy safety modules`);
    }
});

test('Robot Lab steps are named by command, and the names follow Undo and Redo', async () => {
    const {createEditor} = await import('../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js');
    const catalog = new Map(JSON.parse(readFileSync(path.join(root,
        'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const editor = createEditor({model: {version: 1, parts: []}, catalog});
    editor.apply({type: 'place', part: '32524.dat', position: [0, 0, 0], rotation: I});
    const id = editor.model.parts[0].id;
    editor.apply({type: 'move', id, position: [0, 0, 80], rotation: I});
    assert.deepEqual(editor.historyLabels, {past: ['Add Technic beam 7', 'Move'], future: []});
    editor.undo();
    assert.deepEqual(editor.historyLabels, {past: ['Add Technic beam 7'], future: ['Move']});
    editor.redo();
    assert.deepEqual(editor.historyLabels.past, ['Add Technic beam 7', 'Move']);
});
