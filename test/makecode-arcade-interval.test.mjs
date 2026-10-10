import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {SB3Creator, runProgram, stepFrames, projectOpcodes} from './helpers/bw-vm.mjs';

const source = `let ticks = 0
let slow = 0
game.onUpdateInterval(100, function () { ticks += 1 })
game.onUpdateInterval(200, function () { slow += 1 })`;

test('Arcade interval callbacks retain their event identity through blocks and PXT', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade register interval \(?100\)? as/);
    assert.match(imported.code, /arcade register interval \(?200\)? as/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_registerIntervalHandler'));
    const decompiled = creator.decompile();
    assert.match(decompiled, /arcade register interval \(?100\)? as/);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /game\.onUpdateInterval\(100, function/);
    assert.match(exported.ts, /game\.onUpdateInterval\(200, function/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

// Registration timers fire on the first scene update, then independently at
// their evaluated periods. Explicit 20ms frames avoid real-clock test drift.
async function execute(source) {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 0});
    let now = 0;
    run.vm.runtime.updateCurrentMSecs = () => { run.vm.runtime.currentMSecs = now; };
    const step = async count => {
        for (let i = 0; i < count; i++) {
            await stepFrames(run.vm, 1, 20);
            now += 20;
        }
    };
    const value = name => Number(run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}))
        .find(variable => variable.name === name)?.value);
    // Install handlers and complete their initial calls without advancing time.
    await stepFrames(run.vm, 2, 0);
    return {run, step, value};
}

test('independent Arcade interval registrations fire at their periods in the shipped VM', async () => {
    const {run, step, value} = await execute(source);
    assert.equal(value('ticks'), 1);
    assert.equal(value('slow'), 1);
    await step(4);
    assert.equal(value('ticks'), 1, 'not before100ms');
    await step(1);
    assert.equal(value('ticks'), 2);
    assert.equal(value('slow'), 1);
    await step(5);
    assert.equal(value('ticks'), 3);
    assert.equal(value('slow'), 2);
    assert.equal(run.calls.get('arcade_registerIntervalHandler'), 2);
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.creator.warnings, []);
});

test('a dynamic interval period is evaluated when registered and survives later assignment', async () => {
    const {run, step, value} = await execute(`let ticks = 0
let period = 100
game.onUpdateInterval(period, function () { ticks += 1 })
period = 1`);
    assert.equal(value('ticks'), 1);
    await step(4);
    assert.equal(value('ticks'), 1, 'not before100ms');
    await step(1);
    assert.equal(value('ticks'), 2);
    assert.equal(value('period'), 1);
    assert.equal(run.calls.get('arcade_registerIntervalHandler'), 1);
    assert.deepEqual(run.errors, []);
});
