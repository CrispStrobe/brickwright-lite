/**
 * P3 part 1 — the pin path's C and MicroPython drivers agree on the Pico GPIO.
 *
 * The differential P3 is built on: emit ONE pin program twice (generateC → the
 * Pico C route, generateMicroPython → the sim's raw-REPL run) and check they
 * drive the SAME GPIO. The pin path is first because it is the only part whose
 * C and MicroPython drivers both already exist, so the harness proves out here
 * before any new driver is written, then is reused as each C-only part
 * (shiftOut/motor/servo, per the P2 template) gains its MicroPython driver.
 *
 * WHAT IS EXECUTED AND WHAT IS PARSED. The MicroPython side is EXECUTED on
 * rp2040js (the sim's live run) and observed at the board boundary
 * (`board.setPin(name, mode, high)` — mode = direction, high = latch). The C
 * side is PARSED, not executed, until a local rp2040 C toolchain exists
 * (LOCAL_C_TARGETS = {i8086}; the Pico C route is hosted, unusable in a CI
 * differential — filed as N11). A parsed side is a MODEL, so it is ANCHORED to
 * the runtime: every SIO / IO_BANK0 address the C names is asserted equal to the
 * address rp2040js's own SIO peripheral decodes (read from rp2040js, not a table
 * of ours), so a wrong address in the emitter reddens instead of matching a
 * regex.
 *
 * WHAT IS RUN ON THE MICROPYTHON SIDE. The FULL generated program — the exact
 * `.py` generateMicroPython emits, scheduler and green-flag handler and all,
 * self-started on the sim. It is ~1.2 KB, past the device's 512-byte USB-CDC RX
 * buffer, and runs live because N3d gave the node-oracle transport a `drain()`:
 * `writeChunked` now pumps the emulated device between packets so it consumes the
 * buffer the way silicon does (silicon executes while the host writes). Before
 * N3d the full program overflowed the buffer and only the extracted pin-driver
 * lines could run; that caveat is closed — see `test/pico-sim-transport-drain.test.mjs`.
 *
 * Skips BY NAME (loud, exact command) without the integrated tree + firmware —
 * `BW_INTEGRATED_ROOT` overrides the dependency root; no sibling path is
 * discovered (gate-shapes AMBIENT-BINDING).
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
if (SKIP) process.stderr.write(`[bw gate] p3-pin-c-mpy-differential: SKIPPING — ${SKIP}\n`);

// The one program, emitted twice. GP25 (onboard LED) is an OUTPUT toggled
// on then off; GP14 is an INPUT the program reads — so both routes configure a
// direction of each kind.
const PROGRAM = [
    'DEVICE PICO',
    'PIN led = GP25 OUTPUT',
    'PIN btn = GP14 INPUT',
    'WHEN flag clicked:',
    '  turn on led',
    '  set state to read btn',
    '  turn off led',
].join('\n');

const sb3 = async () => (await import(pathToFileURL(join(SOURCE, 'src/lib/sb3-creator.js')).href)).default;

// ---- the runtime anchor: rp2040js's own SIO / IO_BANK0 addresses ------------
// Read from rp2040js, never a table of ours. SIO_START_ADDRESS is exported; the
// per-register offsets are module-local consts in sio.js, so they are read from
// that file's source — still rp2040js's own numbers, not ours.
function rp2040jsGpioMap () {
    // rp2040js's package `exports` blocks subpath require, so read its own
    // source files. Still rp2040js's numbers, parsed from where it defines them.
    const rpDir = join(INTEGRATED, 'node_modules', 'rp2040js', 'dist', 'cjs');
    const rp2040Src = readFileSync(join(rpDir, 'rp2040.js'), 'utf8');
    const sioSrc = readFileSync(join(rpDir, 'sio.js'), 'utf8');
    const constFrom = (src, name, where) => {
        const m = src.match(new RegExp(`${name}\\s*=\\s*(0x[0-9a-f]+)`, 'i'));
        assert.ok(m, `rp2040js ${where} does not define ${name}`);
        return parseInt(m[1], 16);
    };
    const off = (name) => constFrom(sioSrc, `const ${name}`, 'sio.js');
    const SIO = constFrom(rp2040Src, 'exports.SIO_START_ADDRESS', 'rp2040.js');
    // IO_BANK0 is registered at APB page 0x40014 in rp2040.js; GPIOn_CTRL is at
    // 0x004 + n*8 (RP2040 datasheet 2.19.6), the same stride the emitter uses.
    return {
        SIO_START: SIO,
        OUT_SET: SIO + off('GPIO_OUT_SET'),
        OUT_CLR: SIO + off('GPIO_OUT_CLR'),
        OE_SET: SIO + off('GPIO_OE_SET'),
        IO_BANK0_BASE: 0x40014000,
        ctrl: (n) => 0x40014000 + 0x004 + n * 8,
    };
}

// ---- the C-intent oracle: parse generateC's Pico output ---------------------
// Per pin (keyed by GP number), what the emitted C DOES: its funcsel address,
// its direction (an OE_SET makes it an output), and the ordered latch commands
// (OUT_SET = high, OUT_CLR = low). The absolute addresses it names are returned
// too, for the anchor to check against the runtime.
function cIntent (cSource, anchor) {
    const pins = {};
    const pin = (n) => (pins[n] ??= {gp: Number(n), funcselAddr: null, direction: 'input', latch: []});
    for (const line of cSource.split('\n')) {
        let m;
        if ((m = line.match(/BW_IOBANK0_CTRL\((\d+)\)\s*=\s*5u;/))) pin(m[1]).funcselAddr = anchor.ctrl(Number(m[1]));
        else if ((m = line.match(/BW_SIO_GPIO_OE_SET\s*=\s*\(1UL << (\d+)\)/))) pin(m[1]).direction = 'output';
        else if ((m = line.match(/BW_SIO_GPIO_OUT_SET\s*=\s*\(1UL << (\d+)\)/))) pin(m[1]).latch.push({addr: anchor.OUT_SET, high: true});
        else if ((m = line.match(/BW_SIO_GPIO_OUT_CLR\s*=\s*\(1UL << (\d+)\)/))) pin(m[1]).latch.push({addr: anchor.OUT_CLR, high: false});
    }
    return pins;
}

/** The meaningful, alignment-robust state of a pin: direction, whether it was
 *  ever driven high, and its final latch (ignoring which setup default each
 *  route uses to reach it). */
