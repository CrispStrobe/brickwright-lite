/**
 * Starter programs for the ASM tab.
 *
 * The tab has a reference panel and a working assemble path, and an empty
 * editor — which is a wall for anyone who has not written 8051 or 6502
 * assembly before. These are the three shapes every beginner needs first:
 * drive a pin, read one, and waste a measured amount of time.
 *
 * EVERY ONE OF THESE ASSEMBLES. They are not illustrative snippets: each
 * was posted to the same hosted assembler the ▶ button uses, and
 * `test/asm-examples.test.mjs` posts them again. An example that does not
 * build is worse than no example, because the reader cannot tell whether
 * they mistyped it or it was always wrong.
 *
 * Syntax is per-assembler and they do not agree:
 *   8051   sdas8051  — `.area`, `.org`, `#` immediates, `mov P1, #0x00`
 *   6502   ca65      — `.segment`, `$` hex, `lda #$00`
 *   Z80    sdasz80   — sdas syntax again, but Z80 mnemonics
 *   8086   i8086-asm — MASM: `.MODEL`, `.DATA`, `PROC`, `INT 21h`
 *
 * THE 8086's ARE NOT LIKE THE OTHER THREE, in two ways worth stating here
 * rather than leaving to be discovered. They are assembled IN THE BROWSER
 * (`lib/bw-asm/assemble-route.js` says why one tab has two routes), so the
 * gate does not skip them when the network is absent — it assembles AND RUNS
 * every one of them. And they are not written here: they are MIT-licensed
 * files carried verbatim from a teaching corpus, attribution included, which
 * is the condition they ship under. `examples-i8086.js` holds them and the
 * terms.
 *
 * @module
 */

// THE DEFAULT EXPORT, NOT THE NAMED ONE. `I8086_EXAMPLES` is the upstream
// set that ships under Amey Thakur's attribution; the default adds the ones
// written here (the 8255 pin panel, the keyboard, mode 13h). Importing the
// named export meant those shipped in the file and were offered NOWHERE --
// the ASM tab, the gate and the local-assembly list all read this.
import I8086_ALL, {I8086_EXAMPLES} from './examples-i8086.js';

/**
 * @typedef {{id: string, label: string, labelDe: string, source: string,
 *            attribution?: {author: string, repo: string, licence: string}}} AsmExample
 */

/** ATmel-style 8051 parts: every STC device here. */
const STC = [
    {
        id: 'blink',
        label: 'Blink P1.0',
        labelDe: 'P1.0 blinken',
        source: `; Blink the LED on P1.0.
; 8051 pins are active LOW with the usual LED-to-VCC wiring, so clearing
; the bit lights it.
    .area CODE (ABS)
    .org 0x0000

main:
    cpl  P1.0           ; toggle just that pin
    acall delay
    sjmp main

; ~100 ms at 12 MHz: two nested loops, because one 8-bit counter cannot
; hold enough. The exact figure does not matter; being visible does.
delay:
    mov  r7, #200
outer:
    mov  r6, #250
inner:
    djnz r6, inner
    djnz r7, outer
    ret
`
    },
    {
        id: 'button',
        label: 'Button on P3.2 lights P1.0',
        labelDe: 'Taster an P3.2 schaltet P1.0',
        source: `; Read a button on P3.2 and mirror it to the LED on P1.0.
;
; An 8051 pin is read by writing 1 to it first: the port is quasi
; bidirectional, and a pin left low can never read high no matter what is
; wired to it. That one line is the whole trick.
    .area CODE (ABS)
    .org 0x0000

main:
    setb P3.2           ; release the pin so the button can pull it down
    jb   P3.2, released ; jump if the pin is HIGH, i.e. not pressed
    clr  P1.0           ; pressed: light the LED
    sjmp main
released:
    setb P1.0           ; not pressed: dark
    sjmp main
`
    },
    {
        id: 'count',
        label: 'Count on P1',
        labelDe: 'Auf P1 hochzählen',
        source: `; Put a rising count on the whole of port 1 — eight LEDs, binary.
; The clearest way to see that a delay loop is doing what you think.
    .area CODE (ABS)
    .org 0x0000

main:
    mov  a, #0x00
loop:
    mov  P1, a
    inc  a
    acall delay
    sjmp loop

delay:
    mov  r7, #100
outer:
    mov  r6, #250
inner:
    djnz r6, inner
    djnz r7, outer
    ret
`
    }
];

