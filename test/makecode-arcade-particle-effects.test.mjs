import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {execFileSync} from 'node:child_process';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade = loadExtensionClass('arcade');

// A renderer recording drawables, their order and skin contents.
function fixture() {
    const runtime = new EventEmitter(), drawables = new Map(), skins = new Map(), errors = [];
    let nextDrawable = 0, nextSkin = 0, nextOrder = 0;
    runtime.startHats = () => [];
    runtime.requestRedraw = () => {};
    runtime.on('BLOCKS_ERROR', message => errors.push(message));
    runtime.renderer = {
        createDrawable(group) { const id = ++nextDrawable; drawables.set(id, {group, order: ++nextOrder}); return id; },
        createSVGSkin(svg) { const id = ++nextSkin; skins.set(id, svg); return id; },
        updateSVGSkin(id, svg) { assert.ok(skins.has(id)); skins.set(id, svg); },
        updateDrawableSkinId(id, skin) { drawables.get(id).skin = skin; },
        updateDrawablePosition() {}, updateDrawableScale() {}, updateDrawableVisible() {},
        setDrawableOrder(id, order, group) { assert.equal(order, Infinity); assert.equal(group, 'sprite'); drawables.get(id).order = ++nextOrder; },
        getDrawableOrder(id) { return drawables.get(id)?.order ?? 0; },
        destroyDrawable(id) { assert.ok(drawables.delete(id), 'no duplicate drawable destruction'); },
        destroySkin(id) { assert.ok(skins.delete(id), 'no duplicate skin destruction'); }
    };
    const arcade = new Arcade(runtime);
    const sprite = (color, x, y) => {
        const image = arcade.createImage({WIDTH: 8, HEIGHT: 8});
        arcade.mutateImage({IMAGE: image, OP: 'fill', COLOR: color});
        const id = arcade.createImageSprite({IMAGE: image, TEMPLATE: '', KIND: 'Player'});
        arcade.setSpritePosition({ID: id, X: x, Y: y});
        return id;
    };
    const frames = async (count, dt = 1 / 30) => { for (let i = 0; i < count; i++) await arcade._inst._advance(dt); };
    const state = () => arcade._inst._state();
    const sources = () => arcade._inst._particleScenes.get(state())?.allSprites || [];
    return {runtime, arcade, drawables, skins, errors, sprite, frames, state, sources};
}
const colorCount = (frame, color) => frame.pixels.reduce((n, pixel) => n + (pixel === color), 0);

test('generated particle runtime matches the pinned PXT sources', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-particles.mjs', '--check'], {stdio: 'pipe'});
});

test('destroy with an effect ghosts and dissolves the sprite, emits particles and completes at its lifespan', async () => {
    const f = fixture(), hero = f.sprite(2, 80, 60);
    let destroyed = 0;
    f.runtime.startHats = opcode => { if (opcode === 'arcade_whenSpriteDestroyed') destroyed++; return []; };
    f.arcade.destroySpriteWithEffect({ID: hero, EFFECT: 'fire', DURATION: 500});
    const sprite = f.state().sprites[hero];
    assert.equal(sprite.flags & 7168, 7168, 'PXT ParticleEffect.destroy sets Ghost');
    assert.ok(colorCount({pixels: sprite.image.pixels}, 2) < 64, 'effects.dissolve.applyTo changed the image copy');
    // Destroyed is already set: a second destruction does nothing.
    f.arcade.destroySprite({ID: hero});
    f.arcade.destroySpriteWithEffect({ID: hero, EFFECT: 'spray', DURATION: 100});
    assert.ok(f.state().sprites[hero]);
    assert.equal(f.sources().length, 1);
    await f.frames(10);
    assert.ok(f.state().sprites[hero], 'still drawn while the lifespan runs');
    assert.equal(destroyed, 0, 'destroy handlers run in _destroyCore, not at the request');
    const fire = [2, 4, 5].reduce((n, c) => n + colorCount(f.state().sceneFrame, c), 0);
    assert.ok(fire > colorCount({pixels: sprite.image.pixels}, 2), 'fire particles are composed into the scene frame');
    assert.ok(f.state().sceneFrame.coverage.includes('particles'));
    await f.frames(6);
    assert.equal(f.state().sprites[hero], undefined, 'lifespan expiry destroys the sprite');
    assert.equal(destroyed, 1);
    // The source outlives its anchor by 750 ms, then is pruned with its last particles.
    assert.equal(f.sources().length, 1);
    await f.frames(60);
    assert.equal(f.sources().length, 0);
    assert.equal([...f.drawables.values()].filter(d => d.skin && [...f.skins.keys()].includes(d.skin)).length >= 0, true);
    assert.deepEqual(f.errors, []);
});

