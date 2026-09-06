#!/usr/bin/env node
/**
 * A developer instrument, NOT a CI gate: boot Kaluma (Apache-2.0 JavaScript for
 * the RP2040) inside rp2040js behind this repo's clean-room bootrom, and report
 * exactly where it gets to — the JS counterpart of
 * scripts/probe-pico-micropython.mjs, reusing its boot harness verbatim.
 *
 * THE QUESTION (plan N5): does Kaluma boot in rp2040js the way MicroPython does,
 * and does its REPL let the same run-live seam (pico-repl.js's transport) drive
 * a blink — GP25 high — the way the Pico ▶ Run does for Python?
 *
 * WHAT IT DOES NOT DO. It does not assert. It boots, reports, and — with
 * --blink — sends a line of Kaluma JS and says whether GP25 went high. The
 * caller reads the report; docs/PICO-KALUMA-BOOT.md records the finding.
 *
 * THE FIRMWARE IS NOT IN THE REPO. Kaluma is Apache-2.0, but a ~1 MB binary in
 * git to serve one diagnostic is a bad trade (same call as the MicroPython
 * probe). It is fetched into artifacts/ (gitignored) and pinned by sha256.
 *
 * Usage:
 *   node scripts/probe-pico-kaluma.mjs                 # boot, report, dump CDC
 *   node scripts/probe-pico-kaluma.mjs --blink         # + drive GP25 high
 *   node scripts/probe-pico-kaluma.mjs --steps 4000000
 *   node scripts/probe-pico-kaluma.mjs --offline       # never fetch
 */
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { parseUF2, createPicoMachine, hex, INTEGRATED } from './probe-pico-micropython.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FLASH_BASE = 0x10000000;

/** Pinned build: the newest Kaluma release that still ships an RP2040 (original
 *  Pico) image. 1.3.0+ dropped it and ship only pico2 (RP2350), which rp2040js
 *  does not emulate. */
export const FIRMWARE = {
    version: '1.2.1',
    board: 'rp2-pico (RP2040)',
    file: 'kaluma-rp2-pico-1.2.1.uf2',
    url: 'https://github.com/kaluma-project/kaluma/releases/download/1.2.1/kaluma-rp2-pico-1.2.1.uf2',
    sha256: '74fde251f1de7153bc16488e15515e2d86e47652f66d86dc589e92b8f54e15ea',
    bytes: 1011712
};
const CACHE_DIR = path.join(ROOT, 'artifacts', 'pico-kaluma');
const CACHED_UF2 = path.join(CACHE_DIR, FIRMWARE.file);

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

async function ensureFirmware (opts = {}) {
    if (fs.existsSync(CACHED_UF2)) {
        const buf = fs.readFileSync(CACHED_UF2);
        const got = sha256(buf);
        if (got === FIRMWARE.sha256) return new Uint8Array(buf);
        throw new Error(`cached ${FIRMWARE.file} has sha256 ${got}, expected ${FIRMWARE.sha256} — delete it and re-run`);
    }
    if (opts.offline) throw new Error(`${CACHED_UF2} is not cached and --offline was given`);
    console.log(`fetching ${FIRMWARE.url}`);
    const res = await fetch(FIRMWARE.url);
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== FIRMWARE.sha256) throw new Error(`downloaded sha256 ${got}, expected ${FIRMWARE.sha256} — refusing to cache`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHED_UF2, buf);
    console.log(`cached ${CACHED_UF2} (${buf.length} bytes)`);
    return new Uint8Array(buf);
}

const indent = s => s.split('\n').map(l => '  | ' + l.replace(/\r/g, '')).join('\n');

function parseArgs (argv) {
    const a = { steps: 4_000_000, eval: false, blink: false, offline: false };
    for (let i = 0; i < argv.length; i++) {
        const v = argv[i];
        if (v === '--steps') a.steps = Number(argv[++i]);
        else if (v === '--eval') a.eval = true;
        else if (v === '--blink') { a.blink = true; a.eval = true; }
        else if (v === '--offline') a.offline = true;
        else if (v === '--help' || v === '-h') a.help = true;
        else throw new Error(`unknown argument ${v}`);
    }
    return a;
}

/**
 * Kaluma's REPL is a full ANSI line editor: on every line it emits a
 * cursor-position query (ESC[6n, DSR) and BLOCKS until the terminal answers
 * with a position report. A dumb pipe never answers, so the editor stalls and
 * the line is echoed but never evaluated. Pump the machine in slices and, the
 * moment a DSR appears, write back a position report — then the editor
 * proceeds and `\r` evaluates the line. This is the ONE extra thing Kaluma's
 * REPL needs over MicroPython's raw REPL.
 * @returns {Promise<string>} everything the device emitted during the window
 */