/** Ben Eater's 6502 breadboard, assembled with ca65. */
const EATER6502 = [
    {
        id: 'blink',
        label: 'Blink PB0 (65C22 port B)',
        labelDe: 'PB0 blinken (65C22 Port B)',
        source: `; Blink a LED on port B bit 0 of the 65C22 VIA.
; The VIA sits at $6000: DDRB decides direction, ORB drives the pins.
PORTB = $6000
DDRB  = $6002

    .segment "CODE"

reset:
    lda #%11111111      ; every port B pin an output
    sta DDRB

loop:
    lda #%00000001
    sta PORTB
    jsr delay
    lda #%00000000
    sta PORTB
    jsr delay
    jmp loop

; Two nested 8-bit loops. A 6502 has no 16-bit counter, so this is how
; you wait for anything a human can see.
delay:
    ldx #$ff
outer:
    ldy #$ff
inner:
    dey
    bne inner
    dex
    bne outer
    rts
`
    }
];

/** Z80 bench, assembled with sdasz80. */
const Z80 = [
    {
        id: 'blink',
        label: 'Toggle an output port',
        labelDe: 'Ausgabeport umschalten',
        source: `; Toggle every bit of output port 0x01 with a delay between.
; The Z80 talks to ports with IN/OUT rather than memory addresses, which
; is the first thing that surprises anyone arriving from the 6502.
    .area CODE (ABS)
    .org 0x0000

main:
    ld   a, #0xff
    out  (0x01), a
    call delay
    ld   a, #0x00
    out  (0x01), a
    call delay
    jr   main

; BC counts down to zero: the Z80 does have a 16-bit register pair, so
; one loop is enough where the 8051 and 6502 both need two.
delay:
    ld   bc, #0x4000
wait:
    dec  bc
    ld   a, b
    or   c
    jr   nz, wait
    ret
`
    }
];

/**
 * RV32IM examples for the RISC-V console, assembled by the LOCAL rv32 assembler
 * (bw-board/riscv-asm.js). They speak to the console through the machine's
 * Linux-style ECALL ABI — a7=64 write(fd, buf, len), a7=93 exit(code) — and each
 * has been run on the emulated core. Original to Brickwright (no upstream).
 */
