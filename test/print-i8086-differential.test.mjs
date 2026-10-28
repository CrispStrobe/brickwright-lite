import {importPackageSource} from './helpers/package-source.mjs';
// N2d acceptance — the bounded i8086 C numeric print helper must produce the
// same DOS-visible rows as the ASM route. Equality alone is insufficient, so
// the signed boundaries have an independent expected-value oracle too.
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

const asText = result => typeof result === 'string' ? result :
    result.pseudocode || result.text || result.source || result.code;

async function buildRoutes (source, {mutateCrlf = false, mutateProject = null} = {}) {
    const {default: SB3Creator} = await import(new URL('sb3-creator.js', L).href);
    const creator = new SB3Creator();
    creator.parse(source);
    if (mutateProject) mutateProject(creator.project);
    const generated = creator.generateC();
    const cSource = typeof generated === 'string' ? generated : generated.code;
    const {buildPseudocode8086} = await import(new URL('bw-asm/pseudocode-8086.js', L).href);
    const asm = await buildPseudocode8086({project: creator.project, source});
    const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
    const seams = {compileC: nodeCompileC};
    if (mutateCrlf) {
        const {assemble} = await importPackageSource('bw-board/i8086-asm.js');
        seams.assembleLocal = async assembly => {
            const crlf = [
                '    mov dl, 0Dh', '    mov ah, 02h', '    int 21h',
                '    mov dl, 0Ah', '    mov ah, 02h', '    int 21h'
            ].join('\n');
            assert.ok(assembly.includes(crlf), 'mutation could not find the C helper CRLF');
            return assemble(assembly.replace(crlf, '    nop\n    nop'),
                {variant: '80186', setcc: true});
        };
    }
    const c = await compileC8086(cSource, seams);
    return {asm, c, cSource};
}

async function screenRows (built, count, drive = () => {}, stop = bench =>
    (bench.dos.stdout.match(/\n/g) || []).length >= count) {
    const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);
    const bench = await createI8086DosBench({bytes: built.bytes, format: built.format,
        variant: '80186', chips: built.chips});
    let steps = 0;
    while (steps < 2_000_000) {
        drive(bench);
        bench.step();
        steps++;
        if (stop(bench) || bench.terminated) return bench.screenText();
    }
    assert.fail(`numeric output did not reach ${count} completed rows in ${steps} steps`);
}

const BOUNDARIES = [
    'DEVICE i8086',
    'PIN led = P1.0 OUTPUT',
    'WHEN flag clicked:',
    '  print -32768',
    '  print -1',
    '  print 0',
    '  print 32767'
].join('\n');

test('C and ASM render every signed-16 boundary as the same exact DOS rows',
    {timeout: 180000}, async () => {
        const routes = await buildRoutes(BOUNDARIES);
        assert.match(routes.cSource, /extern void bw_print_num\(int n\);/);
        assert.match(routes.c.asm, /^_bw_print_num:$/m);
        assert.doesNotMatch(routes.c.asm, /^\s*extern\s+_bw_print_num$/m);
        assert.match(routes.c.asm, /mov ah, 02h\s+int 21h/,
            'numeric output must use the ASM route\'s DOS character-output door');
        const expected = ['-32768', '-1', '0', '32767'];
        const cRows = await screenRows(routes.c, expected.length);
        const asmRows = await screenRows(routes.asm, expected.length);
        assert.deepEqual(cRows.slice(0, expected.length), expected);
        assert.deepEqual(cRows, asmRows, 'complete C/ASM screenText differs');
    });

