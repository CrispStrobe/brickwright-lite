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
    DOS_TOOLCHAINS, runDosToolchain
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

test('DOS_TOOLCHAINS describes Pascal-via-ACK and GW-BASIC, marked unverified', () => {
    for (const id of ['pascal-ack', 'gwbasic']) {
        const r = DOS_TOOLCHAINS[id];
        assert.ok(r, id);
        assert.equal(r.verified, false, 'unverified until confirmed on real binaries');
        assert.ok(r.compiler && r.sourceName, 'has a compiler + a source name');
    }
});

test('runDosToolchain looks up the route and fetches its toolchain', async () => {
    let seen = null;
    // Throw after the fetch so the test does not depend on a valid compiler EXE;
    // it proves the route lookup + fetch composition.
    await assert.rejects(() => runDosToolchain('pascal-ack', 'begin end.', {
        fetchToolchain: async route => { seen = route; throw new Error('stop-after-fetch'); }
    }), /stop-after-fetch/);
    assert.equal(seen.id, 'pascal-ack');
    assert.equal(seen.sourceName, 'PROG.PAS');
});

test('runDosToolchain refuses an unknown route or a missing fetcher', async () => {
    await assert.rejects(
        () => runDosToolchain('nope', 'x', {fetchToolchain: async () => ({compiler: FILE_WRITER})}),
        /unknown DOS toolchain/);
    await assert.rejects(() => runDosToolchain('pascal-ack', 'x', {}), /needs a fetchToolchain/);
});
