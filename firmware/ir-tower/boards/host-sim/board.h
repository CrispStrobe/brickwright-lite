/*
 * boards/host-sim/board.h — the third board: a desk.
 *
 * Its pins are variables and its carrier is a counter, so the same driver
 * source that runs on the ATtiny85 and the RP2040 can be built for the host
 * compiler and tested to death in CI with no MCU and no LEGO hardware in the
 * room. Steps 1-3 of the contract's build order all happen here.
 *
 * Two builds come out of this one board, because there are two gate paths and
 * both have to work:
 *
 *   default                       software gate, driver forwards RX
 *   -DIRT_HOST_HARDWARE_GATE=1    the "peripheral" ANDs the pin, RX in copper
 */
#ifndef IRT_BOARD_H
#define IRT_BOARD_H

#define IRT_BOARD_NAME "host-sim"

/* The simulation's clock is one nanosecond. Not a real divider: this board
 * exists to test the driver, not an MCU's timer, and a simulated carrier that
 * quantised like somebody's timer would only be testing the simulation. */
#define IRT_BOARD_CLOCK_HZ 1000000000UL
#define IRT_CARRIER_TARGET_HZ 38000UL
/* Picoseconds per period, so that the facts table's one derivation formula —
 * clock x 1000 x scale / divisor — covers this board too rather than needing a
 * special case for the board that has no divider. */
#define IRT_CARRIER_DIVISOR 26315789UL
#define IRT_CARRIER_DIVISOR_SCALE 1000UL
#define IRT_CARRIER_ACHIEVED_MHZ 38000000UL
#define IRT_CARRIER_ERROR_PPM 0
#define IRT_CARRIER_DUTY_NUM 50UL
#define IRT_CARRIER_DUTY_DEN 100UL

#ifndef IRT_HOST_HARDWARE_GATE
#define IRT_HOST_HARDWARE_GATE 0
#endif

#if IRT_HOST_HARDWARE_GATE
#define IRT_GATE_MODE        IRT_GATE_HARDWARE
#define IRT_GATE_POLL_HZ     38000UL /* as on the RP2040: one decision a cycle */
#define IRT_GATE_JITTER_NS   26316UL
#define IRT_RX_WIRED_THROUGH 1
#else
/*
 * 20 kHz, which is the figure the contract calls comfortable: 50 us against a
 * 416.7 us bit at 2400 baud, i.e. 12 % of a bit. Deliberately the *slowest*
 * poll rate any port is allowed, so that the waveform test is exercised
 * against the worst case rather than against the ATtiny85's 571 kHz.
 */
#define IRT_GATE_MODE        IRT_GATE_SOFTWARE
#define IRT_GATE_POLL_HZ     20000UL
#define IRT_GATE_JITTER_NS   50000UL
#define IRT_RX_WIRED_THROUGH 0
#endif

#endif /* IRT_BOARD_H */
