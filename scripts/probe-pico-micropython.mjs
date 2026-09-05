#!/usr/bin/env node
/**
 * A developer instrument, NOT a CI gate: boot MicroPython for the Raspberry
 * Pi Pico inside rp2040js through this repo's clean-room bootrom, and report
 * exactly where it gets to.
 *
 * WHY IT EXISTS. `overlay/scratch-gui/src/lib/bw-board/rp2040-bootrom.js`
 * recorded a panic at step ~26,600 with a call chain of raw addresses and no
 * symbols. Every claim in that header was a measurement someone made once by
 * hand, and one of them turned out to be an artefact of how the image was
 * entered (see docs/PICO-MICROPYTHON-BOOT.md). This script makes the
 * measurement repeatable, so the next person changes one thing and watches
 * the number move instead of re-deriving it.
 *
 * WHAT IT DOES NOT DO. It does not assert. A boot that dies at step 26,600
 * and a boot that reaches the REPL both exit 0 with a report; the caller
 * reads it. `test/pico-micropython-boot.test.mjs` is where pass/fail lives.
 *
 * THE FIRMWARE IS NOT IN THE REPO. MicroPython is MIT, so it *could* be
 * vendored, but a 650 KB binary blob in git to serve one diagnostic is a bad
 * trade. It is fetched into `artifacts/` (gitignored) and pinned by sha256.
 *
 * Usage:
 *   node scripts/probe-pico-micropython.mjs                  # boot, report
 *   node scripts/probe-pico-micropython.mjs --repl           # + print(1+1)
 *   node scripts/probe-pico-micropython.mjs --entry vector   # skip stage 2
 *   node scripts/probe-pico-micropython.mjs --steps 3000000
 *   node scripts/probe-pico-micropython.mjs --trace-bl       # call chain
 *   node scripts/probe-pico-micropython.mjs --offline        # never fetch
 */

import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where `rp2040js` resolves: the INTEGRATED tree, same rule as
 * test/helpers/bw-integrated.mjs. The repo root has no node_modules, and
 * `overlay/` is source-of-truth-in-git rather than something you can import
 * a dependency from — so the emulator has to come from
 * `packages/scratch-gui`, or from wherever BW_INTEGRATED_ROOT points.
 */
export const INTEGRATED = process.env.BW_INTEGRATED_ROOT
    ? path.resolve(process.env.BW_INTEGRATED_ROOT)
    : path.join(ROOT, 'packages', 'scratch-gui');

/** Pinned build: MicroPython v1.22.2, the official RPI_PICO release artefact. */
export const FIRMWARE = {
    version: 'v1.22.2',
    board: 'RPI_PICO',
    file: 'RPI_PICO-20240222-v1.22.2.uf2',
    url: 'https://micropython.org/resources/firmware/RPI_PICO-20240222-v1.22.2.uf2',
    sha256: 'e92c2a253d2d4830d56cd6aebae1bbc6c913f413122dabba3cc2de74b984bba9',
    bytes: 650240
};

export const CACHE_DIR = path.join(ROOT, 'artifacts', 'pico-micropython');
export const CACHED_UF2 = path.join(CACHE_DIR, FIRMWARE.file);

/** Where the real boot ROM leaves SP before handing off (datasheet §2.8.1.1). */
const BOOT_SP = 0x20042000;
const FLASH_BASE = 0x10000000;
/** Stage 2 occupies the first 256 bytes; the image's own vector table follows. */
const VECTOR_TABLE = 0x10000100;

// ── firmware ────────────────────────────────────────────────────────────────

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

