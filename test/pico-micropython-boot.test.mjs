/**
 * MicroPython on the emulated Pico, end to end.
 *
 * The claim under test is not "the bootrom assembles" — test/rp2040-bootrom
 * already holds that — but the only claim a user cares about: a real
 * MicroPython firmware, unmodified, boots inside rp2040js behind the
 * clean-room ROM and answers over the raw REPL that `pico-repl.js` speaks.
 *
 * WHY THIS FILE EXISTS AS A GATE AND NOT JUST A SCRIPT. The bootrom's header
 * carried, for months, a confident and WRONG account of a boot failure:
 * "panics at step ~26,600", blamed on a hardware spinlock and then on the
 * clock tree. It was neither. The earlier probe entered the image at its own
 * vector table instead of at 0x10000000, which skips boot stage 2, and stage
 * 2 is what sets VTOR. Nothing was broken. A single measurement, made once by
 * hand and written into a comment, cost a session. This runs it every time.
 *
 * SKIPPING IS LOUD ON PURPOSE. The firmware is 650 KB and is not in git, so
 * these tests skip unless it has been fetched. A silent skip is how a gate
 * becomes decoration — so the reason goes to stderr at load, once, naming the
 * exact command that makes it run.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {
    ensureFirmware, parseUF2, createPicoMachine, CACHED_UF2, FIRMWARE
} from '../scripts/probe-pico-micropython.mjs';
import {ROM_FUNC} from '../overlay/scratch-gui/src/lib/bw-board/rp2040-bootrom.js';

const SKIP = !existsSync(join(INTEGRATED, 'node_modules', 'rp2040js'))
    ? 'needs rp2040js from the integrated tree (npm run integrate, then npm install in packages/scratch-gui)'
    : !existsSync(CACHED_UF2)
        ? `needs ${FIRMWARE.file} — run \`node scripts/probe-pico-micropython.mjs\` once ` +
          'to fetch it into artifacts/ (650 KB, sha256-pinned, gitignored)'
        : false;

if (SKIP) {
    process.stderr.write(
        `[bw gate] pico-micropython-boot: SKIPPING 4 tests — ${SKIP}\n`);
}

/** One boot, shared by the tests that only need a live REPL. */
let booted = null;
const bootOnce = () => {
    if (!booted) {
        booted = (async () => {
            const {image} = parseUF2(await ensureFirmware({offline: true, quiet: true}));
            const m = await createPicoMachine(image, {entry: 'flash'});
            const {state} = m;
            // USB enumeration, not the banner: MicroPython writes its banner
            // when the REPL starts and stdio DROPS every byte until CDC
            // reports DTR, so on this machine the banner is simply gone.
            const enumerated = m.run(() => state.usbConnected, 3_000_000);
            m.run(null, 200_000);
            await m.transport.write('\r\n');
            const prompted = m.run(() => state.usb.includes('>>> '), 3_000_000);
            return {m, enumerated, prompted};
        })();
    }
    return booted;
};

test('MicroPython enumerates as a USB CDC device and gives a REPL prompt', {skip: SKIP}, async () => {
    const {m, enumerated, prompted} = await bootOnce();
    assert.equal(enumerated, 'done',
        `USB never enumerated (${enumerated}) — stopped at PC 0x${m.core.PC.toString(16)}`);
    assert.equal(prompted, 'done',
        `no ">>> " after a newline — got ${JSON.stringify(m.state.usb.slice(-120))}`);
    // Stage 2 sets VTOR to the image's vector table, and runtime_init then
    // moves it into SRAM. VTOR left at 0 is the exact fault that produced the
    // panic this file's header describes, so it is worth naming.
    assert.equal(m.core.VTOR, 0x20000000,
        'VTOR is not the RAM vector table: boot stage 2 or runtime_init did not run');
});

