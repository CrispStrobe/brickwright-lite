#!/usr/bin/env node
// Self-test for the riscv-cc service: compile a few programs and check the image
// shape and the error path. Needs riscv64-unknown-elf-gcc; skips cleanly (exit 0)
// without it, like the app's ngspice/synthesis oracles. Not under test/, so the
// app's CI (which has no cross-compiler) never runs it — this is for the deployer.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {compile, elf32ToImage} from './server.mjs';

let haveGcc = true;
try { execFileSync(process.env.RISCV_CC || 'riscv64-unknown-elf-gcc', ['--version'], {stdio: 'ignore'}); }
catch { haveGcc = false; }

if (!haveGcc) {
    console.log('SKIP: riscv64-unknown-elf-gcc not installed — the service self-test needs the toolchain.');
    process.exit(0);
}

test('a valid C program compiles to a loadable image at 0x1000', async () => {
    const r = await compile('int printf(const char*,...); int main(void){ printf("ok %d\\n", 7); return 0; }\n');
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.image.entry, 0x1000, 'entry is _start at the text base');
    assert.ok(r.image.segments.length >= 1);
    assert.equal(r.image.segments[0].addr, 0x1000);
    assert.ok(atob(r.image.segments[0].bytes).length > 0, 'the text segment has bytes');
});

test('the M extension is available (mul/div link and run offline is proven by the app)', async () => {
    const r = await compile('int main(void){ volatile int a=6,b=7; return a*b==42 ? 0 : 1; }\n');
    assert.equal(r.ok, true, r.reason);
});

test('a syntax error is the PROGRAM\'s failure, reported with the compiler log', async () => {
    const r = await compile('int main(void){ return }\n');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'compile-failed');
    assert.ok(r.log && r.log.length > 0, 'gcc\'s stderr names the line');
});

test('empty and oversized sources are refused before invoking gcc', async () => {
    assert.equal((await compile('   ')).code, 'no-source');
    assert.equal((await compile('x'.repeat(300 * 1024))).code, 'too-large');
});

test('elf32ToImage refuses a non-ELF buffer by name', () => {
    assert.throws(() => elf32ToImage(Buffer.from('not an elf at all, really')), /not an ELF/);
});
