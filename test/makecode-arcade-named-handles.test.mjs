import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {BUILTIN_IMAGES} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-builtin-images.js';
import {imageToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';

// The runtime reads a sprite's pixels from its costume, so an authored
// Code program gives its template (here the Game sprite) pixel art, as the
// paint editor would.
const pixelCostume = (sprite, colour = 2) => ({sprite, mode: 'replace',
    svg: imageToSvg({width: 16, height: 16, pixels: new Uint8Array(256).fill(colour)})});

test('a sprite initialized in its declaration keeps its handle and art', async () => {
    const source = `let hero = sprites.create(img\`1 1\n1 1\`, SpriteKind.Player)\nhero.setPosition(151, 60)\nhero.vx = 60\nhero.setBounceOnWall(true)`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /set hero to \(arcade create template/);
    assert.doesNotMatch(translated.code, /set hero to 0/);
    assert.match(translated.code, /arcade set vx of hero to 60/);
    assert.match(translated.code, /arcade bounce hero on wall \(compare value \(0\) op "<" with \(1\)\)/);
    assert.equal(translated.costumes.length, 1);
    const run = await runProgram(translated.code, {frames: 8, uploads: translated.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const hero = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).find(s => s.id);
    assert.equal(hero?.vx, -60);
});

test('pinned PXT built-in sprite art imports as a real costume', () => {
    assert.ok(Object.keys(BUILTIN_IMAGES).length >= 500);
    const translated = arcadeToPseudocode('let skelly = sprites.create(sprites.castle.skellyFront, SpriteKind.Enemy)');
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /set skelly to \(arcade create image \(arcade frame image array/);
    // Each built-in image arrives once as an image resource (its own costume,
    // the artwork) that the sprite is created from; the template's costume is
    // a placeholder.
    const art = translated.costumes.filter(costume => /^__arcadeBackground/.test(costume.sprite));
    assert.equal(art.length, 1);
    assert.match(art[0].svg, /<svg/);
    assert.ok(art[0].svg.length > 1000, 'the built-in artwork, not a placeholder');
});

test('a pinned fire game keeps named handles and both event parameters', () => {
    const source = readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-fire-overlap.ts'), 'utf8');
    const result = arcadeToPseudocode(source);
    assert.match(result.code, /set mySprite to \(arcade create template/);
    assert.match(result.code, /set fireSource to \(arcade create template/);
    assert.match(result.code, /arcade register creation kind "FireSource" as "__bwCreated1"/);
    assert.match(result.code, /WHEN arcade creation handler "__bwCreated1" runs:/);
    assert.match(result.code, /arcade register interval \(500\) as "__bwInterval1"/);
    assert.match(result.code, /WHEN arcade interval handler "__bwInterval1" runs:/);
    assert.match(result.code, /arcade register overlap kind "Player" with kind "FireSource" as/);
    assert.match(result.code, /arcade set local otherSprite to arcade event second/);
    assert.match(result.code, /arcade destroy arcade local otherSprite/);
    assert.match(result.code, /arcade set position of \(arcade event first\) x \(pick random 0 to 160\) y \(pick random 0 to 120\)/);
    assert.equal(result.costumes.length, 2);
    assert.match(result.code, /arcade keep mySprite in screen \(compare value \(0\) op "<" with \(1\)\)/);
    assert.match(result.code, /arcade start countdown 3/);
    assert.match(result.code, /arcade stop countdown/);
    assert.deepEqual(result.unsupported, []);
});

// The sprites are 2x2: a 1x1 hero at PXT's creation default (x 79.5) and a
// 1x1 enemy moved to (80, 60) do not overlap in the pinned PXT simulator
// either (measured, 30 frames), so 1x1 images could not hold this claim.
test('overlap callback destroys the second spawned handle in the shipped VM', async () => {
    const source = `let hero: Sprite = null
let enemy: Sprite = null
sprites.onCreated(SpriteKind.Enemy, function(s: Sprite) { s.setPosition(80, 60) })
sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function(first: Sprite, second: Sprite) {
    info.changeLifeBy(5)
    second.destroy()
})
hero = sprites.create(img\`1 1\n1 1\`, SpriteKind.Player)
enemy = sprites.create(img\`2 2\n2 2\`, SpriteKind.Enemy)
info.setLife(15)`;
    const oracle = await runPxtArcade(source + `
let lifeNow = 0
let frames = 0
let done = false
game.onUpdate(function () { frames += 1; lifeNow = info.life(); if (frames >= 12) done = true })`, {waitForGlobals: {done: true}});
    assert.equal(oracle.lifeNow, 20, 'the pinned PXT simulator fires the overlap once');
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const run = await runProgram(translated.code, {frames: 12, uploads: translated.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    assert.ok((run.calls.get('arcade_whenRegisteredOverlap') || 0) >= 1);
    assert.ok((run.calls.get('arcade_destroySprite') || 0) >= 1);
    const live = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).filter(s => s.id);
    assert.equal(live.length, 1);
    assert.equal(live[0].kind, 'Player');
    const variables = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(variables.find(v => v.name === 'lives')?.value, oracle.lifeNow);
});

test('stay in screen clamps a handle and stopping countdown prevents game over', async () => {
    const code = `DEVICE ARCADE
GLOBAL hero
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "Game" kind "Player" x 80 y 60 width 16 height 16
  arcade keep hero in screen 1
  arcade set x of hero to 999
  arcade start countdown 1
  arcade stop countdown`;
    const run = await runProgram(code, {frames: 60, uploads: [pixelCostume('Game')], storage: true});
    assert.deepEqual(run.errors, []);
    const state = run.vm.runtime.bwArcadeDeviceState;
    const hero = Object.values(state.sprites).find(sprite => sprite.id && sprite.kind === 'Player');
    // The pinned PXT simulator clamps a 16-wide sprite at x 999 to 153 (measured).
    assert.equal(hero.x, 153);
    assert.equal(state.countdownActive, false);
    assert.notEqual(state.gameOver, true);
});

test('an active countdown ends the game after its VM frames', async () => {
    const code = `DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  arcade start countdown 1`;
    const run = await runProgram(code, {frames: 35});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState?.gameOver, true);
});

test('MakeCode countdown callback runs at zero and can continue the game', async () => {
    const source = `info.onCountdownEnd(function () { info.changeScoreBy(7) })\ninfo.startCountdown(1)`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /arcade register countdown/);
    const run = await runProgram(translated.code, {frames: 40});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState?.gameOver, undefined);
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score), 7);
});
