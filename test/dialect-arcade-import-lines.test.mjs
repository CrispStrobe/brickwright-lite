/**
 * Every line the parked Arcade importer writes parses on Lite's pinned
 * sb3-creator (task E0 of docs/OPEN-TASKS-2026-09-29.md).
 *
 * WHY. The Arcade importer parked from the Codex WIP (arcade-translate.js, on
 * local branch lane/e1-arcade-import) writes about 140 dialect words for the
 * `arcade` and `arrays` extensions — sprites, images, tiles, scenes, handler
 * registration, a call frame's locals, array REFERENCES and MakeCode values.
 * The pinned parser had none of them, and since D5 a line it cannot read
 * refuses the whole program: E1's first attempt turned 18 green Arcade tests
 * red. E0 put the words upstream (sb3-creator arcadeDialect.js, one table read
 * by the parser and the decompiler) and the array-reference blocks they map to
 * (CrispStrobe/extensions arrays.js). This test holds the result against
 * everything the importer actually emitted, so E1 can land its translator on
 * a parser that reads it.
 *
 * WHAT IT READS. test/fixtures/makecode/arcade-import-dialect-e1.json: the 290
 * distinct programs the importer emitted while its 76 tests ran, frozen (the
 * importer itself is E1's to land, not this test's).
 *
 * WHAT IT HOLDS.
 *  - Every program parses with no unread line (D5's gate), except the one
 *    named below, which is refused BY NAME, not dropped.
 *  - The only warnings are the dialect's comparison-as-value warning: the
 *    importer writes MakeCode's `true`/`false` as `(0 < 1)`/`(1 < 0)` in value
 *    positions, which this dialect deliberately has no value form for (the
 *    warning is kept; E1 is to write a Boolean value through a word instead,
 *    e.g. `compare value (0) op "<" with (1)`). Counted exactly, so a new kind
 *    of warning, or more of these, is red.
 *  - Every program that parses decompiles and reads back to a fixed point,
 *    except the four whose script has a hat with a comment-only body (a
 *    decompiler limit unrelated to these words: it reproduces with
 *    `WHEN flag clicked:` and a comment).
 *  - The vendored word table is the one this corpus was read with.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {ARCADE_DIALECT_OPS} from '../overlay/scratch-gui/src/lib/arcadeDialect.js';

const corpus = JSON.parse(readFileSync(new URL('./fixtures/makecode/arcade-import-dialect-e1.json', import.meta.url), 'utf8'));

// The one emitted line the parser refuses: a call that leaves out a MakeCode
// optional argument (`function repeatIt(message: string, times?: number)`,
// called `repeatIt("Hello")`). The WIP parser filled the gap with 0 and a
// warning; E0 did not port that, so the line is refused by name. E1 is to
// write the missing argument (MakeCode passes undefined: `undefined value`).
const REFUSED = [{test: 'makecode-arcade-optional-procedure.test.mjs', text: 'repeatIt "Hello"'}];

// Counted 2026-10-05 over the frozen corpus at sb3-creator with E0's words.
const COMPARISON_WARNINGS = 86;
const NOT_FIXED_POINT = 4;

function parse(code) {
    const c = new SB3Creator();
    try {
        c.parse(code);
        return {c, unread: []};
    } catch (e) {
        if (e.code !== 'DIALECT_UNPARSED_LINES') throw e;
        return {c, unread: e.lines};
    }
}

test('the frozen corpus is what the importer emitted for its 76 tests', () => {
    assert.equal(corpus.programs.length, 290);
    assert.equal(corpus.source.testFiles, 76);
    assert.equal(new Set(corpus.programs.map(p => p.test)).size, corpus.source.testFilesTranslating);
    const lines = new Set(corpus.programs.flatMap(p => p.code.split('\n').map(l => l.trim()).filter(Boolean)));
    assert.ok(lines.size > 3500, `${lines.size} distinct lines`);
    // Every word family the importer uses is in it (not a corpus of plain Scratch).
    for (const word of ['arcade set local', 'arcade register', 'WHEN arcade', 'new array reference from',
        'calculate value', 'truthiness of value', 'arcade projectile', 'arcade set tilemap data']) {
        assert.ok([...lines].some(l => l.includes(word)), word);
    }
});

test('the pinned parser has the Arcade word table (156 opcodes)', () => {
    assert.equal(ARCADE_DIALECT_OPS.length, 156);
});

test('every program the Arcade importer emitted parses, with no unread line except the one refused by name', () => {
    const unread = [];
    let warnings = 0;
    const other = [];
    for (const p of corpus.programs) {
        const {c, unread: lost} = parse(p.code);
        for (const l of lost) unread.push({test: p.test, text: l.text});
        for (const w of c.warnings) {
            if (/is a COMPARISON used where a value is expected/.test(w)) warnings++;
            else other.push(`${p.test}: ${w}`);
        }
    }
    assert.deepEqual(unread, REFUSED);
    assert.deepEqual(other, [], 'no warning but the comparison-as-value one');
    assert.equal(warnings, COMPARISON_WARNINGS, 'comparison-as-value warnings over the corpus');
});

test('the refused line is refused for what it is, not swallowed', () => {
    const program = corpus.programs.find(p => p.code.includes(REFUSED[0].text));
    const {unread} = parse(program.code);
    assert.equal(unread.length, 1);
    assert.equal(unread[0].text, REFUSED[0].text);
    assert.match(unread[0].reason, /no statement of this dialect reads it/);
});

test('what parses reads back through the decompiler to a fixed point', () => {
    const moved = [];
    for (const p of corpus.programs) {
        const {c, unread} = parse(p.code);
        if (unread.length) continue;
        const once = c.decompile();
        const again = parse(once);
        if (again.unread.length || again.c.decompile() !== once) moved.push(p.test);
    }
    assert.equal(moved.length, NOT_FIXED_POINT, `not a fixed point: ${moved.join(', ')}`);
    assert.deepEqual([...new Set(moved)].sort(),
        ['makecode-arcade-runs.test.mjs', 'makecode-arcade-scenes-import.test.mjs']);
});

test('the gate can fail: a word dropped from the emitted text is reported with its line', () => {
    const program = corpus.programs.find(p => p.code.includes('\n  arcade set local '));
    const broken = program.code.replace('\n  arcade set local ', '\n  arcade put local ');
    const {unread} = parse(broken);
    assert.equal(unread.length, 1);
    assert.match(unread[0].text, /^arcade put local /);
});
