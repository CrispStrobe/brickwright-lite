// The tile map painter's model (lib/bw-makecode/tilemap-editor.js): pure edits
// of the `set Arcade tilemap` data, an undo history, and finding/writing the
// block a level lives in, checked against the running game.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createTilemap, paintCell, eraseCell, fillCells, setWall, resizeTilemap, setTileSize, addTile, removeTile,
    paintTilePixel, setTileImage, createHistory, commit, undo, redo, parseTilemapText, tilemapText,
    findTilemapBlocks, writeTilemapBlock, addTilemapBlock
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

test('a new level is a real green-flag script the game runs', async () => {
    const r = arcadeToPseudocode('let hero = sprites.create(img`2`, SpriteKind.Player)\n');
    const run = await runProgram(r.code, {frames: 1, uploads: r.costumes, storage: true});
    try {
        assert.equal(findTilemapBlocks(run.vm).length, 0);
        const game = run.vm.runtime.targets.find(t => t.isOriginal && t.getName() === 'Game');
        let map = addTile(createTilemap({columns: 5, rows: 4, tileSize: 8})).data;
        map = setWall(paintCell(map, 2, 3, 1), 2, 3, true);
        const ref = await addTilemapBlock(run.vm, map, {targetId: game.id});
        assert.equal(ref.targetName, 'Game');
        assert.deepEqual(ref.data, map);
        const hat = game.blocks.getBlock(game.blocks.getBlock(ref.blockId).parent);
        assert.equal(hat.opcode, 'event_whenflagclicked', 'the level is set when the game starts');
        run.vm.greenFlag();
        await stepFrames(run.vm, 3);
        const state = run.vm.runtime.bwArcadeDeviceState.tilemap;
        assert.equal(state.columns, 5);
        assert.equal(state.indices[3 * 5 + 2], 1);
        assert.equal(state.walls[3 * 5 + 2], 1);
        const saved = await run.vm.saveProjectSb3();
        await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
        assert.deepEqual(findTilemapBlocks(run.vm)[0].data, map, 'it survives SB3 save and reload');
        await assert.rejects(addTilemapBlock(run.vm, {columns: 0}), /Invalid/);
    } finally {
        run.vm.quit?.();
    }
});

// Named resource identity must survive the data editor and real MakeCode files,
// rather than being reconstructed later from identical-looking inline pixels.
import {encodeTileImage, parseTileAssets, TileAssetExporter} from '../overlay/scratch-gui/src/lib/bw-makecode/tile-assets.js';
import {decodeMkcdImage} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {normalizeTilemap, renameTile, tilemapEditUpdates} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-editor.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const NAMED_LEVEL = `namespace myTiles {
    export const empty = img\`0 0\n0 0\`
    export const floor = img\`7 7\n7 7\`
}
tiles.setTilemap(tiles.createTilemap(hex\`020001000100\`, img\`2 .\`,
    [myTiles.empty, myTiles.floor], TileScale.Four))
`;
const mapData = result => result.code.split('\n').filter(line => line.trim().startsWith('arcade set tilemap data '))
    .map(line => JSON.parse(JSON.parse(line.trim().slice('arcade set tilemap data '.length))));

test('named namespace tile identities survive normalization, resizing, editing and undo', () => {
    const imported = arcadeToPseudocode(NAMED_LEVEL);
    assert.deepEqual(imported.unsupported, []);
    const [map] = mapData(imported);
    assert.equal(map.images[1].tileId, 'myTiles.floor');
    assert.equal(map.images[1].displayName, 'floor');
    assert.equal(normalizeTilemap(map).images[1].tileId, 'myTiles.floor');
    const resized = setTileSize(map, 8);
    assert.equal(resized.images[1].tileId, 'myTiles.floor');
    const edited = paintTilePixel(resized, 1, 0, 0, 3);
    const renamed = renameTile(edited, 1, 'Cracked floor');
    assert.equal(renamed.images[1].tileId, 'myTiles.floor');
    assert.equal(renamed.images[1].displayName, 'Cracked floor');
    assert.equal(renamed.images[1].pixels[0], 3);
    assert.equal(undo(commit(createHistory(map), renamed)).present, map);
    assert.deepEqual(parseTilemapText(tilemapText(renamed)), renamed);
});

