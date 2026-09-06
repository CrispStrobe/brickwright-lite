/**
 * MicroPython drives the simulated board's GPIO (N3c) — the end of the chain a
 * learner actually sees.
 *
 * The Pico ▶ Run in the simulator boots MicroPython in rp2040js and runs the
 * program over the raw REPL `pico-repl.js` speaks; the point of it is the LED.
 * This asserts the last link: a program that drives GP25 (the onboard LED)
 * makes the adapter publish a pin edge to the board — the SAME
 * `board.setPin(name, mode, driveHigh)` contract the AVR and 8051 adapters use,
 * so the existing GPIO→board→ledBrightness→canvas chain lights up unchanged.
 *
 * MECHANISM: the sim RUNS LIVE — `createPicoRepl(...).exec(py)` — rather than
 * INSTALLS AND REBOOTS (`deployMainPy`, write main.py + machine.reset()). The
 * two are one abstraction at the level a learner sees (one createPicoRepl, one
 * raw-REPL protocol, one transport); the seam that differs is PERSISTENCE. The
 * sim cannot install-and-reboot because machine.reset() does not reboot
 * rp2040js today — a measured bw-board adapter gap, written up as finding N3c-1
 * in docs/PICO-SIM-RUN-FINDINGS.md (step count + probe). Silicon keeps
 * install-and-reboot; when the emulator models reset the seam collapses.
 *
 * Skips BY NAME without the integrated tree + firmware, same contract as
 * pico-micropython-boot.test.mjs (loud skip, exact command named).
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

const SKIP = !existsSync(join(INTEGRATED, 'node_modules', 'rp2040js'))
    ? 'needs rp2040js from the integrated tree (npm run integrate, then npm install in packages/scratch-gui)'
    : !existsSync(CACHED_UF2)
        ? `needs ${FIRMWARE.file} — run \`npm run sync:picomicropython\` once to fetch it ` +
          '(650 KB, sha256-pinned, gitignored)'
        : false;

if (SKIP) {
    process.stderr.write(`[bw gate] pico-micropython-gpio: SKIPPING 1 test — ${SKIP}\n`);
}

/** A board that records every pin edge — the adapter's boundary-A contract. */
function mockBoard () {
    const edges = [];
    return {
        edges,
        setPin (name, mode, high) { edges.push({name, mode, high}); },
        advanceTo () {},
        readPin () { return 0; },
        readAnalog () { return 0; }
    };
}

/** Boot MicroPython with a board attached, up to USB enumeration. The REPL
 *  handshake (prompt/raw/OK) is startProgramOnRepl's job — the SAME one the
 *  browser seam uses — so it is not duplicated here. */
async function bootWithBoard () {
    const {image} = parseUF2(await ensureFirmware({offline: true, quiet: true}));
    const m = await createPicoMachine(image, {entry: 'flash'});
    const board = mockBoard();
    m.adapter.attachBoard(board);
    assert.equal(m.run(() => m.state.usbConnected, 3_000_000), 'done',
        `USB never enumerated — stopped at PC 0x${m.core.PC.toString(16)}`);
    return {m, board};
}

test('a MicroPython program that drives GP25 toggles the simulated pin', {skip: SKIP}, async () => {
    const {m, board} = await bootWithBoard();
    // The SHARED handshake, byte-for-byte what the browser sim seam runs: wait
    // for the prompt, enter RAW mode, send, wait for OK. If the seam ever
    // diverges from this again, the friendly-REPL echo bug (a multi-line def
    // typed into a friendly REPL runs nothing) comes back — and this oracle
    // catches it, because it drives the identical code.
    const {startProgramOnRepl} = await import(
        pathToFileURL(join(INTEGRATED, 'src/lib/pico-repl.js')).href);

    const gp25 = () => board.edges.filter(e => e.name === 'GP25');
    assert.ok(!gp25().some(e => e.high), 'GP25 was already driven high before the program ran');

    const repl = await startProgramOnRepl(m.transport,
        'from machine import Pin\nled = Pin(25, Pin.OUT)\nled.on()', {timeoutMs: 600_000});
    // execStart returns at the OK ack, BEFORE the statement runs; drive until the
    // pin moves (in the browser the rAF pump does this continuously). The
    // condition-drive is what makes the oracle robust to how many instructions
    // led.on() takes after the ack.
    m.run(() => gp25().some(e => e.high), 3_000_000);
    assert.ok(gp25().some(e => e.mode === 'pushpull' && e.high),
        `led.on() did not drive GP25 high — GP25 edges: ${JSON.stringify(gp25())}`);

    // And low again: proves a real toggle observed on the board, not a stuck
    // default. The raw REPL stays entered, so a further statement is execStart —
    // no re-handshake — the exact primitive the seam would use for a next line.
    await repl.execStart('led.off()');
    m.run(() => { const e = gp25().at(-1); return e && !e.high; }, 3_000_000);
    const last = gp25().at(-1);
    assert.ok(last && last.mode === 'pushpull' && !last.high,
        `led.off() did not drive GP25 low — last GP25 edge: ${JSON.stringify(last)}`);
});
