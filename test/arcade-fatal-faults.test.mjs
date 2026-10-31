// PXT fatal-fault semantics, measured against the original simulator with the
// behavioural-differential harness (children run each side; no GUI-scope import).
// An uncaught exception ends exactly one fiber:
//  - a frame callback (controller, update intervals, onUpdate, onPaint/onShade, screen update)
//    ends the scene's single frame fiber: physics, timers and screen stop for good;
//  - a button handler keeps its event queue locked: that button never runs again;
//  - a forever handler keeps its lock: that handler never runs again, its siblings do;
//  - an overlap handler leaves the pair marked overlapping: it never fires again.
// Each scenario also runs the original against a twin without the fault and expects a
// divergence, so a pass cannot come from a program where neither side ever faulted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeProgram} from '../scripts/lib/arcade-differential/analyze.mjs';

const OPTIONS = {seconds: 5, fps: 30, seed: 3, entropy: 'sequence', scripts: ['ab'], timeoutMs: {original: 120000, brickwright: 60000}, entropyProbe: false};
const BLOCK = 'img`\n    2 2 2 2\n    2 . . 2\n    2 . . 2\n    2 2 2 2\n`';
const OTHER = 'img`\n    5 5\n    5 5\n`';
const HEAD = `let ticks = 0
let alive = 0
let taps = 0
let others = 0
let hits = 0
let nul: Image = null
let missing: Sprite = null
let list: Image[] = []
let mover = sprites.create(${BLOCK}, SpriteKind.Player)
mover.vx = 20
`;

