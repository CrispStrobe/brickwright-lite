import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProjectInputs, compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';

const skip = hasRuntime('arcade') ? false : 'Original Arcade worker not synced';
const paletteA = ['#000000', ...ARCADE_PALETTE.slice(1)];
paletteA[10] = '#E3A591';paletteA[12] = '#5F5F5F';
const paletteB = [...paletteA];paletteB[10] = '#102030';paletteB[12] = '#405060';
const rootPalette = [...paletteA];rootPalette[10] = '#ABCDEF';rootPalette[12] = '#123456';
const pkg = (namespace, palette) => ({'pxt.json': JSON.stringify({dependencies: {device: '*'},
    files: ['main.ts'], palette}), 'main.ts': `namespace ${namespace} { export const hero = img\`a c\` }`});
const sources = {a: pkg('a', paletteA), b: pkg('b', paletteB)};
const fakeFetch = async url => {
    const match = String(url).match(/^https:\/\/raw\.githubusercontent\.com\/example\/([ab])\/v1\/(.+)$/);
    const text = match && sources[match[1]][match[2]];
    return text === undefined ? new Response('', {status: 404}) : new Response(text);
};
const filesFor = (dependencies, palette) => ({'main.ts': 'scene.setBackgroundColor(12)\nlet hero = sprites.create(a.hero, SpriteKind.Player)\nhero.setPosition(80, 60)',
    'pxt.json': JSON.stringify({dependencies: {device: '*', ...dependencies}, files: ['main.ts'], ...(palette ? {palette} : {})})});
const hexOf = palette => palette.map(value => value.slice(1).toLowerCase()).join('');

test('effective dependency palette comes from original PXT package loading and preserves the original project', {skip}, async () => {
    const original = filesFor({a: 'github:example/a#v1'});
    const before = JSON.stringify(original);
    const resolved = await resolveProjectInputs('arcade', original, {fetchExtensions: true, fetch: fakeFetch});
    assert.equal(hexOf(resolved.runtimeConfig.palette), hexOf(paletteA));
    const prepared = prepareArcadeDependencyInputs(original, resolved);
    assert.equal(hexOf(JSON.parse(prepared.files['pxt.json']).palette), hexOf(paletteA));
    assert.equal(JSON.stringify(original), before);
    assert.equal(prepared.originalFiles, original);
    const imported = importProjectFiles(prepared.files, {target: 'arcade'});
    assert.deepEqual(imported.unsupported, []);
    assert.ok(imported.code.includes(hexOf(paletteA)));
    const compiled = await compile('arcade', original, {fetchExtensions: true, fetch: fakeFetch});
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    assert.ok(compiled.outfiles['binary.js'].toLowerCase().includes(hexOf(paletteA)));
    const originalRun = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 200});
    assert.equal(originalRun.error, null);
    const native = await runProgram(imported.code, {frames: 15, uploads: imported.costumes, storage: true});
    try {
        assert.deepEqual(native.errors, []);
        assert.deepEqual(Array.from(native.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels), Array.from(originalRun.screen()));
    } finally { native.vm.quit(); }
});

test('original package order and root overrides supply the palette actually compiled', {skip}, async () => {
    for (const dependencies of [{a: 'github:example/a#v1', b: 'github:example/b#v1'},
        {b: 'github:example/b#v1', a: 'github:example/a#v1'}]) {
        for (const palette of [undefined, rootPalette]) {
            const original = filesFor(dependencies, palette);
            const before = JSON.stringify(original);
            const resolved = await resolveProjectInputs('arcade', original, {fetchExtensions: true, fetch: fakeFetch});
            if (palette) assert.equal(hexOf(resolved.runtimeConfig.palette), hexOf(rootPalette));
            else assert.ok([paletteA, paletteB].some(candidate => hexOf(candidate) === hexOf(resolved.runtimeConfig.palette)));
            const compiled = await compile('arcade', original, {fetchExtensions: true, fetch: fakeFetch});
            assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
            assert.ok(compiled.outfiles['binary.js'].toLowerCase().includes(hexOf(resolved.runtimeConfig.palette)));
            const prepared = prepareArcadeDependencyInputs(original, resolved);
            assert.deepEqual(JSON.parse(prepared.files['pxt.json']).palette, resolved.runtimeConfig.palette);
            assert.equal(JSON.stringify(original), before);
        }
    }
});
