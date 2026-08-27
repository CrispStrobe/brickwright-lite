/**
 * MakeCode TypeScript → pseudocode, and the pseudocode → blocks.
 *
 * The important assertion in this file is not "the translator produced a
 * string". It is that **SB3Creator parses that string and emits the
 * blocks the program meant** — because the failure mode this translator
 * can have is producing pseudocode that looks right and compiles to
 * nothing. Three spellings did exactly that during development:
 * `show text <expression>`, `plot x <var>`, `set pin P0 to <var>` all
 * parse without error and silently yield no block, because those slots
 * are literal-only in the grammar. The slot tests below pin the
 * workarounds that were adopted instead.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';
import {parseMakeCodeTs, tokenize} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {
    microbitToPseudocode,
    ledPattern
} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {MICROBIT_ICONS, MICROBIT_ARROWS} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-icons.js';

const COMPILER = join(INTEGRATED, 'src', 'lib', 'sb3-creator.js');
const canCompile = existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;

const fixture = name =>
    new Uint8Array(readFileSync(join(REPO, 'test', 'fixtures', 'makecode', name)));

/** Compile pseudocode and return the set of opcodes it produced. */
const opcodesOf = source => {
    const creator = new SB3Creator();
    const project = creator.parse(source);
    const ops = new Set();
    for (const target of project.targets) {
        for (const block of Object.values(target.blocks || {})) {
            if (block && block.opcode) ops.add(block.opcode);
        }
    }
    return ops;
};

const translate = ts => microbitToPseudocode(ts).code;

