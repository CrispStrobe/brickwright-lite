import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes, runProgram} from './helpers/bw-vm.mjs';

test('life zero callback waits for life to be granted, then rearms after revival', async () => {
    const translated = arcadeToPseudocode(`info.onLifeZero(function () {
    info.changeScoreBy(1)
    info.setLife(2)
})`);
    assert.deepEqual(translated.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(translated.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('control_wait_until'));
    const run = await runProgram(translated.code, {frames: 4});
    assert.deepEqual(run.errors, []);
    const variable = name => run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}))
        .find(value => value.name === name);
    const step = () => { for (let i = 0; i < 10; i++) run.vm.runtime._step(); };
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score ?? 0), 0);
    variable('lives').value = 2;
    step();
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score ?? 0), 0);
    variable('lives').value = 0;
    step();
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score ?? 0), 1);
    assert.equal(Number(variable('lives').value), 2);
    step();
    variable('lives').value = 0;
    step();
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score ?? 0), 2);
});
