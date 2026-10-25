// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sandboxWorld, editSandbox, selectSandboxItem, transformSandboxItem, SANDBOX_STORAGE_KEY} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
import {encodeProjectState, decodeProjectState, parseBundleDocument} from '../overlay/scratch-gui/src/lib/bw-project-bundle.js';

test('moved and resized geometry round-trips as validated project content', () => {
    const original = editSandbox(sandboxWorld(), 'crate', 45, 45);
    const selection = selectSandboxItem(original, 45, 45);
    assert.equal(selection.collection, 'objects');
    const moved = transformSandboxItem(original, selection, {dx: 10, dy: 20, scale: 2});
    assert.deepEqual(moved.objects.at(-1).shape, {type: 'rect', x: 55, y: 65, w: 24, h: 24});
    assert.equal(original.objects.at(-1).shape.w, 12);
    const raw = {[SANDBOX_STORAGE_KEY]: JSON.stringify(moved)};
    assert.deepEqual(JSON.parse(decodeProjectState(encodeProjectState(raw))[SANDBOX_STORAGE_KEY]), moved);
    const parsed = parseBundleDocument(JSON.stringify({format: 'brickwright-state', version: 2, state: encodeProjectState(raw)}));
    assert.equal(parsed.outcome, 'loaded');
    assert.deepEqual(JSON.parse(parsed.state[SANDBOX_STORAGE_KEY]), moved);
});
test('polygon points scale around their centre and invalid transforms preserve the source', () => {
    const original = sandboxWorld({mat: {width: 180, height: 120, background: 'white'}, start: {x: 30, y: 40},
        walls: [{shape: {type: 'polygon', points: [[80, 80], [90, 80], [85, 95]]}}]});
    const selection = {collection: 'walls', index: 0};
    assert.deepEqual(transformSandboxItem(original, selection, {dx: 5, scale: 2}).walls[0].shape.points,
        [[80, 75], [100, 75], [90, 105]]);
    for (const transform of [{scale: 0}, {scale: Infinity}, {dx: -1000}, {scale: 100}]) {
        assert.throws(() => transformSandboxItem(original, selection, transform));
    }
    assert.deepEqual(original.walls[0].shape.points, [[80, 80], [90, 80], [85, 95]]);
});
test('invalid arena project content is refused before any section is applied', () => {
    const parsed = parseBundleDocument(JSON.stringify({format: 'brickwright-state', version: 2,
        state: {code: {lang: 'pseudocode', code: 'new'}, spikeArena: {mat: {width: 0, height: 120}}}}));
    assert.equal(parsed.outcome, 'invalid');
    assert.equal(parsed.state, undefined);
});
