/**
 * DOES THE LOCAL ASSEMBLER READ WHAT THE LOCAL C COMPILER WRITES? Measured
 * here, program by program, rather than asserted anywhere.
 *
 * `test/smallerc-wasm.test.mjs` proves SmallerC produces 16-bit NASM and stops
 * at the TEXT. `test/c-to-8086.test.mjs` carries a handful of programs the
 * whole way to an exit code, but through `compileC8086`, which wraps the
 * compiler's output in a `.COM` startup first. Neither answers the question
 * this file exists for: given the compiler's OWN output, unwrapped, does
 * `bw-board/i8086-asm.js`'s NASM front end read it, and when it does not, what
 * exactly does it name?
 *
 * That question had a written answer, and the answer was WRONG. Both
 * `smallerc-wasm/compiler.js`'s header and ROADMAP §4.6 said the assembler
 * "is MASM-dialect and rejects that output on line 1 (`BITS` is not a
 * directive it knows)". The NASM front end landed in the vendored tree and
 * nobody re-measured. The tally below is the re-measurement, printed on every
 * run so a regression is visible and not merely red.
 *
 * WHAT THE TALLY COUNTS. The corpus is exactly the programs
 * `test/smallerc-wasm.test.mjs` already compiles successfully — its own
 * fixtures, copied verbatim, because a corpus invented here would measure a
 * corpus invented here. Its four DELIBERATE compile failures (`<stdio.h>`, an
 * undeclared identifier, a `z80` target, empty source) are listed as excluded
 * with the reason, and counted, rather than dropped: this repo's rule is that
 * a refusal is reported, never silently absent.
 *
 * The two known REFUSALS at the end are separate named expectations, not part
 * of the pass tally, for the same reason: they are the edge of the pipeline
 * and a regression that moves the edge should be red by name.
 */
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

/** The WASM glue is an ES module whose Emscripten body wants CommonJS scope.
 *  Same shim as the two SmallerC harnesses; the browser runs the same bytes. */
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

const compiler = () => import(new URL('smallerc-wasm/compiler.js', L).href);
const asmMod = () => import(new URL('bw-board/i8086-asm.js', L).href);

/**
 * The corpus: every program `test/smallerc-wasm.test.mjs` compiles
 * SUCCESSFULLY, copied from it rather than re-imagined.
 */
const NESTED_IFS = (depth => ['int main(void) {', 'int x = 0;']
    .concat(Array.from({length: depth}, (_, i) => `if (x < ${i}) {`))
    .concat(['x = 1;'])
    .concat(Array.from({length: depth}, () => '}'))
    .concat(['return x;', '}']).join('\n'))(24);

const CORPUS = [
    ['two isolated WASM stages turn C into 16-bit NASM',
        'int add(int a, int b) { return a + b; }\nint main(void) { return add(2, 3); }\n'],
    ['the preprocessor stage really runs', [
        '#define SQ(x) ((x) * (x))',
        '#define N 3',
        '#if N > 2',
        'int big = 1;',
        '#elif N == 2',
        'int big = 2;',
        '#endif',
        'int main(void) { return SQ(N) + big; }'
    ].join('\n')],
    ['bundled freestanding headers resolve without a fetch',
        '#include <stdint.h>\n#include <stddef.h>\nuint16_t w = 65535u;\n' +
        'int main(void) { return (int)sizeof(w); }\n'],
    ['STACK_SIZE canary: 24 nested ifs', NESTED_IFS],
    ['EXIT_RUNTIME canary: the preprocessor flushes',
        'int counter;\nint main(void) { counter = 7; return counter; }\n']
];

/**
 * The four fixtures in that file that are MEANT not to compile. Listed and
 * counted, because "5 of 5 assembled" out of a nine-fixture file would be a
 * true sentence that reads as a false one.
 */
const EXCLUDED = [
    ['#include <stdio.h>', 'no libc on this path — the compiler refuses at the #include, by design'],
    ['an undeclared identifier', 'a deliberate diagnosis test'],
    ['target: z80', 'SmallerC builds only i8086 locally'],
    ['empty source', 'refused before a stage starts']
];

