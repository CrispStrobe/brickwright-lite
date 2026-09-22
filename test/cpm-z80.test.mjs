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

test('CP/M toolchain routes: ACK z80/cpm and SDCC are hosted; run path proven', async () => {
    const ack = CPM_TOOLCHAINS['ack-z80-cpm'];
    assert.ok(ack && ack.kind === 'hosted-cpm', 'ACK z80/cpm is a hosted CP/M route');
    assert.equal(ack.target, 'z80/cpm');
    assert.equal(ack.endpoint, null);            // no compile server stood up
    assert.equal(ack.verified, false);           // build not reproduced here
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
