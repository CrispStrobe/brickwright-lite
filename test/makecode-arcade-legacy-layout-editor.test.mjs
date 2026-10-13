import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {findTilemapBlocks, writeTilemapBlock, paintCell, resizeTilemap} from '../overlay/scratch-gui/src/lib/bw-makecode/tilemap-editor.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';
import {getCostumeDocument, setCostumeDocument} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import {findLegacyTileDefinitions, writeLegacyTileDefinition} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-layout-editor.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const SOURCE = 'scene.setTile(1,img`7`,true)\nscene.setTileMap(img`1 0\n0 1`,TileScale.Four)\n';
test('single-assignment image aliases edit source artwork and preserve live pixel mutations', async () => {
    const imported = arcadeToPseudocode('let layout = img`1 0\n0 1`\nlet alias = layout\n' +
        'alias.setPixel(0,0,4)\nlet tileArt = img`7`\nscene.setTile(1,tileArt,true)\nscene.setTileMap(alias,TileScale.Four)');
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findTilemapBlocks(run.vm), [definition] = findLegacyTileDefinitions(run.vm);
        assert.equal(ref.editable, true, ref.reason);
        assert.deepEqual(ref.data.indices, [1, 0, 0, 1], 'the editor reads authored pixels, not mutated live values');
        assert.equal(definition.editable, true, definition.reason);
        const target = run.vm.runtime.getTargetById(ref.targetId);
        const before = JSON.stringify(target.blocks._blocks);
        assert.equal(writeTilemapBlock(run.vm, ref, paintCell(ref.data, 1, 0, 2)), true);
        assert.equal(writeLegacyTileDefinition(run.vm, definition, {...definition.data, pixels: [3]}), true);
        assert.equal(JSON.stringify(target.blocks._blocks), before, 'assignments, aliases and mutations retain their block graph');
        run.vm.greenFlag(); await stepFrames(run.vm, 3);
        assert.deepEqual(Array.from(run.vm.runtime.bwArcadeDeviceState.tilemap.indices), [4, 2, 0, 1]);
        assert.equal(run.vm.runtime.bwArcadeDeviceState.tilemap.images[1].pixels[0], 3);
        const saved = await run.vm.saveProjectSb3(); await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
        assert.deepEqual(findTilemapBlocks(run.vm)[0].data.indices, [1, 2, 0, 1]);
        assert.equal(findLegacyTileDefinitions(run.vm)[0].data.pixels[0], 3);
        const out = projectToArcade(JSON.parse(run.vm.toJSON()), {costumeSvg: (target, costume) =>
            run.vm.runtime.getSpriteTargetByName(target.name)?.getCostumes().find(candidate => candidate.name === costume.name)?.asset?.decodeText()});
        assert.deepEqual(out.unsupported, []);
        assert.match(out.ts, /let layout: Image = null/);
        assert.match(out.ts, /let alias: Image = null/);
        assert.doesNotMatch(out.ts, /\[image reference /);
        const original = await runPxtArcade({...out.files, 'main.ts': out.files['main.ts'] +
            '\nlet aliasMutation = scene.getTile(0,0).tileSet\nlet aliasPainted = scene.getTile(1,0).tileSet\n' +
            'let aliasArt = tiles.getTileImage(tiles.getTileLocation(1,1)).getPixel(0,0)\n'},
        {waitForGlobals: {aliasMutation: 4, aliasPainted: 2, aliasArt: 3}});
        assert.equal(original.aliasMutation, 4); assert.equal(original.aliasPainted, 2); assert.equal(original.aliasArt, 3);
        const externallyEdited = JSON.parse(run.vm.toJSON());
        const stage = externallyEdited.targets.find(target => target.isStage);
        const entry = Object.values(stage.variables).find(variable => variable[0] === 'layout');
        entry[1] = '[image reference externally edited]';
        const changed = projectToArcade(externallyEdited, {costumeSvg: (target, costume) =>
            run.vm.runtime.getSpriteTargetByName(target.name)?.getCostumes().find(candidate => candidate.name === costume.name)?.asset?.decodeText()});
        assert.match(changed.ts, /let layout: any = "\[image reference externally edited\]"/,
            'a stale sidecar cannot erase an external edit to the standard field');
    } finally { run.vm.quit?.(); }
});

