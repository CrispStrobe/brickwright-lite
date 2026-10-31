import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';

// PXT's follow frame handler clamps each velocity change by turnRate * dt,
// with dt from game.runtime(): the following scene's own clock. While another
// scene is pushed that clock stands still, so the first step after the pop is
// one frame's ramp, not a jump to full speed over the whole hidden interval.
const source = `let target = sprites.create(img\`1\`, SpriteKind.Player)
target.setPosition(40, 30)
let chaser = sprites.create(img\`2\`, SpriteKind.Enemy)
chaser.setPosition(120, 90)
chaser.follow(target, 25)
let firstVx = 0
let firstVy = 0
let done = false
game.pushScene()
pause(400)
game.popScene()
pauseUntil(() => chaser.vx != 0)
firstVx = chaser.vx
firstVy = chaser.vy
done = true
`;

test('follow ramps after a pushed scene on the scene clock, as in PXT', async () => {
    const original = await runPxtArcade(source, {fakeClock: true, waitForGlobals: {done: true}});
    assert.ok(original.firstVx < 0 && original.firstVy < 0, 'original chaser starts towards its target');
    // A one-frame ramp limits both axes equally, below the 4:3 full-speed trajectory.
    assert.equal(original.firstVx, original.firstVy, 'original first step is turn-rate clamped on both axes');

    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const run = await runProgram(translated.code, {frames: 0, frameAuthority: 'timed'});
    const {vm} = run, clock = createArcadeDiscreteTimers();
    const values = () => Object.fromEntries(vm.runtime.targets.flatMap(t => Object.values(t.variables))
        .map(v => [v.name.replace(/^Game_/, ''), v.value]));
    try {
        vm.stopAll(); vm.runtime.bwArcadeProgramClock = clock;
        vm.runtime.updateCurrentMSecs = () => { vm.runtime.currentMSecs = clock.now(); };
        vm.greenFlag(); await stepFrames(vm, 1, 0);
        for (let t = 20; t <= 1000 && values().done !== true; t += 20) await clock.advanceTo(t);
        const actual = values();
        assert.equal(actual.done, true, 'the Brickwright program reached its first follow step');
        assert.equal(actual.firstVx, actual.firstVy, 'first step is clamped on both axes, not a full-speed jump');
        assert.ok(Math.abs(actual.firstVx - original.firstVx) < 2, `ramp matches the original (${actual.firstVx} vs ${original.firstVx})`);
        assert.deepEqual(run.errors, []);
    } finally { vm.quit(); clearStrayTimers(); }
});
