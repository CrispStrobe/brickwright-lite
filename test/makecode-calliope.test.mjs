/**
 * Calliope mini, arrays, and bitwise arithmetic.
 *
 * The Calliope runs the micro:bit's API on different hardware, so it goes
 * through the micro:bit translator — and driving the 25 example programmes
 * from calliope.cc through it is what found everything in this file. Each
 * test below is one of those findings, and most of them are the same
 * failure in different clothes: pseudocode that LOOKS right, parses without
 * complaint, and compiles to nothing.
 *
 *   `set x to x & 255`   — no bitwise operator in the core grammar, so the
 *                          set-variable block came out with no value at all.
 *   `set Liste to 0`     — an array declaration collapsed to a number, and
 *                          every later `Liste[i]` read that number.
 *
 * Both now map to bundled extensions (`bitops`, `arrays`) rather than being
 * emitted-and-wrong or refused. The `arrays` extension matters twice over:
 * it indexes from 0, exactly as TypeScript does, so `a[i]` needs no
 * invisible +1 the way a Scratch list would.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';

const COMPILER = join(INTEGRATED, 'src', 'lib', 'sb3-creator.js');
const canCompile = existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;

/** Wrap a body in the hat every micro:bit translation gets. */
const forever = body => `basic.forever(function () {\n${body}\n})`;

/** Compile and return {opcodes, extensions} — what the blocks actually are. */
const compile = source => {
    const project = new SB3Creator().parse(source);
    const opcodes = new Set();
    for (const target of project.targets) {
        for (const block of Object.values(target.blocks || {})) {
            if (block && block.opcode) opcodes.add(block.opcode);
        }
    }
    return {opcodes, extensions: new Set(project.extensions || []), project};
};

// ── bitwise ─────────────────────────────────────────────────────────────

test('bitwise operators become bitops blocks, not a dropped input', {skip: !canCompile}, () => {
    const {code, unsupported} = microbitToPseudocode(
        `let x = 0\n${forever('  x = (x << 3) | 5\n  x = x & 255\n  x = ~x')}`);
    assert.deepEqual(unsupported, []);
    const {opcodes, extensions} = compile(code);
    for (const op of ['bitops_shl', 'bitops_or', 'bitops_and', 'bitops_not']) {
        assert.ok(opcodes.has(op), `expected ${op} in ${[...opcodes].join(', ')}`);
    }
    assert.ok(extensions.has('bitops'), 'the project must declare the bitops extension');
});

test('a bitwise assignment carries a number, not the text of the expression',
    {skip: !canCompile}, () => {
    // Left alone, `set wert to wert & 255` parses — as a STRING LITERAL
    // whose text is `wert & 255`. The variable then holds those ten
    // characters, and every sum that reads it is wrong, silently.
    const {code} = microbitToPseudocode(`let wert = 0\n${forever('  wert = wert & 255')}`);
    const {project} = compile(code);
    const blocks = project.targets.flatMap(t => Object.values(t.blocks || {}));
    const sets = blocks.filter(b => b && b.opcode === 'data_setvariableto');
    assert.equal(sets.length, 2, 'expected the declaration and the masked assignment');
    const masked = sets[1].inputs.VALUE;
    assert.equal(masked[0], 3, `the value should be a block reference, got ${JSON.stringify(masked)}`);
    assert.ok(blocks.some(b => b && b.opcode === 'bitops_and'));
});

test('>>> uses the signed shift, which agrees on non-negative values', () => {
    const {code, unsupported} = microbitToPseudocode(`let x = 8\n${forever('  x = x >>> 2')}`);
    assert.deepEqual(unsupported, []);
    assert.match(code, /shiftright 2/);
});

// ── arrays ──────────────────────────────────────────────────────────────

test('an array declaration becomes an array, not the number zero', {skip: !canCompile}, () => {
    const {code, unsupported} = microbitToPseudocode(
        `let farben: string[] = []\nlet zahlen = [3, 1, 2]\n${forever('  farben.push("rot")')}`);
    assert.deepEqual(unsupported, []);
    assert.doesNotMatch(code, /set (farben|zahlen) to 0/,
        'an array collapsed to a number — every later index would read that number');
    const {opcodes, extensions} = compile(code);
    assert.ok(opcodes.has('arrays_createEmpty'));
    assert.ok(opcodes.has('arrays_create1D'));
    assert.ok(opcodes.has('arrays_push'));
    assert.ok(extensions.has('arrays'));
});

test('array indexing stays 0-based, as TypeScript wrote it', {skip: !canCompile}, () => {
    // The reason arrays map to the extension rather than to Scratch lists:
    // lists index from 1, so `a[0]` would need a +1 that is invisible in
    // the blocks, and any computed index would be silently off by one.
    const {code} = microbitToPseudocode(`let a = [7, 8, 9]\n${forever('  a[0] = a[2]')}`);
    assert.match(code, /set item 0 of array "a" to item 2 of array "a"/);
    const {opcodes} = compile(code);
    assert.ok(opcodes.has('arrays_set'));
    assert.ok(opcodes.has('arrays_get'));
});

