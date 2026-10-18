// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The build tools' pure core (editor/transform-math.js) and the editor's
// multi-part commands (editor/editor-state.js `moveMany` / `batch`).
// Rotations are checked against three.js's own matrices as an independent
// oracle through the contract's frame change (x, -y, -z), not against values
// written down here.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Matrix4, Vector3} from 'three';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {
    GRID_STEPS, DEFAULT_GRID, IDENTITY, snapDelta, cleanRotation, isProperRotation, det3, mul3, mulVec3,
    quantizeAngle, worldAxisRotation, rotatePoses, translatePoses, selectionPivot, groupMembers, expandToGroups,
    facingAxis, placeCopies, connectorNumber
} from '../overlay/scratch-gui/src/lib/bw-sim/editor/transform-math.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8'))
    .parts.map(p => [p.part, p]));

const toWorld = v => new Vector3(v[0], -v[1], -v[2]);
const exactEntries = m => m.every(v => v === 0 || v === 1 || v === -1);
const near = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) <= eps);

test('snapDelta: every component becomes a multiple of the grid, nearest one', () => {
    assert.equal(DEFAULT_GRID, 10);
    assert.deepEqual(GRID_STEPS, [1, 5, 10, 20]);
    const raw = [13.2, -7.9, 26, 4.99, -0.4, 101];
    for (const grid of GRID_STEPS) {
        const out = snapDelta(raw, grid);
        out.forEach((v, i) => {
            assert.ok(Number.isInteger(v / grid), `${v} is not a multiple of ${grid}`);
            assert.ok(Math.abs(v - raw[i]) <= grid / 2 + 1e-9, `${raw[i]} snapped too far to ${v}`);
            assert.ok(!Object.is(v, -0), 'no negative zero (it would print as -0 in LDraw)');
        });
    }
    assert.deepEqual(snapDelta([13, -7, 26], 10), [10, -10, 30]);
});

test('worldAxisRotation: quarter turns are exact proper rotations that turn the scene as three.js does', () => {
    const three = {x: a => new Matrix4().makeRotationX(a), y: a => new Matrix4().makeRotationY(a), z: a => new Matrix4().makeRotationZ(a)};
    const probes = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [3, -5, 7]];
    for (const axis of ['x', 'y', 'z']) {
        for (const k of [-3, -2, -1, 1, 2, 3, 4]) {
            const angle = k * Math.PI / 2;
            const r = worldAxisRotation(axis, angle);
            assert.ok(exactEntries(r), `${axis} ${k}·90°: entries not exact: ${r}`);
            assert.equal(det3(r), 1);
            for (const p of probes) {
                // LDraw rotation applied in LDraw, then to world ≡ world rotation of the world point.
                const viaLdraw = toWorld(mulVec3(r, p));
                const viaThree = toWorld(p).applyMatrix4(three[axis](angle));
                assert.ok(viaLdraw.distanceTo(viaThree) < 1e-9, `${axis} ${k}·90° on ${p}`);
            }
        }
        // Four quarter turns are exactly the identity.
        let m = IDENTITY;
        for (let i = 0; i < 4; i++) m = cleanRotation(mul3(worldAxisRotation(axis, Math.PI / 2), m));
        assert.deepEqual(m, [...IDENTITY]);
    }
});

test('15° steps stay proper rotations through long mixed sequences; 24 steps close the circle', () => {
    for (const axis of ['x', 'y', 'z']) {
        let m = IDENTITY;
        for (let i = 0; i < 24; i++) m = cleanRotation(mul3(worldAxisRotation(axis, quantizeAngle(0.26, 15)), m));
        assert.ok(near(m, IDENTITY), `${axis}: 24 × 15° is not the identity: ${m}`);
        assert.ok(exactEntries(m), 'back to exact entries');
    }
    // A long pseudo-random walk: never drifts out of SO(3).
    let m = IDENTITY;
    let seed = 7;
    for (let i = 0; i < 2000; i++) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const axis = ['x', 'y', 'z'][seed % 3];
        const steps = (seed >> 4) % 23 - 11;
        m = rotatePoses([{id: 'a', position: [0, 0, 0], rotation: m}], worldAxisRotation(axis, quantizeAngle(steps * Math.PI / 12, 15)), [0, 0, 0])[0].rotation;
        assert.ok(isProperRotation(m, 1e-12), `step ${i}: ${m}`);
    }
});

