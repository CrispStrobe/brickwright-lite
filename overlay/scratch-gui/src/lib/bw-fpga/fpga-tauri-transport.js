/**
 * The native half of flashing a Tang Nano — TN4.
 *
 * A browser cannot drive USB to an FPGA, so on the web a build ends at the
 * `.fs` download and this whole module is inert (`window.__TAURI__` absent).
 * In the native (Tauri) app it invokes openFPGALoader through a Rust command,
 * the same shape `pico-tauri-transport.js` uses for the Pico's serial deploy.
 *
 * FAIL-CLOSED, and more carefully than the Pico transport. The Pico's
 * `available()` returns true whenever Tauri is present, because its Rust
 * commands ship with the app. The FPGA flash command may not — it is new, and a
 * "Flash to board" button that calls a command the app does not implement is
 * exactly the lie `target-kinds.js` warns about. So availability is PROBED: the
 * native side must answer an `fpga_flash_available` check, and anything else —
 * no Tauri, an app without the command, a probe that throws — reports
 * unavailable with a reason. The button then never appears where it cannot work.
 *
 * WHAT IS NOT HERE. The Rust `fpga_flash_available` / `fpga_flash_bitstream`
 * commands live in the Tauri app, not this repo, and flashing needs a board on
 * USB — so this JS half is unit-tested with an injected `invoke` and cannot be
 * exercised against hardware from the web build.
 *
 * @module
 */

const nativeInvoke = (...args) => window.__TAURI__.core.invoke(...args);

export function inTauri () {
    return typeof window !== 'undefined' && !!(window.__TAURI__ && window.__TAURI__.core);
}

/**
 * Is native Tang Nano flashing actually available? Probed, not assumed.
 * @returns {Promise<{available: boolean, reason?: string}>}
 */
export async function probeFlash ({invokeImpl = null} = {}) {
    const invoke = invokeImpl || (inTauri() ? nativeInvoke : null);
    if (!invoke) {
        return {available: false,
            reason: 'Flashing needs the native app; a browser can only download the .fs.'};
    }
    try {
        const ok = await invoke('fpga_flash_available', {device: 'tangnano20k'});
        return ok
            ? {available: true}
            : {available: false, reason: 'The native app does not offer Tang Nano flashing.'};
    } catch (e) {                                   // noqa
        return {available: false,
            reason: 'The native app does not expose Tang Nano flashing yet.'};
    }
}

/**
 * Flash a bitstream (base64 of the `.fs`) to the board via openFPGALoader.
 * @returns {Promise<string>} human-readable result from the native side
 */
export function flashBitstream (bitstreamBase64, {device = 'tangnano20k', invokeImpl = null} = {}) {
    const invoke = invokeImpl || nativeInvoke;
    if (!bitstreamBase64) return Promise.reject(new Error('nothing to flash'));
    return invoke('fpga_flash_bitstream', {device, bitstreamBase64});
}
