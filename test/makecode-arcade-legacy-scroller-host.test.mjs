import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require = createRequire(import.meta.url);
const dir = '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/';
const initializeOriginal = require(dir + 'legacy-scroller-pxt.js');
const original = readFileSync(new URL(dir + 'legacy-scroller-source/main.ts', import.meta.url), 'utf8');
const originalFiles = source => ({'main.ts': source, 'legacy-scroller.ts': original,
    'pxt.json': JSON.stringify({name: 'owned-legacy-scroller-control', dependencies: {device: '*'},
        files: ['legacy-scroller.ts', 'main.ts']})});
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const entries = trace => String(trace).split(';').filter(Boolean).map(entry => entry.split(','));
const palette = ['#000000', '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
const color = v => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map(b => b.toString(16).padStart(2, '0')).join('');
async function nativeWithLegacyHost(source) {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 0, uploads: imported.costumes, storage: true});
    const {default: dispatch} = await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js');
    const adapter = Object.values(dispatch.services).findLast(s => s?._inst && s.getInfo?.().id === 'arcade');
    assert.ok(adapter?._inst, 'actual VM extension instance exists');
    const ext = adapter._inst;
    const before = {updates: ext._updateHandlers.length, pushes: ext._scenePushHandlers.length,
        pops: ext._scenePopHandlers.length, renderables: ext._renderablesOf().length};
    // Select through the actual native opcode before any lazy library operation.
    adapter.setBackgroundScrollVersion({VERSION:initializeOriginal.sourceIdentity.revision});
    assert.equal(ext._scrollerVersion,initializeOriginal.sourceIdentity.revision);
    ext._scroller();
    assert.deepEqual({updates: ext._updateHandlers.length, pushes: ext._scenePushHandlers.length,
        pops: ext._scenePopHandlers.length, renderables: ext._renderablesOf().length}, before,
    'factory construction does not run the lazy original initializer');
    return {...run, ext};
}

test('complete legacy source, package and MIT notice are pinned and generator is reproducible', () => {
    assert.equal(createHash('sha256').update(original).digest('hex'), initializeOriginal.sourceIdentity.sourceSha256);
    execFileSync(process.execPath, ['scripts/generate-arcade-legacy-scroller.mjs', '--check'], {stdio: 'pipe'});
});

const setup = `let back = image.create(160, 120)
for (let i = 0; i < 16; i++) back.fillRect(i * 10, 0, 5, 120, i % 15 + 1)
back.fillRect(0, 50, 160, 7, 2)
scene.setBackgroundImage(back)
let hero = sprites.create(img\`5 5 5\n5 5 5\`, SpriteKind.Player)
hero.setPosition(80, 60)`;
function recording(start, stop) {return `${setup}
let trace = ""
let frame = 0
let traceDone = false
game.onUpdate(function () {
    if (frame == 0) { ${start} }
    if (frame == 8) { ${stop} }
    if (frame < 12) {
        trace = trace + scroller.getBackgroundXOffset() + "," + scroller.getBackgroundYOffset() + "," + control.eventContext().deltaTime + ";"
        frame += 1
    } else traceDone = true
})`;}
const scenarios = {
    speed: recording('scroller.scrollBackgroundWithSpeed(-37,12)', 'scroller.scrollBackgroundWithSpeed(0,0)'),
    camera: recording('scene.cameraFollowSprite(hero); hero.vx=50; hero.vy=0; scroller.scrollBackgroundWithCamera(scroller.CameraScrollMode.BothDirections); scroller.setCameraScrollingMultipliers(1,1)', 'hero.vx=0; hero.vy=0')
};
for (const [name, source] of Object.entries(scenarios)) {
    test(`legacy ${name} callbacks follow actual original offsets and full screen before camera update`, async () => {
        const expected = await runPxtArcade(originalFiles(source), {waitForGlobals: {traceDone: true},
            fakeClock: true, inspectDisplay: true});
        const trace = entries(expected.trace);
        const run = await nativeWithLegacyHost(source);
        try {
            for (let guard = 0; Number(values(run).frame) < 1; guard++) {
                assert.ok(guard < 100, 'native recording begins');
                await stepFrames(run.vm, 1, Number(trace[0].at(-1)) * 1000);
            }
            for (let i = 1; i < trace.length; i++) await stepFrames(run.vm, 1, Number(trace[i].at(-1)) * 1000);
            assert.deepEqual(entries(values(run).trace), trace, 'all actual API offsets and delta times agree');
            const screen = expected.$display.screen.map(color);
            const native = Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels, n => palette[n]);
            assert.deepEqual(native, screen, 'all 19200 actual display pixels agree');
            assert.deepEqual(run.errors, []);
            assert.equal(run.ext._scenePushHandlers.length, 1);
            assert.equal(run.ext._scenePopHandlers.length, 1);
        } finally {run.vm.quit(); clearStrayTimers();}
    });
}

test('all six legacy APIs preserve raw offsets, defaults, and real scene push/pop state', async () => {
    const source = `let zeroX=scroller.getBackgroundXOffset()
let zeroY=scroller.getBackgroundYOffset()
scroller.scrollBackgroundWithSpeed(3,-2)
scroller.scrollBackgroundWithCamera(scroller.CameraScrollMode.OnlyHorizontal)
scroller.setCameraScrollingMultipliers()
scroller.setBackgroundScrollOffset(17,-9)
let rawX=scroller.getBackgroundXOffset()
let rawY=scroller.getBackgroundYOffset()
pause(40)
game.pushScene()
let pushedX=scroller.getBackgroundXOffset()
let pushedY=scroller.getBackgroundYOffset()
scroller.setBackgroundScrollOffset(5,2)
pause(40)
game.popScene()
let restoredX=scroller.getBackgroundXOffset()
let restoredY=scroller.getBackgroundYOffset()
let done=true`;
    const expected = await runPxtArcade(originalFiles(source), {fakeClock: true});
    const run = await nativeWithLegacyHost(source);
    try {
        for (let guard = 0; values(run).done !== true; guard++) {
            assert.ok(guard < 100, 'scene callbacks complete');
            await stepFrames(run.vm, 1, 20);
        }
        const actual = values(run);
        for (const key of ['zeroX','zeroY','rawX','rawY','pushedX','pushedY','restoredX','restoredY']) {
            assert.equal(actual[key], expected[key], key);
        }
        assert.equal(run.ext._scenePushHandlers.length, 1);
        assert.equal(run.ext._scenePopHandlers.length, 1);
        assert.equal(run.ext._sceneStack.length, 0);
        assert.deepEqual(run.errors, []);
        for (const opcode of ['scrollBackgroundWithSpeed','scrollBackgroundWithCamera','setBackgroundScrollMultipliers',
            'setBackgroundScrollOffset','backgroundScrollOffset']) {
            assert.ok(run.loadedOpcodes.has('arcade_' + opcode), 'actual native word API ' + opcode);
        }
    } finally {run.vm.quit(); clearStrayTimers();}
});
