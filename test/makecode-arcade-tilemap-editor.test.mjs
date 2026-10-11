// The tile map painter's model (lib/bw-makecode/tilemap-editor.js): pure edits
// of the `set Arcade tilemap` data, an undo history, and finding/writing the
// block a level lives in, checked against the running game.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createTilemap, paintCell, eraseCell, fillCells, setWall, resizeTilemap, setTileSize, addTile, removeTile,
    paintTilePixel, setTileImage, createHistory, commit, undo, redo, parseTilemapText, tilemapText,
    findTilemapBlocks, writeTilemapBlock
} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-editor.js';
import {tilemapSource} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-values.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';

const grid = data => Array.from({length: data.rows}, (_, r) => data.indices.slice(r * data.columns, (r + 1) * data.columns).join('')).join('/');

test('painting, erasing and filling change only the cells they should', () => {
    let map = addTile(createTilemap({columns: 4, rows: 3, tileSize: 8})).data;
    map = addTile(map).data;
    const before = map;
    map = paintCell(map, 1, 1, 1);
    assert.equal(grid(map), '0000/0100/0000');
    assert.equal(grid(before), '0000/0000/0000', 'edits do not mutate the previous value');
    map = fillCells(map, 0, 0, 2);
    assert.equal(grid(map), '2222/2122/2222', 'fill stops at a different tile');
    map = eraseCell(map, 3, 2);
    assert.equal(grid(map), '2222/2122/2220');
    assert.equal(paintCell(map, 9, 9, 1), map, 'outside the map: unchanged');
    assert.equal(paintCell(map, 0, 0, 7), map, 'an unknown tile: unchanged');
    assert.ok(tilemapSource(map), 'the result exports as a MakeCode tile map');
});

test('walls are a layer of their own; resizing keeps the top-left; tile size crops and pads', () => {
    let map = addTile(createTilemap({columns: 3, rows: 2, tileSize: 4})).data;
    map = paintCell(setWall(map, 2, 1, true), 2, 1, 1);
    assert.deepEqual(map.walls, [0, 0, 0, 0, 0, 1]);
    assert.equal(setWall(map, 2, 1, true), map);
    map = resizeTilemap(map, 4, 3);
    assert.equal(grid(map), '0000/0010/0000');
    assert.deepEqual(map.walls, [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
    map = resizeTilemap(map, 2, 2);
    assert.equal(grid(map), '00/00');
    map = paintTilePixel(map, 1, 3, 3, 5);
    assert.equal(map.images[1].pixels[15], 5);
    const bigger = setTileSize(map, 8);
    assert.equal(bigger.images[1].width, 8);
    assert.equal(bigger.images[1].pixels[3 * 8 + 3], 5, 'the pixel keeps its place at the top-left');
    assert.equal(setTileSize(bigger, 4).images[1].pixels[15], 5);
    assert.equal(setTileSize(map, 6), map, 'Arcade tile sizes only');
});

test('removing a tile empties its cells and renumbers later tiles; tile 0 stays', () => {
    let map = createTilemap({columns: 3, rows: 1, tileSize: 4});
    for (let i = 0; i < 3; i++) map = addTile(map).data;
    map = paintCell(paintCell(paintCell(map, 0, 0, 1), 1, 0, 2), 2, 0, 3);
    map = setTileImage(map, 3, {width: 1, height: 1, pixels: [9]});
    const removed = removeTile(map, 2);
    assert.equal(grid(removed), '102');
    assert.equal(removed.images.length, 3);
    assert.equal(removed.images[2].pixels[0], 9, 'tile 3 became tile 2 with its pixels');
    assert.equal(removeTile(map, 0), map);
});

test('undo and redo walk the history; a new edit drops the redo branch', () => {
    const start = addTile(createTilemap({columns: 2, rows: 1, tileSize: 4})).data;
    let h = createHistory(start);
    h = commit(h, paintCell(h.present, 0, 0, 1));
    h = commit(h, paintCell(h.present, 1, 0, 1));
    assert.equal(grid(h.present), '11');
    h = undo(h);
    assert.equal(grid(h.present), '10');
    h = redo(h);
    assert.equal(grid(h.present), '11');
    h = commit(undo(undo(h)), setWall(start, 0, 0, true));
    assert.equal(h.future.length, 0);
    assert.equal(commit(h, h.present), h, 'an unchanged edit adds nothing');
});

test('text round trip: what a block holds parses back to the same map; junk does not', () => {
    const map = paintCell(addTile(createTilemap({columns: 2, rows: 2, tileSize: 16})).data, 1, 1, 1);
    assert.deepEqual(parseTilemapText(tilemapText(map)), map);
    for (const junk of ['', 'null', '{', '{"columns":2}', JSON.stringify({...map, tileSize: 6})]) {
        assert.equal(parseTilemapText(junk), null, junk);
    }
});

// A real imported level, edited through the block it lives in.
const LEVEL = `tiles.setTilemap(tiles.createTilemap(hex\`03000200000001000000\`, img\`
    . . 2
    . . .
\`, [img\`
    . . . .
    . . . .
    . . . .
    . . . .
\`, img\`
    7 7 7 7
    7 7 7 7
    7 7 7 7
    7 7 7 7
\`], TileScale.Four))
let hero = sprites.create(img\`2\`, SpriteKind.Player)
`;

test('the painter finds an imported level, and an edit written back is what the game uses', async () => {
    const r = arcadeToPseudocode(LEVEL);
    assert.deepEqual(r.unsupported, []);
    const run = await runProgram(r.code, {frames: 2, uploads: r.costumes, storage: true});
    try {
        const found = findTilemapBlocks(run.vm);
        assert.equal(found.length, 1);
        const [ref] = found;
        assert.equal(ref.editable, true);
        assert.equal(ref.targetName, 'Game');
        assert.equal(grid(ref.data), '001/000');
        assert.deepEqual(ref.data.walls, [0, 0, 1, 0, 0, 0]);
        const state = () => run.vm.runtime.bwArcadeDeviceState.tilemap;
        assert.deepEqual(Array.from(state().indices), [0, 0, 1, 0, 0, 0]);
        const edited = setWall(paintCell(ref.data, 0, 1, 1), 0, 1, true);
        assert.equal(writeTilemapBlock(run.vm, ref, edited), true);
        assert.deepEqual(findTilemapBlocks(run.vm)[0].data, edited, 'the block holds the edit');
        run.vm.greenFlag();
        await stepFrames(run.vm, 3);
        assert.deepEqual(Array.from(state().indices), [0, 0, 1, 1, 0, 0], 'the game draws the painted cell');
        assert.deepEqual(Array.from(state().walls), [0, 0, 1, 1, 0, 0], 'and collides with the new wall');
        const exported = projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.match(exported.ts, /tiles\.createTilemap\(hex`03000200000001010000`/, 'MakeCode export carries the painted level');
    } finally {
        run.vm.quit?.();
    }
});

test('a level that is not literal data is listed but not editable, and writing to it is refused', async () => {
    const run = await runProgram('DEVICE ARCADE\nSPRITE Game:\n  WHEN flag clicked:\n    arcade set tilemap data "not a map"\n', {frames: 0});
    try {
        const [ref] = findTilemapBlocks(run.vm);
        assert.equal(ref.editable, false);
        assert.equal(writeTilemapBlock(run.vm, {...ref, shadowId: 'missing'}, createTilemap()), false);
        assert.equal(writeTilemapBlock(run.vm, ref, {columns: 0}), false, 'invalid data is never written');
    } finally {
        run.vm.quit?.();
    }
});
