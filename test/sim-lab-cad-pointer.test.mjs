// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {grabPoint} from '../scripts/lib/sim-lab-cad-gate.mjs';
const name = 'Technic beam 7';
// Authored DOM/frame boundary, not a simulated guest or replacement editor.
function pageFor ({resize = false, drift = false, covered = false, hover = true} = {}) {
    const state = {y: 100, pointer: null, moves: [], keys: [], frames: 0, status: `${name}: old hover`};
    const canvas = {};
    const window = {__bwSimLab: {
        editor: {model: {parts: [{id: 'p16', rotation: [1,0,0,0,1,0,0,0,1]}]}},
        editView: {debugPoint: (_id, local) => local || [0, 0, 0], toScreen: point => [200 + point[2], state.y]}
    }};
    const document = {querySelector: () => canvas, elementFromPoint: () => covered ? {} : canvas};
    const requestAnimationFrame = callback => {
        state.frames++;
        if (drift || (resize && state.frames === 1)) state.y += 20;
        state.status = hover && state.pointer?.[1] === state.y ? `${name}: current hover` : 'No part under pointer';
        queueMicrotask(() => callback());
    };
    const page = {
        mouse: {move: async (x,y) => {state.pointer = [x,y]; state.moves.push([x,y]);}},
        keyboard: {press: async key => {state.keys.push(key);}},
        screenshot: async () => {},
        evaluate: async (fn, args) => vm.runInNewContext(`(${fn.toString()})(args)`,
            {window, document, requestAnimationFrame, args, Promise, Math}),
        getByTestId: () => ({textContent: async () => state.status})
    };
    return {page, state};
}
test('normal aiming returns the actual hovered point', async () => {
    const {page,state} = pageFor();
    const at = await grabPoint(page, 'p16', name);
    assert.deepEqual(Array.from(at), [210,100]);
    assert.equal(state.moves.length, 1);
});
test('hover layout resize re-aims before returning a point to click', async () => {
    const {page,state} = pageFor({resize:true});
    const at = await grabPoint(page, 'p16', name);
    assert.deepEqual(Array.from(at), [210,120]);
    assert.equal(state.moves.length, 2);
    assert.deepEqual(state.pointer, Array.from(at));
});
test('stale matching hover text does not admit an empty point', async () => {
    const {page,state} = pageFor({hover:false});
    await assert.rejects(grabPoint(page, 'p16', name), /no free spot/);
    assert.deepEqual(state.keys, ['f']);
});
test('a covering DOM element cannot reuse the canvas hover status', async () => {
    const {page} = pageFor({covered:true});
    await assert.rejects(grabPoint(page, 'p16', name), /no free spot/);
});
test('a continuously moving projection refuses within a finite move bound', async () => {
    const {page,state} = pageFor({drift:true});
    await assert.rejects(grabPoint(page, 'p16', name), /no free spot/);
    // 20 part-frame spots (6 before F, 14 after) and 15 x 16 spiral spots, each aimed at most 3 times.
    assert.ok(state.moves.length <= (20 + 15 * 16) * 3);
});
