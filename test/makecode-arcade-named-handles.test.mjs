import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {BUILTIN_IMAGES} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-builtin-images.js';

test('a sprite initialized in its declaration keeps its handle and art', async () => {
    const source = `let hero = sprites.create(img\`1 1\n1 1\`, SpriteKind.Player)\nhero.setPosition(151, 60)\nhero.vx = 60\nhero.setBounceOnWall(true)`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /set hero to arcade spawn template/);
    assert.doesNotMatch(translated.code, /set hero to 0/);
    assert.match(translated.code, /arcade set vx of hero to 60/);
    assert.match(translated.code, /arcade bounce hero on wall 1/);
    assert.equal(translated.costumes.length, 1);
    const run = await runProgram(translated.code, {frames: 8});
    assert.deepEqual(run.errors, []);
    const hero = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).find(s => s.id);
    assert.equal(hero?.vx, -60);
});

test('pinned PXT built-in sprite art imports as a real costume', () => {
    assert.ok(Object.keys(BUILTIN_IMAGES).length >= 500);
    const translated = arcadeToPseudocode('let skelly = sprites.create(sprites.castle.skellyFront, SpriteKind.Enemy)');
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /set skelly to arcade spawn template/);
    assert.equal(translated.costumes.length, 1);
    assert.match(translated.costumes[0].svg, /<svg/);
});

test('a pinned fire game keeps named handles and both event parameters', () => {
    const source = readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-fire-overlap.ts'), 'utf8');
    const result = arcadeToPseudocode(source);
    assert.match(result.code, /set mySprite to arcade spawn template/);
    assert.match(result.code, /set fireSource to arcade spawn template/);
    assert.match(result.code, /WHEN arcade kind "FireSource" created:/);
    assert.match(result.code, /WHEN arcade every 500 ms:/);
    assert.match(result.code, /WHEN arcade kinds "Player" and "FireSource" overlap:/);
    assert.match(result.code, /arcade destroy arcade event second/);
    assert.match(result.code, /arcade set x of arcade event first/);
    assert.equal(result.costumes.length, 2);
    assert.match(result.code, /arcade keep mySprite in screen 1/);
    assert.match(result.code, /arcade start countdown 3/);
    assert.match(result.code, /arcade stop countdown/);
    assert.deepEqual(result.unsupported, []);
});

test('overlap callback destroys the second spawned handle in the shipped VM', async () => {
    const source = `let hero: Sprite = null
let enemy: Sprite = null
sprites.onCreated(SpriteKind.Enemy, function(s: Sprite) { s.setPosition(80, 60) })
sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function(first: Sprite, second: Sprite) {
    info.changeLifeBy(5)
    second.destroy()
})
hero = sprites.create(img\`1\`, SpriteKind.Player)
enemy = sprites.create(img\`2\`, SpriteKind.Enemy)
info.setLife(15)`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const run = await runProgram(translated.code, {frames: 12});
    assert.deepEqual(run.errors, []);
    assert.ok((run.calls.get('arcade_whenSpritesOverlap') || 0) >= 1);
    assert.ok((run.calls.get('arcade_destroySprite') || 0) >= 1);
    const live = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).filter(s => s.id);
    assert.equal(live.length, 1);
    assert.equal(live[0].kind, 'Player');
    const variables = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(variables.find(v => v.name === 'lives')?.value, 20);
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
    const run = await runProgram(code, {frames: 60});
    assert.deepEqual(run.errors, []);
    const state = run.vm.runtime.bwArcadeDeviceState;
    const hero = Object.values(state.sprites).find(sprite => sprite.id && sprite.kind === 'Player');
    assert.equal(hero.x, 152);
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
    assert.match(translated.code, /WHEN arcade countdown ends:/);
    const run = await runProgram(translated.code, {frames: 40});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState?.gameOver, undefined);
    const score = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}))
        .find(variable => variable.name === 'score');
    assert.equal(score?.value, 7);
});
