import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes, runProgram} from './helpers/bw-vm.mjs';

test('discarded array pop removes the last element with a command block', async () => {
    const translated = arcadeToPseudocode('let xs: number[] = [1, 2, 3]\nxs.pop()\nlet count = xs.length');
    assert.deepEqual(translated.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(translated.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arrays_mutateReference'));
    const run = await runProgram(translated.code, {frames: 4});
    assert.deepEqual(run.errors, []);
    const count = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}))
        .find(variable => variable.name.replace(/^Game_/, '') === 'count');
    assert.equal(Number(count?.value), 2);
});
