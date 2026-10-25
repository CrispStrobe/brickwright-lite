import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const require = createRequire(import.meta.url);
const createOwner = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/owned-sprite-values.js');
const createBridge = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/owned-sprite-bridge.js');
const createImages = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-image-owner.js');
const createHeap = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js');
async function fixture() {
    const runtime = createArcadeRuntimeMock(), errors = [];
    runtime.on('BLOCKS_ERROR', error => errors.push(error));
    const Arcade = loadExtensionClass('arcade'), extension = new Arcade(runtime)._inst;
    const values = (await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
    runtime.emit('PROJECT_START');
    let selected = true, sceneSerial = 0;
    const images = createImages(runtime, values, () => ({extension, images:extension._images,
        identities:extension._imageIds, resolve:extension._image, current:selected}));
    const owner = createOwner(runtime, values, images, () => ({extension, sprites:extension._spriteValues,
        scene:extension._state(), epoch:extension._terrainEpoch, sceneSerial, current:selected,
        running:!extension._terrainStopped}));
    const bridge = createBridge(owner, values, {
        set:(body, key, value, util) => extension.setSpriteProperty({ID:body.id, PROPERTY:key, VALUE:value}, util),
        setPosition:(body, x, y, util) => extension.setSpritePosition({ID:body.id, X:x, Y:y}, util)
    });
    const start = () => {images.start();owner.start();};
    const allocate = (image, util) => {
        const token = owner.begin(image, util), body = images.body(image);
        const id = extension._createSprite({IMAGE:image, TEMPLATE:'', KIND:0, WIDTH:body.width, HEIGHT:body.height,
            X:((160-body.width)>>1)+body.width/2, Y:((120-body.height)>>1)+body.height/2});
        owner.allocated(token, id);return {token, id, body:extension._spriteValues.get(id)};
    };
    const create = image => {
        const allocation = allocate(image);
        const result = extension._finishSpriteCreation(allocation.id);
        assert.equal(typeof result, 'string');
        return {...allocation, ref:owner.complete(allocation.token, result)};
    };
    return {runtime, extension, values, images, owner, bridge, allocate, create, start, errors,
        replace(){selected=false;}, transition(){sceneSerial++;}, dispose(){owner.dispose();images.dispose();runtime.emit('RUNTIME_DISPOSED');}};
}
test('native factory body is captured before completion and preserves shared and cloned Images', async () => {
    const f = await fixture();try {
        const {extension:e, owner, values} = f;
        const image = e.createImage({WIDTH:2, HEIGHT:2});
        assert.throws(() => f.allocate(image), /inactive native owner/);
        f.start();
        const first = f.allocate(image);
        assert.equal(first.body.image, e._image(image));
        assert.equal(owner.has(first.id), false, 'physical raw ID is never an owned value');
        e.setImagePixel({IMAGE:image, X:0, Y:0, COLOR:7});
        assert.equal(first.body.image.pixels[0], 7, 'mutations before constructor completion retain the same body');
        const firstRef = owner.complete(first.token, e._finishSpriteCreation(first.id));
        const second = f.create(image), cloneImage = e.cloneImage({IMAGE:image}), clone = f.create(cloneImage);
        assert.equal(owner.body(firstRef).image, second.body.image);
        assert.notEqual(clone.body.image, first.body.image);
        e.setImagePixel({IMAGE:image, X:1, Y:1, COLOR:9});
        assert.equal(owner.body(firstRef).image.pixels[3], 9);assert.equal(second.body.image.pixels[3], 9);
        assert.equal(clone.body.image.pixels[3], 0);
        assert.equal(e.spriteImage({ID:first.id}), image);
        assert.equal(owner.body(values.decode(JSON.parse(JSON.stringify(firstRef)))), first.body);
        assert.throws(() => owner.complete(first.token, first.id), /did not complete/);
        const empty = f.create(e.createImage({WIDTH:0, HEIGHT:0}));
        assert.equal(empty.body.width, 0);assert.equal(empty.body.height, 0);
        assert.deepEqual(f.errors, []);
    } finally {f.dispose();}
});
test('issued references reject raw handles, reflection, missing allocations and foreign owners', async () => {
    const f = await fixture(), other = await fixture();try {
        f.start();other.start();
        const image = f.extension.createImage({WIDTH:1, HEIGHT:1}), actual = f.create(image);
        const foreign = other.create(other.extension.createImage({WIDTH:1, HEIGHT:1}));
        let reads = 0;
        for (const value of [actual.id, actual.body, foreign.ref, f.values.reference(f.runtime, 'object', 'unissued'),
            {...actual.ref, extra:1}, {bwReference:{...actual.ref.bwReference, extra:1}},
            {get bwReference(){reads++;return actual.ref.bwReference;}}]) assert.throws(() => f.owner.body(value));
        assert.equal(reads, 0);
        const token = f.owner.begin(image);
        assert.throws(() => f.owner.allocated(token, actual.id), /allocation does not own/);
        f.owner.abort(token);assert.throws(() => f.owner.complete(token, actual.id));
        const pending = f.allocate(image);assert.throws(() => f.owner.complete(pending.token, ''), /did not complete/);
        f.owner.abort(pending.token);assert.equal(f.owner.has(pending.id), false);
    } finally {f.dispose();other.dispose();}
});
test('physical destruction, replaced map, scene transitions, Stop and disposal revoke owned access', async () => {
    const f = await fixture();try {
        f.start();const image = f.extension.createImage({WIDTH:1, HEIGHT:1});
        const actual = f.create(image);
        const heap = createHeap(f.runtime, f.values, f.bridge.heapHooks);
        assert.equal(heap.get(actual.ref, 'width'), 1);
        f.extension.destroySprite({ID:actual.id});
        assert.equal(f.extension._spriteValues.get(actual.id), actual.body, 'legacy retained body is not enough');
        assert.throws(() => f.owner.body(actual.ref), /physical body/);
        assert.equal(f.bridge.heapHooks.external(actual.ref), true, 'revoked issued references still route to their rejecting owner');
        assert.throws(() => heap.get(actual.ref, 'width'), /physical body|issued object/);
        const next = f.create(image);f.transition();
        assert.throws(() => f.owner.body(next.ref), /epoch changed/);
        f.owner.start();assert.throws(() => f.owner.body(next.ref), /not issued/);
        const mapped = f.create(image), originalMap = f.extension._spriteValues;
        f.extension._spriteValues = new Map(originalMap);
        assert.throws(() => f.owner.body(mapped.ref), /epoch changed/);
        f.extension._spriteValues = originalMap;
        const current = f.create(image);f.owner.stop();
        assert.throws(() => f.owner.body(current.ref), /inactive|not issued/);
        assert.equal(f.images.body(image), f.extension._image(image), 'Stop does not dispose Image bodies');
        f.owner.start();const retained = f.create(image);f.replace();
        assert.throws(() => f.owner.body(retained.ref), /current native owner/);
        f.owner.dispose();assert.throws(() => f.owner.start(), /disposed/);
    } finally {f.dispose();}
});
test('completion refuses destroyed, cancelled and image-rebound allocations without rolling back effects', async () => {
    const f = await fixture();try {
        f.start();const image = f.extension.createImage({WIDTH:1, HEIGHT:1});
        const destroyed = f.allocate(image);f.extension.destroySprite({ID:destroyed.id});
        assert.throws(() => f.owner.complete(destroyed.token, destroyed.id), /physical body/);
        const changed = f.allocate(image), clone = f.extension.cloneImage({IMAGE:image});
        f.extension.setSpriteImage({ID:changed.id, IMAGE:clone});
        assert.throws(() => f.owner.complete(changed.token, changed.id), /Image binding changed/);
        assert.equal(changed.body.image, f.extension._image(clone), 'failure does not invent effect rollback');
        const target = {};f.runtime.targets.push(target);
        const thread = {target, status:0};f.runtime.threads = [thread];
        const pending = f.allocate(image, {thread, target});f.runtime.threads.length = 0;
        assert.throws(() => f.owner.complete(pending.token, pending.id), /invocation was cancelled/);
    } finally {f.dispose();}
});
test('registered bridge keeps Number semantics, readonly fields and checks current body on every operation', async () => {
    const f = await fixture();try {
        f.start();const actual = f.create(f.extension.createImage({WIDTH:2, HEIGHT:2}));
        const heap = createHeap(f.runtime, f.values, f.bridge.heapHooks);
        assert.equal(heap.inspect(actual.ref).className, '__bwOwnedSDKSprite');
        assert.equal(heap.get(actual.ref, 'width'), 2);
        await heap.set(actual.ref, 'x', 20);assert.equal(actual.body.x, 20);
        await heap.set(actual.ref, 'y', 30);assert.equal(actual.body.y, 30);
        for (const input of ['20', {}, f.values.UNDEFINED, NaN, Infinity])
            assert.throws(() => heap.set(actual.ref, 'x', input), /actual finite Number|registered reference/);
        assert.throws(() => heap.set(actual.ref, 'width', 3), /readonly/);
        const method = heap.method(actual.ref, 'setPosition');
        await f.bridge.invoke(method.procedure, [actual.ref, 40, 50]);
        assert.equal(actual.body.x, 40);assert.equal(actual.body.y, 50);
        assert.throws(() => f.bridge.invoke(method.procedure, [actual.ref, '40', 50]), /actual finite Number/);
        assert.throws(() => f.bridge.invoke(method.procedure, [actual.ref, 40]), /argument count/);
        f.extension.destroySprite({ID:actual.id});
        assert.throws(() => f.bridge.heapHooks.assertExternal(actual.ref), /physical body/);
        assert.throws(() => f.bridge.invoke(method.procedure, [actual.ref, 1, 2]), /physical body/);
        assert.deepEqual(f.errors, []);
    } finally {f.dispose();}
});
