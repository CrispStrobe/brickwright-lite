// The C route's port-I/O primitives, injected conditionally.
//
// compileC8086 supplies bw_outb/bw_inb as asm helpers because SmallerC has no
// inline asm and no port intrinsic, and the 8255 the 8086 boards drive their
// pins through is I/O-mapped. The injection is CONDITIONAL: it happens only when
// the compiled body actually CALLS the helper, so every program that does no
// port I/O is byte-for-byte what it was. This proves both halves — the presence
// and the absence — and that a reference WITHOUT the definition fails at
// assembly BY NAME, never silently at run time.
//
// The SmallerC WASM seam is copied from test/c-to-8086.test.mjs.
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
const route = () => import(new URL('bw-asm/assemble-route.js', L).href);
const asmMod = () => import(new URL('bw-board/i8086-asm.js', L).href);
const bench = () => import(new URL('bw-debug/i8086-dos-bench.js', L).href);

const OUT_PROGRAM = 'extern void bw_outb(unsigned port, unsigned val);\n'
    + 'int main(void){ bw_outb(0x63u, 0x80u); bw_outb(0x60u, 0x01u); return 0; }';

test('bw_outb is injected, and the program drives the 8255, when the body calls it', {timeout: 60000}, async () => {
    const {compileC8086} = await route();
    const built = await compileC8086(OUT_PROGRAM, {compileC: nodeCompileC});
    assert.match(built.asm, /^_bw_outb:/m, 'the helper body was not injected though the C calls it');
    assert.doesNotMatch(built.asm, /extern\s+_bw_outb/, 'the extern was left in — it should be stripped once the symbol is local');
    // it actually reaches the port: Port A latches bit 0
    const {createI8086DosBench} = await bench();
    const b = await createI8086DosBench({bytes: built.bytes, format: built.format, variant: '80186'});
    let n = 0;
    while (n < 2_000_000 && !b.terminated) { b.step(); n++; }
    const pa = b.target.outputs().find((o) => o.port === 'a');
    assert.equal(pa.value & 0x01, 0x01, 'the C did not drive 8255 Port A bit 0 through bw_outb');
});

test('no helper is injected when the body does not call one', {timeout: 60000}, async () => {
    const {compileC8086} = await route();
    const built = await compileC8086('int main(void){ int x = 2 + 2; return x; }', {compileC: nodeCompileC});
    assert.doesNotMatch(built.asm, /_bw_outb:|_bw_inb:/,
        'a port-I/O helper was injected into a program that does no port I/O — the injection is not conditional');
});

test('a reference with the helper NOT injected fails at ASSEMBLY, by name', {timeout: 60000}, async () => {
    // The mutation: the compiler body calls _bw_outb and declares it extern, but
    // the injection is skipped. Assembling that (a loadable image, no linker)
    // must refuse the unresolved symbol by name — never assemble to something
    // that jumps to a wrong address at run time.
    const compiled = await nodeCompileC(OUT_PROGRAM, {target: 'i8086'});
    const body = compiled.asm.replace(/^\s*bits\s+16\s*$/im, '');   // KEEP the extern, define nothing
    const {assemble} = await asmMod();
    assert.throws(
        () => assemble('bits 16\norg 100h\nsection .text\n    call _main\n    mov ah, 4Ch\n    int 21h\n' + body,
            {variant: '80186', setcc: true}),
        /_bw_outb/,
        'an unresolved bw_outb reference should throw at assembly naming the symbol, not assemble silently');
});
