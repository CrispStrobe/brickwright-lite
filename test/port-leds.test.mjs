// LEDS — what a program is doing on the WIRES, which for half the device
// corpus is the only thing it does.
//
// Traffic lights, a stepper, a bargraph: they write an 8255 port and print
// nothing. `video()` shows the CGA page, so those programs were invisible
// while working perfectly. This is the panel that shows them, and the three
// things it has to get right are the three that would each look plausible
// while being wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(repo, p), 'utf8');
const leds = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/PortLeds.jsx');
const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');
const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');

test('a lamp is lit from PINS and gated on DIRECTION, never from value alone', () => {
    // Drawing `value` would light a lamp for a bit configured as an INPUT --
    // a wire the chip is not driving. An 8255's mode word can flip a port to
    // input at any instruction, so such a panel keeps showing a pattern the
    // program has stopped controlling, and it looks entirely alive.
    assert.match(leds, /const driven = \(dir >> bit\) & 1;/, 'direction decides visibility');
    assert.match(leds, /const high = \(pins >> bit\) & 1;/,
        'and the LEVEL comes from pins -- the latch where the chip drives, the input elsewhere');
    assert.doesNotMatch(leds, /\(value >> bit\) & 1[\s\S]{0,40}is-on/,
        'the lamp must not be driven from `value`');
});

test('undriven is ABSENT, not dark — "off" and "not mine" are different facts', () => {
    // A learner reading a bargraph has to be able to tell a bit the program
    // set low from a bit the program does not own.
    assert.match(leds, /is-undriven/);
    assert.match(leds, /not driven/, 'and it is said in the accessible label too');
    assert.match(leds, /driven \? \(high \? '●' : '○'\) : '·'/, 'three states, not two');
});

test('the hex read-out shows undriven bits as dashes, not zeros', () => {
    // A zero there is a CLAIM: it says the chip is driving that pin low.
    assert.match(leds, /\? String\(\(value >> bit\) & 1\) : '-'/);
});

test('state is asked per render, never captured', () => {
    // Port state changes every instruction. A snapshot passed as a prop would
    // draw a photograph -- the same mistake as putting `value` in a
    // capability, which the bw-board test pins from the other side.
    assert.match(leds, /outputsFn\}\)/, 'the component takes a FUNCTION');
    assert.match(leds, /typeof outputsFn === 'function' \? outputsFn\(\) : null/);
    assert.match(runner, /runner\.outputs = \(\) => target\.outputs\(\)/,
        'and the runner exposes a function, not an array');
});

test('no ports, no panel — gated at all three layers', () => {
    assert.match(leds, /if \(!Array\.isArray\(ports\) \|\| !ports\.length\) return null;/);
    assert.match(runner, /caps\.outputs[\s\S]{0,40}outputs\.length/);
    assert.match(runner, /delete runner\.outputs/, 'and a stale one is removed');
    assert.match(panel, /typeof this\.state\.runner\.outputs === 'function' \? \(/);
});

test('bit 7 is leftmost, matching the switch panel and every datasheet', () => {
    assert.match(leds, /for \(let bit = 7; bit >= 0; bit--\)/);
});
