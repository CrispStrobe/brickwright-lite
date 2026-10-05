import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';

test('MakeCode forever callback runs repeatedly in the Arcade VM', async () => {
    const translated = arcadeToPseudocode('forever(function () { info.changeScoreBy(1) })');
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /WHEN flag clicked:\n  FOREVER:\n    change score by 1/);
    const run = await runProgram(translated.code, {frames: 12});
    assert.deepEqual(run.errors, []);
    const score = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}))
        .find(variable => variable.name === 'score');
    assert.ok(Number(score?.value) > 1);
});

test('MakeCode stop all sounds uses the existing sound block', () => {
    const translated = arcadeToPseudocode(`controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
        music.stopAllSounds()
    })`);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /WHEN z key pressed:\n  stop all sounds/);
});
