import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const dispatch = (await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
const source = readFileSync(new URL('./fixtures/arcade/image-circle-pixels.ts', import.meta.url), 'utf8');
const oracle = JSON.parse(readFileSync(new URL('./fixtures/arcade/image-circle-pixels.json', import.meta.url), 'utf8'));
const names = [...oracle.cases.map(entry => entry.name), ...Object.keys(oracle.aliases)];
const expected = Object.fromEntries([
    ...oracle.cases.map(({name, width, height, pixels}) => [name, {width, height, pixels}]),
    ...Object.entries(oracle.aliases)
]);
const evidence = (name, value) => {
    if (!process.env.ARCADE_CIRCLE_ROUNDTRIP_EVIDENCE) return;
    mkdirSync(process.env.ARCADE_CIRCLE_ROUNDTRIP_EVIDENCE, {recursive: true});
    writeFileSync(path.join(process.env.ARCADE_CIRCLE_ROUNDTRIP_EVIDENCE, name), JSON.stringify(value,
        (_key, item) => item === undefined ? {evidenceUndefined: true} : item, 2));
};
const exportRun = run => projectToArcade(run.creator.project, {
    costumeSvg: (_target, costume) => run.creator.assets.get(costume.assetId)?.data
});
const nativeInstances = new WeakMap();
const inspect = run => {
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.creator.warnings, []);
    let extension = nativeInstances.get(run.vm);
    if (!extension) {
        extension = dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]?._inst;
        nativeInstances.set(run.vm, extension);
    }
    assert.ok(extension && extension._runtime === run.vm.runtime, 'observe this VM, not the last global extension');
    const variables = Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
        .map(variable => [variable.name, variable.value]));
    assert.equal(variables.circleReady, 1);
    assert.equal(variables.circleAliasSame, true);
    assert.equal(variables.circleCloneDifferent, true);
    for (const name of names) {
        const image = extension._image(variables[name]);
        assert.ok(image, name + ' remains a live owned Image');
        assert.deepEqual({width: image.width, height: image.height, pixels: [...image.pixels]}, expected[name], name);
    }
};

test('complete circle pixels and Image aliases survive Code, saved projects and executed MakeCode export', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const runs = [];
    try {
        const run = await runProgram(imported.code, {frames: 80, uploads: imported.costumes, storage: true});
        runs.push(run);inspect(run);
        const code = run.creator.decompile();
        const recreated = await runProgram(code, {frames: 80, uploads: imported.costumes, storage: true});
        runs.push(recreated);inspect(recreated);
        const saved = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm, 80);inspect(run);
        await recreated.vm.loadProject(saved);recreated.vm.greenFlag();await stepFrames(recreated.vm, 80);inspect(recreated);
        const output = exportRun(run);
        assert.deepEqual(output.unsupported, []);
        evidence('export.json', output);
        const original = await runPxtArcade(output.ts, {
            fakeClock: true, waitForGlobals: {circleReady: 1}, inspectImageGlobals: names,
            onCompilation: packet => evidence('compilation.json', packet)
        });
        evidence('observations.json', original);
        assert.equal(original.circleAliasSame, true);
        assert.equal(original.circleCloneDifferent, true);
        assert.deepEqual(original.$images, expected);
        const returned = arcadeToPseudocode(output.ts);
        assert.deepEqual(returned.unsupported, []);
        const rerun = await runProgram(returned.code, {frames: 80, uploads: returned.costumes, storage: true});
        runs.push(rerun);inspect(rerun);
    } finally {
        for (const run of runs) run.vm.quit();
    }
});
