/**
 * N3d — the Pico sim's NODE-ORACLE transport drains the device's CDC host→device
 * FIFO, so a program larger than one buffer runs live instead of truncating in
 * silence. (Found on P3 part 1.)
 *
 * THE MECHANISM. A physical Pico empties its USB-CDC RX buffer by EXECUTING while
 * the host writes; the emulated device only advances when something drives it.
 * `pico-repl.js`'s `writeChunked` drains between 64-byte packets IFF the transport
 * implements `drain()` — and the two transports differ: the BROWSER transport
 * (`pico-sim-run.js`) implements it (it yields one rAF frame so the pump consumes
 * the packet); the node ORACLE transport (`scripts/probe-pico-micropython.mjs`)
 * did NOT. Without a drain, every packet piles into the 512-byte `txFIFO` with no
 * stepping in between; past 512 `FIFO.push` DROPS SILENTLY (an `if (used < length)`
 * guard, no overflow signal), so the raw-REPL never sees the whole program, its OK
 * never arrives, and the program never runs.
 *
 * THE PREDICTION THIS REFUTED. The P3 finding first read the overflow as "the
 * SHIPPED 'Run on the simulated Pico' (browser N3c) very likely fails past one
 * buffer." Measurement said the opposite: the shipped browser path HAS `drain()`
 * and carries a large program fine; only the node oracle — a test-and-probe seam,
 * not shipped — lacked it. So the fix is one method on the node transport;
 * `pico-repl.js` and every shipped file are untouched. The threshold below is
 * rp2040js's own `TX_FIFO_SIZE`, read from its source so it tracks the runtime,
 * not a constant of ours.
 *
 * Skips BY NAME without the integrated tree + firmware (`BW_INTEGRATED_ROOT`
 * overrides the dependency root; no sibling path is discovered — gate-shapes
 * AMBIENT-BINDING).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {SOURCE, INTEGRATED} from './helpers/bw-integrated.mjs';
import {ensureFirmware, parseUF2, createPicoMachine, CACHED_UF2, FIRMWARE}
    from '../scripts/probe-pico-micropython.mjs';

const SKIP = !existsSync(join(INTEGRATED, 'node_modules', 'rp2040js'))
    ? 'needs rp2040js from the integrated tree (npm run integrate, then npm install in packages/scratch-gui)'
    : !existsSync(CACHED_UF2)
        ? `needs ${FIRMWARE.file} — run \`npm run sync:picomicropython\` once to fetch it (650 KB, sha256-pinned, gitignored)`
        : false;
if (SKIP) process.stderr.write(`[bw gate] pico-sim-transport-drain: SKIPPING — ${SKIP}\n`);

// rp2040js's OWN buffer size, parsed from where it is defined — not a literal of
// ours. If rp2040js changes it, the threshold this test asserts moves with it.
const TX_FIFO_SIZE = SKIP ? 0 : (() => {
    const src = readFileSync(join(INTEGRATED, 'node_modules', 'rp2040js', 'dist', 'cjs', 'usb', 'cdc.js'), 'utf8');
    const m = src.match(/TX_FIFO_SIZE\s*=\s*(\d+)/);
    assert.ok(m, 'rp2040js cdc.js does not define TX_FIFO_SIZE');
    return parseInt(m[1], 10);
})();

async function boot () {
    const {image} = parseUF2(await ensureFirmware({offline: true, quiet: true}));
    const m = await createPicoMachine(image, {entry: 'flash'});
    assert.equal(m.run(() => m.state.usbConnected, 3_000_000), 'done', 'USB never enumerated');
    return m;
}

function mockBoard () {
    const edges = [];
    return {edges, setPin (name, mode, high) { edges.push({name, mode, high}); },
        advanceTo () {}, readPin () { return 0; }, readAnalog () { return 0; }};
}

const sb3 = async () => (await import(pathToFileURL(join(SOURCE, 'src/lib/sb3-creator.js')).href)).default;
const picoRepl = async () => import(pathToFileURL(join(SOURCE, 'src/lib/pico-repl.js')).href);

// A generated Pico program that comfortably exceeds one txFIFO — the same pin
// program P3 emits (its MicroPython is ~1.2 KB, > 2× the 512-byte buffer). Built
// from the generator, not hand-written, so it is a program the app really ships.
const PROGRAM = [
    'DEVICE PICO',
    'PIN led = GP25 OUTPUT',
    'PIN btn = GP14 INPUT',
    'WHEN flag clicked:',
    '  turn on led',
    '  set state to read btn',
    '  turn off led',
].join('\n');

async function bigProgramPy () {
    const c = new (await sb3())();
    c.parse(PROGRAM);
    const mp = c.generateMicroPython();
    assert.ok(mp.ok && mp.py, `generateMicroPython refused: ${JSON.stringify(mp.reasons)}`);
    return mp.py;
}

// ---- the threshold, and the drain that clears it ----------------------------

test('N3d: the node transport drops CDC bytes past TX_FIFO_SIZE, and drain() clears the buffer',
    {skip: SKIP}, async (t) => {
        const m = await boot();
        // Write more than one buffer with NO intervening step. The device only
        // consumes txFIFO when it runs, so nothing drains: the FIFO fills to
        // exactly TX_FIFO_SIZE and the overshoot is silently gone.
        const OVERSHOOT = 200;
        await m.transport.write('x'.repeat(TX_FIFO_SIZE + OVERSHOOT));
        t.diagnostic(`TX_FIFO_SIZE=${TX_FIFO_SIZE}; wrote ${TX_FIFO_SIZE + OVERSHOOT}, `
            + `txFIFO holds ${m.cdc.txFIFO.itemCount} (dropped ${TX_FIFO_SIZE + OVERSHOOT - m.cdc.txFIFO.itemCount})`);
        assert.equal(m.cdc.txFIFO.itemCount, TX_FIFO_SIZE,
            'txFIFO should cap at TX_FIFO_SIZE — the overshoot is dropped without a signal');
        assert.equal(m.cdc.txFIFO.full, true, 'the buffer is full at the threshold');

        // drain() pumps the machine until the device has consumed the buffer —
        // the observable the fix adds and writeChunked relies on.
        await m.transport.drain();
        t.diagnostic(`after drain(): txFIFO holds ${m.cdc.txFIFO.itemCount}`);
        assert.equal(m.cdc.txFIFO.empty, true, 'drain() must leave the txFIFO empty');
    });

test('N3d: a program past one buffer runs live through the node oracle (drain carries it)',
    {skip: SKIP}, async (t) => {
        const py = await bigProgramPy();
        assert.ok(py.length > TX_FIFO_SIZE,
            `this program (${py.length} B) must exceed one buffer (${TX_FIFO_SIZE} B) to exercise the drain`);
        t.diagnostic(`program is ${py.length} B (${(py.length / TX_FIFO_SIZE).toFixed(1)}× the buffer)`);

        const m = await boot();
        const board = mockBoard();
        m.adapter.attachBoard(board);
        const {startProgramOnRepl} = await picoRepl();
        // m.transport HAS drain(); the OK below only arrives if the whole program
        // reached the device, which it can only do if each packet drained.
        await startProgramOnRepl(m.transport, py, {timeoutMs: 120_000});

        // It really ran: the green-flag handler drove GP25 high then low.
        const g25 = () => board.edges.filter(e => e.name === 'GP25');
        assert.equal(
            m.run(() => g25().some(e => e.high) && g25().at(-1) && !g25().at(-1).high, 8_000_000),
            'done', `GP25 was not driven high-then-low — edges ${JSON.stringify(g25())}`);
        assert.equal(g25().some(e => e.mode === 'pushpull'), true, 'GP25 should be a driven output');
    });

test('N3d mutation: with drain() removed, the same program times out waiting for OK',
    {skip: SKIP}, async () => {
        const py = await bigProgramPy();
        const m = await boot();
        m.adapter.attachBoard(mockBoard());
        // The SAME transport, but with drain() hidden — exactly the pre-fix node
        // oracle. writeChunked's `if (transport.drain)` is now false, so the
        // program overflows the txFIFO and the OK never comes.
        const noDrain = {write: (txt) => m.transport.write(txt), read: () => m.transport.read()};
        const {startProgramOnRepl} = await picoRepl();
        await assert.rejects(
            () => startProgramOnRepl(noDrain, py, {timeoutMs: 15_000}),
            /timeout waiting for "OK"/,
            'without drain(), a >buffer program must time out on the OK-wait, not pass');
    });
