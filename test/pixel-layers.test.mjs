import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';

const {blankLayer, clearSelectedPixels, composeLayers, containsCell, layersDocument, layersToSvg,
    moveSelectedPixels, resizeLayers, selectionRect, sourceLayers, transformPixels} =
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

test('a custom Arcade palette stays upstream of its SVG rendering', () => {
    const palette = [...ARCADE_PALETTE];
    palette[2] = '#123456';
    const layer = {...blankLayer('paint', 'Paint', 2, 1), pixels: Uint8Array.from([2, 0])};
    const document = layersDocument([layer], 2, 1, 4, 'paint', palette);
    assert.equal(document.version, 2);
    assert.deepEqual(document.palette, palette);
    assert.deepEqual([...sourceLayers(document, 2, 1)[0].pixels], [2, 0]);
    assert.match(layersToSvg([layer], 2, 1, 4, palette), /fill="#123456"/);
    assert.doesNotMatch(layersToSvg([layer], 2, 1, 4, palette), /#ff2121/);
    assert.equal(layersDocument([layer], 2, 1, 4, 'paint').version, 1,
        'untouched default palettes keep the old source document version');
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

test('Arcade flips and turns preserve indices and transform only the selected region', () => {
    const pixels = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    const selection = {x: 1, y: 0, width: 2, height: 2};
    const flipped = transformPixels(pixels, 3, 2, selection, 'flip-h');
    assert.deepEqual([...flipped.pixels], [1, 3, 2, 4, 6, 5]);
    assert.deepEqual(flipped.selection, selection);
    const rotated = transformPixels(pixels, 3, 2, selection, 'rotate-cw');
    assert.deepEqual([...rotated.pixels], [1, 5, 2, 4, 6, 3]);
    assert.deepEqual(rotated.selection, selection);
    const whole = transformPixels(pixels, 3, 2, null, 'rotate-cw');
    assert.deepEqual({width: whole.width, height: whole.height}, {width: 2, height: 3});
    assert.deepEqual([...whole.pixels], [4, 1, 5, 2, 6, 3]);
    assert.deepEqual([...transformPixels(whole.pixels, 2, 3, null, 'rotate-ccw').pixels], [...pixels]);
    assert.deepEqual([...pixels], [1, 2, 3, 4, 5, 6], 'undo snapshots keep original indices');
});

test('a selected quarter turn stays inside the canvas and refuses an impossible footprint', () => {
    const pixels = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const turned = transformPixels(pixels, 4, 3, {x: 2, y: 0, width: 2, height: 3}, 'rotate-cw');
    assert.deepEqual(turned.selection, {x: 1, y: 0, width: 3, height: 2});
    assert.equal(turned.pixels.length, pixels.length);
    assert.equal(transformPixels(pixels, 4, 3, {x: 1, y: 0, width: 3, height: 2}, 'rotate-cw') === null,
        false, 'a fitting rotated footprint is allowed');
    assert.equal(transformPixels(pixels, 4, 3, {x: 0, y: 0, width: 4, height: 1}, 'rotate-cw'), null,
        'a four-cell-high selection cannot fit in a three-cell-high canvas');
});