async function compare(program, twin = null) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fatal-fault-'));
    try {
        const same = await analyzeProgram(program, {...OPTIONS, workDir: dir});
        const result = {same: same.class, scripts: same.scripts};
        if (twin !== null) result.twin = (await analyzeProgram(program, {...OPTIONS, workDir: dir, brickwrightSource: twin})).class;
        return result;
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
function scenario(name, faulty, twin) {
    test(name, {timeout: 400000}, async () => {
        const result = await compare(faulty, twin);
        assert.equal(result.same, 'identical', JSON.stringify(result.scripts));
        assert.equal(result.twin, 'diverges', 'the original must differ from a twin that never faults');
    });
}

scenario('an undefined image drawn by onPaint ends the frame fiber: timers and screen stop, as in PXT', `${HEAD}
game.onUpdateInterval(100, function () { ticks += 1 })
game.onPaint(function () {
    if (ticks >= 5) {
        screen.drawImage(list[-2], 10, 10)
    }
})
`, `${HEAD}
game.onUpdateInterval(100, function () { ticks += 1 })
game.onPaint(function () {
    if (ticks >= 5) {
        screen.drawImage(mover.image, 10, 10)
    }
})
`);

scenario('an undefined receiver in onUpdate ends the frame fiber; forever and button fibers live on', `${HEAD}
game.onUpdate(function () {
    ticks += 1
    if (ticks >= 40) {
        nul.fillRect(0, 0, 3, 3, 2)
    }
})
forever(function () { alive += 1 })
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { others += 1 })
`, `${HEAD}
game.onUpdate(function () {
    ticks += 1
})
forever(function () { alive += 1 })
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { others += 1 })
`);

scenario('setImage on a null sprite in a button handler locks that button only', `${HEAD}
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    taps += 1
    missing.setImage(${OTHER})
})
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { others += 1 })
game.onUpdate(function () { ticks += 1 })
`, `${HEAD}
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    taps += 1
    mover.setImage(${OTHER})
})
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { others += 1 })
game.onUpdate(function () { ticks += 1 })
`);

scenario('a forever handler that dies stays locked while its sibling keeps running', `${HEAD}
forever(function () {
    alive += 1
    if (alive >= 3) {
        nul.setPixel(0, 0, 1)
    }
})
forever(function () { others += 1 })
game.onUpdate(function () { ticks += 1 })
`, `${HEAD}
forever(function () {
    alive += 1
})
forever(function () { others += 1 })
game.onUpdate(function () { ticks += 1 })
`);

scenario('an overlap handler that dies leaves its pair overlapping for good', `${HEAD}
let wall = sprites.create(${OTHER}, SpriteKind.Enemy)
wall.setPosition(80, 60)
mover.setPosition(10, 60)
mover.vx = 60
mover.setBounceOnWall(true)
sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function (sprite, otherSprite) {
    hits += 1
    missing.setImage(${OTHER})
})
game.onUpdate(function () { ticks += 1 })
`, `${HEAD}
let wall = sprites.create(${OTHER}, SpriteKind.Enemy)
wall.setPosition(80, 60)
mover.setPosition(10, 60)
mover.vx = 60
mover.setBounceOnWall(true)
sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function (sprite, otherSprite) {
    hits += 1
})
game.onUpdate(function () { ticks += 1 })
`);

// Every property, method and read of a missing Sprite or Image throws in PXT; each fiber ends at the call.
const handlerPair = (faulty, healthy) => [`${HEAD}
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    taps += 1
    ${faulty}
    taps += 100
})
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { others += 1 })
game.onUpdate(function () { ticks += 1 })
`, `${HEAD}
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    taps += 1
    ${healthy}
    taps += 100
})
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { others += 1 })
game.onUpdate(function () { ticks += 1 })
`];
for (const [name, faulty, healthy] of [
    ['a Sprite property setter on a null Sprite', 'missing.x = 5', 'mover.x = 5'],
    ['a Sprite velocity setter on a null Sprite', 'missing.vy = 5', 'mover.vy = 5'],
    ['setPosition on a null Sprite', 'missing.setPosition(5, 5)', 'mover.setPosition(5, 5)'],
    ['getPixel on a null Image', 'hits += nul.getPixel(0, 0)', 'hits += list.length'],
    ['an Image width read on a null Image', 'hits += nul.width', 'hits += list.length'],
    ['an Image height read on an undefined Image', 'hits += list[-2].height', 'hits += list.length'],
    ['scroll on a null Image', 'nul.scroll(1, 1)', 'hits += 0']
]) scenario(name + ' ends the button fiber and locks that button', ...handlerPair(faulty, healthy).map(text => text.replace('let mover =', 'let other = sprites.create(' + OTHER + ', SpriteKind.Enemy)\nlet mover =')));

scenario('a life-zero callback that dies ends the frame fiber: sprites, timers and screen stop', `${HEAD}
info.setLife(2)
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { info.changeLifeBy(-1) })
info.onLifeZero(function () {
    nul.setPixel(0, 0, 1)
})
game.onUpdateInterval(100, function () { ticks += 1 })
`, `${HEAD}
info.setLife(2)
controller.B.onEvent(ControllerButtonEvent.Pressed, function () { info.changeLifeBy(-1) })
info.onLifeZero(function () {
    others += 1
})
game.onUpdateInterval(100, function () { ticks += 1 })
`);

scenario('a countdown-end callback that dies ends the frame fiber', `${HEAD}
info.startCountdown(1)
info.onCountdownEnd(function () {
    nul.setPixel(0, 0, 1)
})
game.onUpdateInterval(100, function () { ticks += 1 })
`, `${HEAD}
info.startCountdown(1)
info.onCountdownEnd(function () {
    others += 1
})
game.onUpdateInterval(100, function () { ticks += 1 })
`);

test('non-image values and an undefined image on a real sprite are not faults', {timeout: 400000}, async () => {
    const result = await compare(`${HEAD}
let anything: any = 5
game.onUpdate(function () {
    ticks += 1
    screen.drawImage(anything, 10, 10)
    screen.drawTransparentImage(anything, 20, 10)
    mover.setImage(list[-2])
})
forever(function () { alive += 1 })
`);
    assert.equal(result.same, 'identical', JSON.stringify(result.scripts));
});
