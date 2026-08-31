import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';

import {compileWithToolchain, listingFromRst} from '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js';

const distUrl = new URL('../overlay/scratch-gui/src/lib/sdcc-wasm/dist/', import.meta.url);
const require = createRequire(import.meta.url);
const decodeBase64 = text => Uint8Array.from(Buffer.from(text, 'base64'));

async function importFactory (name) {
    // Exercise the glue's Node branch while retaining the shipped ES-module
    // export for the production browser. Only that final declaration is
    // removed; the Emscripten program executed here is byte-for-byte the same.
    const source = await readFile(new URL(`${name}.js`, distUrl), 'utf8');
    assert.match(source, /export default createSDCC;/, `${name}.js is not browser-importable`);
    const module = {exports: {}};
    const filename = fileURLToPath(new URL(`${name}.js`, distUrl));
    Function('module', 'exports', 'require', '__filename', '__dirname',
        source.replace(/export default createSDCC;\s*$/, ''))(
        module, module.exports, require, filename, dirname(filename));
    return module.exports;
}

async function toolchain () {
    const packed = JSON.parse(await readFile(new URL('runtime.json', distUrl), 'utf8'));
    return {
        factories: await Promise.all(['cc1', 'sdcc', 'sdas8051', 'sdld'].map(importFactory)),
        runtime: new Map(Object.entries(packed.files).map(([name, data]) => [name, decodeBase64(data)])),
        resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
    };
}

test('four isolated WASM stages produce linked Intel HEX', {timeout: 30000}, async () => {
    const result = await compileWithToolchain([
        '#include <stc12.h>',
        'void main(void) {',
        '  P1 = 0x5a;',
        '  for (;;) {}',
        '}'
    ].join('\n'), {target: 'stc12c5a60s2'}, await toolchain());

    assert.equal(result.success, true, result.error);
    assert.match(result.hex, /^:0300000002[0-9A-F]{6}$/m);
    assert.match(result.hex, /^:00000001FF$/m);
    assert.equal(Buffer.from(result.base64, 'base64').toString(), result.hex);
    assert.ok(result.bytes > 100, `unexpectedly small output: ${result.bytes}`);
});

test('listing mode returns SDCC relocated addresses and source mappings', {timeout: 30000}, async () => {
    const result = await compileWithToolchain([
        '#include <stc12.h>',
        'void main(void) {',
        '  P1 = 0x5a;',
        '  for (;;) {}',
        '}'
    ].join('\n'), {target: 'stc12c5a60s2', disassemble: true}, await toolchain());

    assert.equal(result.success, true, result.error);
    assert.equal(result.listing.format, 'sdcc');
    assert.equal(result.listing.v, 1);
    assert.match(result.listing.asm, /main\.c:3:/, 'the C assignment is interleaved into the listing');
    assert.match(result.listing.asm, /^\s*[0-9A-Fa-f]{4,6}\s+[0-9A-Fa-f]{2}/m,
        'the listing contains relocated addresses and emitted bytes');
    assert.ok(result.listing.lineMap.some(entry => entry.file === 'main.c' && entry.line === 3),
        `line 3 is absent from ${JSON.stringify(result.listing.lineMap)}`);
    assert.equal(result.disassembly, result.listing.asm, 'the compatibility field is the same artifact');
});

test('ordinary compilation does not carry the optional listing payload', {timeout: 30000}, async () => {
    const result = await compileWithToolchain('void main(void) { for (;;) {} }',
        {target: 'stc12c5a60s2'}, await toolchain());
    assert.equal(result.success, true, result.error);
    assert.equal(Object.hasOwn(result, 'listing'), false);
    assert.equal(Object.hasOwn(result, 'disassembly'), false);
});

test('listing parser rejects artifacts that cannot map source to machine addresses', () => {
    assert.throws(() => listingFromRst(''), /empty relocated listing/);
    assert.throws(() => listingFromRst('0000 02 00 08 ljmp 0008'), /no source\/address mappings/);
    const listing = listingFromRst([
        '                                    1 ; C:\\work\\main.c:7: value++;',
        '      00000A 05 20            [12]  2 inc _value'
    ].join('\n'));
    assert.deepEqual(listing.lineMap, [{addr: 10, file: 'main.c', line: 7}]);
});

test('debug build transfers ADB data through assembler and linker', {timeout: 30000}, async () => {
    const source = `/* @bw-begin
 * @bw yield bw_task0 0 block%2Fhat hat
 * @bw yield bw_task0 1 block%2Floop loop
 * @bw var count "Count"
 * @bw-end */
volatile unsigned int bw_ms;
volatile unsigned int bw_task0_state;
volatile unsigned int bw_task0_until;
volatile unsigned int count;
static void bw_task0(void)
{
    switch (bw_task0_state) {
    case 0:
        count = 1;
        bw_task0_state = 1;
        return;
    case 1:
        count++;
        return;
    }
}
void main(void) { for (;;) { bw_task0(); } }`;
    const result = await compileWithToolchain(source, {
        target: 'stc12c5a60s2', symbols: true
    }, await toolchain());

    assert.equal(result.success, true, result.error);
    assert.equal(result.symbols_error, null);
    assert.ok(result.symbols, 'expected a parsed local symbol table');
    assert.ok(result.symbols.variables?.some(variable => variable.c === 'count' && !variable.unlocated),
        `count is absent from ${JSON.stringify(result.symbols)}`);
});