test('quantizeAngle rounds to the nearest step', () => {
    assert.ok(Math.abs(quantizeAngle(1.4, 90) - Math.PI / 2) < 1e-15);
    // 0.8 rad is 45.8°, past half a quarter turn; 0.78 rad (44.7°) is not.
    assert.ok(Math.abs(quantizeAngle(0.8, 90) - Math.PI / 2) < 1e-15);
    assert.equal(quantizeAngle(0.78, 90), 0);
    assert.ok(Math.abs(quantizeAngle(-2.4, 90) + Math.PI) < 1e-15);
    assert.ok(Math.abs(quantizeAngle(0.2, 15) - Math.PI / 12) < 1e-15);
});

test('cleanRotation: a drifted quarter turn becomes exact; a mirror is not a rotation', () => {
    const noisy = [6e-17, 0, 1 + 3e-12, 0, 1, -2e-13, -1, 1e-16, 0];
    const clean = cleanRotation(noisy);
    assert.deepEqual(clean, [0, 0, 1, 0, 1, 0, -1, 0, 0]);
    assert.ok(isProperRotation(clean));
    assert.equal(isProperRotation([-1, 0, 0, 0, 1, 0, 0, 0, 1]), false);
});

test('rotatePoses turns a selection rigidly about its pivot; four quarter turns give back the start exactly', () => {
    const parts = [
        {id: 'a', position: [0, -10, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]},
        {id: 'b', position: [60, -30, 20], rotation: [0, -1, 0, 1, 0, 0, 0, 0, 1]}
    ];
    const pivot = selectionPivot(parts, 10);
    assert.deepEqual(pivot, [30, -20, 10], 'mean of the origins on the grid');
    const r = worldAxisRotation('y', Math.PI / 2);
    const turned = rotatePoses(parts, r, pivot);
    // Distances between the parts are kept, and every part's frame turned with the group.
    const dist = (p, q) => Math.hypot(...p.map((v, i) => v - q[i]));
    assert.equal(dist(turned[0].position, turned[1].position), dist(parts[0].position, parts[1].position));
    for (const [i, t] of turned.entries()) {
        assert.ok(exactEntries(t.rotation) && det3(t.rotation) === 1);
        // Oracle: three.js turns the world point about the world pivot.
        const w = toWorld(parts[i].position).sub(toWorld(pivot)).applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2)).add(toWorld(pivot));
        assert.ok(toWorld(t.position).distanceTo(w) < 1e-9, `part ${t.id}`);
    }
    let poses = parts;
    for (let i = 0; i < 4; i++) poses = rotatePoses(poses.map((p, j) => ({...parts[j], ...p})), r, pivot);
    assert.deepEqual(poses.map(p => p.position), parts.map(p => p.position));
    assert.deepEqual(poses.map(p => p.rotation), parts.map(p => p.rotation));
    assert.deepEqual(selectionPivot([parts[1]]), [60, -30, 20], 'a lone part turns about its own origin');
});

test('translatePoses moves every part by the same delta and keeps rotations', () => {
    const parts = [{id: 'a', position: [0, 0, 0], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0]}, {id: 'b', position: [5, 6, 7], rotation: [...IDENTITY]}];
    const moved = translatePoses(parts, [20, -10, 0]);
    assert.deepEqual(moved, [{id: 'a', position: [20, -10, 0], rotation: parts[0].rotation}, {id: 'b', position: [25, -4, 7], rotation: [...IDENTITY]}]);
});

const beamModel = () => ({version: 1, parts: [
    {id: 'b1', part: '32524.dat', position: [0, -10, 0], rotation: [...IDENTITY], color: 71},
    {id: 'b2', part: '32524.dat', position: [0, -30, 0], rotation: [...IDENTITY], color: 4},
    {id: 'p1', part: '2780.dat', position: [0, -20, 60], rotation: [...IDENTITY]}
]});

