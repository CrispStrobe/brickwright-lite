/**
 * The micro:bit instrumentation debugger — a SEPARATE lightweight controller.
 *
 * MICROBIT-NATIVE.md Stage 3 (the CORRECTION): the WASM MicroPython sim is a
 * black-box real-time VM in an iframe. It has no program clock to budget and no
 * single-stepping, so it does NOT fit the boundary-D `DebugTarget` contract the
 * 8051/AVR/6502 emulators satisfy (`runFor(budgetNs)`, `insn` stepping). Forcing
 * it into that contract would be a front end that lies. Instead, the compiler
 * INSTRUMENTS the program: `generateMicroPython(project, {debug:true,
 * breakpoints:[<blockId>...]})` emits `_bw_pos(n)` markers that print position
 * over the sim's existing serial channel before each block runs, and HALT (spin
 * on `input()`) at a breakpoint. This is the same lever the 8051 monitor's
 * Level-1 position uses (read state, do not VM-step) — DEBUG-CONTROL-MODEL §2.
 *
 * This controller owns:
 *   - the serial marker parser (RS-prefixed control tokens split from real
 *     print() output — the one genuinely testable core, see createMarkerSplitter);
 *   - the live position → source-block highlight, via the SAME call the 8051
 *     debugger uses: `vm.runtime.glowBlock(blockId, on)`;
 *   - the halt/step/continue state machine, driving the sim's serial-IN.
 *
 * capabilities() reports `steps: ['block']`, `breakpoints: ['block']`, and
 * refuses `insn`/`line`/`over`/`out` — exactly as the on-chip 8051 monitor
 * refuses what it cannot do (MICROBIT-NATIVE §2). It is the honest first
 * micro:bit debugger: block-level position and block breakpoints, over the sim
 * we already ship, no VM changes.
 *
 * ## The wire protocol (the codegen contract this consumes)
 *
 * Over serial-OUT, the debug build prints, BEFORE each block runs:
 *   `\x1e<n>\n`     — position marker: block index n is about to run
 *   `\x1e!<n>\n`    — HALT marker: paused at block n (breakpoint or pending step)
 * and, immediately after a HALT, one state frame each (the 8051-parity panes):
 *   `\x1eV<json>\n` — VARIABLES: {name: value} of the user's variables/lists
 *   `\x1eB<json>\n` — BOARD: micro:bit snapshot {display, buttonA/B, accel, temp}
 * The `V`/`B` payloads are single-line JSON (no `\n`, no RS), so the newline
 * delimiter is unambiguous. `\x1e` is RS (0x1e, 0o036). Markers interleave with
 * real `print()` output and MUST be split out. The host resumes over serial-IN:
 *   `\x1es\r`       — step: run to the next block, then halt again
 *   `\x1ec\r`       — continue: run until the next breakpoint (or end)
 * `positions[n] = {block: <scratch block id>}` maps a marker back to the block
 * to highlight.
 *
 * ## Resume line discipline — verified against the shipped WASM sim (2026-08-19)
 *
 * The generated `_bw_pos` resumes by reading a LINE via `input()`. Driving the
 * real `micropython-microbit-v2-simulator` from Playwright showed its `input()`
 * behaves like a cooked terminal, NOT a raw byte pipe:
 *   - the line terminator MUST be `\r` (CR) — a bare `\n` (LF) never completes
 *     the read and the program stays blocked (a silent deadlock);
 *   - the RS byte `\x1e` is STRIPPED before `input()` returns — sending
 *     `\x1es\r` makes `input()` return `'s'`, not `'\x1es'`.
 * So this controller terminates every resume with `\r`. The RS prefix is kept
 * (harmless, and it documents intent), but the codegen's comparison must not
 * rely on it surviving — see the KNOWN CODEGEN DEPENDENCY note on step()/cont().
 *
 * @module
 */

/** RS — the control-byte prefix. 0x1e. */
const RS = '\x1e';

