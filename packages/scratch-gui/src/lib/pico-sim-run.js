/**
 * Run a MicroPython program on the Pico IN THE SIMULATOR (N3c).
 *
 * The Pico ▶ Run boots the pinned MicroPython firmware in rp2040js and runs the
 * program over the SAME createPicoRepl the silicon deploy uses — the seam that
 * differs is PERSISTENCE, not sim-vs-silicon: silicon INSTALLS AND REBOOTS
 * (deployMainPy: write main.py + machine.reset()), the sim RUNS LIVE (exec).
 * The sim cannot install-and-reboot because machine.reset() does not reboot the
 * emulator yet — a measured bw-board adapter gap, finding N3c-1 in
 * docs/PICO-SIM-RUN-FINDINGS.md. So a program whose text calls machine.reset()
 * is refused BY NAME rather than silently frozen.
 *
 * DRIVE MODEL. One driver: a requestAnimationFrame pump advances the emulator
 * each frame (adapter.advanceNs, which also pushes board time and fires the
 * GPIO→board→ledBrightness chain). The createPicoRepl transport does NOT drive
 * the CPU itself — its reads await bytes the pump produces — so there is no
 * double-stepping race. `repl.exec(py)` is fired but NOT awaited to completion:
 * a `while True:` blink never returns, yet it runs (the pump advances it, its
 * GPIO reaches the board); Stop sends Ctrl-C and cancels the pump. A program
 * that ends, or one with a syntax error, settles exec early — a rejection is
 * surfaced through onError. Sleeps are cheap: MicroPython's time.sleep parks
 * the core in WFE and advanceNs fast-forwards the clock to the next alarm
 * instead of executing idle instructions.
 *
 * The boot cost is the emulator's: MicroPython v1.22.2 reaches its REPL in
 * ~1.3M instructions (~1–2.6 s wall on a shared box, measured 2026-09-06); the
 * pump absorbs it after a "booting" status, and the createPicoRepl timeout is
 * set well above it.
 *
 * @module
 */

/**
 * Does the program text call machine.reset()? Pure, so it is unit-tested
 * without an emulator. The sim cannot honour a reset (N3c-1), so the Run
 * refuses these by name rather than freezing. Matches `machine.reset(` and a
 * bare `reset()` on a `machine`-bound name; conservative — a false positive
 * only refuses a program the sim would freeze on anyway.
 */
