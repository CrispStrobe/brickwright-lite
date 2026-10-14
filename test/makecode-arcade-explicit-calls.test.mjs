import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {explicitCallSource} from './fixtures/arcade-explicit-call-game.mjs';

test('ordinary source calls retain the real labels and definitions on their caller', () => {
    const imported = arcadeToPseudocode(explicitCallSource);
    assert.deepEqual(imported.unsupported, []);
    assert.equal(imported.code.match(/^\s*CALL show$/gm).length, 2);
    assert.match(imported.code, /^\s*CALL draw /m);
    const creator = new Creator(); creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    const target = creator.project.targets.find(t => t.name === 'Game');
    const calls = Object.values(target.blocks).filter(b => b.opcode === 'procedures_call');
    assert.deepEqual(calls.map(b => b.mutation.proccode), ['show', 'draw %s %s', 'show']);
    assert.equal(Object.values(target.blocks).filter(b => b.opcode === 'procedures_definition').length, 2);
    assert.equal(Object.values(target.blocks).filter(b => b.opcode === 'looks_show').length, 0);
    const restored = new Creator(); restored.parse(creator.decompile());
    assert.equal(restored.decompile(), creator.decompile());
});

const globals = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const compilationObserver = label => receipt => {
    if (!process.env.BW_EXPLICIT_CALL_EVIDENCE_DIR) return;
    const dir = process.env.BW_EXPLICIT_CALL_EVIDENCE_DIR; fs.mkdirSync(dir, {recursive:true});
    fs.writeFileSync(path.join(dir, label + '-compilation.json'), JSON.stringify(receipt));
    fs.writeFileSync(path.join(dir, label + '-binary.js'), receipt.built.outfiles?.['binary.js'] || '');
};
async function execute(imported, runs) {
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames:0, storage:true, uploads:imported.costumes || []}); runs.push(run);
    await stepFrames(run.vm, 150, 0); assert.deepEqual(run.errors, []); return run;
}
function check(run, original, label) {
    const state = globals(run);
    assert.equal(BW.decode(state.calls), 12, label + ' calls');
    assert.equal(BW.decode(state.proof), original.proof, label + ' original proof');
    const expected = original.$images.captured, ref = state.captured;
    assert.equal(expected.pixels.length, 19200);
    const actual = Array.from({length:19200}, (_, i) => run.vm.runtime._primitives.arcade_imagePixel(
        {IMAGE:ref, X:i % expected.width, Y:Math.floor(i / expected.width)}, {}));
    assert.deepEqual(actual, expected.pixels, label + ' all background pixels');
}
test('colliding source rendering calls execute through Code, saved SB3, original export and reimport', async () => {
    const original = await runPxtArcade(explicitCallSource, {inspectImageGlobals:['captured'],
        onCompilation:compilationObserver('source')});
    assert.equal(original.calls, 12); assert.equal(original.proof, 12);
    const runs = [];
    try {
        const imported = arcadeToPseudocode(explicitCallSource), run = await execute(imported, runs);
        check(run, original, 'native');
        check(await execute({...imported, code:run.creator.decompile()}, runs), original, 'Code');
        const exported = projectToArcade(run.creator.project, {costumeSvg:(target,costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        const exportedOriginal = await runPxtArcade(exported.files, {inspectImageGlobals:['captured'],
            onCompilation:compilationObserver('export')});
        assert.equal(exportedOriginal.calls, original.calls); assert.equal(exportedOriginal.proof, original.proof);
        assert.deepEqual(exportedOriginal.$images, original.$images);
        check(await execute(arcadeToPseudocode(exported.files), runs), original, 'reimport');
        const bytes = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll(); await run.vm.loadProject(bytes); run.vm.greenFlag(); await stepFrames(run.vm, 150, 0);
        check(run, original, 'same SB3');
        const fresh = await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide', {frames:0,storage:true}); runs.push(fresh);
        fresh.vm.stopAll(); await fresh.vm.loadProject(bytes); fresh.vm.greenFlag(); await stepFrames(fresh.vm, 150, 0);
        check(fresh, original, 'fresh SB3');
        if (process.env.BW_EXPLICIT_CALL_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.BW_EXPLICIT_CALL_EVIDENCE_DIR,
            'authoring-result.json'), JSON.stringify({original,exportedOriginal,exportedFiles:exported.files}));
    } finally {for (const run of runs) {run.vm.stopAll(); run.vm.quit();} clearStrayTimers();}
});
