// Boolean words in the dialect's value position — task E3, from the parked WIP
// (23e9c7f44). The WIP's vendored sb3-creator copy evaluated comparisons used as
// values (`set below to a < b` -> true). The pinned sb3-creator rules the other
// way, deliberately (sb3-creator docs/BOOLEAN-IN-VALUE-POSITION.md, kept by E0):
// Scratch stores "true"/"false" text while every C target stores 1/0, so no single
// value form round-trips; a comparison in value position is written as its text
// and WARNED, and the remedy named in the warning is to branch and assign 1 or 0.
// So the WIP's first test is superseded and rewritten to that ruling; its second
// test passes on main as ported.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram, SB3Creator} from './helpers/bw-vm.mjs';

test('a comparison used as a value is kept as text and warned about, line by line', async () => {
    const source = `GLOBAL a = 4
GLOBAL b = 7
SPRITE Game:
WHEN flag clicked:
  set below to a < b
  set decision to a < b and not (a = b)
  set literal to "not a = b"
  IF a < b THEN:
    set branched to 1
  ELSE:
    set branched to 0
`;
    const run = await runProgram(source, {frames: 4});
    assert.deepEqual(run.errors, []);
    const warned = run.creator.warnings.map(w => /^Line (\d+): .* is a COMPARISON used where a value is expected/.exec(w));
    assert.ok(warned.every(Boolean), `unexpected warning: ${run.creator.warnings.join(' | ')}`);
    assert.deepEqual(warned.map(m => Number(m[1])), [5, 6]);
    const values = Object.fromEntries(run.vm.runtime.targets.flatMap(target =>
        Object.values(target.variables || {}).map(variable => [variable.name, variable.value])));
    assert.equal(values.below, 'a < b');
    assert.equal(values.decision, 'a < b and not (a = b)');
    assert.equal(values.literal, 'not a = b');
    // The dialect's spelling for keeping a truth value: branch and assign.
    assert.equal(String(values.branched), '1');
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
