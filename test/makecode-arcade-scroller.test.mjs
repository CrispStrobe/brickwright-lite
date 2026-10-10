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
// The tutorials name it untagged; the vendored pin answers that spelling.
const DEPENDENCIES = {device: '*', 'arcade-background-scroll': 'github:microsoft/arcade-background-scroll'};
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const entries = trace => String(trace).split(';').filter(Boolean).map(entry => entry.split(','));

test('generated scroller matches the vendored arcade-background-scroll source', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-scroller.mjs', '--check'], {stdio: 'pipe'});
});

// Authored fixtures: a striped background, a transparent parallax layer and a
// moving camera; scrolling starts in the first recorded update and stops on
// the last frames, so the screen is still when the original's is read.
const SETUP = `let back = image.create(160, 120)
for (let i = 0; i < 16; i++) {
    back.fillRect(i * 10, 0, 5, 120, i % 15 + 1)
}
back.fillRect(0, 50, 160, 7, 2)
scene.setBackgroundImage(back)
let hills = image.create(40, 30)
hills.fillRect(0, 20, 40, 10, 7)
hills.fillRect(10, 10, 20, 10, 6)
let hero = sprites.create(img\`
    5 5 5
    5 5 5
\`, SpriteKind.Player)
hero.setPosition(80, 60)`;
const record = (start, stop, frames, extra = '') => `${SETUP}
let trace = ""
let frame = 0
let traceDone = false
game.onUpdate(function () {
    if (frame == 0) {
        ${start.split('\n').join('\n        ')}
    }
    if (frame == ${frames - 4}) {
        ${stop.split('\n').join('\n        ')}
    }
    if (frame < ${frames}) {
        trace = trace + scroller.getBackgroundXOffset() + "," + scroller.getBackgroundYOffset() + "," + scroller.getBackgroundXOffset(scroller.BackgroundLayer.Layer1) + ","${extra} + control.eventContext().deltaTime + ";"
        frame += 1
    } else {
        traceDone = true
    }
})`;
const SCENARIOS = {
    speed: record('scroller.scrollBackgroundWithSpeed(-37, 12)\nscroller.setLayerImage(scroller.BackgroundLayer.Layer1, hills)\nscroller.scrollBackgroundWithSpeed(25, 0, scroller.BackgroundLayer.Layer1)',
        'scroller.scrollBackgroundWithSpeed(0, 0)\nscroller.scrollBackgroundWithSpeed(0, 0, 1)', 30),
    camera: record('scroller.scrollBackgroundWithCamera(scroller.CameraScrollMode.BothDirections)\nscroller.setLayerImage(1, hills)\nscroller.setCameraScrollingMultipliers(0.5, 0.25, 1)\nscroller.setLayerZIndex(1, 10)\nhero.vx = 45\nhero.vy = -20\nscene.cameraFollowSprite(hero)',
        'hero.vx = 0\nhero.vy = 0', 30, ' + scene.cameraProperty(CameraProperty.X) + ","'),
    // Without a camera read in the update, nothing refreshes the camera before
    // the scroller's pre-render handler, so its ordering after the camera shows.
    followed: record('scroller.scrollBackgroundWithCamera(scroller.CameraScrollMode.BothDirections)\nhero.vx = 50\nhero.vy = 30\nscene.cameraFollowSprite(hero)',
        'hero.vx = 0\nhero.vy = 0', 24),
    offset: record('scroller.setBackgroundScrollOffset(13, 7)\nscroller.setLayerImage(scroller._backgroundLayer(scroller.BackgroundLayer.Layer1), hills)\nscroller.setBackgroundScrollOffset(5, 3, 1)\nscroller.scrollBackgroundWithCamera(scroller.CameraScrollMode.OnlyVertical, 1)',
        'scroller.setBackgroundScrollOffset(50, 60)', 12),
};

