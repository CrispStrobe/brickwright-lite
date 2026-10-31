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

// Differential follow-ups: the original simulator keeps the program on the game-over screen
// after control.reset (it only posts a restart message), and runs an image effect's first step
// (a control.runInParallel fiber) after the game-over scene's first frame.
async function timedRun(source) {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 0, storage: true, uploads: imported.costumes, frameAuthority: 'timed'});
    const clock = createArcadeDiscreteTimers();
    run.vm.stopAll(); run.vm.runtime.bwArcadeProgramClock = clock;
    run.vm.runtime.updateCurrentMSecs = () => { run.vm.runtime.currentMSecs = clock.now(); };
    return {run, clock, start: async () => { run.vm.greenFlag(); await stepFrames(run.vm, 1, 0); }};
}
const framePixels = run => Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame?.pixels || []);
// One observation per 20 ms tick: [state, background present, frame pixels].
async function observe(source, ticks, {hold = false} = {}) {
    const {run, clock, start} = await timedRun(source);
    run.vm.runtime.bwArcadeHoldControlReset = hold;
    const seen = [];
    try {
        await start();
        for (let i = 1; i <= ticks; i++) {
            await clock.advanceTo(i * 20);
            for (let turn = 0; turn < 4; turn++) await new Promise(resolve => setImmediate(resolve));
            seen.push({background: !!run.vm.runtime.bwArcadeDeviceState.backgroundImage, pixels: framePixels(run)});
        }
        assert.deepEqual(run.errors, []);
        return {seen, run, clock};
    } finally { /* the caller stops the VM */ }
}
const OVERLAP_BODY = `scene.setBackgroundColor(9)
info.setScore(3)
info.setLife(2)
let mover = sprites.create(img\`
    2 2 2 2 2 2 2 2
    2 2 2 2 2 2 2 2
    2 2 2 2 2 2 2 2
    2 2 2 2 2 2 2 2
\`, SpriteKind.Player)
let wall = sprites.create(img\`
    5 5 5 5 5 5 5 5
    5 5 5 5 5 5 5 5
    5 5 5 5 5 5 5 5
    5 5 5 5 5 5 5 5
\`, SpriteKind.Enemy)
mover.setPosition(20, 60)
wall.setPosition(70, 60)
mover.vx = 100
`;

test('a control.reset held by the host leaves the game-over screen up and is counted', async () => {
    const source = `scene.setBackgroundColor(9)
let ended = false
game.onUpdateInterval(100, function () {
    if (!ended) {
        ended = true
        game.gameOver(false)
    }
})`;
    const {run, clock, start} = await timedRun(source);
    try {
        run.vm.runtime.bwArcadeHoldControlReset = true;
        await start(); await clock.advanceTo(1200);
        const restarts = [];
        run.vm.runtime.on('PROJECT_START', () => restarts.push(clock.now()));
        run.vm.postIOData('keyboard', {key: ' ', isDown: true});
        await clock.advanceTo(1300);
        run.vm.postIOData('keyboard', {key: ' ', isDown: false});
        await clock.advanceTo(1400);
        assert.deepEqual(run.errors, []);
        assert.deepEqual(restarts, [], 'a held reset does not restart the program');
        assert.equal(run.vm.runtime.bwArcadeControlResets, 1);
        assert.ok(run.vm.runtime.bwArcadeDeviceState.backgroundImage, 'the game-over screen stays up');
    } finally { run.vm.stopAll(); run.vm.quit(); clearStrayTimers(); }
});

test('the default image effect starts after the game-over scene\'s first frame', async () => {
    const withEffect = `${OVERLAP_BODY}game.setGameOverEffect(false, effects.melt)
sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function (sprite, otherSprite) {
    game.gameOver(false)
})`;
    const noEffect = withEffect.replace('effects.melt', 'effects.none');
    const melt = await observe(withEffect, 60), plain = await observe(noEffect, 60);
    try {
        const first = melt.seen.findIndex(sample => sample.background);
        assert.ok(first > 0);
        assert.equal(melt.seen[first].pixels.join(), plain.seen[first].pixels.join(), 'no melt step is visible on the first frame');
        assert.ok(melt.seen.slice(first).some((sample, i) => sample.pixels.join() !== plain.seen[first + i].pixels.join()), 'the melt runs afterwards');
    } finally { for (const {run} of [melt, plain]) { run.vm.stopAll(); run.vm.quit(); } clearStrayTimers(); }
});

