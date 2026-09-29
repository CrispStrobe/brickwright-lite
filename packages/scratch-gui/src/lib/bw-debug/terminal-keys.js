/**
 * Keyboard → bytes for a serial terminal: what a VT100/xterm sends down the
 * line for each key, so a guest tty (the Linux lesson's /dev/ttyS0) can do its
 * own echo, line editing, job control and full-screen drawing.
 *
 * The console used to take whole lines: an <input>, Enter sent `line + "\r"`.
 * That cannot deliver Ctrl-C to a running `sleep`, an arrow key to ash's
 * history, or a keystroke to `vi`. A terminal sends each key as it is pressed
 * and never echoes or edits locally — the guest does both.
 *
 * THE TABLE (normal mode; see `applicationCursor` for DECCKM):
 *
 *   printable, incl. non-ASCII   its UTF-8 bytes
 *   Enter                        0x0d CR — what a terminal sends; the guest's
 *                                tty maps it to NL (ICRNL is on: `stty -a`
 *                                on the lesson's kernel says `icrnl`), and a
 *                                raw-mode program (vi) expects CR
 *   Backspace                    0x7f DEL — the guest's `erase = ^?`
 *   Tab / Shift-Tab              0x09 / ESC [ Z
 *   Escape                       0x1b
 *   Ctrl-A … Ctrl-Z              0x01 … 0x1a (Ctrl-C 0x03 = intr, Ctrl-D
 *                                0x04 = eof, Ctrl-Z 0x1a = susp)
 *   Ctrl-@/Space [ \ ] ^ _       0x00 0x1b 0x1c 0x1d 0x1e 0x1f
 *   Alt-<key>                    ESC then the key's bytes (xterm metaSendsEscape)
 *   Up Down Right Left           ESC [ A/B/C/D   (DECCKM set: ESC O A/B/C/D)
 *   Home End                     ESC [ H / ESC [ F  (DECCKM set: ESC O H/F)
 *   Insert Delete PgUp PgDn      ESC [ 2~ / 3~ / 5~ / 6~
 *   F1–F4                        ESC O P/Q/R/S
 *   F5–F12                       ESC [ 15~ 17~ 18~ 19~ 20~ 21~ 23~ 24~
 *   modified cursor/edit keys    xterm's `ESC [ 1 ; m X` / `ESC [ n ; m ~`,
 *                                m = 1 + Shift + 2·Alt + 4·Ctrl
 *
 * `null` means "not a terminal key": the caller leaves it to the browser —
 * Cmd/Meta shortcuts, Ctrl-Shift-C/V (copy/paste in a terminal), a dead key
 * or an IME composition (whose text arrives later as input, and goes through
 * `textToBytes`), bare modifiers.
 *
 * Framework-free and DOM-free: it reads only `key`, `code` and the four
 * modifier flags of a KeyboardEvent-shaped object, so the table is tested in
 * Node and the same function runs in the browser.
 *
 * @module
 */

const ESC = 0x1b;
const CSI = [ESC, 0x5b];                 // ESC [
const SS3 = [ESC, 0x4f];                 // ESC O

const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

/** UTF-8 bytes of a JS string (the terminal line is 8-bit; the guest decodes). */
export function textToBytes (text) {
    const s = String(text);
    if (encoder) return Array.from(encoder.encode(s));
    // Fallback encoder (no TextEncoder): code points → UTF-8.
    const out = [];
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp < 0x80) out.push(cp);
        else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
        else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return out;
}

const ascii = s => Array.from(s, c => c.charCodeAt(0));

/** Cursor keys: final byte of `ESC [ X` / `ESC O X`. */
const CURSOR = {ArrowUp: 'A', ArrowDown: 'B', ArrowRight: 'C', ArrowLeft: 'D', Home: 'H', End: 'F'};
/** Editing keys: the number of `ESC [ n ~`. */
const TILDE = {Insert: 2, Delete: 3, PageUp: 5, PageDown: 6,
    F5: 15, F6: 17, F7: 18, F8: 19, F9: 20, F10: 21, F11: 23, F12: 24};
const SS3_FKEYS = {F1: 'P', F2: 'Q', F3: 'R', F4: 'S'};
/** Ctrl + punctuation → C0 control. */
const CTRL_PUNCT = {'@': 0x00, ' ': 0x00, '2': 0x00, '[': 0x1b, '3': 0x1b, '\\': 0x1c, '4': 0x1c,
    ']': 0x1d, '5': 0x1d, '^': 0x1e, '6': 0x1e, '_': 0x1f, '-': 0x1f, '7': 0x1f, '/': 0x1f,
    '?': 0x7f, '8': 0x7f};

