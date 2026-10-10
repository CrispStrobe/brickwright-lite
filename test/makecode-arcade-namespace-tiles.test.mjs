import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

// Classic projects declare tiles in a namespace and reference them from
// tiles.createTilemap; the namespace lowering turns them into generated consts.
const SOURCE = `namespace myTiles {
    export const transparency16 = img\`
        . .
        . .
    \`
    export const tile0 = img\`
        2 2
        2 2
    \`
}
tiles.setTilemap(tiles.createTilemap(hex\`020001000001\`, img\`
    . .
\`, [myTiles.transparency16, myTiles.tile0], TileScale.Sixteen))`;

test('namespace tile constants resolve inside a tile map', () => {
    const imported = arcadeToPseudocode(SOURCE);
    // Only the separately qualified terrain-physics gap remains.
    assert.deepEqual(imported.unsupported, []);
    const data = JSON.parse(JSON.parse(imported.code.match(/arcade set tilemap data (".*")/)[1]));
    assert.deepEqual(data.indices, [0, 1]);
    assert.deepEqual(data.images[1].pixels, [2, 2, 2, 2]);
});

test('a reassigned plain variable is still not read as a tile', () => {
    const imported = arcadeToPseudocode(`let t = img\`
    2 2
\`
t = img\`
    3 3
\`
tiles.setTilemap(tiles.createTilemap(hex\`0100010000\`, img\`
    .
\`, [t], TileScale.Sixteen))`);
    assert.ok(imported.unsupported.some(message => /readable literal tile map/.test(message)));
});
