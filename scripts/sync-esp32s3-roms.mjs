#!/usr/bin/env node
// Install the two ROM windows for explicit ESP32-S3 merged-flash boot.
// The exact supplier owns the source URLs, byte counts and digests; no ROM is
// fetched at browser runtime from a third-party origin.
export const NOTICE = {"name":"esp32s3-rom","licence":"Apache-2.0","holder":"Espressif Systems (Shanghai) Co., Ltd."};
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {ESP32S3_FLASH_BOOT_ROMS, ESP32S3_FLASH_BOOT_ROM_SOURCE} from 'bw-board/labwired-firmware-boot.js';
import {fetchRetry} from './lib-pin.mjs';
import {readEsp32S3RomResponse} from '../overlay/scratch-gui/src/lib/bw-debug/esp32s3-firmware.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'packages', 'scratch-gui', 'static', 'esp32s3');
const check = process.argv.includes('--check');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (!/^[0-9a-f]{40}$/.test(ESP32S3_FLASH_BOOT_ROM_SOURCE.commit)) {
    throw new Error('ESP32-S3 ROM source must name an immutable commit');
}
let stale = 0;
for (const [name, descriptor] of Object.entries(ESP32S3_FLASH_BOOT_ROMS)) {
    const url = new URL(descriptor.url);
    if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com' ||
        url.pathname !== `/${ESP32S3_FLASH_BOOT_ROM_SOURCE.repository}/${ESP32S3_FLASH_BOOT_ROM_SOURCE.commit}/${descriptor.sourcePath}` ||
        !/^[a-z0-9_]+\.bin$/.test(descriptor.filename) || !/^[0-9a-f]{64}$/.test(descriptor.sha256) ||
        !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > 512 * 1024) {
        throw new Error(`ESP32-S3 ${name}: invalid immutable ROM descriptor`);
    }
    const out = path.join(dest, descriptor.filename);
    const current = await readFile(out).catch(() => null);
    if (current?.length === descriptor.bytes && sha(current) === descriptor.sha256) {
        console.log(`  ok    ${descriptor.filename} (${descriptor.bytes} bytes, sha256 verified)`);
        continue;
    }
    stale++;
    if (check) { console.log(`  STALE ${descriptor.filename}`); continue; }
    const response = await fetchRetry(descriptor.url);
    const bytes = await readEsp32S3RomResponse({response, descriptor, name});
    if (bytes.length !== descriptor.bytes || sha(bytes) !== descriptor.sha256) {
        throw new Error(`ESP32-S3 ${name}: ROM size or SHA-256 mismatch; no unverified asset was written`);
    }
    await mkdir(dest, {recursive: true});
    await writeFile(out, bytes);
    console.log(`  wrote ${descriptor.filename} (${bytes.length} bytes, sha256 verified)`);
}
if (check && stale) throw new Error(`${stale} ESP32-S3 ROM asset(s) stale; run npm run sync:esp32s3roms`);
console.log(`ESP32-S3 ROMs verified from ${ESP32S3_FLASH_BOOT_ROM_SOURCE.repository}@${ESP32S3_FLASH_BOOT_ROM_SOURCE.commit}.`);
