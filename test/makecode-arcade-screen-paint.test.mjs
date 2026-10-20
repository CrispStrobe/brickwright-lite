import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runTimedArcadeProgram} from './helpers/arcade-timed-native.mjs';
const Arcade = loadExtensionClass('arcade');

// The original display holds RGBA words; native frames hold palette indices.
const PALETTE = ['#000000', '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
const unpack = value => '#' + [value & 255, (value >>> 8) & 255, (value >>> 16) & 255].map(b => b.toString(16).padStart(2, '0')).join('');
const rgb = pixels => Array.from(pixels, index => PALETTE[index]);

test('generated image text runtime matches the pinned PXT sources', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-text.mjs', '--check'], {stdio: 'pipe'});
});

const PAINT = `let drawn = 0
scene.setBackgroundColor(9)
let hero = sprites.create(img\`
    2 2 2 2 2 2
    2 2 2 2 2 2
    2 2 2 2 2 2
    2 2 2 2 2 2
\`, SpriteKind.Player)
hero.setPosition(40, 30)
game.onPaint(function () {
    screen.fillRect(30, 20, 40, 30, 7)
    screen.print("paint", 4, 4, 1)
    screen.print("5x5", 4, 100, 2, image.font5)
})
game.onShade(function () {
    screen.fillRect(36, 26, 3, 3, 5)
    if (drawn < 3) drawn += 1
})`;

test('paint draws below sprites and shade above them, matching the original displayed screen', async () => {
    const imported = arcadeToPseudocode(PAINT);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade register paint as/);
    assert.match(imported.code, /arcade register shade as/);
    assert.match(imported.code, /arcade print \("paint"\) on image \(arcade screen image\) x \(4\) y \(4\) color \(1\) font auto/);
    assert.match(imported.code, /using font \(arcade font value font5\)/);
    const run = await runProgram(imported.code, {frames: 12, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        const frame = run.vm.runtime.bwArcadeDeviceState.sceneFrame;
        assert.ok(frame.coverage.includes('renderables'));
        const original = await runPxtArcade(PAINT + '\npause(200)', {inspectDisplay: true, waitForGlobals: {drawn: 3}});
        const expected = original.$display.screen.map(unpack);
        const actual = rgb(frame.pixels);
        const differing = actual.reduce((n, color, i) => n + (color !== expected[i]), 0);
        assert.equal(differing, 0, `${differing} of 19200 pixels differ from the original screen`);
    } finally { clearStrayTimers(); }
});

test('screen drawing outside paint and shade is never presented, as in the original', async () => {
    const source = `let drawn = false
screen.fillRect(10, 10, 50, 40, 4)
screen.print("hidden", 12, 12, 1)
drawn = true
pause(100)`;
    const original = await runPxtArcade(source, {inspectDisplay: true, waitForGlobals: {drawn: true}});
    assert.ok(original.$display.screen.every(value => unpack(value) === '#000000'), 'the original never presents the screen');
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const runtime = new EventEmitter(), drawables = [];
    runtime.startHats = () => [];
    runtime.renderer = {createDrawable() { drawables.push(1); return drawables.length; }, createSVGSkin() { return 1; }};
    const native = new Arcade(runtime);
    const screen = native.screenImage();
    native.drawImage({IMAGE: screen, OP: 'fillRect', X: 10, Y: 10, W: 50, H: 40, COLOR: 4});
    await native._inst._advance(1 / 30);
    assert.equal(drawables.length, 0, 'no overlay presents the raw screen');
});

const SCREEN_READ_SOURCE = `let done = false
let early = 0
let late = 0
let copied = 0
scene.setBackgroundColor(9)
let hero = sprites.create(img\`
    2 2 2
    2 2 2
\`, SpriteKind.Player)
hero.setPosition(40, 30)
screen.fillRect(10, 10, 5, 5, 4)
early = screen.getPixel(12, 12)
pause(200)
late = screen.getPixel(12, 12)
let snap = screen.clone()
copied = snap.getPixel(40, 30) * 100 + snap.getPixel(0, 0)
done = true
done = true`;

async function observeScreenReads(imported) {
    const run = await runTimedArcadeProgram(imported.code, {milliseconds: 199, storage: true, uploads: imported.costumes});
    try {
        const value = name => run.vm.runtime.targets.flatMap(target => Object.values(target.variables)).find(variable => variable.name === name)?.value;
        assert.equal(value('early'), 4);
        assert.equal(value('done'), false, 'the actual pause deadline has not elapsed');
        await run.clock.advanceTo(200);
        assert.equal(value('done'), true, 'read the frame only after the actual continuation finishes');
    } catch (error) {
        run.vm.stopAll(); run.vm.quit(); clearStrayTimers();
        throw error;
    }
    return run;
}

