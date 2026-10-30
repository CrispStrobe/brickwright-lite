import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';

// PXT's playTone is playNoteCore then pause(ms): the handler fiber resumes from
// its own timer at the pause deadline, not at the next frame. A sixteenth beat
// (31 ms at 120 bpm) is shorter than a frame, so a frame-quantized resume shows.
const source = `let start = -1
let resumed = -1
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    start = control.millis()
    music.playTone(262, music.beat(BeatFraction.Sixteenth))
    resumed = control.millis()
    info.changeScoreBy(1)
})
info.setScore(0)
`;

test('a blocking playTone resumes its handler at the pause deadline, as in PXT', async () => {
    const original = await runPxtArcade(source, {fakeClock: true,
        buttonActions: {steps: [{delay: 100, button: 6, held: true}, {delay: 60, button: 6, held: false}, {delay: 300}]}});
    assert.ok(original.start >= 0 && original.resumed >= 0, 'original handler ran to completion');
    const pause = original.resumed - original.start;
    assert.ok(pause >= 31 && pause <= 32, `original pause lasts the beat, not a frame (${pause} ms)`);

    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const run = await runProgram(translated.code, {frames: 0, frameAuthority: 'timed'});
    const {vm} = run, clock = createArcadeDiscreteTimers();
    const values = () => Object.fromEntries(vm.runtime.targets.flatMap(t => Object.values(t.variables))
        .map(v => [v.name.replace(/^Game_/, ''), v.value]));
    try {
        vm.stopAll(); vm.runtime.bwArcadeProgramClock = clock;
        vm.runtime.updateCurrentMSecs = () => { vm.runtime.currentMSecs = clock.now(); };
        vm.greenFlag(); await stepFrames(vm, 1, 0); await clock.advanceTo(100);
        vm.postIOData('keyboard', {key: 'z', isDown: true});
        for (let turn = 0; turn < 4; turn++) await new Promise(resolve => setImmediate(resolve));
        const start = values().start;
        assert.ok(start >= 0, 'the B handler started on the press');
        // Observe just after the deadline, before any later frame could resume it.
        await clock.advanceTo(start + pause + 1);
        for (let turn = 0; turn < 4; turn++) await new Promise(resolve => setImmediate(resolve));
        assert.equal(values().resumed - start, pause, 'resumed at the same deadline as the original');
        assert.equal(vm.runtime.bwArcadeDeviceState.players?.[0]?.score ?? vm.runtime.bwArcadeDeviceState.score, 1,
            'the statement after playTone ran before the next frame');
        vm.postIOData('keyboard', {key: 'z', isDown: false});
        await clock.advanceTo(460);
        assert.deepEqual(run.errors, []);
    } finally { vm.quit(); clearStrayTimers(); }
});