test('reassigned image variables remain explicit computed sources', async () => {
    const imported = arcadeToPseudocode('let layout = img`1`\nlayout = img`2`\nscene.setTileMap(layout,TileScale.Four)');
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findTilemapBlocks(run.vm);
        assert.equal(ref.editable, false); assert.equal(ref.reason, 'computedImage');
        assert.deepEqual(Array.from(run.vm.runtime.bwArcadeDeviceState.tilemap.indices), [2]);
    } finally { run.vm.quit?.(); }
});

test('definition pixel and colour-wide wall edits survive native execution, SB3 and original MakeCode', async () => {
    const imported = arcadeToPseudocode(SOURCE);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findLegacyTileDefinitions(run.vm);
        assert.equal(ref.editable, true, ref.reason);
        assert.equal(ref.index, 1);
        assert.equal(ref.wallEditable, true);
        assert.equal(ref.data.wall, true);
        const edited = {...ref.data, pixels: ref.data.pixels.map(() => 3), wall: false};
        assert.equal(writeLegacyTileDefinition(run.vm, ref, edited), true);
        assert.equal(writeLegacyTileDefinition(run.vm, ref, ref.data), false, 'old snapshots cannot overwrite later edits');
        run.vm.greenFlag(); await stepFrames(run.vm, 3);
        const map = run.vm.runtime.bwArcadeDeviceState.tilemap;
        assert.equal(map.images[1].pixels[0], 3);
        assert.equal(Boolean(map.walls[0]), false);
        assert.equal(Boolean(map.walls[3]), false, 'the wall belongs to every cell with this colour index');
        const saved = await run.vm.saveProjectSb3(); await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
        assert.equal(findLegacyTileDefinitions(run.vm)[0].data.wall, false);
        assert.equal(findLegacyTileDefinitions(run.vm)[0].data.pixels[0], 3);
        const out = projectToArcade(JSON.parse(run.vm.toJSON()), {costumeSvg: (target, costume) =>
            run.vm.runtime.getSpriteTargetByName(target.name)?.getCostumes().find(candidate => candidate.name === costume.name)?.asset?.decodeText()});
        assert.deepEqual(out.unsupported, []);
        const original = await runPxtArcade({...out.files, 'main.ts': out.files['main.ts'] +
            '\nlet definitionPixel = tiles.getTileImage(tiles.getTileLocation(0,0)).getPixel(0,0)\n' +
            'let definitionWall = tiles.tileAtLocationIsWall(tiles.getTileLocation(1,1))\n'},
        {waitForGlobals: {definitionPixel: 3, definitionWall: false}});
        assert.equal(original.definitionPixel, 3); assert.equal(original.definitionWall, false);
        const current = findLegacyTileDefinitions(run.vm)[0];
        assert.equal(writeLegacyTileDefinition(run.vm, current, ref.data), true, 'saving undo restores the original definition');
        assert.equal(findLegacyTileDefinitions(run.vm)[0].data.wall, true);
    } finally { run.vm.quit?.(); }
});