test('the array methods these programs use all map', {skip: !canCompile}, () => {
    const {code, unsupported} = microbitToPseudocode(`let a = [1]\nlet i = 0\n${forever([
        '  a.push(4)',
        '  a.insertAt(1, 5)',
        '  a.removeAt(0)',
        '  i = a.length',
        '  i = a.indexOf(4)',
        '  i = a.pop()'
    ].join('\n'))}`);
    assert.deepEqual(unsupported, []);
    const {opcodes} = compile(code);
    for (const op of ['arrays_push', 'arrays_insert', 'arrays_remove',
        'arrays_length', 'arrays_indexOf', 'arrays_pop']) {
        assert.ok(opcodes.has(op), `expected ${op} in ${[...opcodes].join(', ')}`);
    }
});

test('a callback-taking array method is reported, never guessed at', () => {
    const {unsupported} = microbitToPseudocode(
        `let a = [1]\nlet b = 0\n${forever('  b = a.filter((v: number) => v > 2).length')}`);
    assert.ok(unsupported.some(u => /filter\(\).*function/.test(u)), unsupported.join(' | '));
});

// ── images ──────────────────────────────────────────────────────────────

test('an icon used as a value becomes a pattern the display can show', {skip: !canCompile}, () => {
    const {code, unsupported} = microbitToPseudocode(
        forever('  images.iconImage(IconNames.Heart).showImage(0)'));
    assert.deepEqual(unsupported, []);
    assert.match(code, /show pattern 09090:99999:99999:09990:00900/);
    assert.ok(compile(code).opcodes.has('microbitplus_showmatrix'));
});

test('an image chosen at runtime is refused, because MATRIX is a field', () => {
    // Not a grammar gap: microbitplus_showmatrix carries the pattern as a
    // FIELD, and a field cannot hold a reporter at all.
    const {unsupported} = microbitToPseudocode(
        `let bilder = [images.iconImage(IconNames.Heart)]\nlet i = 0\n${
            forever('  bilder[i].showImage(0)')}`);
    assert.ok(unsupported.some(u => /fixed pattern/.test(u)), unsupported.join(' | '));
});

// ── the Calliope's own hardware ─────────────────────────────────────────

test('Calliope-only hardware is named, not merely refused', () => {
    const {unsupported} = microbitToPseudocode(forever('  basic.setLedColor(Colors.Green)'));
    assert.equal(unsupported.length, 1);
    assert.match(unsupported[0], /RGB LED/,
        'a report of `basic.setLedColor()` alone teaches the reader nothing');
});

test('music.beat is a duration the tone block accepts', () => {
    // `music.playTone(440, music.beat(BeatFraction.Half))` — the MS slot
    // takes a literal, and beat() is a Call, so the check has to ask what
    // the expression BECAME rather than what shape it arrived in.
    const {code, unsupported} = microbitToPseudocode(
        forever('  music.playTone(440, music.beat(BeatFraction.Half))'));
    assert.deepEqual(unsupported, []);
    assert.match(code, /play tone 440 hz for 250 ms/);
});

// ── the TypeScript the Calliope editor emits ────────────────────────────

test('identifiers may be German', () => {
    const ast = parseMakeCodeTs('let ausgewählt = 0\nlet größe = 1\nausgewählt = größe');
    assert.equal(ast.body.length, 3);
});

test('a destructured event parameter parses', () => {
    // radio.onDataPacketReceived(({receivedString: text}) => {...}) — two of
    // the 25 Calliope programmes are written this way, and the parser
    // rejected the whole file.
    const ast = parseMakeCodeTs(
        'radio.onDataPacketReceived(({ receivedString: name, receivedNumber: value }) => {\n' +
        '    basic.showString(name)\n})');
    assert.equal(ast.body.length, 1);
});

// ── the corpus itself ───────────────────────────────────────────────────

test('every committed Calliope fixture translates and compiles', {skip: !canCompile}, async () => {
    const dir = join(REPO, 'test', 'fixtures', 'makecode');
    const files = readdirSync(dir).filter(f => f.startsWith('calliope-'));
    assert.ok(files.length > 0, 'no Calliope fixture is committed');
    const {importArtefact} = await import(
        '../overlay/scratch-gui/src/lib/bw-makecode/index.js');
    for (const file of files) {
        const result = await importArtefact(
            new Uint8Array(readFileSync(join(dir, file))), {name: file});
        assert.equal(result.lang, 'pseudocode', file);
        assert.match(result.code, /Calliope mini/, `${file} should say which board it came from`);
        compile(result.code);                       // throws if it does not parse
    }
});
