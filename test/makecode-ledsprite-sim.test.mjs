/**
 * lite's LED sprite model against MakeCode's OWN simulator.
 *
 * A MakeCode sprite program is run twice: as MakeCode wrote it, in
 * pxt-microbit's simulator (scripts/lib/makecode-sim.mjs — pxt compiles it and
 * sim.js runs it, headless, on a virtual clock), and as lite imports it, in
 * lite's micro:bit simulator firmware (scripts/lib/microbit-firmware.mjs — the
 * MicroPython sb3-creator emits, whose sprite model is written from
 * pxt-microbit's libs/core/game.ts). Each program prints the sprites' state as
 * it goes; the two transcripts must be the same line for line, and the LEDs
 * must show the same picture at the same moments.
 *
 * The sequences are scripted to reach every branch a reader of game.ts would
 * worry about: direction rounding (floored, JavaScript's remainder), every
 * move direction and the -135 fall-through, each bounce including the
 * corners, clamping, brightness and blink limits, touching with a deleted
 * sprite, the summed brightness of two sprites on one LED, blinking, pause and
 * resume, the countdown's intro and its game over, lives, and a blink that is
 * NaN because MakeCode never initialises it.
 *
 * The vendored micro:bit+ extension keeps the same state for the editor, so
 * its methods are driven through the first sequence too.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {SOURCE, REPO} from './helpers/bw-integrated.mjs';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {compileMakeCode, runMakeCodeSim, makeCodeSimAvailable} from '../scripts/lib/makecode-sim.mjs';
import {runOnMicrobitFirmware} from '../scripts/lib/microbit-firmware.mjs';

const COMPILER = join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const SB3Creator = existsSync(COMPILER) ? (await import(COMPILER)).default : null;
const skip = !makeCodeSimAvailable() ? 'MakeCode runtime not synced (npm run sync:makecode): no pxt-microbit simulator to compare with' :
    !SB3Creator ? 'sb3-creator not integrated' : false;

/** MakeCode's run and lite's run of the same program. */
async function both (ts, {ms = 3000, at = []} = {}) {
    const mc = await runMakeCodeSim(await compileMakeCode(ts), {ms, at});
    assert.equal(mc.error, null, `MakeCode's simulator stopped: ${mc.error}`);
    const imported = microbitToPseudocode(ts);
    assert.deepEqual(imported.unsupported, [], `lite refused part of it:\n${imported.code}`);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    const gen = creator.generateMicroPython();
    assert.ok(gen.ok, `no MicroPython: ${JSON.stringify(gen.reasons)}`);
    const runLite = async until => {
        const r = await runOnMicrobitFirmware(gen.py, {ms: until});
        assert.equal(r.traceback, null, `lite's firmware stopped:\n${r.traceback}\n---\n${imported.code}`);
        return r;
    };
    const lite = await runLite(ms);
    const frames = {};
    for (const t of at) frames[t] = (await runLite(t)).pixels.flat();
    return {
        mc: {lines: mc.serial.map(l => l.text), serial: mc.serial, frames: mc.frames},
        lite: {lines: lite.out.split(/\r?\n/).map(l => l.trim()).filter(Boolean), frames},
        code: imported.code
    };
}

/** MakeCode's 0..255 brightness as the 0..9 level lite draws it (anything lit stays lit). */
const level = b => Math.floor((b * 9 + 254) / 255);
const picture = px => [0, 1, 2, 3, 4].map(y => px.slice(y * 5, y * 5 + 5).join(' ')).join(' / ');

const sameFrames = (r, times) => {
    for (const t of times) {
        assert.equal(picture(r.lite.frames[t]), picture(r.mc.frames[t].map(level)), `the LEDs differ at ${t} ms`);
    }
};