test('computed wall expressions remain intact while their static artwork can be edited', async () => {
    const imported = arcadeToPseudocode('let solid = true\nscene.setTile(1,img`7`,solid)\nscene.setTileMap(img`1`,TileScale.Four)');
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findLegacyTileDefinitions(run.vm);
        assert.equal(ref.editable, true);
        assert.equal(ref.wallEditable, false);
        assert.equal(ref.data.wall, null);
        const target = run.vm.runtime.getTargetById(ref.targetId), command = target.blocks.getBlock(ref.blockId);
        const before = JSON.stringify(command);
        assert.equal(writeLegacyTileDefinition(run.vm, ref, {...ref.data, wall: false}), false);
        assert.equal(writeLegacyTileDefinition(run.vm, ref, {...ref.data, pixels: ref.data.pixels.map(() => 8)}), true);
        assert.equal(JSON.stringify(command), before, 'artwork edits never replace a computed wall predicate');
        run.vm.greenFlag(); await stepFrames(run.vm, 3);
        assert.equal(Boolean(run.vm.runtime.bwArcadeDeviceState.tilemap.walls[0]), true);
    } finally { run.vm.quit?.(); }
});
test('legacy layout save edits actual artwork without replacing API calls or tile definitions', async () => {
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findTilemapBlocks(run.vm);
        assert.equal(ref.kind, 'legacyLayout');
        assert.equal(ref.editable, true, ref.reason);
        assert.deepEqual(ref.data.indices, [1, 0, 0, 1]);
        const blocksBefore = JSON.stringify(run.vm.runtime.getTargetById(ref.targetId).blocks._blocks);
        const invalidWallEdit = {...ref.data, walls: [1, 0, 0, 0]};
        assert.equal(writeTilemapBlock(run.vm, ref, invalidWallEdit), false, 'layout save cannot silently discard wall edits');
        const edited = paintCell(ref.data, 1, 0, 2);
        const editingTarget = run.vm.editingTarget;
        assert.equal(writeTilemapBlock(run.vm, ref, edited), true);
        assert.equal(run.vm.editingTarget, editingTarget, 'artwork save does not change the user selection');
        assert.equal(JSON.stringify(run.vm.runtime.getTargetById(ref.targetId).blocks._blocks), blocksBefore);
        assert.deepEqual(findTilemapBlocks(run.vm)[0].data.indices, [1, 2, 0, 1]);
        assert.equal(writeTilemapBlock(run.vm, ref, ref.data), false, 'stale artwork refuses a later overwrite');
        run.vm.greenFlag();
        await stepFrames(run.vm, 3);
        assert.deepEqual(Array.from(run.vm.runtime.bwArcadeDeviceState.tilemap.indices), [1, 2, 0, 1]);
        const sb3 = await run.vm.saveProjectSb3();
        await run.vm.loadProject(Buffer.from(await sb3.arrayBuffer()));
        assert.deepEqual(findTilemapBlocks(run.vm)[0].data.indices, [1, 2, 0, 1]);
        const out = projectToArcade(JSON.parse(run.vm.toJSON()), {costumeSvg: (target, costume) =>
            run.vm.runtime.getSpriteTargetByName(target.name)?.getCostumes().find(candidate => candidate.name === costume.name)?.asset?.decodeText()});
        assert.deepEqual(out.unsupported, []);
        assert.match(out.ts, /scene\.setTileMap/);
        assert.match(out.ts, /scene\.setTile\(1,/);
        assert.equal(JSON.parse(out.files['pxt.json']).dependencies['color-coded-tilemap'], '*');
        const original = await runPxtArcade({...out.files, 'main.ts': out.files['main.ts'] +
            '\nlet paintedIndex = scene.getTile(1,0).tileSet\nlet originalWall = tiles.tileAtLocationIsWall(tiles.getTileLocation(0,0))\n'},
        {waitForGlobals: {paintedIndex: 2, originalWall: true}});
        assert.equal(original.paintedIndex, 2);
        assert.equal(original.originalWall, true, 'editing the layout preserves index-wide wall definitions');
        const reopened = findTilemapBlocks(run.vm)[0];
        assert.equal(writeTilemapBlock(run.vm, reopened, resizeTilemap(reopened.data, 3, 2)), true);
        assert.equal(findTilemapBlocks(run.vm)[0].data.columns, 3);
        run.vm.greenFlag();
        await stepFrames(run.vm, 3);
        assert.equal(run.vm.runtime.bwArcadeDeviceState.tilemap.columns, 3, 'native execution uses resized artwork');
    } finally { run.vm.quit?.(); }
});

test('computed legacy map sources are listed with a reason and never rewritten', async () => {
    const imported = arcadeToPseudocode('let layout = image.create(2,2)\nscene.setTileMap(layout,TileScale.Four)');
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findTilemapBlocks(run.vm);
        assert.equal(ref.kind, 'legacyLayout');
        assert.equal(ref.editable, false);
        assert.equal(ref.reason, 'computedImage');
        assert.equal(writeTilemapBlock(run.vm, ref, {}), false);
    } finally { run.vm.quit?.(); }
});


test('multi-layer legacy artwork is preserved and explicitly delegated to Pixel', async () => {
    const imported = arcadeToPseudocode(SOURCE);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    try {
        const [ref] = findTilemapBlocks(run.vm);
        const target = run.vm.runtime.getTargetById(ref.artworkTargetId);
        const costume = target.getCostumes()[0];
        const document = getCostumeDocument(costume);
        document.layers.push({...document.layers[0], id: 'second', name: 'Second layer'});
        setCostumeDocument(costume, document);
        const blocked = findTilemapBlocks(run.vm)[0];
        assert.equal(blocked.reason, 'layeredArtwork');
        assert.equal(blocked.editable, false);
        assert.equal(writeTilemapBlock(run.vm, ref, ref.data), false);
        assert.equal(getCostumeDocument(costume).layers.length, 2);
        assert.equal(costume.assetId, ref.artworkAssetId);
    } finally { run.vm.quit?.(); }
});
