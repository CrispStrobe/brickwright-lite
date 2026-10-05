import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).

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
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const vars = run.vm.runtime.targets.flatMap(target => Object.values(target.variables || {}));
    // info.changeScoreBy keeps the score in the Arcade runtime's state (the
    // device pane shows it), not in a Scratch variable named score.
    assert.equal(Number(run.vm.runtime.bwArcadeDeviceState?.score), 105);
});

test('a null source keeps PXT edge placement', async () => {
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
});
