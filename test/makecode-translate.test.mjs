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

import {SOURCE, REPO} from './helpers/bw-integrated.mjs';
import {parseMakeCodeTs, tokenize} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {
    microbitToPseudocode,
    ledPattern
} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {MICROBIT_ICONS, MICROBIT_ARROWS} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-icons.js';

const COMPILER = join(SOURCE, 'src', 'lib', 'sb3-creator.js');
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
    // (serial.writeLine was the example here until it got a mapping — `print`.)
    const out = microbitToPseudocode('serial.writeValue("x", 1)\nbasic.clearScreen()');
    assert.match(out.code, /# unsupported: serial\.writeValue\(\)/);
    assert.ok(out.unsupported.some(u => /serial\.writeValue/.test(u)));
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

test('slot rules: plot takes a computed coordinate, since sb3-creator#4', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // This slot USED to be literal-only, and a computed coordinate was
    // refused — not because the block cannot hold one (X and Y are inputs)
    // but because only `plot x <digits> y <digits>` had a parse rule, so
    // `plot x spalte y 2 on` matched nothing and produced NO BLOCK. Fixed
    // upstream; the refusal went with it. `led.plot(x, y)` with variable
    // coordinates is the ordinary way a Calliope programme draws.
    assert.match(translate('led.plot(2, 3)'), /plot x 2 y 3 on/);

    const computed = microbitToPseudocode('let spalte = 0\nled.plot(spalte, 3)');
    assert.deepEqual(computed.unsupported, []);
    assert.match(computed.code, /plot x spalte_? y 3 on/);
    assert.ok(opcodesOf(computed.code).has('microbitplus_plot'),
        'the computed coordinate has to reach a real block, not just parse');
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
        'microbitplus_showleds', 'microbit_display', 'microbitplus_scrolltext',
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
    assert.match(out.code, /show icon 09090:99999:99999:09990:00900/, 'the heart');
    assert.match(out.code, /show icon 00900:09990:90909:00900:00900/, 'the north arrow');

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

// ── Batch 1 of the MakeCode census (2026-09-25) ────────────────────────────
//
// The calls MakeCode's own 215 micro:bit apps most often made the import
// REFUSE (plotBarGraph 15 apps, addScore 11, setBrightness 9, stopAnimation
// 6, gameOver 5, randomBoolean 3, toggle 3, removeLife 2, pins.map 2,
// idiv 2) or LOSE without a word (Math.max/min 10, game.score 5). Each now
// has a spelling the dialect parses to a real block (sb3-creator) and a
// MicroPython lowering the simulator runs.

const BATCH_1 = [
    // [MakeCode, the line it imports to, the opcode that line compiles to]
    ['led.plotBarGraph(input.lightLevel(), 255)', 'plot bar graph of (read light) up to 255', 'microbitplus_plotbargraph'],
    ['led.toggle(1, 2)', 'toggle x 1 y 2', 'microbitplus_toggle'],
    ['led.setBrightness(v * 2)', 'set display brightness to (v * 2)', 'microbitplus_setbrightness'],
    ['led.stopAnimation()', 'stop animation', 'microbitplus_stopanimation'],
    ['game.addScore(1)', 'change game score by 1', 'microbitplus_addscore'],
    ['game.setScore(4)', 'set game score to 4', 'microbitplus_setscore'],
    ['game.removeLife(1)', 'remove game life 1', 'microbitplus_removelife'],
    ['game.gameOver()', 'game over', 'microbitplus_gameover'],
    ['basic.showNumber(game.score())', 'display game score', 'microbitplus_score'],
    ['v = pins.map(v, 0, 1023, 0, 4)', 'set v to map v from low 0 high 1023 to low 0 high 4', 'microbitplus_map'],
    ['v = Math.map(v, 0, 10, 0, 100)', 'set v to map v from low 0 high 10 to low 0 high 100', 'microbitplus_map'],
    ['v = Math.min(v, 3)', 'set v to min of v and 3', 'planetemaths_min'],
    ['v = Math.max(v - 1, 0)', 'set v to max of (v - 1) and 0', 'planetemaths_max'],
    ['v = Math.idiv(v, 4)', 'set v to ((v / 4) bitor 0)', 'bitops_or'],
    ['if (Math.randomBoolean()) { basic.clearScreen() }', 'IF (pick random 0 to 1) = 1 THEN:', 'operator_random']
];

for (const [ts, line, opcode] of BATCH_1) {
    test(`census batch 1: \`${ts}\` imports as \`${line}\` → ${opcode}`, {skip: canCompile ? false :
        'packages/scratch-gui not integrated'}, () => {
        const out = microbitToPseudocode(`let v = 0\nbasic.forever(function () {\n    ${ts}\n})\n`);
        assert.deepEqual(out.unsupported, [], 'nothing refused');
        assert.ok(out.code.includes(line), `\`${line}\` not in:\n${out.code}`);
        assert.ok(opcodesOf(out.code).has(opcode), `${opcode} missing: the line parsed to nothing`);
    });
}

test('Math.min and Math.max keep BOTH arguments (they kept only the first)', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // `Math.max(0, x)` came in as `0` — a program that clamps a position
    // came in as one that pins it to the edge, and nothing said so.
    const {code} = microbitToPseudocode('let x = 0\nx = Math.max(0, x - 1)\nx = Math.min(4, x + 1)\n');
    assert.match(code, /set x_ to max of 0 and \(x_ - 1\)/);
    assert.match(code, /set x_ to min of 4 and \(x_ \+ 1\)/);
});

test('a compound argument to abs/floor/sqrt is parenthesised (abs of a - b is |a| - b)', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const {code} = microbitToPseudocode('let a = 0\nlet b = 0\na = Math.abs(a - b)\nb = Math.floor(a / 2)\n');
    assert.match(code, /set a to abs of \(a - b\)/);
    assert.match(code, /set b to floor of \(a \/ 2\)/);
    const creator = new SB3Creator();
    creator.parse(code);
    // the whole difference is inside the abs, not subtracted after it
    assert.match(creator.decompile(), /abs of \(a - b\)/);
});

