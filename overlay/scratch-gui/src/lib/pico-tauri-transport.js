// Brickwright: the Tauri half of Pico deploy. picoRepl (sb3-creator's
// transport-agnostic MicroPython raw-REPL codec) speaks {write, read, close};
// on the web that transport is WebSerial, here it is four invoke() commands
// backed by the Rust serialport crate — which is what makes deploy work on
// Safari-engine webviews and on Windows without drivers.
//
// The UI side decides when to call this; everything here is a no-op outside
// Tauri (window.__TAURI__ absent → available() is false).

const invoke = (...args) => window.__TAURI__.core.invoke(...args);

export const available = () =>
    typeof window !== 'undefined' &&
    !!(window.__TAURI__ && window.__TAURI__.core);

/** @returns {Promise<string[]>} candidate serial ports (callout devices only) */
export const listPorts = () => invoke('pico_serial_list');

/** True when a Pico in BOOTSEL mode is mounted (its RPI-RP2 volume found). */
export const bootselVolume = () => invoke('pico_bootsel_volume');

/**
 * Write a .uf2 to the mounted BOOTSEL volume — first-time flashing
 * (MicroPython itself, or a baked firmware+littlefs image).
 * @param {Uint8Array} uf2
 * @returns {Promise<string>} human-readable result
 */
export const flashUf2 = uf2 => {
    let binary = '';
    for (let i = 0; i < uf2.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, uf2.subarray(i, i + 0x8000));
    }
    return invoke('pico_flash_uf2', {uf2Base64: btoa(binary)});
};

/**
 * Open a port and wrap it in the Transport shape picoRepl consumes.
 * The Rust read has a 50 ms timeout returning '' — picoRepl polls, so map
 * empty reads to a small delay to avoid a hot loop.
 * @param {string} path — one of listPorts()
 * @param {number} [baud]
 */
export const openTransport = async (path, baud) => {
    await invoke('pico_serial_open', {path, baud});
    return {
        write: data => invoke('pico_serial_write', {data}),
        read: async () => {
            const chunk = await invoke('pico_serial_read');
            if (chunk === '') {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            return chunk;
        },
        close: () => invoke('pico_serial_close')
    };
};