/**
 * Return the cached UF2's bytes, fetching them once if absent.
 * @param {{offline?: boolean, quiet?: boolean}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function ensureFirmware (opts = {}) {
    if (fs.existsSync(CACHED_UF2)) {
        const buf = fs.readFileSync(CACHED_UF2);
        const got = sha256(buf);
        if (got === FIRMWARE.sha256) return new Uint8Array(buf);
        throw new Error(
            `cached ${FIRMWARE.file} has sha256 ${got}, expected ${FIRMWARE.sha256} — delete it and re-run`
        );
    }
    if (opts.offline) throw new Error(`${CACHED_UF2} is not cached and --offline was given`);
    if (!opts.quiet) console.log(`fetching ${FIRMWARE.url}`);
    const res = await fetch(FIRMWARE.url);
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== FIRMWARE.sha256) {
        throw new Error(`downloaded sha256 ${got}, expected ${FIRMWARE.sha256} — refusing to cache`);
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHED_UF2, buf);
    if (!opts.quiet) console.log(`cached ${CACHED_UF2} (${buf.length} bytes)`);
    return new Uint8Array(buf);
}

/**
 * Flatten a UF2 into one contiguous image. The format is 512-byte blocks
 * carrying at most 476 payload bytes each plus their own target address, so
 * a naive concatenation of the file is wrong by 36 bytes per block.
 *
 * @param {Uint8Array} uf2
 * @returns {{blocks: number, base: number, image: Uint8Array}}
 */
export function parseUF2 (uf2) {
    const view = new DataView(uf2.buffer, uf2.byteOffset, uf2.byteLength);
    const nblocks = Math.floor(uf2.length / 512);
    let base = null;
    let image = new Uint8Array(0);
    for (let i = 0; i < nblocks; i++) {
        const o = i * 512;
        if (view.getUint32(o, true) !== 0x0a324655 || view.getUint32(o + 4, true) !== 0x9e5d5157) {
            throw new Error(`UF2 block ${i} has bad magic`);
        }
        const addr = view.getUint32(o + 12, true);
        const size = view.getUint32(o + 16, true);
        if (base === null) base = addr;
        const off = addr - base;
        if (off + size > image.length) {
            const grown = new Uint8Array(off + size);
            grown.set(image);
            image = grown;
        }
        image.set(uf2.subarray(o + 32, o + 32 + size), off);
    }
    return { blocks: nblocks, base, image };
}

// ── the machine ─────────────────────────────────────────────────────────────

export const hex = n => `0x${(n >>> 0).toString(16).padStart(8, '0')}`;

/** SIO spinlock register block: SPINLOCK0..31 at 0xd0000100 (datasheet §2.3.1.4). */
const SPINLOCK0 = 0xd0000100;
const spinlockOf = addr =>
    addr >= SPINLOCK0 && addr < SPINLOCK0 + 32 * 4 && (addr & 3) === 0
        ? (addr - SPINLOCK0) >> 2
        : null;

/**
 * Boot a Pico image in rp2040js behind this repo's adapter and clean-room
 * bootrom, with a USB CDC host attached — the RPI_PICO build's REPL is on
 * USB, not on UART0, so a probe that only watches UART0 sees an empty
 * string and calls a healthy boot a failure. (It did.)
 *
 * @param {Uint8Array} image  flat flash image, starting at 0x10000000
 * @param {object} [opts]
 * @param {'flash'|'vector'} [opts.entry] 'flash' runs stage 2 first (what
 *        real silicon does); 'vector' jumps straight at the image's vector
 *        table, which is what the earlier hand probe did.
 * @param {number} [opts.blTail] how many recent BL targets to keep
 */
