// Ported from the parked Codex WIP; qualified with real controller input.
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';

test('an Arcade button-only program registers on startup and displays its dialog on input', async () => {
    const source = `controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
        game.showLongText("Happy Holidays!", DialogLayout.Bottom)
    })`;
    // The original source is unchanged. B opens its real native dialog; no
    // synthetic callback or invented dismiss API is used in either runtime.
    const original = await runPxtArcade(source, {fakeClock:true, inspectDisplay:true,
        buttonActions:{steps:[{delay:100,button:6,held:true},{delay:40,button:6,held:false},{delay:500}]}});
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const result = await runProgram(translated.code, {frames:0,frameAuthority:'timed'});
    const clock=createArcadeDiscreteTimers();
    const displayed=[];
    try {
        result.vm.stopAll();result.vm.runtime.bwArcadeProgramClock=clock;
        result.vm.runtime.updateCurrentMSecs=()=>{result.vm.runtime.currentMSecs=clock.now();};
        result.vm.runtime.on('ARCADE_DIALOG', dialog=>{if(dialog)displayed.push(dialog);});
        result.vm.greenFlag();await stepFrames(result.vm,1,0);await clock.advanceTo(100);
        assert.equal(result.greenFlagThreadsStarted,1,'startup installs the callback');
        assert.equal(result.vm.runtime.bwArcadeDialogOpen,false,'no dialog before input');
        result.vm.postIOData('keyboard',{key:'z',isDown:true});
        await clock.advanceTo(140);result.vm.postIOData('keyboard',{key:'z',isDown:false});
        await clock.advanceTo(640);
        assert.ok(displayed.length,'real B input publishes dialog state');
        const dialog=displayed.at(-1);
        assert.equal(dialog.native,true);assert.equal(dialog.title,'Happy Holidays!');assert.equal(dialog.layout,'Bottom');
        assert.equal(result.vm.runtime.bwArcadeDialogOpen,true);
        const pixels=result.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels;
        assert.equal(pixels.length,19200);assert.equal(original.$display.screen.length,19200);
        const different=Array.from(pixels,(index,i)=>original.$display.palette[index]!==original.$display.screen[i]?i:-1).filter(i=>i>=0);
        assert.deepEqual(different.slice(0,12),[],different.length+' original/native displayed pixel differences');
        // A is a separate genuine input edge after the opening B was released.
        result.vm.postIOData('keyboard',{key:' ',isDown:true});await clock.advanceTo(680);
        result.vm.postIOData('keyboard',{key:' ',isDown:false});await clock.advanceTo(740);
        assert.equal(result.vm.runtime.bwArcadeDialogOpen,false,'real A input closes the native dialog');
        assert.deepEqual(result.errors,[]);
    } finally {result.vm.stopAll();result.vm.quit();clearStrayTimers();}
});
