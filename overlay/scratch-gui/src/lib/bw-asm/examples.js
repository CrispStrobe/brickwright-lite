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

import {I8086_EXAMPLES} from './examples-i8086.js';

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

/** Device id → examples. Families share a set; unknown devices get none. */
export function asmExamplesFor (device) {
    const d = String(device || '').toLowerCase();
    if (/^stc/.test(d)) return STC;
    if (/^(eater6502|6502|w65c02)$/.test(d)) return EATER6502;
    if (/^(z80|zx48|zx128)$/.test(d)) return Z80;
    // The 8088 answers here too: same instruction set, same encodings, so
    // the same assembler and the same programs. Only the bus width differs,
    // and no source file can tell.
    if (/^(i8086|8086|i8088|8088)$/.test(d)) return I8086_EXAMPLES;
    return [];
}

/** Every example, with the device family it belongs to — for the gate. */
export const ALL_ASM_EXAMPLES = [
    ...STC.map(e => ({...e, target: 'stc12c5a60s2'})),
    ...EATER6502.map(e => ({...e, target: 'eater6502'})),
    ...Z80.map(e => ({...e, target: 'z80'})),
    ...I8086_EXAMPLES.map(e => ({...e, target: 'i8086'}))
];

/**
 * The examples assembled LOCALLY, so a gate can tell the two populations
 * apart without re-deriving the routing rule. The hosted ones skip when
 * there is no network; these never have an excuse.
 */
export const LOCAL_ASM_EXAMPLES = I8086_EXAMPLES.map(e => ({...e, target: 'i8086'}));

export default asmExamplesFor;
