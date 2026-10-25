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

test('an edited standard radius input is what Code, saved projects and MakeCode export draw', async () => {
    const imported = arcadeToPseudocode('let canvas=image.create(9,9);canvas.fill(3);canvas.drawCircle(4,4,2,7)');
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 12, storage: true});
    const extension = dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]?._inst;
    assert.ok(extension && extension._runtime === run.vm.runtime);
    const actual = () => {
        const variable = run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
            .find(value => value.name === 'canvas');
        const image = extension._image(variable.value);
        return {width: image.width, height: image.height, pixels: [...image.pixels]};
    };
    try {
        assert.deepEqual(actual(), expected.circle6, 'initial radius two');
        const commands = run.creator.project.targets.flatMap(target => Object.values(target.blocks))
            .filter(block => block.opcode === 'arcade_drawImageCircle');
        assert.equal(commands.length, 1);
        assert.equal(commands[0].fields.OP[0], 'drawCircle');
        assert.ok(commands[0].inputs.RADIUS);
        commands[0].inputs.RADIUS = [1, [4, '3']];
        assert.match(run.creator.decompile(), /radius 3 color 7/);
        const output = exportRun(run);
        assert.deepEqual(output.unsupported, []);
        assert.match(output.ts, /\.drawCircle\(4, 4, 3, 7\)/);
        const saved = Buffer.from(await (await run.creator.generateSB3()).arrayBuffer());
        await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm, 12);
        assert.deepEqual(actual(), expected.circle8, 'saved radius three matches the selected complete original pixels');
        const returned = arcadeToPseudocode(output.ts);
        assert.deepEqual(returned.unsupported, []);
        const rerun = await runProgram(returned.code, {frames: 12, uploads: returned.costumes, storage: true});
        try {
            const native = dispatch.services[rerun.vm.extensionManager._loadedExtensions.get('arcade')]?._inst;
            assert.ok(native && native._runtime === rerun.vm.runtime);
            const variable = rerun.vm.runtime.targets.flatMap(target => Object.values(target.variables))
                .find(value => value.name === 'canvas');
            const image = native._image(variable.value);
            assert.deepEqual({width: image.width, height: image.height, pixels: [...image.pixels]}, expected.circle8);
        } finally { rerun.vm.quit(); }
    } finally { run.vm.quit(); }
});

test('typed Sprite circle commands mutate shared Image pixels and every live collision mask', async () => {
    const source = `let canvas=image.create(9,9)
canvas.fill(3)
let hero=sprites.create(canvas,SpriteKind.Player)
let other=sprites.create(canvas,SpriteKind.Enemy)
function paint(actor:Sprite){actor.image.drawCircle(4,4,3,7);actor.image.fillCircle(4,4,1,0)}
paint(hero)
let actorImage=hero.image
let otherImage=other.image
let shared=canvas===actorImage && actorImage===otherImage`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade draw circle drawCircle of/);
    assert.match(imported.code, /arcade draw circle fillCircle of/);
    const pixels = [...expected.circle8.pixels];
    const fill = oracle.cases.find(entry => entry.method === 'fillCircle' &&
        JSON.stringify(entry.args) === JSON.stringify(['4', '4', '1', '7']));
    assert.ok(fill, 'independent original radius-one fill footprint');
    fill.pixels.forEach((value, index) => { if (value === 7) pixels[index] = 0; });
    const runs = [];
    try {
        const run = await runProgram(imported.code, {frames: 20, uploads: imported.costumes, storage: true});
        runs.push(run);
        const check = current => {
            assert.deepEqual(current.errors, []);assert.deepEqual(current.creator.warnings, []);
            const variables = Object.fromEntries(current.vm.runtime.targets.flatMap(target => Object.values(target.variables))
                .map(value => [value.name, value.value]));
            assert.equal(variables.shared, true);
            const sprites = Object.values(current.vm.runtime.bwArcadeDeviceState.sprites).filter(sprite => sprite.id);
            assert.equal(sprites.length, 2);
            assert.equal(sprites[0].image, sprites[1].image);
            for (const sprite of sprites) {
                assert.deepEqual([...sprite.image.pixels], pixels);
                assert.deepEqual([...sprite.mask], pixels.map(color => color ? 1 : 0));
            }
        };
        check(run);
        const codeRun = await runProgram(run.creator.decompile(), {frames: 20, uploads: imported.costumes, storage: true});
        runs.push(codeRun);check(codeRun);
        const output = exportRun(run);assert.deepEqual(output.unsupported, []);
        assert.match(output.ts, /\.image\.drawCircle\(/);assert.match(output.ts, /\.image\.fillCircle\(/);
        evidence('sprite-export.json', output);
        const original = await runPxtArcade(output.ts, {
            fakeClock: true, waitForGlobals: {shared: true}, inspectImageGlobals: ['canvas', 'actorImage', 'otherImage'],
            onCompilation: packet => evidence('sprite-compilation.json', packet)
        });
        evidence('sprite-observations.json', original);
        assert.equal(original.shared, true);
        for (const name of ['canvas', 'actorImage', 'otherImage']) {
            assert.deepEqual(original.$images[name], {width: 9, height: 9, pixels}, name);
        }
        const returned = arcadeToPseudocode(output.ts);assert.deepEqual(returned.unsupported, []);
        const again = await runProgram(returned.code, {frames: 20, uploads: returned.costumes, storage: true});
        runs.push(again);check(again);
    } finally { for (const run of runs) run.vm.quit(); }
});