test('tile resource encoding preserves odd-height column padding and all palette indexes', () => {
    const image = {width: 3, height: 3, pixels: [0, 1, 2, 3, 4, 5, 6, 7, 15]};
    const decoded = decodeMkcdImage(encodeTileImage(image));
    assert.equal(decoded.width, 3);
    assert.equal(decoded.height, 3);
    assert.deepEqual(Array.from(decoded.pixels), image.pixels);
});

test('distinct names with identical art remain distinct; conflicting edits cannot silently alias', () => {
    const warnings = [], tiles = new TileAssetExporter(warnings);
    const image = {width: 1, height: 1, pixels: [2]};
    assert.equal(tiles.register({...image, tileId: 'myTiles.floor', displayName: 'Floor'}, 1), 'myTiles.floor');
    assert.equal(tiles.register({...image, tileId: 'myTiles.other', displayName: 'Other'}, 1), 'myTiles.other');
    assert.equal(tiles.register({...image, tileId: 'myTiles.floor', displayName: 'Floor'}, 1), 'myTiles.floor');
    assert.equal(tiles.register({...image, pixels: [3], tileId: 'myTiles.floor', displayName: 'Floor'}, 1), 'myTiles.floor_2');
    assert.match(warnings[0], /conflicting edits/);
    const parsed = parseTileAssets(tiles.files()['tilemap.g.jres']);
    assert.equal(parsed['myTiles.floor'].pixels[0], 2);
    assert.equal(parsed['myTiles.floor_2'].pixels[0], 3);
    assert.equal(parsed.Floor, null, 'an ambiguous display alias cannot select arbitrary art');
});

test('edited named tiles export as actual original-compiler resources and reimport with identity', async () => {
    const imported = arcadeToPseudocode(NAMED_LEVEL);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findTilemapBlocks(run.vm);
        const edited = renameTile(paintTilePixel(ref.data, 1, 0, 0, 3), 1, 'Cracked floor');
        assert.equal(writeTilemapBlock(run.vm, ref, edited), true);
        const exported = projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.deepEqual(exported.unsupported, []);
        const resources = JSON.parse(exported.files['tilemap.g.jres']);
        assert.equal(resources['myTiles.floor'].tilemapTile, true);
        assert.equal(resources['myTiles.floor'].displayName, 'Cracked floor');
        assert.equal(decodeMkcdImage(resources['myTiles.floor'].data).pixels[0], 3);
        assert.match(exported.files['tilemap.g.ts'], /blockIdentity=images\._tile/);
        assert.match(exported.ts, /myTiles\.floor/);
        assert.ok(JSON.parse(exported.files['pxt.json']).files.includes('tilemap.g.jres'));
        const original = await runPxtArcade({...exported.files,
            'main.ts': `${exported.files['main.ts']}\nlet exportedTilePixel = myTiles.floor.getPixel(0, 0)\n`}, {waitForGlobals: {exportedTilePixel: 3}});
        assert.equal(original.exportedTilePixel, 3, 'PXT actually consumes the edited JRES resource');
        const roundtrip = arcadeToPseudocode(exported.files);
        assert.deepEqual(roundtrip.unsupported, []);
        assert.deepEqual(mapData(roundtrip)[0], edited, 'stable IDs, display names, pixels and walls return unchanged');
    } finally { run.vm.quit?.(); }
});

