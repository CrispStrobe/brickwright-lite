import {test} from 'node:test';
import assert from 'node:assert/strict';

import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

test('retargetPseudocode rewrites STC blink to Pico with GP25', () => {
    const src = `DEVICE STC12C5A60S2

PIN led1 = P1.0 OUTPUT ACTIVE LOW

WHEN green flag clicked
FOREVER
  turn on led1
  wait 0.5 seconds
  turn off led1
  wait 0.5 seconds
END FOREVER`;
    const result = SB3Creator.retargetPseudocode(src, 'pico');
    assert.equal(result.ok, true, `should succeed: ${result.reasons}`);
    assert.ok(result.pseudocode.includes('DEVICE PICO'), 'should have DEVICE PICO');
    assert.ok(result.pseudocode.includes('GP25'), 'should use GP25 for the LED');
    assert.ok(!result.pseudocode.includes('P1.0'), 'should not keep P1.0');
});

test('retargetPseudocode rewrites STC blink to Arduino Nano with D13', () => {
    const src = `DEVICE STC12C5A60S2\nPIN led1 = P1.0 OUTPUT ACTIVE LOW\nWHEN green flag clicked\nFOREVER\n  turn on led1\n  wait 0.5 seconds\nEND FOREVER`;
    const result = SB3Creator.retargetPseudocode(src, 'arduino-nano');
    assert.equal(result.ok, true, `should succeed: ${result.reasons}`);
    assert.ok(result.pseudocode.includes('DEVICE ARDUINO-NANO'));
    assert.ok(result.pseudocode.includes('D13'));
});

test('retargetPseudocode refuses ADC on STC89C52RC', () => {
    const src = `DEVICE STC12C5A60S2\nPIN pot = P1.3 ANALOG\nWHEN green flag clicked\nFOREVER\n  set x to read pot\nEND FOREVER`;
    const result = SB3Creator.retargetPseudocode(src, 'stc89c52rc');
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some(r => /ADC/i.test(r)), `should mention ADC: ${result.reasons}`);
});

test('retargetPseudocode refuses unknown device', () => {
    const result = SB3Creator.retargetPseudocode('DEVICE STC12C5A60S2\nPIN x = P1.0 OUTPUT\n', 'nonexistent');
    assert.equal(result.ok, false);
    assert.ok(result.reasons[0].includes('unknown'));
});

test('RETARGET_POOLS covers all compilable devices', () => {
    const pools = SB3Creator.RETARGET_POOLS;
    assert.ok(pools);
    for (const dev of ['stc12c5a60s2', 'stc89c52rc', 'arduino-uno', 'arduino-nano', 'pico']) {
        assert.ok(pools[dev], `${dev} should have a pool`);
        assert.ok(Array.isArray(pools[dev].digital), `${dev} should have digital pins`);
    }
});

const trafficLight = `DEVICE ARDUINO-UNO
CLOCK 16000000
PIN red = D13 OUTPUT
PIN yellow = D12 OUTPUT
PIN green = D8 OUTPUT

WHEN flag clicked:
  FOREVER:
    turn on red
    turn off yellow
    turn off green
    wait 3 seconds`;

for (const [device, pins] of [
    ['microbit', ['P0', 'P1', 'P2']],
    ['calliopemini', ['P0', 'P1', 'P2']],
    ['arcade', ['D0', 'D1', 'D2']],
    ['pybadge', ['D13', 'D12', 'D11']],
    ['pybadge-lc', ['D0', 'D1', 'D2']],
    ['samd51', ['PA8', 'PA9', 'PA10']]
]) {
    test(`traffic light retargets to selectable ${device}`, () => {
        const result = SB3Creator.retargetPseudocode(trafficLight, device);
        assert.equal(result.ok, true, `should succeed: ${result.reasons}`);
        assert.match(result.pseudocode, new RegExp(`^DEVICE ${device.toUpperCase()}$`, 'm'));
        for (const pin of pins) assert.match(result.pseudocode, new RegExp(`= ${pin} OUTPUT`));
    });
}

test('PyBadge I2C roles land on its real SDA/SCL header pins', () => {
    const source = `DEVICE ARDUINO-UNO
PIN sda = A4 OUTPUT
PIN scl = A5 OUTPUT
WHEN flag clicked:
  wait 1 seconds`;
    const result = SB3Creator.retargetPseudocode(source, 'pybadge');
    assert.equal(result.ok, true, `should succeed: ${result.reasons}`);
    assert.match(result.pseudocode, /^PIN sda = SDA OUTPUT$/m);
    assert.match(result.pseudocode, /^PIN scl = SCL OUTPUT$/m);
});
