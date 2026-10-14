// The i8086 `shiftOut` cell, proven on the bench: the C route's 74HC595 driver
// bit-bangs the RIGHT waveform onto the 8255, and a 595 wired to those pins
// would clock in the byte the program asked for.
//
// This is the SECOND cell of the i8086 column (after `pin`), and P2's proof
// that the protocol/bus split reaches the 8086. Unlike the `pin` cell there is
// no C-vs-ASM differential to run: the ASM route (pseudocode-8086.js) has no
// 74HC595 — it lowers only KEYPAD4X4 as a PART — so the differential here is
// against the DEVICE PROTOCOL instead. generateC emits ONE shift_out protocol
// (byte-identical across avr/6502/arm/8051, pinned upstream by
// test/shiftout-golden.test.mjs); its i8086 bus drives each pin as a shadow
// read-modify-write then OUT through bw_outb. We compile that C, run it on the
// vendored DOS bench with the 8255 at 0x60-0x63, capture every write to Port B
// (where data/clock/latch sit), and:
//   (1) assert the exact bit-bang waveform, and
//   (2) reconstruct the transmitted byte by sampling DATA at each rising edge
//       of CLOCK, MSB first — the thing a real 595's shift register does — and
//       assert it is the byte the program set. A one-bit disagreement in the
//       shadow maths, the bit order, or the latch discipline changes the
//       reconstructed byte and reddens this.
//
// The SmallerC WASM glue is CommonJS behind an ES wrapper; the seam that loads
// it under Node is copied from test/c-to-8086.test.mjs verbatim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const distUrl = new URL('smallerc-wasm/dist/', L);
const require = createRequire(import.meta.url);
const EXPORTS = {smlrpp: 'createSmlrpp', smlrc: 'createSmlrc'};

async function importFactory (name) {
    const url = new URL(`${name}.js`, distUrl);
    const source = await readFile(url, 'utf8');
    const filename = fileURLToPath(url);
    const module = {exports: {}};
    Function('module', 'exports', 'require', '__filename', '__dirname',
        source.replace(new RegExp(`export default ${EXPORTS[name]};\\s*$`), ''))(
        module, module.exports, require, filename, dirname(filename));
    return module.exports;
}
let cached = null;
async function toolchain () {
    if (!cached) {
        const {HEADERS} = await import(new URL('headers.js', distUrl).href);
        cached = {
            factories: await Promise.all(['smlrpp', 'smlrc'].map(importFactory)),
            headers: HEADERS,
            resolve: (name) => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
        };
    }
    return cached;
}
async function nodeCompileC (code, options) {
    const {compileWithToolchain} = await import(new URL('smallerc-wasm/compiler.js', L).href);
    return compileWithToolchain(code, options, await toolchain());
}
const sb3 = () => import(new URL('sb3-creator.js', L).href);
const route = () => import(new URL('bw-asm/assemble-route.js', L).href);
const bench = () => import(new URL('bw-debug/i8086-dos-bench.js', L).href);

// data=P2.0 (bit0), clock=P2.1 (bit1), latch=P2.2 (bit2). All on port B (0x61).
const DATA = 0x1, CLOCK = 0x2, LATCH = 0x4;
const BYTE = 128;
const SRC = [
    'DEVICE i8086',
    'PIN led = P1.0 OUTPUT',
    'PART sr = 74HC595 data P2.0 clock P2.1 latch P2.2',
    'WHEN flag clicked:',
    `  set sr to ${BYTE}`
].join('\n');

/** Compile the i8086 C and run it, capturing every value written to Port B. */
async function portBWaveform () {
    const SB3 = (await sb3()).default;
    const c = new SB3();
    c.parse(SRC);
    assert.deepEqual(c.warnings, [], `generateC warned: ${JSON.stringify(c.warnings)}`);
    const cSource = c.generateC();
    const {compileC8086} = await route();
    const built = await compileC8086(cSource, {compileC: nodeCompileC});

    const {createI8086DosBench} = await bench();
    const b = await createI8086DosBench({bytes: built.bytes, format: built.format, variant: '80186'});
    // Port B is 8255 register 1 (0x61 - 0x60). Wrap the chip's bus write so we
    // see every OUT the driver makes, in order, with its value.
    const ppi = b.machine.chips.ppi1;
    const writes = [];
    const realWrite = ppi.write.bind(ppi);
    ppi.write = (reg, val) => { if ((reg & 3) === 1) writes.push(val & 0xff); return realWrite(reg, val); };

    let n = 0;
    while (n < 800_000 && !b.terminated) { b.step(); n++; }
    assert.ok(b.terminated, `the program did not reach its own exit in ${n} steps`);
    return {writes, cSource};
}

test('i8086 shift_out bit-bangs the exact 74HC595 waveform for the byte', {timeout: 120000}, async () => {
    const {writes} = await portBWaveform();
    // latch low; then per bit: clock low, set/clear data, clock high; latch high.
    // For 0x80 the MSB is 1 and the other seven bits 0, so:
    const expected = [
        0x00,                     // latch low  (bit2 cleared; shadow was 0)
        0x00, 0x01, 0x03,         // bit7=1: clock low, data high, clock high
        0x01, 0x00, 0x02,         // bit6=0: clock low, data low,  clock high
        0x00, 0x00, 0x02,         // bit5=0
        0x00, 0x00, 0x02,         // bit4=0
        0x00, 0x00, 0x02,         // bit3=0
        0x00, 0x00, 0x02,         // bit2=0
        0x00, 0x00, 0x02,         // bit1=0
        0x00, 0x00, 0x02,         // bit0=0
        0x06                      // latch high (bit2 set; clock still high)
    ];
    assert.deepEqual(writes, expected,
        'the Port B waveform is not the 74HC595 bit-bang for 0x80');
});

test('a 595 clocked by this waveform receives the byte the program set (MSB first)', async () => {
    const {writes} = await portBWaveform();
    // Walk the waveform as a 595 would: on each LOW->HIGH edge of CLOCK, sample
    // DATA and shift it into the register, MSB first.
    let prevClock = 0, received = 0, bits = 0;
    for (const v of writes) {
        const clock = v & CLOCK;
        if (clock && !prevClock) { received = (received << 1) | (v & DATA ? 1 : 0); bits++; }
        prevClock = clock;
    }
    assert.equal(bits, 8, `a byte needs 8 clock edges; saw ${bits}`);
    assert.equal(received, BYTE,
        `the 595 would latch 0x${received.toString(16)}, not the 0x${BYTE.toString(16)} the program set`);
    // And the latch pulse actually fired: the last write drives LATCH high.
    assert.equal(writes[writes.length - 1] & LATCH, LATCH,
        'the final write must drive LATCH high so the shifted byte reaches the outputs');
});
