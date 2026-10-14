import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes, runProgram, stepFrames} from './helpers/bw-vm.mjs';

test('life zero waits for assigned life, accepts zero directly and rearms after revival', async () => {
    const translated = arcadeToPseudocode(`info.onLifeZero(function () {
    info.changeScoreBy(1)
    info.setLife(2)
})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){info.setLife(0)})`);
    assert.deepEqual(translated.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(translated.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_registerLifeZeroHandler'));
    assert.ok(!projectOpcodes(creator.project).has('control_wait_until'));
    const run = await runProgram(translated.code, {frames: 4});
    assert.deepEqual(run.errors, []);
    const state = () => run.vm.runtime.bwArcadeDeviceState;
    assert.equal(Number(state().score ?? 0), 0);
    for (const score of [1,2]) {
        run.vm.postIOData('keyboard',{key:' ',isDown:true});
        run.vm.postIOData('keyboard',{key:' ',isDown:false});
        await stepFrames(run.vm,4);
        assert.equal(Number(state().score),score);
        assert.equal(state().players[0].life,2);
        await stepFrames(run.vm,4);
        assert.equal(Number(state().score),score,'revived life does not repeat the callback');
    }
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
});