test('Math.idiv truncates toward zero, as its definition (a / b) | 0 does', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // `floor of (a / b)` would be -4 for -7 / 2; MakeCode's idiv is -3.
    const {code} = microbitToPseudocode('let q = 0\nq = Math.idiv(0 - 7, 2)\nbasic.showNumber(q)\n');
    const creator = new SB3Creator();
    creator.parse(code);
    const mp = creator.generateMicroPython();
    assert.ok(mp.ok, JSON.stringify(mp.reasons));
    assert.match(mp.py, /q = \(int\(\(\(0 - 7\) \/ 2\)\) \| int\(0\)\)/, mp.py);
});

test('game.score() is the game\'s score, not a variable nothing ever set', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const {code} = microbitToPseudocode('game.addScore(2)\nbasic.showNumber(game.score())\n');
    assert.doesNotMatch(code, /display score$/m, 'the old spelling read a variable called score');
    const creator = new SB3Creator();
    creator.parse(code);
    const mp = creator.generateMicroPython();
    assert.ok(mp.ok, JSON.stringify(mp.reasons));
    assert.match(mp.py, /_bw_add_score\(2\)/);
    assert.match(mp.py, /display\.scroll\(str\(_bw_score\)/);
});

test('Math.randomBoolean as a VALUE is the dialect\'s 0/1, not a comparison stored as text', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // `set b to (pick random 0 to 1) = 1` does not parse as a comparison:
    // the set rule stores the TEXT "(pick random 0 to 1) = 1". So the
    // comparison is only written where a condition is expected.
    const {code} = microbitToPseudocode('let b = false\nb = Math.randomBoolean()\nif (Math.randomBoolean()) { b = true }\n');
    assert.match(code, /set b to pick random 0 to 1$/m);
    assert.match(code, /IF \(pick random 0 to 1\) = 1 THEN:/);
    const creator = new SB3Creator();
    creator.parse(code);
    const mp = creator.generateMicroPython();
    assert.ok(mp.ok, JSON.stringify(mp.reasons));
    assert.match(mp.py, /b = random\.randint\(0, 1\)/, mp.py);
    assert.doesNotMatch(mp.py, /b = "/, 'the coin toss became a string');
});

