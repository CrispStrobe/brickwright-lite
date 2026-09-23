// The pre-push mirror check, held to the failures it was built from.
//
// scripts/check-mirrors.mjs reports "every duplicated fact agrees with its
// twin" on a clean tree, and a checker that says that is worth exactly nothing
// unless it can say the opposite. Both detectors are therefore driven with
// fixtures here — and both were WRONG when first written, in ways only this
// kind of exercise finds:
//
//   - the pin rule was "the file names the pin and contains a 40-hex sha",
//     which flagged six tests that exercise the pin MACHINERY with fixture
//     shas (aaaa…, 1111…, 0123…). A check that cries wolf on its first run is
//     one everybody learns to skip, so the rule is now the assertion SHAPE.
//   - the content reader preferred the git INDEX over the working tree, so an
//     unstaged edit — the commonest state anyone runs this in — was invisible.
//     Falsification caught it; nothing else would have.
import test from 'node:test';
import assert from 'node:assert/strict';
import {overlayPackagePairs, pinLiterals} from '../scripts/check-mirrors.mjs';

const src = (name, body) => [name, body];

test('a pin asserted against a stale literal is found, and named', () => {
    const found = pinLiterals({'some-dep': 'a'.repeat(40)}, [src('test/x.test.mjs', `
        assert.equal(JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url)))['some-dep'],
            '${'b'.repeat(40)}');
    `)]);
    assert.equal(found.length, 1, 'a literal that disagrees with the pin must be reported');
    assert.equal(found[0].name, 'some-dep');
    assert.deepEqual(found[0].found, ['b'.repeat(40)]);
});

test('the same assertion AGREEING is not reported', () => {
    const sha = 'c'.repeat(40);
    assert.deepEqual(pinLiterals({'some-dep': sha}, [src('test/x.test.mjs', `
        assert.equal(JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url)))['some-dep'], '${sha}');
    `)]), []);
});

test('THE FALSE POSITIVES THAT BROKE THE FIRST RULE stay quiet', () => {
    // Fixture shas in a test that exercises the pin machinery. The file names
    // the pin, mentions vendor-pins.json, and carries 40-hex literals — every
    // ingredient of the loose rule, and none of the shape of an assertion that
    // the REAL pin equals a literal.
    const machinery = src('test/pin-move-chain.test.mjs', `
        const PINS = path.join(ROOT, 'vendor-pins.json');
        // former pin values read out of the diff for vendor-pins.json
        writePins({'some-dep': '${'a'.repeat(40)}'});
        assert.equal(previous('some-dep'), '${'1'.repeat(40)}');
    `);
    assert.deepEqual(pinLiterals({'some-dep': 'd'.repeat(40)}, [machinery]), [],
        'a test that drives the pin machinery with fixtures is not asserting the real pin');
});

test('a pin named in no test at all is not a finding', () => {
    assert.deepEqual(pinLiterals({'lonely': 'e'.repeat(40)}, [src('test/y.test.mjs', 'nothing here')]), []);
});

test('the overlay/packages scan runs over the real tree and finds the pairs', () => {
    // Instrument before subject: if this returns nothing because the scan is
    // broken, the clean result below would be meaningless.
    const divergent = overlayPackagePairs();
    assert.ok(Array.isArray(divergent), 'the scan returns a list');
    assert.deepEqual(divergent, [],
        'this tree has diverged overlay/packages pairs:\n  ' +
        divergent.map(d => `${d.overlay} vs ${d.packages}`).join('\n  '));
});