/** One printable "character" — a single code point, however many UTF-16 units. */
const isPrintable = key => typeof key === 'string' && key.length > 0 &&
    [...key].length === 1 && key.codePointAt(0) >= 0x20 && key.codePointAt(0) !== 0x7f;

/**
 * The bytes a terminal sends for one keydown, or null to leave it alone.
 *
 * @param {{key: string, code?: string, ctrlKey?: boolean, altKey?: boolean,
 *          shiftKey?: boolean, metaKey?: boolean}} ev a KeyboardEvent (or its shape)
 * @param {{applicationCursor?: boolean}} [mode] DECCKM, as the guest last set it
 *   (xterm.js: `terminal.modes.applicationCursorKeysMode`); `less`/`vi` turn it on
 * @returns {number[]|null}
 */
export function keyToBytes (ev, mode = {}) {
    if (!ev || typeof ev.key !== 'string') return null;
    const {key} = ev;
    const ctrl = !!ev.ctrlKey, alt = !!ev.altKey, shift = !!ev.shiftKey;
    // Cmd/Meta belongs to the browser and the OS (copy, paste, tab switching).
    if (ev.metaKey) return null;
    // Ctrl-Shift-C / Ctrl-Shift-V are a terminal's copy and paste.
    if (ctrl && shift && /^[cv]$/i.test(key)) return null;
    const mods = (shift ? 1 : 0) + (alt ? 2 : 0) + (ctrl ? 4 : 0);
    const meta = bytes => (alt ? [ESC, ...bytes] : bytes);

    if (key in CURSOR) {
        const final = CURSOR[key].charCodeAt(0);
        if (mods) return [...CSI, ...ascii(`1;${1 + mods}`), final];
        return [...(mode.applicationCursor ? SS3 : CSI), final];
    }
    if (key in TILDE) {
        const n = TILDE[key];
        return [...CSI, ...ascii(mods ? `${n};${1 + mods}` : `${n}`), 0x7e];
    }
    if (key in SS3_FKEYS) {
        const final = SS3_FKEYS[key].charCodeAt(0);
        return mods ? [...CSI, ...ascii(`1;${1 + mods}`), final] : [...SS3, final];
    }
    switch (key) {
    case 'Enter': return meta([0x0d]);
    case 'Backspace': return meta([ctrl ? 0x08 : 0x7f]);
    case 'Tab': return shift ? [...CSI, 0x5a] : meta([0x09]);
    case 'Escape': return [ESC];
    }

    if (ctrl && !alt) {
        // Ctrl-letter by the letter the layout produced; a non-Latin layout
        // reports its own letter in `key`, so fall back to the physical key.
        let letter = /^[a-z]$/i.test(key) ? key : null;
        if (!letter && /^Key[A-Z]$/.test(ev.code || '') && !isPunct(key)) letter = ev.code.slice(3);
        if (letter) return [letter.toUpperCase().charCodeAt(0) - 0x40];
        if (key in CTRL_PUNCT) return [CTRL_PUNCT[key]];
        return null;
    }
    if (ctrl && alt) {
        // AltGr on many layouts arrives as Ctrl+Alt with the composed character
        // in `key` ("@" on German Q, "{" on 7 …): that is text, not a chord.
        if (isPrintable(key) && !/^[a-z]$/i.test(key)) return textToBytes(key);
        if (/^[a-z]$/i.test(key)) return [ESC, key.toUpperCase().charCodeAt(0) - 0x40];
        return null;
    }
    if (isPrintable(key)) return meta(textToBytes(key));
    return null;                          // Shift, Dead, Process, Unidentified, CapsLock …
}

function isPunct (key) {
    return typeof key === 'string' && key.length === 1 && key in CTRL_PUNCT;
}

/**
 * Pasted text → bytes. Line ends become CR, as a keyboard's Enter would send
 * (xterm does the same); with bracketed paste on (the guest set DECSET 2004)
 * the text is wrapped in ESC [ 200~ … ESC [ 201~ so an editor knows it was
 * pasted, not typed.
 *
 * @param {string} text
 * @param {{bracketed?: boolean}} [mode]
 * @returns {number[]}
 */
export function pasteToBytes (text, mode = {}) {
    const body = textToBytes(String(text).replace(/\r?\n/g, '\r'));
    return mode.bracketed ? [...CSI, ...ascii('200~'), ...body, ...CSI, ...ascii('201~')] : body;
}

export default keyToBytes;
