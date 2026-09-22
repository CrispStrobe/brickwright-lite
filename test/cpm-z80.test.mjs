// CP/M-80 (Z80) service layer: run a real Z80 CP/M `.COM` in the browser CP/M
// bench and read back the console output and the file it wrote — the Z80/CP/M
// twin of dos-compile.test.mjs. Runs against the REAL bw-board Z80 machine +
// the lite BDOS layer (no stubs), so it proves the capability, not a mock of
// it. No pin bump: the pinned bw-board already ships the Z80 machine; the BDOS
// is emulated in lite behind the 0x0005 trap.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    runCpmProgram, runAckCpmOutput
} from '../overlay/scratch-gui/src/lib/bw-debug/cpm-compile.js';
import {createCpm80, BDOS} from '../overlay/scratch-gui/src/lib/bw-debug/cpm-z80.js';
import {
    CPM_TOOLCHAINS, runCpmToolchain, DOS_TOOLCHAINS
} from '../overlay/scratch-gui/src/lib/bw-debug/dos-toolchain-routes.js';

// A tiny real CP/M .COM: BDOS func 9 prints "HI" via CALL 5, then RET → warm
// boot. Assembled by hand (org 0100h):
//   LD DE, MSG      ; 11 09 01     (MSG at 0109h)
//   LD C, 9         ; 0E 09
//   CALL 5          ; CD 05 00
//   RET             ; C9
//   MSG: DB 'HI$'   ; 48 49 24
const PRINT_HI = new Uint8Array([
    0x11, 0x09, 0x01,   // LD DE, MSG
    0x0e, 0x09,         // LD C, 9   (print string)
    0xcd, 0x05, 0x00,   // CALL 5
    0xc9,               // RET  → 0000h → terminate
    0x48, 0x49, 0x24    // "HI$"
]);

// A real CP/M .COM that writes a file: set DMA → make OUT.TXT → write one
// 128-byte record from the DMA buffer → close → RET. Assembled by hand
// (org 0100h); FCB at 0121h, BUF at 0145h.
const FILE_WRITER = new Uint8Array([
    // set DMA to BUF (0145h)
    0x11, 0x45, 0x01, 0x0e, 0x1a, 0xcd, 0x05, 0x00,   // LD DE,BUF; LD C,26; CALL 5
    // make OUT.TXT
    0x11, 0x21, 0x01, 0x0e, 0x16, 0xcd, 0x05, 0x00,   // LD DE,FCB; LD C,22; CALL 5
    // write sequential
    0x11, 0x21, 0x01, 0x0e, 0x15, 0xcd, 0x05, 0x00,   // LD DE,FCB; LD C,21; CALL 5
    // close
    0x11, 0x21, 0x01, 0x0e, 0x10, 0xcd, 0x05, 0x00,   // LD DE,FCB; LD C,16; CALL 5
    0xc9,                                             // RET → terminate
    // FCB at 0121h (36 bytes): drive, "OUT     ", "TXT", ex/s1/s2/rc, 16×alloc, cr, r0-r2
    0x00,
    0x4f, 0x55, 0x54, 0x20, 0x20, 0x20, 0x20, 0x20,   // "OUT     "
    0x54, 0x58, 0x54,                                 // "TXT"
    0x00, 0x00, 0x00, 0x00,                           // ex, s1, s2, rc
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,   // alloc d0..d7
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,   // alloc d8..d15
    0x00,                                             // cr
    0x00, 0x00, 0x00,                                 // r0, r1, r2
    // BUF at 0145h: the record payload
    0x48, 0x49                                        // "HI"
]);

test('the BDOS trap is laid down where a CALL 5 will find it', async () => {
    // A structural check independent of any program: install() must wire
    // 0x0005 → JP BDOS and place the JR $ trap stub at BDOS.
    const {Z80Machine, CPM64K} = await import('bw-board/z80-machine.js');
    const m = new Z80Machine(CPM64K);
    const cpm = createCpm80(m, {}).install();
    assert.equal(m.mem[0x0005], 0xc3, 'JP at 0x0005');
    assert.equal(m.mem[0x0006] | (m.mem[0x0007] << 8), BDOS, '0x0006/7 points at BDOS');
    assert.equal(m.mem[BDOS], 0x18, 'JR $ stub low byte at BDOS');
    assert.equal(m.mem[BDOS + 1], 0xfe, 'JR $ stub high byte at BDOS');
    assert.equal(cpm.bdosAddr, BDOS);
});

test('runCpmProgram runs a real Z80 CP/M .COM and captures its console output', async () => {
    const {screen, screenText, terminated, exitCode, exhausted, steps} = await runCpmProgram({
        bytes: PRINT_HI, maxSteps: 200000
    });
    assert.ok(terminated && !exhausted, `program terminated (steps=${steps})`);
    assert.equal(exitCode, 0);
    assert.equal(screen, 'HI');
    assert.equal(screenText[0], 'HI');
});