export function programCallsReset (py) {
    const text = String(py || '');
    return /\bmachine\s*\.\s*reset\s*\(/.test(text)
        || /(^|[^.\w])reset\s*\(\s*\)/.test(text) && /\bimport\s+machine\b|\bfrom\s+machine\b/.test(text);
}

const CTRL_C = '\x03';

/** Pico core clock and the ADC reference — a 3.3 V, 125 MHz part. */
const CLOCK_HZ = 125_000_000;
const VCC = 3.3;

/** Sim time advanced per animation frame. Sleeps fast-forward through this via
 *  WFE, so a sleepy program (the usual blink) paces near real time; a busy loop
 *  runs slower than real time, which is acceptable for a teaching simulator. */
const SLICE_NS = 8_000_000; // 8 ms of sim time per frame

/**
 * Boot MicroPython and run `py` live, driving `board`'s GPIO. The caller has
 * already refused absence (image null) and machine.reset() (programCallsReset)
 * by name; this is the happy path plus runtime errors.
 *
 * @param {object}   opts
 * @param {Uint8Array} opts.image  flat flash image (loadPicoFirmware().image)
 * @param {object}   opts.vm       the scratch-vm (for the RUN board + circuit)
 * @param {object}   opts.stc      the project's STC descriptor (pins, device)
 * @param {string}   opts.py       the MicroPython program
 * @param {(s: string) => void} [opts.onStatus]  user-facing status
 * @param {(e: Error) => void}  [opts.onError]   a runtime traceback from the program
 * @returns {Promise<{stop: () => void}>}  resolves once the program is running;
 *          call stop() to interrupt it and tear the run down. Throws before that
 *          if the circuit on the canvas was rejected (resolveNetlist refuses a
 *          phantom bench by name) — the caller shows the message.
 */
export async function startPicoSimRun ({image, vm, stc, py, onStatus, onError}) {
    const status = onStatus || (() => {});
    status('starting the Pico simulator…');

    // Heavy deps behind dynamic import — its own chunk, off the entry bundle,
    // the labwired-engine.js discipline. rp2040js carries USBCDC (the RPI_PICO
    // REPL is on USB, not UART0).
    const {BoardImpl, inferNetlist} = await import(
        /* webpackChunkName: "bw-board" */ './bw-board/index.js');
    const {createRp2040jsAdapter} = await import(
        /* webpackChunkName: "bw-board" */ './bw-board/rp2040js-adapter.js');
    const {resolveNetlist} = await import(
        /* webpackChunkName: "bw-board" */ './bw-board/resolve-netlist.js');
    const {createPicoRepl} = await import('./pico-repl.js');
    const {USBCDC} = await import('rp2040js');

    // One board, one truth — the SAME resolution the debugger uses (designer's
    // live circuit, else inferred; a rejected circuit refuses here by name).
    const netlist = await resolveNetlist(vm, stc, inferNetlist);
    const board = new BoardImpl(VCC);
    board.setNetlist(netlist.parts, netlist.nets);
    board.setPower(true);
    // Publish the RUN board so the canvas binds to what the emulator drives,
    // and announce the epoch — exactly as attachRp2040js does.
    if (vm && vm.runtime) vm.runtime.bwRunBoard = board;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bw-board-ready'));

    const adapter = createRp2040jsAdapter({clockHz: CLOCK_HZ, vcc: VCC});
    adapter.attachBoard(board);          // arms GPIO listeners + seats pins

    // The REPL wire: a USB CDC on the emulated controller. Reads await bytes the
    // pump produces; they never step the CPU themselves.
    const cdc = new USBCDC(adapter.rp2040.usbCtrl);
    let usbConnected = false;
    cdc.onDeviceConnected = () => { usbConnected = true; };
    let pending = '';
    let waiters = [];
    const wake = () => { const w = waiters; waiters = []; for (const r of w) r(); };
    cdc.onSerialData = (buf) => {
        for (const b of buf) pending += String.fromCharCode(b);
        wake();
    };
    const transport = {
        async write (text) {
            for (const ch of text) cdc.sendSerialByte(ch.charCodeAt(0) & 0xff);
        },
        async read () {
            if (!pending) await new Promise((resolve) => waiters.push(resolve));
            const out = pending;
            pending = '';
            return out;
        }
    };

    adapter.bootFromFlash(image);        // stage 2 first — what silicon does

    // The single driver. Each frame advances the emulator; advanceNs pushes
    // board time and fires publishPin → board.setPin, so LEDs update live.
    let rafId = null;
    let stopped = false;
    const raf = (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame
        : (cb) => setTimeout(() => cb(Date.now()), 16);
    const cancelRaf = (typeof cancelAnimationFrame === 'function')
        ? cancelAnimationFrame
        : clearTimeout;
    function pump () {
        rafId = null;
        if (stopped) return;
        try {
            adapter.advanceNs(SLICE_NS);
        } catch (e) {
            status(`the Pico simulator stopped: ${e && e.message ? e.message : e}`);
            return;                       // a faulted core: stop pumping
        }
        // Any read waiting on bytes the CPU just produced is woken by
        // onSerialData already; nothing to do here but re-arm.
        rafId = raf(pump);
    }
    rafId = raf(pump);

    // Wait for the emulated host to enumerate USB before talking to the REPL:
    // MicroPython drops stdout until CDC reports DTR, so a knock before then is
    // simply lost (the probe learned this the hard way).
    status('booting MicroPython…');
    await waitFor(() => usbConnected, () => stopped, 20_000);
    if (stopped) { return {stop: teardown}; }

    // Live run over the shared createPicoRepl. exec() is FIRED, not awaited to
    // completion: a forever loop keeps it pending while the pump runs the
    // program and its GPIO reaches the board. A completed program or a syntax
    // error settles it — a rejection is a runtime traceback for the user.
    const repl = createPicoRepl(transport, {timeoutMs: 30_000});
    status('running');
    repl.exec(py).then(
        () => { /* a terminating program finished; leave the board as it left it */ },
        (err) => {
            if (!stopped && onError) onError(err instanceof Error ? err : new Error(String(err)));
        }
    );

    function teardown () {
        if (stopped) return;
        stopped = true;
        if (rafId !== null) { cancelRaf(rafId); rafId = null; }
        // Interrupt a running program so the emulated core is not left spinning.
        transport.write(CTRL_C + CTRL_C).catch(() => {});
        wake();                          // release any pending read
        // The RUN board dies with the run — the same teardown attachRp2040js
        // does, so the canvas rebinds to the designer board and the epoch bumps.
        if (vm && vm.runtime && vm.runtime.bwRunBoard) {
            delete vm.runtime.bwRunBoard;
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bw-board-ready'));
        }
    }

    return {stop: teardown};
}

/**
 * Resolve when `cond()` is true or `abort()` is, polling on macrotasks so the
 * rAF pump keeps running between checks. Rejects on timeout.
 */
function waitFor (cond, abort, timeoutMs) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        const tick = () => {
            if (abort && abort()) return resolve();
            if (cond()) return resolve();
            if (Date.now() > deadline) {
                return reject(new Error('the Pico simulator did not reach its REPL in time'));
            }
            setTimeout(tick, 16);
        };
        tick();
    });
}
