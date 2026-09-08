// N2f acceptance: direct literal output and deterministic bounded random must
// survive the complete generated-C -> SmallerC -> 80186 .COM -> DOS route.
// The expected values below come from an independent JS model of the reviewed
// 16-bit contract. Equality with another emitter route would merely let two
// implementations share the same mistake.
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

async function nodeCompileC (code, options) {
    const {compileWithToolchain} = await import(new URL('smallerc-wasm/compiler.js', L).href);
    return compileWithToolchain(code, options, await toolchain());
}

const toI16 = value => {
    const word = value & 0xffff;
    return word >= 0x8000 ? word - 0x10000 : word;
};

function randomOracle (calls, seed = 0x4d3d) {
    let state = seed;
    const rows = [];
    const draws = [];
    for (const [from, to] of calls) {
        const min = Math.min(from, to);
        const max = Math.max(from, to);
        const span = max - min + 1;
        let consumed = 0;
        if (span === 0x10000) {
            state = (Math.imul(state, 25173) + 13849) & 0xffff;
            consumed++;
            rows.push(toI16(min + state));
            draws.push(consumed);
            continue;
        }
        const threshold = (0x10000 - span) % span;
        while (true) {
            state = (Math.imul(state, 25173) + 13849) & 0xffff;
            consumed++;
            const product = state * span;
            if ((product & 0xffff) < threshold) continue;
            rows.push(min + Math.floor(product / 0x10000));
            draws.push(consumed);
            break;
        }
    }
    return {rows, draws};
}

const REPLIES = new Map([
    [1, 'Yes'], [2, 'Most likely'], [3, 'Certainly'], [4, 'Ask again'],
    [5, 'Without a doubt'], [6, 'Better not tell you'], [7, 'No'],
    [8, 'Signs point to yes']
]);

const asText = result => typeof result === 'string' ? result :
    result.pseudocode || result.text || result.source || result.code;

async function crystalSource () {
    const {default: SB3Creator} = await import(new URL('sb3-creator.js', L).href);
    const original = await readFile(new URL(
        '../overlay/scratch-gui/examples/arduino-sk-p11-crystal-ball/program.bw',
        import.meta.url), 'utf8');
    const retargeted = SB3Creator.retargetPseudocode(original, 'stc12c5a60s2');
    assert.notEqual(retargeted && retargeted.ok, false, 'crystal-ball retarget refused');
    const source = asText(retargeted).replace(/^DEVICE .*$/m, 'DEVICE i8086');
    assert.match(source, /^PIN tilt = P3\.2 INPUT$/m,
        'the input drive must follow the retargeted pin rather than a guessed port');
    return source;
}

async function buildCrystal ({mutateC = code => code, mutateAssembly = null} = {}) {
    const source = await crystalSource();
    const {default: SB3Creator} = await import(new URL('sb3-creator.js', L).href);
    const creator = new SB3Creator();
    creator.parse(source);
    const generated = creator.generateC();
    const healthy = typeof generated === 'string' ? generated : generated.code;
    assert.doesNotMatch(healthy, /No C emitted/, 'crystal-ball did not reach device C');
    const cSource = mutateC(healthy);
    const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
    const seams = {compileC: nodeCompileC};
    if (mutateAssembly) {
        const {assemble} = await import(new URL('bw-board/i8086-asm.js', L).href);
        seams.assembleLocal = assembly => assemble(mutateAssembly(assembly),
            {variant: '80186', setcc: true});
    }
    return {healthy, cSource, built: await compileC8086(cSource, seams)};
}

async function runRows (built, count, limit = 500_000) {
    const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);
    const bench = await createI8086DosBench({bytes: built.bytes, format: built.format,
        variant: '80186', chips: built.chips});
    let steps = 0;
    while (steps < limit) {
        // P3.2 is 8255 port C bit 2 after the app's own Arduino -> STC12 retarget.
        bench.target.setInput('ppi1', 'c', 2, 1);
        bench.step();
        steps++;
        const rows = bench.screenText().filter(Boolean);
        if (rows.length >= count) {
            return {rows: rows.filter((_, index) => index < count), steps,
                cycles: bench.machine.cycles, bytes: built.bytes.length};
        }
        if (bench.terminated) break;
    }
    assert.fail(`crystal-ball reached fewer than ${count} rows in ${steps} steps`);
}

test('the real crystal-ball emits the reviewed fixed sequence through a real 80186 COM',
    {timeout: 240000}, async t => {
        const built = await buildCrystal();
        assert.match(built.healthy, /extern int bw_random\(int from, int to\);/);
        assert.match(built.healthy, /extern void bw_print\(const char \*text\);/);
        assert.match(built.built.asm, /^_bw_random:$/m);
        assert.match(built.built.asm, /^_bw_print:$/m);
        assert.doesNotMatch(built.built.asm, /^\s*extern\s+_bw_(?:random|print)$/m);
        const rolls = randomOracle(Array.from({length: 8}, () => [1, 8])).rows;
        assert.deepEqual(rolls, [2, 4, 4, 4, 1, 2, 5, 7]);
        const expected = rolls.map(roll => REPLIES.get(roll));
        const receipt = await runRows(built.built, expected.length);
        assert.deepEqual(receipt.rows, expected);
        assert.equal(built.built.format, 'com');
        t.diagnostic(`N2f crystal-ball receipt: ${JSON.stringify({...receipt, rolls})}`);
    });

