import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, runProgram} from './helpers/bw-vm.mjs';

test('a pinned PXT side projectile retains image, incoming edge, velocity and handle', async () => {
    const source = readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-side-projectile.ts'), 'utf8');
    const result = arcadeToPseudocode(source);
    assert.deepEqual(result.unsupported, []);
    assert.equal(result.costumes.length, 1);
    assert.match(result.code, /x -7 y 0 width 16 height 16/);
    assert.match(result.code, /arcade set vx of projectile to 40/);
    assert.match(result.code, /arcade auto destroy projectile outside screen 1/);
    const creator = new SB3Creator();
    creator.parse(result.code);
    assert.deepEqual(creator.warnings, []);
    assert.match(creator.decompile(), /arcade auto destroy projectile outside screen 1/);
    const run = await runProgram(result.code, {frames: 8});
    assert.deepEqual(run.errors, []);
    const sprite = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .find(value => value.id && value.kind === 'Projectile');
    assert.ok(sprite);
    assert.equal(sprite.y, 10);
    assert.equal(sprite.vx, 40);
    assert.equal(sprite.autoDestroy, true);
    assert.ok(sprite.x > -7);
});

test('an auto-destroy projectile disappears after leaving the screen', async () => {
    const code = `DEVICE ARCADE
GLOBAL p
SPRITE Game:
WHEN flag clicked:
  set p to arcade spawn template "Game" kind "Projectile" x 155 y 60 width 8 height 8
  arcade set vx of p to 60
  arcade auto destroy p outside screen 1`;
    const run = await runProgram(code, {frames: 10});
    assert.deepEqual(run.errors, []);
    assert.equal(Object.keys(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).length, 0);
});
