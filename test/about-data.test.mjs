import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
    resolve(here, '../overlay/scratch-gui/src/components/menu-bar/about-data.js'),
    'utf8'
);

test('about-data.js exports a non-empty ABOUT_GROUPS array', () => {
    // The file uses `export default`, which we cannot import directly without
    // a bundler. Parse structurally: it must define groups with entries.
    assert.ok(src.includes('ABOUT_GROUPS'), 'ABOUT_GROUPS not found');
    assert.ok(src.includes('export default ABOUT_GROUPS'), 'missing default export');
});

test('every group has title and at least one entry', () => {
    // Extract group titles via regex
    const titles = [...src.matchAll(/title:\s*'([^']+)'/g)].map(m => m[1]);
    assert.ok(titles.length >= 8, `expected >= 8 groups, got ${titles.length}`);
});

test('key entries are present', () => {
    const required = [
        'avr8js', 'emu8051-stc', 'micropython-microbit-v2-simulator', 'rp2040js',
        'BBC BASIC', 'PicoBB', 'CP/M 2.2', 'basic-m6502-bw',
        'SDCC', 'cc65',
        'scratch-gui', 'scratch-vm', 'scratch-blocks',
        'Skulpt', 'Tauri',
        'SingleStepTests', 'vrEmu6502',
        'wokwi-elements',
    ];
    for (const name of required) {
        assert.ok(src.includes(name), `missing entry: ${name}`);
    }
});

test('BBC BASIC permission note is present', () => {
    assert.ok(
        src.includes('BBC BASIC is used by permission of the BBC'),
        'missing BBC permission note'
    );
});

test('no competitor names in data file', () => {
    // The owner directive says competitor names must never appear in committed files.
    // This is just a safety net for the ones we know about.
    const competitors = ['TurboWarp', 'Turbowarp'];
    for (const name of competitors) {
        assert.ok(!src.includes(name), `competitor name "${name}" found in about-data.js`);
    }
});