function cState (p) {
    return {direction: p.direction, wentHigh: p.latch.some(o => o.high),
        finalLatch: p.latch.length ? p.latch.at(-1).high : null};
}

// ---- the MicroPython side: run generateMicroPython on rp2040js --------------
function mockBoard () {
    const edges = [];
    return {edges, setPin (name, mode, high) { edges.push({name, mode, high}); },
        advanceTo () {}, readPin () { return 0; }, readAnalog () { return 0; }};
}

/** Run the WHOLE generated program on the sim — the exact `.py`, not a lifted
 *  subset. Past N3d the node-oracle transport drains between packets, so a
 *  program larger than one CDC buffer (this one is ~1.2 KB) reaches the device;
 *  its green-flag handler self-starts (`_run([...])` at the tail) and drives the
 *  pins. If the program overflowed (the pre-N3d defect) the OK-wait in
 *  startProgramOnRepl would throw, so a silent no-run cannot pass here. */
async function runMicroPython (py) {
    const {image} = parseUF2(await ensureFirmware({offline: true, quiet: true}));
    const m = await createPicoMachine(image, {entry: 'flash'});
    const board = mockBoard();
    m.adapter.attachBoard(board);
    assert.equal(m.run(() => m.state.usbConnected, 3_000_000), 'done', 'USB never enumerated');
    const {startProgramOnRepl} = await import(pathToFileURL(join(SOURCE, 'src/lib/pico-repl.js')).href);
    await startProgramOnRepl(m.transport, py, {timeoutMs: 600_000});
    // Drive until the handler has toggled GP25 both ways (ends low), the
    // observable end of the pin work.
    const g25 = () => board.edges.filter(e => e.name === 'GP25');
    assert.equal(
        m.run(() => g25().some(e => e.high) && g25().at(-1) && !g25().at(-1).high, 8_000_000),
        'done', `the program did not drive GP25 high-then-low — edges ${JSON.stringify(g25())}`);
    return board.edges;
}