test('native screen reads wait for the actual pause continuation and observe composed pixels', async () => {
    const imported = arcadeToPseudocode(SCREEN_READ_SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await observeScreenReads(imported);
    try {
        const values = run.vm.runtime.targets.flatMap(target => Object.values(target.variables));
        assert.deepEqual(['early', 'late', 'copied'].map(name => values.find(value => value.name === name)?.value), [4, 9, 209]);
        assert.deepEqual(run.errors, []);
    } finally { run.vm.stopAll(); run.vm.quit(); clearStrayTimers(); }
});

test('screen reads return the last composed frame, as in the original', async () => {
    const source = SCREEN_READ_SOURCE;
    const original = await runPxtArcade(source, {waitForGlobals: {done: true}});
    assert.deepEqual([original.early, original.late, original.copied], [4, 9, 209]);
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await observeScreenReads(imported);
    try {
        assert.deepEqual(run.errors, []);
        const variables = run.vm.runtime.targets.flatMap(target => Object.values(target.variables));
        const value = name => variables.find(variable => variable.name === name)?.value;
        assert.deepEqual([value('early'), value('late'), value('copied')], [original.early, original.late, original.copied]);
    } finally { clearStrayTimers(); }
});

test('image text matches the original glyph pixels in every font', async () => {
    const source = `let done = false
let canvas = image.create(60, 40)
canvas.print("Ab1", 0, 0, 2)
canvas.print("Ab1", 0, 10, 3, image.font5)
canvas.print("Ab", 0, 20, 4, image.font12)
canvas.print("", 0, 0)
let pixels = ""
for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) pixels += canvas.getPixel(x, y)
done = true`;
    const original = await runPxtArcade(source, {waitForGlobals: {done: true}});
    const native = new Arcade(new EventEmitter());
    const canvas = native.createImage({WIDTH: 60, HEIGHT: 40});
    native.printImageText({IMAGE: canvas, TEXT: 'Ab1', X: 0, Y: 0, COLOR: 2, FONT: 'auto'});
    native.printImageText({IMAGE: canvas, TEXT: 'Ab1', X: 0, Y: 10, COLOR: 3, FONT: 'small'});
    native.printImageText({IMAGE: canvas, TEXT: 'Ab', X: 0, Y: 20, COLOR: 4, FONT: 'large'});
    native.printImageText({IMAGE: canvas, TEXT: '', X: 0, Y: 0, COLOR: 0, FONT: 'auto'});
    let pixels = '';
    for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) pixels += native.imagePixel({IMAGE: canvas, X: x, Y: y});
    assert.equal(pixels, original.pixels);
    assert.ok(/[234]/.test(pixels));
});

test('screen painting is editable through Code and Blocks, saved SB3 and original MakeCode export', async () => {
    const imported = arcadeToPseudocode(PAINT);
    const run = await runProgram(imported.code, {frames: 8, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const opcodes = run.creator.project.targets.flatMap(t => Object.values(t.blocks)).map(b => b.opcode);
        for (const op of ['arcade_registerPaintHandler', 'arcade_whenRegisteredPaint', 'arcade_registerShadeHandler',
            'arcade_whenRegisteredShade', 'arcade_screenImage', 'arcade_printImageText', 'arcade_fontValue', 'arcade_printImageFont']) assert.ok(opcodes.includes(op), op);
        const again = await runProgram(run.creator.decompile(), {frames: 8, storage: true, uploads: imported.costumes});
        assert.deepEqual(again.errors, []);
        assert.deepEqual(again.creator.warnings, []);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (t, c) => run.creator.assets.get(c.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        for (const call of ['game.onPaint(', 'game.onShade(', 'screen.fillRect(', 'screen.print("paint", 4, 4, 1)',
            'screen.print("5x5", 4, 100, 2, image.font5)']) assert.ok(exported.ts.includes(call), call);
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        const original = await runPxtArcade(exported.ts + '\npause(200)', {inspectDisplay: true, waitForGlobals: {drawn: 3}});
        const direct = await runPxtArcade(PAINT + '\npause(200)', {inspectDisplay: true, waitForGlobals: {drawn: 3}});
        assert.deepEqual(original.$display.screen, direct.$display.screen, 'the export draws what the source draws');
        await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        run.vm.greenFlag();
        await stepFrames(run.vm, 8);
        assert.deepEqual(run.errors, []);
    } finally { clearStrayTimers(); }
});

test('font and screen diagnostics stay explicit', () => {
    for (const source of ['screen.print("a", 1)', 'screen.print("a", 1, 2, 3, myFont)', 'let screen = image.create(4, 4)\nscreen.print("a", 1, 2)'])
        assert.ok(arcadeToPseudocode(source).unsupported.length || !/arcade screen image/.test(arcadeToPseudocode(source).code), source);
    const native = new Arcade(new EventEmitter());
    const errors = [];
    native._inst._runtime = Object.assign(new EventEmitter(), {startHats: () => []});
    native._inst._runtime.on('BLOCKS_ERROR', message => errors.push(message));
    native.printImageText({IMAGE: native.createImage({WIDTH: 4, HEIGHT: 4}), TEXT: 'a', X: 0, Y: 0, COLOR: 1, FONT: 'gothic'});
    assert.equal(errors.length, 1);
});


test('native paint and shade retain nested Font values through source Code and saved reload',async()=>{
 const imported=arcadeToPseudocode(PAINT);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/using font \(arcade font value font5\)/);
 const runs=[];let pixels;
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const frame=run.vm.runtime.bwArcadeDeviceState.sceneFrame;assert.ok(frame.coverage.includes('renderables'));const actual=[...frame.pixels];assert.equal(actual.length,19200);assert.equal(actual[20*160+30],7);assert.equal(actual[30*160+40],2);assert.equal(actual[26*160+36],5);if(pixels)assert.deepEqual(actual,pixels);else pixels=actual;};
 try {
  const execute=async input=>{assert.deepEqual(input.unsupported,[]);const run=await runProgram(input.code,{frames:8,storage:true,uploads:input.costumes});runs.push(run);check(run);return run;};
  const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);await execute(arcadeToPseudocode(exported.files));
  await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,8);check(run);
 } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}}
});