for (const [name, source] of Object.entries(SCENARIOS)) {
    test(`background scrolling follows the original frame by frame and draws its screen: ${name}`, async () => {
        const original = await runPxtArcade(source, {waitForGlobals: {traceDone: true}, fakeClock: true, dependencies: DEPENDENCIES, inspectDisplay: true});
        const expected = entries(original.trace);
        const imported = arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported, []);
        const run = await runProgram(imported.code, {frames: 0, uploads: imported.costumes, storage: true});
        try {
            const first = Number(expected[0].at(-1)) * 1000;
            for (let guard = 0; Number(values(run).frame) < 1; guard++) {
                assert.ok(guard < 200, 'the native recording started');
                await stepFrames(run.vm, 1, first);
            }
            for (let i = 1; i < expected.length; i++) await stepFrames(run.vm, 1, Number(expected[i].at(-1)) * 1000);
            assert.deepEqual(run.errors, []);
            const actual = entries(values(run).trace);
            assert.deepEqual(actual.map(entry => entry.slice(0, -1)), expected.map(entry => entry.slice(0, -1)));
            const screen = original.$display.screen.map(unpack);
            const frame = Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels, index => PALETTE[index]);
            const differing = frame.reduce((list, color, i) => color !== screen[i] ? [...list, i] : list, []);
            assert.deepEqual(differing.slice(0, 10), [], `${differing.length} pixels differ`);
        } finally { clearStrayTimers(); }
    });
}

const ROUND_TRIP = `${SETUP}
scroller.scrollBackgroundWithSpeed(-20, 5)
scroller.scrollBackgroundWithCamera(scroller.CameraScrollMode.OnlyHorizontal, scroller.BackgroundLayer.Layer2)
scroller.setCameraScrollingMultipliers(2, 1, 2)
scroller.setBackgroundScrollOffset(3, 4, 1)
scroller.setLayerImage(scroller.BackgroundLayer.Layer1, hills)
scroller.setLayerZIndex(1, -500)
let offset = scroller.getBackgroundXOffset(1) * 10 + scroller.getBackgroundYOffset(1)
let done = true
done = true`;

test('scroller programs are editable through Code and Blocks, SB3 and original export', async () => {
    const imported = arcadeToPseudocode(ROUND_TRIP);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 10, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const opcodes = projectOpcodes(run.creator.project);
        for (const op of ['arcade_scrollBackgroundWithSpeed', 'arcade_scrollBackgroundWithCamera', 'arcade_setBackgroundScrollMultipliers',
            'arcade_setBackgroundScrollOffset', 'arcade_setBackgroundLayerImage', 'arcade_setBackgroundLayerZ', 'arcade_backgroundScrollOffset'])
            assert.ok(opcodes.has(op), op);
        assert.equal(Number(values(run).offset), 34);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-background-scroll'], 'github:microsoft/arcade-background-scroll#v0.1.2');
        for (const call of ['scroller.scrollBackgroundWithSpeed(-20, 5, 0)', 'scroller.scrollBackgroundWithCamera(scroller.CameraScrollMode.OnlyHorizontal, 2)',
            'scroller.setCameraScrollingMultipliers(2, 1, 2)', 'scroller.setBackgroundScrollOffset(3, 4, 1)', 'scroller.setLayerZIndex(1, -500)'])
            assert.ok(exported.ts.includes(call), call);
        const executed = await runPxtArcade(exported.files, {waitForGlobals: {done: true}});
        assert.equal(executed.offset, 34);
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        run.vm.greenFlag();
        await stepFrames(run.vm, 10);
        assert.deepEqual(run.errors, []);
        assert.equal(Number(values(run).offset), 34);
    } finally { clearStrayTimers(); }
});

test('scroller diagnostics stay explicit', () => {
    for (const source of ['let m = scroller.CameraScrollMode.OnlyVertical\nscroller.scrollBackgroundWithCamera(m)',
        'scroller.scrollBackgroundWithSpeed(1)', 'scroller.setLayerImage(1)'])
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
});
