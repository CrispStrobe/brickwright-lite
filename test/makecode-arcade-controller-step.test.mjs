import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';

const source = `let horizontal = controller.dx(90)
let vertical = controller.dy()
let reversed = controller.dx(-60)`;

test('controller dx and dy keep their steps through Code, Blocks, and PXT', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade controller x step 90/);
    assert.match(imported.code, /arcade controller y step 100/);
    assert.match(imported.code, /arcade controller x step \(0 - 60\)/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_controllerStep'));
    assert.match(creator.decompile(), /arcade controller y step 100/);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /controller\.dx\(90\)/);
    assert.match(exported.ts, /controller\.dy\(100\)/);
    assert.match(exported.ts, /controller\.dx\(\(0 - 60\)\)/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('controller reporters use signed PXT frame movement for held arrows', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 2, keys: ['ArrowRight', 'ArrowUp']});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    const value = name => Number(vars.find(variable => variable.name === name)?.value);
    assert.equal(value('horizontal'), 3);
    assert.equal(value('vertical'), -100 / 30);
    assert.equal(value('reversed'), -2);
    assert.ok((run.calls.get('arcade_controllerStep') || 0) >= 3);
});

test('opposing Arcade directions cancel', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 2,
        keys: ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    for (const name of ['horizontal', 'vertical', 'reversed']) {
        assert.ok(Number(vars.find(variable => variable.name === name)?.value) === 0);
    }
});

test('a reporter in the native axis socket retains its selected direction through Arcade export', async () => {
    const code = `DEVICE ARCADE
SPRITE Game:
  LOCAL axis
  LOCAL vertical
  WHEN flag clicked:
    set axis to "Y"
    set vertical to (arcade controller (axis) step 90)
`;
    const exercise = async pseudocode => {
        const run = await runProgram(pseudocode, {frames: 2, keys: ['ArrowRight', 'ArrowUp']});
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const value = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}))
            .find(variable => variable.name.replace(/^Game_/, '') === 'vertical');
        assert.equal(Number(value?.value), -3, 'the dynamic Y axis must read up, not right');
        return run;
    };
    const run = await exercise(code);
    const exported = projectToArcade(run.creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /controller\.dy\(step\)/);
    assert.match(exported.ts, /controller\.dx\(step\)/);
    const compiled = await compile('arcade', exported.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const reimported = arcadeToPseudocode(exported.ts);
    assert.deepEqual(reimported.unsupported, []);
    await exercise(reimported.code);
});
