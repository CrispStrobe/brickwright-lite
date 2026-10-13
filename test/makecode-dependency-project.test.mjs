import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareArcadeDependencyInputs} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-project.js';
import {resolveProjectInputs, compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {encodeTileImage} from '../overlay/scratch-gui/src/lib/bw-makecode/tile-assets.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {SB3Creator, runProgram} from './helpers/bw-vm.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';

const skip = hasRuntime('arcade') ? false : 'Original Arcade runtime not synced';
const filesFor = (main, dependencies) => ({'main.ts': main,
    'pxt.json': JSON.stringify({name: 'dependency-control', dependencies: {device: '*', ...dependencies}, files: ['main.ts']})});
const fakeFetch = sources => async url => {
    const content = sources[url.replace('https://raw.githubusercontent.com/', '')];
    return content === undefined ? new Response('', {status: 404}) : new Response(content);
};

test('original PXT generates asset-pack namespaces and native import retains exact pixels', {skip}, async () => {
    const image = {width: 2, height: 2, pixels: new Uint8Array([1, 2, 3, 4])};
    const original = filesFor('function setup() { let hero = sprites.create(atlas.hero, SpriteKind.Player); hero.setPosition(32, 40); info.setScore(hero.x) }\nsetup()',
        {atlas: 'github:example/atlas#v1'});
    const before = JSON.stringify(original);
    const resolved = await resolveProjectInputs('arcade', original, {fetchExtensions: true, fetch: fakeFetch({
        'example/atlas/v1/pxt.json': JSON.stringify({name: 'atlas', dependencies: {device: '*'},
            assetPack: true, files: ['main.ts', 'images.g.jres']}),
        'example/atlas/v1/main.ts': 'This file is replaced by original PXT asset-pack generation',
        'example/atlas/v1/images.g.jres': JSON.stringify({hero: {data: encodeTileImage(image)},
            '*': {mimeType: 'image/x-mkcd-f4', dataEncoding: 'base64', namespace: 'myImages'}})
    })});
    assert.equal(resolved.packages.atlas.assetPack, true);
    assert.deepEqual(resolved.sourceOrder, [{id: 'atlas', file: 'gallery.ts'}]);
    assert.match(resolved.packages.atlas.files['gallery.ts'], /namespace atlas/);
    assert.ok(resolved.jres['atlas.hero']);
    assert.deepEqual(resolved.netAttempts, []);
    assert.equal(resolved.success, undefined, 'input preparation must not claim compilation');
    const prepared = prepareArcadeDependencyInputs(original, resolved);
    assert.equal(prepared.originalFiles, original);
    assert.equal(JSON.stringify(original), before);
    assert.equal(prepared.files['main.ts'], original['main.ts']);
    assert.equal(prepared.provenance[0].generated, true);
    const imported = arcadeToPseudocode(prepared.files);
    assert.deepEqual(imported.unsupported, []);
    assert.ok(imported.costumes.length || /arcade create/.test(imported.code));
    // An own resource must not be replaced by artwork guessed from a name.
    assert.match(JSON.stringify(resolved.jres['atlas.hero']), new RegExp(encodeTileImage(image).replace(/[+]/g, '\\+')));
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const sprite = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];
    assert.deepEqual([sprite.x, sprite.y, ...sprite.image.pixels], [32, 40, 1, 2, 3, 4]);
    assert.equal(run.vm.runtime.bwArcadeDeviceState.score, 32);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    const exported = projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(exported.unsupported, []);
    const compiled = await compile('arcade', exported.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const roundtrip = arcadeToPseudocode(exported.files);
    assert.deepEqual(roundtrip.unsupported, []);
    const again = await runProgram(roundtrip.code, {frames: 2, uploads: roundtrip.costumes, storage: true});
    assert.deepEqual(again.errors, []);
    assert.deepEqual([...Object.values(again.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels], [1, 2, 3, 4]);
});

test('dependency source order comes from original PXT, with helper code preceding the main program', {skip}, async () => {
    const original = filesFor('info.setScore(outer.value())', {outer: 'github:example/outer#v1'});
    const sources = {
        'example/outer/v1/pxt.json': JSON.stringify({dependencies: {device: '*', inner: 'github:example/inner#v1'}, files: ['main.ts']}),
        'example/outer/v1/main.ts': 'namespace outer { export function value() { return inner.value() + 2 } }',
        'example/inner/v1/pxt.json': JSON.stringify({dependencies: {device: '*'}, files: ['main.ts']}),
        'example/inner/v1/main.ts': 'namespace inner { export function value() { return 15 } }'
    };
    const resolved = await resolveProjectInputs('arcade', original, {fetchExtensions: true, fetch: fakeFetch(sources)});
    assert.deepEqual(resolved.sourceOrder.map(record => record.id), ['inner', 'outer']);
    const prepared = prepareArcadeDependencyInputs(original, resolved);
    const order = JSON.parse(prepared.files['pxt.json']).files;
    assert.ok(order.indexOf(prepared.provenance[0].path) < order.indexOf('main.ts'));
    assert.deepEqual(arcadeToPseudocode(prepared.files).unsupported, []);
    assert.deepEqual(resolved.netAttempts, []);
});

test('missing source, reserved paths and ambiguous resource aliases fail by name', () => {
    const original = filesFor('', {});
    const empty = {packages: {}, sourceOrder: [], jres: {}};
    assert.throws(() => prepareArcadeDependencyInputs({...original, '__bwDependencyInputs/user.ts': ''}, empty), /reserved/);
    assert.throws(() => prepareArcadeDependencyInputs(original, {...empty, sourceOrder: [{id: 'x', file: '../bad.ts'}]}), /Unsafe/);
    assert.throws(() => prepareArcadeDependencyInputs(original, {...empty, sourceOrder: [{id: 'x', file: 'missing.ts'}]}), /Missing resolved/);
    const data = encodeTileImage({width: 1, height: 1, pixels: new Uint8Array([1])});
    const labels = {...empty, jres: {
        'one.hero': {id: 'one.hero', data, mimeType: 'image/x-mkcd-f4', displayName: 'hero'},
        'two.hero': {id: 'two.hero', data, mimeType: 'image/x-mkcd-f4', displayName: 'hero'}
    }};
    assert.doesNotThrow(() => prepareArcadeDependencyInputs(original, labels), 'editor labels do not create factories');
    original['images.g.jres'] = JSON.stringify({root: {data, displayName: 'one.hero'}});
    assert.throws(() => prepareArcadeDependencyInputs(original, labels), /Ambiguous dependency image alias: "one.hero"/);
});

test('CLI dependency fetching is opt-in and its SB3 retains artwork and source provenance', {skip}, async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-dependency-cli-'));
    try {
        const project = path.join(directory, 'input.mkcd');
        const data = encodeTileImage({width: 2, height: 2, pixels: new Uint8Array([1, 2, 3, 4])});
        const sources = {'example/atlas/v1/pxt.json': JSON.stringify({dependencies: {device: '*'}, assetPack: true, files: ['images.g.jres']}),
            'example/atlas/v1/images.g.jres': JSON.stringify({hero: {data}, '*': {mimeType: 'image/x-mkcd-f4', dataEncoding: 'base64'}})};
        const sourcesPath = path.join(directory, 'sources.json'), callsPath = path.join(directory, 'calls.json');
        fs.writeFileSync(sourcesPath, JSON.stringify(sources));
        const preload = path.join(directory, 'fetch.mjs');
        fs.writeFileSync(preload, `import fs from 'node:fs';
const sources=JSON.parse(fs.readFileSync(${JSON.stringify(sourcesPath)},'utf8'));
const calls=[];
globalThis.fetch=async url=>{calls.push(url);fs.writeFileSync(${JSON.stringify(callsPath)},JSON.stringify(calls));
 if(!url.startsWith('https://raw.githubusercontent.com/'))throw Error('unexpected fetch '+url);
 const value=sources[url.slice('https://raw.githubusercontent.com/'.length)];
 return value===undefined?new Response('',{status:404}):new Response(value);};`);
        fs.writeFileSync(project, makeCodeProjectFile(filesFor('let hero = sprites.create(atlas.hero, SpriteKind.Player)',
            {atlas: 'github:example/atlas#v1'}), {target: 'arcade'}));
        const invoke = args => spawnSync(process.execPath, ['--import', path.join(root, 'scripts/lib/register-gui-scope.mjs'),
            '--import', preload, path.join(root, 'scripts/makecode.mjs'), 'to-sb3', project, ...args],
        {cwd: root, encoding: 'utf8', timeout: 120000});
        const offline = invoke(['-o', path.join(directory, 'offline.sb3')]);
        assert.equal(offline.status, 0, offline.stderr);
        assert.match(offline.stderr, /artwork is unavailable/);
        assert.equal(fs.existsSync(callsPath), false);
        const output = path.join(directory, 'resolved.sb3');
        const enabled = invoke(['--fetch-extensions', '-o', output]);
        assert.equal(enabled.status, 0, enabled.stderr);
        assert.doesNotMatch(enabled.stderr, /not translated:/);
        assert.match(enabled.stderr, /dependency: atlas/);
        const zip = await JSZip.loadAsync(fs.readFileSync(output));
        const provenance = JSON.parse(await zip.file('bw.makecode-dependencies.json').async('string'));
        assert.equal(provenance.version, 1);
        assert.equal(provenance.provenance[0].generated, true);
        assert.match(provenance.fetchedExtensions[0].sha256['images.g.jres'], /^[a-f0-9]{64}$/);
        const projectJson = JSON.parse(await zip.file('project.json').async('string'));
        const pixels = [];
        for (const target of projectJson.targets) for (const costume of target.costumes) {
            if (costume.dataFormat !== 'svg') continue;
            const art = svgToPixels(await zip.file(costume.md5ext).async('string'));
            if (art) pixels.push([...art.pixels]);
        }
        assert.ok(pixels.some(image => JSON.stringify(image) === '[1,2,3,4]'), JSON.stringify(pixels));
        fs.writeFileSync(sourcesPath, '{}');
        const missingOutput = path.join(directory, 'refused.sb3');
        const refused = invoke(['--fetch-extensions', '-o', missingOutput]);
        assert.equal(refused.status, 1, refused.stderr);
        assert.match(refused.stderr, /dependency refused: atlas.*HTTP 404/);
        assert.equal(fs.existsSync(missingOutput), false);
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});

test('root galleries retain their original factory keys and bytes during preparation', () => {
    const original = filesFor('', {});
    original['images.g.jres'] = JSON.stringify({'odd image key': {displayName: 'Visible name', data: 'not an image'}});
    const prepared = prepareArcadeDependencyInputs(original, {packages: {}, sourceOrder: [], jres: {}});
    assert.equal(prepared.files['images.g.jres'], original['images.g.jres']);
});

test('namespace song buffers retain their bytes and report the remaining native conversion gap', {skip}, async () => {
    const original = filesFor('let song = music.createSong(atlas.theme)', {atlas: 'github:example/songs#v1'});
    const sources = {'example/songs/v1/pxt.json': JSON.stringify({dependencies: {device: '*'}, assetPack: true, files: ['songs.jres']}),
        'example/songs/v1/songs.jres': JSON.stringify({theme: {mimeType: 'application/mkcd-song', dataEncoding: 'hex', data: '00780004080100'},
            '*': {namespace: 'mySongs', mimeType: 'application/mkcd-song', dataEncoding: 'hex'}})};
    const compiled = await compile('arcade', original, {fetchExtensions: true, fetch: fakeFetch(sources)});
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const resolved = await resolveProjectInputs('arcade', original, {fetchExtensions: true, fetch: fakeFetch(sources)});
    const prepared = prepareArcadeDependencyInputs(original, resolved);
    assert.match(prepared.files[prepared.provenance[0].path], /hex`00780004080100`/);
    const native = arcadeToPseudocode(prepared.files);
    assert.ok(native.unsupported.some(message => /hex.*literal not translated/.test(message)), JSON.stringify(native.unsupported));
    assert.ok(native.unsupported.some(message => /music.createSong requires/.test(message)), JSON.stringify(native.unsupported));
});