const MOTION = `
let s = game.createSprite(2, 2)
let turns = [45, 90, 135, 180, -45, -90, -135, 315, 50, -10, 225, -180, 360, 181, 270, -200, -405, 720]
let n = 0
serial.writeLine("" + s.get(LedSpriteProperty.X) + "," + s.get(LedSpriteProperty.Y) + "," + s.get(LedSpriteProperty.Direction))
for (let d of turns) {
    s.set(LedSpriteProperty.Direction, d)
    serial.writeLine("dir " + d + " -> " + s.get(LedSpriteProperty.Direction))
}
s.set(LedSpriteProperty.Direction, 90)
for (let i = 0; i < 40; i++) {
    s.move(1)
    s.ifOnEdgeBounce()
    n += 1
    if (n % 3 == 0) {
        s.turn(Direction.Right, 45)
    }
    if (n % 7 == 0) {
        s.turn(Direction.Left, 135)
    }
    serial.writeLine("" + s.get(LedSpriteProperty.X) + "," + s.get(LedSpriteProperty.Y) + "," + s.get(LedSpriteProperty.Direction))
}
s.change(LedSpriteProperty.Direction, 100)
s.move(-7)
serial.writeLine("" + s.get(LedSpriteProperty.X) + "," + s.get(LedSpriteProperty.Y) + "," + s.get(LedSpriteProperty.Direction))
`;