test('runCpmProgram runs a program that writes a file, and reads it back off the disk', async () => {
    const {files, terminated, exitCode, exhausted, steps} = await runCpmProgram({
        bytes: FILE_WRITER, maxSteps: 200000
    });
    assert.ok(terminated && !exhausted, `program terminated (steps=${steps})`);
    assert.equal(exitCode, 0);
    const out = files.get('OUT.TXT');
    assert.ok(out instanceof Uint8Array, 'the program-created file is on the mounted disk');
    // CP/M writes whole 128-byte records, so the file is one record long and the
    // payload is its first two bytes (the rest is the record's zero fill).
    assert.equal(out.length, 128, 'one 128-byte CP/M record');
    assert.equal(new TextDecoder().decode(out.subarray(0, 2)), 'HI');
});

test('runCpmProgram mounts an input file a program can open and read', async () => {
    // A .COM that: set DMA → open IN.TXT → read one record → print the first
    // byte of the DMA buffer via func 2 → RET. Assembled deterministically: the
    // FCB and DMA buffer are placed right after the code and the addresses
    // patched in, so the layout needs no hand-counting.
    const code = [
        0x11, 0x00, 0x00, 0x0e, 0x1a, 0xcd, 0x05, 0x00,   // LD DE,BUF (patch); set DMA
        0x11, 0x00, 0x00, 0x0e, 0x0f, 0xcd, 0x05, 0x00,   // LD DE,FCB (patch); open
        0x11, 0x00, 0x00, 0x0e, 0x14, 0xcd, 0x05, 0x00,   // LD DE,FCB (patch); read seq
        0x3a, 0x00, 0x00,                                 // LD A,(BUF) (patch)
        0x5f,                                             // LD E,A
        0x0e, 0x02, 0xcd, 0x05, 0x00,                     // LD C,2; CALL 5 (print char)
        0xc9                                              // RET
    ];
    const fcbAddr = 0x0100 + code.length;                 // FCB right after code
    const bufAddr = fcbAddr + 36;                         // BUF right after the 36-byte FCB
    // patch the three DE loads + the LD A,(BUF)
    code[1] = bufAddr & 0xff; code[2] = bufAddr >> 8;     // LD DE,BUF
    code[9] = fcbAddr & 0xff; code[10] = fcbAddr >> 8;    // LD DE,FCB
    code[17] = fcbAddr & 0xff; code[18] = fcbAddr >> 8;   // LD DE,FCB
    code[25] = bufAddr & 0xff; code[26] = bufAddr >> 8;   // LD A,(BUF)
    // A 36-byte FCB: drive 0, name "IN      ", ext "TXT", all record/alloc fields 0.
    const fcb = new Array(36).fill(0);
    const nm = 'IN      TXT';                              // 8+3, space-padded
    for (let i = 0; i < nm.length; i++) fcb[1 + i] = nm.charCodeAt(i);
    assert.equal(fcb.length, 36);
    const image = new Uint8Array([...code, ...fcb]);

    const {screen, terminated} = await runCpmProgram({
        bytes: image, files: {'IN.TXT': 'Z rest'}, maxSteps: 200000
    });
    assert.ok(terminated, 'reader terminated');
    assert.equal(screen, 'Z', 'printed the first byte read from the mounted file');
});

test('runAckCpmOutput runs a produced .COM (the ACK stage-two shape)', async () => {
    // runAckCpmOutput is the stage-two entry a hosted cross-compiler route uses:
    // it runs a .COM already compiled off the Z80. Proven here with the same
    // print program.
    const r = await runAckCpmOutput({com: PRINT_HI, maxSteps: 200000});
    assert.ok(r.terminated);
    assert.equal(r.screen, 'HI');
});

