import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';

const source = `let ticks = 0
let slow = 0
game.onUpdateInterval(100, function () { ticks += 1 })
game.onUpdateInterval(200, function () { slow += 1 })`;

test('Arcade interval callbacks retain their event identity through blocks and PXT', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN arcade every 100 ms:/);
    assert.match(imported.code, /WHEN arcade every 200 ms:/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_whenInterval'));
    const decompiled = creator.decompile();
    assert.match(decompiled, /WHEN arcade every 100 ms:/);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /game\.onUpdateInterval\(100, function/);
    assert.match(exported.ts, /game\.onUpdateInterval\(200, function/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('independent Arcade interval hats fire at their periods in the shipped VM', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 12});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    const value = name => Number(vars.find(variable => variable.name === name)?.value);
    assert.equal(value('ticks'), 4);
    assert.equal(value('slow'), 2);
    assert.ok((run.calls.get('arcade_whenInterval') || 0) >= 2);
});

test('a nonconstant interval period is reported rather than silently converted', () => {
    const imported = arcadeToPseudocode('let period = 100\ngame.onUpdateInterval(period, function () { info.changeScoreBy(1) })');
    assert.ok(imported.unsupported.some(gap => /period must be a positive constant/.test(gap)));
});