test('motion: direction rounding, every move and bounce, as MakeCode\'s simulator does it', {skip}, async () => {
    const r = await both(MOTION, {ms: 3000});
    assert.ok(r.mc.lines.length >= 60, `MakeCode printed only ${r.mc.lines.length} lines`);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

test('every corner bounce: a sprite put at each edge cell facing each way', {skip}, async () => {
    const r = await both(`
let dirs = [0, 45, 90, 135, 180, -45, -90, -135]
let cells = [0, 2, 4]
for (let d of dirs) {
    for (let x of cells) {
        for (let y of cells) {
            let s = game.createSprite(x, y)
            s.set(LedSpriteProperty.Direction, d)
            s.ifOnEdgeBounce()
            serial.writeLine("" + x + "," + y + "," + d + " -> " + s.get(LedSpriteProperty.Direction))
            s.delete()
        }
    }
}
`, {ms: 3000});
    assert.equal(r.mc.lines.length, 72);
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

test('properties: clamping, brightness and blink limits, touching, the edge, deleting', {skip}, async () => {
    const r = await both(`
let a = game.createSprite(7, -3)
let b = game.createSprite(4, 0)
let c = game.createSprite(1, 1)
serial.writeLine("" + a.get(LedSpriteProperty.X) + "," + a.get(LedSpriteProperty.Y) + "," + a.get(LedSpriteProperty.Brightness))
if (a.isTouching(b)) {
    serial.writeLine("a touches b")
}
if (a.isTouching(c)) {
    serial.writeLine("a touches c")
}
if (c.isTouchingEdge()) {
    serial.writeLine("c on edge")
}
if (a.isTouchingEdge()) {
    serial.writeLine("a on edge")
}
c.change(LedSpriteProperty.X, -5)
c.change(LedSpriteProperty.Y, 9)
serial.writeLine("" + c.get(LedSpriteProperty.X) + "," + c.get(LedSpriteProperty.Y))
c.set(LedSpriteProperty.Brightness, 300)
serial.writeLine("" + c.get(LedSpriteProperty.Brightness))
c.change(LedSpriteProperty.Brightness, -400)
serial.writeLine("" + c.get(LedSpriteProperty.Brightness))
c.set(LedSpriteProperty.Blink, 20000)
serial.writeLine("" + c.get(LedSpriteProperty.Blink))
c.change(LedSpriteProperty.Blink, -30000)
serial.writeLine("" + c.get(LedSpriteProperty.Blink))
b.delete()
if (a.isTouching(b)) {
    serial.writeLine("a still touches b")
}
if (b.isDeleted()) {
    serial.writeLine("b deleted")
}
if (b.isTouchingEdge()) {
    serial.writeLine("b on edge")
}
b.change(LedSpriteProperty.X, -1)
serial.writeLine("deleted b moved to " + b.get(LedSpriteProperty.X))
`, {ms: 2000});
    assert.ok(r.mc.lines.includes('b deleted'), r.mc.lines.join('\n'));
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

test('the screen: summed brightness, deleted sprites gone, blinking by the clock, NaN blink never off', {skip}, async () => {
    // 220, 410, 610: just after the blinking sprite turns (every 200 ms), before
    // the engine's next redraw — every 50 ms from 30 (pause 30, plot, and the
    // 20 ms forever waits), so the change shows at 230, 430, 630.
    const at = [100, 220, 250, 410, 430, 610, 700, 1050];
    const r = await both(`
let a = game.createSprite(1, 1)
let b = game.createSprite(1, 1)
let c = game.createSprite(3, 4)
let d = game.createSprite(0, 0)
let e = game.createSprite(4, 0)
let g = game.createSprite(2, 2)
a.set(LedSpriteProperty.Brightness, 60)
b.set(LedSpriteProperty.Brightness, 60)
c.set(LedSpriteProperty.Brightness, 8)
e.set(LedSpriteProperty.Blink, 200)
g.change(LedSpriteProperty.Blink, 100)
d.delete()
basic.forever(function () {
    basic.pause(10000)
})
`, {ms: 1100, at});
    sameFrames(r, at);
    // Not vacuous: the blinking sprite is on at one snapshot and off at another.
    const e = t => r.mc.frames[t][4];
    assert.ok(at.some(t => e(t) > 0) && at.some(t => e(t) === 0), 'the blink never showed a change');
});

test('pause and resume the sprite engine; running needs a sprite', {skip}, async () => {
    // pause() draws the sprites once more first: the LED the program lit is gone at 150.
    const at = [150, 450, 650];
    const r = await both(`
if (game.isRunning()) {
    serial.writeLine("running before any sprite")
}
let s = game.createSprite(0, 0)
if (game.isRunning()) {
    serial.writeLine("running")
}
basic.pause(100)
led.plot(4, 4)
game.pause()
s.move(2)
if (game.isPaused()) {
    serial.writeLine("paused")
}
if (game.isRunning()) {
    serial.writeLine("running while paused")
}
basic.pause(300)
game.resume()
if (game.isPaused()) {
    serial.writeLine("still paused")
}
s.move(1)
basic.pause(100)
serial.writeLine("" + s.get(LedSpriteProperty.X))
`, {ms: 800, at});
    assert.deepEqual(r.lite.lines, r.mc.lines);
    sameFrames(r, at);
});

test('the countdown: its intro holds the caller 3.6 s, then game over comes max(500, ms) after it', {skip}, async () => {
    const at = [300, 2500, 3300, 3700, 4250];
    const r = await both(`
let s = game.createSprite(2, 2)
serial.writeLine("start")
game.startCountdown(100)
serial.writeLine("after " + Math.idiv(input.runningTime(), 100))
basic.forever(function () {
    if (game.isGameOver()) {
        serial.writeLine("over " + Math.idiv(input.runningTime(), 100))
        basic.pause(100000)
    }
    basic.pause(50)
})
`, {ms: 4400, at});
    assert.deepEqual(r.lite.lines, r.mc.lines);
    assert.deepEqual(r.mc.lines.slice(0, 2), ['start', 'after 36'], 'MakeCode\'s own timing moved');
    sameFrames(r, at);
});

test('lives: set, add, and the last one is game over', {skip}, async () => {
    const r = await both(`
serial.writeLine("" + game.life())
game.addLife(2)
serial.writeLine("" + game.life())
game.setLife(1)
serial.writeLine("" + game.life())
game.removeLife(1)
serial.writeLine("unreached")
`, {ms: 600});
    assert.deepEqual(r.lite.lines, r.mc.lines);
});

test('MakeCode\'s own sprite apps behave the same: snap-the-dot and hero\'s ghost', {skip}, async () => {
    // snap-the-dot (projects/snap-the-dot) as MakeCode wrote it, with the dot's
    // position printed. A real basic.forever: it waits 20 ms after every pass
    // in MakeCode (CODAL's forever_stub) and, since sb3-creator#31, in lite.
    const snap = await both(`
let sprite = game.createSprite(2, 2)
basic.forever(function () {
    sprite.move(1)
    sprite.ifOnEdgeBounce()
    serial.writeLine("" + sprite.get(LedSpriteProperty.X))
    basic.pause(100)
})
`, {ms: 1500, at: [555, 1255]});
    assert.deepEqual(snap.lite.lines, snap.mc.lines);
    sameFrames(snap, [555, 1255]);
    // hero's ghost: a blink changed on a fresh sprite (NaN), a dim food.
    const hero = await both(`
let hero = game.createSprite(2, 2)
let food = game.createSprite(4, 4)
let ghost = game.createSprite(0, 0)
ghost.change(LedSpriteProperty.Blink, 100)
food.set(LedSpriteProperty.Brightness, 8)
for (let i = 0; i < 6; i++) {
    basic.pause(400)
    if (ghost.get(LedSpriteProperty.X) < hero.get(LedSpriteProperty.X)) {
        ghost.change(LedSpriteProperty.X, 1)
    } else if (ghost.get(LedSpriteProperty.Y) < hero.get(LedSpriteProperty.Y)) {
        ghost.change(LedSpriteProperty.Y, 1)
    }
    if (hero.isTouching(ghost)) {
        serial.writeLine("caught")
    }
    serial.writeLine("" + ghost.get(LedSpriteProperty.X) + "," + ghost.get(LedSpriteProperty.Y))
}
`, {ms: 2600, at: [150, 1330]});
    assert.deepEqual(hero.lite.lines, hero.mc.lines);
    sameFrames(hero, [150, 1330]);
});

// ── the editor's copy of the model (the vendored micro:bit+ extension) ────

/** The micro:bit+ extension as lite vendors it, instantiated against a stand-in Scratch. */
function microbitPlus () {
    const bundle = readFileSync(join(REPO, 'overlay/scratch-vm/src/extensions/crispstrobe/microbitplus/index.js'), 'utf8');
    const source = JSON.parse(bundle.slice(bundle.indexOf('makeExt(') + 'makeExt('.length, bundle.lastIndexOf(')')));
    let instance = null;
    const Scratch = {
        BlockType: {}, ArgumentType: {}, TargetType: {}, Cast: {}, vm: null,
        translate: m => m,
        extensions: {register: i => { instance = i; }, unsandboxed: true}
    };
    new Function('Scratch', source)(Scratch); // eslint-disable-line no-new-func
    return instance;
}

test('the extension keeps the same state as MakeCode for the motion sequence (the editor\'s view of a sprite)',
    {skip: skip || (!existsSync(join(REPO, 'overlay/scratch-vm/src/extensions/crispstrobe/microbitplus/index.js')) && 'no vendored extension')},
    async () => {
        const ext = microbitPlus();
        assert.equal(typeof ext.createsprite, 'function', 'the vendored micro:bit+ has no sprite blocks (pin not moved?)');
        const mc = (await runMakeCodeSim(await compileMakeCode(MOTION), {ms: 500})).serial.map(l => l.text);
        const out = [];
        const s = ext.createsprite({X: 2, Y: 2});
        const get = p => ext.spriteget({SPRITE: s, PROPERTY: p});
        out.push(`${get('x')},${get('y')},${get('direction')}`);
        for (const d of [45, 90, 135, 180, -45, -90, -135, 315, 50, -10, 225, -180, 360, 181, 270, -200, -405, 720]) {
            ext.spriteset({SPRITE: s, PROPERTY: 'direction', VALUE: d});
            out.push(`dir ${d} -> ${get('direction')}`);
        }
        ext.spriteset({SPRITE: s, PROPERTY: 'direction', VALUE: 90});
        for (let n = 1; n <= 40; n++) {
            ext.spritemove({SPRITE: s, LEDS: 1});
            ext.spritebounce({SPRITE: s});
            if (n % 3 === 0) ext.spriteturn({SPRITE: s, DIRECTION: 'right', DEGREES: 45});
            if (n % 7 === 0) ext.spriteturn({SPRITE: s, DIRECTION: 'left', DEGREES: 135});
            out.push(`${get('x')},${get('y')},${get('direction')}`);
        }
        ext.spritechange({SPRITE: s, PROPERTY: 'direction', VALUE: 100});
        ext.spritemove({SPRITE: s, LEDS: -7});
        out.push(`${get('x')},${get('y')},${get('direction')}`);
        assert.deepEqual(out, mc);
    });
