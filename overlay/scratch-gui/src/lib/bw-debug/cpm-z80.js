/**
 * CP/M-80 BDOS service layer for a bare Z80 machine — the Z80/CP/M twin of
 * `bw-board/src/i8086-dos.js`.
 *
 * WHY THIS EXISTS. bw-board's Z80 machine is HARDWARE: 64K of RAM and (on the
 * CP/M preset) a serial ACIA, and nothing that answers a `CALL 5`. A real
 * CP/M `.COM` calls the BDOS through address 0x0005 for every character it
 * prints and every file it touches; with no BDOS behind that vector it loads,
 * jumps to 0x0100, and immediately executes open bus. This module is the BDOS
 * — a service layer emulated behind a trap, exactly as i8086-dos.js emulates
 * INT 21h behind a trap page — so a Z80 CP/M program runs with no CP/M image
 * on disk and no pin bump: it wraps the pinned bw-board Z80 machine.
 *
 * THE TRAP, mirrored from i8086-dos.js. Page zero is laid out the way CP/M
 * lays it out: 0x0000 = `JP` warm-boot (here a HALT the layer also reads as
 * "terminate"), 0x0005 = `JP BDOS`, and 0x0006/7 hold the BDOS entry address
 * so a program that peeks there to size the TPA sees a plausible top of
 * memory. BDOS itself sits at {@link BDOS} and holds one instruction: `JR $`
 * (0x18 0xFE), the Z80 twin of the 8086 layer's `jmp $`. When the CPU lands
 * on BDOS, `service()` reads the function number from C, does the work, writes
 * the result into A/HL, and emulates the `RET` back to the caller — BEFORE the
 * hardware machine ever executes the `JR $`. If `service()` declines (a
 * blocking read with nothing to read), the `JR $` runs instead and the CPU
 * spins in place, burning cycles so time still passes and the next step asks
 * again. That decline-to-spin is the same trick i8086-dos.js uses, and it is
 * why servicing before the step is always safe.
 *
 * WHAT IT ANSWERS. The console group a CP/M program needs for output (1/2/6/9
 * console I/O, 10 buffered read, 11 status, 12 version) and the sequential
 * FCB file group against a `Map<name, Uint8Array>` disk (13 reset, 15 open,
 * 16 close, 19 delete, 20 read, 21 write, 22 make, 26 set-DMA, plus 33/34
 * random). The Map is the disk: mount inputs by putting them in it, and read
 * back the files a program WROTE the same way i8086-dos.js's `files` Map lets
 * a DOS compiler toolchain run in the browser.
 *
 * @module
 */

/** BDOS entry / trap address. Also the value written at 0x0006-7, so a program
 *  that reads it as "first byte the transient program may NOT use" sees the top
 *  of the TPA. Matches bw-board z80-adapter.js's interactive CP/M console. */
export const BDOS = 0xfe00;
/** Where a `.COM` loads: the CP/M Transient Program Area base. */
export const TPA = 0x0100;
/** Default DMA (disk transfer) address CP/M sets at cold start. */
export const DEFAULT_DMA = 0x0080;
/** The trap stub placed at BDOS: `JR $` — the Z80 twin of 8086 `jmp $`. */
const JR_SELF = [0x18, 0xfe];
/** How much captured console output is retained (see i8086-dos.js for why a cap). */
const MAX_STDOUT = 1 << 20;

/**
 * @param {object} machine a bw-board Z80Machine (flat `mem`, `cpu`, `step()`)
 * @param {{files?: Map<string,Uint8Array>, keys?: number[],
 *          onChar?: (ch: string) => void, blockOnKey?: boolean}} [io]
 * @returns {object} the serviceable CP/M layer
 */
