import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes, runProgram} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';

test('pinned random startup background runs through the background primitive', async () => {
    const source = readFileSync(join(import.meta.dirname,
        'fixtures/makecode/arcade-random-background.ts'), 'utf8');
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const run = await runProgram(translated.code, {frames: 4, uploads: translated.costumes, storage: true});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    assert.ok(projectOpcodes(run.creator.project).has('arcade_setBackgroundColor'));
    const color = run.vm.runtime.bwArcadeDeviceState.backgroundColor;
    assert.ok(color >= 1 && color <= 15);
});

test('background color changes in procedures and controller handlers survive all conversion layers', async () => {
    const source = `let color = 2
function paint(value: number) { scene.setBackgroundColor(value) }
let hero = sprites.create(img\`1\`, SpriteKind.Player)
paint(color)
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    color = scene.backgroundColor() + 1
    paint(color)
})`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 5, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState.backgroundColor, 2);
    run.vm.postIOData('keyboard', {key: ' ', isDown: true});
    for (let i = 0; i < 5; i++) run.vm.runtime._step();
    assert.equal(run.vm.runtime.bwArcadeDeviceState.backgroundColor, 3);
    const recreated = new SB3Creator(); recreated.parse(run.creator.decompile());
    assert.deepEqual(recreated.warnings, []);
    const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) =>
        run.creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /scene\.backgroundColor\(\)/);
    assert.match(exported.ts, /scene\.setBackgroundColor\(value\)/);
    const compiled = await compile('arcade', exported.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const again = arcadeToPseudocode(exported.ts);
    assert.deepEqual(again.unsupported, []);
    const roundtrip = await runProgram(again.code, {frames: 5, uploads: again.costumes, storage: true});
    assert.equal(roundtrip.vm.runtime.bwArcadeDeviceState.backgroundColor, 2);
});

test('multiple sequential background changes preserve their order and reset on restart', async () => {
    const result = arcadeToPseudocode('scene.setBackgroundColor(1)\nscene.setBackgroundColor(randint(2, 15))');
    assert.deepEqual(result.unsupported, []);
    const run = await runProgram(result.code, {frames: 4});
    assert.deepEqual(run.errors, []);
    assert.ok(run.vm.runtime.bwArcadeDeviceState.backgroundColor >= 2);
    run.vm.runtime.emit('PROJECT_START');
    assert.equal(run.vm.runtime._primitives.arcade_backgroundColor({}, {}), 0);
    const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(exported.unsupported, []);
    assert.doesNotMatch(exported.ts, /sprites\.create\(/);
    assert.match(exported.ts, /scene\.setBackgroundColor\(1\)/);
});
