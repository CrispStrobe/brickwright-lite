import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';

test('an Arcade button-only program starts on its button even without a green-flag thread', async () => {
    const source = `controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
        game.showLongText("Happy Holidays!", DialogLayout.Bottom)
    })`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const result = await runProgram(translated.code, {frames: 24, keys: ['z']});
    assert.equal(result.greenFlagThreadsStarted, 0);
    assert.equal(result.threadsStarted, 1);
    assert.deepEqual(result.errors, []);
});
