// Ported unchanged from the parked Codex WIP (task F3 of docs/OPEN-TASKS-2026-09-29.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';

test('an Arcade button-only program registers on startup and displays its dialog on input', async () => {
    const source = `controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
        game.showLongText("Happy Holidays!", DialogLayout.Bottom)
    })`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const result = await runProgram(translated.code, {frames: 3});
    assert.equal(result.greenFlagThreadsStarted, 1, 'startup installs the callback');
    assert.equal(result.vm.runtime.bwArcadeDialogOpen, false, 'no dialog before input');
    const displayed = [];
    result.vm.runtime.on('ARCADE_DIALOG', dialog => { if (dialog) displayed.push(dialog); });
    result.vm.postIOData('keyboard', {key: 'z', isDown: true});
    result.vm.postIOData('keyboard', {key: 'z', isDown: false});
    await stepFrames(result.vm, 4, 20);
    assert.equal(displayed.length, 1);
    assert.equal(displayed[0].title, 'Happy Holidays!');
    assert.equal(displayed[0].layout, 'Bottom');
    assert.equal(result.vm.runtime.bwArcadeDialogOpen, true);
    displayed[0].dismiss();
    await stepFrames(result.vm, 2, 20);
    assert.equal(result.vm.runtime.bwArcadeDialogOpen, false);
    assert.deepEqual(result.errors, []);
});
