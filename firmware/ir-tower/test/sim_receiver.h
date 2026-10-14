/*
 * sim_receiver.h — a 38 kHz IR receiver module, as a model with its datasheet
 * numbers on the outside.
 *
 * Everything in sim_receiver_cfg is a figure read off a Vishay datasheet, and
 * the point of making them parameters is the trap the contract flags: these
 * modules are designed for remote controls and some of them deliberately
 * mistake a long burst for interference. The RCX's worst case at 2400 baud is
 * a start bit plus eight zero data bits — nine bit times, 3.75 ms, 142 carrier
 * cycles of continuous burst — and whether a given part tolerates that is a
 * property of the part, not a hope.
 *
 * The model separates two things the datasheets keep separate:
 *
 *   * the integrator, which is hard and deterministic: a burst shorter than
 *     min_burst_cycles never reaches the output at all, and two bursts
 *     separated by less than min_gap_cycles merge into one. This is modelled
 *     as waveform behaviour, because that is what it is.
 *
 *   * the AGC, which is a *gain* mechanism: exceeding the datasheet's burst /
 *     gap conditions pulls the receiver's sensitivity down, costing range. It
 *     is not a mute. So violations are counted here rather than silently
 *     applied, and a test that wants the pessimistic reading sets
 *     agc_suppresses to true and asserts the damage.
 */
#ifndef SIM_RECEIVER_H
#define SIM_RECEIVER_H

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    const char *part;
    uint32_t carrier_hz;

    /* Integrator, Vishay's "minimum burst length" / "minimum gap time". */
    uint32_t min_burst_cycles;
    uint32_t min_gap_cycles;

    /* Output timing, Vishay 82459/82460 Fig. 1: the output falls td after the
     * burst starts, and the output pulse is the input burst plus or minus a
     * few carrier cycles. Both are in carrier cycles. */
    uint32_t output_delay_cycles;
    int32_t  width_bias_cycles;

    /* AGC conditions: "after each burst of length <= agc_max_burst_cycles a
     * minimum gap time is required of >= min_gap_cycles; for bursts greater
     * than that, a minimum gap time in the data stream is needed of
     * > agc_gap_multiple x burst length". */
    uint32_t agc_max_burst_cycles;
    uint32_t agc_gap_multiple;

    /* Model the AGC as a hard mute rather than a loss of range. Pessimistic;
     * off by default. */
    bool agc_suppresses;
} sim_receiver_cfg;

typedef struct {
    sim_receiver_cfg cfg;

    uint64_t t_ns;
    uint64_t last_carrier_ns;
    bool     burst_active;
    uint64_t burst_start_ns;
    uint64_t gap_start_ns;
    uint64_t prev_burst_ns;

    bool     out;               /* the OUT pin: idle high, low during a burst */
    bool     out_low;
    /* The output pulse is scheduled, not reacted to: both of its edges are
     * known functions of the burst's edges and the datasheet's td and width
     * tolerance. low_until_ns == 0 means "still burning". */
    uint64_t low_from_ns;
    uint64_t low_until_ns;
    bool     pulse_armed;
    bool     suppressed;

    /* What the test looks at afterwards. */
    uint64_t longest_burst_ns;
    uint32_t bursts;
    uint32_t agc_violations;    /* bursts over the limit with too small a gap */
    uint32_t short_burst_drops; /* bursts the integrator never let through */
    uint32_t merged_gaps;       /* gaps too short to separate two bursts */
} sim_receiver;

void sim_receiver_init(sim_receiver *r, sim_receiver_cfg cfg);
/* Advance by dt_ns with the LED drive at `led`, and return the OUT pin. */
bool sim_receiver_step(sim_receiver *r, bool led, uint32_t dt_ns);

uint32_t sim_receiver_longest_burst_cycles(const sim_receiver *r);

/*
 * The parts. Figures from:
 *   Vishay document 82459 rev. 2.4 (TSOP22.., TSOP24.., TSOP48.., TSOP44..)
 *   Vishay document 82460 rev. 2.2 (TSOP21.., TSOP23.., TSOP41.., TSOP43..,
 *                                   TSOP25.., TSOP45..)
 * both dated 23-May-2025, "SUITABLE DATA FORMAT" table and Fig. 1.
 */
extern const sim_receiver_cfg SIM_TSOP4138; /* AGC1, the permissive one */
extern const sim_receiver_cfg SIM_TSOP4838; /* AGC2, named by DiyIrTower */
extern const sim_receiver_cfg SIM_TSOP4338; /* AGC3, named by DiyIrTower */

#endif /* SIM_RECEIVER_H */
