import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers, projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';

const PALETTE = ['#000000', '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
const unpack = value => '#' + [value & 255, (value >>> 8) & 255, (value >>> 16) & 255].map(b => b.toString(16).padStart(2, '0')).join('');
const frameColors = run => Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels, index => PALETTE[index]);
// The original keeps running after main blocks in game over; a parallel fiber marks the capture time.
const marked = (body, ms) => `let shown = false
control.runInParallel(function () {
    pause(${ms})
    shown = true
    shown = true
})
${body}`;

test('generated game-over dialog and configuration match the pinned PXT sources', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-gameover.mjs', '--check'], {stdio: 'pipe'});
});

const LOSE = `info.setScore(7)
scene.setBackgroundColor(9)
let hero = sprites.create(img\`
    2 2 2
    2 2 2
\`, SpriteKind.Player)
hero.setPosition(40, 30)
game.setGameOverEffect(false, effects.none)
// Arcade-clock timing (pause imports as a wall-clock Scratch wait).
let ended = false
game.onUpdateInterval(300, function () {
    if (!ended) {
        ended = true
        game.gameOver(false)
    }
})`;

test('the game-over screen matches the original outside the score HUD', async () => {
    // 700 ms after game over: the dialog is shown (400 ms) and its cursor not yet (900 ms).
    const original = await runPxtArcade(marked(LOSE, 1000), {waitForGlobals: {shown: true}, inspectDisplay: true, waitForMain: false});
    const expected = original.$display.screen.map(unpack);
    const imported = arcadeToPseudocode(LOSE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 10, storage: true, uploads: imported.costumes});
    try {
        await stepFrames(run.vm, 21);
        assert.deepEqual(run.errors, []);
        const actual = frameColors(run);
        // The score box is part of the last frame, which game over keeps as background.
        const differing = actual.map((color, i) => color !== expected[i] ? i : -1).filter(i => i >= 0);
        assert.deepEqual(differing.slice(0, 12), [], `${differing.length} pixels differ`);
        // The dialog: frame, GAME OVER and the score line.
        assert.ok(actual.slice(36 * 160, 84 * 160).includes('#fff609'));
    } finally { clearStrayTimers(); }
});

const WIN = `info.setScore(12)
let ended = false
game.onUpdateInterval(300, function () {
    if (!ended) {
        ended = true
        game.gameOver(true)
    }
})`;

test('a win shows the original dialog and plays the original win sound', async () => {
    const original = await runPxtArcade(marked(WIN, 1000), {waitForGlobals: {shown: true}, inspectDisplay: true, waitForMain: false, recordSound: true});
    const expected = original.$display.screen.map(unpack);
    const imported = arcadeToPseudocode(WIN);
    const run = await runProgram(imported.code, {frames: 10, storage: true, uploads: imported.costumes});
    try {
        await stepFrames(run.vm, 21);
        assert.deepEqual(run.errors, []);
        const actual = frameColors(run);
        // The opaque dialog rows are exact; random confetti falls around it.
        const top = (120 - 47) >> 1;
        assert.deepEqual(actual.slice(top * 160, (top + 47) * 160), expected.slice(top * 160, (top + 47) * 160));
        assert.deepEqual(run.vm.runtime.bwArcadeMusicLog.map(entry => entry.bytes), original.$sound.map(entry => entry.bytes));
    } finally { clearStrayTimers(); }
});

