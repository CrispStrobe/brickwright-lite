/**
 * The 8086 DOS bench: where an assembled .COM or .EXE actually runs.
 *
 * WHY THIS EXISTS AT ALL. `createDebugTarget('i8086')` builds HARDWARE — a
 * drawn board or the XT BIOS ROM, real 8259/8254/8255, interrupts through a
 * real vector table. `debug-runner.js` refused a .COM by name on that path
 * and was right to: a .COM loaded as a ROM at F0000 executes nothing, and a
 * machine that executes nothing looks on screen exactly like one that failed
 * to start. The refusal named the missing half — "the DOS service layer,
 * which is a different machine and is not wired to this tab yet". This is
 * that half.
 *
 * IT IS A DIFFERENT MACHINE, NOT A FLAG ON THE OLD ONE. No chips, no BIOS
 * ROM, 768K of RAM, and INT 21h answered behind a trap page at D000 (see
 * `i8086-dos.js` for why D000 and not F000). Keeping it a separate
 * constructor is what stops the trap page from ever being mapped on top of
 * a BIOS that is trying to boot.
 *
 * THE ONE PIECE OF GLUE, AND WHY IT IS A PROXY. `createI8086DebugTarget`
 * owns the stepping loop and calls `machine.step()` directly; the DOS layer
 * services a trap by looking at CS:IP BETWEEN instructions. Neither knows
 * about the other, and both are VENDORED — `overlay/.../bw-board/` is
 * overwritten wholesale by `npm run sync:bwboard`, so an edit there is lost
 * work by design. So the machine handed to the debug target is a Proxy whose
 * `step` services first: `dos.service()` is idempotent (every vector points
 * at a `jmp $` that cannot move IP, which is that module's central trick),
 * so servicing before the instruction is safe no matter how the caller
 * schedules it. Everything else passes straight through to the real machine,
 * receiver-bound so getters like `tMs` and methods like `_read` behave.
 *
 * AND WHY THE TERMINATED PROGRAM IS HALTED RATHER THAN LEFT SPINNING. When
 * INT 21h/4Ch has run, CS:IP sits on the trap page's `jmp $`. Returning zero
 * cycles forever would hang the caller's `while (machine.tMs < deadline)`
 * loop with a browser tab that never returns; letting it execute the jump
 * forever would burn every frame and look exactly like a program still
 * working. Halting the CPU does neither: `_wakeHorizon()` guarantees time
 * still advances, nothing executes, and `onExit` fires once so the panel can
 * say the program finished and with what code.
 *
 * NOT DONE, and named rather than left as a surprise:
 *   - No keyboard. `keys` seeds a queue INT 16h and INT 21h drink from, and
 *     the tab passes nothing, so a program that waits for a keystroke stops
 *     dead. That is why no shipped example asks for one.
 *   - No pins and no board. A DOS program has no hardware to wire, so the
 *     designer's board is not attached and the PINS panel stays empty. The
 *     drawn-board bench is the other branch, and it is unchanged.
 *
 * @module
 */

/**
 * Boot an assembled DOS program on a fresh machine.
 *
 * @param {{bytes: Uint8Array, format: 'com'|'exe', keys?: number[],
 *          onChar?: (ch: string) => void, onExit?: (code: number) => void}} opts
 * @returns {Promise<{machine: object, dos: object, target: object,
 *                    screenText: () => string[], report: () => object}>}
 */
export async function createI8086DosBench (opts) {
    const {bytes, format, keys, onChar, onExit} = opts;
    if (!bytes || !bytes.length) throw new Error('the DOS bench was handed an empty image');

    const [{I8086Machine}, dosMod, dbgMod] = await Promise.all([
        import(/* webpackChunkName: "bw-board" */ '../bw-board/i8086-machine.js'),
        import(/* webpackChunkName: "bw-board" */ '../bw-board/i8086-dos.js'),
        import(/* webpackChunkName: "bw-board" */ '../bw-board/i8086-debug.js')
    ]);
    const {createDos8086, DOSBOX8086_XT} = dosMod;
    const {createI8086DebugTarget} = dbgMod;

    // The XT variant, not the bare one: it adds an 8255, an 8254 and the PC
    // speaker and nothing else. Twenty-four programs in the corpus poke port
    // 61h expecting a real PC; on the bare config those writes land nowhere
    // and the beep is silently absent. There is deliberately no PIC, so
    // enabling interrupts cannot start delivering INT 8.
    const machine = new I8086Machine(DOSBOX8086_XT);
    const dos = createDos8086(machine, {
        onChar: onChar || null,
        keys: keys || []
    }).install();

    if (format === 'exe') dos.loadExe(bytes);
    else dos.loadCom(bytes);

    let exitAnnounced = false;
    const realStep = machine.step.bind(machine);
    const dosStep = () => {
        if (dos.terminated) {
            // See the header: halt, do not spin and do not stall.
            machine.cpu.halted = true;
            return realStep();
        }
        // Idempotent by construction; safe before OR after an instruction.
        if (dos.service() !== null) return 0;
        const cycles = realStep();
        if (dos.terminated && !exitAnnounced) {
            exitAnnounced = true;
            if (onExit) onExit(dos.exitCode);
        }
        return cycles;
    };

    /**
     * The machine as the debug target sees it: identical, except that
     * stepping services DOS first. `Reflect.get(t, prop, t)` rather than the
     * proxy receiver so accessors read the real machine's own fields, and
     * methods are bound to it for the same reason.
     */
    const serviced = new Proxy(machine, {
        get (t, prop) {
            if (prop === 'step') return dosStep;
            const v = Reflect.get(t, prop, t);
            return typeof v === 'function' ? v.bind(t) : v;
        }
    });

    const target = createI8086DebugTarget({machine: serviced}, {
        // Which video mode the program BELIEVES it is in. Without this the
        // renderer assumes the power-on text mode, which is right for these
        // programs and wrong for any that sets a mode — and being wrong here
        // draws a plausible picture of the wrong memory.
        videoModeLog: () => dos.videoModeLog()
    });

    return {
        machine, dos, target,
        format,
        screenText: () => dos.screenText(),
        report: () => dos.report(),
        get terminated () { return dos.terminated; },
        get exitCode () { return dos.exitCode; }
    };
}

export default createI8086DosBench;