/**
 * A stateful splitter that separates RS-prefixed control tokens from real
 * program output across a CHUNKED stream. The serial arrives in arbitrary
 * fragments — an RS may land in one chunk and its digits (or newline) in the
 * next — so a partial token is retained in the buffer until its terminating
 * newline arrives.
 *
 * This is deliberately a pure, DOM-free function so it can be unit-tested
 * against a chunked stream with interleaved real output (the acceptance test
 * MICROBIT-NATIVE Stage-3 asks for when a full E2E is too much).
 *
 * @returns {{feed: (chunk: string) => {text: string, events: Array<{type:'pos'|'halt', n:number}>}, reset: () => void}}
 */
export function createMarkerSplitter() {
    let buf = '';
    return {
        /**
         * Feed a chunk. Returns the real (non-control) text it contained and the
         * control events it completed. A control token split across this and a
         * future chunk yields no event yet — it stays buffered.
         */
        feed(chunk) {
            buf += String(chunk);
            let text = '';
            const events = [];
            for (;;) {
                const rs = buf.indexOf(RS);
                if (rs === -1) {
                    // No control byte left: everything is real output.
                    text += buf;
                    buf = '';
                    break;
                }
                // Everything before the RS is real output.
                text += buf.slice(0, rs);
                const nl = buf.indexOf('\n', rs);
                if (nl === -1) {
                    // Partial control token — retain from RS for the next chunk.
                    buf = buf.slice(rs);
                    break;
                }
                const token = buf.slice(rs + 1, nl); // between RS and the newline
                const kind = token.charCodeAt(0);
                if (kind === 0x21 /* ! */) {
                    events.push({type: 'halt', n: parseInt(token.slice(1), 10)});
                } else if (kind === 0x56 /* V */ || kind === 0x42 /* B */) {
                    // State frame: the rest of the token is single-line JSON.
                    let data = null;
                    try { data = JSON.parse(token.slice(1)); } catch { data = null; }
                    if (data !== null) {
                        events.push({type: kind === 0x56 ? 'vars' : 'board', data});
                    }
                } else {
                    events.push({type: 'pos', n: parseInt(token, 10)});
                }
                buf = buf.slice(nl + 1);
            }
            return {text, events};
        },
        reset() { buf = ''; }
    };
}

/**
 * Create a micro:bit debug controller.
 *
 * @param {object} opts
 * @param {(blockId: string, on: boolean) => void} [opts.glow] highlight a block
 *   — the injected `vm.runtime.glowBlock`. Injected rather than imported so the
 *   controller stays DOM/VM-free and testable.
 * @param {(text: string) => void} [opts.sendSerialIn] write to the sim's
 *   serial-IN (resume bytes). Injected because the iframe is owned by the pane.
 * @param {(state: object) => void} [opts.onChange] called whenever UI state changes.
 */