async function pumpAnsweringDsr (m, budget) {
    let seen = '';
    const slice = 150_000;
    for (let used = 0; used < budget; used += slice) {
        m.run(null, slice);
        const chunk = await m.transport.read();
        if (chunk) {
            seen += chunk;
            if (/\x1b\[6n/.test(chunk)) await m.transport.write('\x1b[1;1R');
        }
    }
    return seen;
}

/** Send one REPL line and return the reply, DSR answered. */
async function evalLine (m, text, budget = 2_000_000) {
    await m.transport.write(text + '\r');
    return pumpAnsweringDsr(m, budget);
}

async function main () {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log('see the header of this file'); return; }

    const uf2 = await ensureFirmware(args);
    const { blocks, base, image } = parseUF2(uf2);
    if (base !== FLASH_BASE) throw new Error(`image base ${hex(base)} is not flash`);
    console.log(`firmware      ${FIRMWARE.file}  (${FIRMWARE.board} ${FIRMWARE.version})`);
    console.log(`              sha256 ${FIRMWARE.sha256}`);
    console.log(`image         ${blocks} UF2 blocks, ${image.length} bytes at ${hex(base)}..${hex(base + image.length)}`);

    const { GPIOPinState } = await import(
        pathToFileURL(path.join(INTEGRATED, 'node_modules/rp2040js/dist/esm/index.js')).href);

    const m = await createPicoMachine(image, { entry: 'flash', readBudget: 3_000_000 });
    const { core, state, rp2040 } = m;

    // Watch the onboard LED (GP25) directly at the pin, independent of the
    // adapter's board bridge: the blink claim is "the MCU drove GP25 high".
    let gp25 = 'unknown';
    const gp25High = () => gp25 === GPIOPinState.High;
    rp2040.gpio[25].addListener(s => { gp25 = s; });

    const t0 = Date.now();
    let outcome = m.run(() => state.usbConnected, args.steps);
    const enumSteps = state.steps;
    if (outcome === 'done') {
        outcome = `USB CDC enumerated at instruction ${enumSteps}`;
        m.run(null, 200_000);                 // let the device settle
        await m.transport.write('\r\n');       // knock, as a terminal does on attach
        // Kaluma prints a '>' prompt over CDC. We look for the prompt
        // character, not a version banner (same lesson as MicroPython — the
        // banner may be written before the host enumerates).
        m.run(() => />/.test(state.usb), 2_500_000);
        if (/>/.test(state.usb)) outcome = 'reached a Kaluma REPL prompt';
    }
    const promptSteps = state.steps;
    const bootMs = Date.now() - t0;

    console.log('');
    console.log(`instructions  enumerate=${enumSteps}  prompt=${promptSteps}`);
    console.log(`outcome       ${outcome}`);
    console.log(`PC            ${hex(core.PC)}    SP ${hex(core.SP)}    LR ${hex(core.LR)}`);
    console.log(`VTOR          ${hex(core.VTOR)}   waiting=${core.waiting}`);
    console.log(`sim time      ${(rp2040.clock.nanos / 1e6).toFixed(3)} ms (${(state.idleNanos / 1e6).toFixed(3)} ms WFE)`);
    console.log(`USB CDC       ${state.usbConnected ? 'enumerated + DTR set' : 'NOT enumerated'}`);
    console.log(`boot          ${bootMs} ms wall clock`);
    console.log('CDC output so far:');
    console.log(state.usb ? indent(state.usb) : '  (none)');

    if (args.eval && />/.test(state.usb)) {
        // Prove the run-live seam carries JavaScript: answer the DSR, then a
        // pure-compute INTEGER expression must come back evaluated.
        console.log('');
        const clean = s => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b./g, '').replace(/[\r\n]+/g, ' ');
        const r1 = clean(await evalLine(m, '1+1'));
        const got2 = /1\+1\s+2\b/.test(r1);
        console.log(`--eval: 1+1     -> ${got2 ? 'REPL answered 2 (live integer JS works)' : `unexpected: ${r1.slice(0, 40)}`}`);
        // The SAME REPL, a FLOAT expression: it answers 0, not 3.5, because the
        // RP2040 ROM soft-float table ('SF') this clean-room bootrom does not
        // provide came back null. This is the N5-1 root cause, visible without
        // the disassembler — and the reason pinMode (which converts its numeric
        // arg through that broken soft-float) hangs. See docs/PICO-KALUMA-BOOT.md §2.
        const rf = clean(await evalLine(m, '2.5+1.0'));
        const zero = /2\.5\+1\.0\s+0\b/.test(rf);
        console.log(`--eval: 2.5+1.0 -> ${zero ? 'REPL answered 0, not 3.5 — ROM soft-float is broken (null SF table)' : rf.slice(0, 40)}`);
    }

    if (args.blink) {
        // The blink is where it stops. Kaluma is Arduino-flavoured
        // (pinMode/digitalWrite are globals; board.LED === 25), but the FIRST
        // GPIO call busy-loops in the clean-room boot ROM's rom_table_lookup
        // (0x100) — called by 0x1000463f with a garbage table/code — and never
        // returns. We bound it and report the busy-loop, not wait forever.
        console.log('');
        console.log('--blink: sending `pinMode(25, OUTPUT); digitalWrite(25, HIGH);`');
        const s0 = state.steps, i0 = state.idleNanos;
        await m.transport.write('pinMode(25, OUTPUT); digitalWrite(25, HIGH);\r');
        m.run(() => gp25High(), 40_000_000);   // bounded; it will not finish
        const spun = state.steps - s0, wfe = (state.idleNanos - i0) / 1e6;
        console.log(`GP25          ${gp25High() ? 'HIGH — the MCU drove the LED'
            : `NOT driven (pin state=${String(gp25)}; 0=Low 1=High 2=Input)`}`);
        console.log(`after blink   ${spun} instructions, ${wfe.toFixed(3)} ms WFE, PC ${hex(core.PC)}`);
        console.log(`              ${wfe < 1 && !gp25High()
            ? 'busy loop, no sleep — pinMode never returns (see docs/PICO-KALUMA-BOOT.md §2)'
            : ''}`);
    }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    main().catch(err => { console.error(String((err && err.stack) || err)); process.exit(1); });
}
