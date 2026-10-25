/**
 * Blocks programs RUN on the Mega -- the engine half of the ATmega2560 fix.
 *
 * Until bw-board 957a118 the atmega2560 engine ended the chip's data space at
 * 0x20FF, below RAMEND 0x21FF where avr-libc puts the stack. Every push was
 * dropped and every pop read 0. Found with a compiled Arduino sketch, but it
 * was never sketch-specific: `mega02-adc-print`, a stock Mega example, printed
 * NOTHING in the debugger on that engine (measured: zero serial lines in 3 s)
 * and prints a reading a second on the fixed one.
 *
 * The images are the examples' own programs, emitted by the runner's path
 * (generateDebugC) and compiled with symbols by the hosted service, kept in
 * test/fixtures/mega-blocks-images.json. Two guarantees:
 *   1. DRIFT: the C is re-generated from each example's program.bw and must
 *      match the fixture character for character after the shipped-image
 *      gate's canonicalCode (random block ids blanked, nothing else), so an
 *      edited example cannot keep passing on a stale image.
 *   2. RUN: each image boots on the pinned engine WITH its symbol table (the
 *      debugger's own path), and does what the example says.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {packageSourceRoot} from './helpers/package-source.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = JSON.parse(readFileSync(
    path.join(REPO, 'test/fixtures/mega-blocks-images.json'), 'utf8')).images;
const {generateDebugC} = await import(
    pathToFileURL(path.join(REPO, 'scripts/build-lesson-images.mjs')).href);
// The shipped-image gate's own canonicalisation: block ids in the `@bw yield`
// comments are random per generation and are the ONLY thing blanked.
const {canonicalCode} = await import(pathToFileURL(
    path.join(REPO, 'overlay/scratch-gui/src/lib/bw-debug/shipped-images.js')).href);

const BW_BOARD = packageSourceRoot('bw-board');
const bw = await import(pathToFileURL(path.join(BW_BOARD, 'index.js')).href);
(await import(pathToFileURL(path.join(BW_BOARD, 'register-all.js')).href)).registerAllDevices();

async function boot (id) {
    const board = new bw.BoardImpl();
    board.setNetlist([{id: 'u1', kind: 'mcu', terminals: ['gnd']}, {id: 'g1', kind: 'gnd', terminals: ['gnd']}],
        [{id: 'n1', terminals: [{part: 'u1', terminal: 'gnd'}, {part: 'g1', terminal: 'gnd'}]}]);
    board.setPower(true);
    const fx = fixtures[id];
    const {target, adapter} = await bw.createDebugTarget('atmega2560',
        {board, hex: fx.hex, symbols: fx.symbols, clockHz: fx.f_cpu || 16000000});
    let serial = '';
    adapter.onSerial(byte => { serial += String.fromCharCode(byte); });
    bw.createDebugSession(target, {onChange: () => {}}).start();
    return {adapter, serial: () => serial};
}

for (const id of Object.keys(fixtures)) {
    test(`${id}: the fixture is still what the example's program emits`, async () => {
        const program = readFileSync(
            path.join(REPO, 'overlay/scratch-gui/examples', id, 'program.bw'), 'utf8');
        assert.equal(canonicalCode(await generateDebugC(program)), canonicalCode(fixtures[id].c),
            `${id}/program.bw no longer emits the fixture's C: rebuild the image ` +
            '(see the fixture\'s "about")');
    });
}

test('mega01-blink toggles D13 (PB7) at 1 Hz', async () => {
    const {adapter} = await boot('mega01-blink');
    let last = null;
    let edges = 0;
    for (let i = 0; i < 300; i++) {                                    // 3 s
        adapter.advanceNs(10_000_000);
        const bit = (adapter.cpu.data[0x25] >> 7) & 1;                 // PORTB bit 7
        if (last !== null && bit !== last) edges++;
        last = bit;
    }
    assert.ok(edges >= 5 && edges <= 6, `${edges} D13 edges in 3 s (0.5 s on, 0.5 s off)`);
});

test('mega02-adc-print prints a reading every second -- it printed NOTHING before the fix', async () => {
    const {adapter, serial} = await boot('mega02-adc-print');
    for (let i = 0; i < 300; i++) adapter.advanceNs(10_000_000);      // 3 s
    const lines = serial().split(/\r?\n/).filter(Boolean);
    assert.ok(lines.length >= 2 && lines.length <= 4,
        `${lines.length} lines in 3 s: ${JSON.stringify(serial().slice(0, 60))}`);
    assert.ok(lines.every(l => /^\d+$/.test(l)), `each line is an ADC reading: ${JSON.stringify(lines)}`);
});
