/**
 * One MakeCode simulator pin report onto the circuit's board.
 *
 * The host page (scripts/makecode/host.html) reports each output pin as
 * `{out: true, analog, value}`, value 0..1023 — pxsim's own scale for both
 * `pins.digitalWritePin` (0 or 1023) and `pins.analogWritePin` (the duty).
 *
 * A DIGITAL write is a level, as it always was. An ANALOG write is a PWM, and
 * it goes to `board.setPwm`: the board switches the pin itself at real edge
 * times (bw-board spec-updates/set-pwm.md), so an LED on the pin shows the
 * duty-cycle average, a motor turns at the duty's speed. Before that method
 * existed this bridge drove the pin on/off at half scale (`value >= 512`):
 * `analog write pin P0 to 256` lit an LED 0 mA, and 768 lit it fully.
 *
 * The carrier is 50 Hz: MakeCode's default analog period on the micro:bit and
 * Calliope is 20 ms (`pins.analogSetPeriod` changes it on silicon; the host
 * page does not report the period, so a program that changes it still reads
 * at 50 Hz here — its duty is what reaches the circuit either way). 20 ms is
 * also exactly one LED-brightness window, so the average has no window-phase
 * error.
 *
 * A board without setPwm (a bw-board pin before it) keeps the old half-scale
 * drive rather than dropping the write.
 */

/** The micro:bit/Calliope DAL default analog period, 20 ms. */
export const MAKECODE_ANALOG_HZ = 50;

/**
 * @param {{setPin: Function, setPwm?: Function}} board
 * @param {string} name the pad name (p0, a1, ...)
 * @param {{analog?: boolean, value: number}} p the host page's report
 * @returns {'pwm'|'level'} which drive was used
 */
export function driveMakeCodeOutput (board, name, p) {
    if (p.analog && typeof board.setPwm === 'function') {
        const value = Math.max(0, Math.min(1023, Number(p.value) || 0));
        if (board.setPwm(name, value / 1023 * 100, {hz: MAKECODE_ANALOG_HZ})) return 'pwm';
    }
    board.setPin(name, 'pushpull', p.value >= 512);
    return 'level';
}
