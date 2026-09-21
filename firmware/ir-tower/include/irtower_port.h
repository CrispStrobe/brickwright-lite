/*
 * irtower_port.h — the only thing a new board has to implement.
 *
 * Clean-room. Written from docs/RCX-IR-TOWER-FIRMWARE.md in this repository,
 * from Kekoa Proudfoot's "RCX Internals" (1998), and from the Vishay receiver
 * datasheets cited in ../README.md. No other firmware was consulted.
 *
 * A port supplies two things: a 38 kHz carrier it can gate, and access to the
 * two host serial lines. Everything else — what to do with them — lives in
 * src/irtower.c and is the same on every board.
 *
 * The board's *numbers* (achieved carrier, error, gate mode, poll rate) live
 * in boards/<board>/board.h, which must be includable on a host compiler with
 * no vendor SDK present: the test suite includes all three board headers at
 * once and re-derives every figure from the board's clock. Keep MCU headers
 * out of board.h and put them in port.c.
 */
#ifndef IRTOWER_PORT_H
#define IRTOWER_PORT_H

#include <stdbool.h>
#include <stdint.h>

#include "irtower.h"

/*
 * Bring up the carrier and return what was actually achieved, in millihertz.
 *
 * Millihertz rather than hertz because the interesting quantity is the error,
 * and at 38 kHz one hertz is 26 ppm — rounding the achieved frequency to an
 * integer hertz would quantise the very number this function exists to report.
 *
 * The carrier runs from here on. Ports must not start and stop the timer for
 * gating: a timer that is stopped mid-period restarts with an arbitrary phase
 * and the first cycle of every burst is then the wrong length.
 */
uint32_t irt_port_carrier_init(uint32_t carrier_hz, uint8_t duty_percent);

/* Gate the running carrier onto / off the LED pin. Idempotent. */
void irt_port_carrier_on(void);
void irt_port_carrier_off(void);

/* Host TXD, as seen at the pin: true = mark (serial one) = no light. */
bool irt_port_tx_pin_read(void);

/*
 * The receiver module's demodulated output, and the host RXD pin.
 *
 * The contract sketched only rx_pin_write(), but nothing can be written
 * without something to write: a port that does not wire the receiver straight
 * to the host's RX line needs both halves. Ports that *do* wire it through in
 * copper define IRT_RX_WIRED_THROUGH to 1 in board.h and may leave both of
 * these unimplemented — the driver will not reference them.
 *
 * Polarity is pass-through, not inverted: a TSOP receiver's output is active
 * low (Vishay 82459 Fig. 1, "Output Active Low"), it is low while a burst is
 * present, a burst is a serial zero, so the demodulated output is already TTL
 * serial of the right sense. See the README for the datasheet trail.
 */
#if !IRT_RX_WIRED_THROUGH
bool irt_port_rx_recv_read(void);
void irt_port_rx_pin_write(bool level);
#endif

/*
 * Called by irt_run() when there is nothing to do, i.e. only on a board whose
 * gate is in hardware. A port may sleep here; it must return.
 */
void irt_port_idle(void);

#endif /* IRTOWER_PORT_H */
