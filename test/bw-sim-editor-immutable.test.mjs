// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The editor's model is immutable with structural sharing (editor/editor-state.js):
// reading it costs no copy, no caller can change the editor's state through any
// model it is handed (the getter, apply/undo/redo's return, a subscriber's
// argument, the model it was created from), an edit shares every part it did not
// touch, and undo/redo walk back and forth through exactly the states the edits made.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEditor, partsByIdOf} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {IDENTITY, worldAxisRotation} from '../overlay/scratch-gui/src/lib/bw-sim/editor/transform-math.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8'))
    .parts.map(p => [p.part, p]));
const I = [...IDENTITY];
const BEAM7 = '32524.dat';

/** Beams 7 in a row, 40 LDU apart (none touches another), and a group of the first two. */
const row = n => ({
    version: 1,
    parts: Array.from({length: n}, (_, i) => ({id: `p${i + 1}`, part: BEAM7, position: [0, 0, i * 40], rotation: I.slice(), color: 71})),
    groups: [{id: 'g1', name: 'Pair', parts: ['p1', 'p2']}]
});
const snapshot = m => JSON.parse(JSON.stringify(m));

/** Every way a caller might try to change a model it was handed. */
const tamper = model => {
    const attempts = [
        () => { model.parts.push({id: 'x', part: BEAM7, position: [0, 0, 0], rotation: I}); },
        () => { model.parts.pop(); },
        () => { model.parts.sort((a, b) => b.id.localeCompare(a.id)); },
        () => { model.parts[0] = {...model.parts[0], id: 'zz'}; },
        () => { model.parts[0].position[0] = 999; },
        () => { model.parts[0].rotation[4] = -1; },
        () => { model.parts[0].color = 4; },
        () => { delete model.parts[0].color; },
        () => { model.parts[1].id = 'renamed'; },
        () => { model.version = 7; },
        () => { model.groups[0].parts.push('p3'); },
        () => { model.groups[0].name = 'Other'; },
        () => { model.groups.length = 0; }
    ];
    let refused = 0;
    for (const attempt of attempts) {
        try { attempt(); } catch (error) { assert.ok(error instanceof TypeError, String(error)); refused++; }
    }
    return {refused, of: attempts.length};
};

test('no model the editor hands out can change its state: every write is refused', () => {
    const ed = createEditor({model: row(4), catalog: CATALOG});
    const before = snapshot(ed.model);
    const handed = [ed.model];
    ed.subscribe(m => handed.push(m));
    handed.push(ed.apply({type: 'move', id: 'p3', position: [0, -24, 80], rotation: I}));
    handed.push(ed.undo());
    handed.push(ed.redo());
    const after = snapshot(ed.model);
    for (const m of handed) {
        const {refused, of} = tamper(m);
        assert.equal(refused, of, 'every attempt throws (the model and all inside it are frozen)');
    }
    assert.deepEqual(snapshot(ed.model), after, 'the state is what the edit made, untouched by the attempts');
    ed.undo();
    assert.deepEqual(snapshot(ed.model), before, 'and so is the history');
});

test('the model an editor is created from is copied, never kept: changing it later changes nothing', () => {
    const input = row(3);
    const ed = createEditor({model: input, catalog: CATALOG});
    const before = snapshot(ed.model);
    input.parts[0].position[0] = 500;
    input.parts.push({id: 'p9', part: BEAM7, position: [0, 0, 400], rotation: I.slice()});
    input.groups[0].parts.push('p3');
    assert.deepEqual(snapshot(ed.model), before);
    assert.ok(!Object.isFrozen(input.parts), 'and the caller\'s own model is not frozen for them');
    // The arrays a command is given are copied too.
    const position = [0, -24, 0];
    ed.apply({type: 'move', id: 'p2', position, rotation: I});
    position[0] = 77;
    assert.deepEqual(ed.model.parts[1].position, [0, -24, 0]);
});

test('reading the model is free: the same object until an edit, no copy per read', () => {
    const ed = createEditor({model: row(50), catalog: CATALOG});
    const a = ed.model;
    assert.equal(ed.model, a, 'two reads, one object');
    assert.equal(partsByIdOf(a), partsByIdOf(ed.model), 'and its id map is built once');
    assert.equal(partsByIdOf(a).get('p7'), a.parts[6]);
    ed.apply({type: 'recolor', id: 'p7', color: 4});
    assert.notEqual(ed.model, a, 'an edit makes a new model');
    assert.equal(partsByIdOf(ed.model).get('p7').color, 4);
});

