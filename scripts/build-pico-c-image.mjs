/**
 * Compile generateC's Pico output into a flat flash image (and the equivalent
 * UF2) that the rp2040js boot harness runs — the missing half of "the C side
 * EXECUTED, not parsed" (plan N11 / N11a).
 *
 * WHAT THE EMITTER GIVES US, AND WHY IT IS ALREADY FREESTANDING. generateC for
 * DEVICE PICO emits a Cortex-M0+ program that includes only <stdint.h> and
 * reaches the hardware through raw MMIO macros (BW_MMIO(addr)) — no pico-sdk, no
 * libc. Its own header says so ("Freestanding Cortex-M0+: no SDK, no headers")
 * and it is written for this emulator ("this build runs without a bootrom, so do
 * it here"; "the emulator fast-forwards the sleep"). It ENTERS AT main() — its
 * comment notes the reset/SP slots are unused because "this SRAM build enters at
 * main, not via a reset fetch" — and it installs its OWN vector table (the TIMER
 * wake IRQ) at runtime via VTOR.
 *
 * SO THE ONLY GLUE THIS ADDS is (1) an INITIAL boot vector — the two words the
 * rp2040js harness fetches to start the core (SP, then reset) — pointing reset at
 * a tiny shim that zeroes .bss and calls main(); and (2) a linker script that
 * places .text/.rodata in flash at 0x10000000 (after the 256-byte stage-2 gap,
 * so the boot vector lands at 0x10000100 = the harness's VECTOR_TABLE) and .bss
 * in SRAM. The harness runs it with `entry: 'vector'`, which jumps straight at
 * that boot vector and never touches the clean-room bootrom — a freestanding pin
 * program makes no ROM calls, so the incomplete-bootrom wall (Kaluma's
 * rom_table_lookup hang) does not apply. This is an ORACLE for the emitted C's
 * GPIO logic, not a silicon stage-2 boot claim.
 *
 * The toolchain is arm-none-eabi-gcc (the box's, or the sha-pinned 13.2.rel1
 * fetched in CI — see scripts/sync-arm-toolchain.mjs). objcopy/ld are taken from
 * beside the given gcc, never from PATH, so a stray host binutils cannot leak in.
 */
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const FLASH_BASE = 0x10000000;
const BOOT_VECTOR_ADDR = 0x10000100;   // == the harness's VECTOR_TABLE
const BOOT_SP = 0x20042000;            // == the harness's BOOT_SP (top of SRAM)
const UF2_FAMILY_RP2040 = 0xe48bff56;

/* The initial boot vector + a reset shim. Two words at 0x10000100: [SP, reset].
 * reset zeroes .bss (the emitted program has statics) and calls main; if main
 * returns it spins, so a program with no forever-loop cannot fall off into a
 * fault before the differential has read its edges. main() and the program's own
 * runtime VTOR come from the emitted C — this file provides ONLY the entry. */
const BOOT_STUB = `extern int main(void);
extern unsigned __bss_start__, __bss_end__;
__attribute__((used, noreturn)) static void bw_reset(void) {
    for (unsigned *b = &__bss_start__; b < &__bss_end__; b++) *b = 0u;
    main();
    for (;;) { }
}
__attribute__((section(".boot_vectors"), used))
void (* const bw_boot_vectors[2])(void) = {
    (void (*)(void)) ${BOOT_SP}u,   /* initial SP */
    (void (*)(void)) bw_reset,      /* reset -> zero .bss, call main */
};
`;

/* .boot2 emits a 256-byte zero stage-2 gap so the boot vector lands at
 * 0x10000100; .text/.rodata/.data in flash; .bss NOLOAD in SRAM (its symbols
 * bound the zeroing loop above). objcopy takes only the flash sections, so the
 * flat image is not stretched by the 256 MB gap to SRAM. */
