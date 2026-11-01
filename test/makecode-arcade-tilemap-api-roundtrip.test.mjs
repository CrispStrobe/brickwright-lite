import test from 'node:test';
import assert from 'node:assert/strict';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {QUERY_SOURCE, QUERY_KEYS, DATA_SOURCE, DATA_KEYS} from './fixtures/arcade-tilemap-api.mjs';

// Import (MakeCode TS -> blocks) and export (blocks -> MakeCode TS) of the whole
// tiles / Location / TileMapData API: the exported project must compile and,
// run in the pinned PXT simulator, must read exactly as the source program does.

function roundtrip(main) {
    const files = {'main.ts': main, 'pxt.json': JSON.stringify({name: 'rt', dependencies: {device: '*'}, files: ['main.ts']})};
    const imported = importProjectFiles(files, {target: 'arcade', name: 'rt'});
    assert.deepEqual(imported.unsupported || [], []);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes || []) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    return projectJsonToArcade(JSON.stringify(creator.project), {name: 'roundtrip',
        costumeSvg: (sprite, costume) => {
            const asset = creator.assets.get(costume.assetId);
            return asset?.type === 'svg' ? asset.data : null;
        }});
}

for (const [name, source, keys, entropy] of [['queries, neighbours and random picks', QUERY_SOURCE, QUERY_KEYS, 0.99], ['TileMapData values and events', DATA_SOURCE, DATA_KEYS, 0.5]]) {
    test(`exported ${name} compile and run as the source program does`, async () => {
        const original = await runPxtArcade(source, {fakeClock: true, waitForGlobals: {done: true}, fixedEntropy: entropy});
        const exported = roundtrip(source);
        const built = await compile('arcade', exported.files);
        assert.equal(built.success, true, JSON.stringify(built.diagnostics?.slice(0, 3)));
        const again = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: {done: true}, fixedEntropy: entropy});
        for (const key of keys) assert.equal(again[key], original[key], key);
    });
}

test('a Loaded listener exports as tiles.addEventListener with a typed parameter', () => {
    const exported = roundtrip(`let hero = sprites.create(img\`1\`, SpriteKind.Player)
tiles.addEventListener(tiles.TileMapEvent.Loaded, function (data) {
    hero.x = data.width
})
`);
    assert.match(exported.files['main.ts'], /tiles\.addEventListener\(tiles\.TileMapEvent\.Loaded, function \(\w+: tiles\.TileMapData\)/);
});
