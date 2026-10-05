// The BASIC twin-run oracle — the referee for the BASIC lane.
//
// It runs one BBC BASIC program on two INDEPENDENT engines and compares their
// console output: the emulated BBC BASIC (Z80) machine the Code tab actually
// runs (BbcZ80Runner over static/roms/bbcbasic.com), and BBCSDL (R.T. Russell,
// zlib) built as a host console `bbcbasic`. See basic-twin-oracle.js.
//
// What runs here with no setup:
//   - the normaliser and the comparator, including SYNTHETIC offenders that
//     prove each mismatch class fires (emulation-vs-reference, and the codegen
//     case only the `expected` anchor can catch);
//   - a REAL run on the emulated engine, so the engine side has a holder that
//     is a pass, not a skip.
// The LIVE cross-engine twin-run (emulated vs the BBCSDL reference across the
// fixtures) needs the native reference built, so it is NOT a unit test here —
// it is `scripts/verify-basic-oracle.mjs` (CLI, and the CI workflow that builds
// the reference). That keeps this suite free of a skip that would never execute
// in it (MEMORY: a skip must not count as a pass); the comparator above already
// proves the mismatch logic without a live reference.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeConsole, compareTwin, runEmulatedBbc} from
    '../overlay/scratch-gui/src/lib/bw-debug/basic-twin-oracle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COM = new Uint8Array(readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/roms/bbcbasic.com')));

test('normalizeConsole folds CR/LF/CRLF and trims trailing/edge blanks, keeping print-field leading spaces', () => {
    assert.equal(normalizeConsole('a\r\nb\r\n'), 'a\nb');
    assert.equal(normalizeConsole('\n\na\n\n'), 'a');
    assert.equal(normalizeConsole('   4   \n'), '   4'); // leading spaces kept, trailing dropped
    assert.equal(normalizeConsole('a  \r\n  b'), 'a\n  b');
});

test('compareTwin passes only when the engines agree and (if anchored) match expected', () => {
    const v = compareTwin({emulated: '  4\r\n', reference: '  4\n', expected: '  4'});
    assert.equal(v.pass, true);
    assert.equal(v.mismatch, null);
});

test('compareTwin reddens an emulation-vs-reference divergence (a synthetic offender)', () => {
    const v = compareTwin({emulated: '         5', reference: '         4', expected: '         4'});
    assert.equal(v.pass, false);
    assert.equal(v.mismatch, 'emulated-vs-reference');
});

test('compareTwin reddens a codegen divergence — only the expected anchor can (two agreeing wrongs)', () => {
    // Both engines ran the same wrong emitted program and AGREE; without the
    // anchor this would read as a pass.
    const agree = compareTwin({emulated: 'X\nX', reference: 'X\nX', expected: null});
    assert.equal(agree.pass, true, 'no anchor → two agreeing wrongs look clean');
    const v = compareTwin({emulated: 'X\nX', reference: 'X\nX', expected: 'X\nX\nX'});
    assert.equal(v.pass, false);
    assert.equal(v.mismatch, 'both-vs-expected');
});

test('the emulated BBC BASIC (Z80) machine runs a program and prints a computed result', () => {
    // The engine side, as a real pass (no reference needed): PRINT 2+2 → 4,
    // right-justified in BBC BASIC's print field.
    const r = runEmulatedBbc(COM, '10 PRINT 2+2');
    assert.equal(r.reason, 'ok', `run completed (reason ${r.reason})`);
    assert.equal(normalizeConsole(r.output), '         4');
});