test('structural sharing: an edit keeps every part it did not touch as the same object', () => {
    const ed = createEditor({model: row(30), catalog: CATALOG});
    const m0 = ed.model;
    const same = (m, n, except) => m.parts.forEach((p, i) => {
        if (!except.includes(p.id)) assert.equal(p, n.parts.find(q => q.id === p.id), `${p.id} kept`);
    });
    ed.apply({type: 'move', id: 'p5', position: [0, -24, 160], rotation: I});
    const m1 = ed.model;
    same(m0, m1, ['p5']);
    assert.notEqual(m1.parts[4], m0.parts[4]);
    assert.equal(m1.groups, m0.groups, 'groups untouched: shared');
    ed.apply({type: 'moveMany', moves: [{id: 'p10', position: [0, -24, 360], rotation: I}, {id: 'p11', position: [0, -24, 400], rotation: worldAxisRotation('y', Math.PI / 2)}]});
    same(m1, ed.model, ['p10', 'p11']);
    const m2 = ed.model;
    ed.apply({type: 'paint', ids: ['p20', 'p21'], color: 1});
    same(m2, ed.model, ['p20', 'p21']);
    const m3 = ed.model;
    ed.apply({type: 'place', part: BEAM7, position: [200, 0, 0], rotation: I, color: 14});
    same(m3, ed.model, []);
    assert.equal(ed.model.parts.length, 31);
    const m4 = ed.model;
    ed.apply({type: 'delete', id: 'p1'});
    same(m4, ed.model, ['p1']);
    assert.equal(ed.model.groups, undefined, 'the group of two lost a member and dissolved');
    // Undo brings back the very objects (the history holds the frozen models themselves).
    ed.undo();
    assert.equal(ed.model, m4);
    ed.undo(); ed.undo(); ed.undo(); ed.undo();
    assert.equal(ed.model, m0);
    assert.equal(ed.model.parts[4], m0.parts[4]);
});

test('undo/redo: a long random edit session walks back and forth through exactly the states it made', () => {
    let seed = 11;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ed = createEditor({model: row(12), catalog: CATALOG});
    const states = [snapshot(ed.model)];
    let notified = 0;
    ed.subscribe(() => notified++);
    const ids = () => ed.model.parts.map(p => p.id);
    const anyId = () => ids()[Math.floor(rand() * ids().length)];
    let applied = 0;
    for (let i = 0; i < 120; i++) {
        const k = Math.floor(rand() * 9);
        const far = [Math.round(rand() * 20) * 40 + 600, -24 * Math.floor(rand() * 4), Math.round(rand() * 20) * 40];
        const cmd = [
            () => ({type: 'move', id: anyId(), position: far, rotation: I}),
            () => ({type: 'place', part: BEAM7, position: far, rotation: worldAxisRotation('y', Math.PI / 2), color: 4}),
            () => ({type: 'delete', id: anyId()}),
            () => ({type: 'recolor', id: anyId(), color: Math.floor(rand() * 10)}),
            () => ({type: 'group', ids: [anyId(), anyId()], name: `G${i}`}),
            () => ({type: 'moveMany', ids: [anyId()], delta: [0, -24, 0]}),
            () => ({type: 'batch', commands: [{type: 'place', part: BEAM7, position: far, rotation: I}, {type: 'move', id: anyId(), position: far.map((v, j) => (j === 0 ? v + 400 : v)), rotation: I}]}),
            () => ({type: 'cloneMany', ids: [anyId()], offset: [0, -48, 0]}),
            () => ({type: 'paint', ids: [anyId()], color: 25})
        ][k]();
        try {
            ed.apply(cmd);
        } catch {
            // Refused (an invalid group, a clash, nothing to paint): no state, no step.
            assert.deepEqual(snapshot(ed.model), states.at(-1), `a refused ${cmd.type} changes nothing`);
            continue;
        }
        applied++;
        states.push(snapshot(ed.model));
    }
    assert.ok(applied > 60, `${applied} edits applied`);
    assert.equal(notified, applied);
    for (let i = states.length - 1; i > 0; i--) {
        assert.ok(ed.canUndo);
        ed.undo();
        assert.deepEqual(snapshot(ed.model), states[i - 1], `undo to state ${i - 1}`);
    }
    assert.equal(ed.canUndo, false);
    for (let i = 1; i < states.length; i++) {
        ed.redo();
        assert.deepEqual(snapshot(ed.model), states[i], `redo to state ${i}`);
    }
    assert.equal(ed.canRedo, false);
});
