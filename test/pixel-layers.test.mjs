import {test} from 'node:test';
import assert from 'node:assert/strict';

const {blankLayer, clearSelectedPixels, composeLayers, containsCell, lassoSelection, layersDocument,
    moveSelectedPixels, resizeLayers, selectionRect, sourceLayers, wandSelection} =
    await import('../overlay/scratch-gui/src/lib/bw-pixel-layers.js');

test('pixel layers compose in order and keep hidden edits in source', () => {
    const bottom = {...blankLayer('bottom', 'Bottom', 2, 1), pixels: Uint8Array.from([2, 3])};
    const top = {...blankLayer('top', 'Top', 2, 1), pixels: Uint8Array.from([10, 0])};
    assert.deepEqual([...composeLayers([bottom, top], 2, 1).pixels], [10, 3]);
    const hidden = {...top, visible: false};
    assert.deepEqual([...composeLayers([bottom, hidden], 2, 1).pixels], [2, 3]);
    const doc = layersDocument([bottom, hidden], 2, 1, 4, 'top');
    assert.equal(doc.activeLayerId, 'top');
    assert.deepEqual([...sourceLayers(doc, 2, 1)[1].pixels], [10, 0]);
    assert.equal(sourceLayers(doc, 3, 1), null);
    assert.deepEqual([...composeLayers(resizeLayers([bottom, hidden], 2, 1, 3, 1), 3, 1).pixels],
        [2, 3, 0]);
});

test('lasso selects its traced edge and interior, not the surrounding rectangle', () => {
    const lasso = lassoSelection([[1, 1], [5, 1], [1, 5]], 7, 7);
    assert.ok(containsCell(lasso, 2, 2), 'a cell inside the outline is selected');
    assert.ok(containsCell(lasso, 1, 4), 'the traced edge is selected');
    assert.equal(containsCell(lasso, 5, 5), false, 'a cell in the bounding box is excluded');
    const cleared = clearSelectedPixels(Uint8Array.from({length: 49}, () => 2), 7, lasso);
    assert.equal(cleared[(2 * 7) + 2], 0);
    assert.equal(cleared[(5 * 7) + 5], 2);
});

test('wand uses connected palette colour and tolerance while excluding transparency', () => {
    const pixels = Uint8Array.from([2, 2, 0, 2, 2, 3, 0, 2, 0, 3, 3, 2]);
    const exact = wandSelection(pixels, 4, 3, 0, 0, 0);
    assert.ok(containsCell(exact, 1, 0));
    assert.ok(containsCell(exact, 0, 1));
    assert.equal(containsCell(exact, 1, 1), false, 'a different colour is excluded at zero tolerance');
    assert.equal(containsCell(exact, 3, 0), false, 'a disconnected matching colour is excluded');
    const broad = wandSelection(pixels, 4, 3, 0, 0, 120);
    assert.ok(containsCell(broad, 1, 1), 'a nearby palette colour joins at higher tolerance');
    assert.equal(containsCell(broad, 2, 0), false, 'transparent pixels stay separate');
    const moved = moveSelectedPixels(pixels, 4, 3, exact, 2, 0);
    assert.equal(moved.pixels[(1 * 4) + 1], 3, 'an unselected cell inside the bounding box stays put');
    assert.equal(moved.pixels[(1 * 4) + 2], 2, 'only selected cells move');
});

test('selection moves only its active-layer pixels and clamps at canvas edges', () => {
    const selected = selectionRect([2, 1], [1, 0]);
    assert.deepEqual(selected, {x: 1, y: 0, width: 2, height: 2});
    assert.ok(containsCell(selected, 2, 1));
    assert.equal(containsCell(selected, 0, 1), false);
    const pixels = Uint8Array.from([0, 2, 3, 0, 0, 4, 0, 0, 0, 0, 0, 0]);
    const moved = moveSelectedPixels(pixels, 4, 3, selected, 10, 10);
    assert.deepEqual(moved.selection, {x: 2, y: 1, width: 2, height: 2});
    assert.deepEqual([...moved.pixels], [0, 0, 0, 0, 0, 0, 2, 3, 0, 0, 4, 0]);
    assert.deepEqual([...pixels], [0, 2, 3, 0, 0, 4, 0, 0, 0, 0, 0, 0],
        'the undo snapshot must remain unchanged');
    assert.deepEqual([...clearSelectedPixels(pixels, 4, selected)],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});