test('a button press after the dialog restarts the program; earlier presses do not', async t => {
    const source = `scene.setBackgroundColor(9)
let ended = false
game.onUpdateInterval(100, function () {
    if (!ended) {
        ended = true
        game.gameOver(false)
    }
})`;
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 0, storage: true, uploads: imported.costumes, frameAuthority: 'timed'});
    const clock = createArcadeDiscreteTimers();
    run.vm.stopAll(); run.vm.runtime.bwArcadeProgramClock = clock;
    run.vm.runtime.updateCurrentMSecs = () => { run.vm.runtime.currentMSecs = clock.now(); };
    run.vm.greenFlag();
    await stepFrames(run.vm, 1, 0); await clock.advanceTo(200);
    const restarts = [];
    run.vm.runtime.on('PROJECT_START', () => restarts.push(clock.now()));
    const press = async () => {
        run.vm.postIOData('keyboard', {key: ' ', isDown: true});
        await clock.advanceTo(clock.now() + 20);
        run.vm.postIOData('keyboard', {key: ' ', isDown: false});
        await clock.advanceTo(clock.now() + 20);
    };
    try {
        assert.ok(run.vm.runtime.bwArcadeDeviceState.backgroundImage, 'game over shows the last frame as background');
        await press();
        assert.ok(run.vm.runtime.bwArcadeDeviceState.backgroundImage, 'a press before the cursor appears is ignored');
        assert.deepEqual(restarts, [], 'early input cannot restart the program');
        await clock.advanceTo(1200);
        // The selected SDK waits 400ms before the dialog and 500ms before the
        // next genuine button press. Its onUpdateInterval starts with timer 0,
        // so the unchanged source immediately enters game over again on the
        // restarted scene's initial frame. PROJECT_START observes the actual
        // restart; a transient background-absence assertion is not valid.
        run.vm.postIOData('keyboard', {key: ' ', isDown: true});
        await clock.advanceTo(1220);
        assert.deepEqual(run.errors, []);
        const state = run.vm.runtime.bwArcadeDeviceState;
        assert.equal(restarts.length, 1, 'late genuine input restarts the program exactly once');
        assert.equal(state.elapsedMs, 0, 'the restarted source has reached its initial game-over scene');
        assert.ok(state.backgroundImage, 'unchanged interval source immediately enters game over again');
        t.diagnostic(JSON.stringify({restartTimes: restarts, sceneMillis: state.elapsedMs, background: !!state.backgroundImage, threads: run.vm.runtime.threads.length,
            boundary: 'Actual native PROJECT_START/input lifecycle; initial-zero interval authority is retained selected MIT gameutil.ts, not an original host restart observation.'}));
        run.vm.postIOData('keyboard', {key: ' ', isDown: false});
    } finally { run.vm.stopAll(); run.vm.quit(); clearStrayTimers(); }
});

const CONFIGURED = `game.setGameOverEffect(false, effects.dissolve)
game.setGameOverMessage(true, "WOW")
game.setGameOverPlayable(true, music.melodyPlayable(music.baDing), false)
game.setGameOverScoringType(game.ScoringType.LowScore)
effects.melt.startScreenEffect()
info.setScore(5)
pause(100)
game.over(true, effects.confetti)`;

test('game over is editable through Code and Blocks, saved SB3 and original MakeCode export', async () => {
    const imported = arcadeToPseudocode(CONFIGURED);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 8, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const opcodes = projectOpcodes(run.creator.project);
        for (const op of ['arcade_setGameOverEffect', 'arcade_setGameOverMessage', 'arcade_setGameOverPlayable',
            'arcade_setGameOverScoringType', 'arcade_startImageEffect', 'arcade_legacyGameOver']) assert.ok(opcodes.has(op), op);
        const again = await runProgram(run.creator.decompile(), {frames: 8, storage: true, uploads: imported.costumes});
        assert.deepEqual(again.errors, []);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        for (const call of ['game.setGameOverEffect(false, effects.dissolve)', 'game.setGameOverMessage(true, "WOW")',
            'game.setGameOverPlayable(true, music.melodyPlayable(music.baDing), false)', 'game.setGameOverScoringType(game.ScoringType.LowScore)',
            'effects.melt.startScreenEffect()', 'game.over(true, effects.confetti)']) assert.ok(exported.ts.includes(call), call);
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        await runPxtArcade(marked(exported.ts.replace(/^/, ''), 600), {waitForGlobals: {shown: true}, waitForMain: false});
        await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        run.vm.greenFlag();
        await stepFrames(run.vm, 8);
        assert.deepEqual(run.errors, []);
    } finally { clearStrayTimers(); }
});

test('game-over diagnostics stay explicit', () => {
    for (const source of ['let e = effects.melt\ngame.setGameOverEffect(true, e)', 'game.over(true, effects.spray)',
        'let t = game.ScoringType.None\ngame.setGameOverScoringType(t)', 'game.gameOver()'])
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
});
