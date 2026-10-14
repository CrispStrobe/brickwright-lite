/*
 * test_tower.c — the tower on a desk with no desk.
 *
 * Steps 1-3 of the contract's build order, in CI, with no MCU and no LEGO
 * hardware: the carrier, the gate, and a loopback through a modelled receiver
 * module. The driver under test is the same src/irtower.c that the ATtiny85
 * and the RP2040 builds compile; only the port changes.
 *
 * Built twice, once per gate path — see the Makefile. The software-gated
 * build polls at 20 kHz, the slowest rate any port is allowed, so the
 * waveform assertions are made against the worst case rather than against the
 * ATtiny85's 571 kHz.
 */
#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include "facts.h"
#include "host_sim.h"
#include "irtower.h"
#include "sim_receiver.h"
#include "sim_uart.h"

/* ------------------------------------------------------------- harness --- */

static int failures;
static int checks;
static const char *current_test;

#define CHECK(cond, fmt, ...)                                                  \
    do {                                                                       \
        checks++;                                                              \
        if (!(cond)) {                                                         \
            failures++;                                                        \
            printf("  FAIL %s:%d [%s] " fmt "\n", __FILE__, __LINE__,          \
                   current_test, ##__VA_ARGS__);                               \
        }                                                                      \
    } while (0)

#define TEST(name)                                                             \
    do {                                                                       \
        current_test = name;                                                   \
        printf("- %s\n", name);                                                \
    } while (0)

/*
 * 500 ns. A carrier period is 26 316 ns and a bit at 2400 baud is 416 667 ns,
 * so this resolves the carrier to better than 2 % and the bit to 0.12 %, and
 * a 20-byte message still simulates in a fraction of a second.
 */
#define STEP_NS 500u

#define BIT_NS(baud) (1000000000ull / (baud))

/* ------------------------------------------------------- recorded numbers - */

static void check_board(const irt_board_facts *f)
{
    /*
     * Re-derive, never trust. A board's recorded carrier is only worth having
     * if it cannot drift away from the divisor it was computed from, so the
     * one formula that covers all three boards is applied to all three.
     */
    uint64_t derived = (f->clock_hz * 1000ull * f->divisor_scale) / f->divisor;
    CHECK(derived == f->achieved_mhz,
          "%s: recorded %" PRIu64 " mHz but clock/divisor give %" PRIu64,
          f->name, f->achieved_mhz, derived);

    int32_t ppm = irt_carrier_error_ppm((uint32_t)f->achieved_mhz, f->target_hz);
    CHECK(ppm == f->error_ppm, "%s: recorded %+d ppm, derived %+d ppm",
          f->name, f->error_ppm, ppm);

    /*
     * A tenth of a percent is 38 Hz; the receiver's 3 dB passband is a few
     * kHz wide (Vishay 82459 Fig. 5: delta-f = f0/10), so 1 % is the point at
     * which a board starts trading range for nothing. Every board here is at
     * least four times better than that, and the ATtiny85's own RC oscillator
     * tolerance — +/- 10 % factory, +/- 1 % calibrated — is the term that
     * actually matters on that board. See its board.h.
     */
    CHECK(ppm > -10000 && ppm < 10000, "%s: carrier error %+d ppm is over 1 %%",
          f->name, ppm);

    uint32_t duty = (f->duty_num * 100u) / f->duty_den;
    CHECK(duty >= 45u && duty <= 55u, "%s: duty %u %% is not near 50 %%",
          f->name, duty);

    /*
     * The contract's latency budget: decide within a small fraction of a bit,
     * with 20 kHz called comfortable. 20 kHz is 50 us, an eighth of a 2400
     * baud bit, so that is the bar. For scale, the receiver module's own
     * output-pulse tolerance is +/- 3.5 carrier cycles (Vishay 82460 Fig. 1),
     * i.e. +/- 92 us, so every board here is well inside the error the part
     * on the other end of the link contributes for free.
     */
    CHECK(f->poll_hz >= 20000u, "%s: gate poll rate %u Hz is under 20 kHz",
          f->name, f->poll_hz);
    uint32_t derived_jitter = (uint32_t)(1000000000ull / f->poll_hz);
    CHECK(f->jitter_ns >= derived_jitter && f->jitter_ns <= derived_jitter + 1u,
          "%s: recorded jitter %u ns, derived %u ns",
          f->name, f->jitter_ns, derived_jitter);
    CHECK(f->jitter_ns <= BIT_NS(2400) / 8u,
          "%s: worst-case edge jitter %u ns is over an eighth of a bit",
          f->name, f->jitter_ns);
}

static void test_recorded_numbers(void)
{
    TEST("recorded numbers, per board, re-derived from the board's clock");
    check_board(&irt_facts_attiny85);
    check_board(&irt_facts_host_sim);
    check_board(&irt_facts_rp2040);

    /* Neither MCU board is privileged, but they must not be identical either:
     * the pair is only worth having because one gates in hardware and one in
     * software, and if that ever collapses the port layer stopped being
     * exercised. */
    CHECK(irt_facts_attiny85.gate_mode != irt_facts_rp2040.gate_mode,
          "the two MCU boards no longer cover both gate paths");

    printf("    %-10s %12s %8s %10s %9s\n",
           "board", "carrier Hz", "ppm", "gate", "jitter ns");
    const irt_board_facts *all[] = { &irt_facts_attiny85, &irt_facts_host_sim,
                                     &irt_facts_rp2040 };
    for (size_t i = 0; i < sizeof(all) / sizeof(all[0]); i++) {
        printf("    %-10s %8" PRIu64 ".%03" PRIu64 " %+8d %10s %9u\n",
               all[i]->name, all[i]->achieved_mhz / 1000u,
               all[i]->achieved_mhz % 1000u, all[i]->error_ppm,
               all[i]->gate_mode == IRT_GATE_HARDWARE ? "hardware" : "software",
               all[i]->jitter_ns);
    }
}

/* ------------------------------------------------------------- the carrier */

/* The carrier phase, computed from the clock rather than from the port's
 * accumulator, so that the waveform assertions have an independent opinion. */
static bool expected_carrier_high(uint64_t t_ns, uint32_t hz, uint32_t duty)
{
    uint64_t phase = (t_ns * hz) % 1000000000ull;
    return (phase * 100ull) < (1000000000ull * duty);
}

static void test_carrier(void)
{
    TEST("step 1: the carrier alone, with the gate held open");

    irt_host_reset();
    irt_config cfg = { IRT_CARRIER_HZ_DEFAULT, IRT_DUTY_PERCENT_DEFAULT };
    irt_status st = irt_init(&cfg);
    CHECK(st.carrier_achieved_mhz == IRT_CARRIER_ACHIEVED_MHZ,
          "port reported %u mHz", st.carrier_achieved_mhz);

    irt_host_set_tx(false); /* space: a serial zero generates light */

    const uint64_t window_ns = 100000000ull; /* 100 ms */
    uint64_t t = 0, high_ns = 0, poll_period = 1000000000ull / IRT_GATE_POLL_HZ;
    uint64_t next_poll = 0;
    uint32_t rises = 0;
    bool prev = false;

    while (t < window_ns) {
        irt_host_advance_ns(STEP_NS);
        t += STEP_NS;
        if (t >= next_poll) {
            irt_service();
            next_poll += poll_period;
        }
        bool led = irt_host_led();
        /* Skip the first bit time: in the software-gated build the gate does
         * not open until the first poll, and that is a property of the poll
         * rate, which the jitter test measures on purpose. */
        if (t > BIT_NS(2400)) {
            if (led && !prev) rises++;
            if (led) high_ns += STEP_NS;
        }
        prev = led;
    }

    uint64_t measured_window = window_ns - BIT_NS(2400);
    uint64_t expect_cycles = (measured_window * IRT_CARRIER_HZ_DEFAULT) / 1000000000ull;
    CHECK(rises + 1 >= expect_cycles && rises <= expect_cycles + 1,
          "counted %u carrier cycles in %" PRIu64 " ns, expected about %" PRIu64,
          rises, measured_window, expect_cycles);

    uint32_t duty_pct = (uint32_t)((high_ns * 100ull) / measured_window);
    CHECK(duty_pct >= 49u && duty_pct <= 51u, "duty came out at %u %%", duty_pct);
}

/* --------------------------------------------------------------- the gate */

typedef struct {
    const uint8_t  *bytes;
    size_t          len;
    sim_uart_format fmt;
    sim_receiver_cfg rcfg;
} run_opts;

typedef struct {
    sim_uart_rx  urx;
    sim_receiver rcv;
    uint64_t     worst_gate_lag_ns; /* LED disagreeing with carrier AND NOT TXD */
    uint64_t     steps;
} run_result;

static void run(const run_opts *o, run_result *res)
{
    memset(res, 0, sizeof(*res));

    irt_host_reset();
    irt_config cfg = { IRT_CARRIER_HZ_DEFAULT, IRT_DUTY_PERCENT_DEFAULT };
    irt_init(&cfg);

    sim_uart_tx tx;
    sim_uart_tx_init(&tx, o->fmt, o->bytes, o->len);
    sim_uart_rx_init(&res->urx, o->fmt);
    sim_receiver_init(&res->rcv, o->rcfg);

    uint32_t frame_bits = 1u + 8u + (o->fmt.parity == SIM_PARITY_NONE ? 0u : 1u) + 1u;
    uint64_t total_ns = (uint64_t)(o->len + 2u) * frame_bits * BIT_NS(o->fmt.baud);

    uint64_t t = 0;
    uint64_t poll_period = 1000000000ull / IRT_GATE_POLL_HZ;
    uint64_t next_poll = 0;
    uint64_t disagree_since = 0;
    bool disagreeing = false;

    while (t < total_ns) {
        bool txd = sim_uart_tx_step(&tx, STEP_NS);
        irt_host_set_tx(txd);
        irt_host_advance_ns(STEP_NS);
        t += STEP_NS;

        bool led = irt_host_led();

        /*
         * The contract, as algebra: LED = carrier AND NOT TXD. A hardware gate
         * satisfies it at every instant; a software gate satisfies it except
         * for up to one poll period after a TXD edge, and that window is the
         * jitter the board records. Measuring it here is what turns the
         * recorded number into a claim rather than a comment.
         */
        bool ideal = expected_carrier_high(t, IRT_CARRIER_HZ_DEFAULT,
                                           IRT_DUTY_PERCENT_DEFAULT) && !txd;
        if (led != ideal) {
            if (!disagreeing) {
                disagreeing = true;
                disagree_since = t;
            }
            uint64_t lag = t - disagree_since;
            if (lag > res->worst_gate_lag_ns) res->worst_gate_lag_ns = lag;
        } else {
            disagreeing = false;
        }

        bool out = sim_receiver_step(&res->rcv, led, STEP_NS);
        irt_host_set_recv(out);

        if (t >= next_poll) {
            irt_service();
            next_poll += poll_period;
        }

        sim_uart_rx_step(&res->urx, irt_host_rx_pin(), STEP_NS);
        res->steps++;
    }
}

/* An ALIVE command as our own protocol module encodes it:
 *   55 ff 00 | Op Op' | Ck Ck'   with Op = 0x10, Ck = 0x10.
 * Chosen because it is the shortest real message and because it contains the
 * two bytes that matter to a receiver's AGC: 0x00 (the longest possible burst)
 * and 0xff (the longest possible silence). */
static const uint8_t ALIVE[] = { 0x55, 0xff, 0x00, 0x10, 0xef, 0x10, 0xef };

/* Deliberately worse than anything the protocol emits: back-to-back 0x00 puts
 * a 142-cycle burst in every frame with only the parity and stop bits between
 * them. If a part can carry this it can carry anything the RCX link does. */
static const uint8_t ALL_ZEROS[16] = { 0 };

static void test_gate_waveform(void)
{
    TEST("step 2: the LED drive is the carrier ANDed with the inverse of TXD");

    run_opts o = { ALIVE, sizeof(ALIVE), SIM_FORMAT_RCX, SIM_TSOP4138 };
    run_result r;
    run(&o, &r);

    if (IRT_GATE_MODE == IRT_GATE_HARDWARE) {
        CHECK(r.worst_gate_lag_ns == 0,
              "hardware gate disagreed with the algebra for %" PRIu64 " ns",
              r.worst_gate_lag_ns);
    } else {
        /* One poll period, plus the step the sampling itself costs. */
        uint64_t budget = IRT_GATE_JITTER_NS + STEP_NS;
        CHECK(r.worst_gate_lag_ns <= budget,
              "software gate lagged %" PRIu64 " ns, budget %" PRIu64,
              r.worst_gate_lag_ns, budget);
        CHECK(r.worst_gate_lag_ns > 0,
              "software gate showed no lag at all, which cannot be right");
    }
    printf("    worst gate lag %" PRIu64 " ns (recorded budget %lu ns)\n",
           r.worst_gate_lag_ns, (unsigned long)IRT_GATE_JITTER_NS);
}

static void test_worst_case_burst(void)
{
    TEST("the 142-cycle worst case, measured rather than assumed");

    /*
     * The longest possible run of serial zeros is a start bit plus eight zero
     * data bits. At 2400 baud that is 9 / 2400 = 3.75 ms, which is 142.5
     * carrier cycles at 38 kHz — 142 whole ones. Odd parity saves the tenth
     * bit: 0x00 has an even number of ones, so its parity bit is a one and the
     * burst ends there.
     */
    /*
     * The measurement includes whatever the gate itself adds: a software gate
     * closes up to one poll period late, which stretches the burst by up to
     * that many carrier cycles. That slack is the board's recorded jitter,
     * spent here rather than hidden, and on the hardware-gated build it is
     * zero and the figure comes out exactly.
     */
    uint32_t slack = (uint32_t)(((uint64_t)IRT_GATE_JITTER_NS * IRT_CARRIER_HZ_DEFAULT
                                 + 999999999ull) / 1000000000ull);
    if (IRT_GATE_MODE == IRT_GATE_HARDWARE) slack = 0;

    run_opts o = { ALL_ZEROS, sizeof(ALL_ZEROS), SIM_FORMAT_RCX, SIM_TSOP4138 };
    run_result r;
    run(&o, &r);
    uint32_t cycles = sim_receiver_longest_burst_cycles(&r.rcv);
    CHECK(cycles >= 142u && cycles <= 142u + slack,
          "longest burst measured %u cycles, expected 142 (+%u gate slack)",
          cycles, slack);

    /*
     * And in firmdl3's 4800 8-N-1 download mode the same byte is nine bits of
     * 208 us: 71 cycles. Which is *within* a TSOP48's 72-cycle AGC limit — the
     * faster mode is the gentler one for the AGC, and the harsher one for the
     * integrator, as the next test shows. This is the sort of thing that only
     * turns up if the tower is a gate: a decoding tower would have had to be
     * told about 4800 baud at all.
     */
    run_opts o2 = { ALL_ZEROS, sizeof(ALL_ZEROS), SIM_FORMAT_FIRMDL3, SIM_TSOP4138 };
    run(&o2, &r);
    cycles = sim_receiver_longest_burst_cycles(&r.rcv);
    CHECK(cycles >= 71u && cycles <= 71u + slack,
          "longest burst at 4800 baud measured %u cycles, expected 71 (+%u slack)",
          cycles, slack);
}

static void check_loopback(sim_receiver_cfg part, sim_uart_format fmt,
                           const uint8_t *bytes, size_t len, bool expect_clean)
{
    run_opts o = { bytes, len, fmt, part };
    run_result r;
    run(&o, &r);

    bool identical = (r.urx.out_len == len) &&
                     (memcmp(r.urx.out, bytes, len) == 0);
    if (expect_clean) {
        CHECK(identical,
              "%s at %u baud: %zu of %zu bytes back, %u framing, %u parity errors",
              part.part, fmt.baud, r.urx.out_len, len, r.urx.framing_errors,
              r.urx.parity_errors);
    } else {
        CHECK(!identical,
              "%s at %u baud returned every byte, but its datasheet says it "
              "cannot: the model or the reading of the datasheet is wrong",
              part.part, fmt.baud);
    }
    printf("    %-9s %4u baud: %2zu/%2zu bytes, %u short-burst drops, "
           "%u merges, %u AGC violations\n",
           part.part, fmt.baud, r.urx.out_len, len, r.rcv.short_burst_drops,
           r.rcv.merged_gaps, r.rcv.agc_violations);
}

static void test_loopback(void)
{
    TEST("step 3: loopback through a modelled receiver, byte for byte");

    /* At 2400 8-O-1 — the format that always works — every part carries the
     * traffic, including the pathological all-zeros case. */
    check_loopback(SIM_TSOP4138, SIM_FORMAT_RCX, ALIVE, sizeof(ALIVE), true);
    check_loopback(SIM_TSOP4838, SIM_FORMAT_RCX, ALIVE, sizeof(ALIVE), true);
    check_loopback(SIM_TSOP4338, SIM_FORMAT_RCX, ALIVE, sizeof(ALIVE), true);
    check_loopback(SIM_TSOP4138, SIM_FORMAT_RCX, ALL_ZEROS, sizeof(ALL_ZEROS), true);
    check_loopback(SIM_TSOP4838, SIM_FORMAT_RCX, ALL_ZEROS, sizeof(ALL_ZEROS), true);
}

static void test_receiver_choice_matters(void)
{
    TEST("the receiver's datasheet decides whether 4800 baud works at all");

    /*
     * A single zero bit at 4800 baud is 208 us, which is 7.9 carrier cycles.
     * The TSOP48.. family's minimum burst length is 10 cycles per burst
     * (Vishay 82459, "Suitable data format"), so its integrator never ramps
     * and the bit does not reach the output: a TSOP4838 cannot carry firmdl3's
     * download mode, however well it carries 2400 baud. The TSOP41../TSOP43..
     * families specify 6 cycles and can.
     *
     * This is the concrete reason the tower must not be a decoder. The same
     * unchanged firmware runs both modes; what has to be chosen correctly is
     * the receiver, and it is chosen from a datasheet, not from a README.
     */
    check_loopback(SIM_TSOP4838, SIM_FORMAT_FIRMDL3, ALIVE, sizeof(ALIVE), false);
    check_loopback(SIM_TSOP4138, SIM_FORMAT_FIRMDL3, ALIVE, sizeof(ALIVE), true);
    check_loopback(SIM_TSOP4338, SIM_FORMAT_FIRMDL3, ALIVE, sizeof(ALIVE), true);
}

static void test_agc_trap(void)
{
    TEST("the AGC trap: 142 cycles is outside every current Vishay part's rules");

    /*
     * The contract asks for the burst limit to be a parameter so that the
     * 142-cycle worst case is an assertion. It is, and the assertion is
     * uncomfortable: at 2400 baud the burst after a 0x00 exceeds the "after
     * each burst of length ..." row of all three parts, and the gap the RCX
     * format leaves afterwards — a parity bit and a stop bit, 31.6 cycles —
     * is nowhere near the "> N x burst length" the datasheets then require.
     *
     * The datasheets describe this as the AGC reducing sensitivity, not as a
     * mute, which is why real towers work and why the model counts violations
     * instead of dropping bytes by default. But it is a range budget being
     * spent, and a tower that works across a desk and not across a room has
     * spent it. The second half of this test is what the pessimistic reading
     * would cost.
     */
    const sim_receiver_cfg parts[] = { SIM_TSOP4138, SIM_TSOP4838, SIM_TSOP4338 };
    for (size_t i = 0; i < sizeof(parts) / sizeof(parts[0]); i++) {
        run_opts o = { ALIVE, sizeof(ALIVE), SIM_FORMAT_RCX, parts[i] };
        run_result r;
        run(&o, &r);
        CHECK(r.rcv.agc_violations > 0,
              "%s: no AGC violation seen, but 142 cycles is over its %u-cycle "
              "limit — the model has stopped modelling the trap",
              parts[i].part, parts[i].agc_max_burst_cycles);

        sim_receiver_cfg strict = parts[i];
        strict.agc_suppresses = true;
        run_opts os = { ALIVE, sizeof(ALIVE), SIM_FORMAT_RCX, strict };
        run(&os, &r);
        CHECK(r.urx.out_len < sizeof(ALIVE),
              "%s: even with the AGC modelled as a mute, every byte arrived",
              parts[i].part);
    }
}

int main(void)
{
    printf("irtower host simulation: gate=%s, poll=%lu Hz\n",
           IRT_GATE_MODE == IRT_GATE_HARDWARE ? "hardware" : "software",
           (unsigned long)IRT_GATE_POLL_HZ);

    test_recorded_numbers();
    test_carrier();
    test_gate_waveform();
    test_worst_case_burst();
    test_loopback();
    test_receiver_choice_matters();
    test_agc_trap();

    printf("%d checks, %d failures\n", checks, failures);
    return failures ? 1 : 0;
}
