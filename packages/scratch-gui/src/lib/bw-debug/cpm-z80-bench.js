/**
 * The CP/M-80 bench: where a real Z80 CP/M `.COM` actually runs — the Z80 twin
 * of `i8086-dos-bench.js`.
 *
 * It is a DIFFERENT MACHINE, not a flag on the drawn Z80 board: a bare
 * `Z80Machine(CPM64K)` (64K of RAM, a serial ACIA, no drawn circuit) with the
 * CP/M BDOS (`cpm-z80.js`) emulated behind the 0x0005 trap. Keeping it its own
 * constructor is what stops the BDOS trap stub from ever landing on top of a
 * ROM a board is trying to run.
 *
 * THE ONE PIECE OF GLUE is the same as the DOS bench's: a custom `step` that
 * services the BDOS trap BEFORE the hardware machine steps. `cpm.service()` is
 * idempotent (the trap holds `JR $`, which cannot move PC), so servicing there
 * is safe however the caller schedules it. When the program warm-boots the CPU
 * is halted rather than left spinning, so the caller's step loop returns.
 *
 * @param {{bytes: Uint8Array, keys?: number[], files?: Map<string,Uint8Array>,
 *          onChar?: (ch: string) => void, onExit?: (code: number) => void}} opts
 * @returns {Promise<object>} `{machine, cpm, step, files, sendKeys, screenText,
 *                              report, terminated, exitCode}`
 */
import {createCpm80} from './cpm-z80.js';

export async function createCpmZ80Bench(opts = {}) {
    const {bytes, keys, onChar, onExit, files} = opts;
    if (!bytes || !bytes.length) throw new Error('the CP/M bench was handed an empty image');

    // The CP/M disk: a Map<name, Uint8Array> that BDOS open/read/write/make use.
    // Mounting inputs here — and reading back files a program WROTE — is what
    // lets a CP/M toolchain run in the browser, exactly as the DOS bench's disk
    // does for INT 21h.
    const diskFiles = (files instanceof Map) ? files : new Map();

    const {Z80Machine, CPM64K} = await import(/* webpackChunkName: "bw-debug-z80" */ 'bw-board/z80-machine.js');

    // CPM64K is bw-board's CP/M preset: all-RAM 0x0000-0xFFFF (so the BDOS trap
    // page is writable) plus a console ACIA. It is the documented CP/M analogue
    // of the DOS bench's DOSBOX8086_XT.
    const machine = new Z80Machine(CPM64K);

    const cpm = createCpm80(machine, {
        files: diskFiles,
        onChar: onChar || null,
        keys: (keys && keys.length) ? keys : [],
        // A person is at this keyboard: a program that asks for a key blocks
        // until one arrives rather than being handed NUL and running on. The
        // corpus-style unattended default (never block) is the other choice;
        // this bench is the interactive one, matching i8086-dos-bench.
        blockOnKey: true
    }).install();

    cpm.loadCom(bytes);

    let exitAnnounced = false;
    const step = () => {
        if (cpm.terminated) {
            machine.cpu.halted = 1;               // halt, do not spin and do not stall
            if (!exitAnnounced) { exitAnnounced = true; if (onExit) onExit(cpm.exitCode); }
            return 0;
        }
        if (cpm.service() !== null) {
            if (cpm.terminated && !exitAnnounced) { exitAnnounced = true; if (onExit) onExit(cpm.exitCode); }
            return 0;
        }
        const cycles = machine.step();
        if (cpm.terminated && !exitAnnounced) { exitAnnounced = true; if (onExit) onExit(cpm.exitCode); }
        return cycles;
    };

    return {
        machine, cpm,
        // The CP/M disk (Map<name, Uint8Array>): read back files the program
        // wrote, mount inputs by passing this same Map shape in `opts.files`.
        files: diskFiles,
        /** The SERVICED step — the raw machine.step() never services BDOS. */
        step,
        /** Type into the running program (funcs 1/6/10 drink from this queue). */
        sendKeys: (text) => cpm.type(text),
        screenText: () => cpm.screenText(),
        report: () => cpm.report(),
        get terminated() { return cpm.terminated; },
        get exitCode() { return cpm.exitCode; }
    };
}

export default createCpmZ80Bench;
