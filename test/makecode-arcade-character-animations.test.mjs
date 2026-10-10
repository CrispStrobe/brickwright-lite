import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers, projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const DEPENDENCIES = {device: '*', 'arcade-character-animations': 'github:microsoft/arcade-character-animations#v0.1.0'};
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const entries = trace => String(trace).split(';').filter(Boolean).map(entry => entry.split(','));

test('generated character animations match the vendored arcade-character-animations source', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-character-animations.mjs', '--check'], {stdio: 'pipe'});
});

// Authored fixtures: one solid colour per frame, so the sprite's top-left
// pixel names the frame it shows.
const frame = color => {
    const c = color.toString(16);
    return `img\`
    ${c} ${c} ${c}
    ${c} ${c} ${c}
\``;
};
const frames = (...colors) => `[${colors.map(frame).join(', ')}]`;
const SETUP = `let hero = sprites.create(${frame(1)}, SpriteKind.Player)
hero.setPosition(80, 60)`;
// The script runs in the update handler of each recorded frame; the trace
// records the shown frame, two rule checks and the frame time.
const record = (setup, script, count) => `${SETUP}
${setup}
let trace = ""
let frame = 0
let traceDone = false
game.onUpdate(function () {
    if (frame < ${count}) {
        ${script.split('\n').join('\n        ')}
        trace = trace + hero.image.getPixel(0, 0) + "," + (characterAnimations.matchesRule(hero, characterAnimations.rule(Predicate.Moving)) ? 1 : 0) + "," + (characterAnimations.matchesRule(hero, characterAnimations.rule(Predicate.FacingLeft)) ? 1 : 0) + "," + control.eventContext().deltaTime + ";"
        frame += 1
    } else {
        traceDone = true
    }
})`;
const SCENARIOS = {
    walk: record(`characterAnimations.loopFrames(hero, ${frames(2, 3, 4)}, 100, characterAnimations.rule(Predicate.MovingRight))
characterAnimations.loopFrames(hero, ${frames(5, 6)}, 70, characterAnimations.rule(Predicate.MovingLeft))
characterAnimations.loopFrames(hero, ${frames(7)}, 100, characterAnimations.rule(Predicate.NotMoving, Predicate.FacingRight))
characterAnimations.loopFrames(hero, ${frames(8)}, 100, characterAnimations.rule(Predicate.NotMoving, Predicate.FacingLeft))`,
    `if (frame == 1) {
    hero.vx = 40
}
if (frame == 14) {
    hero.vx = 0
}
if (frame == 18) {
    hero.vx = -35
    hero.vy = 10
}
if (frame == 30) {
    hero.vx = 0
    hero.vy = 0
}`, 36),
    // Start frames run once when a rule begins, then the loop frames. At 41 ms
    // the oracle's one 22 ms frame decides when the third start frame shows.
    run: record(`characterAnimations.runFrames(hero, ${frames(9, 10, 11)}, 41, characterAnimations.rule(Predicate.Moving, Predicate.FacingUp))
characterAnimations.loopFrames(hero, ${frames(12, 13)}, 90, characterAnimations.rule(Predicate.Moving, Predicate.FacingUp))
characterAnimations.loopFrames(hero, ${frames(14, 15)}, 30, characterAnimations.rule(Predicate.NotMoving))`,
    `if (frame == 2) {
    hero.vy = -30
}
if (frame == 20) {
    hero.vy = 0
}
if (frame == 24) {
    hero.vy = -30
}`, 34),
    // Manual state, disabling, the facing lock and clearing.
    manual: record(`characterAnimations.loopFrames(hero, ${frames(2, 3)}, 80, characterAnimations.rule(Predicate.MovingLeft))
characterAnimations.loopFrames(hero, ${frames(4, 5)}, 80, characterAnimations.rule(Predicate.FacingLeft))
characterAnimations.loopFrames(hero, ${frames(6)}, 80, characterAnimations.rule(Predicate.FacingRight))
characterAnimations.loopFrames(hero, ${frames(7)}, 80, characterAnimations.rule(Predicate.NotMoving))`,
    `if (frame == 2) {
    characterAnimations.setCharacterState(hero, characterAnimations.rule(Predicate.Moving, Predicate.MovingLeft))
}
if (frame == 8) {
    characterAnimations.setCharacterAnimationsEnabled(hero, false)
}
if (frame == 12) {
    characterAnimations.setCharacterAnimationsEnabled(hero, true)
}
if (frame == 15) {
    characterAnimations.clearCharacterState(hero)
    characterAnimations.lockFacingDirection(hero, characterAnimations.FacingDirection.Left)
}
if (frame == 20) {
    hero.vx = 25
}
if (frame == 24) {
    characterAnimations.unlockFacingDirection(hero)
}
if (frame == 28) {
    characterAnimations.setController(hero, true)
}`, 32),
};

