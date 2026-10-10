import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, projectOpcodes} from './helpers/bw-vm.mjs';

test('MakeCode forever callback runs repeatedly in the Arcade VM', async () => {
    const translated = arcadeToPseudocode('forever(function () { info.changeScoreBy(1) })');
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /arcade register forever/);
    assert.doesNotMatch(translated.code, /WHEN flag clicked:\n  FOREVER:/);
    const run = await runProgram(translated.code, {frames: 0});
    for(let i=0;i<20 && !(Number(run.vm.runtime.bwArcadeDeviceState?.score)>1);i++){
        await new Promise(resolve=>setTimeout(resolve,5));await stepFrames(run.vm,1,20);
    }
    assert.deepEqual(run.errors, []);
    // Arcade's on-screen score (the extension's), not a Scratch variable.
    assert.ok(Number(run.vm.runtime.bwArcadeDeviceState?.score) > 1);
});

test('MakeCode stop all sounds dispatches the existing sound block from a registered controller callback', async () => {
    const translated = arcadeToPseudocode(`controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
        music.stopAllSounds()
    })`);
    assert.deepEqual(translated.unsupported, []);
    const run = await runProgram(translated.code, {frames: 3});
    const opcodes = projectOpcodes(run.creator.project);
    assert.ok(opcodes.has('arcade_registerButtonHandler'));
    assert.ok(opcodes.has('sound_stopallsounds'));
    let stopped = 0;
    const original = run.vm.runtime._primitives.sound_stopallsounds;
    run.vm.runtime._primitives.sound_stopallsounds = (...args) => { stopped++; return original(...args); };
    assert.equal(stopped, 0);
    run.vm.postIOData('keyboard', {key: 'z', isDown: true});
    run.vm.postIOData('keyboard', {key: 'z', isDown: false});
    await stepFrames(run.vm, 4, 20);
    assert.equal(stopped, 1);
    assert.deepEqual(run.errors, []);
});
