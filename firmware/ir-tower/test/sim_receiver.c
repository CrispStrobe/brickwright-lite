#include "sim_receiver.h"

#include <string.h>

/*
 * Vishay 82460 rev. 2.2, TSOP41../TSOP21.. column (AGC1):
 *   minimum burst length 6 cycles/burst; after each burst of 6 to 68 cycles a
 *   gap time of >= 6 cycles is required; for bursts greater than 68 cycles a
 *   minimum gap time in the data stream is needed of > 1 x burst length.
 * Fig. 1: tpi >= 6/f0, 4/f0 < td < 10/f0, tpi - 3.0/f0 < tpo < tpi + 3.5/f0.
 * The worst-case corner is taken: the longest delay and the widest pulse.
 */
const sim_receiver_cfg SIM_TSOP4138 = {
    "TSOP4138", 38000u, 6u, 6u, 10u, 3, 68u, 1u, false,
};

/*
 * Vishay 82459 rev. 2.4, TSOP22../TSOP48.. column (AGC2):
 *   minimum burst length 10 cycles/burst; after each burst of 10 to 72 cycles
 *   a gap of >= 10 cycles; for bursts greater than 72 cycles, > 3 x burst.
 * Fig. 1: tpi >= 10/f0, 7/f0 < td < 13/f0, tpi -+ 4/f0.
 */
const sim_receiver_cfg SIM_TSOP4838 = {
    "TSOP4838", 38000u, 10u, 10u, 13u, 4, 72u, 3u, false,
};

/*
 * Vishay 82460 rev. 2.2, TSOP43../TSOP23.. column (AGC3):
 *   minimum burst length 6; after each burst of 6 to 40 cycles, gap >= 7; for
 *   bursts greater than 40 cycles, > 6 x burst length.
 */
const sim_receiver_cfg SIM_TSOP4338 = {
    "TSOP4338", 38000u, 6u, 7u, 10u, 3, 40u, 6u, false,
};

static uint64_t cycles_to_ns(const sim_receiver_cfg *c, uint64_t cycles)
{
    return (cycles * 1000000000ull) / c->carrier_hz;
}

static uint64_t ns_to_cycles(const sim_receiver_cfg *c, uint64_t ns)
{
    return (ns * c->carrier_hz) / 1000000000ull;
}

void sim_receiver_init(sim_receiver *r, sim_receiver_cfg cfg)
{
    memset(r, 0, sizeof(*r));
    r->cfg = cfg;
    r->out = true; /* idle high */
}

uint32_t sim_receiver_longest_burst_cycles(const sim_receiver *r)
{
    return (uint32_t)ns_to_cycles(&r->cfg, r->longest_burst_ns);
}

bool sim_receiver_step(sim_receiver *r, bool led, uint32_t dt_ns)
{
    const sim_receiver_cfg *c = &r->cfg;
    r->t_ns += dt_ns;

    if (led) {
        r->last_carrier_ns = r->t_ns;
    }

    /*
     * The band-pass and demodulator see a burst, not the individual carrier
     * pulses, so "carrier present" has to survive the low half of every cycle.
     * One and a half periods of hysteresis does that at any duty down to about
     * a third, and is far shorter than the shortest gap any data format uses.
     */
    uint64_t hold_ns = (3ull * 1000000000ull) / (2ull * c->carrier_hz);
    bool present = r->last_carrier_ns != 0 &&
                   (r->t_ns - r->last_carrier_ns) <= hold_ns;

    uint64_t td_ns = cycles_to_ns(c, c->output_delay_cycles);
    uint64_t bias_ns = c->width_bias_cycles > 0
                           ? cycles_to_ns(c, (uint64_t)c->width_bias_cycles)
                           : 0;

    if (present && !r->burst_active) {
        /*
         * A burst begins. The burst's *start* is when the carrier was first
         * seen, not now — `present` lags by the hysteresis above, and a model
         * that let that leak into the measured burst length would report 143
         * cycles where the arithmetic says 142.
         */
        uint64_t started_ns = r->last_carrier_ns;
        uint64_t gap_ns = started_ns - r->gap_start_ns;

        if (r->bursts > 0) {
            uint64_t prev_cycles = ns_to_cycles(c, r->prev_burst_ns);
            if (prev_cycles > c->agc_max_burst_cycles) {
                /* Over the datasheet's burst limit: the gap afterwards has to
                 * be a multiple of the burst, not merely the minimum. */
                if (gap_ns <= r->prev_burst_ns * c->agc_gap_multiple) {
                    r->agc_violations++;
                    if (c->agc_suppresses) {
                        r->suppressed = true;
                    }
                } else {
                    r->suppressed = false;
                }
            } else if (gap_ns >= cycles_to_ns(c, c->min_gap_cycles)) {
                r->suppressed = false;
            }

            if (gap_ns < cycles_to_ns(c, c->min_gap_cycles)) {
                /* Below the integrator's ramp-down time the output never got
                 * back up, so these two bursts are one as far as the host's
                 * UART is concerned: a framing error, not a lost bit. */
                r->merged_gaps++;
                r->low_until_ns = 0; /* stay low, do not start a new pulse */
                r->burst_active = true;
                r->burst_start_ns = started_ns;
                goto output;
            }
        }

        r->burst_active = true;
        r->burst_start_ns = started_ns;
        r->low_from_ns = started_ns + td_ns;
        r->low_until_ns = 0;
        r->pulse_armed = !r->suppressed;
    } else if (!present && r->burst_active) {
        uint64_t ended_ns = r->last_carrier_ns;
        r->burst_active = false;
        r->prev_burst_ns = ended_ns - r->burst_start_ns;
        r->gap_start_ns = ended_ns;
        r->bursts++;
        if (r->prev_burst_ns > r->longest_burst_ns) {
            r->longest_burst_ns = r->prev_burst_ns;
        }

        if (ns_to_cycles(c, r->prev_burst_ns) < c->min_burst_cycles) {
            /*
             * Too short to ramp the integrator: this burst never reaches the
             * output at all. At 4800 baud a single zero bit is 7.9 cycles,
             * which is exactly how a part with a 10-cycle minimum loses
             * firmdl3's download mode while carrying 2400 baud perfectly.
             */
            r->short_burst_drops++;
            r->pulse_armed = false;
            r->low_from_ns = 0;
            r->low_until_ns = 0;
        } else {
            /*
             * The output pulse is the burst, delayed by td and stretched by
             * the datasheet's width tolerance. Scheduling both edges rather
             * than reacting to them is what lets a burst shorter than td
             * still produce an output, which is what the part does: the
             * minimum burst length and the output delay are independent
             * figures and td may exceed a short burst.
             */
            r->low_until_ns = ended_ns + td_ns + bias_ns;
        }
    }

output:
    {
        bool low = r->pulse_armed && !r->suppressed && r->low_from_ns != 0 &&
                   r->t_ns >= r->low_from_ns &&
                   (r->low_until_ns == 0 || r->t_ns < r->low_until_ns);
        if (!low && r->low_until_ns != 0 && r->t_ns >= r->low_until_ns) {
            r->low_from_ns = 0;
            r->low_until_ns = 0;
            r->pulse_armed = false;
        }
        r->out_low = low;
        r->out = !low;
    }
    return r->out;
}