export function createCpm80(machine, io = {}) {
    const cpu = machine.cpu;
    const mem = machine.mem;                 // Z80Machine keeps a flat Uint8Array(65536)
    if (!mem || mem.length < 0x10000) {
        throw new Error('createCpm80 needs a Z80 machine with a flat 64K memory (machine.mem)');
    }
    const onChar = io.onChar || null;
    const blockOnKey = io.blockOnKey === true;
    /** Pending keystrokes as ASCII bytes; funcs 1/6/10 drink here. */
    const keys = io.keys ? [...io.keys] : [];
    /** The virtual disk. A teaching sandbox has no business touching a real one. */
    const files = io.files || new Map();

    let terminated = false;
    let exitCode = 0;
    let dma = DEFAULT_DMA;
    let stdout = '';
    let stdoutChars = 0;
    let keyRequests = 0;
    const unsupported = new Map();           // "fn" -> count

    const rd8 = (a) => mem[a & 0xffff];
    const wr8 = (a, v) => { mem[a & 0xffff] = v & 0xff; };
    const rd16 = (a) => rd8(a) | (rd8(a + 1) << 8);

    const emit = (b) => {
        const ch = String.fromCharCode(b & 0xff);
        stdoutChars++;
        if (stdout.length < MAX_STDOUT) stdout += ch;
        if (onChar) onChar(ch);
    };
    /** CP/M returns a byte result in A, and (for compatibility) mirrors it in L. */
    const setA = (v) => { cpu.a = v & 0xff; cpu.l = v & 0xff; };
    const note = (fn) => unsupported.set(String(fn), (unsupported.get(String(fn)) || 0) + 1);

    /** Read the 8.3 filename out of an FCB at `p` into an uppercase "NAME.EXT" key. */
    const fcbName = (p) => {
        let name = '';
        for (let i = 1; i <= 8; i++) {
            const c = mem[(p + i) & 0xffff] & 0x7f;
            if (c !== 0x20 && c !== 0) name += String.fromCharCode(c);
        }
        let ext = '';
        for (let i = 9; i <= 11; i++) {
            const c = mem[(p + i) & 0xffff] & 0x7f;
            if (c !== 0x20 && c !== 0) ext += String.fromCharCode(c);
        }
        return (ext ? `${name}.${ext}` : name).toUpperCase();
    };

    /** Absolute byte offset a sequential FCB currently points at (extent*128 + cr, ×128 bytes). */
    const seqOffset = (p) => {
        const ex = mem[(p + 12) & 0xffff] & 0x1f;
        const s2 = mem[(p + 14) & 0xffff] & 0x3f;   // high extent bits
        const cr = mem[(p + 32) & 0xffff] & 0x7f;
        return (((s2 << 5) | ex) * 128 + cr) * 128;
    };
    /** Advance the FCB's current record after a sequential read/write. */
    const seqAdvance = (p) => {
        let cr = (mem[(p + 32) & 0xffff] & 0x7f) + 1;
        let ex = mem[(p + 12) & 0xffff] & 0x1f;
        let s2 = mem[(p + 14) & 0xffff] & 0x3f;
        if (cr > 127) { cr = 0; ex += 1; if (ex > 31) { ex = 0; s2 += 1; } }
        mem[(p + 32) & 0xffff] = cr;
        mem[(p + 12) & 0xffff] = ex & 0x1f;
        mem[(p + 14) & 0xffff] = s2 & 0x3f;
    };
    /** Zero the FCB fields an open/make resets so a following sequential op starts clean. */
    const fcbResetRecords = (p) => {
        mem[(p + 12) & 0xffff] = 0;   // ex
        mem[(p + 13) & 0xffff] = 0;   // s1
        mem[(p + 14) & 0xffff] = 0;   // s2
        mem[(p + 32) & 0xffff] = 0;   // cr
    };

    /** A blocking call with nothing to give it — declined in service() so the JR $ can spin. */
    const waitingForKey = (fn) => {
        if (keys.length) return false;
        if (fn === 1 || fn === 10) return true;
        if (fn === 6) { const e = cpu.e & 0xff; return e === 0xfd; }  // 0xFF/0xFE are polls
        return false;
    };

    /** BDOS dispatch. Register results are written here; service() does the RET. */
    const bdos = (fn) => {
        switch (fn) {
        case 0:  terminated = true; exitCode = 0; return;              // System Reset
        case 1: {                                                      // Console Input (echo)
            keyRequests++;
            const c = keys.length ? keys.shift() : 0;
            if (c) emit(c);
            setA(c);
            return;
        }
        case 2:  emit(cpu.e); return;                                  // Console Output
        case 3:  setA(0x1a); return;                                  // Reader In → EOF
        case 4:  return;                                              // Punch Out → sink
        case 5:  emit(cpu.e); return;                                  // List Out → console
        case 6: {                                                     // Direct Console I/O
            const e = cpu.e & 0xff;
            if (e === 0xff) { keyRequests++; setA(keys.length ? keys.shift() : 0); }
            else if (e === 0xfe) setA(keys.length ? 0xff : 0);        // status
            else if (e === 0xfd) { keyRequests++; setA(keys.length ? keys.shift() : 0); }
            else emit(e);
            return;
        }
        case 7:  setA(0); return;                                     // Get IOBYTE
        case 8:  return;                                              // Set IOBYTE
        case 9: {                                                     // Print $-terminated String
            let a = cpu.de;
            for (let i = 0; i < 0x10000; i++) {
                const ch = rd8(a);
                if (ch === 0x24) break;                               // '$'
                emit(ch);
                a = (a + 1) & 0xffff;
            }
            return;
        }
        case 10: {                                                    // Read Console Buffer
            keyRequests++;
            const buf = cpu.de & 0xffff;
            const max = rd8(buf);
            let count = 0;
            while (count < max) {
                if (!keys.length) break;
                const ch = keys.shift();
                if (ch === 13 || ch === 10) break;
                wr8(buf + 2 + count, ch);
                emit(ch);
                count++;
            }
            wr8(buf + 1, count);
            emit(13); emit(10);
            return;
        }
        case 11: setA(keys.length ? 0xff : 0); return;                // Console Status
        case 12: cpu.h = 0; cpu.l = 0x22; cpu.b = 0; cpu.a = 0x22; return; // Version → CP/M 2.2
        case 13: dma = DEFAULT_DMA; setA(0); return;                  // Reset Disk System
        case 14: setA(0); return;                                     // Select Disk
        case 15: {                                                    // Open File
            const p = cpu.de & 0xffff;
            if (files.has(fcbName(p))) { fcbResetRecords(p); setA(0); }
            else setA(0xff);
            return;
        }
        case 16: setA(0); return;                                     // Close File (Map already holds it)
        case 17: {                                                    // Search First
            const p = cpu.de & 0xffff;
            setA(files.has(fcbName(p)) ? 0 : 0xff);
            return;
        }
        case 18: setA(0xff); return;                                  // Search Next (single-match model)
        case 19: {                                                    // Delete File
            const p = cpu.de & 0xffff;
            setA(files.delete(fcbName(p)) ? 0 : 0xff);
            return;
        }
        case 20: {                                                    // Read Sequential
            const p = cpu.de & 0xffff;
            const data = files.get(fcbName(p));
            if (!data) { setA(1); return; }
            const off = seqOffset(p);
            if (off >= data.length) { setA(1); return; }              // EOF
            for (let i = 0; i < 128; i++) {
                wr8(dma + i, (off + i) < data.length ? data[off + i] : 0x1a);
            }
            seqAdvance(p);
            setA(0);
            return;
        }
        case 21: {                                                    // Write Sequential
            const p = cpu.de & 0xffff;
            const name = fcbName(p);
            let data = files.get(name) || new Uint8Array(0);
            const off = seqOffset(p);
            if (off + 128 > data.length) {
                const grown = new Uint8Array(off + 128);
                grown.set(data);
                data = grown;
            }
            for (let i = 0; i < 128; i++) data[off + i] = rd8(dma + i);
            files.set(name, data);
            seqAdvance(p);
            setA(0);
            return;
        }
        case 22: {                                                    // Make File
            const p = cpu.de & 0xffff;
            files.set(fcbName(p), new Uint8Array(0));
            fcbResetRecords(p);
            setA(0);
            return;
        }
        case 23: setA(0); return;                                     // Rename (minimal)
        case 24: cpu.hl = 0x0001; setA(0x01); return;                 // Login Vector (drive A)
        case 25: setA(0); return;                                     // Current Disk → A
        case 26: dma = cpu.de & 0xffff; return;                       // Set DMA Address
        case 32: setA(0); return;                                     // Get/Set User → 0
        case 33: {                                                    // Read Random
            const p = cpu.de & 0xffff;
            const data = files.get(fcbName(p));
            if (!data) { setA(1); return; }
            const rec = rd8(p + 33) | (rd8(p + 34) << 8) | (rd8(p + 35) << 16);
            const off = rec * 128;
            if (off >= data.length) { setA(1); return; }
            for (let i = 0; i < 128; i++) wr8(dma + i, (off + i) < data.length ? data[off + i] : 0x1a);
            // random read seeds the sequential cursor at this record
            mem[(p + 32) & 0xffff] = rec & 0x7f;
            mem[(p + 12) & 0xffff] = (rec >> 7) & 0x1f;
            setA(0);
            return;
        }
        case 34: {                                                    // Write Random
            const p = cpu.de & 0xffff;
            const name = fcbName(p);
            let data = files.get(name) || new Uint8Array(0);
            const rec = rd8(p + 33) | (rd8(p + 34) << 8) | (rd8(p + 35) << 16);
            const off = rec * 128;
            if (off + 128 > data.length) { const g = new Uint8Array(off + 128); g.set(data); data = g; }
            for (let i = 0; i < 128; i++) data[off + i] = rd8(dma + i);
            files.set(name, data);
            setA(0);
            return;
        }
        case 35: {                                                    // Compute File Size
            const p = cpu.de & 0xffff;
            const data = files.get(fcbName(p));
            const recs = data ? Math.ceil(data.length / 128) : 0;
            wr8(p + 33, recs & 0xff);
            wr8(p + 34, (recs >> 8) & 0xff);
            wr8(p + 35, (recs >> 16) & 0xff);
            setA(0);
            return;
        }
        case 36: setA(0); return;                                     // Set Random Record (no-op stub)
        case 37: setA(0); return;                                     // Reset Drive
        default: note(fn); setA(0xff); return;                        // unimplemented: fail, and say so
        }
    };

    return {
        machine,
        /** Where this layer put its BDOS trap. Tests read it rather than assuming. */
        bdosAddr: BDOS,

        /**
         * Lay down page zero (warm-boot HALT, `JP BDOS`, BDOS pointer) and the
         * `JR $` trap stub, and confirm the trap page is writable.
         */
        install() {
            wr8(0x0000, 0x76);                       // warm boot → HALT (also trapped as terminate)
            wr8(0x0005, 0xc3);                       // JP BDOS
            wr8(0x0006, BDOS & 0xff);
            wr8(0x0007, (BDOS >> 8) & 0xff);
            wr8(BDOS, JR_SELF[0]);
            wr8(BDOS + 1, JR_SELF[1]);
            if (rd8(BDOS) !== JR_SELF[0] || rd8(BDOS + 1) !== JR_SELF[1]) {
                throw new Error(
                    `the BDOS trap at ${BDOS.toString(16)}h is not writable: this machine must map `
                    + 'RAM there. CPM64K (all-RAM) does; a ROM preset does not.');
            }
            return this;
        },

        /**
         * Load a `.COM` at the TPA (0x0100) the way CP/M's loader does: image at
         * 0x0100, DMA at 0x0080, SP just below BDOS with the warm-boot address
         * (0x0000) pushed so a bare `RET` returns to CP/M and terminates.
         */
        loadCom(bytes) {
            for (let i = 0; i < bytes.length; i++) wr8(TPA + i, bytes[i]);
            // Default FCBs (0x005C/0x006C) and the DMA buffer (0x0080) start clear.
            for (let i = 0x005c; i < 0x0100; i++) wr8(i, 0);
            dma = DEFAULT_DMA;
            cpu.pc = TPA;
            cpu.sp = BDOS & 0xffff;                  // top of the transient stack, just under BDOS
            cpu._push16(0x0000);                     // RET-to-0000 trapdoor (warm boot → terminate)
            cpu.halted = 0;
            terminated = false; exitCode = 0;
            return this;
        },

        /** Type into the machine; funcs 1/6/10 read this queue. Works on a live run. */
        type(text) {
            for (const ch of String(text)) keys.push(ch.charCodeAt(0) & 0xff);
            return this;
        },

        /**
         * If the CPU is parked on the BDOS trap (or has warm-booted to 0x0000),
         * service it and emulate the RET. Idempotent and safe to call before the
         * machine steps.
         * @returns {number|null} the BDOS function serviced (or 0 for terminate), else null
         */
        service() {
            if (terminated) return null;
            if (cpu.pc === 0x0000) { terminated = true; exitCode = 0; return 0; }  // warm boot
            if (cpu.pc !== BDOS) return null;
            const fn = cpu.c & 0xff;
            // Decline a blocking read with nothing to read: leave the CPU on the
            // JR $ so it spins, time passes, and the next step asks again.
            if (blockOnKey && waitingForKey(fn)) return null;
            bdos(fn);
            if (!terminated) cpu.pc = cpu._pop16();   // RET back past the CALL 5
            return fn;
        },

        /** One unit of progress: service a pending trap, else run one instruction. */
        step() {
            if (this.service() !== null) return 0;
            return machine.step();
        },

        /** Run until the program warm-boots or the budget runs out. */
        run(maxSteps = 5_000_000) {
            let i = 0;
            while (!terminated && i < maxSteps) { this.step(); i++; }
            return { terminated, exitCode, steps: i, exhausted: i >= maxSteps };
        },

        get terminated() { return terminated; },
        get exitCode() { return exitCode; },
        get stdout() { return stdout; },
        get stdoutChars() { return stdoutChars; },
        get files() { return files; },

        /** The console stream as lines (CP/M is a teletype, not a text page). */
        screenText() {
            return stdout.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        },

        /** What was asked for and refused, so a failure names itself. */
        report() {
            return {
                unsupported: [...unsupported].map(([fn, count]) => ({ fn: parseInt(fn, 10), count })),
                stdout,
                stdoutChars,
                stdoutTruncated: stdoutChars > stdout.length,
                terminated,
                exitCode,
                keyRequests,
            };
        },
    };
}

export default createCpm80;
