// Compile-on-DOS primitive: run a real DOS program in the browser DOS bench and
// read back the file it wrote — the mechanism a "Pascal via ACK" / "GW-BASIC"
// code-tab route stands on. Runs against the REAL bench + INT 21h file I/O (no
// stubs), so it proves the capability, not a mock of it. No pin bump: the pinned
// bw-board already loads MZ .EXE/.COM and serves INT 21h file calls.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    runDosProgram, compileAndRunOnDos
} from '../overlay/scratch-gui/src/lib/bw-debug/dos-compile.js';
import {
    DOS_TOOLCHAINS, HOSTED_TOOLCHAINS, runDosToolchain
} from '../overlay/scratch-gui/src/lib/bw-debug/dos-toolchain-routes.js';

// A 40-byte real .COM: INT 21h create OUT.TXT, write "HI", close, exit(0).
const FILE_WRITER = new Uint8Array([
    0xBA, 0x1E, 0x01,             // mov dx, OUT.TXT
    0x31, 0xC9,                   // xor cx, cx
    0xB4, 0x3C, 0xCD, 0x21,       // mov ah,3Ch; int 21h  (create)
    0x89, 0xC3,                   // mov bx, ax           (handle)
    0xBA, 0x26, 0x01,             // mov dx, "HI"
    0xB9, 0x02, 0x00,             // mov cx, 2
    0xB4, 0x40, 0xCD, 0x21,       // mov ah,40h; int 21h  (write)
    0xB4, 0x3E, 0xCD, 0x21,       // mov ah,3Eh; int 21h  (close)
    0xB8, 0x00, 0x4C, 0xCD, 0x21, // mov ax,4C00h; int 21h (exit 0)
    0x4F, 0x55, 0x54, 0x2E, 0x54, 0x58, 0x54, 0x00, // "OUT.TXT",0
    0x48, 0x49                    // "HI"
]);

test('runDosProgram runs a program and reads back the file it wrote', async () => {
    const {files, terminated, exitCode, exhausted, steps} = await runDosProgram({
        bytes: FILE_WRITER, format: 'com', maxSteps: 200000
    });
    assert.ok(terminated && !exhausted, `program terminated (steps=${steps})`);
    assert.equal(exitCode, 0);
    const out = files.get('OUT.TXT');
    assert.ok(out instanceof Uint8Array, 'the program-created file is on the mounted disk');
    assert.equal(new TextDecoder().decode(out), 'HI');
});

test('compileAndRunOnDos mounts sources, runs the compiler, extracts its output', async () => {
    // The file-writer stands in for a compiler: sources are mounted for it, and
    // it "produces" OUT.TXT — exactly the shape a real ACK/GW-BASIC run takes.
    const r = await compileAndRunOnDos({
        compiler: FILE_WRITER, compilerFormat: 'com',
        sources: {'SOURCE.PAS': 'begin writeln(42) end.'},
        outputName: 'OUT.TXT', run: false, maxSteps: 200000
    });
    assert.equal(r.stage, 'compile');
    assert.ok(r.compile.terminated);
    assert.ok(r.output instanceof Uint8Array, 'the produced file is extracted');
    assert.equal(new TextDecoder().decode(r.output), 'HI');
    // the source was on the disk the compiler saw (mounting works)
    assert.ok(r.files.get('SOURCE.PAS'), 'the source was mounted for the compiler');
});

test('routes split DOS-native (GW-BASIC) from hosted (ACK); all unverified', () => {
    // GW-BASIC is a DOS .EXE → the DOS bench (dos-compile).
    const gw = DOS_TOOLCHAINS['gwbasic'];
    assert.ok(gw && gw.kind === 'dos-native');
    assert.equal(gw.verified, false);
    assert.ok(gw.compiler && gw.sourceName);
    // ACK is a HOST cross-compiler → a hosted endpoint, NOT the DOS bench.
    const ack = HOSTED_TOOLCHAINS['pascal-ack'];
    assert.ok(ack && ack.kind === 'hosted');
    assert.equal(ack.verified, false);
    // and it is deliberately NOT a DOS route.
    assert.equal(DOS_TOOLCHAINS['pascal-ack'], undefined);
});

test('runDosToolchain runs a DOS-native route through the bench (fetch composition)', async () => {
    let seen = null;
    // Throw after the fetch so the test does not depend on a valid GWBASIC.EXE;
    // it proves the route lookup + fetch composition for a DOS-native route.
    await assert.rejects(() => runDosToolchain('gwbasic', '10 PRINT 42', {
        fetchToolchain: async route => { seen = route; throw new Error('stop-after-fetch'); }
    }), /stop-after-fetch/);
    assert.equal(seen.id, 'gwbasic');
    assert.equal(seen.sourceName, 'PROG.BAS');
});

test('runDosToolchain refuses a hosted route, an unknown route, or a missing fetcher', async () => {
    // A hosted toolchain (ACK) does not run on the bench — say so, don't fetch.
    await assert.rejects(
        () => runDosToolchain('pascal-ack', 'begin end.', {fetchToolchain: async () => ({compiler: FILE_WRITER})}),
        /HOSTED toolchain/);
    await assert.rejects(
        () => runDosToolchain('nope', 'x', {fetchToolchain: async () => ({compiler: FILE_WRITER})}),
        /unknown DOS toolchain/);
    await assert.rejects(() => runDosToolchain('gwbasic', 'x', {}), /needs a fetchToolchain/);
});