// Batch 2 of the MakeCode census (2026-09-27): the calls lost most often
// WITHOUT a word — radio handlers (20 apps), music.beat (12) — then music,
// A+B, the total magnetic field, text, and truth values stored in variables.
// Each MakeCode call imports to a line that compiles to the block that means it.
const BATCH_2 = [
    // [MakeCode, the line it imports to, the opcode that line compiles to]
    ['music.playTone(music.noteFrequency(Note.C), music.beat(BeatFraction.Quarter))',
        'play tone (frequency of note C) hz for (beat quarter) ms', 'microbitplus_beat'],
    ['music.playTone(Note.FSharp5, 200)', 'play tone (frequency of note FSharp5) hz for 200 ms', 'microbitplus_notefreq'],
    ['music.ringTone(440)', 'play tone 440 hz', 'microbitplus_playtone'],
    ['music.rest(music.beat(BeatFraction.Half))', 'rest for (beat half) ms', 'microbitplus_rest'],
    ['music.setTempo(90)', 'set music tempo to 90', 'microbitplus_settempo'],
    ['music.changeTempoBy(-20)', 'change music tempo by (0 - 20)', 'microbitplus_changetempo'],
    ['v = music.tempo()', 'set v to music tempo', 'microbitplus_tempo'],
    ['music._playDefaultBackground(music.builtInPlayableMelody(Melodies.Dadadadum), music.PlaybackMode.InBackground)',
        'play melody Dadadadum in background', 'microbitplus_playmelody'],
    ['music.play(music.builtInPlayableMelody(Melodies.JumpUp), music.PlaybackMode.UntilDone)',
        'play melody JumpUp until done', 'microbitplus_playmelody'],
    ['if (input.buttonIsPressed(Button.AB)) { basic.clearScreen() }', 'IF read button_ab THEN:', 'microbitplus_isbutton'],
    ['v = input.magneticForce(Dimension.Strength)', 'set v to read magforce absolute', 'microbitplus_magforce'],
    ['basic.showString("n=" + v)', 'show text ("n=" join v)', 'operator_join'],
    ['v = Math.pow(2, v)', 'set v to 2 to the power of v', 'planetemaths_pow'],
    ['serial.writeLine("hi")', 'print "hi"', 'stc12_print'],
    ['serial.writeLine("n=" + v)', 'print ("n=" join v)', 'stc12_print']
];

for (const [ts, line, opcode] of BATCH_2) {
    test(`census batch 2: \`${ts.slice(0, 60)}\` imports as \`${line}\` → ${opcode}`, {skip: canCompile ? false :
        'packages/scratch-gui not integrated'}, () => {
        const out = microbitToPseudocode(`let v = 0\nbasic.forever(function () {\n    ${ts}\n})\n`);
        assert.deepEqual(out.unsupported, [], 'nothing refused');
        assert.ok(out.code.includes(line), `\`${line}\` not in:\n${out.code}`);
        assert.ok(opcodesOf(out.code).has(opcode), `${opcode} missing: the line parsed to nothing`);
    });
}

test('a radio handler is a HAT, and its parameter IS the packet (it was a polling loop)', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // The polled version ran the body on every pass whether or not a packet
    // came, so `clock += 1` per packet counted the loop instead.
    const {code, unsupported} = microbitToPseudocode([
        'let clock = 0',
        'radio.onReceivedNumber(function (receivedNumber) {',
        '    clock += receivedNumber',
        '})',
        'radio.onReceivedString(function (s) {',
        '    basic.showString(s)',
        '})'
    ].join('\n'));
    assert.deepEqual(unsupported, []);
    assert.match(code, /WHEN radio receives number:\n {2}change clock by read last radio number/);
    assert.match(code, /WHEN radio receives text:\n {2}show text read last radio text/);
    assert.doesNotMatch(code, /FOREVER/, 'still polled');
    const ops = opcodesOf(code);
    for (const op of ['microbitplus_whenradionum', 'microbitplus_whenradiostr', 'microbitplus_radiolastnum',
        'microbitplus_radiolaststr']) assert.ok(ops.has(op), op);
});

test('a handler that assigns its parameter gets a variable to assign', () => {
    const {code} = microbitToPseudocode('radio.onReceivedNumber(function (n) {\n    n += 1\n    basic.showNumber(n)\n})\n');
    assert.match(code, /WHEN radio receives number:\n {2}set n to read last radio number\n {2}change n by 1\n {2}display n/);
});

