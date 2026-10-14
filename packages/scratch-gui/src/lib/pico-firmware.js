/**
 * Load the pinned MicroPython Pico UF2 the simulator boots, or say honestly
 * that it is not here.
 *
 * WHY A LOADER AND NOT AN IMPORT (the labwired-engine.js pattern)
 * --------------------------------------------------------------
 * The firmware is a 650 KB MIT binary. Committing it to serve one target is a
 * bad trade, so `npm run sync:picomicropython` fetches it — sha256-pinned —
 * into `static/pico-micropython/`, which .gitignore covers and webpack copies
 * wholesale. A checkout that has not run the sync simply does not have the
 * firmware, and still builds. So the firmware's PRESENCE is a build-time
 * choice, which makes its availability a RUNTIME question — the reason this is
 * a loader that returns null for absence rather than a bare import that would
 * make a 650 KB download a build dependency of the whole app.
 *
 * The sync already verified the sha256 before writing the asset (the pin lives
 * once, in scripts/probe-pico-micropython.mjs). The browser loads the
 * same-origin served bytes and does not re-hash — the labwired-wasm asset is
 * loaded the same way. The bytes it needs are a flat FLASH IMAGE, so it parses
 * the UF2 here (parseUF2 is pure; a drift test pins it against the probe's).
 *
 * @module
 */

/** The pinned artefact filename. Kept equal to the probe's FIRMWARE.file by
 *  test/pico-firmware-agrees.test.mjs — the sha256 pin itself lives only in the
 *  probe, so there is nothing to drift here but the name. */
export const PICO_UF2_FILE = 'RPI_PICO-20240222-v1.22.2.uf2';

/** Where the sync writes it and the build serves it from (relative to baseURI). */
export const PICO_UF2_STATIC = `static/pico-micropython/${PICO_UF2_FILE}`;

/** Flash (XIP) base — where a Pico image begins. Matches the adapter. */
export const FLASH_BASE = 0x10000000;

/**
 * Flatten a UF2 into one contiguous flash image. The format is 512-byte blocks
 * carrying at most 476 payload bytes each at their OWN target address, so a
 * naive concatenation of the file is wrong by 36 bytes per block and misplaces
 * every payload. Pure — identical logic to the probe's parseUF2, pinned equal
 * by test/pico-firmware-agrees.test.mjs.
 *
 * @param {Uint8Array} uf2
 * @returns {{blocks: number, base: number, image: Uint8Array}}
 */
export function parseUF2 (uf2) {
    const view = new DataView(uf2.buffer, uf2.byteOffset, uf2.byteLength);
    const nblocks = Math.floor(uf2.length / 512);
    let base = null;
    let image = new Uint8Array(0);
    for (let i = 0; i < nblocks; i++) {
        const o = i * 512;
        if (view.getUint32(o, true) !== 0x0a324655 || view.getUint32(o + 4, true) !== 0x9e5d5157) {
            throw new Error(`UF2 block ${i} has bad magic`);
        }
        const addr = view.getUint32(o + 12, true);
        const size = view.getUint32(o + 16, true);
        if (base === null) base = addr;
        const off = addr - base;
        if (off + size > image.length) {
            const grown = new Uint8Array(off + size);
            grown.set(image);
            image = grown;
        }
        image.set(uf2.subarray(o + 32, o + 32 + size), off);
    }
    return {blocks: nblocks, base, image};
}

/** The document base the served asset resolves against, or null outside one. */
function baseURI () {
    return (typeof document !== 'undefined' && document.baseURI)
        || (typeof location !== 'undefined' && location.href)
        || null;
}

let cachedImage = null;
let attempted = false;

/**
 * Fetch the served UF2 and return its flat flash image, or null when the
 * firmware was never synced into this build. Never throws for absence — the
 * Run refuses BY NAME on null, it does not crash.
 *
 * @returns {Promise<{image: Uint8Array, base: number}|null>}
 */
export async function loadPicoFirmware () {
    if (cachedImage) return cachedImage;
    if (attempted) return cachedImage;   // a prior failure is remembered, not retried per Run
    attempted = true;
    const base = baseURI();
    if (!base || typeof fetch !== 'function') {
        loadPicoFirmware.lastError =
            'the Pico firmware loads in the browser: it resolves the served asset against a '
            + 'document base, and there is none here.';
        return null;
    }
    try {
        const url = new URL(PICO_UF2_STATIC, base).href;
        const res = await fetch(url);
        if (!res.ok) {
            loadPicoFirmware.lastError = `HTTP ${res.status} for ${PICO_UF2_STATIC}`;
            return null;
        }
        const uf2 = new Uint8Array(await res.arrayBuffer());
        const {base: imgBase, image} = parseUF2(uf2);
        if (imgBase !== FLASH_BASE) {
            loadPicoFirmware.lastError =
                `served UF2 is based at 0x${imgBase.toString(16)}, not flash — not a Pico image`;
            return null;
        }
        cachedImage = {image, base: imgBase};
        return cachedImage;
    } catch (e) {
        loadPicoFirmware.lastError = e && e.message ? e.message : String(e);
        return null;
    }
}

let present = null;

/**
 * Cheap availability probe for the UI that decides whether to OFFER the Pico
 * ▶ Run in the simulator. A HEAD (falling back to a one-byte ranged GET for
 * hosts that answer HEAD poorly) asks the only question the button needs — is
 * the firmware deployed — without downloading 650 KB to answer yes/no. Resolves
 * false rather than throwing when the asset was never synced.
 *
 * @returns {Promise<boolean>}
 */
export async function isPicoFirmwareAvailable () {
    if (cachedImage) return true;
    if (present !== null) return present;
    const base = baseURI();
    if (!base || typeof fetch !== 'function') {
        present = false;
        return present;
    }
    const url = new URL(PICO_UF2_STATIC, base).href;
    try {
        let res = await fetch(url, {method: 'HEAD'});
        if (!res.ok) res = await fetch(url, {headers: {Range: 'bytes=0-0'}});
        present = res.ok || res.status === 206;
    } catch (e) {
        loadPicoFirmware.lastError = e && e.message ? e.message : String(e);
        present = false;
    }
    return present;
}

/** Test seam: forget the cache so a suite can exercise both branches. */
export function _resetPicoFirmwareCache () {
    cachedImage = null;
    attempted = false;
    present = null;
    delete loadPicoFirmware.lastError;
}

export default loadPicoFirmware;
