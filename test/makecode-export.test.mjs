/**
 * The export direction: a BrickWright project → a file MakeCode opens.
 *
 * The claim being tested is a round trip, not a string: take the shipped
 * micro:bit examples, export each to MakeCode TypeScript, import it back
 * through the translator, compile THAT, and check no device block was
 * lost on the way. A mapping added to one side of the table and
 * forgotten on the other shows up here as a missing opcode and nowhere
 * else.
 *
 * The .hex is checked the same way: written by export.js, read back by
 * embedded-source.js. We cannot run makecode.microbit.org's importer in
 * a test, but we CAN check that the container we write is exactly the
 * container we know how to read — and that container is the one pxt
 * documents and the real fixtures use.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

import {SOURCE, REPO} from './helpers/bw-integrated.mjs';
import {
    exportToMakeCode,
    projectToMakeCodeTs,
    makeCodeSourceHex
} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {unpackMakeCodeSource, describeProject} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';

const COMPILER = join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const canCompile = existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;

const example = id =>
    readFileSync(join(REPO, 'overlay', 'scratch-gui', 'examples', id, 'program.bw'), 'utf8');

const opcodesOf = project => {
    const ops = new Set();
    for (const target of project.targets) {
        for (const block of Object.values(target.blocks || {})) {
            if (block && block.opcode) ops.add(block.opcode);
        }
    }
    return ops;
};

test('the source-embedding container we write is the one we read', async () => {
    const files = {'main.ts': 'basic.showNumber(1)\n', 'pxt.json': '{"name":"tiny"}'};
    const hex = makeCodeSourceHex(files, {name: 'tiny', target: 'microbit'});
    assert.match(hex, /^:/, 'Intel HEX');
    assert.match(hex, /:00000001FF/, 'with an end record');

    const back = await unpackMakeCodeSource(new TextEncoder().encode(hex));
    assert.equal(back.format, 'hex');
    assert.deepEqual(back.files, files);
    assert.equal(describeProject(back.meta).name, 'tiny');
    assert.equal(describeProject(back.meta).target, 'microbit');
});

test('an uncompressed embed is legal, and stays readable', async () => {
    // `compression` is optional in the spec; we write none rather than
    // ship an LZMA compressor to save a few kilobytes on a one-off save.
    const hex = makeCodeSourceHex({'main.ts': 'x'.repeat(5000)}, {name: 'big'});
    const back = await unpackMakeCodeSource(new TextEncoder().encode(hex));
    assert.equal(back.files['main.ts'].length, 5000);
});

test('blocks become idiomatic MakeCode, not a transcript', {skip: canCompile ? false :
    'packages/scratch-gui not integrated — run `npm run integrate` first'}, () => {
    const project = new SB3Creator().parse(example('mb04-radio'));
    const {ts, unsupported} = projectToMakeCodeTs(project);
    assert.deepEqual(unsupported, []);
    assert.match(ts, /^let val = 0$/m, 'variables are declared, because this is TypeScript');
    assert.match(ts, /radio\.setGroup\(5\)/);
    assert.match(ts, /basic\.forever\(function \(\) \{/);
    assert.match(ts, /input\.acceleration\(Dimension\.X\)/);
    assert.match(ts, /basic\.pause\(1000\)/, 'our seconds are MakeCode\'s milliseconds');
});

test('every shipped micro:bit example survives the round trip', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const examples = ['mb01-display', 'mb02-sensors', 'mb03-pins', 'mb04-radio',
        'mb07-stepcounter', 'mb08-thermometer'];

    for (const id of examples) {
        const source = example(id);
        const before = opcodesOf(new SB3Creator().parse(source));
        const exported = exportToMakeCode(new SB3Creator().parse(source), {name: id});
        assert.deepEqual(exported.unsupported, [], `${id}: nothing should be unexportable`);

        const reimported = microbitToPseudocode(exported.ts);
        assert.deepEqual(reimported.unsupported, [], `${id}: nothing should be unimportable`);
        const after = opcodesOf(new SB3Creator().parse(reimported.code));

        // showtext is the one legitimate normalisation: MakeCode has no
        // non-scrolling string block, so `show text` leaves as
        // basic.showString and returns as `scroll text`.
        const equivalent = {microbitplus_showtext: 'microbitplus_scrolltext'};
        const lost = [...before].filter(op =>
            /^microbit/.test(op) && !after.has(op) && !after.has(equivalent[op]));
        assert.deepEqual(lost, [], `${id}: these device blocks did not come back`);
    }
});

test('the exported hex carries a whole project, not just the code', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, async () => {
    const project = new SB3Creator().parse(example('mb01-display'));
    const out = exportToMakeCode(project, {name: 'display demo'});
    assert.equal(out.filename, 'display-demo.hex');

    const back = await unpackMakeCodeSource(new TextEncoder().encode(out.hex));
    assert.deepEqual(Object.keys(back.files).sort(),
        ['README.md', 'main.blocks', 'main.ts', 'pxt.json']);
    const config = JSON.parse(back.files['pxt.json']);
    assert.equal(config.name, 'display demo');
    assert.ok(config.files.includes('main.ts'), 'pxt.json must list the files or MakeCode ignores them');
});

test('a block MakeCode has no word for is reported, not emitted as nonsense', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const project = new SB3Creator().parse([
        'DEVICE MICROBIT',
        '',
        'WHEN flag clicked:',
        '  say "hello"',            // stage speech: no micro:bit equivalent
        '  clear display'
    ].join('\n'));
    const {ts, unsupported} = projectToMakeCodeTs(project);
    assert.ok(unsupported.some(u => /looks_say/.test(u)));
    assert.match(ts, /\/\/ unsupported: looks_say/);
    assert.match(ts, /basic\.clearScreen\(\)/, 'the rest still exports');
});

test('an exported icon reads as an icon, and brightness loss is reported', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const withIcon = new SB3Creator().parse([
        'DEVICE MICROBIT', '', 'WHEN flag clicked:',
        '  show pattern 09090:99999:99999:09990:00900'
    ].join('\n'));
    const named = projectToMakeCodeTs(withIcon);
    assert.match(named.ts, /basic\.showIcon\(IconNames\.Heart\)/,
        'a grid the reader would have to decode is worse than the name for it');
    assert.deepEqual(named.unsupported, []);

    const withBrightness = new SB3Creator().parse([
        'DEVICE MICROBIT', '', 'WHEN flag clicked:',
        '  show pattern 12345:00000:00000:00000:00000'
    ].join('\n'));
    const dimmed = projectToMakeCodeTs(withBrightness);
    assert.match(dimmed.ts, /basic\.showLeds/);
    assert.ok(dimmed.unsupported.some(u => /brightness/.test(u)),
        'MakeCode\'s display literals are on/off, and flattening 1..8 is a real loss');
});

test('arrays and bitwise go back to MakeCode as themselves', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // These two arrived through EXTENSIONS on the way in — the pseudocode
    // has neither an array nor a bitwise operator of its own. MakeCode's
    // TypeScript has both natively, so the way back is exact rather than
    // approximate, and the 0-based indexing that made the `arrays`
    // extension the right target is what makes `a[i]` survive unshifted.
    const project = new SB3Creator().parse([
        'DEVICE MICROBIT', '', 'WHEN flag clicked:',
        '  new array "liste" = [1, 2, 3]',
        '  push 4 to array "liste"',
        '  set item 0 of array "liste" to 9',
        '  set wert to (wert bitand 255)',
        '  set wert to item 1 of array "liste"',
        '  display length of array "liste"'
    ].join('\n'));
    const {ts, unsupported} = projectToMakeCodeTs(project);

    assert.deepEqual(unsupported, [], 'a round trip that drops the arrays is not a round trip');
    // The declaration has to be hoisted: an array's name is an INPUT on the
    // block rather than a Scratch variable, so nothing else declares it.
    assert.match(ts, /let liste: number\[\] = \[\]/, ts);
    assert.match(ts, /liste\.push\(4\)/, ts);
    assert.match(ts, /liste\[0\] = 9/, ts);
    assert.match(ts, /liste\[1\]/, ts);
    assert.match(ts, /liste\.length/, ts);
    assert.match(ts, /basic\.showNumber\(liste\.length\)/, ts);
    assert.match(ts, /wert & 255/, ts);
    assert.doesNotMatch(ts, /unsupported/, ts);
});

test('what came in as MakeCode arrays goes back out as MakeCode arrays', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // The whole loop, which is the only way to prove the two halves agree:
    // TypeScript → pseudocode → blocks → TypeScript → pseudocode.
    const source = [
        'let liste: number[] = []',
        'let wert = 0',
        'basic.forever(function () {',
        '  liste.push(4)',
        '  liste[0] = 9',
        '  wert = wert & 255',
        '  wert = liste[1]',
        '  basic.showNumber(liste.length)',
        '})'
    ].join('\n');

    const first = microbitToPseudocode(source);
    assert.deepEqual(first.unsupported, []);
    const exported = projectToMakeCodeTs(new SB3Creator().parse(first.code));
    assert.deepEqual(exported.unsupported, []);
    const second = microbitToPseudocode(exported.ts);
    assert.deepEqual(second.unsupported, []);

    // Comments and the declaration/assignment split differ; every operation
    // must not.
    const operations = text => text.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#') && !/^set wert to 0$/.test(l));
    assert.deepEqual(operations(second.code), operations(first.code));
});

test('a function keeps its arguments, in both directions', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // `zeigen(3, n + 1)` used to translate to the single word `zeigen` —
    // the arguments were dropped on the way IN, so the function ran on
    // whatever its parameters happened to hold. It emitted a line, so the
    // anti-silence gate saw nothing wrong; only exporting showed it.
    const {code} = microbitToPseudocode([
        'function zeigen(wert: number, mal: number) { basic.showNumber(wert * mal) }',
        'let n = 2',
        'basic.forever(function () { zeigen(3, n + 1) })'
    ].join('\n'));
    // A call is matched token by token against the DEFINE's template, so a
    // compound argument has to be hoisted to one token first.
    assert.match(code, /set _mc\d+ to n \+ 1/, code);
    assert.match(code, /zeigen 3 _mc\d+/, code);

    const {ts, unsupported} = projectToMakeCodeTs(new SB3Creator().parse(code));
    assert.deepEqual(unsupported, []);
    assert.match(ts, /function zeigen\(wert: number, mal: number\) \{/, ts);
    assert.match(ts, /basic\.showNumber\(\(wert \* mal\)\)/, ts);
    assert.match(ts, /zeigen\(3, _mc\d+\)/, ts);
    // The definition has to come above the call.
    assert.ok(ts.indexOf('function zeigen') < ts.indexOf('zeigen(3'), ts);
});

test('gesture and touch reporters have a way back', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // Added to the importer in sb3-creator#3 and never to the export table —
    // the asymmetry this round-trip gate exists to catch. MakeCode names the
    // logo gestures after the logo where our menu names them after the tilt.
    const {code} = microbitToPseudocode(`
        basic.forever(function () {
            if (input.isGesture(Gesture.TiltLeft)) { basic.clearScreen() }
            if (input.pinIsPressed(TouchPin.P1)) { basic.clearScreen() }
        })
    `);
    const {ts, unsupported} = projectToMakeCodeTs(new SB3Creator().parse(code));
    assert.deepEqual(unsupported, []);
    assert.match(ts, /input\.isGesture\(Gesture\.TiltLeft\)/, ts);
    assert.match(ts, /input\.pinIsPressed\(TouchPin\.P1\)/, ts);
});

test('a boolean reporter is not compared to the string "true"', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    // The compiler puts a boolean reporter into a boolean slot as
    // `equals(reporter, "true")`. Rendered literally that is
    // `input.isGesture(…) == "true"`, and Static TypeScript will not compare
    // a boolean to a string — so the export would not build in MakeCode.
    const {code} = microbitToPseudocode(
        'let n = 0\nbasic.forever(function () {\n' +
        '  if (input.isGesture(Gesture.Shake)) { basic.clearScreen() }\n' +
        '  if (n == 3) { basic.clearScreen() }\n})');
    const {ts} = projectToMakeCodeTs(new SB3Creator().parse(code));
    assert.doesNotMatch(ts, /== "true"/, ts);
    assert.match(ts, /if \(input\.isGesture\(Gesture\.Shake\)\) \{/, ts);
    // and a real comparison is left alone
    assert.match(ts, /\(n == 3\)/, ts);
});

test('every committed Calliope fixture survives the whole loop', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, async () => {
    // Import, compile, export: nothing refused at either end. The Calliope
    // corpus went from 47 export refusals to none once functions, gestures
    // and touch had a way back.
    const {importArtefact} = await import(
        '../overlay/scratch-gui/src/lib/bw-makecode/index.js');
    const dir = join(REPO, 'test', 'fixtures', 'makecode');
    const files = readdirSync(dir).filter(f => f.startsWith('calliope-'));
    assert.ok(files.length > 0);
    for (const file of files) {
        const imported = await importArtefact(
            new Uint8Array(readFileSync(join(dir, file))), {name: file});
        const exported = projectToMakeCodeTs(new SB3Creator().parse(imported.code));
        assert.deepEqual(exported.unsupported, [], `${file} lost something on the way out`);
        assert.doesNotMatch(exported.ts, /unsupported/, file);
    }
});

// Census findings, 2026-09-25 (scripts/makecode-census.mjs): the dialect's truth
// is a number (1/0), MakeCode's is a boolean, and Static TypeScript will not mix
// them — `input.buttonIsPressed(Button.A) > 0` and `A = "false"` were refused.
const tsOfProgram = body => projectToMakeCodeTs(new SB3Creator().parse(`DEVICE MICROBIT\nWHEN flag clicked:\n${body}`)).ts;

test('"read button_a > 0" asks the boolean directly; "= 0" negates it', {skip: !canCompile && 'sb3-creator not integrated'}, () => {
    const ts = tsOfProgram('  FOREVER:\n    IF read button_a > 0 THEN:\n      show number 1\n    IF read button_b = 0 THEN:\n      show number 2\n');
    assert.match(ts, /if \(input\.buttonIsPressed\(Button\.A\)\) \{/);
    assert.match(ts, /if \(\(!input\.buttonIsPressed\(Button\.B\)\)\) \{/);
    assert.doesNotMatch(ts, /buttonIsPressed\([^)]*\)\s*[<>=]/, 'a boolean compared with a number');
});

test('a boolean stored in a variable is stored as the dialect\'s 1/0', {skip: !canCompile && 'sb3-creator not integrated'}, () => {
    const ts = tsOfProgram('  set A to read button_a\n  set B to false\n  set C to true\n');
    assert.match(ts, /A = \(input\.buttonIsPressed\(Button\.A\) \? 1 : 0\)/);
    assert.match(ts, /\bB = 0\b/);
    assert.match(ts, /\bC = 1\b/);
    assert.doesNotMatch(ts, /"(true|false)"/, 'a boolean became a string');
});

test('MakeCode\'s `let A = false` imports as the number 0, and survives the way back', () => {
    const {code} = microbitToPseudocode('let A = false\nlet B = true\nbasic.forever(function () {\n    A = input.buttonIsPressed(Button.A)\n})\n');
    assert.match(code, /set A to 0/);
    assert.match(code, /set B to 1/);
    assert.doesNotMatch(code, /set [AB] to (true|false)/);
});

test('a scroll interval survives both ways (it was dropped without a word)', {skip: !canCompile && 'sb3-creator not integrated'}, () => {
    assert.match(tsOfProgram('  scroll text "BW" delay 80 ms\n'), /basic\.showString\("BW", 80\)/);
    assert.match(tsOfProgram('  scroll text "BW" delay 150 ms\n'), /basic\.showString\("BW"\)/, '150 is MakeCode\'s default');
    assert.match(microbitToPseudocode('basic.showString("Hi", 60)\n').code, /scroll text "Hi" delay 60 ms/);
});

test('a round trip is a fixed point: exporting what was imported gives the same MakeCode, for every micro:bit example',
    {skip: !canCompile && 'sb3-creator not integrated'}, () => {
        // Two drifts the CLI's full-circle test found (2026-09-25): `let x = 0`
        // gained a `x = 0` line per trip, and pause(1 * 1000) nested one more
        // `/ 1000 * 1000` per trip. A fixed point rules out the whole class.
        const dir = join(REPO, 'overlay', 'scratch-gui', 'examples');
        const ids = readdirSync(dir).filter(d => existsSync(join(dir, d, 'program.bw')) &&
            /^DEVICE\s+MICROBIT\b/im.test(readFileSync(join(dir, d, 'program.bw'), 'utf8')));
        assert.ok(ids.length >= 10);
        const drifted = [];
        for (const id of ids) {
            const ts1 = projectToMakeCodeTs(new SB3Creator().parse(example(id))).ts;
            const ts2 = projectToMakeCodeTs(new SB3Creator().parse(microbitToPseudocode(ts1).code)).ts;
            if (ts2 !== ts1) drifted.push(id);
        }
        assert.deepEqual(drifted, []);
    });

test('radio group and power: one MakeCode call never resets the other (a program landed on the wrong channel)', () => {
    // setGroup(5); setTransmitPower(3) used to import as "group 5 power 6" then
    // "group 1 power 3" — the program ended on radio group 1.
    const pair = microbitToPseudocode('radio.setGroup(5)\nradio.setTransmitPower(3)\n').code;
    assert.match(pair, /radio on group 5 power 3/);
    assert.doesNotMatch(pair, /group 1\b/);
    assert.equal((pair.match(/radio on group/g) || []).length, 1, 'an adjacent pair is one statement');
    // Apart, the later call carries the earlier value.
    const apart = microbitToPseudocode('radio.setGroup(7)\nbasic.pause(10)\nradio.setTransmitPower(2)\n').code;
    assert.match(apart, /radio on group 7 power 6[\s\S]*radio on group 7 power 2/);
});

test('a counted loop that never reads its counter is REPEAT; analog percent reads back as the percent', () => {
    assert.match(microbitToPseudocode('for (let i = 0; i < 20; i++) {\n    basic.pause(50)\n}\n').code, /REPEAT 20:/);
    assert.match(microbitToPseudocode('for (let i = 0; i < 5; i++) {\n    basic.showNumber(i)\n}\n').code, /set i to 0/,
        'a loop that uses its counter keeps it');
    const pct = microbitToPseudocode('pins.analogWritePin(AnalogPin.P2, Math.round(50 * 1023 / 100))\n').code;
    assert.match(pct, /set pin P2 analog 50 %/);
    assert.doesNotMatch(pct, /_mc/);
});

// Batch 1 of the MakeCode census: each spelling the importer now writes for
// a MakeCode led/game/Math call has to go back out as THAT call. A mapping
// on one side only is a program that imports cleanly and then loses the
// call on its way back to MakeCode — which the census counts as silent.
const BATCH_1_WAY_BACK = [
    ['plot bar graph of read light up to 255', 'led.plotBarGraph(input.lightLevel(), 255)'],
    ['toggle x 1 y 2', 'led.toggle(1, 2)'],
    ['set display brightness to 128', 'led.setBrightness(128)'],
    ['stop animation', 'led.stopAnimation()'],
    ['change game score by 1', 'game.addScore(1)'],
    ['set game score to 4', 'game.setScore(4)'],
    ['remove game life 1', 'game.removeLife(1)'],
    ['game over', 'game.gameOver()'],
    ['display game score', 'basic.showNumber(game.score())'],
    ['set v to map v from low 0 high 1023 to low 0 high 4', 'v = pins.map(v, 0, 1023, 0, 4)'],
    ['set v to min of v and 3', 'v = Math.min(v, 3)'],
    ['set v to max of v and 3', 'v = Math.max(v, 3)'],
    ['set v to ((v / 4) bitor 0)', 'v = Math.idiv(v, 4)'],
    ['IF (pick random 0 to 1) = 1 THEN:\n    clear display', 'if (Math.randomBoolean()) {']
];

for (const [line, call] of BATCH_1_WAY_BACK) {
    test(`census batch 1: \`${line.split('\n')[0]}\` exports as \`${call}\``, {skip: !canCompile && 'sb3-creator not integrated'}, () => {
        const {ts, unsupported} = projectToMakeCodeTs(new SB3Creator().parse(`DEVICE MICROBIT\nWHEN flag clicked:\n  ${line}\n`));
        assert.deepEqual(unsupported, []);
        assert.ok(ts.includes(call), `\`${call}\` not in:\n${ts}`);
    });
}

test('a bitor that is not (a / b) | 0 stays a bitwise or', {skip: !canCompile && 'sb3-creator not integrated'}, () => {
    const ts = tsOfProgram('  set v to (v bitor 0)\n  set w to ((v / 4) bitor 1)\n');
    assert.match(ts, /v = \(v \| 0\)/, ts);
    assert.match(ts, /w = \(\(v \/ 4\) \| 1\)/, ts);
    assert.doesNotMatch(ts, /Math\.idiv/);
});

test('a random number compared with something other than 1 is still a comparison', {skip: !canCompile && 'sb3-creator not integrated'}, () => {
    const ts = tsOfProgram('  IF (pick random 0 to 2) = 1 THEN:\n    clear display\n  IF (pick random 0 to 1) = 0 THEN:\n    clear display\n');
    assert.doesNotMatch(ts, /randomBoolean/, ts);
    assert.match(ts, /\(randint\(0, 2\) == 1\)/, ts);
});
