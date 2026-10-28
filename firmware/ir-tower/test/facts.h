/*
 * facts.h — every board's recorded numbers, in one table the test can walk.
 *
 * Each boards/<name>/board.h is compiled into its own facts_<name>.o with
 * that board's directory on the include path, because a board header is
 * allowed to be parochial about names like IRT_CARRIER_DIVISOR and three of
 * them cannot be included into one translation unit. The MCU headers stay out
 * of board.h precisely so that this works on a laptop with no SDK.
 */
#ifndef IRT_FACTS_H
#define IRT_FACTS_H

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    const char *name;
    uint64_t    clock_hz;
    uint32_t    target_hz;
    /*
     * The board's divider, and the scale it is expressed in: 1 where the
     * divisor counts whole clocks (a timer's TOP), 256 where it is fixed
     * point (the RP2040's 16.8 PIO divider, times the cycles per period).
     * achieved_mhz must come out as clock_hz * 1000 * scale / divisor.
     */
    uint64_t    divisor;
    uint32_t    divisor_scale;
    uint64_t    achieved_mhz;
    int32_t     error_ppm;
    uint32_t    duty_num;
    uint32_t    duty_den;
    uint8_t     gate_mode;
    uint32_t    poll_hz;
    uint32_t    jitter_ns;
    bool        rx_wired_through;
} irt_board_facts;

extern const irt_board_facts irt_facts_attiny85;
extern const irt_board_facts irt_facts_host_sim;
extern const irt_board_facts irt_facts_rp2040;

#endif /* IRT_FACTS_H */
