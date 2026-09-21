/*
 * boards/host-sim/port.c — the port whose pins are variables.
 *
 * Clean-room; sources listed in ../../README.md.
 */
#include "host_sim.h"

#include "irtower.h"
#include "irtower_port.h"

static struct {
    uint32_t carrier_hz;
    uint32_t duty_percent;
    uint64_t phase_acc;  /* nanoseconds x carrier_hz, modulo one period */
    uint64_t cycles;
    bool     gate_open;  /* what carrier_on/carrier_off did */
    bool     carrier_high;
    bool     tx;
    bool     recv;
    bool     rx;
} sim;

void irt_host_reset(void)
{
    sim.carrier_hz = 0;
    sim.duty_percent = IRT_DUTY_PERCENT_DEFAULT;
    sim.phase_acc = 0;
    sim.cycles = 0;
    sim.gate_open = false;
    sim.carrier_high = false;
    /* Both serial lines idle high: mark, a serial one, no light. */
    sim.tx = true;
    sim.recv = true;
    sim.rx = true;
}

void irt_host_advance_ns(uint32_t dt_ns)
{
    if (!sim.carrier_hz) {
        return;
    }
    /*
     * The counter. phase_acc counts in units of 1e-9 of a period, so a period
     * elapses every 1e9 units and the duty comparison is exact integer
     * arithmetic at any frequency and any duty — no floats anywhere in the
     * simulated hardware, for the same reason there are none in the real
     * ports: a waveform test that disagrees with itself in the last bit is
     * worse than no test.
     */
    sim.phase_acc += (uint64_t)dt_ns * sim.carrier_hz;
    while (sim.phase_acc >= 1000000000ull) {
        sim.phase_acc -= 1000000000ull;
        sim.cycles++;
    }
    sim.carrier_high = (sim.phase_acc * 100ull) < (1000000000ull * sim.duty_percent);
}

void irt_host_set_tx(bool level)   { sim.tx = level; }
void irt_host_set_recv(bool level) { sim.recv = level; }

bool irt_host_rx_pin(void)
{
#if IRT_RX_WIRED_THROUGH
    /* Copper. The firmware is not in this path; the model must not be either. */
    return sim.recv;
#else
    return sim.rx;
#endif
}

bool irt_host_carrier_high(void) { return sim.carrier_high; }
uint64_t irt_host_carrier_cycles(void) { return sim.cycles; }

bool irt_host_led(void)
{
#if IRT_GATE_MODE == IRT_GATE_HARDWARE
    /*
     * The peripheral does the AND itself, so the LED follows TXD with no
     * software in between. Modelled here rather than in the driver because
     * that is exactly where it lives on the RP2040: inside tower.pio.
     */
    return sim.carrier_high && !sim.tx;
#else
    return sim.carrier_high && sim.gate_open;
#endif
}

uint32_t irt_port_carrier_init(uint32_t carrier_hz, uint8_t duty_percent)
{
    sim.carrier_hz = carrier_hz;
    sim.duty_percent = duty_percent;
    sim.phase_acc = 0;
    sim.cycles = 0;
    sim.carrier_high = (duty_percent != 0);
    /* Exact by construction: this board has no divider to quantise against. */
    return carrier_hz * 1000u;
}

void irt_port_carrier_on(void)  { sim.gate_open = true; }
void irt_port_carrier_off(void) { sim.gate_open = false; }

bool irt_port_tx_pin_read(void) { return sim.tx; }

#if !IRT_RX_WIRED_THROUGH
bool irt_port_rx_recv_read(void) { return sim.recv; }
void irt_port_rx_pin_write(bool level) { sim.rx = level; }
#endif

void irt_port_idle(void) { /* the test drives time; nothing to do */ }
