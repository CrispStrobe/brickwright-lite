// Browser KeyboardEvent.code -> IBM PC set-1 make byte. The 386 console sends
// breaks by ORing 0x80, with an E0 prefix for the enhanced-keyboard cluster.
export const PC_SET1 = Object.freeze({
    Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05,
    Digit5: 0x06, Digit6: 0x07, Digit7: 0x08, Digit8: 0x09, Digit9: 0x0a,
    Digit0: 0x0b, Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f,
    KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15,
    KeyU: 0x16, KeyI: 0x17, KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1a,
    BracketRight: 0x1b, Enter: 0x1c, ControlLeft: 0x1d,
    KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23,
    KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28,
    Backquote: 0x29, ShiftLeft: 0x2a, Backslash: 0x2b,
    KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30,
    KeyN: 0x31, KeyM: 0x32, Comma: 0x33, Period: 0x34, Slash: 0x35,
    ShiftRight: 0x36, NumpadMultiply: 0x37, AltLeft: 0x38, Space: 0x39,
    CapsLock: 0x3a, F1: 0x3b, F2: 0x3c, F3: 0x3d, F4: 0x3e, F5: 0x3f,
    F6: 0x40, F7: 0x41, F8: 0x42, F9: 0x43, F10: 0x44,
    NumLock: 0x45, ScrollLock: 0x46,
    Home: 0x47, ArrowUp: 0x48, PageUp: 0x49, ArrowLeft: 0x4b,
    ArrowRight: 0x4d, End: 0x4f, ArrowDown: 0x50, PageDown: 0x51,
    Insert: 0x52, Delete: 0x53,
});

// Additional keys are enabled only for the enhanced AT keyboard. Preserve the
// original XT lookup (including its unsupported-key refusals).
const AT_SET1 = Object.freeze({
    Numpad7: 0x47, Numpad8: 0x48, Numpad9: 0x49, NumpadSubtract: 0x4a,
    Numpad4: 0x4b, Numpad5: 0x4c, Numpad6: 0x4d, NumpadAdd: 0x4e,
    Numpad1: 0x4f, Numpad2: 0x50, Numpad3: 0x51, Numpad0: 0x52,
    NumpadDecimal: 0x53, F11: 0x57, F12: 0x58,
    ControlRight: 0x1d, AltRight: 0x38, NumpadEnter: 0x1c, NumpadDivide: 0x35,
});

export const pcSet1Make = code => PC_SET1[code] ?? null;

// These share a trailing byte with a distinct non-extended key. Preserve the
// prefix on both make and break so right Ctrl is not left Ctrl, and arrows
// are not keypad digits when Num Lock is enabled.
const EXTENDED = new Set([
    'ControlRight', 'AltRight', 'NumpadEnter', 'NumpadDivide',
    'Home', 'ArrowUp', 'PageUp', 'ArrowLeft', 'ArrowRight',
    'End', 'ArrowDown', 'PageDown', 'Insert', 'Delete'
]);

export const pcSet1Bytes = (code, down = true, extended = true) => {
    const make = pcSet1Make(code) ?? (extended ? AT_SET1[code] ?? null : null);
    if (make == null) return null;
    const byte = down ? make : make | 0x80;
    return extended && EXTENDED.has(code) ? [0xe0, byte] : [byte];
};