export async function createPicoMachine (image, opts = {}) {
    // Say WHICH thing is missing. The bare ESM resolution failure names a
    // path inside packages/scratch-gui and looks like a bug in this script.
    if (!fs.existsSync(path.join(INTEGRATED, 'node_modules', 'rp2040js'))) {
        throw new Error(
            `no rp2040js under ${INTEGRATED}. This probe drives the INTEGRATED tree: run ` +
            '`npm run vendor && npm run integrate`, then `npm install` in packages/scratch-gui, ' +
            'or point BW_INTEGRATED_ROOT at a tree that has both.');
    }
    const { createRp2040jsAdapter } = await import(
        pathToFileURL(path.join(INTEGRATED, 'src/lib/bw-board/rp2040js-adapter.js')).href);
    const { USBCDC } = await import(
        pathToFileURL(path.join(INTEGRATED, 'node_modules/rp2040js/dist/esm/index.js')).href);

    const adapter = createRp2040jsAdapter();
    const { rp2040, core } = adapter;
    rp2040.flash.set(image, 0);

    const entry = opts.entry ?? 'flash';
    if (entry === 'flash') {
        core.PC = FLASH_BASE;
    } else {
        core.PC = rp2040.readUint32(VECTOR_TABLE + 4) & ~1;
    }
    core.SP = entry === 'flash' ? BOOT_SP : rp2040.readUint32(VECTOR_TABLE);

    const state = {
        steps: 0,
        idleNanos: 0,
        /** ring of the last N BL/BLX taken */
        blRing: [],
        blAll: opts.traceBl ? [] : null,
        /** ring of the last N SIO spinlock reads */
        spinTouches: [],
        uart: '',
        usb: '',
        usbConnected: false,
        stop: null
    };

    const blTail = opts.blTail ?? 24;
    core.blTaken = () => {
        // PC is already the target; LR holds the return address and BL is a
        // 32-bit instruction, so the call site is LR-4.
        const rec = { from: (core.LR & ~1) - 4, to: core.PC, step: state.steps };
        state.blRing.push(rec);
        if (state.blRing.length > blTail) state.blRing.shift();
        if (state.blAll) state.blAll.push(rec);
    };

    const origRead = rp2040.readUint32.bind(rp2040);
    rp2040.readUint32 = addr => {
        const value = origRead(addr);
        const n = spinlockOf(addr);
        if (n !== null) {
            state.spinTouches.push({ lock: n, value: value >>> 0, step: state.steps });
            if (state.spinTouches.length > 32) state.spinTouches.shift();
        }
        return value;
    };

    adapter.onSerial(b => { state.uart += String.fromCharCode(b); });

    const cdc = new USBCDC(rp2040.usbCtrl);
    cdc.onDeviceConnected = () => { state.usbConnected = true; };
    /** Bytes the device has sent us but nobody has consumed yet. */
    let pending = '';
    cdc.onSerialData = buffer => {
        let s = '';
        for (const b of buffer) s += String.fromCharCode(b);
        state.usb += s;
        pending += s;
    };

    const cycleNanos = 1e9 / adapter.clockHz;
    const clock = rp2040.clock;

    /**
     * Run instructions until `done()` or the budget runs out.
     *
     * WFE is the subtlety. `core.waiting` is not a hang — MicroPython's
     * event loop sits in one — so waiting time is charged to the clock (which
     * is what releases the next alarm) and counted separately from
     * instructions. With no alarm pending it advances one cycle, and
     * `idleNanos` is the thing that eventually says "nothing is going to
     * happen here".
     *
     * @returns {'done'|'budget'|'idle'|string} why it stopped
     */
    function run (done, budget, idleCapNanos = 2e9) {
        const limit = state.steps + budget;
        while (state.steps < limit) {
            if (done && done()) return 'done';
            if (core.waiting) {
                const toAlarm = clock.nanosToNextAlarm;
                const dt = toAlarm > 0 ? toAlarm : cycleNanos;
                clock.tick(dt);
                state.idleNanos += dt;
                if (state.idleNanos > idleCapNanos) return 'idle';
                continue;
            }
            let cycles;
            try {
                cycles = core.executeInstruction();
            } catch (err) {
                state.stop = `exception at ${hex(core.PC)}: ${err && err.message}`;
                return state.stop;
            }
            clock.tick(cycles * cycleNanos);
            state.steps++;
        }
        return done && done() ? 'done' : 'budget';
    }

    /**
     * The Transport `pico-repl.js` speaks, bound to the emulated CDC. Reads
     * DRIVE the machine: there is no wall clock in here, so a read that
     * found nothing runs the CPU forward rather than sleeping.
     * @type {{write(t: string): Promise<void>, read(): Promise<string>}}
     */
    const transport = {
        async write (text) {
            for (const ch of text) cdc.sendSerialByte(ch.charCodeAt(0) & 0xff);
        },
        async read () {
            if (!pending) run(() => pending.length > 0, opts.readBudget ?? 3_000_000);
            const out = pending;
            pending = '';
            return out;
        }
    };

    return { adapter, rp2040, core, cdc, transport, state, run, entry };
}

