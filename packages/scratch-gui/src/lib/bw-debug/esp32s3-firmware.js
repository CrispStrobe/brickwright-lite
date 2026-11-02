// SPDX-License-Identifier: BSD-3-Clause
// Firmware layout and ROM provenance belong to the pinned bw-board supplier.
// This browser boundary verifies the deployed ROM bytes before attachment.
const need = (ok, message) => { if (!ok) throw new Error(`ESP32-S3: ${message}`); };
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');

function boundedDescriptor (descriptor) {
    need(descriptor && /^[0-9a-f]{64}$/.test(descriptor.sha256) &&
        Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0 && descriptor.bytes <= 512 * 1024,
    'a bounded ROM with an immutable SHA-256 is required');
}

/** Fill only the declared ROM window; an oversized response is cancelled. */
export async function readEsp32S3RomResponse ({response, descriptor, name}) {
    boundedDescriptor(descriptor);
    need(response && response.body && typeof response.body.getReader === 'function',
        `${name} ROM response must provide a bounded readable stream`);
    const reader = response.body.getReader();
    const bytes = new Uint8Array(descriptor.bytes);
    let offset = 0;
    try {
        for (;;) {
            const {done, value} = await reader.read();
            if (done) break;
            need(value instanceof Uint8Array && value.length <= bytes.length - offset,
                `${name} ROM response exceeds the pinned ${descriptor.bytes}-byte window`);
            bytes.set(value, offset);
            offset += value.length;
        }
        need(offset === bytes.length, `${name} ROM must contain exactly ${descriptor.bytes} bytes`);
        return bytes;
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
}

export async function admitEsp32S3Rom ({bytes, descriptor, name}) {
    boundedDescriptor(descriptor);
    need(bytes instanceof Uint8Array && bytes.length === descriptor.bytes,
        `${name} ROM must contain exactly ${descriptor.bytes} bytes`);
    // Hash and pass the same private snapshot, even when a caller reuses its
    // buffer while Web Crypto is pending.
    const snapshot = Uint8Array.from(bytes);
    const digest = hex(await crypto.subtle.digest('SHA-256', snapshot));
    need(digest === descriptor.sha256, `${name} ROM SHA-256 does not match the pinned ROM`);
    return snapshot;
}

/** Each attach loads the two pinned assets; adapter reset reuses private copies. */
export async function loadEsp32S3Roms ({base, fetcher = fetch}) {
    need(typeof base === 'string' && base.length > 0, 'a document base URL is required');
    const {ESP32S3_FLASH_BOOT_ROMS} = await import(
        /* webpackChunkName: "labwired-firmware-boot" */ 'bw-board/labwired-firmware-boot.js');
    const rows = await Promise.all(Object.entries(ESP32S3_FLASH_BOOT_ROMS).map(async ([name, descriptor]) => {
        const url = new URL(`static/esp32s3/${descriptor.filename}`, base).href;
        const response = await fetcher(url);
        need(response.ok, `${name} ROM is unavailable; run npm run sync:esp32s3roms and rebuild`);
        const bytes = await readEsp32S3RomResponse({response, descriptor, name});
        return [name, await admitEsp32S3Rom({bytes, descriptor, name})];
    }));
    return Object.fromEntries(rows);
}