/** The same alignment-robust state, observed at the board boundary. `mode`
 *  'pushpull' is a driven output; anything input-shaped is an input. */
function mpyState (edges, gp) {
    const es = edges.filter(e => e.name === `GP${gp}`);
    if (!es.length) return {direction: 'absent', wentHigh: false, finalLatch: null};
    const direction = es.some(e => e.mode === 'pushpull') ? 'output' : 'input';
    return {direction, wentHigh: es.some(e => e.high === true),
        finalLatch: direction === 'output' ? es.at(-1).high : null};
}

// ---- the tests --------------------------------------------------------------

test('P3: the emitter\'s Pico GPIO addresses match what rp2040js decodes (anchor)',
    {skip: SKIP}, async () => {
        const anchor = rp2040jsGpioMap();
        const c = new (await sb3())(); c.parse(PROGRAM);
        const src = c.generateC();
        // Every absolute SIO/IO_BANK0 address the C names must be one rp2040js
        // actually routes to its GPIO — a wrong address reddens here, not later.
        assert.ok(/BW_SIO_GPIO_OUT_SET\s+BW_MMIO\(0xd0000014u\)/.test(src.replace(/\s+/g, ' ')),
            'emitter OUT_SET address is not 0xd0000014');
        assert.equal(anchor.OUT_SET, 0xd0000014, 'rp2040js OUT_SET moved');
        assert.equal(anchor.OE_SET, 0xd0000024, 'rp2040js OE_SET moved');
        assert.equal(anchor.OUT_CLR, 0xd0000018, 'rp2040js OUT_CLR moved');
        // funcsel: emitter uses BW_IOBANK0_CTRL(n)=0x40014004+n*8; anchor agrees.
        assert.match(src, /#define BW_IOBANK0_CTRL\(n\)\s+BW_MMIO\(0x40014004u \+ \(uint32_t\)\(n\) \* 8u\)/);
        assert.equal(anchor.ctrl(25), 0x40014004 + 25 * 8, 'IO_BANK0 GPIO25_CTRL address disagrees');
        // and the C-intent addresses we parse are the anchored ones
        const pins = cIntent(src, anchor);
        assert.equal(pins[25].funcselAddr, anchor.ctrl(25));
        assert.equal(pins[25].latch[0].addr, anchor.OUT_CLR, 'GP25 first latch op (setup) is not OUT_CLR');
    });

test('P3: C and MicroPython drive the same GPIO direction and latch, per pin',
    {skip: SKIP}, async () => {
        const anchor = rp2040jsGpioMap();
        const SB = await sb3();
        const cc = new SB(); cc.parse(PROGRAM);
        const cPins = cIntent(cc.generateC(), anchor);

        const mc = new SB(); mc.parse(PROGRAM);
        const mp = mc.generateMicroPython();
        assert.ok(mp.ok && mp.py, `generateMicroPython refused: ${JSON.stringify(mp.reasons)}`);
        const edges = await runMicroPython(mp.py);

        // OUTPUT pin GP25: both must make it a driven output, drive it high, end low.
        assert.deepEqual(mpyState(edges, 25), cState(cPins[25]),
            `GP25 (led): MicroPython runtime disagrees with the C intent — `
            + `C ${JSON.stringify(cState(cPins[25]))}, MP ${JSON.stringify(mpyState(edges, 25))}`);
        assert.equal(cState(cPins[25]).direction, 'output', 'GP25 should be an output in the C intent');

        // INPUT pin GP14: both must configure it as an input (no OE / no drive).
        assert.equal(cState(cPins[14]).direction, 'input', 'GP14 (btn) should be an input in the C intent');
        assert.equal(mpyState(edges, 14).direction, 'input',
            `GP14 (btn): MicroPython did not configure it as an input — edges ${JSON.stringify(edges.filter(e => e.name === 'GP14'))}`);
    });
