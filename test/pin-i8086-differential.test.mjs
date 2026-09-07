// The i8086 `pin` cell, proven the only way it can be: the C route and the ASM
// route must leave the SAME 8255 state for the SAME pseudocode.
//
// This is the first cell of the i8086 column. generateC gained a
// `this._core === 'i8086'` branch that drives an 8255 PPI through the bw_outb/
// bw_inb port-I/O primitives (SmallerC has no inline asm; the 8255 is
// I/O-mapped, not memory-mapped like the VIA the 6502 C uses). The claim is
// behavioural, not textual: compile the C, lower the same pseudocode to ASM,
// run BOTH on the vendored DOS bench (8255 at 0x60-0x63), and assert the Port
// A/B/C latch values AND directions are identical. If the C's shadow
// read-modify-write, control word, or bit maths disagreed with
// pseudocode-8086.js by one bit, a port would differ and this reddens.
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
const lower = () => import(new URL('bw-asm/pseudocode-8086.js', L).href);
const bench = () => import(new URL('bw-debug/i8086-dos-bench.js', L).href);

/** Run a .COM on the DOS bench and snapshot the 8255 Port A/B/C latch + direction. */
async function ppiAfter (bytes, format, chips, stim = () => {}) {
    const {createI8086DosBench} = await bench();
    const b = await createI8086DosBench({bytes, format, variant: '80186', chips});
    stim(b);
    let n = 0;
    while (n < 800_000 && !b.terminated) { b.step(); n++; }
    const ports = {};
    for (const p of b.target.outputs()) ports[p.port] = {value: p.value & 0xff, dir: p.dir & 0xff};
    return ports;
}

/** Parse pseudocode, then build the ASM-route bytes and the C-route bytes. */
async function bothRoutes (src) {
    const SB3 = (await sb3()).default;
    const c = new SB3();
    c.parse(src);
    const {buildPseudocode8086} = await lower();
    const asmBuilt = await buildPseudocode8086({project: c.project, source: src});
    const cSource = c.generateC();
    const {compileC8086} = await route();
    const cBuilt = await compileC8086(typeof cSource === 'string' ? cSource : cSource.code,
        {compileC: nodeCompileC});
    return {c, cSource: typeof cSource === 'string' ? cSource : cSource.code, asmBuilt, cBuilt};
}

test('C and ASM leave identical 8255 state for the same i8086 pins', {timeout: 120000}, async () => {
    // Outputs across all three ports, one turned back off, so a stuck OR/AND
    // shows: P1.0 stays on, P2.3 goes on then off (port B ends 0), P3.5 on.
    const src = [
        'DEVICE i8086',
        'PIN led = P1.0 OUTPUT',
        'PIN buzz = P2.3 OUTPUT',
        'PIN sig = P3.5 OUTPUT',
        'WHEN flag clicked:',
        '  turn on led',
        '  turn on buzz',
        '  turn on sig',
        '  turn off buzz'
    ].join('\n');
    const {asmBuilt, cBuilt} = await bothRoutes(src);
    const asm = await ppiAfter(asmBuilt.bytes, asmBuilt.format, asmBuilt.chips);
    const c = await ppiAfter(cBuilt.bytes, cBuilt.format, cBuilt.chips);
    assert.deepEqual(c, asm,
        'the C route and the ASM route left different 8255 state for the same pins:\n'
        + `  C:   ${JSON.stringify(c)}\n  ASM: ${JSON.stringify(asm)}`);
    // and the values are what the program asked for, not two matching wrongs
    assert.equal(c.a.value & 0x01, 0x01, 'P1.0 (port A bit 0) should be HIGH');
    assert.equal(c.b.value & 0x08, 0x00, 'P2.3 (port B bit 3) was turned back off');
    assert.equal(c.c.value & 0x20, 0x20, 'P3.5 (port C bit 5) should be HIGH');
});