/**
 * Assemble the compiler's output the way the shipped C route does.
 *
 * `variant: '80186'` and `setcc: true` are NOT this test being generous. Both
 * are what `compileC8086` passes and both are argued for where it passes them:
 * SmallerC emits LEAVE in every function epilogue (an 80186 instruction) and
 * SETcc for a comparison used as a value (an 80386 one, which the assembler
 * synthesises and warns about per site). Assembling with the defaults here
 * would measure a machine nothing in this app builds for.
 *
 * `dialect` is deliberately left at 'auto': whether the front end is REACHED
 * without being asked for is half the question, and the stale claim this file
 * disproves was precisely a claim about the first line.
 */
async function through (asm) {
    const {assemble} = await asmMod();
    return assemble(asm, {variant: '80186', setcc: true});
}

test('every C program the SmallerC suite compiles also ASSEMBLES, unwrapped',
    {timeout: 180000}, async () => {
        const {compileWithToolchain} = await compiler();
        const {detectDialect} = await asmMod();
        const tc = await toolchain();
        const rows = [];
        for (const [name, source] of CORPUS) {
            const c = await compileWithToolchain(source, {target: 'i8086'}, tc);
            if (!c.success) { rows.push({name, ok: false, why: `compiler: ${c.error}`}); continue; }
            let dialect = null;
            try { dialect = detectDialect(c.asm); } catch (e) { dialect = `ambiguous (${e.message})`; }
            try {
                const out = await through(c.asm);
                rows.push({name, ok: true, dialect, bytes: out.bytes.length,
                    format: out.format, warnings: out.warnings.length});
            } catch (e) {
                rows.push({name, ok: false, dialect, why: `${e.what || e.name}: ${e.message}`});
            }
        }

        const passed = rows.filter(r => r.ok).length;
        // PRINTED, not merely asserted. A number that only exists inside an
        // assertion is a number nobody reads until it is wrong.
        console.log(`\nSmallerC -> i8086-asm.js NASM front end: ${passed} of ${rows.length} assemble`);
        for (const r of rows) {
            console.log(r.ok ?
                `  OK    ${r.name} — ${r.bytes} bytes, ${r.format}, dialect ${r.dialect}, ` +
                    `${r.warnings} warning(s)` :
                `  FAIL  ${r.name} — ${r.why}`);
        }
        console.log(`  excluded (do not compile, on purpose): ${EXCLUDED.length}`);
        for (const [what, why] of EXCLUDED) console.log(`    - ${what}: ${why}`);
        console.log('');

        const failures = rows.filter(r => !r.ok);
        assert.deepEqual(failures.map(r => `${r.name} — ${r.why}`), [],
            'a program the SmallerC suite compiles no longer assembles');
        assert.equal(passed, CORPUS.length,
            `${passed} of ${CORPUS.length} assembled — the pipeline is not whole`);

        // THE CLAIM THAT WAS STALE, asserted as its negation. `smallerc-wasm/
        // compiler.js` and ROADMAP §4.6 both said the assembler reads this as
        // MASM and dies on `bits 16`. Every row must have been read as NASM
        // WITHOUT the caller saying so, because that is the specific sentence
        // that was wrong.
        for (const r of rows) {
            assert.equal(r.dialect, 'nasm',
                `${r.name}: the detector did not read SmallerC output as NASM — ` +
                'a MASM reading of a NASM source assembles cleanly and computes ' +
                'the wrong number, which is why this is asserted and not assumed');
        }
    });

test('no failure is a line-1 dialect refusal — the 8086 default names an INSTRUCTION',
    {timeout: 120000}, async () => {
        // The only thing that refuses this corpus is the CPU variant, and it
        // refuses by naming the instruction at the line that has it. That is
        // the distinction the plan asks for: a named construct, deep in the
        // program, rather than "BITS is not a directive I know" on line 1.
        const {compileWithToolchain} = await compiler();
        const {assemble} = await asmMod();
        const c = await compileWithToolchain(CORPUS[0][1], {target: 'i8086'}, await toolchain());
        assert.equal(c.success, true);
        assert.match(c.asm, /^bits 16$/m, 'the fixture must actually start with the directive at issue');

        let named = null;
        try { assemble(c.asm, {}); } catch (e) { named = e; }
        assert.ok(named, 'an 8086 must still refuse LEAVE — if this passes, the variant gate is gone');
        assert.match(named.message, /"LEAVE" is an 80186 instruction/,
            'the refusal must name the instruction');
        assert.doesNotMatch(named.message, /BITS/i,
            'ROADMAP §4.6 and the compiler header both claim a `BITS` refusal on line 1. ' +
            'If this assertion is ever red again, re-open that claim rather than deleting it.');
        assert.ok(named.line > 1,
            `the refusal is at line ${named.line}; a dialect refusal would be at line 1`);
    });

