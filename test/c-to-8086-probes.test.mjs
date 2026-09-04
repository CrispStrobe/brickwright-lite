/**
 * The C a learner writes that the startup and the toolchain have never seen.
 *
 * `test/c-to-8086.test.mjs` proves the path works and was written the same
 * afternoon as the code it tests, so it is evidence about the programs its
 * author imagined — the limit `bw-board/VERIFICATION.md` records for a corpus,
 * applied to a test file. The startup stub in `assemble-route.js` is six lines,
 * and every one of them is an assumption about a calling convention:
 *
 *     call _main
 *     mov ah, 4Ch
 *     int 21h
 *
 * These probe what that assumes: a `main` that never returns, a return value
 * wider than the eight bits DOS carries, `main(int argc, char **argv)` whose
 * arguments nothing sets up, globals needing runtime initialisation, and
 * recursion deep enough to meet whatever stack a `.COM` inherits.
 *
 * WHAT THEY FOUND, in order of how much it costs a learner:
 *
 *   1. A COMPARISON USED AS A VALUE DID NOT BUILD — FIXED, and this file is
 *      where it was found. `return a >= 1;`, `int b = (a > 1);` and any
 *      ternary emit SETcc, an 80386 instruction, while the same construct in
 *      a CONTROL position compiles to a conditional JUMP and always worked.
 *      The assembler now synthesises SETcc from MOV/Jcc/MOV behind an option
 *      the C route turns on; hand-written `setge al` is still refused by
 *      name. The pin here fired and was rewritten to assert the answer.
 *   2. `argc` IS DETERMINISTICALLY ZERO. Nothing sets it up, so a learner's
 *      `if (argc > 1)` is silently false. `argv` is non-null, so a null guard
 *      passes and a dereference reads whatever is there.
 *   3. The exit code is truncated to eight bits, silently. That is DOS being
 *      DOS rather than a defect, and it is recorded so nobody re-derives it.
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

/** Compile, assemble, boot, and hand back the exit code — the whole path. */
async function runC (source, timeout = 3_000_000) {
    const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
    const built = await compileC8086(source, {compileC: nodeCompileC});
    const {createI8086DosBench} = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);
    const b = await createI8086DosBench({
        bytes: built.bytes, format: built.format, variant: '80186'});
    let n = 0;
    while (n < timeout && !b.terminated) { b.step(); n++; }
    return {built, terminated: b.terminated, exitCode: b.exitCode, steps: n};
}

// ---- 1. the one that stops a learner's program building -------------------

test('a comparison used as a VALUE builds and gives the C answer', {timeout: 120000},
    async () => {
        // THIS TEST WAS A KNOWN-DEFECT PIN AND THE PIN FIRED. It used to
        // assert that these were REFUSED: SmallerC lowers a comparison used as
        // a value to SETcc, an 80386 instruction, so `return a >= 1;` did not
        // build while `if (a >= 1)` did. The message said what to do when it
        // started building, and this is that rewrite.
        //
        // The assembler now synthesises SETcc from MOV/Jcc/MOV behind an
        // option the C route turns on (bw-board `fa2e588`). Hand-written
        // `setge al` in the ASM tab is still refused by name, because that
        // instruction really is absent from the chip.
        for (const [what, src, want] of [
            ['returned comparison, true', 'int main(void){int a=5; return a >= 1;}', 1],
            ['returned comparison, false', 'int main(void){int a=0; return a >= 1;}', 0],
            ['ternary, then arm', 'int main(void){int a=5; return a >= 1 ? 100 : 200;}', 100],
            ['ternary, else arm', 'int main(void){int a=0; return a >= 1 ? 100 : 200;}', 200],
            ['assigned comparison', 'int main(void){int a=5; int b = (a > 1); return b;}', 1],
            ['logical && true', 'int main(void){int a=5; return (a>1) && (a<9);}', 1],
            ['logical && false', 'int main(void){int a=5; return (a>1) && (a<3);}', 0],
        ]) {
            const r = await runC(src);
            assert.equal(r.exitCode, want, `${what} should exit ${want}`);
        }
    });