// ── report ──────────────────────────────────────────────────────────────────

function dumpRegisters (core, label) {
    console.log(label);
    const regs = Array.from(core.registers).map(r => r >>> 0);
    for (let i = 0; i < 4; i++) {
        console.log('  ' + [0, 1, 2, 3].map(j => {
            const n = i * 4 + j;
            return `r${String(n).padStart(2)} ${hex(regs[n])}`;
        }).join('   '));
    }
}

function report (m, outcome, args) {
    const { core, state } = m;
    console.log('');
    console.log(`firmware      ${FIRMWARE.file}  (${FIRMWARE.board} ${FIRMWARE.version})`);
    console.log(`              sha256 ${FIRMWARE.sha256}`);
    console.log(`entry         ${m.entry}  (PC started at ${m.entry === 'flash'
        ? hex(FLASH_BASE) + ', stage 2 first'
        : 'the image vector table at ' + hex(VECTOR_TABLE)})`);
    console.log(`instructions  ${state.steps}`);
    console.log(`outcome       ${outcome}`);
    console.log(`PC            ${hex(core.PC)}    SP ${hex(core.SP)}    LR ${hex(core.LR)}`);
    console.log(`VTOR          ${hex(core.VTOR)}   waiting=${core.waiting}`);
    console.log(`sim time      ${(m.rp2040.clock.nanos / 1e6).toFixed(3)} ms ` +
        `(${(state.idleNanos / 1e6).toFixed(3)} ms of it in WFE)`);
    dumpRegisters(core, 'registers');
    console.log('');
    console.log(`USB CDC       ${state.usbConnected ? 'enumerated + DTR set' : 'NOT enumerated'}`);
    console.log('USB CDC output:');
    console.log(state.usb ? indent(state.usb) : '  (none)');
    console.log('UART0 output:');
    console.log(state.uart ? indent(state.uart) : '  (none)');
    if (args.calls) {
        console.log('');
        console.log(`last ${state.blRing.length} calls (site -> target):`);
        for (const b of state.blRing) console.log(`  ${hex(b.from)} -> ${hex(b.to)}  @${b.step}`);
    }
    if (args.spin) {
        console.log('');
        console.log('last SIO spinlock reads (lock, value returned, step):');
        for (const s of state.spinTouches) {
            console.log(`  SPINLOCK${String(s.lock).padStart(2)}  ${hex(s.value)}  @${s.step}`);
        }
    }
}

const indent = s => s.split('\n').map(l => '  | ' + l.replace(/\r/g, '')).join('\n');

// ── main ────────────────────────────────────────────────────────────────────

function parseArgs (argv) {
    const a = {
        steps: 3_000_000, entry: 'flash', repl: false, traceBl: false,
        offline: false, blTail: 24, calls: false, spin: false
    };
    for (let i = 0; i < argv.length; i++) {
        const v = argv[i];
        if (v === '--steps') a.steps = Number(argv[++i]);
        else if (v === '--entry') a.entry = argv[++i];
        else if (v === '--repl') a.repl = true;
        else if (v === '--trace-bl') { a.traceBl = true; a.calls = true; }
        else if (v === '--calls') a.calls = true;
        else if (v === '--spin') a.spin = true;
        else if (v === '--offline') a.offline = true;
        else if (v === '--bl-tail') a.blTail = Number(argv[++i]);
        else if (v === '--help' || v === '-h') a.help = true;
        else throw new Error(`unknown argument ${v}`);
    }
    if (a.entry !== 'flash' && a.entry !== 'vector') {
        throw new Error(`--entry must be flash or vector, got ${a.entry}`);
    }
    return a;
}

