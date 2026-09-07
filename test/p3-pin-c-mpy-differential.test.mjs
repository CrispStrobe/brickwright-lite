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
 * WHAT IS EXECUTED. BOTH sides now run on rp2040js and are observed at the same
 * board boundary (`board.setPin(name, mode, high)` — mode = direction, high =
 * latch). The MicroPython side is the sim's live raw-REPL run. The C side is
 * generateC's Pico output COMPILED by arm-none-eabi-gcc into a Cortex-M0+ image
 * and run through the same boot harness (N11a / Door 1 — the emitted C is
 * freestanding, only `<stdint.h>` + raw MMIO; see scripts/build-pico-c-image.mjs
 * and scripts/sync-arm-toolchain.mjs). So a wrong emitter mask shows up as the
 * WRONG PIN MOVING at runtime, not a mismatched regex — the mutation test proves
 * exactly that. The executed-C legs SKIP BY NAME without arm-none-eabi-gcc.
 *
 * The STATIC anchor is kept as well: every SIO / IO_BANK0 address the C names is
 * asserted equal to the address rp2040js's own SIO peripheral decodes (read from
 * rp2040js, not a table of ours). It needs no toolchain, so it runs everywhere
 * and the C side is never left with no gate at all.
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
import {buildPicoCImage} from '../scripts/build-pico-c-image.mjs';
import {armGccPath} from '../scripts/sync-arm-toolchain.mjs';

const NO_TREE = !existsSync(join(INTEGRATED, 'node_modules', 'rp2040js'))
    ? 'needs rp2040js from the integrated tree (npm run integrate, then npm install in packages/scratch-gui)'
    : false;
const NO_FIRMWARE = !existsSync(CACHED_UF2)
    ? `needs ${FIRMWARE.file} — run \`npm run sync:picomicropython\` once to fetch it (650 KB, sha256-pinned, gitignored)`
    : false;
const NO_ARM = !armGccPath()
    ? 'needs arm-none-eabi-gcc for the EXECUTED C side (box gcc, or the CI-fetched sha-pinned 13.2.rel1 — scripts/sync-arm-toolchain.mjs)'
    : false;

// The MicroPython side needs the sim firmware; the anchor/parse tests need only
// the tree. The EXECUTED-C side (N11a) needs arm-none-eabi-gcc but NOT firmware,
// so its COMPILE+RUN+mutation gate runs in CI on the tree+toolchain alone (the
// firmware is browser-job-only) — the executed C is never left with no CI gate.
const SKIP = NO_TREE || NO_FIRMWARE;                 // MicroPython legs (anchor's peer + differential)
const SKIP_C = SKIP || NO_ARM;                       // executed differential: C vs MicroPython
const SKIP_C_ONLY = NO_TREE || NO_ARM;               // executed C alone (no MicroPython): compile+run+mutation
if (SKIP) process.stderr.write(`[bw gate] p3-pin-c-mpy-differential: MicroPython legs SKIPPING — ${SKIP}\n`);
if (SKIP_C_ONLY) process.stderr.write(`[bw gate] p3-pin-c-mpy-differential: executed-C legs SKIPPING — ${SKIP_C_ONLY}\n`);

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

// ---- the C side, EXECUTED (N11a) --------------------------------------------
/** Compile generateC's Pico output with arm-none-eabi-gcc, pack it as a UF2, and
 *  run it on rp2040js through the SAME boot harness the MicroPython firmware uses
 *  (parseUF2 → createPicoMachine). `entry: 'vector'` jumps at the image's boot
 *  vector, so the clean-room bootrom is never touched (a freestanding pin program
 *  makes no ROM calls) — an oracle for the emitted C's GPIO logic. Drives until
 *  GP`watch` has toggled both ways; the caller reads the board edges. */
async function runC (cSource, watch = 25) {
    const {uf2} = buildPicoCImage(cSource, {gcc: armGccPath()});
    const {image} = parseUF2(uf2);
    const m = await createPicoMachine(image, {entry: 'vector'});
    const board = mockBoard();
    m.adapter.attachBoard(board);
    const g = () => board.edges.filter(e => e.name === `GP${watch}`);
    m.run(() => g().some(e => e.high) && g().at(-1) && !g().at(-1).high, 4_000_000);
    return board.edges;
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

test('P3: C and MicroPython drive the same GPIO — BOTH EXECUTED on rp2040js (N11a)',
    {skip: SKIP_C}, async () => {
        const SB = await sb3();
        const cc = new SB(); cc.parse(PROGRAM);
        const cEdges = await runC(cc.generateC());          // compiled + run, not parsed

        const mc = new SB(); mc.parse(PROGRAM);
        const mp = mc.generateMicroPython();
        assert.ok(mp.ok && mp.py, `generateMicroPython refused: ${JSON.stringify(mp.reasons)}`);
        const mpyEdges = await runMicroPython(mp.py);

        // Both routes now RUN at the same board boundary, so N11 closes: a wrong
        // emitter mask shows up as the wrong pin MOVING, not a mismatched regex.
        assert.deepEqual(mpyState(cEdges, 25), mpyState(mpyEdges, 25),
            `GP25 (led): compiled-C runtime disagrees with MicroPython runtime — `
            + `C ${JSON.stringify(mpyState(cEdges, 25))}, MP ${JSON.stringify(mpyState(mpyEdges, 25))}`);
        assert.equal(mpyState(cEdges, 25).direction, 'output', 'GP25 should be a driven output when the C runs');
        assert.equal(mpyState(cEdges, 25).wentHigh, true, 'GP25 should be driven high when the C runs');
        assert.equal(mpyState(cEdges, 25).finalLatch, false, 'GP25 should end low when the C runs');

        assert.deepEqual(mpyState(cEdges, 14), mpyState(mpyEdges, 14),
            `GP14 (btn): compiled-C runtime disagrees with MicroPython runtime — `
            + `C ${JSON.stringify(mpyState(cEdges, 14))}, MP ${JSON.stringify(mpyState(mpyEdges, 14))}`);
        assert.equal(mpyState(cEdges, 14).direction, 'input', 'GP14 should be an input when the C runs');
    });

test('P3 mutation: a flipped output mask in the emitted C stops driving GP25 — the runtime differential reddens (N11a)',
    {skip: SKIP_C_ONLY}, async () => {
        const SB = await sb3();
        const c = new SB(); c.parse(PROGRAM);
        const src = c.generateC();
        // Exactly a wrong emitter: flip the GP25 SIO output mask to GP24. The
        // OE/OUT bits now drive bit 24 while the funcsel still routes GP25, so GP25
        // never leaves its reset default — the RUNTIME differential must catch what
        // a parse of still-matching regexes could not.
        const mutated = src.replace(/\(1UL << 25\)/g, '(1UL << 24)');
        assert.notEqual(mutated, src, 'the mask substitution changed nothing — the emitter shape moved, update this mutation');

        const healthy = mpyState(await runC(src, 25), 25);       // GP25 driven high→low
        const broken = mpyState(await runC(mutated, 25), 25);    // GP25 no longer driven

        assert.equal(healthy.direction, 'output', 'sanity: the unmutated C drives GP25 as an output');
        assert.notDeepEqual(broken, healthy,
            `the flipped mask left GP25's runtime state identical to the healthy program — the executed `
            + `differential would not catch it: ${JSON.stringify(broken)}`);
        assert.notEqual(broken.direction, 'output',
            `GP25 is still a driven output after the mask flip: ${JSON.stringify(broken)}`);
    });
