import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';

import {compileWithToolchain} from '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js';

const distUrl = new URL('../overlay/scratch-gui/src/lib/sdcc-wasm/dist/', import.meta.url);
const require = createRequire(import.meta.url);

const decodeBase64 = text => Uint8Array.from(Buffer.from(text, 'base64'));

async function toolchain () {
    const packed = JSON.parse(await readFile(new URL('runtime.json', distUrl), 'utf8'));
    return {
        factories: ['cc1', 'sdcc', 'sdas8051', 'sdld'].map(name =>
            require(fileURLToPath(new URL(`${name}.js`, distUrl)))),
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
