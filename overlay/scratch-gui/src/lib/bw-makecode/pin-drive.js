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
 * The carrier is the pin's analog period as the host reports it (`periodUs`,
 * set by `pins.analogSetPeriod`), else 50 Hz: MakeCode's default analog period
 * on the micro:bit and Calliope is 20 ms, exactly one LED-brightness window.
 * Before the host reported the period (task B5) every analog pin ran at 50 Hz.
 *
 * A SERVO (`pins.servoWritePin`) is reported as `servo: angle`, and goes out as
 * the micro:bit's servo frame: 50 Hz, a 500 + angle * 2000 / 180 us pulse
 * (CODAL setServoValue, range 2000 about a 1500 us centre). pxsim leaves the
 * pin's value at 0 for a servo write, so before the host reported the angle a
 * servo pin was a 0 % PWM and the servo got no pulse (measured task B5).
 *
 * A board without setPwm (a bw-board pin before it) keeps the old half-scale
 * drive rather than dropping the write.
 */

/** The micro:bit/Calliope DAL default analog period, 20 ms. */
export const MAKECODE_ANALOG_HZ = 50;

/**
 * @param {{setPin: Function, setPwm?: Function}} board
 * @param {string} name the pad name (p0, a1, ...)
 * @param {{analog?: boolean, value: number, periodUs?: number, servo?: number}} p the host page's report
 * @returns {'servo'|'pwm'|'level'} which drive was used
 */
export function driveMakeCodeOutput (board, name, p) {
    if (p.analog && typeof board.setPwm === 'function') {
        if (p.servo !== undefined && p.servo !== null) {
            const deg = Math.max(0, Math.min(180, Number(p.servo) || 0));
            if (board.setPwm(name, 0, {hz: 50, pulseUs: 500 + deg * 2000 / 180})) return 'servo';
        }
        const value = Math.max(0, Math.min(1023, Number(p.value) || 0));
        const periodUs = Number(p.periodUs);
        const hz = periodUs > 0 ? 1e6 / periodUs : MAKECODE_ANALOG_HZ;
        if (board.setPwm(name, value / 1023 * 100, {hz})) return 'pwm';
    }
    board.setPin(name, 'pushpull', p.value >= 512);
    return 'level';
}
