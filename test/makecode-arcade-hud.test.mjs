import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const PALETTE = ['#000000', '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
const unpack = value => '#' + [value & 255, (value >>> 8) & 255, (value >>> 16) & 255].map(b => b.toString(16).padStart(2, '0')).join('');
const frameColors = run => Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels, index => PALETTE[index]);
// A parallel fiber marks the capture time; the scene is still by then.
const marked = (body, ms) => `let shown = false
control.runInParallel(function () {
    pause(${ms})
    shown = true
    shown = true
})
${body}`;

test('generated HUD matches the pinned PXT source', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-hud.mjs', '--check'], {stdio: 'pipe'});
});

// A sprite puts each program on the native runtime path (sprite-free
// programs use plain variables for lives; see the last test).
const HERO = 'let hero = sprites.create(img`\n    5 5\n    5 5\n`, SpriteKind.Player)\nhero.setPosition(80, 60)\n';
const SCENES = {
    score: 'scene.setBackgroundColor(9)\ninfo.setScore(1234)',
    'large score': 'scene.setBackgroundColor(7)\ninfo.setScore(12345678)',
    hearts: 'scene.setBackgroundColor(9)\ninfo.setLife(3)',
    'many lives': 'scene.setBackgroundColor(9)\ninfo.setLife(7)\ninfo.changeScoreBy(-42)',
    // Over a minute the timer shows MM:SS, which holds for a second.
    countdown: 'scene.setBackgroundColor(6)\ninfo.setScore(5)\ninfo.startCountdown(125)',
    // Reading a score creates it but does not show it.
    'read only': 'scene.setBackgroundColor(9)\nlet s = info.score()\nlet l = info.life()',
    multiplayer: 'scene.setBackgroundColor(9)\ninfo.player2.setScore(7)\ninfo.player1.setLife(2)\ninfo.player3.setScore(30)\ninfo.player4.setLife(5)',
};

for (const [name, body] of Object.entries(SCENES)) {
    test(`the HUD draws as the original: ${name}`, async () => {
        const source = HERO + body;
        const original = await runPxtArcade(marked(source, 700), {waitForGlobals: {shown: true}, inspectDisplay: true, waitForMain: false});
        const expected = original.$display.screen.map(unpack);
        const imported = arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported, []);
        const run = await runProgram(imported.code, {frames: 10, storage: true, uploads: imported.costumes});
        try {
            await stepFrames(run.vm, 10);
            assert.deepEqual(run.errors, []);
            const actual = frameColors(run);
            const differing = actual.map((color, i) => color !== expected[i] ? i : -1).filter(i => i >= 0);
            assert.deepEqual(differing.slice(0, 12), [], `${differing.length} pixels differ`);
            // Each scene draws something besides its background (the read-only one excepted).
            if (name !== 'read only') assert.ok(new Set(expected).size > 2, 'the original draws a HUD');
            else assert.equal(new Set(expected).size, 2, 'reading a score shows nothing');
        } finally { clearStrayTimers(); }
    });
}
