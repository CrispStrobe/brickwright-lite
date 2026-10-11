import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers, projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const PALETTE = ['#000000', '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
const unpack = value => '#' + [value & 255, (value >>> 8) & 255, (value >>> 16) & 255].map(b => b.toString(16).padStart(2, '0')).join('');
const frameColors = run => Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels, index => PALETTE[index]);
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(variable => [variable.name.replace(/^(?:Game_)+/, ''), variable.value]));
const DEPENDENCIES = {device: '*', sevenseg: '*'};
const NAMES = ['digitWidth', 'digitHeight', 'halfWidth', 'shown', 'counted', 'counterX', 'counterY', 'clipped', 'digitX'];

test('generated seven segment extension matches the pinned PXT source', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-sevenseg.mjs', '--check'], {stdio: 'pipe'});
});

// Authored fixture: every seven segment word, with deterministic values.
const SOURCE = `scene.setBackgroundColor(1)
let counter = sevenseg.createCounter(SegmentStyle.Medium, SegmentScale.Half, 2)
counter.setDigitColor(8)
counter.addDigit()
counter.count = 407
counter.x += -20
counter.y = 30
let digit = sevenseg.createDigit()
let digitWidth = digit.width
let digitHeight = digit.height
digit.setDigitColor(2)
digit.value = 13
digit.x = 30
let half = sevenseg.createDigit(SegmentStyle.Thin, 6)
half.setScale(SegmentScale.Half)
let halfWidth = half.width
half.setRadix(DigitRadix.Alpha)
half.setDigitAlpha(SegmentCharacter.Degree)
half.x += 50
half.y += 20
let sixteen = sevenseg.createDigit(SegmentStyle.Narrow, 0)
sixteen.setRadix(DigitRadix.Hex)
sixteen.value = 27
sixteen.setDigitColor(10)
sixteen.x = 140
let shown = digit.value * 100 + sixteen.value
counter.count = 5000
let counted = counter.count
let counterX = counter.x
let counterY = counter.y
let clipped = half.value
let digitX = digit.x
let done = true
done = true`;

test('seven segment digits and counters draw and report as the original', async () => {
    const original = await runPxtArcade(SOURCE, {waitForGlobals: {done: true}, inspectDisplay: true, dependencies: DEPENDENCIES});
    const expected = original.$display.screen.map(unpack);
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 20, storage: true, uploads: imported.costumes});
    try {
        await stepFrames(run.vm, 4);
        assert.deepEqual(run.errors, []);
        const actual = values(run);
        for (const name of NAMES) assert.equal(Number(actual[name]), original[name], name);
        assert.equal(original.shown, 311);
        assert.equal(original.counted, 407, 'an out-of-range count is ignored');
        const colors = frameColors(run);
        const differing = colors.reduce((list, color, i) => color !== expected[i] ? [...list, i] : list, []);
        assert.deepEqual(differing.slice(0, 10), [], `${differing.length} pixels differ`);
        for (const color of ['#ffffff', '#003fad', '#ff2121', '#8e2ec4']) assert.ok(colors.includes(color), `${color} is drawn`);
    } finally { clearStrayTimers(); }
});

test('seven segment programs are editable through Code and Blocks, SB3 and original export', async () => {
    const imported = arcadeToPseudocode(SOURCE);
    const run = await runProgram(imported.code, {frames: 20, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const opcodes = projectOpcodes(run.creator.project);
        for (const op of ['arcade_sevensegDigit', 'arcade_sevensegCounter', 'arcade_sevensegProperty', 'arcade_sevensegSetCharacter',
            'arcade_sevensegSetColor', 'arcade_sevensegSetRadix', 'arcade_sevensegSetScale', 'arcade_sevensegSetProperty',
            'arcade_sevensegAddDigit']) assert.ok(opcodes.has(op), op);
        const again = await runProgram(run.creator.decompile(), {frames: 20, storage: true, uploads: imported.costumes});
        assert.deepEqual(again.errors, []);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        assert.equal(JSON.parse(exported.files['pxt.json']).dependencies.sevenseg, '*');
        for (const call of ['sevenseg.createCounter(SegmentStyle.Medium, SegmentScale.Half, 2)', 'sevenseg.createDigit(SegmentStyle.Thick, 0)',
            '.setDigitAlpha(SegmentCharacter.Degree)', '.setRadix(DigitRadix.Hex)', '.setScale(SegmentScale.Half)', '.addDigit()'])
            assert.ok(exported.ts.includes(call), call);
        const reexported = await runPxtArcade(exported.files, {waitForGlobals: {done: true}});
        const original = await runPxtArcade(SOURCE, {waitForGlobals: {done: true}, dependencies: DEPENDENCIES});
        for (const name of NAMES) assert.equal(reexported[name], original[name], `${name} in the executed export`);
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        run.vm.greenFlag();
        await stepFrames(run.vm, 20);
        assert.deepEqual(run.errors, []);
        assert.equal(Number(values(run).shown), 311);
    } finally { clearStrayTimers(); }
});

test('seven segment diagnostics stay explicit', () => {
    for (const source of [
        'let s = SegmentStyle.Thin\nlet d = sevenseg.createDigit(s)',
        'let d = sevenseg.createDigit()\nlet c = SegmentCharacter.A\nd.setDigitAlpha(c)',
        'let c = sevenseg.createCounter()\nc.setRadix(DigitRadix.Hex)',
        'let d = sevenseg.createDigit()\nd.count = 4'])
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
});