test('saving a shared named asset updates other maps, survives SB3 and exports one original resource', async () => {
    const imported = arcadeToPseudocode(NAMED_LEVEL);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findTilemapBlocks(run.vm);
        const second = resizeTilemap(ref.data, 1, 2);
        const secondRef = await addTilemapBlock(run.vm, second);
        const edited = renameTile(paintTilePixel(ref.data, 1, 0, 0, 3), 1, 'Shared floor');
        assert.equal(writeTilemapBlock(run.vm, ref, edited), true);
        const maps = findTilemapBlocks(run.vm);
        assert.equal(maps.length, 2);
        assert.ok(maps.every(map => map.data.images[1].pixels[0] === 3 && map.data.images[1].displayName === 'Shared floor'));
        const secondMap = maps.find(map => map.blockId === secondRef.blockId);
        assert.deepEqual(secondMap.data.indices, second.indices, 'shared editing preserves the other level layout');
        assert.equal(secondMap.data.rows, 2);
        run.vm.greenFlag();
        await stepFrames(run.vm, 3);
        assert.equal(run.vm.runtime.bwArcadeDeviceState.tilemap.images[1].pixels[0], 3);
        const saved = await run.vm.saveProjectSb3();
        await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
        assert.ok(findTilemapBlocks(run.vm).every(map => map.data.images[1].displayName === 'Shared floor'));
        const exported = projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.deepEqual(exported.unsupported, []);
        assert.ok(!exported.warnings.some(warning => /conflicting edits/.test(warning)));
        assert.deepEqual(Object.keys(JSON.parse(exported.files['tilemap.g.jres'])).sort(), ['myTiles.empty', 'myTiles.floor']);
        const original = await runPxtArcade({...exported.files,
            'main.ts': `${exported.files['main.ts']}\nlet sharedPixel = myTiles.floor.getPixel(0, 0)\n`}, {waitForGlobals: {sharedPixel: 3}});
        assert.equal(original.sharedPixel, 3);
        assert.ok(mapData(arcadeToPseudocode(exported.files)).every(map => map.images[1].displayName === 'Shared floor'));
        assert.equal(writeTilemapBlock(run.vm, ref, edited), false, 'a stale pre-reload reference cannot overwrite the loaded project');
        const restored = findTilemapBlocks(run.vm).find(map => map.blockId === ref.blockId);
        const undone = undo(commit(createHistory(ref.data), edited)).present;
        assert.equal(writeTilemapBlock(run.vm, restored, undone), true);
        assert.ok(findTilemapBlocks(run.vm).every(map => map.data.images[1].pixels[0] === 7 && map.data.images[1].displayName === 'floor'),
            'saving an undone asset edit restores every shared use');
    } finally { run.vm.quit?.(); }
});

test('shared asset updates preserve divergent copies and reject stale or ambiguous edits', () => {
    const [data] = mapData(arcadeToPseudocode(NAMED_LEVEL));
    const ref = {targetId: 'a', blockId: 'first', shadowId: 'shadow', editable: true, data};
    const matching = {...ref, targetId: 'b', blockId: 'second'};
    const divergent = {...ref, blockId: 'third', data: paintTilePixel(data, 1, 0, 0, 8)};
    const edited = paintTilePixel(data, 1, 0, 0, 3);
    const updates = tilemapEditUpdates([ref, matching, divergent], ref, edited);
    assert.deepEqual(updates.map(map => map.blockId), ['first', 'second']);
    assert.equal(divergent.data.images[1].pixels[0], 8, 'a divergent copy is never overwritten');
    assert.equal(tilemapEditUpdates([{...ref, data: divergent.data}], ref, edited), null);
    const duplicate = {...data, images: [...data.images, {...data.images[1]}]};
    const duplicateRef = {...ref, data: duplicate};
    const twice = paintTilePixel(paintTilePixel(duplicate, 1, 0, 0, 3), 2, 0, 0, 9);
    assert.equal(tilemapEditUpdates([duplicateRef], duplicateRef, twice), null, 'two conflicting edits cannot choose arbitrary pixels');
    const once = paintTilePixel(duplicate, 1, 0, 0, 3);
    assert.ok(tilemapEditUpdates([duplicateRef], duplicateRef, once)[0].data.images.slice(1).every(image => image.pixels[0] === 3));
});
