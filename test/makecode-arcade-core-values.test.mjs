import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers, projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const valueOf = (run, name) => run.vm.runtime.targets.flatMap(target => Object.values(target.variables)).find(variable => variable.name === name)?.value;

test('generated base helpers match the pinned PXT sources', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-helpers.mjs', '--check'], {stdio: 'pipe'});
});

// PXT's parseInt is its own code: whitespace, signs, 0x prefixes, radixes and NaN.
const PARSE = `let done = false
let plain = parseInt("42") + parseInt("ff", 16)
let hexed = parseInt(" -0x1F")
let partial = parseInt("12.9px")
let binary = parseInt("1011", 2)
let badRadix = parseInt("10", 40)
let bad = parseInt("abc")
done = true
done = true`;

test('parseInt matches the original runtime', async () => {
    const original = await runPxtArcade(PARSE, {waitForGlobals: {done: true}});
    const imported = arcadeToPseudocode(PARSE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 4, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        for (const name of ['plain', 'hexed', 'partial', 'binary'])
            assert.equal(Number(valueOf(run, name)), original[name], name);
        assert.ok(Number.isNaN(Number(valueOf(run, 'badRadix'))) && Number.isNaN(Number(valueOf(run, 'bad'))));
    } finally { clearStrayTimers(); }
});

const DELTA = `let total = 0
let frames = 0
game.onUpdate(function () {
    total += game.eventContext().deltaTime
    frames += 1
})`;

test('game.eventContext().deltaTime is the frame time in seconds', async () => {
    const imported = arcadeToPseudocode(DELTA);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 31, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        const frames = Number(valueOf(run, 'frames')), total = Number(valueOf(run, 'total'));
        assert.ok(frames > 20);
        assert.ok(Math.abs(total - frames / 30) < 1e-9, `${total} for ${frames} frames`);
    } finally { clearStrayTimers(); }
});

test('core values are editable through Code and Blocks and export to the original calls', async () => {
    const source = `${DELTA}\nlet n = parseInt("7") + parseInt("10", 8)`;
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 4, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const opcodes = projectOpcodes(run.creator.project);
        for (const op of ['arcade_parseInteger', 'arcade_parseIntegerRadix', 'arcade_frameDeltaTime']) assert.ok(opcodes.has(op), op);
        const again = await runProgram(run.creator.decompile(), {frames: 4, storage: true, uploads: imported.costumes});
        assert.deepEqual(again.errors, []);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        for (const call of ['game.eventContext().deltaTime', 'parseInt("7")', 'parseInt("10", 8)']) assert.ok(exported.ts.includes(call), call + '\n' + exported.ts);
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        await runPxtArcade(exported.files); // the original compiles and runs the export
        await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        run.vm.greenFlag();
        await stepFrames(run.vm, 4);
        assert.deepEqual(run.errors, []);
    } finally { clearStrayTimers(); }
});

test('parseInt diagnostics stay explicit', () => {
    assert.ok(arcadeToPseudocode('let n = parseInt("1", 2, 3)').unsupported.length);
    assert.ok(!/arcade parse integer/.test(arcadeToPseudocode('function parseInt(s: string) { return 1 }\nlet n = parseInt("1")').code));
});
