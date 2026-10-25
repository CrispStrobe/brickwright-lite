/*
 * boards/rp2040/board.h — the RP2040's recorded numbers.
 *
 * Derivations are in the comments and test/test_tower.c re-computes every one
 * of them. No pico-sdk header may appear in this file: the host test includes
 * it on a machine with no SDK installed.
 */
#ifndef IRT_BOARD_H
#define IRT_BOARD_H

#define IRT_BOARD_NAME "rp2040"

/*
 * 125 MHz, the pico-sdk default system clock, from a 12 MHz crystal through
 * the system PLL. Crystal, not an RC oscillator: the clock error is the
 * crystal's, typically +/- 30 ppm, so on this board the divisor quantisation
 * below really is the dominant term — which is the opposite of the situation
 * on the ATtiny85 and is the main practical difference between the two.
 *
 * A build at another system clock is a compile error rather than a silent
 * 20 % carrier error: port.c static-asserts SYS_CLK_HZ against this.
 */
#define IRT_BOARD_CLOCK_HZ 125000000UL

/*
 * The carrier and the gate are one three-instruction PIO program (tower.pio).
 * A carrier cycle is 8 PIO cycles: 4 high, 4 low, so the duty is exactly 50 %
 * and the state machine clock must be 8 x 38 kHz = 304 kHz.
 *
 *   clkdiv = 125e6 / 304000 = 411.18421...
 *
 * The RP2040 divider is 16.8 fixed point and pico-sdk truncates the fraction,
 * so the achieved divider is 411 + 47/256 = 411.18359375 and
 *
 *   carrier = 125e6 / 411.18359375 / 8 = 38000.057 Hz   (+1.5 ppm)
 *
 * which is as close as anything here gets to exact. The recorded millihertz
 * figure is the integer form the port computes, not a rounded decimal.
 */
#define IRT_CARRIER_TARGET_HZ     38000UL
#define IRT_PIO_CYCLES_PER_PERIOD 8UL
#define IRT_PIO_CLKDIV_INT        411UL
#define IRT_PIO_CLKDIV_FRAC       47UL
#define IRT_CARRIER_DIVISOR       ((IRT_PIO_CLKDIV_INT * 256UL + IRT_PIO_CLKDIV_FRAC) \
                                   * IRT_PIO_CYCLES_PER_PERIOD)
#define IRT_CARRIER_DIVISOR_SCALE 256UL /* the divisor is 16.8 fixed point */
#define IRT_CARRIER_ACHIEVED_MHZ  38000057UL
#define IRT_CARRIER_ERROR_PPM     1

/* 4 PIO cycles high out of 8. The delay fields are patched at load time, so
 * duty is adjustable in eighths — 12.5 % to 75 % — and 50 % is the default. */
#define IRT_CARRIER_DUTY_NUM 4UL
#define IRT_CARRIER_DUTY_DEN 8UL

/*
 * Hardware gate. The state machine's `jmp pin` reads host TXD directly and the
 * CPU is not involved after init — it can be asleep, or doing something else
 * entirely. This is the case the contract calls the ideal, and it is why this
 * board is here.
 *
 * "Hardware" does not mean instantaneous: the state machine samples TXD once
 * per pass, which is 8 PIO cycles while the LED is lit and 4 while it is dark.
 * The worst case is therefore one carrier period:
 *
 *   8 / 304000.456 Hz = 26.32 us  =  6.3 % of a 416.7 us bit at 2400 baud
 *
 * and the edge always lands after a *whole* carrier cycle, never mid-cycle,
 * which is the property that matters to the receiver's integrator.
 */
#define IRT_GATE_MODE      IRT_GATE_HARDWARE
#define IRT_GATE_POLL_HZ   38000UL /* one gate decision per carrier period */
#define IRT_GATE_JITTER_NS 26316UL

/*
 * The receiver's output goes to the host's RX line in copper, so the firmware
 * is not in the receive path at all and cannot corrupt it. That is the whole
 * reason this board's run loop can be empty.
 */
#define IRT_RX_WIRED_THROUGH 1

/* GPIO numbers. Any two will do; these are convenient on a Pico header. */
#define IRT_PIN_LED  2 /* GP2  -> LED anode via resistor (or transistor base) */
#define IRT_PIN_TXD  3 /* GP3  <- host TXD, and the state machine's jmp pin   */
#define IRT_PIN_RECV 4 /* GP4  <- TSOP OUT, for a firmware that wants to see  */
                       /*         it; the copper path to the host is separate */

#endif /* IRT_BOARD_H */
