/**
 * The debug runner — everything between "a project" and "a glowing block".
 *
 * Design: `sb3-creator/reference/debugger-ui.md`. This is the host side of it:
 * bw-board owns the target and the session (both framework-free and tested in
 * Node), and this file owns the four things only a browser can do — build the
 * image over the network, instantiate the WASM, drive a frame loop, and light
 * up a block in the editor.
 *
 *     project  --generateC({debug:true})-->  C + @bw yield map
 *              --POST /compile{symbols}-->   .hex + symbol table
 *              --emu8051 + bw-board------->  a running, breakable program
 *              --why.tasks + yields[].block->  vm.runtime.glowBlock
 *
 * ## Why the symbol table has to come from the server
 *
 * A browser cannot run SDCC and cannot run stc_symtab.py, and the yield map
 * alone is not enough: it says WHICH BLOCK each `(task, state)` is, but not
 * where `<task>_state` lives in RAM or what code address a yield sits at. Only
 * the linker knows that. So `POST /compile {"symbols": true}` returns both, and
 * the two are joined here — by `(task, state)`, which is the one key that
 * survives the whole chain.
 *
 * ## Debug builds are not release builds, twice over
 *
 * `generateC({debug: true})` forces the cooperative scheduler even for a single
 * script (straight-line code in `main()` has no position to report), and
 * `--debug` makes SDCC stop tail-merging returns so line records map cleanly —
 * measured at 8 of 39 hex records different on a two-task program. The program
 * behaves the same; it is not the same bytes. So the image and the symbol table
 * must always come from the SAME request, and a debug image is never the thing
 * to flash.
 *
 * @module
 */

import { listBreakpoints, subscribeBreakpoints, toggleBreakpoint } from './breakpoints.js';

/**
 * @param {object} opts
 * @param {object} opts.vm the scratch-vm instance (for toJSON and glowBlock)
 * @param {string} [opts.compilerUrl] the stc-compiler service
 * @param {(state: object) => void} [opts.onChange] UI state changed
 */
