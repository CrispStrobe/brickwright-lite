/**
 * D-EMU-READMEM, proven against the REAL vendored WASM.
 *
 * `emu_dbg_read_mem` answers out of a fixed 256-byte scratch buffer in C and
 * does not clamp the length it was handed. Ask for more and it returns a
 * pointer to 256 good bytes followed by unrelated heap, with no error, no
 * short count, and nothing for a caller to test. The adapter used to wrap the
 * whole requested length around that pointer, so `readMem('code', 0, 0x10000)`
 * — the read the hex view and the disassembler both issue — came back as a few
 * hundred bytes of program and 65 KB of zeroes, which looks exactly like a
 * blank chip.
 *
 * The seam is at 256, so every assertion here reads ACROSS it. A test that
 * only read 256 bytes would have passed against the broken adapter, which is
 * why the sizes below are written out rather than parameterised loosely.
 *
 * Skips loudly if the vendored WASM is absent — a silent skip in the file that
 * pins a silent corruption would be the same class of mistake twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WASM_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js');
const DEBUG_JS = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/emu8051-debug.js');
const have = existsSync(WASM_JS) && existsSync(DEBUG_JS);
if (!have) console.log('# SKIP: the vendored emu8051 WASM is not present');

/** The size of the C scratch buffer. Reads must cross this to prove anything. */
const SCRATCH = 256;

async function target () {
    const {default: createEmu8051} = await import(WASM_JS);
    const {createEmu8051DebugTarget} = await import(DEBUG_JS);
    const wasm = await createEmu8051();
    wasm._emu_init(1);
    wasm._emu_set_fosc(11059200);
    wasm._emu_set_vcc(5.0);
    return createEmu8051DebugTarget(wasm);
}

/** A pattern with no run of equal bytes, so a stale buffer cannot look right. */
const pattern = n => Uint8Array.from({length: n}, (_, i) => ((i * 7) + 3) & 0xFF);

test('a bulk read longer than the scratch buffer returns the program, not heap', async () => {
    if (!have) return;
    const t = await target();
    const want = pattern(0x800);
    t.writeMem('code', 0, want);

    for (const len of [SCRATCH + 1, 512, 1024, 0x800]) {
        const got = t.readMem('code', 0, len);
        assert.equal(got.length, len, `readMem must return the length it was asked for (${len})`);
        const bad = got.findIndex((b, i) => b !== want[i]);
        assert.equal(bad, -1,
            `readMem('code', 0, ${len}) diverged at byte ${bad}. ` +
            `A divergence exactly at ${SCRATCH} means the bulk read stopped being chunked.`);
    }
});

test('the bulk read agrees with the byte-at-a-time path it is an optimisation of', async () => {
    if (!have) return;
    const t = await target();
    t.writeMem('code', 0, pattern(0x400));

    // The slow path is the definition of correct: one value-returning call per
    // byte, no shared buffer, nothing to overrun.
    const slow = Uint8Array.from({length: 0x400}, (_, i) => t.readMem('code', i, 1)[0]);
    const fast = t.readMem('code', 0, 0x400);
    assert.deepEqual(Array.from(fast), Array.from(slow),
        'the fast path must be indistinguishable from reading one byte at a time');
});

test('a read that STARTS past the seam is not silently rebased to zero', async () => {
    if (!have) return;
    const t = await target();
    t.writeMem('code', 0, pattern(0x800));
    const want = pattern(0x800);
    const got = t.readMem('code', 0x300, 0x200);
    assert.deepEqual(Array.from(got), Array.from(want.slice(0x300, 0x500)),
        'chunking must advance the ADDRESS as well as the output offset');
});
