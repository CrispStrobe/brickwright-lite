/**
 * Every line the Arcade importer writes parses on Lite's pinned sb3-creator,
 * with no warning — in particular no truth value written where a value is
 * expected (tasks E0 and E9 of docs/OPEN-TASKS-2026-09-29.md).
 *
 * WHY. The Arcade importer (arcade-translate.js) writes about 140 dialect
 * words for the `arcade` and `arrays` extensions. Since D5 a line the parser
 * cannot read refuses the whole program, and since D7 every CONDITION-grammar
 * form in a value slot (`not (…)`, a comparison, `key a pressed?`, `touching
 * x`) is read as its literal text with a warning naming the branch form. A
 * translated `!x` that becomes the text "not (x = 0)" is a game that runs and
 * is wrong, so the importer must write a truth value in a value slot through a
 * value word (`compare value …`, `truthiness of value …`) or choose it first
 * (`IF c THEN: set _mcN to 1 ELSE: set _mcN to 0`, the branch form).
 *
 * WHAT IT READS. test/fixtures/makecode/arcade-import-inputs.json: every
 * distinct input the importer was given while the makecode-arcade-* and
 * makecode-export-arcade* tests ran (scripts/capture-arcade-import-corpus.mjs).
 * Each is translated again HERE, by the importer of this tree: E0 froze the
 * WIP importer's output instead, and that gate went on measuring a translator
 * E1 had already replaced.
 *
 * COUNTS. Comparison-as-value / condition-as-value warnings:
 *  - E0's frozen WIP output (290 programs, 2026-10-05; D7's rule): 86 / 26.
 *  - The importer E1 landed (#660), over this corpus (433 inputs, 417
 *    programs; a7d738ad1): 0 / 0 — E1 had already written true/false and `!x`
 *    through `compare value`. The paths this corpus does not reach (the
 *    fixed-sprite path's `!x` and comparisons as values, `key … pressed?`,
 *    `touching …`, `info.playerN.hasLife()`) are held form by slot in
 *    makecode-arcade-truth-values.test.mjs: 41 / 196 warnings in 183 of
 *    1080 cells before E9, 0 / 0 after.
 *  - E9: 0 / 0 here, asserted as zero.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {ARCADE_DIALECT_OPS} from '../overlay/scratch-gui/src/lib/arcadeDialect.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

const corpus = JSON.parse(readFileSync(new URL('./fixtures/makecode/arcade-import-inputs.json', import.meta.url), 'utf8'));

// Programs whose decompiled text does not read back: a hat or a DEFINE whose
// body is empty decompiles to a `# (empty)` the reader does not take as a body
// (a decompiler limit unrelated to these words; E0 found the same class).
// Every program the importer writes reaches a decompile fixed point. Four did
// not until sb3-creator 98748ee (task F6 of docs/OPEN-TASKS-2026-09-29.md):
// a body of only \`# unsupported:\` comments was mis-attached by the parser.
const NOT_FIXED_POINT = [];

function parse (code) {
    const c = new SB3Creator();
    try {
        c.parse(code);
        return {c, unread: []};
    } catch (e) {
        if (e.code !== 'DIALECT_UNPARSED_LINES') throw e;
        return {c, unread: e.lines};
    }
}

/** Warnings of a parse, by kind. */
function census (warnings) {
    const out = {comparison: 0, condition: 0, other: []};
    for (const w of warnings) {
        if (/is a COMPARISON used where a value is expected/.test(w)) out.comparison++;
        else if (/is a CONDITION used where a value is expected/.test(w)) out.condition++;
        else out.other.push(w);
    }
    return out;
}

// Translated once, by this tree's importer; distinct programs only.
const programs = [];
{
    const seen = new Set();
    for (const input of corpus.inputs) {
        const {code} = arcadeToPseudocode(corpus.sources[input.files], input.opts);
        if (seen.has(code)) continue;
        seen.add(code);
        programs.push({test: input.test, code});
    }
}

test('the corpus is what the importer was given by its tests', () => {
    assert.equal(corpus.inputs.length, 433);
    assert.equal(corpus.testFiles.length, 82);
    assert.equal(new Set(corpus.inputs.map(i => i.test)).size, corpus.testFilesTranslating);
    assert.equal(corpus.testFilesTranslating, 68);
    assert.equal(programs.length, 417);
    const lines = new Set(programs.flatMap(p => p.code.split('\n').map(l => l.trim()).filter(Boolean)));
    assert.ok(lines.size > 3500, `${lines.size} distinct lines`);
    // Every word family the importer uses is in it (not a corpus of plain Scratch).
    for (const word of ['arcade set local', 'arcade register', 'WHEN arcade', 'new array reference from',
        'calculate value', 'truthiness of value', 'compare value', 'arcade projectile', 'arcade set tilemap data']) {
        assert.ok([...lines].some(l => l.includes(word)), word);
    }
});

test('the pinned parser has the Arcade word table (231 opcodes)', () => {
    assert.equal(ARCADE_DIALECT_OPS.length, 231);
    for (const opcode of ['arcade_setPalette', 'arcade_registerInstanceDestroyedHandler',
        'arcade_whenRegisteredInstanceDestroyed', 'arcade_startParallelHandler',
        'arcade_whenParallelHandler']) assert.ok(ARCADE_DIALECT_OPS.includes(opcode), opcode);
});

test('every program the Arcade importer writes parses, with no unread line and no warning', () => {
    const unread = [];
    const total = {comparison: 0, condition: 0, other: []};
    for (const p of programs) {
        const {c, unread: lost} = parse(p.code);
        for (const l of lost) unread.push({test: p.test, text: l.text});
        const w = census(c.warnings);
        total.comparison += w.comparison;
        total.condition += w.condition;
        total.other.push(...w.other.map(x => `${p.test}: ${x}`));
    }
    assert.deepEqual(unread, []);
    assert.deepEqual(total.other, [], 'no other warning');
    assert.equal(total.comparison, 0, 'comparison-as-value warnings over the corpus');
    assert.equal(total.condition, 0, 'condition-as-value warnings over the corpus');
});

test('what parses reads back through the decompiler to a fixed point', () => {
    const moved = [];
    for (const p of programs) {
        const {c} = parse(p.code);
        const once = c.decompile();
        const again = parse(once);
        if (again.unread.length || again.c.decompile() !== once) moved.push(p.test);
    }
    assert.deepEqual(moved, NOT_FIXED_POINT);
});

test('the gate can fail: a dropped word is unread, a condition in a value slot is counted', () => {
    const program = programs.find(p => p.code.includes('\n  arcade set local '));
    const broken = program.code.replace('\n  arcade set local ', '\n  arcade put local ');
    const {unread} = parse(broken);
    assert.equal(unread.length, 1);
    assert.match(unread[0].text, /^arcade put local /);

    // What the importer wrote before E9 on the fixed-sprite path for
    // `takes(!flag)`, and on both paths for `say(controller.left.isPressed())`.
    for (const line of ['takes (not (not (flag = 0)))', 'say key left arrow pressed?']) {
        const {c} = parse(`SPRITE Game:\nWHEN flag clicked:\n  set flag to 0\n  ${line}\nDEFINE takes (v):\n  set flag to v\n`);
        assert.equal(census(c.warnings).condition, 1, line);
    }
    const {c} = parse('SPRITE Game:\nWHEN flag clicked:\n  set n to 0\n  set r to n < 3\n');
    assert.equal(census(c.warnings).comparison, 1);
});
