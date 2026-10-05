import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, runProgram, projectOpcodes} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).

test('a function creates dynamic projectiles with per-call handles and destruction callbacks', async () => {
    const source = `let speed = 40
function launch() {
    let p = sprites.createProjectile(img\`\n        f f f f f\n        f f f f f\n        f f f f f\n    \`, -1 * speed, 0, 0)
    p.onDestroyed(function () { info.changeScoreBy(1) })
    p.destroy()
}
launch()
launch()`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade set local p to \(?arcade projectile template/);
    assert.match(imported.code, /kind "Projectile" vx/);
    assert.match(imported.code, /arcade register destruction of arcade local p/);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes) creator.applyCustomSVG(costume.sprite, costume.svg);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_spawnProjectile'));
    assert.match(creator.decompile(), /arcade projectile template/);
    const run = await runProgram(imported.code, {frames: 10, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState.score, 2, 'both real projectile callbacks update Arcade score');
});

test('a stationary projectile starts at the Arcade scene origin', async () => {
    const code = `DEVICE ARCADE\nGLOBAL p\nSPRITE Game:\nWHEN flag clicked:\n  set p to arcade projectile template "Game" kind "Projectile" vx 0 vy 0 width 5 height 3 mode side`;
    const run = await runProgram(code, {frames: 1});
    assert.deepEqual(run.errors, []);
    const projectile = Object.values(run.vm.runtime.bwArcadeDeviceState?.sprites || {})
        .find(sprite => sprite.id);
    assert.equal(projectile?.x, 0);
    assert.equal(projectile?.y, 0);
    assert.equal(projectile?.autoDestroy, true);
});