const LINKER_SCRIPT = `MEMORY {
  FLASH (rx)  : ORIGIN = 0x10000000, LENGTH = 0x100000
  SRAM  (rwx) : ORIGIN = 0x20000000, LENGTH = 0x42000
}
SECTIONS {
  .boot2 0x10000000 : { LONG(0); . = 0x100; } > FLASH
  .boot_vectors 0x10000100 : { KEEP(*(.boot_vectors)) } > FLASH
  .text : { *(.text*) *(.rodata*) } > FLASH
  .data : { *(.data*) } > FLASH
  .bss (NOLOAD) : { __bss_start__ = .; *(.bss*) *(COMMON); __bss_end__ = .; } > SRAM
  /DISCARD/ : { *(.ARM.*) *(.comment) *(.note*) }
}
`;

const GCC_FLAGS = ['-Os', '-ffreestanding', '-nostdlib', '-mcpu=cortex-m0plus', '-mthumb'];

/** The sibling tool beside a given gcc: arm-none-eabi-gcc -> arm-none-eabi-<t>. */
function siblingTool (gcc, tool) {
    const dir = path.dirname(gcc);
    const base = path.basename(gcc).replace(/gcc(\.exe)?$/, tool + '$1');
    return path.join(dir, base);
}

/** Pack a flat image based at FLASH_BASE into an RP2040 UF2 (256-byte payloads). */
export function packUF2 (image, base = FLASH_BASE) {
    const PAYLOAD = 256;
    const nblocks = Math.ceil(image.length / PAYLOAD) || 1;
    const out = new Uint8Array(nblocks * 512);
    const view = new DataView(out.buffer);
    for (let i = 0; i < nblocks; i++) {
        const o = i * 512;
        const off = i * PAYLOAD;
        const size = Math.min(PAYLOAD, image.length - off);
        view.setUint32(o, 0x0a324655, true);            // magicStart0
        view.setUint32(o + 4, 0x9e5d5157, true);        // magicStart1
        view.setUint32(o + 8, 0x00002000, true);        // flags: familyID present
        view.setUint32(o + 12, base + off, true);       // target address
        view.setUint32(o + 16, size, true);             // payload size
        view.setUint32(o + 20, i, true);                // block number
        view.setUint32(o + 24, nblocks, true);          // total blocks
        view.setUint32(o + 28, UF2_FAMILY_RP2040, true);// familyID
        out.set(image.subarray(off, off + size), o + 32);
        view.setUint32(o + 508, 0x0ab16f30, true);      // magicEnd
    }
    return out;
}

/**
 * Compile C source for the Pico into `{image, uf2, bytes}`:
 *  - image: flat flash image based at 0x10000000, for createPicoMachine.
 *  - uf2:   the same image packed as an RP2040 UF2 (ELF -> bin -> UF2), the
 *           shippable form and what the boot harness's parseUF2 decodes.
 * @param {string} cSource  generateC's Pico output
 * @param {{gcc: string}} opts  path to arm-none-eabi-gcc (from sync-arm-toolchain)
 */
export function buildPicoCImage (cSource, opts) {
    const gcc = opts && opts.gcc;
    if (!gcc) throw new Error('buildPicoCImage: no arm-none-eabi-gcc given');
    const objcopy = siblingTool(gcc, 'objcopy');
    const dir = mkdtempSync(path.join(tmpdir(), 'bw-pico-c-'));
    try {
        const P = (f) => path.join(dir, f);
        writeFileSync(P('prog.c'), cSource);
        writeFileSync(P('boot.c'), BOOT_STUB);
        writeFileSync(P('link.ld'), LINKER_SCRIPT);
        const run = (bin, args) => execFileSync(bin, args, {cwd: dir, stdio: ['ignore', 'pipe', 'pipe']});
        run(gcc, [...GCC_FLAGS, '-c', 'prog.c', '-o', 'prog.o']);
        run(gcc, [...GCC_FLAGS, '-c', 'boot.c', '-o', 'boot.o']);
        // gcc drives its OWN ld (from beside it), so no host linker is consulted.
        run(gcc, [...GCC_FLAGS, '-T', 'link.ld', 'boot.o', 'prog.o', '-o', 'prog.elf']);
        run(objcopy, ['-O', 'binary',
            '-j', '.boot2', '-j', '.boot_vectors', '-j', '.text', '-j', '.data',
            'prog.elf', 'prog.bin']);
        const image = new Uint8Array(readFileSync(P('prog.bin')));
        return {image, uf2: packUF2(image, FLASH_BASE), bytes: image.length};
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}
