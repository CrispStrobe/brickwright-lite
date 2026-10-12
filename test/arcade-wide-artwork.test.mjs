import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {encodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {installAnimationImport, prepareAnimationImport} from '../overlay/scratch-gui/src/lib/bw-animation-import.js';
import {inspectArtwork, applyArtwork, validateDocument, writeArtworkToZip, ARTWORK_PATH, setCostumeDocument, getCostumeDocument}
    from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import {getAssetLibraryRole, withoutAssetLibraries} from '../overlay/scratch-gui/src/lib/bw-asset-library.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {editablePixelLayerBudget, MAX_PIXEL_DIMENSION, pixelsToSvg, svgToPixels, ARCADE_PALETTE}
    from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import * as reader7 from './fixtures/artwork-reader-v7.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {VM, ownerOf, projectOpcodes, stepFrames} from './helpers/bw-vm.mjs';
import {loadExtensionClass, VM_SRC} from './helpers/bw-extensions.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {sourceLayers, sourceFrames, composeLayers, resizeLayers} from '../overlay/scratch-gui/src/lib/bw-pixel-layers.js';
import {scopeAfter} from './helpers/js-scope.mjs';

const width = 161, height = 121;
const frames = Array.from({length: 32}, (_, f) => ({pixels:
    Array(width * height).fill(1 + (f % 15))}));
const files = {'main.ts': `let frames = assets.animation\`Wide\`
let hero = sprites.create(frames[0], SpriteKind.Player)
hero.setPosition(80, 60)
animation.runImageAnimation(hero, frames, 75, true)
console.log(frames[0].width)
console.log(frames[0].height)
console.log(frames[0].getPixel(160, 120))`,
    'pxt.json': JSON.stringify({name: 'Wide animation', dependencies: {device: '*'}, files: ['main.ts', 'images.g.jres']}),
    'images.g.jres': JSON.stringify({Wide: encodeAnimationJres({id: 'Wide', name: 'Wide', width, height,
        intervalMs: 75, frames})})};
const hash = bytes => createHash('md5').update(bytes).digest('hex');

async function open(bytes, project) {
    const vm = new VM(), Storage = (await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
    vm.attachStorage(new Storage());
    for (const id of new Set([...projectOpcodes(project)].map(ownerOf).filter(Boolean))) {
        const service = vm.extensionManager._registerInternalExtension(new (loadExtensionClass(id))(vm.runtime));
        vm.extensionManager._loadedExtensions.set(id, service);
    }
    const inspection = await inspectArtwork(bytes);
    assert.equal(inspection.outcome, 'loaded', inspection.reason);
    await vm.loadProject(bytes);
    assert.equal(applyArtwork(inspection, vm).count, inspection.records.length);
    return {vm, inspection};
}

test('wide animation library installs, runs, saves, reopens and exports exact frames to original PXT', async () => {
    const imported = importProjectFiles(files, {target: 'arcade', animationResources: true});
    assert.deepEqual(imported.unsupported, []);
    const creator = new Creator(); creator.parse(imported.code); assert.deepEqual(creator.warnings, []);
    const zip = await JSZip.loadAsync(await (await creator.generateSB3()).arrayBuffer());
    await installAnimationImport(zip, imported.animationResources, hash);
    assert.equal(JSON.parse(await zip.file(ARTWORK_PATH).async('text')).version, 8);
    const bytes = await zip.generateAsync({type: 'uint8array'});
    const project = JSON.parse(await zip.file('project.json').async('text'));
    const {vm, inspection} = await open(bytes, project);
    try {
        assert.ok(vm.runtime.targets.find(getAssetLibraryRole));
        const [resource] = vm.runtime.bwArcadeAnimationResources.values();
        assert.equal(resource.width, width); assert.equal(resource.height, height);
        assert.deepEqual(resource.frames.map(frame => [...frame.pixels]), frames.map(frame => frame.pixels));
        vm.runtime.stc = creator.project.stc; vm.start(); vm.greenFlag(); vm.quit(); await stepFrames(vm, 30);
        const actors = Object.values(vm.runtime.bwArcadeDeviceState.sprites);
        assert.equal(actors.length, 1); assert.equal(actors[0].width, width); assert.equal(actors[0].height, height);
        assert.equal(actors[0].image.pixels.length, width * height);
        const savedZip = await JSZip.loadAsync(await (await vm.saveProjectSb3()).arrayBuffer());
        assert.equal(await writeArtworkToZip(savedZip, vm), true);
        const saved = await savedZip.generateAsync({type: 'uint8array'});
        assert.equal(JSON.parse(await savedZip.file(ARTWORK_PATH).async('text')).version, 8);
        const reopened = await open(saved, JSON.parse(await savedZip.file('project.json').async('text')));
        try {
            assert.deepEqual(reopened.inspection.records.filter(row => row.document.animation?.resource).map(row => row.document), inspection.records.map(row => row.document));
            assert.equal([...reopened.vm.runtime.bwArcadeAnimationResources.keys()][0], resource.id);
        } finally { reopened.vm.quit(); }
        const out = projectToArcade(withoutAssetLibraries(project, inspection.libraries),
            {animationDocuments: inspection.records.map(row => row.document)});
        assert.deepEqual(out.unsupported, []);
        const again = importProjectFiles(out.files, {target: 'arcade', animationResources: true});
        assert.deepEqual(again.unsupported, []);
        assert.deepEqual(again.animationResources.map(row => row.document), imported.animationResources.map(row => row.document));
        const original = await compile('arcade', out.files);
        assert.equal(original.success, true, JSON.stringify(original.diagnostics));
        const run = await runArcadeSim(original.outfiles['binary.js'], {ms: 150});
        assert.equal(run.error, null);
        const serial = run.serial.map(row => String(row.text).trim());
        for (const value of [width, height, frames[0].pixels.at(-1)]) assert.ok(serial.includes(String(value)), JSON.stringify(serial));

        const old = await reader7.inspectArtwork(saved);
        assert.equal(old.outcome, 'future');
        const raw = await savedZip.file(ARTWORK_PATH).async('text');
        reader7.applyArtwork(old, reopened.vm);
        const preserved = await reader7.attachArtwork(new Blob([saved]), reopened.vm);
        assert.equal(await (await JSZip.loadAsync(await preserved.arrayBuffer())).file(ARTWORK_PATH).async('text'), raw);
    } finally { vm.quit(); }
});

test('512-pixel editing and complete source budget reject excess before reading pixel arrays', () => {
    assert.equal(editablePixelLayerBudget(512, 512, 32), true);
    assert.equal(editablePixelLayerBudget(512, 512, 33), false);
    assert.equal(editablePixelLayerBudget(513, 1, 1), false);
    const image = {width: 512, height: 512, pixels: new Uint8Array(512 * 512).fill(2)};
    image.pixels[image.pixels.length - 1] = 9;
    assert.deepEqual(svgToPixels(pixelsToSvg(image)).pixels, image.pixels);
    const imported = importProjectFiles(files, {target: 'arcade', animationResources: true});
    const bad = structuredClone(imported.animationResources[0].document);
    for (const layers of [bad.layers, ...bad.animation.frames.map(frame => frame.layers)]) {
        const value = layers[0].content.value; value.width = value.height = 512;
        Object.defineProperty(value, 'pixels', {get() { throw new Error('pixel arrays must not be touched'); }});
    }
    assert.throws(() => validateDocument(bad), /artwork pixel budget exceeded/);
    const unreadable = {get pixels() { throw new Error('must reject before native frame conversion'); }};
    assert.throws(() => prepareAnimationImport([{name: 'Too large', width: 512, height: 512,
        frames: Array(32).fill(unreadable)}]), /exceeds editable artwork dimensions or pixel budget/);
});

test('actual Pixel editor loads full wide frames, resizes with Undo and refuses oversized timelines before allocation', async () => {
    const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx', import.meta.url), 'utf8');
    const bind = (signature, parameters, bindings, async = false) => new Function(...Object.keys(bindings),
        `return ${async ? 'async ' : ''}function(${parameters}) ${scopeAfter(source, signature)}`)(...Object.values(bindings));
    const costume = {}, document = importProjectFiles(files, {target: 'arcade', animationResources: true}).animationResources[0].document;
    setCostumeDocument(costume, document);
    const editor = {props: {vm: {editingTarget: {isStage: false}}, locale: 'en'}, state: {}, costume: () => costume,
        setState(patch) { Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch); }};
    await bind('async load (size) {', 'size', {getCostumeDocument, sourceLayers, sourceFrames, composeLayers, ARCADE_PALETTE}, true).call(editor);
    assert.equal(editor.state.w, width); assert.equal(editor.state.h, height); assert.equal(editor.state.scale, 3);
    assert.equal(editor.state.frames.length, 32);
    assert.deepEqual([...editor.state.image.pixels], frames[0].pixels);
    for (const [name, signature, parameters, bindings] of [
        ['materializeFrames', 'materializeFrames (state = this.state) {', 'state=this.state', {}],
        ['stopPlayback', 'stopPlayback () {', '', {}],
        ['remember', 'remember () {', '', {}], ['restore', 'restore (snapshot) {', 'snapshot', {composeLayers}],
        ['undo', 'undo () {', '', {}], ['redo', 'redo () {', '', {}],
        ['resize', 'resize (w, h, scale = this.state.scale) {', 'w,h,scale=this.state.scale',
            {MAX_PIXEL_DIMENSION, editablePixelLayerBudget, resizeLayers, composeLayers, t: (_locale, key) => key}]
    ]) editor[name] = bind(signature, parameters, bindings);
    editor.resize(162, 121);
    assert.equal(editor.state.w, 162); assert.equal(editor.state.frames[0].layers[0].pixels[160], frames[0].pixels[160]);
    editor.undo(); assert.equal(editor.state.w, 161); assert.deepEqual([...editor.state.image.pixels], frames[0].pixels);
    editor.redo(); assert.equal(editor.state.w, 162);
    const previous = editor.state.frames, undoCount = editor.undoStack.length;
    editor.resize(512, 512);
    assert.strictEqual(editor.state.frames, previous); assert.equal(editor.state.w, 162);
    assert.equal(editor.undoStack.length, undoCount); assert.equal(editor.state.status, 'px.pixelBudget');
});

test('wide native animation keeps source geometry, clips the viewport and advances offscreen edge pixels', () => {
    const Arcade = loadExtensionClass('arcade'), runtime = new EventEmitter(), arcade = new Arcade(runtime);
    const BWValues = createRequire(import.meta.url)(VM_SRC + '/util/bw-values');
    const id = 'art:wide', resource = {id, name: 'Wide', width, height, palette: ARCADE_PALETTE,
        revision: 1, frames: frames.map((frame, i) => ({id: `frame-${i}`, durationMs: 75, pixels: Uint8Array.from(frame.pixels)}))};
    runtime.bwArcadeAnimationResources = new Map([[id, resource]]);
    const reference = arcade.animationAssetFreshFrames({RESOURCE: id});
    const images = BWValues.arrayValue(runtime, reference);
    assert.equal(images.length, 32);
    const actor = arcade.createImageSprite({IMAGE: images[0], TEMPLATE: '', KIND: 'Player'});
    arcade.setSpritePosition({ID: actor, X: 80.5, Y: 60.5});
    const sprite = arcade._sprite(actor), window = arcade._spriteRasterWindow(sprite);
    assert.equal(sprite.width, 161); assert.equal(sprite.height, 121);
    assert.equal(window.width, 160); assert.equal(window.height, 120);
    arcade.runImageAnimation({ID: actor, FRAMES: reference, INTERVAL: 75, LOOP: true});
    arcade._advance(.075);
    assert.equal(sprite.image.pixels[160], frames[1].pixels[160]);
    assert.equal(sprite.image.pixels.at(-1), frames[1].pixels.at(-1));
    assert.deepEqual([...resource.frames[0].pixels], frames[0].pixels, 'authored source stays unchanged');
});
