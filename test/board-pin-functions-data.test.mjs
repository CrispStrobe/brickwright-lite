import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function sidecar(kind) {
    return JSON.parse(await readFile(
        `overlay/scratch-gui/src/lib/bw-circuit-ui/parts-data/${kind}.json`, 'utf8'));
}

function pin(board, name) {
    return board.terminals.find(t => t.name === name);
}

test('Nano sidecar preserves audited AVR alternate functions', async () => {
    const nano = await sidecar('arduino_nano');
    assert.deepEqual(pin(nano, 'd3').functions, ['gpio', 'int1', 'pwm_t2b']);
    assert.deepEqual(pin(nano, 'a5').functions, ['gpio', 'adc5', 'scl']);
    assert.deepEqual(pin(nano, 'a6').functions, ['analog_only']);
    assert.deepEqual(pin(nano, 'gnd').functions, []);
});

test('Pico sidecar records GPIO, peripheral, and power pins distinctly', async () => {
    const pico = await sidecar('pi_pico');
    assert.deepEqual(pin(pico, 'gp0').functions, ['gpio', 'pwm', 'txd0', 'sda0', 'spi0_rx']);
    assert.deepEqual(pin(pico, 'gp28').functions, ['gpio', 'pwm', 'adc2', 'sda0', 'spi1_rx']);
    assert.deepEqual(pin(pico, 'gnd_1').functions, []);
});

test('Uno sidecar carries audited alternate functions', async () => {
    const uno = await sidecar('arduino_uno');
    // D13 is ATmega328P PB5 — GPIO + SPI SCK.
    assert.deepEqual(pin(uno, 'd13').functions, ['gpio', 'sclk']);
    // GND has no alternate functions.
    assert.deepEqual(pin(uno, 'gnd').functions, []);
});