const RISCV = [
    {
        id: 'rv-hello',
        label: 'Hello, RISC-V',
        labelDe: 'Hallo, RISC-V',
        source: `# Print a line over the ECALL console, then exit.
# The ABI is Linux-style: a7 selects the call (64 = write, 93 = exit).
    .globl _start
_start:
    li   a7, 64          # SYS_write
    li   a0, 1           # fd = stdout
    la   a1, msg         # buffer
    li   a2, 28          # length
    ecall
    li   a7, 93          # SYS_exit
    li   a0, 0
    ecall
    .data
msg:
    .string "Hello from RISC-V assembly!\\n"
`
    },
    {
        id: 'rv-count',
        label: 'Count 0–9',
        labelDe: 'Zähle 0–9',
        source: `# Print the digits 0..9 then a newline, one write() per character.
    .globl _start
_start:
    li   s0, 0           # i = 0
    li   s1, 10          # limit
    la   s2, ch          # a one-byte output buffer
loop:
    li   a0, 48          # '0'
    add  a0, a0, s0      # '0' + i
    sb   a0, 0(s2)
    li   a7, 64
    li   a0, 1
    mv   a1, s2
    li   a2, 1
    ecall
    addi s0, s0, 1
    blt  s0, s1, loop
    li   a0, 10          # newline
    sb   a0, 0(s2)
    li   a7, 64
    li   a0, 1
    mv   a1, s2
    li   a2, 1
    ecall
    li   a7, 93
    li   a0, 0
    ecall
    .data
ch:
    .zero 1
`
    },
    {
        id: 'rv-fib',
        label: 'Fibonacci (functions + recursion)',
        labelDe: 'Fibonacci (Funktionen + Rekursion)',
        source: `# Print the first 10 Fibonacci numbers, space-separated.
# Shows function calls (call/ret), a stack frame, and the M extension (divu/remu).
    .globl _start
_start:
    li   s0, 0           # a
    li   s1, 1           # b
    li   s2, 0           # i
    li   s3, 10          # how many
floop:
    mv   a0, s0
    call putint
    li   a0, 32          # a space
    call putchar
    add  t0, s0, s1      # next = a + b
    mv   s0, s1
    mv   s1, t0
    addi s2, s2, 1
    blt  s2, s3, floop
    li   a0, 10          # newline
    call putchar
    li   a7, 93
    li   a0, 0
    ecall

# putchar(a0): write the low byte of a0 to stdout.
putchar:
    la   t1, cbuf
    sb   a0, 0(t1)
    li   a7, 64
    li   a0, 1
    mv   a1, t1
    li   a2, 1
    ecall
    ret

# putint(a0): print a non-negative integer in decimal (recurse on a0 / 10).
putint:
    addi sp, sp, -8
    sw   ra, 4(sp)
    sw   s4, 0(sp)       # save the caller's s4; we hold this digit in it
    li   t2, 10
    remu s4, a0, t2      # this digit  = a0 % 10
    divu a0, a0, t2      # the rest    = a0 / 10
    beqz a0, digit       # nothing higher to print
    call putint          # print the higher digits first (preserves our s4)
digit:
    addi a0, s4, 48      # '0' + digit
    call putchar
    lw   s4, 0(sp)
    lw   ra, 4(sp)
    addi sp, sp, 8
    ret
    .data
cbuf:
    .zero 1
`
    }
];

/** Device id → examples. Families share a set; unknown devices get none. */
export function asmExamplesFor (device) {
    const d = String(device || '').toLowerCase();
    if (/^stc/.test(d)) return STC;
    if (/^(eater6502|6502|w65c02)$/.test(d)) return EATER6502;
    if (/^(z80|zx48|zx128)$/.test(d)) return Z80;
    // The 8088 answers here too: same instruction set, same encodings, so
    // the same assembler and the same programs. Only the bus width differs,
    // and no source file can tell.
    if (/^(i8086|8086|i8088|8088)$/.test(d)) return I8086_ALL;
    if (/^riscv(32)?$/.test(d) || /rv32/.test(d)) return RISCV;
    return [];
}

/** Every example, with the device family it belongs to — for the gate. */
export const ALL_ASM_EXAMPLES = [
    ...STC.map(e => ({...e, target: 'stc12c5a60s2'})),
    ...EATER6502.map(e => ({...e, target: 'eater6502'})),
    ...Z80.map(e => ({...e, target: 'z80'})),
    ...I8086_ALL.map(e => ({...e, target: 'i8086'})),
    ...RISCV.map(e => ({...e, target: 'riscv32'}))
];

/**
 * The examples assembled LOCALLY, so a gate can tell the two populations
 * apart without re-deriving the routing rule. The hosted ones skip when
 * there is no network; these never have an excuse.
 */
export const LOCAL_ASM_EXAMPLES = [
    ...I8086_ALL.map(e => ({...e, target: 'i8086'})),
    ...RISCV.map(e => ({...e, target: 'riscv32'}))
];

export default asmExamplesFor;
