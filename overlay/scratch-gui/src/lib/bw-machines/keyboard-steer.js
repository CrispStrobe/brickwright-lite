// Machine Manager — keyboard steering (design §4.5, the input counterpart of
// video-mirror.js).
//
// A `keyboard` input widget in the Widgets pane captures keys as ASCII into its
// FIFO (bw-board controller.js `pushKeyboardKey`/`readKeyboardKey`). This module
// drains that FIFO and drives the machine's real keyboard hardware:
// ASCII → XT set-1 scancode → `runner.keyIn(scancode)` (the same single-scancode
// entry the Debug view's key path uses). So a user can type at a booted DOS/ELKS
// machine from a widget, not only from the Debug instrument.
//
// The XT scancode table is duplicated here only because the pinned bw-board does
// not export one (its InteractiveConsole is newer than the pin); it should
// CONVERGE into bw-board on the next pin bump rather than fork permanently.
//
// Framework-free: injectable scheduler + keyIn, so a Node test drives it.

const SHIFT_MAKE = 0x2a;
const BREAK = 0x80; // OR with a make code to get its break (key-up) code.

// Unshifted char → XT set-1 make code.
const MAKE = Object.freeze({
    // letters
    q: 0x10, w: 0x11, e: 0x12, r: 0x13, t: 0x14, y: 0x15, u: 0x16, i: 0x17,
    o: 0x18, p: 0x19, a: 0x1e, s: 0x1f, d: 0x20, f: 0x21, g: 0x22, h: 0x23,
    j: 0x24, k: 0x25, l: 0x26, z: 0x2c, x: 0x2d, c: 0x2e, v: 0x2f, b: 0x30,
    n: 0x31, m: 0x32,
    // digits (top row)
    '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05, '5': 0x06, '6': 0x07,
    '7': 0x08, '8': 0x09, '9': 0x0a, '0': 0x0b,
    // punctuation
    '-': 0x0c, '=': 0x0d, '[': 0x1a, ']': 0x1b, ';': 0x27, '\'': 0x28,
    '`': 0x29, '\\': 0x2b, ',': 0x33, '.': 0x34, '/': 0x35, ' ': 0x39
});

// Shifted char → the base (unshifted) char it is produced from.
const SHIFTED_BASE = Object.freeze({
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7',
    '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']',
    ':': ';', '"': '\'', '~': '`', '|': '\\', '<': ',', '>': '.', '?': '/'
});

// Control chars with their own make codes.
const CONTROL = Object.freeze({
    8: 0x0e,   // Backspace (ASCII BS)
    127: 0x0e, // DEL — treat as Backspace (browsers send 127 for Backspace too)
    9: 0x0f,   // Tab
    10: 0x1c,  // LF  — Enter
    13: 0x1c,  // CR  — Enter
    27: 0x01   // Esc
});

/**
 * Convert one ASCII code to the sequence of scancodes that types it: a make
 * then a break, wrapped in Shift make/break for a shifted character. Unknown
 * codes return an empty array (nothing typed) rather than a wrong key.
 *
 * @param {number} code an ASCII code (as `readKeyboardKey` yields)
 * @returns {number[]} scancodes to feed `keyIn` in order
 */
export function asciiToScancodes(code) {
    const n = Number(code);
    if (!Number.isFinite(n) || n <= 0) return [];
    if (CONTROL[n]) { const m = CONTROL[n]; return [m, m | BREAK]; }
    const ch = String.fromCharCode(n);
    // Uppercase letter → shift + its lowercase make.
    if (ch >= 'A' && ch <= 'Z') {
        const m = MAKE[ch.toLowerCase()];
        return m ? [SHIFT_MAKE, m, m | BREAK, SHIFT_MAKE | BREAK] : [];
    }
    // Other shifted characters.
    if (SHIFTED_BASE[ch] != null) {
        const m = MAKE[SHIFTED_BASE[ch]];
        return m ? [SHIFT_MAKE, m, m | BREAK, SHIFT_MAKE | BREAK] : [];
    }
    // Unshifted printable.
    const m = MAKE[ch];
    return m != null ? [m, m | BREAK] : [];
}

function defaultSchedule(cb) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
    return setTimeout(() => cb(Date.now()), 16);
}
function defaultCancel(handle) {
    if (typeof cancelAnimationFrame === 'function') {
        try { cancelAnimationFrame(handle); return; } catch { /* not a rAF handle */ }
    }
    clearTimeout(handle);
}

/**
 * Create a steerer that drains a keyboard widget's FIFO and feeds the machine.
 * Returns `{start, stop, tick, running, keysSent}`; `tick` drains once (the unit
 * a Node test drives).
 *
 * @param {object} opts
 * @param {object} opts.panel a bw-board ControllerPanel (readKeyboardKey)
 * @param {string} opts.widgetName the keyboard widget to drain
 * @param {(sc: number) => void} opts.keyIn the machine's keyIn (one scancode)
 * @param {(cb: Function) => any} [opts.schedule]
 * @param {(h: any) => void} [opts.cancel]
 */
export function createKeyboardSteer(opts = {}) {
    const panel = opts.panel;
    const widgetName = opts.widgetName;
    const keyIn = opts.keyIn;
    const schedule = typeof opts.schedule === 'function' ? opts.schedule : defaultSchedule;
    const cancel = typeof opts.cancel === 'function' ? opts.cancel : defaultCancel;

    let running = false;
    let handle = null;
    let keysSent = 0;

    function tick() {
        if (!panel || typeof panel.readKeyboardKey !== 'function' ||
            typeof keyIn !== 'function' || !widgetName) return 0;
        let sent = 0;
        // readKeyboardKey consumes and returns 0 when the FIFO is empty.
        for (let guard = 0; guard < 256; guard += 1) {
            let code;
            try { code = panel.readKeyboardKey(widgetName); } catch { break; }
            if (!code) break;
            for (const sc of asciiToScancodes(code)) {
                try { keyIn(sc); sent += 1; } catch { /* runner mid-teardown */ }
            }
        }
        keysSent += sent;
        return sent;
    }

    function loop() {
        if (!running) return;
        tick();
        handle = schedule(loop);
    }

    return {
        get running() { return running; },
        get keysSent() { return keysSent; },
        tick,
        start() {
            if (running || !widgetName) return;
            running = true;
            handle = schedule(loop);
        },
        stop() {
            running = false;
            if (handle != null) { cancel(handle); handle = null; }
        }
    };
}
