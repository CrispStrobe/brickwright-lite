/*
 * sim_uart.h — a serial line, both ends of it, as a clock-driven model.
 *
 * The tower has no UART and must never grow one; this is the *host's* UART,
 * modelled so that the test can put real framed bytes on the wire and read
 * them back. Odd parity is here because RCX Internals says the RCX link is
 * "2400 baud, 8 data, odd parity, NRZ", and the 8-N-1 case is here because
 * firmdl3 raises the link to 4800 with parity off for firmware download.
 * A gate is indifferent to both, which is the property under test.
 */
#ifndef SIM_UART_H
#define SIM_UART_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef enum { SIM_PARITY_NONE = 0, SIM_PARITY_ODD = 1 } sim_parity;

typedef struct {
    uint32_t   baud;
    sim_parity parity;
} sim_uart_format;

/* RCX Internals: "bits are sent using a 2400 baud, 8 data, odd parity, NRZ
 * format". firmdl3's download mode is the second one. */
#define SIM_FORMAT_RCX      ((sim_uart_format){ 2400u, SIM_PARITY_ODD })
#define SIM_FORMAT_FIRMDL3  ((sim_uart_format){ 4800u, SIM_PARITY_NONE })

/* ------------------------------------------------------------------ sender */

typedef struct {
    sim_uart_format fmt;
    const uint8_t  *bytes;
    size_t          len;
    size_t          index;      /* next byte */
    uint32_t        bit;        /* bit within the current frame */
    uint64_t        next_edge_ns;
    uint64_t        t_ns;
    bool            line;       /* current TXD level, mark when idle */
    bool            done;
} sim_uart_tx;

void sim_uart_tx_init(sim_uart_tx *tx, sim_uart_format fmt,
                      const uint8_t *bytes, size_t len);
/* Advance and return the line level now. */
bool sim_uart_tx_step(sim_uart_tx *tx, uint32_t dt_ns);

/* --------------------------------------------------------------- receiver */

typedef struct {
    sim_uart_format fmt;
    uint64_t t_ns;
    int      state;             /* 0 = hunting for a start bit */
    uint64_t sample_at_ns;
    uint32_t bit;
    uint8_t  shift;
    bool     parity_bit;
    bool     last_line;

    uint8_t  out[512];
    size_t   out_len;
    uint32_t framing_errors;
    uint32_t parity_errors;
} sim_uart_rx;

void sim_uart_rx_init(sim_uart_rx *rx, sim_uart_format fmt);
void sim_uart_rx_step(sim_uart_rx *rx, bool line, uint32_t dt_ns);

/* True if b needs an odd-parity bit of 1 (i.e. b has an even number of ones). */
bool sim_uart_odd_parity_bit(uint8_t b);

#endif /* SIM_UART_H */
