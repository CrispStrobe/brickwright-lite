import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).

const source = `let ticks = 0
game.onUpdate(function () { ticks += 1 })`;

test('Arcade onUpdate remains a game event through Code and Blocks', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN arcade updates:\n  change ticks by 1/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_whenUpdate'));
    assert.match(creator.decompile(), /WHEN arcade updates:/);
});

test('onUpdate fires once per Arcade frame without any sprites', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 6});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'ticks')?.value), 6);
    assert.ok((run.calls.get('arcade_whenUpdate') || 0) >= 6);
});

test('a due interval callback runs before the frame update callback', async () => {
    const imported = arcadeToPseudocode(`let marker = 0
let observed = 0
game.onUpdateInterval(100, function () { marker = 1 })
game.onUpdate(function () {
    if (marker == 1) { observed += 1; marker = 0 }
})`);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 3});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'observed')?.value), 1);
});
