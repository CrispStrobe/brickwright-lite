import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {dialogOriginalSource} from './fixtures/arcade-sdk-dialog-game.mjs';

const names = ['sameImage','replaced','width','height','resizedWidth','resizedHeight','oldWidth','oldHeight','textColor','cursorCount'];
function globals(run) {
    return Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
        .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));
}
function check(run, original, label) {
    const state = globals(run);
    for (const name of names) assert.equal(BW.decode(state[name] ?? state[name + '_']), original[name], label + ' ' + name);
    // These are readonly assertions on the real native image API; execution
    // and image mutation above occur through actual converted source blocks.
    for (const name of ['initial', 'resized']) {
        const ref = state[name] ?? state[name + '_'], expected = original.$images[name];
        assert.equal(run.vm.runtime._primitives.arcade_imageProperty({IMAGE:ref, PROPERTY:'width'}, {}), expected.width);
        assert.equal(run.vm.runtime._primitives.arcade_imageProperty({IMAGE:ref, PROPERTY:'height'}, {}), expected.height);
        const actual = Array.from({length:expected.width * expected.height}, (_, i) =>
            run.vm.runtime._primitives.arcade_imagePixel({IMAGE:ref, X:i % expected.width, Y:Math.floor(i / expected.width)}, {}));
        assert.deepEqual(actual, expected.pixels, label + ' full live image ' + name);
    }
}
async function execute(imported, runs) {
    assert.deepEqual(imported.unsupported, []); assert.deepEqual(imported.warnings, []);
    const run = await runProgram(imported.code, {frames:0, storage:true, uploads:imported.costumes || []}); runs.push(run);
    assert.deepEqual(run.creator.warnings, []);
    await stepFrames(run.vm, 150, 0); assert.deepEqual(run.errors, []); return run;
}

test('real SDK SplashDialog retains fields, image identity/pixels, resize and all authoring routes', async () => {
    const original = await runPxtArcade(dialogOriginalSource, {inspectImageGlobals:['initial','resized']});
    const runs = [];
    try {
        const imported = arcadeToPseudocode(dialogOriginalSource), run = await execute(imported, runs);
        check(run, original, 'native');
        check(await execute({...imported, code:run.creator.decompile()}, runs), original, 'Code');
        const exported = projectToArcade(run.creator.project, {costumeSvg:(target,costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []); assert.match(exported.ts, /new game\.SplashDialog/);
        const exportedOriginal = await runPxtArcade(exported.files, {inspectImageGlobals:['initial','resized']});
        for (const name of names) assert.equal(exportedOriginal[name], original[name], 'original export ' + name);
        assert.deepEqual(exportedOriginal.$images, original.$images, 'original export full images');
        check(await execute(arcadeToPseudocode(exported.files), runs), original, 'reimport');
        const bytes = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(bytes); run.vm.greenFlag(); await stepFrames(run.vm,150,0);
        assert.deepEqual(run.errors, []); check(run, original, 'same VM SB3');
        const fresh = await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide', {frames:0,storage:true}); runs.push(fresh);
        fresh.vm.stopAll(); await fresh.vm.loadProject(bytes); fresh.vm.greenFlag(); await stepFrames(fresh.vm,150,0);
        assert.deepEqual(fresh.errors, []); check(fresh, original, 'fresh VM SB3');
    } finally {for (const run of runs) run.vm.quit(); clearStrayTimers();}
});