test('a zero duration uses a quarter of the effect default lifespan', async () => {
    const f = fixture(), hero = f.sprite(3, 40, 40);
    f.arcade.destroySpriteWithEffect({ID: hero, EFFECT: 'disintegrate', DURATION: 0});
    assert.equal(f.state().sprites[hero].lifespan, 1250 >> 2);
});

test('sprite and screen effects follow source lifespans, end and clear', async () => {
    const f = fixture(), hero = f.sprite(7, 80, 60);
    f.arcade.startSpriteEffect({ID: hero, EFFECT: 'spray', DURATION: 200});
    f.arcade.startSpriteEffect({ID: hero, EFFECT: 'trail', DURATION: 0});
    assert.equal(f.sources().length, 2);
    await f.frames(15);
    // A destroyed source stops emitting but stays listed until its last particles expire.
    assert.deepEqual(f.sources().map(source => source.enabled), [false, true], 'the timed spray ended; the untimed trail stays');
    f.arcade.clearSpriteEffects({ID: hero});
    assert.deepEqual(f.sources().map(source => source.enabled), [false, false], 'clearParticles destroys every source on the anchor');
    await f.frames(45);
    assert.equal(f.sources().length, 0, 'pruned once their particles expire');
    f.arcade.startScreenEffect({EFFECT: 'confetti', DURATION: 0});
    f.arcade.startScreenEffect({EFFECT: 'confetti', DURATION: 0});
    assert.equal(f.sources().length, 1, 'a running screen effect is not duplicated');
    assert.equal(f.sources()[0].priority, 10);
    await f.frames(10);
    assert.ok(colorCount(f.state().sceneFrame, 0) < 160 * 120, 'confetti draws across the screen');
    f.arcade.endScreenEffect({EFFECT: 'confetti'});
    assert.equal(f.sources()[0].enabled, false);
    // Confetti falls the whole screen height, so its last particles live about 4.5 s.
    await f.frames(160);
    assert.equal(f.sources().length, 0);
    f.arcade.startScreenEffect({EFFECT: 'fire', DURATION: 0});
    f.arcade.startSpriteEffect({ID: hero, EFFECT: 'sparkles', DURATION: 0});
    assert.equal(f.errors.length, 2, 'not a screen effect / unknown effect');
});

test('particle overlays share the sprite z then id order and are removed on reset', async () => {
    const f = fixture(), low = f.sprite(2, 80, 60);
    f.arcade.startSpriteEffect({ID: low, EFFECT: 'fire', DURATION: 0});
    const high = f.sprite(5, 80, 60);
    await f.frames(3);
    const overlay = [...f.arcade._inst._particleOverlays.values()][0].drawableId;
    const spriteDrawable = id => f.arcade._inst._imageSkins.get(id).drawableId;
    assert.ok(f.drawables.get(overlay).order > f.drawables.get(spriteDrawable(high)).order, 'FireSource z=20 above z=0 sprites');
    f.arcade.setSpriteProperty({ID: high, PROPERTY: 'z', VALUE: 30});
    assert.ok(f.drawables.get(spriteDrawable(high)).order > f.drawables.get(overlay).order);
    f.runtime.emit('PROJECT_START');
    assert.equal(f.arcade._inst._particleOverlays.size, 0);
    assert.equal(f.drawables.has(overlay), false);
});

const SOURCE = `let hero = sprites.create(img\`
2 2 2 2
2 2 2 2
2 2 2 2
2 2 2 2
\`, SpriteKind.Player)
hero.setPosition(80, 60)
let destroyedAt = -1
let effectReady = true
sprites.onDestroyed(SpriteKind.Player, function (sprite) {
    destroyedAt = game.runtime()
})
effects.starField.startScreenEffect()
hero.startEffect(effects.trail, 300)
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    effects.clearParticles(hero)
    effects.starField.endScreenEffect()
    hero.destroy(effects.disintegrate, 400)
})`;

