import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';

const source = `let victim: Sprite = null
sprites.onCreated(SpriteKind.Enemy, function(s: Sprite) { s.lifespan = 100 })
sprites.onDestroyed(SpriteKind.Enemy, function(s: Sprite) { info.changeScoreBy(s.x) })
victim = sprites.create(img\`1\`, SpriteKind.Enemy)`;

test('kind destruction callbacks retain their sprite handle and roundtrip to PXT', async () => {
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
    const exported = projectToArcade(creator.project, {costumeSvg: (target, costume) => {
        const asset = creator.assets.get(costume.assetId);
        return asset?.type === 'svg' ? asset.data : null;
    }});
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /sprites\.onDestroyed\(SpriteKind\.Enemy, function \(sprite: Sprite\)/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('lifespan destruction invokes one callback with the removed sprite snapshot', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 8, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'score')?.value), 80);
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
    const run = await runProgram(imported.code, {frames: 5, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'score')?.value), 1);
    const live = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {}).filter(sprite => sprite.id);
    assert.equal(live.length, 1);
    assert.equal(live[0].id, vars.find(variable => variable.name === 'first')?.value);
    const exported = projectToArcade(creator.project, {costumeSvg: (target, costume) => {
        const asset = creator.assets.get(costume.assetId);
        return asset?.type === 'svg' ? asset.data : null;
    }});
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /first\.onDestroyed\(function \(\) \{/);
    assert.match(exported.ts, /let alias: Sprite = null/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
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

test('an authored destruction callback without registration is reported on export', () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade destruction handler "orphan" runs:\n  change score by 1\n');
    const exported = projectToArcade(creator.project);
    assert.ok(exported.unsupported.some(gap => /callback orphan has no registration/.test(gap)));
});