test('a truth value stored in a variable is stored as the choice it is (it was the TEXT of the comparison)',
    {skip: canCompile ? false : 'packages/scratch-gui not integrated'}, () => {
        // `set isSwitched to force > 100` parses as the string "force > 100",
        // which is never 0 — the trick always thought it was switched.
        const {code, unsupported} = microbitToPseudocode([
            'let force = 0',
            'let isSwitched = false',
            'isSwitched = force > 100',
            'let heat = input.temperature() < 10 ? "COLD" : "WARM"',
            'let both = force > 1 && !isSwitched'
        ].join('\n'));
        assert.deepEqual(unsupported, []);
        assert.match(code, / {2}IF force > 100 THEN:\n {4}set isSwitched to 1\n {2}ELSE:\n {4}set isSwitched to 0/);
        assert.match(code, / {2}IF read temperature < 10 THEN:\n {4}set heat to "COLD"\n {2}ELSE:\n {4}set heat to "WARM"/);
        assert.match(code, /IF \(force > 1\) and \(not \(not \(isSwitched = 0\)\)\) THEN:/);
        const creator = new SB3Creator();
        creator.parse(`DEVICE MICROBIT\nWHEN flag clicked:\n${code.split('\n').filter(l => l.startsWith('  ')).join('\n')}\n`);
        assert.deepEqual(creator.warnings.filter(w => /COMPARISON/.test(String(w.message || w))), [],
            'a comparison was still stored as text');
    });

test('a truth value passed to a function is hoisted as a choice, not as text', () => {
    const {code} = microbitToPseudocode('function f(on: boolean) {\n    basic.showNumber(1)\n}\nlet i = 0\nf(i < 3)\n');
    assert.match(code, /IF i < 3 THEN:\n {4}set _mc1 to 1\n {2}ELSE:\n {4}set _mc1 to 0\n {2}f _mc1/);
});

test('`+` on text is join; a variable that holds text joins too (it was operator_add)', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const {code} = microbitToPseudocode([
        'let time = ""',
        'let minutes = 5',
        'time = "" + minutes',
        'time = time + ":"',
        'time = time + minutes',
        'basic.showString(time)'
    ].join('\n'));
    assert.match(code, /set time to \("" join minutes\)/);
    assert.match(code, /set time to \(time join ":"\)/);
    assert.match(code, /set time to \(time join minutes\)/);
    assert.match(code, /show text time/);
    assert.ok(!opcodesOf(code).has('operator_add'), 'a text + was still an addition');
});

test('radio.sendValue says the name is not sent (it sent the bare number as if that were the same packet)', () => {
    const {code, unsupported} = microbitToPseudocode('radio.sendValue("x", 5)\n');
    assert.match(code, /radio send number 5/);
    assert.ok(unsupported.some(u => /radio\.sendValue\(\) — the name is not sent/.test(u)), unsupported.join('\n'));
});

test('a class and an object literal are refused by name, with the calls inside them', () => {
    const {unsupported} = microbitToPseudocode([
        'class Message {',
        '    constructor() { this.d = control.createBuffer(13) }',
        '    send() { radio.sendBuffer(this.d) }',
        '}',
        'let c = { sprite: game.createSprite(0, 0) }'
    ].join('\n'));
    assert.ok(unsupported.some(u => /class Message.*control\.createBuffer\(\).*radio\.sendBuffer\(\)/.test(u)),
        unsupported.join('\n'));
    assert.ok(!unsupported.some(u => /constructor\(\)|send\(\),/.test(u)), 'a method definition was read as a call');
    assert.ok(unsupported.some(u => /object literal.*game\.createSprite\(\)/.test(u)), unsupported.join('\n'));
});

test('a MakeCode `? :` parses (it stopped the parser, and the rest came out as stray statements)', () => {
    const ast = parseMakeCodeTs('let m = a < 10 ? "COLD" : b ? 1 : 2\n');
    assert.equal(ast.body.length, 1);
    const init = ast.body[0].decls[0].init;
    assert.equal(init.type, 'Conditional');
    assert.equal(init.alternate.type, 'Conditional', 'right-associative');
});
