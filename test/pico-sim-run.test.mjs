/**
 * pico-sim-run — the MicroPython simulator Run. The boot + live-run + GPIO
 * chain is proven by the emulator oracle (pico-micropython-gpio.test.mjs); what
 * is pure and belongs here is the refuse-by-name guard: the sim cannot honour
 * machine.reset() (finding N3c-1), so a program whose text calls it is refused
 * rather than frozen. `programCallsReset` is the detector, and it must be
 * importable and testable WITHOUT the emulator — which it is, because the
 * module keeps its heavy deps (adapter, repl, USB-CDC) behind dynamic imports.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {programCallsReset} from '../overlay/scratch-gui/src/lib/pico-sim-run.js';

test('programCallsReset flags a machine.reset() the sim cannot honour', () => {
    assert.equal(programCallsReset('import machine\nmachine.reset()'), true);
    assert.equal(programCallsReset('import machine\nmachine . reset ( )'), true, 'whitespace slipped past the detector');
    assert.equal(programCallsReset('from machine import reset\nreset()'), true, 'a bare reset() from machine slipped past');
});

test('programCallsReset does not flag a program that never resets', () => {
    assert.equal(programCallsReset('from machine import Pin\nPin(25, Pin.OUT).on()'), false);
    assert.equal(programCallsReset('while True:\n  led.toggle()\n  sleep(0.5)'), false);
    // A reset() on some OTHER object, with no machine import, is not the trap.
    assert.equal(programCallsReset('counter.reset()'), false, 'a non-machine reset() was over-flagged');
});

test('programCallsReset tolerates empty / non-string input', () => {
    assert.equal(programCallsReset(''), false);
    assert.equal(programCallsReset(null), false);
    assert.equal(programCallsReset(undefined), false);
});
