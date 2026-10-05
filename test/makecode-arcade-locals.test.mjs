import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';

test('a MakeCode function local stays inside each invocation and exports to PXT', async () => {
    const source = `function bump() {
        let value = 2
        value += 3
        info.changeScoreBy(value)
    }
    bump()
    bump()`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade set local value to \(\(0 \+ \(2\)\)\)/);
    assert.match(imported.code, /calculate value \(arcade local value\) op "\+" with \(\(0 \+ \(3\)\)\)/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_setLocal'));
    assert.ok(projectOpcodes(creator.project).has('arcade_getLocal'));
    assert.match(creator.decompile(), /arcade set local value to \(0 \+ 2\)/);
    const run = await runProgram(imported.code, {frames: 8});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    // info.changeScoreBy keeps the score in the Arcade runtime's state (the
    // device pane shows it), not in a Scratch variable named score.
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score), 10);
    assert.doesNotMatch(imported.code, /_mc\d+/);
});

test('nested Arcade procedure calls keep separate local frames', async () => {
    const source = `DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  outer
DEFINE inner:
  arcade set local value to 9
DEFINE outer:
  arcade set local value to 5
  inner
  change score by arcade local value`;
    const run = await runProgram(source, {frames: 8});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'score')?.value), 5);
});

test('recursive Arcade procedure calls restore each caller local', async () => {
    const source = `DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  descend 3\nDEFINE descend (depth):\n  arcade set local remembered to depth\n  IF depth > 0 THEN:\n    descend (depth - 1)\n  change score by arcade local remembered`;
    const run = await runProgram(source, {frames: 20});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'score')?.value), 6);
});
