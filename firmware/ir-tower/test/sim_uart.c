#include "sim_uart.h"

#include <string.h>

static uint64_t bit_ns(sim_uart_format fmt)
{
    /* 416666 ns at 2400 baud. Nanoseconds, not floats: see host-sim/port.c. */
    return 1000000000ull / fmt.baud;
}

static uint32_t frame_bits(sim_uart_format fmt)
{
    return 1u + 8u + (fmt.parity == SIM_PARITY_NONE ? 0u : 1u) + 1u;
}

bool sim_uart_odd_parity_bit(uint8_t b)
{
    uint32_t ones = 0;
    for (uint32_t i = 0; i < 8; i++) {
        ones += (b >> i) & 1u;
    }
    return (ones % 2u) == 0u; /* make the total odd */
}

static bool frame_bit_level(sim_uart_format fmt, uint8_t byte, uint32_t bit)
{
    uint32_t parity_index = (fmt.parity == SIM_PARITY_NONE) ? 0u : 9u;
    if (bit == 0) return false;                 /* start bit: space */
    if (bit <= 8) return (byte >> (bit - 1)) & 1u; /* LSB first */
    if (parity_index && bit == parity_index) return sim_uart_odd_parity_bit(byte);
    return true;                                /* stop bit: mark */
}

void sim_uart_tx_init(sim_uart_tx *tx, sim_uart_format fmt,
                      const uint8_t *bytes, size_t len)
{
    memset(tx, 0, sizeof(*tx));
    tx->fmt = fmt;
    tx->bytes = bytes;
    tx->len = len;
    tx->line = true;
    tx->next_edge_ns = 0;
    tx->done = (len == 0);
}

bool sim_uart_tx_step(sim_uart_tx *tx, uint32_t dt_ns)
{
    tx->t_ns += dt_ns;
    if (tx->done) {
        tx->line = true;
        return tx->line;
    }

    while (tx->t_ns >= tx->next_edge_ns) {
        if (tx->index >= tx->len) {
            tx->done = true;
            tx->line = true;
            return tx->line;
        }
        tx->line = frame_bit_level(tx->fmt, tx->bytes[tx->index], tx->bit);
        tx->next_edge_ns += bit_ns(tx->fmt);
        if (++tx->bit >= frame_bits(tx->fmt)) {
            tx->bit = 0;
            tx->index++;
        }
    }
    return tx->line;
}

void sim_uart_rx_init(sim_uart_rx *rx, sim_uart_format fmt)
{
    memset(rx, 0, sizeof(*rx));
    rx->fmt = fmt;
    rx->last_line = true;
}

void sim_uart_rx_step(sim_uart_rx *rx, bool line, uint32_t dt_ns)
{
    rx->t_ns += dt_ns;
    uint64_t bit = bit_ns(rx->fmt);

    if (rx->state == 0) {
        /* Hunt for a falling edge, then sample at the middle of each bit —
         * which is what a real UART does, and the reason the receiver's fixed
         * output delay (Vishay 82459 Fig. 1: 7/f0 < td < 13/f0) costs nothing:
         * every edge of a frame is delayed by the same td and the receiver
         * re-syncs on each start bit. */
        if (rx->last_line && !line) {
            rx->state = 1;
            rx->bit = 0;
            rx->shift = 0;
            rx->parity_bit = false;
            rx->sample_at_ns = rx->t_ns + bit + bit / 2u;
        }
    } else if (rx->t_ns >= rx->sample_at_ns) {
        uint32_t parity_index = (rx->fmt.parity == SIM_PARITY_NONE) ? 0u : 8u;
        if (rx->bit < 8) {
            rx->shift |= (uint8_t)((line ? 1u : 0u) << rx->bit);
        } else if (parity_index && rx->bit == parity_index) {
            rx->parity_bit = line;
        } else {
            /* Stop bit. A space here is a framing error and the byte is junk;
             * that is how a merged burst (two bytes the receiver's integrator
             * could not separate) shows up, and the test wants to see it. */
            if (!line) {
                rx->framing_errors++;
            } else if (parity_index &&
                       rx->parity_bit != sim_uart_odd_parity_bit(rx->shift)) {
                rx->parity_errors++;
            } else if (rx->out_len < sizeof(rx->out)) {
                rx->out[rx->out_len++] = rx->shift;
            }
            rx->state = 0;
            rx->last_line = line;
            return;
        }
        rx->bit++;
        rx->sample_at_ns += bit;
    }

    rx->last_line = line;
}
