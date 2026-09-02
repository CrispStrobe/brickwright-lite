/**
 * The scope extractor the gate sweep's WINDOWED-SEARCH conversions depend on.
 *
 * The interesting test is `a neighbouring scope cannot satisfy an assertion`: it
 * reconstructs the exact defect a fixed window admits, and was confirmed against the
 * real importer before this file existed — the 1500-char window PASSES a source in
 * which openArtefactFile does not read bytes at all, because the window runs past the
 * method's closing brace and finds the call in the method after it.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {scopeAfter} from './helpers/js-scope.mjs';

test('a scope ends at its own closing brace, not a character count', () => {
    const src = 'a (x) {\n  first();\n}\nb (y) {\n  second();\n}\n';
    assert.equal(scopeAfter(src, 'a (x) {').includes('second()'), false);
    assert.ok(scopeAfter(src, 'a (x) {').includes('first()'));
});

test('a neighbouring scope cannot satisfy an assertion', () => {
    // `target` no longer calls it; `neighbour` does. A window wide enough to leave
    // target's body would report green. The scope must not.
    const src = 'target (f) {\n  noop();\n}\nneighbour (f) {\n  readAsArrayBuffer(f);\n}\n';
    assert.doesNotMatch(scopeAfter(src, 'target (f) {'), /readAsArrayBuffer/);
    // gate-shapes-allow: this window IS the defect, demonstrated deliberately.
    assert.match(src.slice(src.indexOf('target (f) {')).slice(0, 200), /readAsArrayBuffer/,
        'the window this replaces does find it — which is precisely the false green');
});

test('braces inside strings, templates and comments do not close a scope', () => {
    for (const inner of ["const s = '}';", 'const s = "}";', 'const s = `}`;', '// }', '/* } */']) {
        const src = `f () {\n  ${inner}\n  tail();\n}\nafter () {}\n`;
        assert.ok(scopeAfter(src, 'f () {').includes('tail()'), `closed early on: ${inner}`);
    }
});

test('an escaped quote does not end a string early', () => {
    const src = "f () {\n  const s = 'a\\'}';\n  tail();\n}\nafter () {}\n";
    assert.ok(scopeAfter(src, 'f () {').includes('tail()'));
});

test('a missing or ambiguous scope is an error, never an empty match', () => {
    assert.throws(() => scopeAfter('a () {}', 'nope (x) {'), /no such scope/);
    assert.throws(() => scopeAfter('f () {}\nf () {}', 'f () {'), /ambiguous scope/);
    assert.throws(() => scopeAfter('f () {\n  unbalanced();\n', 'f () {'), /unbalanced body/);
});
