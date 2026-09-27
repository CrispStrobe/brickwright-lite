import {test} from 'node:test';
import assert from 'node:assert/strict';

const {blankLayer, clearSelectedPixels, composeLayers, containsCell, layersDocument, layersToSvg,
    moveSelectedPixels, resizeLayers, selectionRect, sourceLayers} =
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

test('layer opacity survives source save and produces a translucent Scratch render', () => {
    const bottom = {...blankLayer('bottom', 'Bottom', 2, 1), pixels: Uint8Array.from([2, 2])};
    const top = {...blankLayer('top', 'Top', 2, 1), pixels: Uint8Array.from([10, 0]), opacity: 0.5};
    const doc = layersDocument([bottom, top], 2, 1, 4, 'top');
    assert.equal(sourceLayers(doc, 2, 1)[1].opacity, 0.5);
    const svg = layersToSvg([bottom, top], 2, 1, 4);
    assert.match(svg, /<g opacity="0\.5"><rect/);
    assert.match(svg, /<g opacity="1"><rect/);
    assert.equal((svg.match(/<g opacity=/g) || []).length, 2);
    assert.deepEqual([...composeLayers([bottom, {...top, opacity: 0}], 2, 1).pixels], [2, 2]);
    assert.equal(layersToSvg([bottom, {...top, opacity: 0}], 2, 1, 4),
        layersToSvg([bottom], 2, 1, 4), 'a zero-opacity layer leaves the old SVG format intact');
    assert.equal(layersToSvg([bottom, {...top, opacity: 1}], 2, 1, 4),
        layersToSvg([{...bottom, pixels: Uint8Array.from([10, 2])}], 2, 1, 4),
        'fully opaque art retains the previous flattened SVG format');
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