test('all four measured numeric candidates render the same first row on C and ASM',
    {timeout: 240000}, async () => {
        const names = [
            'arduino-01-digital-read-serial',
            'arduino-02-digital-input-pullup',
            'arduino-02-state-change',
            'arduino-06-ping'
        ];
        const {default: SB3Creator} = await import(new URL('sb3-creator.js', L).href);
        for (const name of names) {
            const original = await readFile(new URL(`../overlay/scratch-gui/examples/${name}/program.bw`,
                import.meta.url), 'utf8');
            const retargeted = SB3Creator.retargetPseudocode(original, 'stc12c5a60s2');
            assert.notEqual(retargeted && retargeted.ok, false, `${name}: retarget refused`);
            const deviceSource = asText(retargeted).replace(/^DEVICE .*$/m, 'DEVICE i8086');
            const spriteHeaders = deviceSource.match(/^SPRITE Cat:$/gm) || [];
            assert.equal(spriteHeaders.length, 1,
                `${name}: harness expected exactly one retargeted sprite script`);
            // DOS has no sprite stage and correctly refuses this wrapper. The
            // differential compares the same sole algorithm on both routes by
            // normalising only that header; the reach gate above still compiles
            // the original corpus project unchanged.
            const source = deviceSource.replace(/^SPRITE Cat:$/m, 'STAGE:');
            assert.doesNotMatch(source, /^SPRITE /m, `${name}: harness left a sprite wrapper`);
            const routes = await buildRoutes(source);
            assert.match(routes.cSource, /bw_print_num\(/, `${name}: numeric call absent`);
            const drive = name === 'arduino-02-state-change' ? bench => {
                bench.target.setInput('ppi1', 'c', 2, bench.machine.cycles >= 20_000 ? 1 : 0);
            } : bench => bench.target.setInput('ppi1', 'c', 2, 1);
            const cRows = await screenRows(routes.c, 1, drive);
            const asmRows = await screenRows(routes.asm, 1, drive);
            assert.ok(cRows.length > 0, `${name}: no numeric row reached the DOS display`);
            assert.equal(cRows[0], '1', `${name}: independent expected numeric row changed`);
            assert.deepEqual(cRows, asmRows, `${name}: complete C/ASM screenText differs`);
        }
    });

test('a loaded INT16_MIN variable initialiser compiles and reaches numeric output',
    {timeout: 180000}, async () => {
        const source = [
            'DEVICE i8086',
            'PIN led = P1.0 OUTPUT',
            'GLOBAL counter',
            'WHEN flag clicked:',
            '  print counter'
        ].join('\n');
        const setMinimum = project => {
            const stage = project.targets.find(target => target.isStage);
            const counter = Object.values(stage.variables).find(value => value[0] === 'counter');
            assert.ok(counter, 'loaded-project mutation could not find counter');
            counter[1] = -32768;
        };
        const routes = await buildRoutes(source, {mutateProject: setMinimum});
        assert.match(routes.cSource, /^static int counter = \(-32767 - 1\);$/m);
        assert.doesNotMatch(routes.cSource, /^static int counter = -32768;$/m);
        assert.deepEqual((await screenRows(routes.c, 1))[0], '-32768');
    });

test('CRLF removal is visible between consecutive numbers, and unused helpers stay absent',
    {timeout: 180000}, async () => {
        const real = await buildRoutes(BOUNDARIES);
        const mutant = await buildRoutes(BOUNDARIES, {mutateCrlf: true});
        const expected = ['-32768', '-1', '0', '32767'];
        const realRows = await screenRows(real.c, expected.length);
        const mutantRows = await screenRows(mutant.c, 1, () => {}, bench =>
            bench.dos.stdout.includes('-32768-1032767'));
        assert.deepEqual(realRows.slice(0, expected.length), expected);
        assert.notDeepEqual(mutantRows.slice(0, expected.length), expected,
            'dropping CR then LF did not redden the rendered line boundary');

        const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
        const unused = await compileC8086('int main(void){ return 0; }', {compileC: nodeCompileC});
        assert.doesNotMatch(unused.asm, /_bw_print_num:|call _bw_print_num|extern _bw_print_num/,
            'the numeric helper leaked into an unrelated C image');
    });

test('a numeric-print call with helper injection removed fails by unresolved symbol name',
    {timeout: 180000}, async () => {
        const routes = await buildRoutes(BOUNDARIES);
        const compiled = await nodeCompileC(routes.cSource, {target: 'i8086'});
        const body = compiled.asm
            .replace(/^\s*bits\s+16\s*$/im, '')
            .replace(/^\s*extern\s+_bw_outb\s*$/im, '');
        const {assemble} = await importPackageSource('bw-board/i8086-asm.js');
        assert.throws(() => assemble([
            'bits 16',
            'org 100h',
            'section .text',
            '    call _main',
            '    mov ah, 4Ch',
            '    int 21h',
            '_bw_outb:',
            '    ret',
            body
        ].join('\n'), {variant: '80186', setcc: true}), /_bw_print_num/,
        'removing helper injection must fail at assembly and name bw_print_num');
    });
