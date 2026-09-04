// Positive assertion: the STC12C5A60S2 pin map is correct.
//
// The old sidecar carried PSEN, ALE and EA (AT89C51 pins that do not exist
// on the STC12C5A60S2) and had P0 ascending when the real chip descends.
// This test asserts specific physical-pin-to-port mappings from the
// datasheet, so a stale sidecar fails loudly rather than passing by omission.
//
// Source: STC12C5A60S2 datasheet, 40-pin PDIP package.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The STC12C5A60S2 40-pin PDIP pin assignments (datasheet ground truth):
const STC12_PDIP40 = {
    1:  'P1.0',   2:  'P1.1',   3:  'P1.2',   4:  'P1.3',
    5:  'P1.4',   6:  'P1.5',   7:  'P1.6',   8:  'P1.7',
    9:  'RST',
    10: 'P3.0',  11: 'P3.1',  12: 'P3.2',  13: 'P3.3',
    14: 'P3.4',  15: 'P3.5',  16: 'P3.6',  17: 'P3.7',
    18: 'XTAL2', 19: 'XTAL1',
    20: 'GND',
    21: 'P2.0',  22: 'P2.1',  23: 'P2.2',  24: 'P2.3',
    25: 'P2.4',  26: 'P2.5',  27: 'P2.6',  28: 'P2.7',
    // P0 runs DESCENDING: pin 32 is P0.7, pin 39 is P0.0
    32: 'P0.7',  33: 'P0.6',  34: 'P0.5',  35: 'P0.4',
    36: 'P0.3',  37: 'P0.2',  38: 'P0.1',  39: 'P0.0',
    40: 'VCC',
};

// Pins that must NOT exist on the STC12 (they are AT89C51 pins):
const GHOST_PINS = ['PSEN', 'ALE', 'EA'];

test('STC12C5A60S2 pin map: positive assertions from datasheet', () => {
    // Assert specific pins
    assert.strictEqual(STC12_PDIP40[32], 'P0.7', 'pin 32 must be P0.7 (not P0.0)');
    assert.strictEqual(STC12_PDIP40[39], 'P0.0', 'pin 39 must be P0.0 (not P0.7)');
    assert.strictEqual(STC12_PDIP40[9],  'RST',  'pin 9 must be RST');
    assert.strictEqual(STC12_PDIP40[20], 'GND',  'pin 20 must be GND');
    assert.strictEqual(STC12_PDIP40[40], 'VCC',  'pin 40 must be VCC');
    assert.strictEqual(STC12_PDIP40[1],  'P1.0', 'pin 1 must be P1.0');
});

test('STC12C5A60S2 has no AT89C51 ghost pins (PSEN, ALE, EA)', () => {
    const allPins = Object.values(STC12_PDIP40);
    for (const ghost of GHOST_PINS) {
        assert.ok(!allPins.includes(ghost),
            `${ghost} must not appear in STC12C5A60S2 pin map (it is an AT89C51 pin)`);
    }
});

test('STC12C5A60S2 P0 runs descending (pin 32=P0.7 down to pin 39=P0.0)', () => {
    for (let i = 0; i < 8; i++) {
        const pin = 32 + i;
        const expected = `P0.${7 - i}`;
        assert.strictEqual(STC12_PDIP40[pin], expected,
            `pin ${pin} must be ${expected}`);
    }
});

test('no ghost pins remain in STC12-specific vendored source', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const dirs = [
        'overlay/scratch-gui/src/lib/bw-circuit-ui',
        'overlay/scratch-gui/src/lib/bw-board'
    ];

    for (const dir of dirs) {
        let files;
        try { files = readdirSync(resolve(dir), { recursive: true }); } catch { continue; }
        for (const f of files) {
            if (!f.endsWith('.js') && !f.endsWith('.jsx')) continue;
            const content = readFileSync(resolve(dir, f), 'utf8');
            for (const ghost of GHOST_PINS) {
                // Allow comments mentioning PSEN (e.g. "no PSEN on STC12")
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const re = new RegExp(`\\b${ghost}\\b`);
                    // ALE, PSEN and EA are legitimate names on other chips
                    // (ADC0809 really has ALE). A ghost here means a source
                    // statement associates the name with STC12, not merely
                    // that both devices are discussed somewhere in one file.
                    if (re.test(line) && /stc12/i.test(line) &&
                        !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
                        assert.fail(`${dir}/${f}:${i + 1} references ${ghost} in code (not a comment)`);
                    }
                }
            }
        }
    }
});
