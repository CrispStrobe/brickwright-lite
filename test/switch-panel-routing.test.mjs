// THE SWITCH PANEL — the host half of "a widget can change the world".
//
// bw-board grew `capabilities().inputs` and `setInput(chip, port, bit, level)`
// so a machine can be given switch and sensor input. This is the path from a
// person's click to that call, and the three things it has to get right are
// the three that were wrong in the analogous paths before:
//
//   - the control must not appear when the machine cannot read it,
//   - a refused write must not move the control, and
//   - CLOSED must pull the line LOW, because that is what a breadboard
//     button does and a panel whose "on" meant 1 would invert every program.
//
// SOURCE-LEVEL, and the limit is stated rather than hidden: there is no
// prebuilt bundle on this box to drive a browser against. What is checked is
// the wiring and the polarity, which is where the defects were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(repo, p), 'utf8');
const panel = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/SwitchPanel.jsx');
const debugPanel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');
const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');

test('CLOSED pulls the line LOW — the polarity a breadboard button has', () => {
    // The single most invertible line in the file. An undriven TTL input floats
    // high, so a switch at rest reads 1 and closing it pulls to 0. Get this
    // backwards and every program a learner tests behaves opposite to the
    // hardware it is modelled on, while the panel looks perfectly sensible.
    assert.match(panel, /setInputFn\(chip, port, bit, close \? 0 : 1\)/,
        'closing must send level 0');
    assert.match(panel, /pulls its line LOW/i,
        'and the user is told, because the label alone would read backwards');
});

test('the machine decides, so a refused write does not move the control', () => {
    // setInput returns false when there is nothing to drive. A control that
    // moved anyway would be lying about a machine that refused -- the same
    // shape as a keyboard widget on a board with no PIC.
    assert.match(panel, /if \(setInputFn\(chip, port, bit, close \? 0 : 1\) === false\) return;/,
        'the state update is AFTER the machine agrees, and gated on it');
});

test('no inputs, no panel — at all three layers', () => {
    // bw-board declares [] for a board with no 8255; the runner must not
    // expose setInput; the debug panel must not mount the control. Any one of
    // the three leaking gives a user toggles that do nothing, which is
    // indistinguishable from a program ignoring them.
    assert.match(panel, /if \(!Array\.isArray\(inputs\) \|\| !inputs\.length\) return null;/,
        'the component renders nothing');
    assert.match(runner, /caps\.inputs[\s\S]{0,60}inputs\.length/,
        'the runner gates on a NON-EMPTY declared list');
    assert.match(runner, /delete runner\.setInput/,
        'and removes a stale one when a new machine has none');
    assert.match(debugPanel, /runner\.inputs\)\s*\n?\s*&& this\.state\.runner\.inputs\.length \? \(/,
        'the panel mounts only for a machine that declares inputs');
});

test('the toggle handler has a stable identity, or every switch rebuilds each frame', () => {
    // Same defect that once kept VdpScreen black: the panel re-renders on
    // every runner emit at rAF cadence, and an inline arrow would give the
    // memoised handler a new dependency every time.
    assert.match(debugPanel, /this\._setInputFn = \(chip, port, bit, level\) =>/,
        'bound once in the constructor');
    assert.match(debugPanel, /setInputFn=\{this\._setInputFn\}/,
        'and passed by reference, not inline');
});

test('bit 7 is drawn leftmost, as a datasheet prints a port', () => {
    // A port drawn 0..7 left to right reads backwards against every datasheet
    // and every hex value the program prints.
    assert.match(panel, /for \(let bit = bits - 1; bit >= 0; bit--\)/);
});
