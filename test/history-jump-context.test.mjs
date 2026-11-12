import test from 'node:test';
import assert from 'node:assert/strict';
import {activateUndoSurface, notifyUndoState, registerUndoSurface} from '../overlay/scratch-gui/src/lib/global-undo.js';
import {clearProjectHistory, moveHistory, recordProjectEdit} from '../overlay/scratch-gui/src/lib/bw-undo-coordinator.js';

for (const scope of ['all', 'editor']) {
    test(`${scope} jump stops when the active editor changes while a step is pending`, async () => {
        clearProjectHistory();
        let a = 0, b = 0, finish;
        const calls = [];
        const ua = registerUndoSurface('jump-a', {depth: () => ({undo: a, redo: 0}), undo: () => new Promise(resolve => {
            finish = () => { a--; calls.push('a'); notifyUndoState(); resolve(true); };
        })});
        const ub = registerUndoSurface('jump-b', {depth: () => ({undo: b, redo: 0}), undo: () => {
            b--; calls.push('b'); notifyUndoState(); return true;
        }});
        try {
            activateUndoSurface('jump-a');
            a = 2; b = 1; notifyUndoState();
            const job = moveHistory(-2, scope);
            activateUndoSurface('jump-b');
            finish();
            assert.equal(await job, 1);
            assert.deepEqual(calls, ['a']);
            assert.equal(a, 1);
            assert.equal(b, 1);
        } finally { ua(); ub(); clearProjectHistory(); }
    });
}

test('a project-only jump continues after an editor switch', async () => {
    clearProjectHistory();
    let finish;
    const calls = [];
    try {
        activateUndoSurface('jump-a');
        recordProjectEdit({label: 'first', undo: () => { calls.push('first'); }});
        recordProjectEdit({label: 'second', undo: () => new Promise(resolve => {
            finish = () => { calls.push('second'); resolve(); };
        })});
        const job = moveHistory(-2, 'project');
        await Promise.resolve();
        activateUndoSurface('jump-b');
        finish();
        assert.equal(await job, 2);
        assert.deepEqual(calls, ['second', 'first']);
    } finally { clearProjectHistory(); }
});

test('a project-only jump stops before history from a replacement project', async () => {
    clearProjectHistory();
    let finish;
    const calls = [];
    try {
        recordProjectEdit({label: 'old', undo: () => new Promise(resolve => {
            finish = () => { calls.push('old'); resolve(); };
        })});
        const job = moveHistory(-2, 'project');
        await Promise.resolve();
        clearProjectHistory();
        recordProjectEdit({label: 'new', undo: () => { calls.push('new'); }});
        finish();
        assert.equal(await job, 1);
        assert.deepEqual(calls, ['old']);
    } finally { clearProjectHistory(); }
});

for (const scope of ['all', 'editor']) {
    test(`${scope} jump stops when a surface is replaced under the same name`, async () => {
        clearProjectHistory();
        let finish, replacementCalls = 0;
        let depth = 2;
        const unregisterOld = registerUndoSurface('jump-same', {
            depth: () => ({undo: depth, redo: 0}),
            undo: () => new Promise(resolve => { finish = () => { depth--; notifyUndoState(); resolve(true); }; })
        });
        let unregisterNew = () => {};
        try {
            activateUndoSurface('jump-same');
            const job = moveHistory(-2, scope);
            unregisterOld();
            unregisterNew = registerUndoSurface('jump-same', {
                depth: () => ({undo: 1, redo: 0}), undo: () => { replacementCalls++; return true; }
            });
            finish();
            assert.equal(await job, 1);
            assert.equal(replacementCalls, 0);
        } finally { unregisterOld(); unregisterNew(); clearProjectHistory(); }
    });
}

test('old project undo failure preserves replacement project redo history', async () => {
    clearProjectHistory();
    let rejectOld;
    try {
        recordProjectEdit({label: 'old', undo: () => new Promise((resolve, reject) => { rejectOld = reject; })});
        const old = moveHistory(-1, 'project');
        await Promise.resolve();
        clearProjectHistory();
        let redone = false;
        recordProjectEdit({label: 'new', undo: () => {}, redo: () => { redone = true; }});
        assert.equal(await moveHistory(-1, 'project'), 1);
        rejectOld(new Error('old project is gone'));
        assert.equal(await old, 0);
        assert.equal(await moveHistory(1, 'project'), 1);
        assert.equal(redone, true);
    } finally { clearProjectHistory(); }
});
