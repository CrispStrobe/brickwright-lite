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
    assert.match(out.code, /show number analog value of pin P0/);
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
    // (serial.writeLine, then serial.writeValue, was the example here until
    // each got a mapping — `print`.)
    const out = microbitToPseudocode('serial.redirectToUSB()\nbasic.clearScreen()');
    assert.match(out.code, /# unsupported: serial\.redirectToUSB\(\)/);
    assert.ok(out.unsupported.some(u => /serial\.redirectToUSB/.test(u)));
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
    assert.ok(ops.has('microbitplus_shownumber'), 'and it is displayed');
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
        'microbitplus_showleds', 'microbitplus_shownumber', 'microbitplus_scrolltext',
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
    ['basic.showNumber(game.score())', 'show number game score', 'microbitplus_score'],
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
    assert.match(code, /WHEN radio receives number:\n {2}set n to read last radio number\n {2}change n by 1\n {2}show number n/);
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

test('a class that cannot be lowered, and an untyped object literal, are refused by name, with the calls inside them', () => {
    // An accessor (`get kind()`) has no lowering to arrays and procedures, so
    // this class is refused whole, saying why and naming what it calls.
    const {unsupported} = microbitToPseudocode([
        'class Message {',
        '    private d: Buffer',
        '    constructor() { this.d = control.createBuffer(13) }',
        '    get kind(): number { return this.d.getNumber(NumberFormat.Int8LE, 0) }',
        '    send() { radio.sendBuffer(this.d) }',
        '}',
        'let c = { sprite: game.createSprite(0, 0) }'
    ].join('\n'));
    assert.ok(unsupported.some(u => /class Message \(a get accessor \(kind\)\).*control\.createBuffer\(\).*radio\.sendBuffer\(\)/.test(u)),
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

// Batch 3 of the MakeCode census (2026-09-27). Each MakeCode call imports to a
// line that compiles to the block that means it.
const BATCH_3 = [
    ['music.play(music.tonePlayable(262, music.beat(BeatFraction.Whole)), music.PlaybackMode.UntilDone)',
        'play tone 262 hz for (beat whole) ms until done', 'microbitplus_playtonemode'],
    ['music.play(music.tonePlayable(392, 100), music.PlaybackMode.InBackground)',
        'play tone 392 hz for 100 ms in background', 'microbitplus_playtonemode'],
    ['music.play(music.builtinPlayableSoundEffect(soundExpression.giggle), music.PlaybackMode.UntilDone)',
        'play sound giggle until done', 'microbitplus_playsound'],
    ['music.playSoundEffect(music.createSoundEffect(WaveShape.Noise, 4120, 1266, 255, 148, 500, SoundExpressionEffect.Warble, ' +
        'InterpolationCurve.Curve), SoundExpressionPlayMode.UntilDone)',
    'play sound effect noise from 4120 to 1266 hz volume 255 to 148 for 500 ms effect warble curve curve until done',
    'microbitplus_playsoundeffect'],
    ['music.play(music.createSoundExpression(WaveShape.Square, 1600, 1, 255, 0, 300, SoundExpressionEffect.None, ' +
        'InterpolationCurve.Logarithmic), music.PlaybackMode.InBackground)',
    'play sound effect square from 1600 to 1 hz volume 255 to 0 for 300 ms effect none curve logarithmic in background',
    'microbitplus_playsoundeffect'],
    ['v = radio.receivedPacket(RadioPacketProperty.SignalStrength)', 'set v to last radio signal strength', 'microbitplus_radiorssi'],
    ['if (input.logoIsPressed()) { basic.clearScreen() }', 'IF logo touched THEN:', 'microbitplus_islogo']
];

for (const [ts, line, opcode] of BATCH_3) {
    test(`census batch 3: \`${ts.slice(0, 60)}\` imports as \`${line.slice(0, 50)}\` → ${opcode}`, {skip: canCompile ? false :
        'packages/scratch-gui not integrated'}, () => {
        const out = microbitToPseudocode(`let v = 0\nbasic.forever(function () {\n    ${ts}\n})\n`);
        assert.deepEqual(out.unsupported, [], 'nothing refused');
        assert.ok(out.code.includes(line), `\`${line}\` not in:\n${out.code}`);
        assert.ok(opcodesOf(out.code).has(opcode), `${opcode} missing: the line parsed to nothing`);
    });
}

test('the logo handler is polled like the buttons; a long press and a release are timed by the touch', () => {
    // Alone, Pressed runs at the touch (as a button's does).
    assert.match(microbitToPseudocode('input.onLogoEvent(TouchButtonEvent.Pressed, function () {\n    basic.showNumber(1)\n})').code,
        /IF logo touched THEN:\n {6}show number 1\n {6}wait until not \(logo touched\)/);
    // With a long-press handler beside it, both wait for the release and time
    // the touch: CODAL sends LONG_CLICK for 1000 ms or more, CLICK for less —
    // never both.
    const {code, unsupported} = microbitToPseudocode([
        'input.onLogoEvent(TouchButtonEvent.Pressed, function () {',
        '    basic.showNumber(1)',
        '})',
        'input.onLogoEvent(TouchButtonEvent.LongPressed, function () {',
        '    basic.showNumber(2)',
        '})',
        'input.onLogoEvent(TouchButtonEvent.Released, function () {',
        '    basic.showNumber(3)',
        '})'
    ].join('\n'));
    assert.deepEqual(unsupported, []);
    assert.match(code, /IF logo touched THEN:\n {6}set (_held\d+) to timer\n {6}wait until not \(logo touched\)\n {6}IF \(timer - \1\) < 1 THEN:\n {8}show number 1/);
    assert.match(code, /IF logo touched THEN:\n {6}set (_held\d+) to timer\n {6}wait until not \(logo touched\)\n {6}IF not \(\(timer - \1\) < 1\) THEN:\n {8}show number 2/);
    assert.match(code, /IF logo touched THEN:\n {6}wait until not \(logo touched\)\n {6}show number 3/);
});

test('what MicroPython\'s radio does not have is refused with the reason; serial numbers are carried now', () => {
    // A packet's send time is not in a MicroPython packet: the time and the
    // packet dump that prints it stay refused, by name.
    const {unsupported} = microbitToPseudocode([
        'let t = radio.receivedPacket(RadioPacketProperty.Time)',
        'radio.writeReceivedPacketToSerial()'
    ].join('\n'));
    assert.ok(unsupported.some(u => /Time\) — a MicroPython radio packet carries no send time/.test(u)), unsupported.join('\n'));
    assert.ok(unsupported.some(u => /writeReceivedPacketToSerial\(\) — the dump prints each packet's send time/.test(u)), unsupported.join('\n'));
    // Serial numbers ride in the packet (sb3-creator: `radio transmit serial number on`).
    const serial = microbitToPseudocode([
        'radio.setTransmitSerialNumber(true)',
        'let s = radio.receivedPacket(RadioPacketProperty.SerialNumber)',
        'let me = control.deviceSerialNumber()'
    ].join('\n'));
    assert.deepEqual(serial.unsupported, []);
    assert.match(serial.code, /radio transmit serial number on\n {2}set s to last radio serial number\n {2}set me to device serial number/);
});

test('a function that returns a value hands it back in <name>_result; the caller calls, then reads it',
    {skip: canCompile ? false : 'packages/scratch-gui not integrated'}, () => {
        const {code, unsupported} = microbitToPseudocode([
            'function seriesSum(n: number) {',
            '    if (n < 1) {',
            '        return 0',
            '    }',
            '    return (n * (n + 1)) / 2',
            '}',
            'let total = seriesSum(4) + 1',
            'basic.showNumber(seriesSum(total))'
        ].join('\n'));
        assert.deepEqual(unsupported, []);
        assert.match(code, /DEFINE seriesSum \(n\):\n {2}IF n < 1 THEN:\n {4}set seriesSum_result to 0\n {4}stop this script\n {2}set seriesSum_result to n \* \(n \+ 1\) \/ 2\n {2}stop this script/);
        assert.match(code, / {2}seriesSum 4\n {2}set _mc1 to seriesSum_result\n {2}set total to _mc1 \+ 1\n {2}seriesSum total\n {2}set _mc2 to seriesSum_result\n {2}show number _mc2/);
        const ops = opcodesOf(code);
        assert.ok(ops.has('procedures_call') && ops.has('control_stop'));
    });

test('a result read in a loop\'s condition is refused: the call would run once, the condition every pass', () => {
    const {unsupported} = microbitToPseudocode('function f() {\n    return 1\n}\nwhile (f() > 0) {\n    basic.pause(1)\n}\n');
    assert.ok(unsupported.some(u => /f\(\) as a value in a loop's condition/.test(u)), unsupported.join('\n'));
});

test('break leaves the loop through a flag; the rest of the pass is skipped', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const {code, unsupported} = microbitToPseudocode([
        'let i = 0',
        'while (i < 10) {',
        '    i += 1',
        '    if (i == 3) {',
        '        break',
        '    }',
        '    basic.showNumber(i)',
        '}'
    ].join('\n'));
    assert.deepEqual(unsupported, []);
    assert.match(code, /set _brk1 to 0\n {2}REPEAT UNTIL \(_brk1 = 1\) or \(not \(i < 10\)\):\n {4}change i by 1\n {4}IF i = 3 THEN:\n {6}set _brk1 to 1\n {4}IF _brk1 = 0 THEN:\n {6}show number i/);
});

test('for … of a list is a counter over it (it was read as a counted for, and the body came out as stray lines)',
    {skip: canCompile ? false : 'packages/scratch-gui not integrated'}, () => {
        const {code, unsupported} = microbitToPseudocode([
            'let nums: number[] = [3, 5]',
            'let total = 0',
            'for (let n of nums) {',
            '    total += n',
            '}'
        ].join('\n'));
        assert.deepEqual(unsupported, []);
        assert.match(code, /set _i1 to 0\n {2}REPEAT UNTIL not \(_i1 < length of array "nums"\):\n {4}set n to item _i1 of array "nums"\n {4}change total by n\n {4}change _i1 by 1/);
    });

test('parentheses that change a value are kept ((n * (n + 1)) / 2 was n * n + 1 / 2)', () => {
    const {code} = microbitToPseudocode('let a = 1\nlet b = 2\nlet c = 3\nlet r = (a + b) * c\nr = a - (b - c)\nr = a / (b * c)\nr = a * b + c\n');
    assert.match(code, /set r to \(a \+ b\) \* c/);
    assert.match(code, /set r to a - \(b - c\)/);
    assert.match(code, /set r to a \/ \(b \* c\)/);
    assert.match(code, /set r to a \* b \+ c/);
});

// LED sprites (game.LedSprite) and the game state around them: every sprite
// app in the census refused the sprite (hero, crashy-bird, snap-the-dot,
// radio-dashboard) and headbands refused game.startCountdown. A sprite is a
// numbered handle in a variable or array (sb3-creator's micro:bit+ sprite
// words); each call imports to the line that compiles to the block meaning it.
const SPRITES = [
    // [MakeCode, the line it imports to, the opcode that line compiles to]
    ['s = game.createSprite(2, 3)', 'set s to create sprite at x 2 y 3', 'microbitplus_createsprite'],
    ['s = game.createSprite(v + 1, 0)', 'set s to create sprite at x (v + 1) y 0', 'microbitplus_createsprite'],
    ['v = s.get(LedSpriteProperty.X)', 'set v to x of sprite s', 'microbitplus_spriteget'],
    ['v = s.get(LedSpriteProperty.Blink)', 'set v to blink of sprite s', 'microbitplus_spriteget'],
    ['s.set(LedSpriteProperty.Brightness, 8)', 'set sprite s brightness to 8', 'microbitplus_spriteset'],
    ['s.change(LedSpriteProperty.Y, -1)', 'change sprite s y by (0 - 1)', 'microbitplus_spritechange'],
    ['s.change(LedSpriteProperty.Direction, 45)', 'change sprite s direction by 45', 'microbitplus_spritechange'],
    ['s.move(1)', 'move sprite s by 1', 'microbitplus_spritemove'],
    ['s.turn(Direction.Right, 45)', 'turn sprite s right by 45 degrees', 'microbitplus_spriteturn'],
    ['s.turn(Direction.Left, v * 2)', 'turn sprite s left by (v * 2) degrees', 'microbitplus_spriteturn'],
    ['s.ifOnEdgeBounce()', 'bounce sprite s if on edge', 'microbitplus_spritebounce'],
    ['s.delete()', 'delete sprite s', 'microbitplus_spritedelete'],
    ['if (s.isTouching(t)) { basic.clearScreen() }', 'IF sprite s touching sprite t THEN:', 'microbitplus_spritetouching'],
    ['if (s.isTouchingEdge()) { basic.clearScreen() }', 'IF sprite s touching edge THEN:', 'microbitplus_spritetouchingedge'],
    ['if (s.isDeleted()) { basic.clearScreen() }', 'IF sprite s deleted THEN:', 'microbitplus_spritedeleted'],
    ['game.startCountdown(30000)', 'start countdown 30000 ms', 'microbitplus_startcountdown'],
    ['game.pause()', 'pause game', 'microbitplus_pausegame'],
    ['game.resume()', 'resume game', 'microbitplus_resumegame'],
    ['game.setLife(5)', 'set game life to 5', 'microbitplus_setlife'],
    ['game.addLife(1)', 'add game life 1', 'microbitplus_addlife'],
    ['v = game.life()', 'set v to game life', 'microbitplus_life'],
    ['if (game.isGameOver()) { basic.clearScreen() }', 'IF game is over THEN:', 'microbitplus_isgameover'],
    ['if (game.isRunning()) { basic.clearScreen() }', 'IF game is running THEN:', 'microbitplus_isrunning'],
    ['if (game.isPaused()) { basic.clearScreen() }', 'IF game is paused THEN:', 'microbitplus_ispaused'],
    // The methods MakeCode has no block for read as the block that does the same.
    ['s.setX(3)', 'set sprite s x to 3', 'microbitplus_spriteset'],
    ['s.changeYBy(1)', 'change sprite s y by 1', 'microbitplus_spritechange'],
    ['s.setBlink(500)', 'set sprite s blink to 500', 'microbitplus_spriteset'],
    ['s.on()', 'set sprite s brightness to 255', 'microbitplus_spriteset'],
    ['s.off()', 'set sprite s brightness to 0', 'microbitplus_spriteset'],
    ['s.turnLeft(90)', 'turn sprite s left by 90 degrees', 'microbitplus_spriteturn'],
    ['v = s.direction()', 'set v to direction of sprite s', 'microbitplus_spriteget']
];

for (const [ts, line, opcode] of SPRITES) {
    test(`LED sprites: \`${ts.slice(0, 60)}\` imports as \`${line}\` → ${opcode}`, {skip: canCompile ? false :
        'packages/scratch-gui not integrated'}, () => {
        const out = microbitToPseudocode(
            `let v = 0\nlet s = game.createSprite(0, 0)\nlet t = game.createSprite(1, 1)\nbasic.forever(function () {\n    ${ts}\n})\n`);
        assert.deepEqual(out.unsupported, [], 'nothing refused');
        assert.ok(out.code.includes(line), `\`${line}\` not in:\n${out.code}`);
        assert.ok(opcodesOf(out.code).has(opcode), `${opcode} missing: the line parsed to nothing`);
    });
}

test('LED sprites: a sprite is known by its declared type, an array of them by its element type or what is pushed',
    {skip: canCompile ? false : 'packages/scratch-gui not integrated'}, () => {
        const {code, unsupported} = microbitToPseudocode([
            'let bird: game.LedSprite = null',
            'let obstacles: game.LedSprite[] = []',
            'let more: game.LedSprite[] = []',
            'let pile = []',
            'pile.push(game.createSprite(4, 0))',
            'bird = game.createSprite(0, 2)',
            'basic.forever(function () {',
            '    bird.move(1)',
            '    obstacles[0].move(1)',
            '    pile[0].ifOnEdgeBounce()',
            '    more.removeAt(0).delete()',
            '})'
        ].join('\n'));
        assert.deepEqual(unsupported, []);
        assert.match(code, /set bird to 0\n/, 'null is the handle 0');
        assert.match(code, /move sprite bird by 1/);
        assert.match(code, /move sprite \(item 0 of array "obstacles"\) by 1/);
        assert.match(code, /bounce sprite \(item 0 of array "pile"\) if on edge/);
        // removeAt(0).delete(): the element is deleted, then taken off the array.
        assert.match(code, /delete sprite \(item 0 of array "more"\)\n\s+remove item 0 of array "more"/);
    });

test('`for (let x of list)` walks the list, re-reading its length each pass (crashy-bird)',
    {skip: canCompile ? false : 'packages/scratch-gui not integrated'}, () => {
        const {code, unsupported} = microbitToPseudocode([
            'let obstacles: game.LedSprite[] = []',
            'basic.forever(function () {',
            '    for (let o of obstacles) {',
            '        o.change(LedSpriteProperty.X, -1)',
            '    }',
            '})'
        ].join('\n'));
        assert.deepEqual(unsupported, []);
        assert.match(code, /set (_i\w*) to 0\n\s+REPEAT UNTIL not \(\1 < length of array "obstacles"\):\n\s+set o to item \1 of array "obstacles"\n\s+change sprite o x by \(0 - 1\)\n\s+change \1 by 1/);
        const ast = parseMakeCodeTs('for (const k of list) { f(k) }\n');
        assert.equal(ast.body[0].type, 'ForOf');
        assert.equal(ast.body[0].name, 'k');
    });

test('`for … of` something that is not a known array is named, not guessed', () => {
    const {unsupported} = microbitToPseudocode('for (let k of control.deviceName()) { basic.showString(k) }\n');
    assert.ok(unsupported.some(u => /for … of something that is not an array.*control\.deviceName\(\)/.test(u)), unsupported.join('\n'));
});

test('a sprite kept in an object field is named with its reason (the handles live in variables and arrays)', () => {
    const {unsupported} = microbitToPseudocode([
        'const clients: any[] = []',
        'basic.forever(function () {',
        '    for (const client of clients) {',
        '        client.sprite.setBlink(500)',
        '        client.sprite.setBrightness(0)',
        '    }',
        '})'
    ].join('\n'));
    for (const call of ['client.sprite.setBlink()', 'client.sprite.setBrightness()']) {
        assert.ok(unsupported.some(u => u.startsWith(call) && /a sprite kept in an object field/.test(u)), `${call}: ${unsupported.join('\n')}`);
    }
});

test('a sprite method name on something that is not a sprite is left to the rest of the table', () => {
    // An array's `set`/`get` and an unknown object's `move` are not sprites.
    const {code, unsupported} = microbitToPseudocode('let a = [1, 2]\na.set(0, 5)\nrobot.move(3)\n');
    assert.match(code, /set item 0 of array "a" to 5/);
    assert.ok(unsupported.some(u => /robot\.move\(\)/.test(u)), unsupported.join('\n'));
    assert.doesNotMatch(code, /sprite/);
});

test('basic.showNumber is `show number`, which waits while shown; its interval rides along; `display` is lite\'s own',
    {skip: canCompile ? false : 'packages/scratch-gui not integrated'}, () => {
        const {code, unsupported} = microbitToPseudocode('let n = 0\nbasic.showNumber(n + 1)\nbasic.showNumber(42, 100)\n');
        assert.deepEqual(unsupported, []);
        assert.match(code, /show number n \+ 1\n/);
        assert.match(code, /show number 42 delay 100 ms/);
        assert.doesNotMatch(code, /^\s*display /m);
        assert.ok(opcodesOf(code).has('microbitplus_shownumber'));
    });

// ── census A2 (2026-09-29): the shapes the side-by-side test cannot drive ──

test('pins.onPulsed is polled on the level, and runs as the pulse ENDS (a High pulse at the fall)', () => {
    const {code, unsupported} = microbitToPseudocode([
        'pins.onPulsed(DigitalPin.P0, PulseValue.High, function () {',
        '    led.plot(0, 0)',
        '})',
        'pins.onPulsed(DigitalPin.P1, PulseValue.Low, function () {',
        '    led.plot(1, 0)',
        '})'].join('\n'));
    assert.deepEqual(unsupported, []);
    assert.match(code, /IF not \(pin P0 digital = 0\) THEN:\n {6}wait until pin P0 digital = 0\n {6}plot x 0 y 0 on/);
    assert.match(code, /IF pin P1 digital = 0 THEN:\n {6}wait until not \(pin P1 digital = 0\)\n {6}plot x 1 y 0 on/);
});

test('control.eventTimestamp is the time the poll saw the event, in µs; outside a handler it is refused', () => {
    const {code, unsupported} = microbitToPseudocode([
        'let t0 = 0',
        'input.onPinPressed(TouchPin.P0, function () {',
        '    t0 = control.eventTimestamp()',
        '})'].join('\n'));
    assert.deepEqual(unsupported, []);
    assert.match(code, /IF pin P0 touched THEN:\n {6}set (_evt\d+) to round \(timer \* 1000000\)\n {6}set t0 to \1/);
    assert.deepEqual(microbitToPseudocode('let t = control.eventTimestamp()\n').unsupported,
        ['control.eventTimestamp() outside an event handler']);
});

test('a function whose name is a dialect word is renamed, and called by the new name (gameofLife\'s show)', () => {
    const {code} = microbitToPseudocode('function show() {\n    basic.showNumber(1)\n}\nshow()\n');
    assert.match(code, /DEFINE show_:/);
    assert.match(code, /WHEN flag clicked:\n {2}show_\n/);
    assert.match(code, /# the function "show" is written as "show_" here/);
});

test('a choice inside a loop\'s condition is still refused (it would be made once, before the loop)', () => {
    const {unsupported} = microbitToPseudocode('let i = 0\nwhile ((i < 3 ? 1 : 2) > i) {\n    i += 1\n}\n');
    assert.ok(unsupported.includes('a ? b : c inside an expression'), unsupported.join('\n'));
});

test('an array assigned to another is copied only when the source is a local made anew each call', () => {
    // a global array, used again after the assignment: no copy would be the same program
    const {unsupported} = microbitToPseudocode('let a = [1, 2]\nlet b = [3]\nfunction f() {\n    a = b\n    b.push(4)\n}\nf()\n');
    assert.ok(unsupported.some(u => /an array assigned to another \(a = b\)/.test(u)), unsupported.join('\n'));
    const ok = microbitToPseudocode('let a = [1, 2]\nfunction f() {\n    let r: number[] = []\n    r.push(5)\n    a = r\n}\nf()\n');
    assert.deepEqual(ok.unsupported, []);
    assert.match(ok.code, /new array "a"\n {2}set (_i\d+) to 0\n {2}REPEAT UNTIL not \(\1 < length of array "r"\):\n {4}push item \1 of array "r" to array "a"/);
});

test('a function given something that is not a named array is refused by name', () => {
    const {unsupported} = microbitToPseudocode('function f(arr: number[]) {\n    basic.showNumber(arr[0])\n}\nf([1, 2])\n');
    assert.ok(unsupported.includes('f() given an array that is not a named array'), unsupported.join('\n'));
});

test('two array items side by side are parenthesised (they were read as one item whose index ran on)', () => {
    const {code} = microbitToPseudocode('let a = [1, 2]\nlet s = a[0] + a[1]\nif (a[0] == a[1]) {\n    s = 0\n}\n');
    assert.match(code, /set s to \(item 0 of array "a"\) \+ \(item 1 of array "a"\)/);
    assert.match(code, /IF \(item 0 of array "a"\) = \(item 1 of array "a"\) THEN:/);
});

test('a constant table is read where it is used (infection\'s GameIcons.Dead is IconNames.Skull)', () => {
    const {code, unsupported} = microbitToPseudocode('const Icons = {\n    Dead: IconNames.Skull,\n    Alive: IconNames.Happy\n}\nbasic.showIcon(Icons.Dead)\n');
    assert.deepEqual(unsupported, []);
    assert.match(code, /show icon /);
    assert.doesNotMatch(code, /Icons/);
});

test('serial.writeValue with a computed name is refused by name', () => {
    assert.deepEqual(microbitToPseudocode('let k = "a"\nserial.writeValue(k, 1)\n').unsupported,
        ['serial.writeValue() with a computed or colon-bearing name']);
});

test('an image shown with its own interval draws, then waits that interval; without one it is `show image` (400 ms)', () => {
    const {code, unsupported} = microbitToPseudocode([
        'let img = images.createImage(`',
        '    # . . . .',
        '    . . . . .',
        '    . . . . .',
        '    . . . . .',
        '    . . . . .',
        '    `)',
        'img.showImage(2)',
        'img.showImage(0, 100)'].join('\n'));
    assert.deepEqual(unsupported, []);
    assert.match(code, /show image img offset 2\n {2}plot image img offset 0\n {2}wait 0\.1 seconds/);
});

test('setPixel of `v != 0` (how the export writes the dialect\'s 1/0) reads back as v', () => {
    const {code} = microbitToPseudocode('let v = 1\nlet img = images.createImage(`\n. . . . .\n. . . . .\n. . . . .\n. . . . .\n. . . . .\n`)\n' +
        'img.setPixel(1, 2, v != 0)\n');
    assert.match(code, /set pixel x 1 y 2 of image img to v\n/);
});