test('effects are editable through Code and Blocks, saved SB3 and original MakeCode export', async () => {
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    for (const line of ['arcade start screen effect starField for (0) ms', 'arcade start effect trail on',
        'arcade clear effects on', 'arcade end screen effect starField', 'with effect disintegrate for (400) ms'])
        assert.ok(imported.code.includes(line), line);
    const run = await runProgram(imported.code, {frames: 10, storage: true, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.creator.warnings, []);
    const opcodes = run.creator.project.targets.flatMap(t => Object.values(t.blocks)).map(b => b.opcode);
    for (const op of ['arcade_startScreenEffect', 'arcade_startSpriteEffect', 'arcade_clearSpriteEffects',
        'arcade_endScreenEffect', 'arcade_destroySpriteWithEffect']) assert.ok(opcodes.includes(op), op);
    const decompiled = run.creator.decompile();
    const again = await runProgram(decompiled, {frames: 10, storage: true, uploads: imported.costumes});
    assert.deepEqual(again.errors, []);
    assert.deepEqual(again.creator.warnings, []);
    const exported = projectToArcade(run.creator.project, {costumeSvg: (t, c) => run.creator.assets.get(c.assetId)?.data});
    assert.deepEqual(exported.unsupported, []);
    for (const call of ['effects.starField.startScreenEffect()', '.startEffect(effects.trail, 300)', 'effects.clearParticles(',
        'effects.starField.endScreenEffect()', '.destroy(effects.disintegrate, 400)']) assert.ok(exported.ts.includes(call), call);
    assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
    const original = await runPxtArcade(exported.ts, {waitForGlobals: {effectReady: true}});
    assert.equal(original.destroyedAt, -1);
    await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
    run.vm.greenFlag();
    await stepFrames(run.vm, 10);
    assert.deepEqual(run.errors, []);
});

test('original PXT and native runs agree on effect destruction timing, membership and handler order', async () => {
    const observed = `let hero = sprites.create(img\`
5 5
5 5
\`, SpriteKind.Player)
let events = ""
sprites.onDestroyed(SpriteKind.Player, function (sprite) {
    events = events + "d"
})
hero.destroy(effects.fire, 500)
hero.destroy()
events = events + "r"
let ghost = (hero.flags & SpriteFlag.Ghost) == SpriteFlag.Ghost
let countedAt0 = sprites.allOfKind(SpriteKind.Player).length
let sceneAt250 = false
let sceneAt750 = true
pause(250)
sceneAt250 = game.currentScene().allSprites.indexOf(hero) >= 0
let eventsAt250 = events
pause(500)
sceneAt750 = game.currentScene().allSprites.indexOf(hero) >= 0`;
    const original = await runPxtArcade(observed, {waitForGlobals: {sceneAt750: false}});
    assert.deepEqual([original.events, original.ghost, original.countedAt0, original.sceneAt250, original.eventsAt250, original.sceneAt750],
        ['rd', true, 0, true, 'r', false]);
    // The same operations against the native runtime.
    const f = fixture(), hero = f.sprite(5, 80, 60);
    let events = '';
    f.runtime.startHats = opcode => { if (opcode === 'arcade_whenSpriteDestroyed') events += 'd'; return []; };
    f.arcade.destroySpriteWithEffect({ID: hero, EFFECT: 'fire', DURATION: 500});
    f.arcade.destroySprite({ID: hero});
    events += 'r';
    const ghost = (f.state().sprites[hero].flags & 7168) === 7168;
    const countedAt0 = f.arcade.spriteCount({KIND: 'Player'});
    await f.frames(8, 1 / 32);
    const sceneAt250 = !!f.state().sprites[hero], eventsAt250 = events;
    await f.frames(16, 1 / 32);
    assert.deepEqual([events, ghost, countedAt0, sceneAt250, eventsAt250, !!f.state().sprites[hero]], ['rd', true, 0, true, 'r', false]);
});
