// arm-image.js -- a hosted ARM assembly result, made runnable.
//
// stc-compiler's /assemble returns Intel HEX for the ARM targets (it is what a
// micro:bit's DAPLink drag-flash takes). The engines that RUN ARM code here
// take something else: the STM32F030 light tier boots a flash image laid out
// from 0x08000000 with its vector table first, and rp2040js runs Thumb code
// placed in SRAM at 0x20000000. This module is the step between the two,
// kept free of React so it can be tested against the engines in Node.
//
// Which ARM devices RUN here, and on which engine. The micro:bit is absent on
// purpose: its simulator runs MicroPython, not ARM machine code, so an
// nrf52833 image assembles (and can be downloaded) but has nothing to run on.

export const ARM_ASM_RUN = Object.freeze({
    stm32f030: {kind: 'stm32f0', origin: 0x08000000},
    rp2040: {kind: 'rp2040js', origin: 0x20000000}
});

/** The engine for a hosted ARM assembly target, or null when none runs it. */
export function armRunFor (target) {
    return Object.prototype.hasOwnProperty.call(ARM_ASM_RUN, target) ? ARM_ASM_RUN[target] : null;
}

/**
 * Intel HEX text -> one contiguous image starting at `origin`. Types 00
 * (data), 01 (EOF), 04 (extended linear address) and 02 (extended segment
 * address); gaps are filled with 0xFF, as erased flash reads. Throws on a
 * bad checksum or a record below the origin, because a wrongly placed byte
 * would boot as something else entirely.
 */
export function imageFromIntelHex (text, origin) {
    const chunks = [];
    let base = 0;
    let top = origin;
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (line[0] !== ':') throw new Error(`not an Intel HEX record: ${line.slice(0, 20)}`);
        const bytes = [];
        for (let i = 1; i < line.length; i += 2) bytes.push(parseInt(line.slice(i, i + 2), 16));
        const sum = bytes.reduce((a, b) => (a + b) & 0xff, 0);
        if (sum !== 0) throw new Error(`Intel HEX checksum error: ${line.slice(0, 20)}`);
        const [count, hi, lo, type] = bytes;
        const data = bytes.slice(4, 4 + count);
        if (type === 0x00) {
            const at = base + ((hi << 8) | lo);
            if (at < origin) {
                throw new Error(`record at 0x${at.toString(16)} is below the image origin 0x${origin.toString(16)}`);
            }
            chunks.push([at, data]);
            top = Math.max(top, at + data.length);
        } else if (type === 0x01) {
            break;
        } else if (type === 0x04) {
            base = ((data[0] << 8) | data[1]) << 16;
        } else if (type === 0x02) {
            base = ((data[0] << 8) | data[1]) << 4;
        }
    }
    const image = new Uint8Array(top - origin).fill(0xff);
    for (const [at, data] of chunks) image.set(data, at - origin);
    return image;
}