test('the lexer keeps template literals whole', () => {
    const toks = tokenize('basic.showLeds(`# . #\n. # .`)');
    const template = toks.find(t => t.type === 'template');
    assert.ok(template, 'img/LED literals must survive as one token');
    assert.match(template.value, /#/);
});

test('the parser survives the TypeScript MakeCode actually emits', () => {
    const ast = parseMakeCodeTs(`
        enum ActionKind { Idle, Walking = 5, Jumping }
        namespace SpriteKind { export const Coin = SpriteKind.create() }
        let ball: Sprite = null
        function helper (a: number, b: string): void { return }
        sprites.onOverlap(SpriteKind.Player, SpriteKind.Coin, function (sprite, other) { })
        controller.moveSprite(ball, 100, 0)
    `);
    const kinds = ast.body.map(n => n.type);
    assert.ok(kinds.includes('Enum'), 'enum');
    assert.ok(kinds.includes('Namespace'), 'namespace');
    assert.ok(kinds.includes('Declaration'), 'annotated declaration');
    assert.ok(kinds.includes('FunctionDeclaration'), 'annotated function');
    assert.equal(kinds.filter(k => k === 'ExpressionStatement').length, 2);
});

test('LED literals become a brightness grid, and a malformed one does not', () => {
    assert.equal(
        ledPattern({type: 'Template', value: '\n# . . . #\n. # . # .\n. . # . .\n. # . # .\n# . . . #\n'}),
        '90009:09090:00900:09090:90009');
    assert.equal(ledPattern({type: 'Template', value: '# #'}), '00000:00000:00000:00000:00000');
    assert.equal(ledPattern(null), '00000:00000:00000:00000:00000');
});

test('a real MakeCode micro:bit project translates whole', async () => {
    const res = await unpackMakeCodeSource(fixture('microbit-blocks.hex'));
    const out = microbitToPseudocode(res.files['main.ts'], {name: 'pins test 1'});
    assert.match(out.code, /^DEVICE MICROBIT/);
    assert.match(out.code, /FOREVER:/);
    assert.match(out.code, /display analog value of pin P0/);
    assert.deepEqual(out.unsupported, [], 'this project needs no excuses');
});

test('event handlers become polling scripts of their own', () => {
    const code = translate(`
        input.onButtonPressed(Button.A, function () { basic.clearScreen() })
        basic.forever(function () { basic.pause(100) })
    `);
    // Two hats, because MakeCode ran two things at once.
    assert.equal(code.match(/WHEN flag clicked:/g).length, 2);
    assert.match(code, /IF read button_a THEN:/);
    assert.match(code, /wait until not \(read button_a\)/, 'edge-triggered, not once per frame');
});

test('a call with no mapping is reported, not swallowed', () => {
    const out = microbitToPseudocode('serial.writeLine("hello")\nbasic.clearScreen()');
    assert.match(out.code, /# unsupported: serial\.writeLine\(\)/);
    assert.ok(out.unsupported.some(u => /serial\.writeLine/.test(u)));
    assert.match(out.code, /clear display/, 'the rest of the program still translates');
});

test('slot rules: computed arguments are hoisted, not inlined', () => {
    const code = translate('pins.servoWritePin(AnalogPin.P2, i * 30)');
    // `set pin P2 servo i * 30` parses to nothing: the slot takes one token.
    assert.match(code, /set _mc\d+ to i \* 30/);
    assert.match(code, /set pin P2 servo _mc\d+/);
});

test('slot rules: a computed pin level becomes the choice it really is', () => {
    const code = translate('pins.digitalWritePin(DigitalPin.P0, level)');
    assert.match(code, /IF not \(level = 0\) THEN:/);
    assert.match(code, /set pin P0 to 1/);
    assert.match(code, /set pin P0 to 0/);
});

test('slot rules: plot takes literal coordinates, and says so otherwise', () => {
    assert.match(translate('led.plot(2, 3)'), /plot x 2 y 3 on/);
    const computed = microbitToPseudocode('led.plot(x, 3)');
    assert.match(computed.code, /# unsupported: led\.plot\(\)/);
});

test('MakeCode analog values are rescaled to our percentage slot', () => {
    assert.match(translate('pins.analogWritePin(AnalogPin.P1, 1023)'), /set pin P1 analog 100 %/);
    assert.match(translate('pins.analogWritePin(AnalogPin.P1, 0)'), /set pin P1 analog 0 %/);
});

test('the emitted pseudocode compiles to the blocks it names', {skip: canCompile ? false :
    'packages/scratch-gui not integrated — run `npm run integrate` first'}, async () => {
    const res = await unpackMakeCodeSource(fixture('microbit-blocks.hex'));
    const out = microbitToPseudocode(res.files['main.ts']);
    const ops = opcodesOf(out.code);
    assert.ok(ops.has('event_whenflagclicked'), 'a hat');
    assert.ok(ops.has('control_forever'));
    assert.ok(ops.has('microbitplus_analogread'), 'the sensor read survived as a reporter');
    assert.ok(ops.has('microbit_display'), 'and it is displayed');
});

test('every mapped API reaches a block — the anti-silence gate', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // One program exercising the whole table. Each entry names the opcode
    // its line must produce; a slot rule that regresses drops the opcode
    // instead of failing to parse, which is exactly what this catches.
    const program = `
        basic.showLeds(\`
            # . . . #
            . # . # .
            . . # . .
            . # . # .
            # . . . #
            \`)
        basic.showNumber(input.lightLevel())
        basic.showString("hi")
        basic.clearScreen()
        basic.pause(100)
        led.plot(1, 2)
        led.unplot(1, 2)
        pins.digitalWritePin(DigitalPin.P0, 1)
        pins.analogWritePin(AnalogPin.P1, 512)
        pins.servoWritePin(AnalogPin.P2, 90)
        pins.setPull(DigitalPin.P0, PinPullMode.PullUp)
        music.playTone(440, 500)
        music.stopAllSounds()
        radio.setGroup(3)
        radio.sendNumber(input.temperature())
        radio.sendString("ping")
        basic.forever(function () {
            if (input.buttonIsPressed(Button.A) && input.acceleration(Dimension.X) > 100) {
                basic.showNumber(input.compassHeading())
            }
            if (input.isGesture(Gesture.Shake)) { basic.showNumber(input.soundLevel()) }
            if (input.pinIsPressed(TouchPin.P1)) { basic.showNumber(pins.digitalReadPin(DigitalPin.P2)) }
            basic.showNumber(input.rotation(Rotation.Pitch))
            basic.showNumber(input.magneticForce(Dimension.Z))
            basic.showNumber(Math.randomRange(1, 6))
        })
    `;
    const out = microbitToPseudocode(program);
    assert.deepEqual(out.unsupported, [], 'nothing in this program should need an excuse');
    const ops = opcodesOf(out.code);
    for (const expected of [
        'microbitplus_showmatrix', 'microbit_display', 'microbitplus_scrolltext',
        'microbitplus_cleardisplay', 'control_wait', 'microbitplus_plot',
        'microbitplus_digitalwrite', 'microbitplus_analogwrite', 'microbitplus_servo',
        'microbitplus_setpull', 'microbitplus_playtone', 'microbitplus_stoptone',
        'microbitplus_radioon', 'microbitplus_radiosendnum', 'microbitplus_radiosendstr',
        'microbitplus_isbutton', 'microbitplus_accel', 'microbitplus_compass',
        'microbitplus_isgesture', 'microbitplus_istouch', 'microbitplus_digitalread',
        'microbitplus_pitch', 'microbitplus_magforce', 'microbitplus_light',
        'microbitplus_temp', 'microbitplus_sound', 'operator_random'
    ]) {
        assert.ok(ops.has(expected), `${expected} is missing — a mapping compiled to silence`);
    }
});

test('gestures and touch translate, now that the round trip reads them', () => {
    // These two were REFUSED until sb3-creator b4a8129: `<gesture> happening`
    // and `pin P touched` came out of its decompiler and had no rule going
    // back in, so writing them compiled to a comparison against an
    // undefined name. The compiler fix is what turned these into blocks.
    const gesture = microbitToPseudocode(
        'input.onGesture(Gesture.Shake, function () { basic.clearScreen() })');
    assert.deepEqual(gesture.unsupported, []);
    assert.match(gesture.code, /IF shake happening THEN:/);

    const tilt = microbitToPseudocode(
        'basic.forever(function () { if (input.isGesture(Gesture.TiltLeft)) { basic.clearScreen() } })');
    assert.deepEqual(tilt.unsupported, []);
    // MakeCode names the gesture for the LOGO, the block menu for the tilt.
    assert.match(tilt.code, /IF tilt left happening THEN:/);

    const touch = microbitToPseudocode(
        'basic.forever(function () { if (input.pinIsPressed(TouchPin.P1)) { basic.clearScreen() } })');
    assert.deepEqual(touch.unsupported, []);
    assert.match(touch.code, /IF pin P1 touched THEN:/);
});

test('icons are the same bitmaps on both sides, not an approximation', () => {
    // MakeCode's IconNames and MicroPython's built-in images trace to one
    // table, and `show pattern` lowers to display.show() — so this is an
    // identity, and showIcon must never be refused.
    const out = microbitToPseudocode(
        'basic.showIcon(IconNames.Heart)\nbasic.showArrow(ArrowNames.North)');
    assert.deepEqual(out.unsupported, []);
    assert.match(out.code, /show pattern 09090:99999:99999:09990:00900/, 'the heart');
    assert.match(out.code, /show pattern 00900:09990:90909:00900:00900/, 'the north arrow');

    // An icon we have no pattern for is named, not silently blanked.
    const unknown = microbitToPseudocode('basic.showIcon(IconNames.Nonexistent)');
    assert.match(unknown.code, /# unsupported: basic\.showIcon\(Nonexistent\)/);
});

test('every icon in the table is a well-formed 5x5 pattern', () => {
    const all = {...MICROBIT_ICONS, ...MICROBIT_ARROWS};
    assert.equal(Object.keys(MICROBIT_ICONS).length, 40, "MakeCode's icon set");
    assert.equal(Object.keys(MICROBIT_ARROWS).length, 8);
    for (const [name, pattern] of Object.entries(all)) {
        assert.match(pattern, /^[0-9]{5}(:[0-9]{5}){4}$/, `${name} is not a 5x5 grid`);
    }
    // A blank icon would import as a program that shows nothing at all.
    const blank = Object.entries(all).filter(([, p]) => !/[1-9]/.test(p));
    assert.deepEqual(blank, [], 'no icon should be empty');
});