test('game over from a paint handler keeps the screen as drawn so far', async () => {
    // The paint handler draws a marker after the background; game over runs before it draws, so
    // the captured background holds the plain background colour, not the previous frame's marker.
    const source = `scene.setBackgroundColor(9)
let frames = 0
game.onPaint(function () {
    frames += 1
    if (frames == 5) {
        game.setGameOverEffect(false, effects.none)
        game.gameOver(false)
        return
    }
    screen.fillRect(0, 0, 160, 120, 4)
})`;
    const {run, clock, start} = await timedRun(source);
    try {
        await start(); await clock.advanceTo(300);
        assert.deepEqual(run.errors, []);
        const image = run.vm.runtime.bwArcadeDeviceState.backgroundImage;
        assert.ok(image, 'game over opened');
        assert.equal(image.pixels[0], 9, 'the capture is the screen before this frame\'s paint, not the last finished frame');
    } finally { run.vm.stopAll(); run.vm.quit(); clearStrayTimers(); }
});

const LATE_OVERLAP = `let lifeSeen = -99
let ticks = 0
let done = false
let hero = sprites.create(img\`
    2 2 2
    2 2 2
\`, SpriteKind.Player)
hero.setPosition(80, 60)
info.setLife(1)
let first = sprites.create(img\`
    5 5
    5 5
\`, SpriteKind.Food)
first.setPosition(80, 60)
sprites.onOverlap(SpriteKind.Player, SpriteKind.Food, function (sprite, other) {
    other.destroy()
    info.changeLifeBy(-1)
    sprite.say("ow", 500)
    lifeSeen = info.life()
})
game.onUpdate(function () {
    ticks += 1
    if (ticks == 2) {
        let second = sprites.create(img\`
            5 5
            5 5
        \`, SpriteKind.Food)
        second.setPosition(80, 60)
    }
})
control.runInParallel(function () {
    pause(700)
    done = true
    done = true
})`;

test('an overlap callback queued in the frame that raises life zero runs in the game-over scene', async () => {
    // The default life-zero game over pushes its scene inside the frame's HUD draw; the callback
    // fiber that frame's physics queued resumes afterwards and acts on the NEW scene (a fresh
    // life counter, and a speech bubble sprite created there for the old scene's player).
    const original = await runPxtArcade(LATE_OVERLAP, {waitForGlobals: {done: true}, fakeClock: true});
    assert.equal(original.lifeSeen, 2);
    const {run, clock, start} = await timedRun(LATE_OVERLAP);
    try {
        await start();
        for (let t = 20; t <= 800; t += 20) {
            await clock.advanceTo(t);
            for (let turn = 0; turn < 4; turn++) await new Promise(resolve => setImmediate(resolve));
        }
        assert.deepEqual(run.errors, []);
        const variables = Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables)).map(variable => [variable.name, variable.value]));
        assert.equal(Number(variables.lifeSeen), original.lifeSeen);
        assert.equal(Object.keys(run.vm.runtime.bwArcadeDeviceState.sprites).length, 1, 'only the bubble sprite exists in the game-over scene');
    } finally { run.vm.stopAll(); run.vm.quit(); clearStrayTimers(); }
});

const QUEUED_FIBER = `let order = ""
let ticks = 0
let done = false
let fired = false
sprites.onCreated(SpriteKind.Enemy, function (sprite) {
    order = order + "c"
})
let hero = sprites.create(img\`
    2 2 2
    2 2 2
\`, SpriteKind.Player)
hero.setPosition(80, 60)
sprites.onOverlap(SpriteKind.Player, SpriteKind.Food, function (sprite, other) {
    order = order + "o"
    other.destroy()
})
game.onUpdate(function () {
    ticks += 1
    if (ticks == 5) {
        let food = sprites.create(img\`
            5 5
            5 5
        \`, SpriteKind.Food)
        food.setPosition(80, 60)
    }
})
game.onUpdateInterval(100, function () {
    if (!fired) {
        fired = true
        sprites.create(img\`
            4 4
            4 4
        \`, SpriteKind.Enemy)
        order = order + "u"
    }
})
control.runInParallel(function () {
    pause(400)
    done = true
    done = true
})`;
test('an overlap fiber queued by a frame runs after the frame, not during its inline creation callback',async()=>{
    // The frame that detects the overlap also creates a sprite whose creation callback the
    // caller runs inline. The queued overlap fiber only runs once the frame fiber blocks.
    const original=await runPxtArcade(QUEUED_FIBER,{waitForGlobals:{done:true},fakeClock:true});
    assert.equal(original.order,'cuo');
    const {run,clock,start}=await timedRun(QUEUED_FIBER);
    try {
        await start();
        await clock.advanceTo(500);
        for(let turn=0;turn<4;turn++)await new Promise(resolve=>setImmediate(resolve));
        assert.deepEqual(run.errors,[]);
        const order=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name==='order')?.value;
        assert.equal(String(order),original.order);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
