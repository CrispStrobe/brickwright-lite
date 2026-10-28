import {importPackageSource} from './helpers/package-source.mjs';
// N2c acceptance — a single-script wait crosses the same INT 15h/86h DOS
// machine-time door on the generated C and ASM routes. The comparison is in
// emulated CPU cycles, not PIT ticks: this bench's PIT has no IRQ and is fed at
// CPU rate, so treating it as a PC's 1.193182 MHz clock would be 4.19x wrong.
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

const WAIT = [
    'DEVICE i8086',
    'PIN led = P1.0 OUTPUT',
    'WHEN flag clicked:',
    '  wait 0.05 seconds',
    '  turn on led'
].join('\n');
const NOW = WAIT.replace('  wait 0.05 seconds\n', '');

async function buildRoutes (src, {removeDosWait = false} = {}) {
    const {default: SB3Creator} = await import(new URL('sb3-creator.js', L).href);
    const creator = new SB3Creator();
    creator.parse(src);
    const generated = creator.generateC();
    const cSource = typeof generated === 'string' ? generated : generated.code;
    const {buildPseudocode8086} = await import(new URL('bw-asm/pseudocode-8086.js', L).href);
    const asm = await buildPseudocode8086({project: creator.project, source: src});
    const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
    const seams = {compileC: nodeCompileC};
    if (removeDosWait) {
        const {assemble} = await importPackageSource('bw-board/i8086-asm.js');
        seams.assembleLocal = async source => assemble(source.replace(
            /    mov ah, 86h\n    int 15h/, '    nop\n    nop'),
        {variant: '80186', setcc: true});
    }
    const c = await compileC8086(cSource, seams);
    return {asm, c, cSource};
}

async function cyclesUntilLed (built) {
    const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);
    const b = await createI8086DosBench({bytes: built.bytes, format: built.format,
        variant: '80186', chips: built.chips});
    let steps = 0;
    while (steps < 100_000) {
        const port = b.target.outputs().find(output => output.port === 'a');
        if (port && (port.value & 1)) return {cycles: b.machine.cycles, steps};
        if (b.terminated) break;
        b.step();
        steps++;
    }
    assert.fail(`P1.0 never went high (${steps} steps, terminated=${b.terminated})`);
}

test('C and ASM waits add the same 50 ms of DOS machine time without instruction grinding',
    {timeout: 180000}, async () => {
        // SmallerC's cached WASM factories are one compiler toolchain. Compile
        // serially; parallel calls would make the test race a stateful seam the
        // browser itself never invokes concurrently.
        const waited = await buildRoutes(WAIT);
        const baseline = await buildRoutes(NOW);
        assert.match(waited.cSource, /bw_delay_ms\(50\)/);
        assert.match(waited.c.asm, /mov ah, 86h\s+int 15h/);

        const [cWait, cNow, asmWait, asmNow] = await Promise.all([
            cyclesUntilLed(waited.c), cyclesUntilLed(baseline.c),
            cyclesUntilLed(waited.asm), cyclesUntilLed(baseline.asm)
        ]);
        const cDelay = cWait.cycles - cNow.cycles;
        const asmDelay = asmWait.cycles - asmNow.cycles;
        assert.ok(cDelay >= 250_000 && cDelay < 250_500, `C added ${cDelay} cycles, not 50 ms at 5 MHz`);
        assert.ok(asmDelay >= 250_000 && asmDelay < 250_500, `ASM added ${asmDelay} cycles, not 50 ms at 5 MHz`);
        assert.ok(Math.abs(cDelay - asmDelay) < 250,
            `C/ASM elapsed-time disagreement is ${Math.abs(cDelay - asmDelay)} cycles`);
        assert.ok(cWait.steps - cNow.steps < 40 && asmWait.steps - asmNow.steps < 20,
            'a wait consumed a duration-sized instruction loop instead of the DOS proxy');
    });

test('mutation proof: removing INT 15h makes the elapsed-time differential fail visibly',
    {timeout: 180000}, async () => {
        const mutated = await buildRoutes(WAIT, {removeDosWait: true});
        const waited = await buildRoutes(WAIT);
        const baseline = await buildRoutes(NOW);
        const [mutantC, realAsm, baselineC] = await Promise.all([
            cyclesUntilLed(mutated.c), cyclesUntilLed(waited.asm), cyclesUntilLed(baseline.c)
        ]);
        const mutantDelay = mutantC.cycles - baselineC.cycles;
        const realDelay = realAsm.cycles - (await cyclesUntilLed(baseline.asm)).cycles;
        assert.ok(realDelay - mutantDelay > 240_000,
            `the oracle missed the removed wait: real=${realDelay}, mutant=${mutantDelay}`);
    });
