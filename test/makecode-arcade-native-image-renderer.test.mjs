import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {loadExtensionClass, VM_SRC} from './helpers/bw-extensions.mjs';
const BWValues = createRequire(import.meta.url)(VM_SRC + '/util/bw-values');
const Arcade = loadExtensionClass('arcade');
function fixture() {
    const runtime = new EventEmitter(), drawables = new Map(), skins = new Map(), destroyed = [];
    let nextDrawable = 0, nextSkin = 0, nextOrder = 0;
    runtime.renderer = {
        createDrawable(group) { const id = ++nextDrawable; drawables.set(id, {group}); return id; },
        createSVGSkin(svg, center) { const id = ++nextSkin; skins.set(id, {svg, center}); return id; },
        updateSVGSkin(id, svg, center) { assert.ok(skins.has(id)); skins.set(id, {svg, center}); },
        updateDrawableSkinId(id, skin) { assert.ok(skins.has(skin)); drawables.get(id).skin = skin; },
        updateDrawablePosition(id, position) { drawables.get(id).position = position; },
        updateDrawableScale(id, scale) { drawables.get(id).scale = scale; },
        updateDrawableVisible(id, visible) { drawables.get(id).visible = visible; },
        setDrawableOrder(id, order, group) {
            assert.equal(group, 'sprite');
            // Real Scratch renderer order0 is a no-op; Infinity moves to front.
            assert.equal(order, Infinity); drawables.get(id).order = ++nextOrder;
        },
        destroyDrawable(id, group) { assert.ok(drawables.has(id), 'no duplicate drawable destruction'); assert.equal(group, 'sprite'); drawables.delete(id); destroyed.push(id); },
        destroySkin(id) { assert.ok(skins.has(id), 'no duplicate skin destruction'); skins.delete(id); }
    };
    const arcade = new Arcade(runtime);
    const image = colour => { const ref = arcade.createImage({WIDTH: 3, HEIGHT: 2});
        arcade.mutateImage({IMAGE: ref, OP: 'fill', COLOR: colour}); return ref; };
    const first = image(2), second = image(5);
    const create = () => arcade.createImageSprite({IMAGE: first, TEMPLATE: '', KIND: 'Player'});
    const entry = id => arcade._inst._imageSkins.get(id);
    return {runtime, arcade, drawables, skins, destroyed, first, second, create, entry, image};
}
test('native image sprite owns its drawable immediately, retains identity through animation and pixel mutation', () => {
    const g = fixture(), id = g.create(), entry = g.entry(id), drawable = g.drawables.get(entry.drawableId);
    assert.equal(g.arcade._sprite(id).image, g.arcade._image(g.first), 'initial source image present before creation returns');
    assert.equal(g.arcade._state().spriteTargets[id], undefined, 'no template target is invented');
    assert.equal(drawable.visible, true); assert.deepEqual(drawable.scale, [75, 75]);
    assert.match(g.skins.get(entry.skinId).svg, /#ff2121/);
    g.arcade.setSpritePosition({ID: id, X: 80, Y: 60}); assert.deepEqual(drawable.position, [-1.5, 0], 'odd-width PXT edge floors to a logical pixel');
    g.arcade.runImageAnimation({ID: id, FRAMES: BWValues.arrayReference(g.runtime, [g.first, g.second]), INTERVAL: 100, LOOP: true});
    g.arcade._advance(.1);
    assert.strictEqual(g.entry(id), entry, 'animation updates owned skin instead of recreating drawable');
    assert.match(g.skins.get(entry.skinId).svg, /#fff609/);
    g.arcade.mutateImage({IMAGE: g.second, OP: 'fill', COLOR: 9});
    assert.match(g.skins.get(entry.skinId).svg, /#87f2ff/);
    assert.equal(g.drawables.size, 1); assert.equal(g.skins.size, 1);
});
test('native renderer follows camera, scaling, rotation, visibility and Arcade z order', () => {
    const g = fixture(), a = g.create(), b = g.create(), first = g.entry(a), second = g.entry(b);
    g.arcade.setSpritePosition({ID: a, X: 80, Y: 60});
    g.arcade.setSpriteScale({ID: a, VALUE: 8, ANCHOR: 0});
    assert.match(g.skins.get(first.skinId).svg, /width="96" height="64"/);
    g.arcade.setSpriteProperty({ID: a, PROPERTY: 'rotationDegrees', VALUE: 90});
    assert.notEqual(g.skins.get(first.skinId).svg.match(/width="(\d+)"/)[1], '96');
    g.arcade.centerCameraAt({X: 90, Y: 70}); g.arcade._updateCamera();
    assert.ok(g.drawables.get(first.drawableId).position[0] < -20);
    assert.ok(g.drawables.get(first.drawableId).position[1] > 20);
    g.arcade.setSpriteFlag({ID: a, FLAG: 'Invisible', ON: true});
    assert.equal(g.drawables.get(first.drawableId).visible, false);
    g.arcade.setSpriteFlag({ID: a, FLAG: 'Invisible', ON: false});
    assert.equal(g.drawables.get(first.drawableId).visible, true);
    g.arcade.setSpriteProperty({ID: a, PROPERTY: 'z', VALUE: 10});
    assert.ok(g.drawables.get(first.drawableId).order > g.drawables.get(second.drawableId).order);
    g.arcade.setSpriteProperty({ID: a, PROPERTY: 'z', VALUE: 0});
    assert.ok(g.drawables.get(first.drawableId).order < g.drawables.get(second.drawableId).order);
});
test('scenes hide native drawables and reset disposes active and inactive scene resources', () => {
    const g = fixture(), old = g.create(), oldDrawable = g.entry(old).drawableId;
    g.arcade.pushScene({});
    assert.equal(g.drawables.get(oldDrawable).visible, false);
    g.arcade.setSpriteFlag({ID: old, FLAG: 'Invisible', ON: false});
    assert.equal(g.drawables.get(oldDrawable).visible, false, 'hidden scene cannot become visible through an old handle');
    const fresh = g.create(), freshDrawable = g.entry(fresh).drawableId;
    assert.equal(g.drawables.get(freshDrawable).visible, true);
    g.arcade.popScene({});
    assert.equal(g.drawables.get(oldDrawable).visible, true);
    assert.equal(g.drawables.get(freshDrawable).visible, false);
    g.arcade.destroySprite({ID: old});
    assert.equal(g.drawables.has(oldDrawable), false);
    assert.equal(g.skins.size, 1);
    g.runtime.emit('PROJECT_START');
    assert.equal(g.drawables.size, 0); assert.equal(g.skins.size, 0);
    const replacement = g.arcade.createImageSprite({IMAGE: g.image(2), TEMPLATE: '', KIND: 'Player'});
    assert.ok(g.entry(replacement));
    g.runtime.emit('PROJECT_LOADED');
    assert.equal(g.drawables.size, 0); assert.equal(g.skins.size, 0);
    g.arcade.createImageSprite({IMAGE: g.image(2), TEMPLATE: '', KIND: 'Player'}); g.runtime.emit('RUNTIME_DISPOSED');
    assert.equal(g.drawables.size, 0); assert.equal(g.skins.size, 0);
});

test('native custom palettes and huge rotated images use bounded raster skins', () => {
    const g = fixture();
    const image = g.arcade._image(g.first);
    image.palette = [null, '#ffffff', '#123456', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
        '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
    const id = g.create(), entry = g.entry(id);
    assert.match(g.skins.get(entry.skinId).svg, /#123456/);
    g.arcade.setSpriteScale({ID: id, VALUE: 4096, ANCHOR: 0});
    g.arcade.setSpriteProperty({ID: id, PROPERTY: 'rotationDegrees', VALUE: 45});
    const svg = g.skins.get(entry.skinId).svg;
    assert.ok(Number(/width="(\d+)"/.exec(svg)[1]) <= 640);
    assert.ok(Number(/height="(\d+)"/.exec(svg)[1]) <= 480);
    assert.match(svg, /#123456/);
    g.runtime.emit('PROJECT_STOP_ALL');
    g.arcade._advance(.2);
    assert.equal(g.skins.get(entry.skinId).svg, svg, 'Stop freezes actual native renderer output');
});

test('template image sprites keep clone drawable ownership and authored skin restoration', () => {
    const g = fixture(); let clone, added = 0, disposed = 0, restored = 0;
    g.runtime.getSpriteTargetByName = name => name === 'Template' ? {makeClone() {
        clone = {drawableID: g.runtime.renderer.createDrawable('sprite'), currentCostume: 0,
            getCostumes: () => [], setSize(size) { this.size = size; },
            setVisible(visible) { g.runtime.renderer.updateDrawableVisible(this.drawableID, visible); },
            setXY(x, y) { g.runtime.renderer.updateDrawablePosition(this.drawableID, [x, y]); },
            setCostume() { restored++; }};
        return clone;
    }} : null;
    g.runtime.addTarget = target => { assert.strictEqual(target, clone); added++; };
    g.runtime.disposeTarget = target => { assert.strictEqual(target, clone); disposed++; g.runtime.renderer.destroyDrawable(target.drawableID, 'sprite'); };
    const id = g.arcade.createImageSprite({IMAGE: g.first, TEMPLATE: 'Template', KIND: 'Player'});
    assert.equal(added, 1); assert.equal(g.drawables.size, 1);
    assert.strictEqual(g.entry(id).target, clone); assert.equal(g.entry(id).drawableId, undefined);
    assert.equal(g.arcade._state().spriteTargets[id], clone);
    const entry = g.entry(id), skin = entry.skinId, drawable = clone.drawableID;
    g.arcade.runImageAnimation({ID: id, FRAMES: BWValues.arrayReference(g.runtime, [g.first, g.second]), INTERVAL: 100, LOOP: true});
    g.arcade._advance(.1);
    assert.strictEqual(g.entry(id), entry);
    assert.equal(g.drawables.get(drawable).skin, skin);
    assert.match(g.skins.get(skin).svg, /#fff609/);
    g.arcade._advance(.1);
    assert.strictEqual(g.entry(id), entry);
    assert.equal(g.drawables.get(drawable).skin, skin);
    assert.match(g.skins.get(skin).svg, /#ff2121/);
    assert.equal(restored, 0, 'animation never swaps back to authored costume between frames');
    assert.equal(g.drawables.size, 1); assert.equal(g.skins.size, 1);
    g.arcade.destroySprite({ID: id});
    assert.equal(restored, 1); assert.equal(disposed, 1);
    assert.equal(g.drawables.size, 0); assert.equal(g.skins.size, 0);
});
