import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile, hasRuntime} from '../scripts/lib/pxt-node.mjs';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';

const source = `function launch() {
    let origin = sprites.createProjectileFromSide(img\`1 1\`, 0, 0)
    origin.setPosition(72, 33)
    let shot = sprites.createProjectileFromSprite(img\`2 2\`, origin, 40, 0)
    info.setScore(shot.x)
    let food = sprites.createProjectile(img\`3 3\`, -20, 0, SpriteKind.Food, origin)
    info.changeScoreBy(food.y)
}
launch()`;

test('projectiles inherit a source handle position and keep their PXT creation form', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /mode sprite source arcade local origin/);
    assert.match(imported.code, /mode kind-source source arcade local origin/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes) creator.applyCustomSVG(costume.sprite, costume.svg);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_spawnProjectile'));
    assert.match(creator.decompile(), /mode sprite source \(arcade local origin\)/);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    assert.equal(Number(vars.find(variable => variable.name === 'score')?.value), 105);
    const exported = projectToArcade(creator.project, {costumeSvg: (target, costume) => {
        const asset = creator.assets.get(costume.assetId);
        return asset?.type === 'svg' ? asset.data : null;
    }});
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /sprites\.createProjectileFromSprite\(/);
    assert.match(exported.ts, /sprites\.createProjectile\([\s\S]*SpriteKind\.Food, origin\)/);
    if (hasRuntime('arcade')) {
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    }
});

test('a null source keeps PXT edge placement and exports as null', async () => {
    const imported = arcadeToPseudocode(`function launch() {
        let shot = sprites.createProjectileFromSprite(img\`1\`, null, -40, 0)
    }
    launch()`);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /mode sprite source ""/);
    const run = await runProgram(imported.code, {frames: 1});
    assert.deepEqual(run.errors, []);
    const shot = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .find(sprite => sprite.id);
    assert.equal(shot?.x, 159);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes) creator.applyCustomSVG(costume.sprite, costume.svg);
    assert.deepEqual(creator.warnings, []);
    const exported = projectToArcade(creator.project, {costumeSvg: (target, costume) => {
        const asset = creator.assets.get(costume.assetId);
        return asset?.type === 'svg' ? asset.data : null;
    }});
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /sprites\.createProjectileFromSprite\([\s\S]*null, \(0 - 40\), 0\)/);
});
