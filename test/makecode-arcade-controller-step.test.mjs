import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {EventEmitter} from 'node:events';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';

const source = `let horizontal = controller.dx(90)
let vertical = controller.dy()
let reversed = controller.dx(-60)`;

const constant = node => {
    if(node?.type==='Number')return Number(node.value);
    if(node?.type==='Unary' && node.op==='-')return -constant(node.argument);
    if(node?.type==='Binary' && node.op==='+')return constant(node.left)+constant(node.right);
    assert.fail(`Unexpected controller speed expression ${JSON.stringify(node)}`);
};
const controllerCalls = node => {
    if(!node || typeof node!=='object')return [];
    const here=node.type==='Call' && node.callee?.type==='Member' && node.callee.object?.name==='controller'?
        [[node.callee.name,constant(node.args[0])]]:[];
    return [...here,...Object.values(node).flatMap(value=>Array.isArray(value)?value.flatMap(controllerCalls):controllerCalls(value))];
};

test('controller dx and dy keep their steps through Code, Blocks, and PXT', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade controller x step 90/);
    assert.match(imported.code, /arcade controller y step 100/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_controllerStep'));
    assert.match(creator.decompile(), /arcade controller y step 100/);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /controller\.dx\(90\)/);
    assert.match(exported.ts, /controller\.dy\(100\)/);
    assert.deepEqual(controllerCalls(parseMakeCodeTs(exported.ts)),[['dx',90],['dy',100],['dx',-60]]);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

// PXT controller.dx/dy: direction * step * the frame's actual delta time. Before the first frame the delta is 0.
const updateSource = `let horizontal = 0
let vertical = 0
let reversed = 0
game.onUpdate(function () {
    horizontal = controller.dx(90)
    vertical = controller.dy()
    reversed = controller.dx(-60)
})`;
const frameDelta = run => run.vm.runtime.bwArcadeDeviceState.frameDeltaTime;

test('controller reporters use signed PXT frame movement for held arrows', async () => {
    const imported = arcadeToPseudocode(updateSource);
    const run = await runProgram(imported.code, {frames: 6, keys: ['ArrowRight', 'ArrowUp']});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    const value = name => Number(vars.find(variable => variable.name === name)?.value);
    const dt = frameDelta(run);
    assert.ok(dt > 0);
    assert.ok(Math.abs(value('horizontal') - 90 * dt) < 1e-9);
    assert.ok(Math.abs(value('vertical') + 100 * dt) < 1e-9);
    assert.ok(Math.abs(value('reversed') + 60 * dt) < 1e-9);
    assert.ok((run.calls.get('arcade_controllerStep') || 0) >= 3);
});

test('controller reporters scale with the frame delta, not a fixed 30 Hz', () => {
    const arcade = new (loadExtensionClass('arcade'))(new EventEmitter())._inst;
    const state = arcade._state();
    state.buttons.right = true;
    for (const dt of [0, 1 / 60, 0.04, 0.1]) {
        state.frameDeltaTime = dt;
        assert.equal(arcade.controllerStep({AXIS: 'x', STEP: 90}), 90 * dt);
        assert.equal(arcade.controllerStep({AXIS: 'x', STEP: -60}), -60 * dt);
    }
});

test('controller reporters read 0 before the first frame, as the original does', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 2, keys: ['ArrowRight', 'ArrowUp']});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    for (const name of ['horizontal', 'vertical', 'reversed']) assert.equal(Math.abs(Number(vars.find(variable => variable.name === name)?.value)), 0);
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
  WHEN arcade source starts:
    set axis to "Y"
    arcade register update as "__bwUpdate1" capturing ""

  WHEN arcade update handler "__bwUpdate1" runs:
    set vertical to (arcade controller (axis) step 90)
`;
    const exercise = async pseudocode => {
        const run = await runProgram(pseudocode, {frames: 6, keys: ['ArrowRight', 'ArrowUp']});
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const value = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}))
            .find(variable => variable.name.replace(/^Game_/, '') === 'vertical');
        assert.ok(Math.abs(Number(value?.value) + 90 * frameDelta(run)) < 1e-9 && frameDelta(run) > 0, 'the dynamic Y axis must read up, not right');
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
