/**
 * The UF2 → flash-image builder (N3c), on its own.
 *
 * The Pico ▶ Run path boots a flat flash image, and `parseUF2` is what turns
 * the downloaded UF2 into one. The format is a trap: each block is 512 bytes
 * but carries at most 476 payload bytes at offset 32, tagged with its OWN
 * target address — so the image is assembled BY ADDRESS, and a builder that
 * concatenates file bytes is wrong by 36 bytes per block and puts every
 * payload in the wrong place.
 *
 * These are pure and ALWAYS run: they build synthetic UF2s here, so the
 * builder is gated even on a machine that has never fetched the 650 KB
 * firmware. The one test that needs the real artefact skips BY NAME without
 * it, the same contract as pico-micropython-boot.test.mjs.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {parseUF2, ensureFirmware, FIRMWARE, CACHED_UF2} from '../scripts/probe-pico-micropython.mjs';

const FLASH_BASE = 0x10000000;

/**
 * A synthetic UF2: each block carries `size` bytes of `fill` at `addr`. Only
 * the fields parseUF2 reads are meaningful (the two start magics, addr, size,
 * payload); the rest are set to plausible values so the block is realistic.
 */
function synthUF2 (blocks) {
    const buf = new Uint8Array(blocks.length * 512);
    const view = new DataView(buf.buffer);
    blocks.forEach((b, i) => {
        const o = i * 512;
        view.setUint32(o, 0x0a324655, true);        // magicStart0
        view.setUint32(o + 4, 0x9e5d5157, true);    // magicStart1
        view.setUint32(o + 8, 0x00002000, true);    // flags: familyID present
        view.setUint32(o + 12, b.addr, true);       // targetAddr
        view.setUint32(o + 16, b.size, true);       // payloadSize
        view.setUint32(o + 20, i, true);            // blockNo
        view.setUint32(o + 24, blocks.length, true); // numBlocks
        view.setUint32(o + 28, 0xe48bff56, true);   // familyID (RP2040)
        for (let k = 0; k < b.size; k++) buf[o + 32 + k] = b.fill;
        view.setUint32(o + 508, 0x0ab16f30, true);  // magicEnd
    });
    return buf;
}

test('the image builder assembles a UF2 by target address, not by file offset', () => {
    const uf2 = synthUF2([
        {addr: FLASH_BASE, size: 256, fill: 0xaa},
        {addr: FLASH_BASE + 256, size: 256, fill: 0xbb}
    ]);
    const {blocks, base, image} = parseUF2(uf2);
    assert.equal(blocks, 2);
    assert.equal(base, FLASH_BASE);
    // Two 256-byte payloads at 0 and 256 → a 512-byte image. NOT 1024 (two
    // whole 512-byte file blocks concatenated), which is exactly the bug the
    // 36-bytes-per-block header would cause.
    assert.equal(image.length, 512, 'headers were not stripped, or addressing was ignored');
    assert.equal(image[0], 0xaa);
    assert.equal(image[255], 0xaa);
    assert.equal(image[256], 0xbb);
    assert.equal(image[511], 0xbb);
});

test('the image builder honours a gap between block addresses', () => {
    // Block 1 lands 512 bytes after block 0 starts, but block 0 is only 256
    // bytes of payload — so there is a 256-byte hole that must be zero, and the
    // image must be 768 long. A file-offset assembler packs them tight and gets
    // both the length and the second payload's position wrong.
    const uf2 = synthUF2([
        {addr: FLASH_BASE, size: 256, fill: 0xaa},
        {addr: FLASH_BASE + 512, size: 256, fill: 0xbb}
    ]);
    const {image} = parseUF2(uf2);
    assert.equal(image.length, 768);
    assert.equal(image[0], 0xaa);
    assert.equal(image[256], 0x00, 'the gap between blocks was not left as zero');
    assert.equal(image[511], 0x00);
    assert.equal(image[512], 0xbb);
    assert.equal(image[767], 0xbb);
});

test('a block with bad magic is rejected, not silently skipped', () => {
    const uf2 = synthUF2([{addr: FLASH_BASE, size: 16, fill: 0x11}]);
    new DataView(uf2.buffer).setUint32(0, 0xdeadbeef, true); // corrupt magicStart0
    assert.throws(() => parseUF2(uf2), /bad magic/,
        'a corrupt block was assembled into the image instead of throwing');
});

const SKIP = !existsSync(CACHED_UF2)
    ? `needs ${FIRMWARE.file} — run \`npm run sync:picomicropython\` (650 KB, sha256-pinned, gitignored)`
    : false;

if (SKIP) {
    process.stderr.write(`[bw gate] pico-image-builder: SKIPPING 1 test — ${SKIP}\n`);
}

test('the real firmware parses to a flash image based at 0x10000000', {skip: SKIP}, async () => {
    const uf2 = await ensureFirmware({offline: true, quiet: true});
    const {base, image} = parseUF2(uf2);
    assert.equal(base, FLASH_BASE, 'the firmware image is not based at flash');
    // The measured size of RPI_PICO-20240222-v1.22.2. A change here means the
    // pin moved — which the sha256 in ensureFirmware would already have caught.
    assert.equal(image.length, 325120, `firmware image size changed — is the pin still ${FIRMWARE.version}?`);
});
