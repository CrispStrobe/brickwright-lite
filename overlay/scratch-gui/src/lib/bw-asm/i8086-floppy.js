/**
 * Wrap an exported 8086 `.COM` in a bootable 1.44 MB floppy image (`.img`) so a
 * learner can carry the program to real PC/XT hardware or another emulator and
 * boot it, not just run it in the bench (N10).
 *
 * WHY A STUB DOS. The `.COM` the back end emits (pseudocode-8086.js) writes to
 * the screen through INT 21h — AH=02h (a character), AH=09h (a $-terminated
 * string), AH=4Ch (exit) — and reads the clock through AH=2Ch; its `wait` uses
 * the BIOS (INT 15h/86h), and its input uses the BIOS too, so a real BIOS covers
 * everything BUT INT 21h. In the bench a JS trap answers INT 21h; on bare metal
 * nothing does. So the boot sector installs a ~200-byte INT 21h handler that
 * implements exactly those four functions over the BIOS teletype (INT 10h/0Eh)
 * and tick counter (INT 1Ah), loads the `.COM` off the disk to CS:0100 the way
 * DOS's loadCom does, and jumps to it. AH=2Ch is BIOS-tick-approximate (18.2 Hz)
 * — accurate enough for the edge-counting the back end does, and a REAL DOS
 * gives the exact clock when the same disk is booted under one.
 *
 * The assembler (bw-board/i8086-asm.js) builds the boot sector; the bytes are
 * pure, so this module runs in the browser (the download) and in node (tests).
 *
 * @module
 */
import {assembleRaw} from '../bw-board/i8086-asm.js';

/** The boot sector runs at 0000:7C00, so it is assembled there — its INT 21h
 *  handler's OFFSET must be the real address the vector at 0000:0084 points to. */
const BOOT_ORG = 0x7C00;

/** 1.44 MB: 80 cylinders × 2 heads × 18 sectors × 512 bytes. */
export const FLOPPY_GEOMETRY = {cylinders: 80, heads: 2, sectors: 18, bytesPerSector: 512};
export const FLOPPY_BYTES = 80 * 2 * 18 * 512;   // 1,474,560
/** The .COM loads here on a real Pico— no, on the DOS PSP: CS=DS=ES=SS, IP=0100h. */
export const COM_LOAD_SEG = 0x0800;              // linear 0x8000, clear of the 0x7C00 boot sector
export const COM_ORG = 0x0100;

/**
 * The boot sector. `%NSECT%` is patched to the number of 512-byte sectors the
 * `.COM` occupies (max 255 — a .COM is one 64K segment, so ≤128 sectors ever).
 * MASM dialect, to match the back end's own assembly.
 */
const BOOT_SRC = `
    CLI
    XOR AX, AX
    MOV SS, AX
    MOV SP, 7C00h
    MOV DS, AX
    MOV ES, AX
    STI
    MOV [BOOTDRV], DL
    ; INT 21h -> 0000:INT21H (this sector stays resident below the loaded .COM)
    MOV WORD PTR [0084h], OFFSET INT21H
    MOV WORD PTR [0086h], 0
    ; read %NSECT% sectors from cyl 0 head 0 sector 2 (LBA 1) to 0800h:0100h
    MOV AX, 0800h
    MOV ES, AX
    MOV BX, 0100h
    MOV AH, 02h
    MOV AL, %NSECT%
    MOV CH, 0
    MOV CL, 02h
    MOV DH, 0
    MOV DL, [BOOTDRV]
    INT 13h
    JC BOOTERR
    ; run it as a .COM: every segment = the PSP segment, stack at the top, IP=0100h
    MOV AX, 0800h
    MOV DS, AX
    MOV ES, AX
    MOV SS, AX
    MOV SP, 0FFFEh
    PUSH AX
    MOV AX, 0100h
    PUSH AX
    RETF
BOOTERR:
    MOV SI, OFFSET ERRMSG
BE_L:
    MOV AL, CS:[SI]
    OR AL, AL
    JZ BE_H
    MOV AH, 0Eh
    MOV BX, 0007h
    INT 10h
    INC SI
    JMP BE_L
BE_H:
    HLT
    JMP BE_H

; --- INT 21h: the four functions the 8086 back end emits, over the BIOS ---
INT21H:
    CMP AH, 02h
    JE I21_CHR
    CMP AH, 09h
    JE I21_STR
    CMP AH, 2Ch
    JE I21_TIME
    CMP AH, 4Ch
    JE I21_EXIT
    IRET
I21_CHR:
    PUSH AX
    PUSH BX
    MOV AL, DL
    MOV AH, 0Eh
    MOV BX, 0007h
    INT 10h
    POP BX
    POP AX
    IRET
I21_STR:
    PUSH AX
    PUSH BX
    PUSH SI
    MOV SI, DX
I21_STR_L:
    MOV AL, [SI]
    CMP AL, 24h            ; '$'
    JE I21_STR_E
    MOV AH, 0Eh
    MOV BX, 0007h
    INT 10h
    INC SI
    JMP I21_STR_L
I21_STR_E:
    POP SI
    POP BX
    POP AX
    IRET
I21_TIME:
    ; Approximate DOS get-time from the BIOS 18.2 Hz tick (INT 1Ah/00h -> CX:DX).
    ; DH = seconds, DL = centiseconds; enough for the back end's edge counting.
    PUSH AX
    PUSH BX
    XOR AH, AH
    INT 1Ah                ; CX:DX = ticks
    MOV AX, DX
    XOR DX, DX
    MOV BX, 18
    DIV BX                 ; AX = seconds, DX = leftover ticks (0..17)
    MOV DH, AL             ; DH = seconds (low byte; wraps, which is fine here)
    MOV AX, DX
    MOV BX, 6
    MUL BX                 ; leftover ticks * 6 ~= centiseconds (0..102)
    MOV DL, AL
    XOR CX, CX             ; CH=hours, CL=minutes left 0 — the back end reads DH/DL
    POP BX
    POP AX
    IRET
I21_EXIT:
    CLI
    HLT
    JMP I21_EXIT

BOOTDRV DB 0
ERRMSG  DB 'boot: cannot read the program', 0Dh, 0Ah, 0
`;

/**
 * Byte-safe .COM / .img filenames from a program name (no path, no spaces).
 * @param {string} name
 */
export function comFilename (name) { return `${safeName(name)}.com`; }
export function imgFilename (name) { return `${safeName(name)}.img`; }
function safeName (name) {
    const base = String(name || 'program').replace(/\.[^.]*$/, '').toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'program';
}

/**
 * Build the bootable 1.44 MB image: the boot sector at LBA 0 (0x55AA), then the
 * `.COM` bytes from LBA 1, the rest zero.
 *
 * @param {Uint8Array} comBytes  the exact assembler output (the .COM at org 100h)
 * @returns {Uint8Array}  a 1,474,560-byte floppy image
 */
export function buildFloppyImage (comBytes) {
    const nSect = Math.ceil(comBytes.length / 512);
    if (nSect > 128) {
        throw new Error(`a .COM is one 64K segment; ${comBytes.length} bytes needs ${nSect} sectors`);
    }
    const boot = assembleRaw(BOOT_SRC.replaceAll('%NSECT%', String(nSect)), BOOT_ORG, {dialect: 'masm'});
    if (boot.length > 510) throw new Error(`boot sector is ${boot.length} bytes, over 510`);

    const img = new Uint8Array(FLOPPY_BYTES);
    img.set(boot, 0);
    img[510] = 0x55;
    img[511] = 0xaa;
    img.set(comBytes, 512);   // LBA 1 onward
    return img;
}
