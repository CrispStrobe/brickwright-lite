/**
 * A clean-room RP2040 boot ROM, built from the datasheet.
 *
 * WHY THIS FILE EXISTS AT ALL, since "just use the real one" is the
 * obvious answer and it is closed:
 *
 * Raspberry Pi's bootrom is BSD-3 — except `mufplib.S`, which carries
 * "Raspberry Pi (Trading) Ltd hereby grants to you a non-exclusive
 * license to use the software SOLELY ON A RASPBERRY PI RP2040 DEVICE. No
 * other use is permitted", or GPLv2 from the copyright owner. An emulator
 * is not an RP2040 device, and GPL cannot be bundled into a repo whose
 * whole premise is a permissive base. So the compiled 16 KB blob cannot
 * ship here, under either of the licences offered, and asking a user to
 * supply one does not change what the licence says.
 *
 * What CAN be done is what this repo already does for the SSD1306 and the
 * ATmega32U4: implement the documented behaviour. This is RP2040
 * datasheet section 2.8 — the ROM's fixed header, its function-lookup
 * table, and the handful of routines the SDK's startup actually calls —
 * written here as Thumb machine code. None of Raspberry Pi's code is
 * copied; the datasheet describes an interface and this satisfies it.
 *
 * WHAT IT IS NOT. This is not the real bootrom. There is no USB mass
 * storage, no `reset_usb_boot`, no floating-point library (mufplib is
 * exactly the part that is not free, and a firmware that calls it will
 * not get it here). It is the minimum that lets a flash image start.
 *
 * @module
 */

/** The ROM is 16 KB and lives at 0. */
export const BOOTROM_SIZE = 0x4000;

/**
 * Function-table codes, as the datasheet spells them: two ASCII
 * characters packed little-endian, so 'M','C' is `rom_func_lookup('MC')`.
 */
const code = (a, b) => a.charCodeAt(0) | (b.charCodeAt(0) << 8);
export const ROM_FUNC = {
    MEMCPY: code('M', 'C'),
    MEMCPY44: code('C', '4'),
    MEMSET: code('M', 'S'),
    MEMSET4: code('S', '4')
};

/** Assemble 16-bit Thumb halfwords into the image at a byte offset. */
function emit (view, offset, halfwords) {
    halfwords.forEach((hw, i) => view.setUint16(offset + i * 2, hw, true));
    return offset + halfwords.length * 2;
}

/**
 * Build the ROM image.
 *
 * Layout follows the datasheet's fixed offsets exactly, because the SDK
 * reads them by address and nothing else identifies them:
 *
 *   0x00  initial SP        0x10  'M','u', version, reserved
 *   0x04  reset vector      0x14  u16 → function table
 *   0x08  NMI               0x16  u16 → data table
 *   0x0c  HardFault         0x18  u16 → table lookup routine
 *
 * @returns {Uint8Array} 16 KB, ready to be written at address 0
 */