// A REAL compiler's Z80/CP/M output. This 368-byte .COM was produced by SDCC
// (the libre GPL C compiler, `sdcc -mz80`) from a C factorial program, linked
// against a CP/M crt0 whose putchar calls BDOS func 2. It is committed as a
// static artefact (decoded below), so this proves — with no toolchain present
// at test time — that a genuine cross-compiled Z80/CP/M program runs correctly
// on the layer. (The intended ACK z80/cpm build is the same shape: a host cross
// compiler emits a CP/M .COM that this layer runs; see the report for why ACK's
// own build could not be run here.)
const SDCC_FACT_COM_B64 =
    'wwgCXw4CzQUAyX63yCNP5XnNAwHhGPPd5d0hAADdOf0h9f/9Of353XX93XT+fN22/SAHPjDNAwEYYd02' +
    '/wDdfv7dtv0oM91e/xYAIQAAORndNP/lEQoA3W793Wb+zWYC4XvGMHcRCgDdbv3dZv7NGQLdc/3dcv4Y' +
    'xd1+/7coHN01/91e/xYAIQAAORnddfvddPx+3Xf8zQMBGN7d+d3hyQEBAMUh3AHNCgHBIQEA69VpYM1I' +
    'AktC4eXFzRcBIQACzQoBwcVpYM0XASEFAs0KAcHhIz4IvT4AnDDTyUZhY3RvcmlhbHMgZnJvbSBTREND' +
    'IG9uIFo4MC9DUC9NOg0KACEgPSAADQoAMQDwzQAEzaABwwAAXW8mAFR75oCyIBEGEO1qF5MwAYM/7Wo' +
    'Q9l/ryQYJfWwmAMsd7WrtUjABGT8XEPXLEFBfyU1Er2+wBhAgBAYIeSnLERcwARkQ9+vJXW/NFgLryc' +
    '0ZAuvJ//////8=';

test('a real SDCC-compiled Z80/CP/M .COM computes and prints correct output', async () => {
    const com = new Uint8Array(Buffer.from(SDCC_FACT_COM_B64, 'base64'));
    const {screen, terminated, exhausted} = await runCpmProgram({bytes: com, maxSteps: 5_000_000});
    assert.ok(terminated && !exhausted, 'the compiled program terminated');
    // The C program's computed output — real arithmetic + BDOS console I/O.
    assert.match(screen, /Factorials from SDCC on Z80\/CP\/M:/);
    for (const line of ['1! = 1', '5! = 120', '8! = 40320']) {
        assert.ok(screen.includes(line), `output contains "${line}"`);
    }
});

// A REAL ACK-compiled Z80/CP/M output. This 5885-byte .COM was produced by the
// Amsterdam Compiler Kit (ACK, BSD-3) — the libre Pascal/C/Modula-2 toolchain —
// with `ack -mcpm -O` from the Pascal program below, on GitHub CI (the box that
// hosts this repo OOMs an ACK build). ACK's cpm platform is ARCH i80 (8080), and
// an 8080 CP/M .COM runs on the Z80 the layer drives (the Z80 is a strict 8080
// superset). Built + proven end-to-end in .github/workflows/ack-z80-cpm.yml and
// committed here as a static artefact so the layer is proven against genuine ACK
// output with no toolchain present at test time — the libre twin of the SDCC
// case above.
//
//   program cpmdemo(output);
//   const max = 30;
//   var flags : array [2..max] of boolean; i, j, n : integer;
//   begin
//     writeln('ACK on Z80/CP/M'); n := 0;
//     for i := 2 to max do flags[i] := true;
//     for i := 2 to max do
//       if flags[i] then begin
//         n := n + 1; write(i:4); j := i + i;
//         while j <= max do begin flags[j] := false; j := j + i end
//       end;
//     writeln; writeln('primes: ', n:0)
//   end.
const ACK_CPM_PRIMES_COM_B64 =
    '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' +
    'aXQgZXhwZWN0ZWQAAHdyaXRlIGVycm9yAHJlYWQgZXJyb3IAAGNsb3NlIGVycm9yAHJld3Jp' +
    'dGUgZXJyb3IAcmVzZXQgZXJyb3IAdHJ1bmNhdGVkAGVuZCBvZiBmaWxlAG5vdCByZWFkYWJs' +
    'ZQAAbm90IHdyaXRhYmxlAABpbGxlZ2FsIGZpZWxkIHdpZHRoAGZ1bmN0aW9uIG5vdCBhc3Np' +
    'Z25lZABkaXNwb3NlIGVycm9yAGZpbGUgbm90IHlldCBvcGVuAG9ubHkgcG9zaXRpdmUgaiBp' +
    'biAnaSBtb2QgaicAAGFycmF5IGJvdW5kIGVycm9yIGluIHVucGFjawBhcnJheSBib3VuZCBl' +
    'cnJvciBpbiBwYWNrAGFzc2VydGlvbiBmYWlsZWQAAGVycm9yIGluIHNxcnQAZXJyb3IgaW4g' +
    'bG4AZXJyb3IgaW4gZXhwAABtb3JlIGFyZ3MgZXhwZWN0ZWQAAEdUTyBkZXNjcmlwdG9yIGVy' +
    'cm9yAABhcmd1bWVudCBpZiBMSU4gdG9vIGhpZ2gAAGJhZCBtb25pdG9yIGNhbGwAAGJhZCBh' +
    'cmd1bWVudCBvZiBsYWUAcHJvZ3JhbSBjb3VudGVyIG91dCBvZiByYW5nZQAAYmFkIHBvaW50' +
    'ZXIgdXNlZAAAYWRkcmVzc2luZyBub24gZXhpc3RlbnQgbWVtb3J5AABjYXNlIGVycm9yAABp' +
    'bGxlZ2FsIHNpemUgYXJndW1lbnQAaWxsZWdhbCBpbnN0cnVjdGlvbgBoZWFwIG92ZXJmbG93' +
    'AHN0YWNrIG92ZXJmbG93AABjb252ZXJzaW9uIGVycm9yAAB1bmRlZmluZWQgcmVhbAAAdW5k' +
    'ZWZpbmVkIGludGVnZXIAZGl2aWRlIGJ5IDAuMABkaXZpZGUgYnkgMAByZWFsIHVuZGVyZmxv' +
    'dwAAcmVhbCBvdmVyZmxvdwBpbnRlZ2VyIG92ZXJmbG93AABzZXQgYm91bmQgZXJyb3IAcmFu' +
    'Z2UgYm91bmQgZXJyb3IAYXJyYXkgYm91bmQgZXJyb3IACgBlcnJvciBudW1iZXIgADogAABm' +
    'aWxlIAAsIAAAVFJBUCENCiR3IAAAIxoBAAAA/xYBAO0WAgDdFgMAyxYEAL0WBQCtFgYAoRYH' +
    'AJMWCACBFgkAcRYKAF8WEABPFhEAQRYSAC0WEwAXFhQACxYVAOsVFgDZFRcAuxUYAKcVGQCV' +
    'FRoAexUbAGUVQABRFUEAQxVCADcVQwApFUQAFxVFAP0URgDhFEcAwxRIALEUSQCjFEoAjRRL' +
    'AHkUYABrFGEAXRRiAFEUYwBHFGQAOxRlAC0UZgAhFGcAFRRoAAkUaQD5E2oA5RP//wAAAAA=';