test('the raw REPL protocol in pico-repl.js drives the emulated device', {skip: SKIP}, async () => {
    const {m} = await bootOnce();
    const {createPicoRepl} = await import(
        pathToFileURL(join(INTEGRATED, 'src/lib/pico-repl.js')).href);
    // The transport's reads drive the CPU, so there is no wall clock to wait
    // on; the timeout only has to outlast the emulator, not the device.
    const repl = createPicoRepl(m.transport, {timeoutMs: 600_000});
    await repl.enterRaw();
    assert.equal(await repl.exec('print(1+1)'), '2\r\n');
    const ident = await repl.exec('import sys\nprint(sys.implementation)');
    assert.match(ident, /'micropython'/);
    assert.match(ident, /1, 22, 2/, `firmware is not ${FIRMWARE.version}: ${ident}`);
    assert.match(ident, /Raspberry Pi Pico with RP2040/);
});

/**
 * The filesystem is a separate claim from the REPL, and it is the one that
 * decides whether `picoRepl.deployMainPy()` can work at all: MicroPython's
 * block device programs flash through `rom_func_lookup('RP')`, and a table
 * that does not answer sends the call to address 0.
 *
 * Asserted as a CONSISTENCY, not as a fixed expectation, because the fix
 * lives in bw-board (docs/bw-board-rp2040-bootrom-flash-funcs.patch) and
 * arrives here through `npm run sync:bwboard`. Whichever side of that sync
 * this runs on, a mismatch is a real failure.
 */
test('the flash ROM functions decide whether the filesystem works', {skip: SKIP}, async () => {
    const {m} = await bootOnce();
    const {createPicoRepl} = await import(
        pathToFileURL(join(INTEGRATED, 'src/lib/pico-repl.js')).href);
    const repl = createPicoRepl(m.transport, {timeoutMs: 600_000});
    await repl.enterRaw();

    const hasFlashFuncs = Boolean(ROM_FUNC.FLASH_RANGE_PROGRAM && ROM_FUNC.FLASH_RANGE_ERASE);
    let result;
    try {
        result = await repl.exec(
            'import os\nf=open("bw-gate.txt","w");f.write("ok");f.close()\n' +
            'print(os.statvfs("/")[0], open("bw-gate.txt").read())');
    } catch (err) {
        result = `ERROR ${err.message}`;
    }

    if (hasFlashFuncs) {
        assert.match(result, /^4096 ok/,
            `the ROM answers 'RE'/'RP' but the filesystem still fails: ${result}`);
    } else {
        assert.match(result, /ENODEV/,
            'the ROM has no flash functions, so writing a file should be ENODEV — ' +
            `instead: ${result}. If the bw-board patch landed, ROM_FUNC lost its entries.`);
    }
});

/**
 * The historical panic, kept as a test because it is the only thing that
 * stops the wrong explanation being rediscovered. Entering at the image's
 * reset vector skips stage 2, VTOR stays 0, `runtime_init` copies the RAM
 * vector table out of the BOOTROM, and `irq_set_exclusive_handler` fails
 *
 *     hard_assert(current == __unhandled_user_irq || current == handler)
 *
 * Addresses are firmware-specific and the firmware is pinned by sha256.
 */
test('entering past boot stage 2 reproduces the vector-table hard_assert', {skip: SKIP}, async () => {
    const {image} = parseUF2(await ensureFirmware({offline: true, quiet: true}));
    const m = await createPicoMachine(image, {entry: 'vector'});
    const HARD_ASSERTION_FAILURE = 0x10030f04;
    const reached = m.run(() => m.core.PC === HARD_ASSERTION_FAILURE, 200_000);
    assert.equal(reached, 'done',
        `expected hard_assertion_failure, stopped at PC 0x${m.core.PC.toString(16)} (${reached})`);

    // r0 is irq_get_vtable_handler(num): 0, because ram_vector_table was
    // copied from the bootrom image instead of from flash.
    assert.equal(m.core.registers[0] >>> 0, 0, 'the current handler is not the bootrom zero');
    // r2 is spin_lock_instance(PICO_SPINLOCK_ID_IRQ) = SIO + 0x100 + 9*4.
    assert.equal(m.core.registers[2] >>> 0, 0xd0000124, 'not the IRQ spinlock (9)');
    // r3 is __unhandled_user_irq, the value the assert wanted to see.
    assert.equal(m.core.registers[3] >>> 0, 0x100001cd, 'not __unhandled_user_irq');
    // And the good boot puts exactly that value in the same slot.
    assert.equal(m.core.LR >>> 0, 0x1002dcf9,
        'the caller is not irq_set_exclusive_handler at 0x1002dccc');
});
