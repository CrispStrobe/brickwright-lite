/**
 * Task B15 of docs/OPEN-TASKS-2026-09-29.md -- one avr8js.
 *
 * bw-board depends on our avr8js fork (bw-board #413: the ATtiny85 Timer 1
 * PWM counted single-slope, as datasheet 2586Q section 12.2.2 says; npm
 * 0.21.0 counted it up and down, twice the period). The GUI package declared
 * its own `avr8js ^0.21.0` beside it: nothing in the app imported that copy,
 * but anything resolving `avr8js` from packages/scratch-gui got the old timer.
 * The GUI now declares bw-board's exact spec, held equal here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {AVR8JS_SPEC} from '../scripts/lib/avr8js-spec.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('the GUI package and integrate.mjs declare the avr8js the pinned bw-board depends on', () => {
    const board = json('node_modules/bw-board/package.json');
    assert.equal(AVR8JS_SPEC, board.dependencies.avr8js, 'the spec follows the pinned bw-board');
    assert.equal(json('packages/scratch-gui/package.json').dependencies.avr8js, AVR8JS_SPEC);
    const integrate = fs.readFileSync(path.join(ROOT, 'scripts/integrate.mjs'), 'utf8');
    assert.match(integrate, /pkg\.dependencies\['avr8js'\] = AVR8JS_SPEC;/, 'integrate writes it, unconditionally');
});

test('the copy the GUI package resolves is the fork build, where it is installed', (t) => {
    const installed = path.join(ROOT, 'packages/scratch-gui/node_modules/avr8js/package.json');
    if (!fs.existsSync(installed)) return t.skip('packages/scratch-gui has no installed node_modules here');
    // The fork marks its builds with a -bw.N prerelease of the upstream version.
    assert.match(json('packages/scratch-gui/node_modules/avr8js/package.json').version, /-bw\.\d+$/);
});
