/*
 * host_sim.h — the host port's bench controls.
 *
 * Only the test includes this. It is the seam where a simulated desk is
 * screwed onto the real driver: set the TXD line, advance time, read what the
 * LED did.
 */
#ifndef IRT_HOST_SIM_H
#define IRT_HOST_SIM_H

#include <stdbool.h>
#include <stdint.h>

/* Back to power-on: carrier stopped, lines idle (mark), counters zero. */
void irt_host_reset(void);

/* Advance the simulated clock. The carrier is a counter and this is what
 * clocks it; nothing in the port reads a real clock. */
void irt_host_advance_ns(uint32_t dt_ns);

void irt_host_set_tx(bool level);   /* host TXD, as the host drives it */
void irt_host_set_recv(bool level); /* the receiver module's output pin */
bool irt_host_rx_pin(void);         /* host RXD, as the tower presents it */

bool irt_host_carrier_high(void);   /* the raw carrier, ungated */
bool irt_host_led(void);            /* the LED drive: what this is all about */
uint64_t irt_host_carrier_cycles(void);

#endif /* IRT_HOST_SIM_H */