export function createDebugRunner({ vm, compilerUrl = 'https://stc-compiler.vercel.app', onChange = () => {} }) {
    let session = null;
    let target = null;
    let board = null;
    let symbols = null;
    /** `${task}/${state}` -> block id, joined from the two halves. */
    let blockOf = new Map();
    /** block id -> `${task}/${state}`, for setting a breakpoint by block. */
    let yieldOf = new Map();
    /** Block ids currently lit. Several, because several tasks are somewhere. */
    let glowing = new Set();
    let rafId = null;
    let status = { phase: 'idle', message: '' };
    /**
     * block id -> the target's handle. Mirrors the shared store (breakpoints.js),
     * which is where the USER's breakpoints live: they are set by right-clicking a
     * block long before a target exists, and they outlive every stop.
     */
    const bps = new Map();
    let unsubscribeBps = null;

    function setStatus(phase, message = '') {
        status = { phase, message };
        emit();
    }

    /**
     * What the UI renders.
     *
     * `phase` is DERIVED from the session whenever there is one, never stored
     * alongside it. Keeping a second copy here was the first version, and it
     * drifted immediately: a breakpoint halt reached the session but the
     * runner still said "running", so the panel showed a running program that
     * was not moving. `status.phase` now only covers the states the session
     * cannot know about — before it exists, and when the build failed.
     */
    function snapshot() {
        const sess = session ? session.state() : null;
        let phase = status.phase;
        if (sess && phase !== 'error') {
            phase = sess.intent === 'paused' ? 'paused'
                : sess.intent === 'running' ? (sess.stepping ? 'stepping' : 'running')
                    : 'idle';
        }
        return {
            phase,
            message: status.message,
            session: sess,
            capabilities: target ? target.capabilities() : null,
            breakpoints: listBreakpoints(),
            /** Marked blocks the current build has no yield point for. */
            unreachableBreakpoints: listBreakpoints().filter((id) => yieldOf.size && !yieldOf.has(id)),
            /** block id -> `wait` / `forever` / … so a list can name them, not hash them. */
            yieldKinds: Object.fromEntries(
                [...yieldOf].map(([id, y]) => [id, y.kind])
            ),
            glowing: [...glowing],
            yieldBlocks: [...yieldOf.keys()]
        };
    }

    function emit() {
        onChange(snapshot());
    }

    // ─── glow ────────────────────────────────────────────────────────────

    /**
     * Light up the block the program is sitting on.
     *
     * Level 1 is yield-to-yield, so this marks the block whose yield we are AT,
     * not necessarily the statement about to run — `debugger-ui.md` §2.2. The
     * UI must not imply more precision than that.
     */
    function glow(tasks) {
        // EVERY task, not one. A cooperative scheduler really does have several
        // scripts each sitting somewhere, and Scratch itself glows every running
        // script rather than choosing between them. Picking "the first task that
        // resolves" was the first version of this, and it lit the other script's
        // hat when a breakpoint stopped task 1 — confidently pointing at the
        // wrong block, which is worse than pointing at none.
        // A finished task (state 0xFFFF) has no block and simply drops out.
        const next = new Set(
            (tasks || [])
                .map((t) => blockOf.get(`${t.task}/${t.state}`))
                .filter(Boolean)
        );
        for (const id of glowing) if (!next.has(id)) safeGlow(id, false);
        for (const id of next) if (!glowing.has(id)) safeGlow(id, true);
        glowing = next;
    }

    function clearGlow() {
        for (const id of glowing) safeGlow(id, false);
        glowing = new Set();
    }

    function safeGlow(blockId, on) {
        try {
            vm.runtime.glowBlock(blockId, on);
        } catch {
            // A block id from a stale build is not worth throwing over; the
            // worst case is a block that does not light up.
        }
    }

    // ─── build ───────────────────────────────────────────────────────────

    /** The project's own hardware declarations, or null if it has none. */
    function projectStc(project) {
        return (project && project.stc) || null;
    }

    /**
     * blocks -> C -> .hex + symbol table. Returns everything the attach step
     * needs, or throws with a message meant to be shown to a person.
     */
    async function build() {
        setStatus('building', 'reading the project…');
        const project = JSON.parse(vm.toJSON());
        const stc = projectStc(project);
        if (!stc || !(stc.pins || []).length) {
            throw new Error(
                'This project declares no pins, so there is no hardware to debug. ' +
                'Add DEVICE / PIN declarations in the Code tab first.'
            );
        }

        const { default: SB3Creator } = await import(
            /* webpackChunkName: "sb3-creator" */ '../sb3-creator.js');
        const { readYieldMap } = await import(
            /* webpackChunkName: "sb3-creator-c" */ '../sb3-creator-c.js');

        const creator = new SB3Creator();
        const c = creator.generateC(project, { debug: true });
        const yields = readYieldMap(c);
        if (!yields.length) {
            throw new Error(
                'This project has no green-flag script, so there is nothing to run.'
            );
        }

        setStatus('building', 'compiling…');
        const res = await fetch(`${compilerUrl}/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: c,
                language: 'c',
                target: (stc.device || 'stc12c5a60s2').toLowerCase(),
                format: 'ihx',
                // Both, from the SAME request — see the header.
                symbols: true
            })
        });
        const out = await res.json();
        if (!out.success) throw new Error(out.error || 'the compiler refused this program');
        if (!out.symbols) {
            throw new Error(
                `the image built but carries no symbol table, so the debugger cannot ` +
                `say where it is: ${out.symbols_error || 'no reason given'}`
            );
        }

        // The join. The emitter knows (task, state) -> block; the linker knows
        // (task, state) -> address. Neither knows the other, and (task, state)
        // is the only key both speak.
        blockOf = new Map();
        yieldOf = new Map();
        for (const y of yields) {
            blockOf.set(`${y.task}/${y.state}`, y.block);
            // A block can hold only one yield, so this direction is 1:1.
            yieldOf.set(y.block, { task: y.task, state: y.state, kind: y.kind });
        }

        return { hex: atob(out.base64), symbols: out.symbols, c, bytes: out.bytes };
    }

    // ─── attach ──────────────────────────────────────────────────────────

    async function attach(built) {
        setStatus('attaching', 'starting the emulator…');
        const [{ createEmu8051DebugTarget, createDebugSession, createEmu8051Adapter,
            BoardImpl, inferNetlist }, createEmu8051] = await Promise.all([
            import(/* webpackChunkName: "bw-board" */ '../bw-board/index.js'),
            import(/* webpackChunkName: "emu8051" */ '../emu8051/emu8051.js').then((m) => m.default || m)
        ]);

        // Emscripten resolves the .wasm relative to the script that loaded it,
        // which for a lazy chunk is `chunks/` — where the file is not. Webpack
        // copies it to `static/` (see the CopyWebpackPlugin entry), and
        // document.baseURI keeps this correct under GitHub Pages, where the app
        // is served from a subpath rather than the root.
        const wasm = await createEmu8051({
            locateFile: (file) => new URL(`static/${file}`, document.baseURI).href
        });
        const project = JSON.parse(vm.toJSON());
        const stc = projectStc(project);
        const fosc = Number(stc.clock) || 11059200;

        // ORDER MATTERS, and getting it wrong fails silently.
        //
        // `emu_init` frees and re-callocs code memory and re-runs dbg_init. The
        // adapter's constructor calls it. So the adapter must come BEFORE the
        // image, or the image is wiped — and the symptom is not an error: the
        // CPU NOP-sleds through 64 KB of zeroes, reaches whatever address a
        // breakpoint sits at, and halts there with every task still at state 0.
        // It looks like a working debugger pointing at the wrong block. The
        // assertion below is what makes it loud instead.
        //
        //   1. adapter  — inits the emulator, sets the clock and Vcc
        //   2. board    — attached before anything runs, so no edge is missed
        //   3. image    — after the last emu_init
        //   4. target   — symbols last; nothing may re-init behind it
        const adapter = createEmu8051Adapter(wasm, { fosc });

        // The board, so the LEDs light and the buzzer sounds while debugging.
        // It is driven by the emulator through boundary A and knows nothing
        // about the debugger: a halted MCU simply stops calling advanceTo.
        const { parts, nets } = inferNetlist(stc);
        board = new BoardImpl();
        board.setNetlist(parts, nets);
        board.setPower(true);
        adapter.attachBoard(board);

        // ccall marshals the string itself. Nothing here may touch a heap view:
        // no emu8051 build exports one (debugger-ui.md §7b).
        wasm.ccall('emu_load_hex', 'number', ['string', 'number'],
            [built.hex, built.hex.length]);

        // A real 8051 image begins with a jump over the interrupt vectors, so
        // all-zero code at the reset vector means nothing was loaded.
        if (!wasm._emu_get_code(0) && !wasm._emu_get_code(1) && !wasm._emu_get_code(2)) {
            throw new Error(
                'the image did not reach the emulator — code memory is empty at the ' +
                'reset vector. Something re-initialised the emulator after the load.'
            );
        }

        symbols = built.symbols;
        target = createEmu8051DebugTarget(wasm, { symbols });
        session = createDebugSession(target, {
            onChange: (st) => {
                if (st.halted) glow(st.tasks);
                else clearGlow();
                emit();
            }
        });

        setStatus('ready', `${built.bytes} bytes, ${blockOf.size} yield points`);
        return session;
    }

    // ─── the frame loop ──────────────────────────────────────────────────

    function pumpFrame() {
        rafId = null;
        if (!session) return;
        const outcome = session.pump();
        // Keep going while there is anything to do. A halted session stops
        // asking for frames entirely, which is what makes a paused program cost
        // nothing rather than spin.
        if (outcome === 'ran') schedule();
        emit();
    }

    function schedule() {
        if (rafId === null && typeof requestAnimationFrame === 'function') {
            rafId = requestAnimationFrame(pumpFrame);
        }
    }

    function unschedule() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    // ─── the verbs ───────────────────────────────────────────────────────

    const runner = {
        state: snapshot,

        /** Build, attach, and run. The ⚑ of the debug world. */
        async start() {
            try {
                if (!session) {
                    const built = await build();
                    await attach(built);
                    // The user's breakpoints only became SETTABLE now: until a
                    // target exists there is nothing to set them on, and until
                    // this build exists nothing knows which (task, state) a
                    // block is. Subscribing rather than reading once keeps a
                    // right-click during a run working.
                    unsubscribeBps = subscribeBreakpoints(syncBreakpoints);
                }
                session.start();
                setStatus('running');
                schedule();
            } catch (e) {
                unschedule();
                setStatus('error', e.message);
            }
        },

        pause() {
            if (!session) return;
            session.pause();
            unschedule();
            setStatus('paused');
        },

        resume() {
            if (!session) return;
            session.resume();
            setStatus('running');
            schedule();
        },

        /** One block by default — the granularity every target supports. */
        step(kind = 'block') {
            if (!session) return { unsupported: 'nothing is running yet' };
            const refusal = session.step(kind);
            if (refusal) { setStatus('paused', refusal.unsupported); return refusal; }
            setStatus('stepping');
            schedule();
            return undefined;
        },

        stop() {
            unschedule();
            if (session) session.stop();
            clearGlow();
            setStatus('idle');
        },

        setSpeed(x) { if (session) session.setSpeed(x); },

        /**
         * Is this block a place the program can be stopped at?
         *
         * The user cannot see which blocks are yield points, so a UI should ask
         * before offering "Pause here" — and where the answer is no, snap to
         * the next one rather than refusing (debugger-ui.md §3).
         */
        isYieldBlock: (blockId) => yieldOf.has(blockId),

        /** What a halt at this block would be called: `wait`, `forever`, … */
        yieldKind: (blockId) => (yieldOf.get(blockId) || {}).kind,

        /**
         * Mark or unmark a block. Delegates to the shared store, so the change
         * is visible to the editor's context menu and survives a stop — the
         * subscription above pushes it into the target when there is one.
         */
        toggleBreakpoint(blockId) {
            const now = toggleBreakpoint(blockId);
            emit();
            return now;
        },

        /** Program time, in ms, or null before anything has run. */
        timeMs: () => (target ? Number(target.timeNs()) / 1e6 : null),

        /** The board, so a circuit panel can render what the program is doing. */
        board: () => board,

        symbols: () => symbols,

        destroy() {
            unschedule();
            if (unsubscribeBps) { unsubscribeBps(); unsubscribeBps = null; }
            clearGlow();
            if (session) session.destroy();
            if (target) target.destroy();
            session = target = board = symbols = null;
        }
    };

    /**
     * Bring the target's breakpoints in line with the user's.
     *
     * Called on every change to the shared store, and once when a target first
     * exists. A marked block with no yield point in THIS build is left
     * unresolved rather than dropped: the store is the user's intent, and a
     * later build may well give it an address (`unreachableBreakpoints` in the
     * snapshot is what a UI shows for those).
     */
    function syncBreakpoints(ids) {
        if (!target) return;
        const wanted = new Set(ids);
        for (const [blockId, handle] of [...bps]) {
            if (wanted.has(blockId)) continue;
            if (handle !== null) target.clearBreakpoint(handle);
            bps.delete(blockId);
        }
        for (const blockId of wanted) {
            if (bps.has(blockId)) continue;
            const y = yieldOf.get(blockId);
            if (!y) continue;                      // no yield point in this build
            const handle = target.setBreakpoint({ kind: 'yield', task: y.task, state: y.state });
            bps.set(blockId, typeof handle === 'number' ? handle : null);
        }
    }

    return runner;
}