test('low-word modulo and branch/text mutations both redden the independent trace',
    {timeout: 300000}, async () => {
        const healthyRolls = randomOracle(Array.from({length: 8}, () => [1, 8])).rows;
        const expected = healthyRolls.map(roll => REPLIES.get(roll));
        const modulo = await buildCrystal({mutateAssembly: assembly => {
            const real = [
                '    mul bx',
                '    cmp ax, di',
                '    jb BW_CR_RETRY',
                '    mov ax, dx'
            ].join('\n');
            assert.equal(assembly.split(real).length - 1, 1,
                'low-word mutation must bind the exact accepted mapping once');
            return assembly.replace(real, [
                '    xor dx, dx',
                '    div bx',
                '    mov ax, dx'
            ].join('\n'));
        }});
        const moduloRows = (await runRows(modulo.built, expected.length)).rows;
        assert.deepEqual(moduloRows, [
            'Certainly', 'Ask again', 'Yes', 'Most likely', 'No',
            'Signs point to yes', 'Without a doubt', 'Better not tell you'
        ], 'the low-word mutant did not fire with its reviewed short-period trace');
        assert.notDeepEqual(moduloRows, expected,
            'low-word modulo escaped the independent multiply-high oracle');

        const swapped = await buildCrystal({mutateC: code => {
            const yes = 'bw_print("Yes");';
            const likely = 'bw_print("Most likely");';
            assert.equal(code.split(yes).length - 1, 1, 'Yes mapping mutation anchor drifted');
            assert.equal(code.split(likely).length - 1, 1, 'Most-likely mapping mutation anchor drifted');
            return code.replace(yes, 'bw_print("__N2F_SWAP__");')
                .replace(likely, yes)
                .replace('bw_print("__N2F_SWAP__");', likely);
        }});
        const swappedRows = (await runRows(swapped.built, expected.length)).rows;
        assert.equal(swappedRows[0], 'Yes', 'branch/text mutation did not fire on the first roll');
        assert.notDeepEqual(swappedRows, expected,
            'swapped reply branches escaped the independent text oracle');
    });

test('equal, reversed, full-span and rejection-consuming bounds match the independent model',
    {timeout: 180000}, async t => {
        const calls = [[0, 594], [7, 7], [8, 1], [-32768, 32767], [-2, 2]];
        const expected = randomOracle(calls);
        assert.deepEqual(expected, {rows: [225, 7, 4, -25002, -1], draws: [2, 1, 1, 1, 1]},
            'the independent fixed vectors changed');
        const source = [
            'extern int bw_random(int from, int to);',
            'extern void bw_print_num(int n);',
            'int main(void) {',
            ...calls.map(([from, to]) => {
                const cInt = value => value === -32768 ? '(-32767 - 1)' : String(value);
                return `  bw_print_num(bw_random(${cInt(from)}, ${cInt(to)}));`;
            }),
            '  return 0;',
            '}'
        ].join('\n');
        const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
        const built = await compileC8086(source, {compileC: nodeCompileC});
        const receipt = await runRows(built, expected.rows.length);
        assert.deepEqual(receipt.rows, expected.rows.map(String));
        assert.match(built.asm, /neg ax\s+xor dx, dx\s+div bx\s+mov di, dx/,
            'the runtime image omitted threshold derivation for rejection sampling');
        t.diagnostic(`N2f boundary receipt: ${JSON.stringify({...receipt, draws: expected.draws})}`);
    });

test('helper injection is conditional, and removing it fails by unresolved symbol name',
    {timeout: 180000}, async () => {
        const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
        const unused = await compileC8086('int main(void) { return 0; }', {compileC: nodeCompileC});
        assert.doesNotMatch(unused.asm, /_bw_(?:random|print):|call _bw_(?:random|print)/,
            'N2f helpers leaked into an unrelated C image');

        const source = 'extern int bw_random(int from, int to);\n'
            + 'int main(void) { return bw_random(1, 8); }';
        const {assemble} = await import(new URL('bw-board/i8086-asm.js', L).href);
        await assert.rejects(() => compileC8086(source, {
            compileC: nodeCompileC,
            assembleLocal: assembly => {
                assert.equal(assembly.split('_bw_random:').length - 1, 1,
                    'missing-helper mutation did not find the definition');
                return assemble(assembly.replace('_bw_random:', '_bw_random_missing:'),
                    {variant: '80186', setcc: true});
            }
        }), /_bw_random/,
        'removing the random helper did not fail at assembly by symbol name');
    });