for (const [name, source] of Object.entries(SCENARIOS)) {
    test(`character animations follow the original frame by frame: ${name}`, async () => {
        const original = await runPxtArcade(source, {waitForGlobals: {traceDone: true}, fakeClock: true, dependencies: DEPENDENCIES});
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
            // The trace exercises several frames of each animation.
            assert.ok(new Set(expected.map(entry => entry[0])).size >= 3, original.trace);
        } finally { clearStrayTimers(); }
    });
}

const ROUND_TRIP = `${SETUP}
characterAnimations.loopFrames(hero, ${frames(2, 3)}, 100, characterAnimations.rule(Predicate.MovingRight, Predicate.FacingRight))
characterAnimations.runFrames(hero, characterAnimations._animationFrames(${frames(4)}), 50, characterAnimations._predicate(Predicate.Moving))
characterAnimations.setCharacterAnimationsEnabled(hero, true)
characterAnimations.setCharacterState(hero, characterAnimations.rule(Predicate.NotMoving))
characterAnimations.clearCharacterState(hero)
characterAnimations.setController(hero, false)
characterAnimations.lockFacingDirection(hero, characterAnimations.FacingDirection.Down)
characterAnimations.unlockFacingDirection(hero)
let still = characterAnimations.matchesRule(hero, characterAnimations.rule(Predicate.NotMoving))
let done = true
done = true`;

test('character animation programs are editable through Code and Blocks, SB3 and original export', async () => {
    const imported = arcadeToPseudocode(ROUND_TRIP);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 10, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const opcodes = projectOpcodes(run.creator.project);
        for (const op of ['arcade_characterFrames', 'arcade_setCharacterAnimationsEnabled', 'arcade_setCharacterState', 'arcade_clearCharacterState',
            'arcade_setCharacterController', 'arcade_lockCharacterFacing', 'arcade_unlockCharacterFacing', 'arcade_characterRule', 'arcade_characterMatchesRule'])
            assert.ok(opcodes.has(op), op);
        const again = await runProgram(run.creator.decompile(), {frames: 6, storage: true, uploads: imported.costumes});
        assert.deepEqual(again.errors, []);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-character-animations'], 'github:microsoft/arcade-character-animations#v0.1.0');
        for (const call of ['characterAnimations.rule(Predicate.MovingRight, Predicate.FacingRight)', 'characterAnimations.runFrames(',
            'characterAnimations.setCharacterAnimationsEnabled(', 'characterAnimations.clearCharacterState(', 'characterAnimations.setController(',
            'characterAnimations.lockFacingDirection(', 'characterAnimations.FacingDirection.Down', 'characterAnimations.unlockFacingDirection(',
            'characterAnimations.matchesRule('])
            assert.ok(exported.ts.includes(call), call);
        const executed = await runPxtArcade(exported.files, {waitForGlobals: {done: true}});
        assert.equal(executed.done, true);
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        run.vm.greenFlag();
        await stepFrames(run.vm, 6);
        assert.deepEqual(run.errors, []);
    } finally { clearStrayTimers(); }
});

test('character animation diagnostics stay explicit', () => {
    for (const source of [`${SETUP}\ncharacterAnimations.loopFrames(hero, [], 100)`,
        `${SETUP}\nlet p = Predicate.Moving\ncharacterAnimations.setCharacterState(hero, characterAnimations.rule(p))`,
        `${SETUP}\ncharacterAnimations.lockFacingDirection(hero, 4)`,
        `${SETUP}\ncharacterAnimations.setController(hero, true, controller.player2)`])
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
});
