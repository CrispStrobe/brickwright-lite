// WebUSB flashing of the Tang Nano 20K — the SCAFFOLD and the honest state.
//
// This DOES NOT flash, and nothing here pretends it does. Direct browser flashing
// means reimplementing, over WebUSB, what openFPGALoader does against the board's
// on-board USB→JTAG bridge:
//
//   1. requestDevice + open + claimInterface on the bridge. A 0403:6010
//      descriptor establishes FT2232 protocol compatibility, not the physical
//      bridge silicon; see usb-identification.js.
//   2. Drive JTAG through that FT2232-compatible protocol: TMS/TDI/TDO, the TAP
//      state machine.
//   3. Read IDCODE and check it is a GW2AR-18 before writing anything.
//   4. The Gowin programming sequence: SRAM (volatile, fast) vs embedded flash
//      (persistent) — erase, stream the .fs bitstream, then read back and verify.
//   5. Bounded, cancellable, and honest about a half-written flash.
//
// Every step of that can only be validated against a REAL board — exact USB
// descriptors, the bridge's command set, JTAG timing. So this module carries the
// FOUNDATION that needs no hardware to be correct (feature detection, the device
// filter, the single honest refusal) and the plan above, and NO invented
// protocol. See docs/TANG-NANO.md §TN4.
//
// Until it exists, flashing is: `bw-fpga flash design.fs` (the CLI), openFPGALoader
// directly. The native app transport remains fail-closed until its Rust commands
// exist and are validated against hardware.

import {identifyTangNanoTransport} from './usb-identification.js';

/**
 * Filters for `navigator.usb.requestDevice` — the user still picks the device.
 * Pinning the exact productId for every board revision is part of the
 * hardware-in-the-loop work, so this is a starting set, not a closed one.
 */
export const TANG_NANO_USB_FILTERS = Object.freeze([
    {vendorId: 0x0403, productId: 0x6010},   // FT2232-compatible; physical bridge unknown
    {vendorId: 0x0403, productId: 0x6011},   // Existing broad picker entry; not board identity
    {vendorId: 0x33aa}                        // Existing Sipeed-wide entry; ambiguous until captured
]);

/**
 * Does this environment expose WebUSB at all?
 * @param {Navigator} [nav]  injected for tests — Node 22 ships a read-only
 *   `navigator` global, so a test cannot swap it; passing one avoids that.
 */
export function webUsbSupported (nav = (typeof navigator !== 'undefined' ? navigator : null)) {
    return Boolean(nav && nav.usb);
}

/**
 * Ask the user to pick a Tang Nano board. Returns `{ok: true, device}` or a named
 * refusal. Selecting the device is ALL this does — it does not open, claim, or
 * program it, because the programming protocol is not implemented (see
 * {@link flashOverWebUsb}). It exists so the picker and the filter are ready and
 * tested for when the flasher is written.
 * @param {USB} [usb]  injected for tests; defaults to navigator.usb
 */
export async function requestBoard (usb = (typeof navigator !== 'undefined' ? navigator.usb : null)) {
    if (!usb || typeof usb.requestDevice !== 'function') {
        return {ok: false, code: 'no-webusb', reason: 'This browser has no WebUSB (navigator.usb).'};
    }
    try {
        const device = await usb.requestDevice({filters: [...TANG_NANO_USB_FILTERS]});
        return {ok: true, device, identification: identifyTangNanoTransport(device)};
    } catch (e) {
        return {ok: false, code: 'no-device',
            reason: (e && e.message) ? e.message : 'No board was selected.'};
    }
}

/**
 * Flash a bitstream over WebUSB. NOT IMPLEMENTED — returns a named refusal, NEVER
 * a false success. The Gowin JTAG programming sequence over the board's bridge has
 * to be written and validated against real hardware first (docs/TANG-NANO.md
 * §TN4). Until then this names the routes that DO flash, so a caller can degrade
 * to them rather than believe the board was written.
 * @returns {Promise<{ok: false, code: 'not-implemented', reason: string}>}
 */
export async function flashOverWebUsb () {
    return {ok: false, code: 'not-implemented',
        reason: 'Direct browser flashing over WebUSB is planned (the Tang Nano plan, §TN4b) but not '
            + 'built yet — it needs the Gowin JTAG programming sequence written against a real '
            + 'board. For now, flash with `bw-fpga flash design.fs`, openFPGALoader, or the native app.'};
}

/**
 * The Gowin .fs bitstream magic: 0xA5C3, written bit-for-bit in the ASCII file.
 */
export const GOWIN_MAGIC = '1010010111000011';

/**
 * VALIDATE a Gowin `.fs` bitstream — enough to know a file is one before a flasher
 * would ever send it, NOT enough to program (that is the JTAG layer that awaits
 * hardware, §TN4b). This is the honest, hardware-free half of the flasher: a
 * board must never be handed bytes that are not a bitstream for its family.
 *
 * The `.fs` is ASCII '0'/'1' (whitespace ignored): leading all-ones padding, then
 * the 0xA5C3 magic, then command words. Verified against the reference blink
 * bitstream (magic at 176 bits of padding).
 *
 * @param {string} fsText  the `.fs` file contents
 * @returns {{ok: boolean, code?: string, reason?: string, bits?: number, magicAt?: number}}
 */
export function readGowinBitstream (fsText) {
    if (typeof fsText !== 'string' || !fsText.trim()) {
        return {ok: false, code: 'empty', reason: 'No bitstream text was given.'};
    }
    const bits = fsText.replace(/[^01]/g, '');   // the file is 0/1 ASCII with newlines
    const at = bits.indexOf(GOWIN_MAGIC);
    if (at < 0) {
        return {ok: false, code: 'not-gowin',
            reason: 'No Gowin bitstream magic (0xA5C3) — this is not a .fs for this family, '
                + 'and must not be sent to the board.'};
    }
    if (/[^1]/.test(bits.slice(0, at))) {
        return {ok: false, code: 'bad-preamble',
            reason: 'The bits before the magic are not the expected all-ones padding; '
                + 'the file is malformed.'};
    }
    return {ok: true, bits: bits.length, magicAt: at};
}
