import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {REMAINING_SOURCE, REMAINING_KEYS} from './fixtures/arcade-tilemap-remaining-api.mjs';

// The last pinned pxt-arcade tilemap APIs, with the pinned PXT simulator as the
// oracle: tiles.removeEventListener (listeners are kept by function identity, so
// a named procedure registers once and is removed by name; an inline function
// removes nothing), the TileMapData.scale setter (a loaded map keeps its grid
// until it is loaded again), TileMapData.getTileset() (the map's own Image[]),
// and Location.tileMap (the scene's TileMap and its members).

async function lite(source) {
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    let run;
    try {
        run = await runProgram(translated.code, {frames: 6, uploads: translated.costumes || [], storage: true});
        assert.deepEqual(run.errors, []);
        return Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
            .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));
    } finally { run?.vm.quit(); clearStrayTimers(); }
}

function roundtrip(main) {
    const files = {'main.ts': main, 'pxt.json': JSON.stringify({name: 'rt', dependencies: {device: '*'}, files: ['main.ts']})};
    const imported = importProjectFiles(files, {target: 'arcade', name: 'rt'});
    assert.deepEqual(imported.unsupported || [], []);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
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

test('removeEventListener, the scale setter, getTileset and Location.tileMap match the original', async () => {
    const original = await runPxtArcade(REMAINING_SOURCE, {fakeClock: true, waitForGlobals: {done: true}});
    // Guard the fixture itself: these are the PXT facts the program is about.
    assert.equal(original.afterAdd, 10, 'a named listener added twice runs once');
    assert.equal(original.afterRemove, 12, 'removed by name; an inline function removes nothing');
    assert.equal(original.xKept, 12, 'a loaded map keeps its grid after its scale changes');
    assert.equal(original.x16, 24, 'the new scale applies when the map loads again');
    const actual = await lite(REMAINING_SOURCE);
    assert.equal(actual.done, true);
    for (const key of REMAINING_KEYS) assert.equal(actual[key], original[key], key);
});

test('the exported project compiles and runs as the source program does', async () => {
    const original = await runPxtArcade(REMAINING_SOURCE, {fakeClock: true, waitForGlobals: {done: true}});
    const exported = roundtrip(REMAINING_SOURCE);
    assert.deepEqual(exported.unsupported, []);
    const built = await compile('arcade', exported.files);
    assert.equal(built.success, true, JSON.stringify(built.diagnostics?.slice(0, 3)));
    const again = await runPxtArcade(exported.files, {fakeClock: true, waitForGlobals: {done: true}});
    for (const key of REMAINING_KEYS) assert.equal(again[key], original[key], key);
});

const MAP = 'let map = tiles.createTilemap(hex`0100010000`, img`\n.\n`, [img`0`], TileScale.Eight)\nlet loc = tiles.getTileLocation(0, 0)\n';
const ROWS = {
    'tiles.removeEventListener(named)': ['function f(d: tiles.TileMapData) { }\ntiles.addEventListener(tiles.TileMapEvent.Loaded, f)\ntiles.removeEventListener(tiles.TileMapEvent.Loaded, f)',
        /arcade register tilemap event Loaded as "__bwTilemapFn_f"[\s\S]*arcade unregister tilemap event Loaded as "__bwTilemapFn_f"/],
    'TileMapData.scale setter': ['map.scale = TileScale.Sixteen', /arcade set tilemap \(map\) scale to/],
    'TileMapData.getTileset': ['let a = map.getTileset()', /arcade tilemap \(map\) tileset/],
    'Location.tileMap': ['let a = loc.tileMap', /arcade scene tilemap of tile \(loc\)/],
    'TileMap.data': ['let a = loc.tileMap.data', /arcade scene tilemap data of \(arcade scene tilemap of tile \(loc\)\)/],
    'TileMap.areaWidth': ['let a = loc.tileMap.areaWidth()', /arcade scene tilemap areaWidth of/],
    'TileMap.getTileIndex': ['let a = loc.tileMap.getTileIndex(0, 0)', /arcade tilemap \(arcade scene tilemap data of \(arcade scene tilemap of tile \(loc\)\)\) tile index at column/]
};
for (const [api, [call, expected]] of Object.entries(ROWS)) {
    test(`${api} is imported without a gap`, () => {
        const result = arcadeToPseudocode(MAP + call + '\n');
        assert.deepEqual(result.unsupported || [], [], api);
        assert.match(result.code, expected, api);
    });
}

test('an inline function passed to removeEventListener removes nothing and emits nothing', () => {
    const result = arcadeToPseudocode('tiles.removeEventListener(tiles.TileMapEvent.Loaded, function (d: tiles.TileMapData) { })\n');
    assert.deepEqual(result.unsupported || [], []);
    assert.doesNotMatch(result.code, /unregister/);
});

test('a removable listener exports as one named function; a single inline listener stays inline', () => {
    const named = roundtrip('let n = 0\nfunction f(d: tiles.TileMapData) { n += d.width }\ntiles.addEventListener(tiles.TileMapEvent.Loaded, f)\ntiles.removeEventListener(tiles.TileMapEvent.Loaded, f)\n');
    assert.deepEqual(named.unsupported, []);
    assert.match(named.files['main.ts'], /function (__bwTilemapFn_f\w*)\(\w+: tiles\.TileMapData\)[\s\S]*tiles\.addEventListener\(tiles\.TileMapEvent\.Loaded, \1\)\s+tiles\.removeEventListener\(tiles\.TileMapEvent\.Loaded, \1\)/);
    const inline = roundtrip('let n = 0\ntiles.addEventListener(tiles.TileMapEvent.Loaded, function (d) { n += d.width })\n');
    assert.match(inline.files['main.ts'], /tiles\.addEventListener\(tiles\.TileMapEvent\.Loaded, function \(\w+: tiles\.TileMapData\)/);
});
