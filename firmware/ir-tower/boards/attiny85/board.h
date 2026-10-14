/*
 * boards/attiny85/board.h — the ATtiny85's recorded numbers.
 *
 * Every figure here is derived, and the derivation is in the comment next to
 * it, because test/test_tower.c re-computes all of them from IRT_BOARD_CLOCK_HZ
 * and the divisor and fails if a constant and its derivation have drifted
 * apart. Nothing in this file may include an AVR header: the host test
 * includes it on a Mac.
 */
#ifndef IRT_BOARD_H
#define IRT_BOARD_H

#define IRT_BOARD_NAME "attiny85"

/*
 * 8 MHz from the internal RC oscillator (CKDIV8 unprogrammed), which is what
 * a bare ATtiny85 out of the tube gives you.
 *
 * The divisor error below is +/- a few hundred ppm. The *clock* error is not:
 * ATtiny25/45/85 datasheet (2586Q-AVR-08/2013) Table 21-2 gives the factory
 * calibration accuracy of this oscillator as +/- 10 %, and user calibration
 * via OSCCAL as +/- 1 %. Ten percent of 38 kHz is +/- 3.8 kHz, and a TSOP48..
 * receiver's passband is only f0/10 = 3.8 kHz wide at -3 dB (Vishay 82459
 * Fig. 5), so an uncalibrated part can sit at the edge of the passband and
 * lose most of its range while still "working" across a desk. The README says
 * what to do about it; the divisor arithmetic below is the smaller problem by
 * two orders of magnitude, and pretending otherwise would be the mistake.
 */
#define IRT_BOARD_CLOCK_HZ 8000000UL

/*
 * Timer0, fast PWM with TOP = OCR0A (WGM0[2:0] = 7), prescaler 1, output on
 * OC0B. Datasheet Table 11-5: mode 7 is fast PWM with TOP = OCRA, and the
 * output period is N * (1 + TOP) clocks.
 *
 *   8 MHz / 38 kHz = 210.526 clocks per period
 *   TOP = 210 -> 8e6 / 211 = 37914.69 Hz   (-2244 ppm, -0.22 %)
 *   TOP = 209 -> 8e6 / 210 = 38095.24 Hz   (+2505 ppm, +0.25 %)
 *
 * 210 is the closer of the two, so TOP = 210 and the period is 211 clocks.
 * Fast PWM rather than CTC-toggle because toggle mode can only ever produce
 * 50 %, and the contract wants duty to be a parameter.
 */
#define IRT_CARRIER_TARGET_HZ  38000UL
#define IRT_CARRIER_DIVISOR    211UL /* clocks per carrier period */
#define IRT_CARRIER_DIVISOR_SCALE 1UL /* the divisor counts whole clocks */
#define IRT_CARRIER_ACHIEVED_MHZ 37914691UL /* 8e9 / 211, truncated */
#define IRT_CARRIER_ERROR_PPM  (-2244) /* truncated toward zero, as the driver computes it */

/*
 * Duty: OC0B goes high at BOTTOM and low at the OCR0B match, so the high time
 * is OCR0B + 1 clocks out of 211. OCR0B = 104 gives 105/211 = 49.76 %.
 */
#define IRT_CARRIER_DUTY_NUM   105UL
#define IRT_CARRIER_DUTY_DEN   211UL

/*
 * Software gate: the AVR's timer cannot be gated by a pin, so a loop does it.
 * The loop gates the LED *pin* (its DDRB bit), never the counter, so the
 * carrier keeps its phase and the first cycle of every burst is a full cycle.
 *
 * 14 cycles is the longest of the four paths through the loop, counted off the
 * disassembly that `make disasm` prints and the instruction-cycle column of
 * the datasheet's instruction summary (RJMP 2, SBI/CBI 2, SBIS 1 or 2). The
 * whole loop is eight instructions; the README quotes it in full with the
 * count. Worst case is the path that lights the LED and forwards a receiver
 * low, which is the path that matters.
 */
#define IRT_GATE_MODE          IRT_GATE_SOFTWARE
#define IRT_GATE_LOOP_CYCLES   14UL
#define IRT_GATE_POLL_HZ       (IRT_BOARD_CLOCK_HZ / IRT_GATE_LOOP_CYCLES)
#define IRT_GATE_JITTER_NS     (1000000000UL / IRT_GATE_POLL_HZ)

/*
 * The MCU re-drives the receiver's output rather than letting it reach the
 * cable: a TSOP output is an open-collector transistor with a 30 kohm internal
 * pull-up (Vishay 80069, "Output Stage"), which is a slow edge into a metre of
 * cable. One pin and two instructions buy a push-pull 5 V line instead.
 */
#define IRT_RX_WIRED_THROUGH 0

/* Pin map (PORTB bit numbers). The LED pin is fixed by the timer; the rest is
 * board convention, and drive strength is the board's business — see README. */
#define IRT_PIN_LED  1 /* PB1 / OC0B, pin 6 */
#define IRT_PIN_TXD  2 /* PB2, pin 7  <- host TXD */
#define IRT_PIN_RECV 3 /* PB3, pin 2  <- TSOP OUT */
#define IRT_PIN_RXD  4 /* PB4, pin 3  -> host RXD */

#endif /* IRT_BOARD_H */
