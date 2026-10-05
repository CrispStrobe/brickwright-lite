import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';

test('a pinned PXT overlap callback destroys the event sprite it names', async () => {
    const source = readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-overlap-destroy.ts'), 'utf8');
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /arcade destroy arcade event second/);
    const code = translated.code + `WHEN flag clicked:
  set hero to arcade spawn template "Game" kind "Player" x 80 y 60 width 16 height 16
  set food to arcade spawn template "Game" kind "Food" x 80 y 60 width 16 height 16
`;
    const run = await runProgram(code, {frames: 8});
    assert.deepEqual(run.errors, []);
    assert.ok((run.calls.get('arcade_whenSpritesOverlap') || 0) > 0);
    const live = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).filter(sprite => sprite.id);
    assert.deepEqual(live.map(sprite => sprite.kind), ['Player']);
    const foodCount = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}))
        .find(variable => variable.name === 'foodCount');
    assert.equal(foodCount?.value, -1);
});

test('PXT overlap destroy effects remain an explicit gap', () => {
    const translated = arcadeToPseudocode(`sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function (hero, enemy) {
        sprites.destroy(enemy, effects.fire, 500)
    })`);
    assert.match(translated.code, /arcade destroy arcade event second/);
    assert.ok(translated.unsupported.some(gap => gap.includes('effect and duration')));
});
