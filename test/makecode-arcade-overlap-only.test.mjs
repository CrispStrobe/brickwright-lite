import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {imageToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';

// The runtime reads a sprite's pixels from its costume, so an authored
// Code program gives its template pixel art, as the paint editor would.
// An authored template is a script-less sprite with pixel art, as the
// importer writes them: a clone of the Game sprite would carry Game's
// scripts, so its own copy of a hat would run (and stop with it).
const pixelCostume = (sprite, colour = 2) => ({sprite, mode: 'replace',
    svg: imageToSvg({width: 16, height: 16, pixels: new Uint8Array(256).fill(colour)})});

test('a pinned PXT overlap callback destroys the event sprite it names', async () => {
    const source = readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-overlap-destroy.ts'), 'utf8');
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /arcade set local otherSprite to arcade event second/);
    assert.match(translated.code, /arcade destroy arcade local otherSprite/);
    const code = translated.code + `WHEN flag clicked:
  set hero to arcade spawn template "Art" kind "Player" x 80 y 60 width 16 height 16
  set food to arcade spawn template "Art" kind "Food" x 80 y 60 width 16 height 16

SPRITE Art:
WHEN flag clicked:
  hide
`;
    const run = await runProgram(code, {frames: 8, uploads: [...translated.costumes, pixelCostume('Art')], storage: true});
    assert.deepEqual(run.errors, []);
    assert.ok((run.calls.get('arcade_whenRegisteredOverlap') || 0) > 0);
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
    assert.match(translated.code, /arcade set local enemy to arcade event second/);
    assert.match(translated.code, /arcade destroy arcade local enemy/);
    assert.ok(translated.unsupported.some(gap => gap.includes('effect and duration')));
});