test('one and two active-low toggles leave the same persistent 8255 latch on C and ASM routes',
    {timeout: 120000}, async () => {
        const oneSource = [
            'DEVICE i8086',
            'PIN led = P1.0 OUTPUT ACTIVE LOW',
            'WHEN flag clicked:',
            '  toggle led'
        ].join('\n');
        const twoSource = `${oneSource}\n  toggle led`;

        // Compile serially: SmallerC's cached WASM factories are stateful, just
        // as they are in the browser. Execution can then run independently.
        const one = await bothRoutes(oneSource);
        const two = await bothRoutes(twoSource);
        assert.match(one.cSource, /bw_port_a \^= 0x1u; bw_outb\(0x60u, bw_port_a\);/,
            'the C route did not lower toggle through its persistent 8255 shadow');

        const [oneAsm, oneC, twoAsm, twoC] = await Promise.all([
            ppiAfter(one.asmBuilt.bytes, one.asmBuilt.format, one.asmBuilt.chips),
            ppiAfter(one.cBuilt.bytes, one.cBuilt.format, one.cBuilt.chips),
            ppiAfter(two.asmBuilt.bytes, two.asmBuilt.format, two.asmBuilt.chips),
            ppiAfter(two.cBuilt.bytes, two.cBuilt.format, two.cBuilt.chips)
        ]);
        assert.deepEqual(oneC, oneAsm, 'C and ASM disagree after one active-low toggle');
        assert.deepEqual(twoC, twoAsm, 'C and ASM disagree after two active-low toggles');
        // Programming the 8255 mode word clears its output latches. ACTIVE LOW
        // changes the meaning of the level, not what XOR does to that physical
        // latch: one toggle sets the bit and the second must clear it again.
        assert.equal(oneC.a.value & 0x01, 0x01,
            'one toggle from the reset-low 8255 latch should set the physical bit');
        assert.equal(twoC.a.value & 0x01, 0x00,
            'two toggles should clear the same persistent physical latch bit');
    });

test('an input pin makes both routes program the same 8255 direction', {timeout: 120000}, async () => {
    // P3.0 INPUT -> port C lower nibble input: control word 0x81, so port C dir
    // is not all-output. Both routes must agree on the direction byte too.
    const src = [
        'DEVICE i8086',
        'PIN led = P1.0 OUTPUT',
        'PIN btn = P3.0 INPUT',
        'WHEN flag clicked:',
        '  turn on led'
    ].join('\n');
    const {asmBuilt, cBuilt} = await bothRoutes(src);
    const asm = await ppiAfter(asmBuilt.bytes, asmBuilt.format, asmBuilt.chips);
    const c = await ppiAfter(cBuilt.bytes, cBuilt.format, cBuilt.chips);
    assert.deepEqual(c, asm, 'C and ASM disagree on 8255 state with a mixed-direction port');
    assert.notEqual(c.c.dir & 0x0f, 0x0f, 'port C lower nibble should be INPUT (control word 0x81)');
});

test('the emitted i8086 C names the 8255 data port and the control word, once each', {timeout: 60000}, async () => {
    const SB3 = (await sb3()).default;
    const c = new SB3();
    c.parse([
        'DEVICE i8086',
        'PIN led = P1.0 OUTPUT',
        'WHEN flag clicked:',
        '  turn on led'
    ].join('\n'));
    const out = c.generateC();
    const C = typeof out === 'string' ? out : out.code;
    // The set-pin names the port A data address; the control word is written
    // ONCE in bw_setup (a second would clear every latch — the ASM says so too).
    assert.ok(/bw_outb\(0x60u, bw_port_a\)/.test(C), 'the set-pin does not OUT to the port A address 0x60');
    const ctrlWrites = (C.match(/bw_outb\(0x63u,/g) || []).length;
    assert.equal(ctrlWrites, 1, `the 8255 control word (port 0x63) is written ${ctrlWrites} times; it must be exactly once`);
    assert.ok(/bw_port_a \|= 0x1u/.test(C), 'the set-pin does not read-modify-write the port A shadow byte');
});

test('an unsupported hardware verb on i8086 refuses the whole program by name', {timeout: 60000}, async () => {
    const SB3 = (await sb3()).default;
    const c = new SB3();
    c.parse([
        'DEVICE i8086',
        'PIN pot = P1.3 ANALOG',
        'WHEN flag clicked:',
        '  set level to (read pot)'
    ].join('\n'));
    const out = c.generateC();
    const C = typeof out === 'string' ? out : out.code;
    assert.match(C, /No C emitted for DEVICE I8086/,
        'a program using unsupported ADC on i8086 must refuse, not emit 8051 code for it');
    assert.match(C, /This program also uses: adc/, 'the refusal should name ADC as the missing hardware verb');
    assert.match(C, /PIN I\/O only/i, 'the refusal should say the i8086 back end is pin-only for now');
});