test('a stage that fails does not take the HOST process down with it', async () => {
    // FOUND BY THIS FILE, WHICH IS WHY IT IS PINNED HERE. Every assertion
    // above passed and `node --test` still exited 1, because the Emscripten
    // glue's Node branch does `process.exitCode = status` in `quit_` and
    // `Module.quit` (which compiler.js passes) is never consulted. The last
    // program compiled was one this file MEANS to fail, so a wholly green
    // file reported as red — the inverse of the usual defect and just as bad.
    //
    // A test whose only symptom is the runner's exit code is a test nobody
    // reads, so it is asserted here as a value instead.
    const {compileWithToolchain} = await compiler();
    const before = process.exitCode;
    const bad = await compileWithToolchain(
        'int main(void) { return no_such_thing; }\n', {target: 'i8086'}, await toolchain());
    assert.equal(bad.success, false, 'the fixture must actually fail, or this proves nothing');
    assert.equal(process.exitCode, before,
        'a failed WASM stage set the host process exit code — a green test file will exit 1');

    // And the other direction: a stage that SUCCEEDS must not clear an exit
    // code the host set for its own reasons.
    process.exitCode = 3;
    const good = await compileWithToolchain(
        'int main(void) { return 0; }\n', {target: 'i8086'}, await toolchain());
    assert.equal(good.success, true);
    const after = process.exitCode;
    process.exitCode = before;
    assert.equal(after, 3, 'a successful WASM stage cleared the host process exit code');
});

test('the two constructs that DO NOT survive the pipeline, named and counted',
    {timeout: 120000}, async () => {
        // Measured 2026-09-05 by widening the corpus beyond the SmallerC
        // fixtures. Everything else tried — string literals, pointer walks,
        // structs, switch, .bss arrays, unsigned div/mod, recursion, static
        // locals, goto — assembles. These two do not, and each is named so
        // the edge cannot move without a test saying so.
        const {compileWithToolchain} = await compiler();
        const tc = await toolchain();

        // 1. FLOAT. SmallerC lowers a float conversion to a call into its own
        //    soft-float runtime and emits `extern ___fixsfsi`. There is no
        //    second module: this assembler writes a flat loadable image, so
        //    the EXTERN is unresolvable and it says exactly that. Closing this
        //    means shipping SmallerC's floating-point library as assembly the
        //    route prepends, which is a separate piece of work.
        const flt = await compileWithToolchain(
            'int main(void){ float f = 1.5f; return (int)f; }\n', {target: 'i8086'}, tc);
        assert.equal(flt.success, true, 'the COMPILER accepts float — the refusal is downstream');
        assert.match(flt.asm, /extern\s+___fixsfsi/i, 'and it is the soft-float helper that escapes');
        let ferr = null;
        try { await through(flt.asm); } catch (e) { ferr = e; }
        assert.ok(ferr, 'float now assembles — good news, and this expectation must be rewritten');
        assert.match(ferr.message, /EXTERN "___fixsfsi" cannot be resolved/,
            'the refusal must name the symbol, not merely fail');

        // 2. LONG. Refused by the COMPILER, not the assembler: smlrc in
        //    -seg16 has no 32-bit integer type, so `long` is a parse error at
        //    the declaration. Recorded here because a learner meets it as
        //    "8086 C" failing and the two stages must not be confused.
        const lng = await compileWithToolchain(
            'int main(void){ long a = 100000L; return (int)(a / 1000); }\n', {target: 'i8086'}, tc);
        assert.equal(lng.success, false, '`long` now compiles — rewrite this expectation');
        assert.match(lng.error, /Unexpected token long/,
            'and the compiler must name the token; this never reaches the assembler');

        console.log('\nRefused, by name: 2 — float (assembler: unresolvable EXTERN ___fixsfsi), ' +
            'long (compiler: Unexpected token long)\n');
    });