async function main () {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
            .split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
        return;
    }
    const uf2 = await ensureFirmware(args);
    const { blocks, base, image } = parseUF2(uf2);
    if (base !== FLASH_BASE) throw new Error(`image base ${hex(base)} is not flash`);
    console.log(`image         ${blocks} UF2 blocks, ${image.length} bytes at ` +
        `${hex(base)}..${hex(base + image.length)}`);

    const m = await createPicoMachine(image, args);
    const { state } = m;

    // Boot far enough for the emulated host to finish enumerating USB. That
    // is the milestone, NOT the banner: MicroPython writes its banner the
    // moment the REPL starts, and `mp_hal_stdout_tx_strn` drops every byte
    // until CDC reports DTR, so on a machine that enumerates a few hundred
    // thousand instructions later the banner is simply gone. A probe that
    // waited for it (this one did) reads a perfectly healthy boot as a hang.
    const t0 = Date.now();
    let outcome = m.run(() => state.usbConnected, args.steps);
    if (outcome === 'done') {
        outcome = `USB CDC enumerated at instruction ${state.steps}`;
        // Let the device settle, then knock: a bare newline is what any
        // terminal sends on attach, and the prompt that comes back is the
        // first end-to-end proof that MicroPython is running its REPL.
        m.run(null, 200_000);
        await m.transport.write('\r\n');
        if (m.run(() => state.usb.includes('>>> '), 2_000_000) === 'done') {
            outcome = 'reached the MicroPython REPL prompt';
        }
    }
    const bootMs = Date.now() - t0;

    if (args.repl && state.usb.includes('>>> ')) {
        const { createPicoRepl } = await import(
            pathToFileURL(path.join(INTEGRATED, 'src/lib/pico-repl.js')).href);
        // The timeout is wall clock and the emulator is the slow part, so it
        // has to be generous; the real bound is the per-read step budget.
        const repl = createPicoRepl(m.transport, { timeoutMs: 600_000 });
        try {
            await repl.enterRaw();
            const answer = await repl.exec('print(1+1)');
            const ident = await repl.exec('import sys\nprint(sys.implementation)');
            // The filesystem is a SEPARATE claim from the REPL, and the one
            // that decides whether deployMainPy() can work: it needs the
            // flash-programming ROM functions, which a table that only
            // answers memcpy/clz does not have. Reported, never asserted.
            let fs1;
            try {
                fs1 = await repl.exec(
                    'import os\nf=open("bw-probe.txt","w");f.write("ok");f.close()\n' +
                    'print(os.statvfs("/")[0], os.statvfs("/")[2], open("bw-probe.txt").read())'
                );
            } catch (err) {
                fs1 = `FAILED: ${err && err.message}`;
            }
            outcome = `raw REPL answered print(1+1) with ${JSON.stringify(answer)}`;
            report(m, outcome, args);
            console.log('');
            console.log(`raw REPL: print(1+1)              -> ${JSON.stringify(answer)}`);
            console.log(`raw REPL: sys.implementation      -> ${JSON.stringify(ident)}`);
            console.log(`raw REPL: flash filesystem        -> ${JSON.stringify(fs1)}`);
            console.log(`boot ${bootMs} ms wall clock, ${state.steps} instructions total`);
            return;
        } catch (err) {
            outcome = `REPL exchange failed: ${err && err.message}`;
        }
    }

    report(m, outcome, args);
    console.log('');
    console.log(`boot took ${bootMs} ms of wall clock`);
    if (args.traceBl && state.blAll) {
        const out = path.join(CACHE_DIR, `bl-trace-${m.entry}.txt`);
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(out, state.blAll.map(b => `${b.step} ${hex(b.from)} ${hex(b.to)}`).join('\n'));
        console.log(`full BL trace (${state.blAll.length} calls) -> ${out}`);
    }
}

const isMain = process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(err => {
        console.error(String((err && err.stack) || err));
        process.exit(1);
    });
}
