import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {arcadeSimAvailable, compileArcade, runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';

// An asset literal the project does not carry (no gallery file) compiles in PXT and evaluates to undefined. A Sprite made
// from it throws and ends the fiber that made it, so nothing is created; an animation made from it is a silent no-op.
// The kept-by-name references must run that way: no live stand-in sprite, and no animation error.
const SIM = arcadeSimAvailable() ? false : 'MakeCode runtime not synced (npm run sync:makecode)';
const CREATION = `forever(function () {
    console.log("tick")
    let shot = sprites.createProjectileFromSide(assets.image\`ghost art\`, -90, 0)
    shot.y = randint(0, 10)
    animation.runImageAnimation(shot, assets.animation\`ghost frames\`, 100, true)
})
`;
const ANIMATION = `let hero = sprites.create(img\`
    2 2
    2 2
\`, SpriteKind.Player)
animation.runImageAnimation(hero, assets.animation\`ghost frames\`, 100, true)
console.log("after animation")
forever(function () {
    console.log("tick")
    pause(100)
})
`;
const pxtLog = async source => (await runArcadeSim(await compileArcade(source), {ms: 1500})).serial.map(line => line.text.replace(/\n$/, ''));
const distinct = lines => [...new Set(lines)];
const bwRun = async source => {
    const imported = arcadeToPseudocode(source);
    try {
        const run = await runProgram(imported.code, {frames: 30, uploads: imported.costumes, storage: true});
        return {errors: run.errors, log: (run.vm.runtime.bwArcadeDeviceState?.serial ?? '').split('\n').filter(Boolean), unsupported: imported.unsupported};
    } finally { clearStrayTimers(); }
};

test('a creation from an absent asset literal faults as PXT does instead of making a stand-in sprite', async () => {
    const run = await bwRun(CREATION);
    assert.ok(run.errors.length > 0);
    assert.deepEqual(distinct(run.errors), ['TypeError: Expected type Image but received type undefined. Did you forget to assign a variable?']);
    assert.ok(run.unsupported.some(note => /ghost art.*artwork is unavailable/.test(note)), 'the absent artwork is still said by name');
    assert.deepEqual(distinct(run.log), ['tick']);
});

test('an animation from an absent asset literal is a no-op and the program carries on', async () => {
    const run = await bwRun(ANIMATION);
    assert.deepEqual(run.errors, []);
    assert.ok(run.log.includes('after animation'));
    assert.deepEqual(distinct(run.log), ['after animation', 'tick']);
});

test('pxt-arcade agrees on both programs', {skip: SIM, timeout: 300000}, async () => {
    const creation = await pxtLog(CREATION), animation = await pxtLog(ANIMATION);
    assert.deepEqual(distinct(creation), ['tick']);
    assert.deepEqual(distinct(animation), ['after animation', 'tick']);
});
