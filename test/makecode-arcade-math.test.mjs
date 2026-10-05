import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes, runProgram} from './helpers/bw-vm.mjs';

test('Arcade math calls preserve every operand and run', async () => {
    const source = `let smallest = Math.min(9, 3)
let largest = Math.max(9 - 2, 3)
let scaled = Math.map(5, 0, 10, 0, 100)
let power = Math.pow(2, 3)`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(translated.code);
    assert.deepEqual(creator.warnings, []);
    const opcodes = projectOpcodes(creator.project);
    for (const opcode of ['planetemaths_min', 'planetemaths_max', 'microbitplus_map', 'planetemaths_pow']) {
        assert.ok(opcodes.has(opcode), `${opcode} missing`);
    }
    const run = await runProgram(translated.code, {frames: 4});
    assert.deepEqual(run.errors, []);
    const vars = Object.fromEntries(run.vm.runtime.targets.flatMap(target =>
        Object.values(target.variables || {}).map(variable => [variable.name, variable.value])));
    assert.equal(Number(vars.smallest), 3);
    assert.equal(Number(vars.largest), 7);
    assert.equal(Number(vars.scaled), 50);
    assert.equal(Number(vars.power), 8);
});
