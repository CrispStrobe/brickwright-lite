import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).

const source = `let victim: Sprite = null
sprites.onCreated(SpriteKind.Enemy, function(s: Sprite) { s.lifespan = 100 })
sprites.onDestroyed(SpriteKind.Enemy, function(s: Sprite) { info.changeScoreBy(s.x) })
victim = sprites.create(img\`1\`, SpriteKind.Enemy)`;

test('kind destruction callbacks retain their sprite handle through Code and Blocks', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /WHEN arcade kind "Enemy" destroyed:/);
    assert.match(imported.code, /arcade property x of arcade event first/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes) creator.applyCustomSVG(costume.sprite, costume.svg);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_whenSpriteDestroyed'));
    assert.match(creator.decompile(), /WHEN arcade kind "Enemy" destroyed:/);
});

test('lifespan destruction invokes one callback with the removed sprite snapshot', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 8, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    // info.changeScoreBy keeps the score in the Arcade runtime's state (the
    // device pane shows it), not in a Scratch variable named score.
    // A 1x1 sprite is created at x 79.5 and Arcade's score is an integer: the
    // pinned PXT simulator reports 79 for this program (measured).
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score), 79);
    assert.ok((run.calls.get('arcade_whenSpriteDestroyed') || 0) >= 1);
    assert.equal(Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).filter(sprite => sprite.id).length, 0);
});

test('explicit destruction is idempotent and fires the kind callback once', async () => {
    const run = await runProgram(`DEVICE ARCADE
GLOBAL victim
SPRITE Game:
WHEN flag clicked:
  set victim to arcade spawn template "Game" kind "Enemy" x 42 y 60 width 1 height 1
  arcade destroy victim
  arcade destroy victim
WHEN arcade kind "Enemy" destroyed:
  change score by arcade property x of arcade event first`, {frames: 5});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'score')?.value), 42);
});

test('per-sprite registration stays bound when its variable is reassigned', async () => {
    const source = `let first: Sprite = null
let alias: Sprite = null
first = sprites.create(img\`1\`, SpriteKind.Enemy)
alias = first
first.onDestroyed(function () { info.changeScoreBy(1) })
first = sprites.create(img\`2\`, SpriteKind.Enemy)
alias.destroy()`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade register destruction of first as "__bwDestroyed1"/);
    assert.match(imported.code, /WHEN arcade destruction handler "__bwDestroyed1" runs:/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes) creator.applyCustomSVG(costume.sprite, costume.svg);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_registerSpriteDestroyed'));
    assert.ok(projectOpcodes(creator.project).has('arcade_whenRegisteredDestroyed'));
    assert.match(creator.decompile(), /arcade register destruction of first as "__bwDestroyed1"/);
    const run = await runProgram(imported.code, {frames: 5, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    // info.changeScoreBy keeps the score in the Arcade runtime's state (the
    // device pane shows it), not in a Scratch variable named score.
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score), 1);
    const live = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).filter(sprite => sprite.id);
    assert.equal(live.length, 1);
    assert.equal(live[0].id, vars.find(variable => variable.name === 'first')?.value);
});

test('latest per-sprite registration replaces the earlier one and runs before kind callbacks', async () => {
    const run = await runProgram(`DEVICE ARCADE
GLOBAL victim
GLOBAL order
SPRITE Game:
WHEN flag clicked:
  set order to 0
  set victim to arcade spawn template "Game" kind "Enemy" x 80 y 60 width 1 height 1
  arcade register destruction of victim as "old"
  arcade register destruction of victim as "new"
  arcade destroy victim
WHEN arcade destruction handler "old" runs:
  set order to 99
WHEN arcade destruction handler "new" runs:
  set order to order * 10 + 1
WHEN arcade kind "Enemy" destroyed:
  set order to order * 10 + 2`, {frames: 5});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'order')?.value), 12);
});