export function createMicrobitDebugController(opts = {}) {
    let glowFn = opts.glow || null;
    let sendFn = opts.sendSerialIn || null;
    const onChange = opts.onChange || (() => {});

    const splitter = createMarkerSplitter();
    /** @type {Array<{block: string}>} n -> {block} from generateMicroPython. */
    let positions = [];
    /** The block currently lit, so a re-glow is a no-op and stop clears exactly one. */
    let litBlock = null;

    /** Cap the retained trace so a long run cannot grow the panel unbounded. */
    const TRACE_CAP = 500;

    let state = {
        active: false,   // a debug run is in progress
        running: false,  // program is advancing
        halted: false,   // paused at a breakpoint / after a step
        block: null,     // scratch block id of the current position
        index: null,     // position marker index n
        vars: null,      // {name: value} snapshot from the last halt (the memory pane)
        board: null,     // micro:bit board snapshot from the last halt (pin/sensor pane)
        trace: []        // execution history: [{n, block}, …] (most recent last, capped)
    };

    function snapshot() { return {...state}; }
    function emit() { onChange(snapshot()); }

    function setGlow(block) {
        if (block === litBlock) return;
        if (litBlock && glowFn) { try { glowFn(litBlock, false); } catch { /* stale id */ } }
        if (block && glowFn) { try { glowFn(block, true); } catch { /* stale id */ } }
        litBlock = block;
    }

    return {
        /** Inject the highlight sink (needs the VM, owned by the panel/pane). */
        setGlowFn(fn) { glowFn = fn; },
        /** Inject the serial-IN sink (needs the iframe, owned by the pane). */
        setSerialInFn(fn) { sendFn = fn; },

        /**
         * Begin a debug run: adopt the positions map from generateMicroPython
         * and reset the marker parser. The flash itself is the pane's job.
         */
        begin(pos) {
            positions = Array.isArray(pos) ? pos : [];
            splitter.reset();
            setGlow(null);
            state = {active: true, running: true, halted: false, block: null,
                index: null, vars: null, board: null, trace: []};
            emit();
        },

        /**
         * Feed a serial-OUT chunk. Returns the REAL program output to display;
         * control markers are consumed and drive the highlight / halt state.
         * When no debug run is active it is a passthrough, so the pane can route
         * every chunk through it unconditionally.
         */
        feedSerial(chunk) {
            if (!state.active) return String(chunk);
            const {text, events} = splitter.feed(chunk);
            let changed = false;
            for (const ev of events) {
                if (ev.type === 'vars') {
                    // State frame — attaches to the halt we are already paused at,
                    // no position change. The last frame of a name wins.
                    state.vars = ev.data;
                    changed = true;
                    continue;
                }
                if (ev.type === 'board') {
                    state.board = ev.data;
                    changed = true;
                    continue;
                }
                const entry = positions[ev.n];
                const block = (entry && entry.block) || null;
                state.index = ev.n;
                state.block = block;
                if (ev.type === 'halt') {
                    state.halted = true;
                    state.running = false;
                } else {
                    // A fresh position marker while halted means the program
                    // resumed and moved on (step landed / continue ran).
                    state.halted = false;
                    state.running = true;
                    // Record the step into the execution trace (position pane).
                    state.trace.push({n: ev.n, block});
                    if (state.trace.length > TRACE_CAP) state.trace.shift();
                }
                setGlow(block);
                changed = true;
            }
            if (changed) emit();
            return text;
        },

        /**
         * ⏭ — step to the next block, which re-halts (the codegen latches).
         *
         * KNOWN CODEGEN DEPENDENCY: `\r` (not `\n`) is required to complete the
         * sim's `input()`, and the sim STRIPS the leading `\x1e`, so `input()`
         * returns `'s'`. The upstream `_bw_pos` must therefore compare the
         * RS-stripped char (e.g. `c[-1:] == 's'`), not `c == '\x1es'`. Verified
         * end-to-end 2026-08-19 (scripts/probe-microbit-resume.mjs).
         */
        step() {
            if (!state.active) return;
            if (sendFn) sendFn(`${RS}s\r`);
            state.halted = false;
            state.running = true;
            emit();
        },

        /** ▶ — continue to the next breakpoint (or program end). Clears paused. */
        cont() {
            if (!state.active) return;
            if (sendFn) sendFn(`${RS}c\r`);
            state.halted = false;
            state.running = true;
            emit();
        },

        /** ⏹ — end the debug run and clear the highlight. */
        stop() {
            splitter.reset();
            setGlow(null);
            state = {active: false, running: false, halted: false, block: null,
                index: null, vars: null, board: null, trace: []};
            emit();
        },

        /**
         * The capability column for this target (MICROBIT-NATIVE §2). Block-level
         * only; `insn`/`line`/`over`/`out` are refused honestly so a shared panel
         * greys them out rather than pretending.
         */
        capabilities() {
            return {
                steps: ['block'],
                breakpoints: ['block'],
                insn: false,
                line: false,
                over: false,
                out: false,
                consumes: []
            };
        },

        state: snapshot,
        get active() { return state.active; },
        get halted() { return state.halted; }
    };
}