test('a real ACK-compiled Z80/CP/M .COM (Pascal, ack -mcpm) runs correctly on the layer', async () => {
    const com = new Uint8Array(Buffer.from(ACK_CPM_PRIMES_COM_B64, 'base64'));
    const {screen, terminated, exhausted} = await runCpmProgram({bytes: com, maxSteps: 8_000_000});
    assert.ok(terminated && !exhausted, 'the ACK-compiled program terminated');
    // ACK's Pascal runtime + a real sieve: the header line, the ten primes below
    // 30 printed through BDOS, and the computed count.
    assert.match(screen, /ACK on Z80\/CP\/M/);
    for (const prime of ['   2', '  29']) assert.ok(screen.includes(prime), `output contains "${prime}"`);
    assert.ok(screen.includes('primes: 10'), 'the program computed 10 primes below 30 (2..29)');
});

test('runAckCpmOutput runs the real ACK .COM (the stage-two entry a hosted ACK route uses)', async () => {
    const com = new Uint8Array(Buffer.from(ACK_CPM_PRIMES_COM_B64, 'base64'));
    const r = await runAckCpmOutput({com, maxSteps: 8_000_000});
    assert.ok(r.terminated);
    assert.ok(r.screen.includes('primes: 10'));
});

test('CP/M toolchain routes: ACK z80/cpm and SDCC are hosted; run path proven', async () => {
    const ack = CPM_TOOLCHAINS['ack-z80-cpm'];
    assert.ok(ack && ack.kind === 'hosted-cpm', 'ACK z80/cpm is a hosted CP/M route');
    assert.equal(ack.target, 'z80/cpm');
    assert.equal(ack.endpoint, null);            // no in-browser compile server stood up
    assert.equal(ack.verified, true);            // ACK z80/cpm built on CI; a real .COM runs (test above)
    assert.equal(ack.runProven, true);           // the RUN path IS proven
    const sdcc = CPM_TOOLCHAINS['sdcc-z80-cpm'];
    assert.ok(sdcc && sdcc.language === 'c');
    // These are NOT DOS-native routes.
    assert.equal(DOS_TOOLCHAINS['ack-z80-cpm'], undefined);
});

test('runCpmToolchain runs a produced .COM through the CP/M bench', async () => {
    const com = new Uint8Array(Buffer.from(SDCC_FACT_COM_B64, 'base64'));
    const r = await runCpmToolchain('sdcc-z80-cpm', com, {maxSteps: 5_000_000});
    assert.ok(r.terminated);
    assert.ok(r.screen.includes('8! = 40320'));
    // an unknown route, or non-bytes, is refused
    await assert.rejects(() => runCpmToolchain('nope', com), /unknown CP\/M toolchain/);
    await assert.rejects(() => runCpmToolchain('sdcc-z80-cpm', 'notbytes'), /produced \.COM bytes/);
});
