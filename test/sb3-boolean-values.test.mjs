import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram, SB3Creator} from './helpers/bw-vm.mjs';

test('Boolean values evaluate in assignments and arithmetic with condition precedence', async () => {
    const source = `GLOBAL a = 4
GLOBAL b = 7
SPRITE Game:
WHEN flag clicked:
  set below to a < b
  set negation to not (a > b)
  set decision to a < b and not (a = b)
  set arithmetic to (a < b) * 10
  set literal to "not a = b"
`;
    const run = await runProgram(source, {frames: 4});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    const values = Object.fromEntries(run.vm.runtime.targets.flatMap(target =>
        Object.values(target.variables || {}).map(variable => [variable.name, variable.value])));
    assert.equal(values.below, true); assert.equal(values.negation, true);
    assert.equal(values.decision, true); assert.equal(values.arithmetic, 10);
    assert.equal(values.literal, 'not a = b');
    const again = await runProgram(run.creator.decompile(), {frames: 4});
    const next = Object.fromEntries(again.vm.runtime.targets.flatMap(target =>
        Object.values(target.variables || {}).map(variable => [variable.name, variable.value])));
    assert.deepEqual(next, values);
});

test('declared names containing Boolean words remain variable reads', () => {
    const creator = new SB3Creator(); creator.parse(`GLOBAL not ready = 4
GLOBAL enabled and done = 7
SPRITE Game:
WHEN flag clicked:
  set copy to not ready
  set other to enabled and done`);
    assert.deepEqual(creator.warnings, []);
    const blocks = creator.project.targets.flatMap(target => Object.values(target.blocks));
    assert.equal(blocks.filter(block => ['operator_not', 'operator_and'].includes(block.opcode)).length, 0);
});