export function buildBootrom () {
    const rom = new Uint8Array(BOOTROM_SIZE);
    const view = new DataView(rom.buffer);

    // Routines are laid out from 0x100; the header points at them.
    let pc = 0x100;

    // ── rom_table_lookup(r0 = table, r1 = code) → r0 = entry, or 0 ──────
    //
    // The table is (u16 code, u16 value) pairs ending in a zero code. The
    // SDK calls this through the pointer at 0x18, so the ADDRESS matters
    // and the implementation does not.
    const lookup = pc;
    pc = emit(view, pc, [
        0x8802,             // ldrh r2, [r0, #0]     ; entry code
        0x2a00,             // cmp  r2, #0
        0xd003,             // beq  .notfound        ; +3: `movs r0,#0`, not the
                            //                         `bx lr` after it, which
                            //                         returns the TABLE pointer
        0x428a,             // cmp  r2, r1
        0xd003,             // beq  .found
        0x3004,             // adds r0, #4           ; next pair
        0xe7f8,             // b    .loop
        0x2000,             // .notfound: movs r0, #0
        0x4770,             // bx   lr
        0x8840,             // .found: ldrh r0, [r0, #2]
        0x4770              // bx   lr
    ]);

    // ── memcpy(r0 = dst, r1 = src, r2 = n) → r0 = dst ───────────────────
    //
    // Byte at a time. The real ROM is word-optimised; a copy that is
    // correct and slow is the right trade in an emulator, where the cost
    // is JS instructions and not silicon cycles.
    const memcpy = pc;
    pc = emit(view, pc, [
        0xb510,             // push {r4, lr}
        0x0004,             // movs r4, r0           ; keep dst to return
        0x2a00,             // .loop: cmp r2, #0
        // +5, not +3. The branch is counted from PC+4 (two halfwords
        // ahead), so a miscount lands INSIDE the loop body — here it
        // reached `subs r2, #1`, took the count to -1 and copied for
        // ever. The bytes already copied stay correct, which is why a
        // test that only checks the destination passes: the tell is that
        // the routine never returns.
        0xd005,             // beq  .done
        0x780b,             // ldrb r3, [r1, #0]
        0x7003,             // strb r3, [r0, #0]
        0x3001,             // adds r0, #1
        0x3101,             // adds r1, #1
        0x3a01,             // subs r2, #1
        0xe7f7,             // b    .loop
        0x0020,             // .done: movs r0, r4
        0xbd10              // pop  {r4, pc}
    ]);

    // ── memset(r0 = dst, r1 = value, r2 = n) → r0 = dst ─────────────────
    const memset = pc;
    pc = emit(view, pc, [
        0xb510,             // push {r4, lr}
        0x0004,             // movs r4, r0
        0x2a00,             // .loop: cmp r2, #0
        0xd003,             // beq  .done            ; +3, counted from PC+4
        0x7001,             // strb r1, [r0, #0]
        0x3001,             // adds r0, #1
        0x3a01,             // subs r2, #1
        0xe7f9,             // b    .loop
        0x0020,             // .done: movs r0, r4
        0xbd10              // pop  {r4, pc}
    ]);

    // A reset handler that goes nowhere: we boot from flash, and this
    // exists so the vector table is not a pointer to zero.
    const spin = pc;
    pc = emit(view, pc, [0xe7fe]);          // b .

    // ── the function table ─────────────────────────────────────────────
    //
    // Thumb entry points carry their low bit set. The table stores the
    // address the caller will `blx` to, so the bit belongs here.
    const table = (pc + 3) & ~3;
    const thumb = addr => (addr | 1) & 0xffff;
    const entries = [
        [ROM_FUNC.MEMCPY, thumb(memcpy)],
        [ROM_FUNC.MEMCPY44, thumb(memcpy)],
        [ROM_FUNC.MEMSET, thumb(memset)],
        [ROM_FUNC.MEMSET4, thumb(memset)]
    ];
    let at = table;
    for (const [c, addr] of entries) {
        view.setUint16(at, c, true);
        view.setUint16(at + 2, addr, true);
        at += 4;
    }
    view.setUint32(at, 0, true);            // terminator
    const dataTable = at + 4;
    view.setUint32(dataTable, 0, true);     // an empty data table, terminated

    // ── the fixed header ───────────────────────────────────────────────
    view.setUint32(0x00, 0x20042000, true);         // initial SP: top of SRAM
    view.setUint32(0x04, thumb(spin), true);        // reset
    view.setUint32(0x08, thumb(spin), true);        // NMI
    view.setUint32(0x0c, thumb(spin), true);        // HardFault
    rom[0x10] = 0x4d;                               // 'M'
    rom[0x11] = 0x75;                               // 'u'
    rom[0x12] = 0x01;                               // version 1
    rom[0x13] = 0x00;
    view.setUint16(0x14, table, true);
    view.setUint16(0x16, dataTable, true);
    view.setUint16(0x18, thumb(lookup), true);
    return rom;
}

export default buildBootrom;
