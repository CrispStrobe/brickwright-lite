// N2e acceptance: execute the bounded numeric-list C lowering through the
// real SmallerC -> 80186 .COM route and compare DOS-visible values with an
// independent array model. The ASM production route deliberately remains
// list-free; expanding it merely to manufacture an oracle would prove less.
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
            resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
        };
    }
    return cached;
}

async function compileProgram (source, mutateC = code => code) {
    const {default: SB3Creator} = await import(new URL('sb3-creator.js', L).href);
    const creator = new SB3Creator();
    creator.parse(source);
    const generated = creator.generateC();
    const healthy = typeof generated === 'string' ? generated : generated.code;
    assert.doesNotMatch(healthy, /No C emitted/, 'numeric-list program was refused');
    const code = mutateC(healthy);
    const {compileWithToolchain} = await import(new URL('smallerc-wasm/compiler.js', L).href);
    const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
    return {healthy, code, built: await compileC8086(code, {
        compileC: (text, options) => compileWithToolchain(text, options, cached)
    })};
}

async function run (built, limit = 500_000) {
    const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);
    const bench = await createI8086DosBench({bytes: built.bytes, format: built.format,
        variant: '80186', chips: built.chips});
    let steps = 0;
    while (steps < limit && !bench.terminated) { bench.step(); steps++; }
    return {terminated: bench.terminated, rows: bench.screenText().filter(row => row !== ''), steps};
}

const PROGRAM = [
    'DEVICE i8086',
    'PIN led = P1.0 OUTPUT',
    'GLOBAL LIST readings = [3, 5]',
    'WHEN flag clicked:',
    '  add 7 to readings',
    '  insert 2 at 2 of readings',
    '  replace item 3 of readings with 11',
    '  delete 1 of readings',
    '  delete 99 of readings',
    '  insert 99 at 99 of readings',
    '  replace item 0 of readings with 99',
    '  print length of readings',
    '  print item 1 of readings',
    '  print item 2 of readings',
    '  print item 3 of readings',
    '  print item 99 of readings',
    '  delete all of readings',
    '  print length of readings',
    '  print item 1 of readings'
].join('\n');

const modelRows = () => {
    const values = [3, 5];
    values.push(7);
    values.splice(1, 0, 2);
    values[2] = 11;
    values.splice(0, 1);
    // Scratch-style invalid delete/insert/replace are checked no-ops.
    const item = index => index >= 1 && index <= values.length ? values[index - 1] : 0;
    const rows = [values.length, item(1), item(2), item(3), item(99)].map(String);
    values.length = 0;
    return [...rows, String(values.length), '0'];
};

test('bounded list operations match an independent model on a real 80186 .COM',
    {timeout: 180000}, async () => {
        await toolchain();
        const {healthy, built} = await compileProgram(PROGRAM);
        assert.match(healthy, /#define BW_LIST_CAPACITY 32u/);
        assert.equal(built.format, 'com');
        const result = await run(built);
        assert.equal(result.terminated, true, `program did not terminate in ${result.steps} steps`);
        assert.deepEqual(result.rows, modelRows());
    });

test('index mutation is caught by the live independent oracle',
    {timeout: 180000}, async () => {
        await toolchain();
        const mutant = await compileProgram(PROGRAM, code => {
            const anchor = 'return data[(unsigned)index - 1u];';
            assert.equal(code.split(anchor).length - 1, 1,
                'item-index mutation must bind exactly one helper statement');
            return code.replace(anchor, 'return data[(unsigned)index];');
        });
        const result = await run(mutant.built);
        assert.equal(result.terminated, true);
        assert.notDeepEqual(result.rows, modelRows(),
            'zero-based item mutation escaped the live list oracle');
    });

test('capacity overflow traps, while a silent dropped-write mutation prints forbidden length 32',
    {timeout: 180000}, async () => {
        await toolchain();
        const full = Array.from({length: 32}, (_, index) => index + 1).join(', ');
        const source = [
            'DEVICE i8086', 'PIN led = P1.0 OUTPUT', `GLOBAL LIST readings = [${full}]`,
            'WHEN flag clicked:', '  add 33 to readings', '  print length of readings'
        ].join('\n');
        const healthy = await compileProgram(source);
        const trapped = await run(healthy.built, 20_000);
        assert.equal(trapped.terminated, false, 'capacity overflow did not trap');
        assert.deepEqual(trapped.rows, [], 'capacity overflow reached output');

        const mutant = await compileProgram(source, code => {
            const guard = 'if (*len >= BW_LIST_CAPACITY) bw_list_overflow();';
            assert.equal(code.split(guard).length - 1, 2,
                'capacity mutation must see exactly the add and insert guards');
            return code.replace(guard, 'if (*len >= BW_LIST_CAPACITY) return;');
        });
        const escaped = await run(mutant.built, 20_000);
        assert.equal(escaped.terminated, true, 'dropped-write mutant did not terminate');
        assert.deepEqual(escaped.rows, ['32'],
            'dropped-write mutant did not reach the exact forbidden length row');
    });

test('the full 15-list state ceiling compiles with its exact .COM segment margin',
    {timeout: 180000}, async () => {
        await toolchain();
        const source = [
            'DEVICE i8086', 'PIN led = P1.0 OUTPUT',
            ...Array.from({length: 15}, (_, list) =>
                `GLOBAL LIST list${list} = [${Array.from({length: 32}, (_, item) => item - 16).join(', ')}]`),
            'WHEN flag clicked:', '  print item 32 of list14'
        ].join('\n');
        const {healthy, built} = await compileProgram(source);
        assert.equal((healthy.match(/^static int bw_list_.*_data\[32\]/gm) || []).length, 15);
        assert.equal(15 * (32 * 2 + 2), 990, 'declared list-state ceiling changed');
        assert.equal(built.bytes.length, 1618, 'ceiling .COM byte receipt changed');
        assert.equal(0x10000 - 0x100 - built.bytes.length, 63662,
            'ceiling .COM remaining-segment margin changed');
    });
