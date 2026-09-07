// N2b acceptance — the C route (16-bit int) and the ASM route (32-bit DX:AX)
// must leave the SAME 8255 state for the same NUMERIC program wherever the
// value fits 16 bits, and where it does not the disagreement is NAMED here,
// not papered over.
//
// Why two widths exist: SmallerC's tiny (.COM) model has no 32-bit type, so
// generateC types an 8086 number as `int` and refuses a literal outside
// -32768..32767 by name (upstream test/i8086-int16-model). pseudocode-8086.js
// chose register pairs so a learner's `set counter to 100000` lowers. Both are
// stated contracts; this file pins where they meet:
//   1. arithmetic, comparison and a REPEAT counter drive identical 8255 state
//      through both routes when every value fits 16 bits;
//   2. a literal past 16 bits: C REFUSES by name, ASM ADMITS — a width
//      disagreement, asserted as such so widening either side is noticed;
//   3. run-time overflow past 16 bits: C wraps (the header says so), ASM does
//      not — the two routes light DIFFERENT pins for the same program, and
//      this test asserts that difference by value. If it ever stops holding,
//      one route changed width and the plan entry is stale.
// The harness (SmallerC under Node, both routes, the DOS bench) is the one
// pin-i8086-differential.test.mjs uses, copied so this file stands alone.
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


const NUMERIC_AGREE = [
    'DEVICE i8086',
    'PIN led = P1.0 OUTPUT',
    'PIN hi = P1.1 OUTPUT',
    'PIN lo = P2.0 OUTPUT',
    'WHEN flag clicked:',
    '  set counter to 30000',
    '  change counter by 2000',
    '  REPEAT 3:',
    '    change counter by 100',
    '  IF counter > 32000 THEN:',
    '    turn on hi',
    '  IF counter < 0 THEN:',
    '    turn on lo',
    '  set counter to counter / 7',
    '  IF counter = 4614 THEN:',
    '    turn on led'
].join('\n');

test('C (int-16) and ASM (32-bit) leave identical 8255 state for a numeric program that fits 16 bits',
    {timeout: 180000}, async () => {
        // 30000 + 2000 + 300 = 32300 (fits); > 32000 lights hi; 32300 / 7 = 4614 lights led; never negative.
        const {asmBuilt, cBuilt} = await bothRoutes(NUMERIC_AGREE);
        const asm = await ppiAfter(asmBuilt.bytes, asmBuilt.format, asmBuilt.chips);
        const c = await ppiAfter(cBuilt.bytes, cBuilt.format, cBuilt.chips);
        assert.deepEqual(c, asm, `C and ASM disagree inside 16 bits:\n  C:   ${JSON.stringify(c)}\n  ASM: ${JSON.stringify(asm)}`);
        assert.equal(c.a.value & 0x03, 0x03, 'P1.0 (division result) and P1.1 (comparison) should both be HIGH');
        assert.equal(c.b.value & 0x01, 0x00, 'P2.0 (counter < 0) must stay LOW: nothing overflowed');
    });

test('a literal past 16 bits: the C route REFUSES by name, the ASM route ADMITS — a named width disagreement',
    {timeout: 120000}, async () => {
        const src = NUMERIC_AGREE.replace('set counter to 30000', 'set counter to 40000');
        const SB3 = (await sb3()).default;
        const c = new SB3();
        c.parse(src);
        const cSource = c.generateC();
        const code = typeof cSource === 'string' ? cSource : cSource.code;
        assert.match(code, /No C emitted for DEVICE I8086/, 'C: the emitter must refuse 40000');
        assert.match(code, /40000/, 'C: the refusal names the literal');
        const {compileC8086, AsmRouteError} = await route();
        await assert.rejects(() => compileC8086(code, {compileC: nodeCompileC}),
            (e) => e instanceof AsmRouteError && /40000/.test(e.message) && /-32768 to 32767/.test(e.message));
        // ASM lowers it: a 32-bit literal is inside its contract.
        const {buildPseudocode8086} = await lower();
        const asmBuilt = await buildPseudocode8086({project: c.project, source: src});
        assert.ok(asmBuilt.bytes && asmBuilt.bytes.length, 'ASM: 40000 must lower (32-bit pairs)');
        const asm = await ppiAfter(asmBuilt.bytes, asmBuilt.format, asmBuilt.chips);
        // 40000 + 2300 = 42300 > 32000 -> hi on; 42300 / 7 = 6042, not 4614 -> led off.
        assert.equal(asm.a.value & 0x02, 0x02, 'ASM: P1.1 lit — 42300 > 32000 in 32 bits');
        assert.equal(asm.a.value & 0x01, 0x00, 'ASM: P1.0 off — 42300 / 7 is not 4614');
    });

test('run-time overflow past 16 bits: C wraps, ASM does not — the routes light DIFFERENT pins, by value',
    {timeout: 180000}, async () => {
        // Every literal fits, the SUM does not: 30000 + 5000 = 35000.
        //   int-16: 35000 wraps to -30536  -> counter < 0 lights lo, > 32000 does not light hi
        //   32-bit: 35000                  -> hi lights, lo does not
        const src = [
            'DEVICE i8086',
            'PIN hi = P1.1 OUTPUT',
            'PIN lo = P2.0 OUTPUT',
            'WHEN flag clicked:',
            '  set counter to 30000',
            '  change counter by 5000',
            '  IF counter > 32000 THEN:',
            '    turn on hi',
            '  IF counter < 0 THEN:',
            '    turn on lo'
        ].join('\n');
        const {cSource, asmBuilt, cBuilt} = await bothRoutes(src);
        assert.match(cSource, /wraps at 16 bits/, 'the emitted C header must state the wrap');
        const asm = await ppiAfter(asmBuilt.bytes, asmBuilt.format, asmBuilt.chips);
        const c = await ppiAfter(cBuilt.bytes, cBuilt.format, cBuilt.chips);
        assert.equal(c.a.value & 0x02, 0x00, 'C: hi must be OFF (35000 wrapped negative)');
        assert.equal(c.b.value & 0x01, 0x01, 'C: lo must be ON (the wrapped value is < 0)');
        assert.equal(asm.a.value & 0x02, 0x02, 'ASM: hi must be ON (35000 in 32 bits)');
        assert.equal(asm.b.value & 0x01, 0x00, 'ASM: lo must be OFF');
        assert.notDeepEqual(c, asm, 'the width disagreement is the finding this test keeps visible');
    });
