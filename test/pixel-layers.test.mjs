import {test} from 'node:test';
import assert from 'node:assert/strict';

const {blankLayer, composeLayers, layersDocument, resizeLayers, sourceLayers} =
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