test('and each synthesis warns, so a human sees what was substituted',
    {timeout: 120000}, async () => {
        // The warning is what keeps this from being a silent substitution. The
        // C route may swallow it; a human in the ASM tab should not have to
        // guess that three instructions replaced one.
        const {compileC8086} = await import(new URL('bw-asm/assemble-route.js', L).href);
        const built = await compileC8086('int main(void){int a=5; return a >= 1;}',
            {compileC: nodeCompileC});
        const setccWarnings = built.warnings
            .map((w) => (typeof w === 'string' ? w : w.message || ''))
            .filter((m) => /80386 instruction; synthesised/.test(m));
        assert.equal(setccWarnings.length, 1, 'one warning for the one SETcc in this program');
        assert.match(setccWarnings[0],
            /no longer assemble under an assembler targeting a real 8086/,
            'the warning must say what was traded away, not merely that something happened');

        // Two comparisons, two warnings — per site, not per program.
        const two = await compileC8086('int main(void){int a=5; return (a>1) && (a<9);}',
            {compileC: nodeCompileC});
        assert.equal(two.warnings.map((w) => (typeof w === 'string' ? w : w.message || ''))
            .filter((m) => /80386 instruction; synthesised/.test(m)).length, 2);
    });

test('the SAME comparison in a control position builds and runs', {timeout: 120000}, async () => {
    // This is what makes the defect confusing rather than merely limiting: the
    // operator is not the problem, its POSITION is. A conditional jump is an
    // 8086 instruction; materialising the boolean is not.
    assert.equal((await runC('int main(void){int a=5; if (a >= 1) return 100; return 200;}'))
        .exitCode, 100, 'if (a >= 1) must work');
    assert.equal((await runC('int main(void){int a=5,n=0; while(a >= 1){a--;n++;} return n;}'))
        .exitCode, 5, 'while (a >= 1) must work');
});

// ---- 2. arguments nothing sets up -----------------------------------------

test('KNOWN DEFECT: argc is deterministically 0 and argv is non-null',
    {timeout: 120000}, async () => {
        // The startup calls _main with no arguments at all, so a `main` that
        // declares them reads whatever the registers held. Measured: argc is
        // reliably 0, which is worse than garbage — it is a stable wrong
        // answer that a learner's `if (argc > 1)` silently takes.
        assert.equal((await runC('int main(int argc, char **argv){return argc;}')).exitCode, 0);
        assert.equal((await runC('int main(int argc, char **argv){return argc + 7;}')).exitCode, 7,
            'argc is 0, not junk — the same value twice');
        assert.equal((await runC(
            'int main(int argc, char **argv){ if (argc > 0) return 1; return 2; }')).exitCode, 2,
        'a learner guarding on argc takes the wrong branch');
        // And argv is NOT null, so the obvious defensive check passes before
        // the dereference that would actually be unsafe.
        assert.equal((await runC(
            'int main(int argc, char **argv){ if (argv == 0) return 9; return 8; }')).exitCode, 8,
        'a null guard on argv passes, which is the dangerous half');
    });

// ---- 3. what the startup gets right, pinned so it stays right --------------

test('the exit path carries eight bits, and that is DOS rather than a defect',
    {timeout: 120000}, async () => {
        // `mov ah, 4Ch` leaves AL holding main's low byte, which is exactly
        // right for 0-255 and silently truncating above it. DOS exit codes are
        // eight bits; C promises int. Recorded so nobody re-derives it from a
        // program that returns 300 and reports 44.
        for (const [ret, code] of [[0, 0], [7, 7], [255, 255], [256, 0], [300, 44], [511, 255],
            [512, 0], [-1, 255]]) {
            assert.equal((await runC(`int main(void){return ${ret};}`)).exitCode, code,
                `return ${ret} should exit ${code}`);
        }
    });

test('globals with initialisers work, including arrays', {timeout: 120000}, async () => {
    assert.equal((await runC('int g = 42;\nint main(void){return g;}')).exitCode, 42);
    assert.equal((await runC('int a[3]={1,2,3};\nint main(void){return a[0]+a[1]+a[2];}'))
        .exitCode, 6);
});

test('a main that never returns does not reach the exit path', {timeout: 120000}, async () => {
    // Correct, and worth pinning: the stub's exit is AFTER the call, so an
    // infinite loop simply never reaches it. It must not fall through into
    // whatever follows.
    const r = await runC('int main(void){for(;;){}}', 500_000);
    assert.ok(!r.terminated, 'an infinite loop must not terminate');
});

test('recursion 500 deep survives the .COM stack', {timeout: 120000}, async () => {
    // 500 & 255 = 244. A .COM inherits whatever stack DOS left at the top of
    // the segment, and nothing here reserves one, so this is the depth that
    // was measured rather than the depth that is guaranteed.
    assert.equal((await runC(
        'int f(int n){if(n<=0)return 0;return 1+f(n-1);}\nint main(void){return f(500);}'))
        .exitCode, 244);
});

test('a program with no main is refused by name', {timeout: 120000}, async () => {
    await assert.rejects(() => runC('int other(void){return 1;}'), /undefined symbol: _main/,
        'the missing entry point must name itself rather than producing a program that runs');
});
