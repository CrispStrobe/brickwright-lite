import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers, projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {EXTENSION_TRAJECTORIES, DART_TRACE, CORGI_BARK} from './fixtures/arcade-sprite-extensions.mjs';

const PALETTE = ['#000000', '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
const unpack = value => '#' + [value & 255, (value >>> 8) & 255, (value >>> 16) & 255].map(b => b.toString(16).padStart(2, '0')).join('');
const DEPENDENCIES = {device: '*', darts: '*', corgio: '*'};
const KEYS = {right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown'};
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const entries = trace => String(trace).split(';').filter(Boolean).map(entry => entry.split(','));

test('generated darts and corgio extensions match the pinned PXT sources', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-sprite-extensions.mjs', '--check'], {stdio: 'pipe'});
});

// Run the original under a fake clock, then the native translation replaying
// each recorded frame's delta time; returns both traces and the native run.
async function compare(fixture, {inspectDisplay = false} = {}) {
    const original = await runPxtArcade(fixture.source(true), {waitForGlobals: {traceDone: true}, fakeClock: true, dependencies: DEPENDENCIES, inspectDisplay});
    const expected = entries(original.trace);
    const imported = arcadeToPseudocode(fixture.source(false));
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 0, uploads: imported.costumes, storage: true});
    for (const button of fixture.pressed) run.vm.postIOData('keyboard', {key: KEYS[button], isDown: true});
    // Frame 0 runs the start block and any handler it registers with that
    // frame's delta time; nothing moves before it, so every step up to and
    // including frame 0 uses the original's frame-0 time.
    const first = Number(expected[0].at(-1)) * 1000;
    for (let guard = 0; Number(values(run).frame) < 1; guard++) {
        assert.ok(guard < 200, 'the native recording started');
        await stepFrames(run.vm, 1, first);
    }
    for (let i = 1; i < expected.length; i++) await stepFrames(run.vm, 1, Number(expected[i].at(-1)) * 1000);
    return {original, expected, actual: entries(values(run).trace), run, imported};
}
const motionOnly = list => list.map(entry => entry.slice(0, -1));

for (const [name, fixture] of Object.entries(EXTENSION_TRAJECTORIES)) {
    test(`sprite extension follows the original frame by frame: ${name}`, async () => {
        const {expected, actual, run} = await compare(fixture);
        try {
            assert.deepEqual(run.errors, []);
            assert.equal(actual.length, expected.length);
            assert.deepEqual(motionOnly(actual), motionOnly(expected));
        } finally { clearStrayTimers(); }
    });
}

for (const [name, fixture] of Object.entries({dartTrace: DART_TRACE, corgiBark: CORGI_BARK})) {
    test(`sprite extension draws the original screen: ${name}`, async () => {
        const {original, expected, actual, run} = await compare(fixture, {inspectDisplay: true});
        try {
            assert.deepEqual(run.errors, []);
            assert.deepEqual(motionOnly(actual), motionOnly(expected));
            const screen = original.$display.screen.map(unpack);
            const frame = Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels, index => PALETTE[index]);
            const differing = frame.reduce((list, color, i) => color !== screen[i] ? [...list, i] : list, []);
            assert.deepEqual(differing.slice(0, 10), [], `${differing.length} pixels differ`);
        } finally { clearStrayTimers(); }
    });
}

const ROUND_TRIP = `let golf = darts.create(img\`
    2 2
    2 2
\`, SpriteKind.Player)
golf.setTrace()
golf.controlWithArrowKeys(false)
golf.pow = 70
golf.angle += 5
golf.throwDart()
golf.stopDart()
let corgi = corgio.create(SpriteKind.Enemy, 30)
corgi.maxMoveVelocity = 50
corgi.horizontalMovement()
corgi.verticalMovement(false)
corgi.updateSprite()
corgi.cameraFollow(false)
corgi.addToScript("woof")
corgi.bark()
let speed = corgi.maxMoveVelocity + golf.pow
let done = true
done = true`;

test('darts and corgio programs are editable through Code and Blocks, SB3 and original export', async () => {
    const imported = arcadeToPseudocode(ROUND_TRIP);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 20, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const opcodes = projectOpcodes(run.creator.project);
        for (const op of ['arcade_createDart', 'arcade_createCorgi', 'arcade_dartSwitch', 'arcade_dartAction', 'arcade_setDartProperty',
            'arcade_dartProperty', 'arcade_corgiControl', 'arcade_corgiAddPhrase', 'arcade_corgiBark', 'arcade_setCorgiProperty',
            'arcade_corgiProperty']) assert.ok(opcodes.has(op), op);
        assert.equal(Number(values(run).speed), 120);
        const again = await runProgram(run.creator.decompile(), {frames: 20, storage: true, uploads: imported.costumes});
        assert.deepEqual(again.errors, []);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        const pxt = JSON.parse(exported.files['pxt.json']);
        assert.equal(pxt.dependencies.darts, '*');
        assert.equal(pxt.dependencies.corgio, '*');
        for (const call of ['darts.create(', 'corgio.create(SpriteKind.Enemy, 30, 70)', '.setTrace(true)', '.controlWithArrowKeys(false)',
            '.throwDart()', '.stopDart()', '.horizontalMovement(true)', '.verticalMovement(false)', '.addToScript("woof")', '.bark()'])
            assert.ok(exported.ts.includes(call), call);
        assert.match(exported.ts, /let \w*golf\w*: Dart = null/);
        assert.match(exported.ts, /let \w*corgi\w*: Corgio = null/);
        const executed = await runPxtArcade(exported.files, {waitForGlobals: {done: true}});
        assert.equal(executed.speed, 120);
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        run.vm.greenFlag();
        await stepFrames(run.vm, 20);
        assert.deepEqual(run.errors, []);
        assert.equal(Number(values(run).speed), 120);
    } finally { clearStrayTimers(); }
});

test('darts and corgio diagnostics stay explicit', () => {
    for (const source of [
        'let d = darts.create(img`2`, SpriteKind.Player)\nd.updateBackground(img`2`)',
        'let c = corgio.create(SpriteKind.Player)\nc.setTrace()',
        'let c = corgio.create()'])
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
});