test('moveMany: a multi-part move is ONE undo step, one notification, all or nothing', () => {
    const editor = createEditor({model: beamModel(), catalog: CATALOG});
    let notified = 0;
    editor.subscribe(() => notified++);
    const before = editor.model;
    const moves = translatePoses(before.parts.filter(p => p.id !== 'p1'), [40, 0, -20]);
    editor.apply({type: 'moveMany', moves});
    assert.equal(notified, 1);
    const after = editor.model;
    assert.deepEqual(after.parts.find(p => p.id === 'b1').position, [40, -10, -20]);
    assert.deepEqual(after.parts.find(p => p.id === 'b2').position, [40, -30, -20]);
    assert.deepEqual(after.parts.find(p => p.id === 'p1').position, [0, -20, 60], 'the unselected pin stays');
    editor.undo();
    assert.deepEqual(editor.model, before, 'one undo restores both parts');
    assert.equal(editor.canUndo, false, 'the move was a single history entry');
    editor.redo();
    assert.deepEqual(editor.model, after);

    // A bad step (unknown id, an improper rotation) leaves the model and the history untouched.
    const snapshot = editor.model;
    assert.throws(() => editor.apply({type: 'moveMany', moves: [{id: 'b1', position: [0, 0, 0], rotation: [...IDENTITY]}, {id: 'nope', position: [0, 0, 0], rotation: [...IDENTITY]}]}), /unknown id/);
    assert.deepEqual(editor.model, snapshot);
    assert.throws(() => editor.apply({type: 'moveMany', moves: [{id: 'b1', position: [0, 0, 0], rotation: [-1, 0, 0, 0, 1, 0, 0, 0, 1]}]}), /proper rotation/);
    assert.deepEqual(editor.model, snapshot);
    assert.throws(() => editor.apply({type: 'moveMany', moves: [{id: 'b1', position: [0, 0, 0], rotation: [...IDENTITY]}, {id: 'b1', position: [1, 0, 0], rotation: [...IDENTITY]}]}), /twice/);
    assert.throws(() => editor.apply({type: 'moveMany', moves: []}), /at least one/);
    editor.undo();
    assert.deepEqual(editor.model, before, 'failed commands added no history');
});

test('a group rotation through moveMany undoes in one step', () => {
    const editor = createEditor({model: beamModel(), catalog: CATALOG});
    const before = editor.model;
    const sel = before.parts.filter(p => p.id !== 'p1');
    editor.apply({type: 'moveMany', moves: rotatePoses(sel, worldAxisRotation('y', Math.PI / 2), selectionPivot(sel))});
    assert.notDeepEqual(editor.model.parts[0].rotation, before.parts[0].rotation);
    editor.undo();
    assert.deepEqual(editor.model, before);
});

test('batch: pasted copies are one undo step and get fresh ids; copies keep colour, not the hub port', () => {
    const model = beamModel();
    model.parts.push({id: 'm1', part: '54696p01.dat', position: [100, 10, 80], rotation: [0, -1, 0, -1, 0, 0, 0, 0, -1], port: 'A'});
    const editor = createEditor({model, catalog: CATALOG});
    const before = editor.model;
    const copies = placeCopies(before.parts.filter(p => p.id === 'b2' || p.id === 'm1'), [20, 0, 0]);
    editor.apply({type: 'batch', commands: copies});
    const after = editor.model;
    assert.equal(after.parts.length, before.parts.length + 2);
    const added = after.parts.slice(-2);
    assert.equal(new Set(after.parts.map(p => p.id)).size, after.parts.length, 'ids stay unique');
    assert.deepEqual(added[0].position, [20, -30, 0]);
    assert.equal(added[0].color, 4);
    assert.equal(added[1].port, undefined, 'a copied motor does not take over port A');
    editor.undo();
    assert.deepEqual(editor.model, before);
});

test('groupMembers / expandToGroups: tolerate no groups, expand a grouped part to its group', () => {
    const model = beamModel();
    assert.deepEqual(groupMembers(model, 'b1'), ['b1']);
    assert.deepEqual(expandToGroups(model, ['b1', 'gone']), ['b1'], 'ids the model no longer has are dropped');
    model.groups = [{id: 'g1', parts: ['b1', 'b2']}];
    assert.deepEqual(expandToGroups(model, ['b2']).sort(), ['b1', 'b2']);
    assert.deepEqual(expandToGroups(model, ['p1']), ['p1']);
    model.groups = {g1: ['p1', 'b2']};
    assert.deepEqual(expandToGroups(model, ['p1']).sort(), ['b2', 'p1']);
    model.groups = new Map([['g', {members: ['b1', 'p1']}]]);
    assert.deepEqual(expandToGroups(model, ['b1']).sort(), ['b1', 'p1']);
});

test('facingAxis and connectorNumber', () => {
    assert.equal(facingAxis({x: 0.2, z: -0.9}), 'z');
    assert.equal(facingAxis({x: -0.8, z: 0.3}), 'x');
    assert.equal(connectorNumber('h2'), 3);
    assert.equal(connectorNumber('x13'), 14);
    assert.equal(connectorNumber('ball'), null);
});
