import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, projectOpcodes} from './helpers/bw-vm.mjs';

test('a pinned onCreated Arcade game imports creation events and callback coordinates', async () => {
    const source = readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-created-asteroids.ts'), 'utf8');
    const result = arcadeToPseudocode(source);
    assert.match(result.code, /arcade register creation kind "Asteroid" as "__bwCreated1"/);
    assert.match(result.code, /WHEN arcade creation handler "__bwCreated1" runs:/);
    assert.match(result.code, /WHEN arcade every 1000 ms:/);
    assert.match(result.code, /arcade spawn template "__arcadeTemplate1" kind "Asteroid"/);
    assert.match(result.code, /arcade set [xy] of arcade event first/);
    assert.equal(result.costumes.length, 3, 'the spawn art and both built-in asteroid images arrive');
    assert.match(result.code, /arcade set image of arcade event first to arcade frame image array "asteroids" index \(pick random 0 to 1\)/);
    assert.deepEqual(result.unsupported, []);
    assert.ok(!result.unsupported.some(gap => gap.includes('onCreated')));
    const run = await runProgram(result.code, {frames: 35, uploads: result.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const spawned = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
    assert.ok(spawned.length > 0);
    assert.ok(spawned.every(sprite => sprite.image && sprite.width === sprite.image.width));
});

test('onCreated changes the particular spawned handle in the shipped VM', async () => {
    const source = 'sprites.onCreated(SpriteKind.Enemy, function(s: Sprite) { ' +
        's.x = 19; s.vy = 8 })\nsprites.create(img`1`, SpriteKind.Enemy)';
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const run = await runProgram(translated.code, {frames: 8});
    assert.deepEqual(run.errors, []);
    const opcodes = projectOpcodes(run.creator.project);
    assert.ok(opcodes.has('arcade_whenRegisteredCreated'));
    assert.ok(opcodes.has('arcade_registerSpriteCreated'));
    assert.ok(opcodes.has('arcade_spawnSprite'));
    assert.ok((run.calls.get('arcade_setSpriteProperty') || 0) >= 2);
    const sprite = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .find(value => value.id && value.kind === 'Enemy');
    assert.ok(sprite, 'spawned enemy exists');
    assert.equal(sprite.x, 19);
    assert.equal(sprite.vy, 8);
});

test('creation inside a startup loop gives each callback its own sprite handle', async () => {
    const source = `namespace SpriteKind { export const Asteroid = SpriteKind.create() }
namespace asteroids {
    sprites.onCreated(SpriteKind.Asteroid, function(sprite: Sprite) {
        count += 1
        sprite.x = count * 10
    })
}
let count = 0
for (let i = 0; i < 3; i++) { sprites.create(img\`1\`, SpriteKind.Asteroid) }`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /REPEAT 3:\n    set __arcadeCreated to arcade spawn template/);
    const run = await runProgram(translated.code, {frames: 25, uploads: translated.costumes});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    const sprites = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .filter(sprite => sprite.id && sprite.kind === 'Asteroid');
    assert.deepEqual(sprites.map(sprite => sprite.x).sort((a, b) => a - b), [10, 20, 30]);
});
