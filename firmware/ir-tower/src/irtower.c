/*
 * irtower.c — the portable half. Every board shares this file verbatim.
 *
 * Clean-room; see include/irtower.h for the source list.
 */
#include "irtower.h"
#include "irtower_port.h"

int32_t irt_carrier_error_ppm(uint32_t achieved_mhz, uint32_t requested_hz)
{
    /*
     * ppm = (achieved - requested) / requested * 1e6, integer throughout, so
     * that a board's recorded error is the same number on the MCU as in the
     * host test rather than two roundings of a float.
     *
     * 64-bit appears here and nowhere else. It costs an 8-bit part a few
     * hundred bytes of library once, at init; the gate itself never does
     * arithmetic at all.
     */
    int32_t requested_mhz = (int32_t)(requested_hz * 1000u);
    int32_t delta = (int32_t)achieved_mhz - requested_mhz;
    return (int32_t)(((int64_t)delta * 1000000) / requested_mhz);
}

irt_status irt_init(const irt_config *cfg)
{
    uint32_t hz = (cfg && cfg->carrier_hz) ? cfg->carrier_hz : IRT_CARRIER_HZ_DEFAULT;
    uint8_t duty = (cfg && cfg->duty_percent) ? cfg->duty_percent : IRT_DUTY_PERCENT_DEFAULT;

    irt_status st;
    st.carrier_achieved_mhz = irt_port_carrier_init(hz, duty);
    st.carrier_error_ppm = irt_carrier_error_ppm(st.carrier_achieved_mhz, hz);
    st.gate_mode = IRT_GATE_MODE;
    /* A hardware gate samples the pin too — a PIO loop or a gated timer has
     * a sampling rate just like a poll loop, it simply costs no CPU. So every
     * board declares one and the figure means the same thing on all of them. */
    st.gate_poll_hz = IRT_GATE_POLL_HZ;

#if IRT_GATE_MODE == IRT_GATE_SOFTWARE
    /*
     * Idle is dark. A serial line idles high (mark), a mark is a serial one,
     * and "serial ones do not" generate light — so a tower that came up with
     * the LED lit would be transmitting an endless start bit at whatever
     * brick is listening, and would sit at the top of the receiver's AGC
     * suppression rules while doing it.
     *
     * A hardware-gated port has no equivalent line: its gate already follows
     * the pin, so it comes up dark by construction — provided the port pulls
     * TXD up, because an unconnected host leaves that pin floating and a
     * floating gate input is a lit LED half the time.
     */
    irt_port_carrier_off();
#endif
    return st;
}

void irt_service(void)
{
#if IRT_GATE_MODE == IRT_GATE_SOFTWARE
    /* Light while TXD is low. This line is the entire transmit path. */
    if (irt_port_tx_pin_read()) {
        irt_port_carrier_off();
    } else {
        irt_port_carrier_on();
    }

#if !IRT_RX_WIRED_THROUGH
    /*
     * Straight through, no inversion, no buffering, and deliberately no
     * attempt to mute this during transmit. Infrared is a broadcast medium
     * and the tower hears its own LED; the host discards the echo (it matches
     * ~opcode replies). Gating the receiver here would require knowing when a
     * transmission ends, which would require decoding serial, which is the
     * one thing this device must not do.
     */
    irt_port_rx_pin_write(irt_port_rx_recv_read());
#endif
#endif /* IRT_GATE_SOFTWARE */
}

void irt_run(void)
{
    for (;;) {
#if IRT_GATE_MODE == IRT_GATE_SOFTWARE
        irt_service();
#else
        irt_port_idle();
#endif
    }
}
