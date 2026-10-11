import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {loadExtensionClass, VM_SRC} from './helpers/bw-extensions.mjs';
const BWValues = createRequire(import.meta.url)(VM_SRC + '/util/bw-values');
const Arcade = loadExtensionClass('arcade');
const palette = [null, '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
function setup() {
    const runtime = new EventEmitter(), arcade = new Arcade(runtime), errors = [];
    runtime.on('BLOCKS_ERROR', message => errors.push(message));
    const resource = {id: 'art:walk', name: 'Walk', width: 1, height: 1, palette: palette.slice(), revision: 1,
        frames: [{id: 'red', durationMs: 100, pixels: new Uint8Array([2])},
            {id: 'pink', durationMs: 100, pixels: new Uint8Array([3])}]};
    runtime.bwArcadeAnimationResources = new Map([[resource.id, resource]]);
    const frames = () => arcade.animationAssetFrames({RESOURCE: resource.id});
    return {runtime, arcade, errors, resource, frames};
}
test('resource menus use persistent ids and reporters share typed arrays and image identity', () => {
    const g = setup(), first = g.frames(), second = g.frames();
    assert.strictEqual(first, second);
    const images = BWValues.arrayValue(g.runtime, first);
    assert.equal(images.length, 2);
    assert.equal(g.arcade._image(images[0]).pixels[0], 2);
    assert.deepEqual(g.arcade._image(images[0]).palette, palette);
    assert.deepEqual(g.arcade._image(g.arcade.cloneImage({IMAGE: images[0]})).palette, palette);
    assert.equal(setup().arcade._image(images[0]), null, 'references cannot cross projects');
    g.arcade.mutateImage({IMAGE: images[0], OP: 'fill', COLOR: 7});
    assert.equal(g.arcade._image(BWValues.arrayValue(g.runtime, g.frames())[0]).pixels[0], 7);
    assert.equal(g.resource.frames[0].pixels[0], 2, 'runtime mutation does not edit authored source');
    g.resource.name = 'Renamed';
    assert.deepEqual(g.arcade.getAnimationAssets(), [{text: 'Renamed', value: 'art:walk'}]);
    const info = g.arcade.getInfo();
    for (const opcode of ['animationAssetFrames', 'animationAssetFreshFrames', 'animationAssetInterval']) {
        assert.equal(info.blocks.find(block => block.opcode === opcode).arguments.RESOURCE.menu, 'animationAssets');
    }
    assert.equal(info.menus.animationAssets.acceptReporters, true);
    assert.equal(BWValues.decode(g.arcade.animationAssetInterval({RESOURCE: g.resource.id})), 100);
    assert.deepEqual(g.errors, []);
});
test('revisions snapshot new frames while running animation retains previous image objects', () => {
    const g = setup(), oldReference = g.frames(), oldImages = BWValues.arrayValue(g.runtime, oldReference);
    const actor = g.arcade.createImageSprite({IMAGE: oldImages[0], TEMPLATE: '', KIND: 'Player'});
    g.arcade.runImageAnimation({ID: actor, FRAMES: oldReference, INTERVAL: 100, LOOP: true});
    g.arcade._advance(.05);
    assert.equal(g.arcade.spritePixel({ID: actor, X: 0, Y: 0}), 2);
    g.resource.revision = 'content-hash:revision-2';
    g.resource.frames[1].pixels[0] = 7;
    const replacement = g.frames();
    assert.notStrictEqual(replacement, oldReference);
    assert.equal(g.arcade._image(BWValues.arrayValue(g.runtime, replacement)[1]).pixels[0], 7);
    g.arcade._advance(.05);
    assert.equal(g.arcade.spritePixel({ID: actor, X: 0, Y: 0}), 3);
    g.arcade.runImageAnimation({ID: actor, FRAMES: replacement, INTERVAL: 100, LOOP: true});
    g.arcade._advance(.1);
    assert.equal(g.arcade.spritePixel({ID: actor, X: 0, Y: 0}), 7);
});
test('missing, deleted and malformed resources report their identity without invented values', () => {
    const g = setup();
    g.frames();
    g.runtime.bwArcadeAnimationResources.delete(g.resource.id);
    for (const method of ['animationAssetFrames', 'animationAssetFreshFrames', 'animationAssetInterval']) {
        assert.equal(BWValues.decode(g.arcade[method]({RESOURCE: g.resource.id})), undefined);
    }
    assert.ok(g.errors.every(error => error.includes('art:walk') && error.includes('missing or deleted')));
    assert.match(g.arcade.getAnimationAssets()[0].text, /No animation assets/);
    g.runtime.bwArcadeAnimationResources.set(g.resource.id, g.resource);
    const invalid = [() => { g.resource.frames[1].durationMs = 101; },
        () => { g.resource.frames[1].pixels[0] = 16; },
        () => { g.resource.width = 161; }];
    for (const mutate of invalid) {
        mutate();
        assert.equal(BWValues.decode(g.frames()), undefined);
        assert.equal(BWValues.decode(g.arcade.animationAssetFreshFrames({RESOURCE: g.resource.id})), undefined);
        assert.equal(BWValues.decode(g.arcade.animationAssetInterval({RESOURCE: g.resource.id})), undefined);
        assert.match(g.errors.at(-1), /Arcade animation asset "art:walk": invalid/);
        g.resource.frames[1].durationMs = 100; g.resource.frames[1].pixels[0] = 3; g.resource.width = 1;
    }
});
test('Stop keeps image lifetime; restart and project load rebuild resource handles', () => {
    const g = setup(), first = g.frames(), oldImage = BWValues.arrayValue(g.runtime, first)[0];
    g.runtime.emit('PROJECT_STOP_ALL');
    assert.strictEqual(g.frames(), first);
    assert.strictEqual(g.runtime.bwArcadeAnimationResources.get(g.resource.id), g.resource);
    assert.ok(g.arcade._image(oldImage));
    for (const event of ['PROJECT_START', 'PROJECT_LOADED']) {
        const before = g.frames(), old = BWValues.arrayValue(g.runtime, before)[0];
        g.runtime.emit(event);
        assert.equal(g.arcade._image(old), null);
        if (event === 'PROJECT_LOADED') {
            assert.equal(g.runtime.bwArcadeAnimationResources.size, 0);
            assert.equal(BWValues.decode(g.frames()), undefined, 'old project publication cannot leak');
            // Successful GUI artwork restoration publishes the new project.
            g.runtime.bwArcadeAnimationResources.set(g.resource.id, g.resource);
        } else {
            assert.strictEqual(g.runtime.bwArcadeAnimationResources.get(g.resource.id), g.resource,
                'Start preserves authored registry while rebuilding handles');
        }
        const after = g.frames();
        assert.notStrictEqual(after, before);
        assert.equal(g.arcade._image(BWValues.arrayValue(g.runtime, after)[0]).pixels[0], 2);
    }
});

// Real installed VM source, owned overlay extension class. Headless: no
// renderer/storage or GUI applyArtwork; this qualifies deserialization/events,
// resource and handle lifetimes, not artwork restoration or rendered pixels.
test('actual VM loadProject clears prior publications without GUI artwork restoration', async () => {
    const {importGuiDependency} = await import('./helpers/bw-integrated.mjs');
    const VM = (await importGuiDependency('scratch-vm/src/index.js')).default;
    const vm = new VM(), arcade = new Arcade(vm.runtime);
    const service = vm.extensionManager._registerInternalExtension(arcade);
    vm.extensionManager._loadedExtensions.set('arcade', service);
    const project = name => JSON.stringify({targets: [{isStage: true, name: 'Stage', variables: {marker: ['marker', name]}, lists: {},
        broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0,
        costumes: [{assetId: 'cd21514d0531fdffb22204e0ec5ed84a', name: 'backdrop', dataFormat: 'svg',
            md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', rotationCenterX: 240, rotationCenterY: 180}], sounds: [],
        volume: 100, layerOrder: 0}], monitors: [], extensions: [], meta: {semver: '3.0.0'}});
    try {
        await vm.loadProject(project('Published project'));
        const {resource} = setup();
        vm.runtime.bwArcadeAnimationResources.set(resource.id, resource);
        const first = arcade.animationAssetFrames({RESOURCE: resource.id});
        const firstImage = BWValues.arrayValue(vm.runtime, first)[0];
        assert.equal(arcade._image(firstImage).pixels[0], 2);
        vm.greenFlag();
        assert.strictEqual(vm.runtime.bwArcadeAnimationResources.get(resource.id), resource);
        const restarted = arcade.animationAssetFrames({RESOURCE: resource.id});
        assert.notStrictEqual(restarted, first, 'real greenFlag rebuilds handles');
        vm.stopAll();
        assert.strictEqual(arcade.animationAssetFrames({RESOURCE: resource.id}), restarted);
        let loaded = 0;
        vm.runtime.on('PROJECT_LOADED', () => loaded++);
        await vm.loadProject(project('Empty replacement'));
        assert.equal(loaded, 1, 'actual loader emitted the lifecycle event');
        assert.equal(vm.runtime.getTargetForStage().variables.marker.value, 'Empty replacement');
        assert.equal(vm.runtime.bwArcadeAnimationResources.size, 0);
        assert.equal(BWValues.arrayValue(vm.runtime, restarted), undefined);
        assert.equal(arcade._image(firstImage), null);
        const errors = [];
        vm.runtime.on('BLOCKS_ERROR', message => errors.push(message));
        assert.equal(BWValues.decode(arcade.animationAssetFrames({RESOURCE: resource.id})), undefined);
        assert.match(errors[0], /art:walk.*missing or deleted/);
        assert.match(arcade.getAnimationAssets()[0].text, /No animation assets/);
        vm.greenFlag();
        assert.equal(vm.runtime.bwArcadeAnimationResources.size, 0, 'restart cannot revive prior project artwork');
    } finally {
        vm.quit();
    }
});

test('published native endpoint intervals reach actual runtime reporters and image animation', () => {
    for (const count of [1, 2]) for (const duration of [1, 65535]) {
        const g = setup(); g.resource.frames.length = count;
        g.resource.frames.forEach(frame => { frame.durationMs = duration; });
        const reference = g.frames(), images = BWValues.arrayValue(g.runtime, reference);
        assert.equal(images.length, count);
        assert.equal(BWValues.decode(g.arcade.animationAssetInterval({RESOURCE: g.resource.id})), duration);
        const actor = g.arcade.createImageSprite({IMAGE: images[0], TEMPLATE: '', KIND: 'Player'});
        g.arcade.runImageAnimation({ID: actor, FRAMES: reference, INTERVAL: duration, LOOP: true});
        g.arcade._advance(0.0005);
        assert.equal(g.arcade.spritePixel({ID: actor, X: 0, Y: 0}), 2);
        g.arcade._advance(duration / 1000);
        assert.equal(g.arcade.spritePixel({ID: actor, X: 0, Y: 0}), count === 1 ? 2 : 3);
        assert.deepEqual(g.errors, []);
    }
    for (const duration of [0, 65536, 1.5]) {
        const g = setup(); g.resource.frames.forEach(frame => { frame.durationMs = duration; });
        assert.equal(BWValues.decode(g.frames()), undefined);
        assert.match(g.errors[0], /invalid frames/);
    }
});

test('fresh resource lookup owns each array, image, pixels and palette independently of shared mutations', () => {
    const g = setup();
    const shared = g.frames(), a = g.arcade.animationAssetFreshFrames({RESOURCE: g.resource.id});
    const b = g.arcade.animationAssetFreshFrames({RESOURCE: g.resource.id});
    assert.notStrictEqual(a, b); assert.notStrictEqual(a, shared);
    const first = BWValues.arrayValue(g.runtime, a), second = BWValues.arrayValue(g.runtime, b);
    const cached = BWValues.arrayValue(g.runtime, shared);
    assert.notStrictEqual(first, second); assert.notStrictEqual(first[0], second[0]);
    assert.notStrictEqual(first[0], cached[0]);
    const left = g.arcade._image(first[0]), right = g.arcade._image(second[0]);
    assert.notStrictEqual(left.pixels, right.pixels); assert.notStrictEqual(left.palette, right.palette);
    assert.notStrictEqual(left.palette, g.resource.palette);
    g.arcade.mutateImage({IMAGE: first[0], OP: 'fill', COLOR: 7}); first.pop();
    g.arcade.mutateImage({IMAGE: cached[0], OP: 'fill', COLOR: 9});
    assert.equal(first.length, 1); assert.equal(second.length, 2);
    assert.equal(right.pixels[0], 2); assert.equal(g.resource.frames[0].pixels[0], 2);
    assert.strictEqual(g.frames(), shared);
    const next = BWValues.arrayValue(g.runtime, g.arcade.animationAssetFreshFrames({RESOURCE: g.resource.id}));
    assert.equal(next.length, 2); assert.equal(g.arcade._image(next[0]).pixels[0], 2);
    g.resource.frames[0].pixels[0] = 4; g.resource.revision++;
    const edited = BWValues.arrayValue(g.runtime, g.arcade.animationAssetFreshFrames({RESOURCE: g.resource.id}));
    assert.equal(g.arcade._image(edited[0]).pixels[0], 4);
    assert.equal(right.pixels[0], 2, 'previous lookup retains its image');
    assert.deepEqual(g.errors, []);
    const other = setup(); assert.equal(other.arcade._image(edited[0]), null);
    g.runtime.emit('PROJECT_START'); assert.equal(g.arcade._image(edited[0]), null);
    const reset = g.arcade.animationAssetFreshFrames({RESOURCE: g.resource.id});
    assert.equal(g.arcade._image(BWValues.arrayValue(g.runtime, reset)[0]).pixels[0], 4);
    g.runtime.emit('PROJECT_LOADED');
    assert.equal(BWValues.decode(g.arcade.animationAssetFreshFrames({RESOURCE: g.resource.id})), undefined);
    assert.match(g.errors.at(-1), /missing or deleted/);
});
