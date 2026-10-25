/*
 * boards/rp2040/port.c — RP2040 port. Hardware gate, via PIO.
 *
 * Clean-room; sources listed in ../../README.md. Register and function names
 * are pico-sdk's public interface.
 *
 * After irt_port_carrier_init() returns, this board's CPU has nothing left to
 * do: the state machine in tower.pio holds the carrier and reads host TXD
 * itself. irt_run() falls through to irt_port_idle() and sleeps forever.
 */
#include <stdio.h>

#include "hardware/clocks.h"
#include "hardware/gpio.h"
#include "hardware/pio.h"
#include "pico/stdlib.h"

#include "irtower.h"
#include "irtower_port.h"
#include "tower.pio.h"

_Static_assert(SYS_CLK_HZ == IRT_BOARD_CLOCK_HZ,
               "board.h's recorded carrier was derived for a 125 MHz system clock; "
               "change both or neither");

#define PIO_DEV  pio0
#define PIO_SM   0u

/* Delay field of a PIO instruction word, with no side-set configured. */
#define PIO_DELAY(cycles) ((uint16_t)((uint16_t)(cycles) << 8))
#define PIO_DELAY_MASK    PIO_DELAY(0x1fu)

static uint16_t patched[3];

uint32_t irt_port_carrier_init(uint32_t carrier_hz, uint8_t duty_percent)
{
    /*
     * Duty in eighths of a carrier period, because a period is 8 PIO cycles.
     * Rounding to the nearest eighth and clamping is deliberate: a caller
     * asking for 10 % gets 12.5 % and a working tower, not a one-cycle burst
     * the receiver's integrator throws away.
     */
    uint32_t lit = (duty_percent * IRT_PIO_CYCLES_PER_PERIOD + 50u) / 100u;
    if (lit < 1u) lit = 1u;
    if (lit > IRT_PIO_CYCLES_PER_PERIOD - 2u) lit = IRT_PIO_CYCLES_PER_PERIOD - 2u;
    uint32_t dark = IRT_PIO_CYCLES_PER_PERIOD - lit;

    for (unsigned i = 0; i < count_of(patched); i++) {
        patched[i] = irtower_program_instructions[i];
    }
    /* dark: one cycle for the set, one for the jmp, the rest is delay. */
    patched[IRTOWER_PIO_DARK_INSN] =
        (uint16_t)((patched[IRTOWER_PIO_DARK_INSN] & ~PIO_DELAY_MASK) | PIO_DELAY(dark - 2u));
    patched[IRTOWER_PIO_LIT_INSN] =
        (uint16_t)((patched[IRTOWER_PIO_LIT_INSN] & ~PIO_DELAY_MASK) | PIO_DELAY(lit - 1u));

    struct pio_program prog = irtower_program;
    prog.instructions = patched;
    uint offset = pio_add_program(PIO_DEV, &prog);

    pio_gpio_init(PIO_DEV, IRT_PIN_LED);
    pio_sm_set_consecutive_pindirs(PIO_DEV, PIO_SM, IRT_PIN_LED, 1, true);

    gpio_init(IRT_PIN_TXD);
    gpio_set_dir(IRT_PIN_TXD, GPIO_IN);
    /*
     * Pull TXD up. An unplugged host leaves this pin floating, a floating gate
     * input is a lit LED about half the time, and a tower transmitting noise
     * into the room is worse than a dead one. Idle high is also what a real
     * serial line does: mark, a serial one, no light.
     */
    gpio_pull_up(IRT_PIN_TXD);

    pio_sm_config c = irtower_program_get_default_config(offset);
    sm_config_set_set_pins(&c, IRT_PIN_LED, 1);
    sm_config_set_jmp_pin(&c, IRT_PIN_TXD);

    /*
     * Integer + fraction rather than a float, so that the achieved frequency
     * below is computed from exactly the divider the hardware gets — the
     * recorded number and the silicon cannot disagree by a rounding.
     */
    uint32_t div_int, div_frac;
    if (carrier_hz == IRT_CARRIER_TARGET_HZ) {
        div_int = IRT_PIO_CLKDIV_INT;
        div_frac = IRT_PIO_CLKDIV_FRAC;
    } else {
        uint64_t div256 = ((uint64_t)IRT_BOARD_CLOCK_HZ * 256u) /
                          ((uint64_t)carrier_hz * IRT_PIO_CYCLES_PER_PERIOD);
        div_int = (uint32_t)(div256 >> 8);
        div_frac = (uint32_t)(div256 & 0xffu);
    }
    sm_config_set_clkdiv_int_frac(&c, (uint16_t)div_int, (uint8_t)div_frac);

    pio_sm_init(PIO_DEV, PIO_SM, offset, &c);
    pio_sm_set_enabled(PIO_DEV, PIO_SM, true);

    uint64_t div256 = (uint64_t)div_int * 256u + div_frac;
    return (uint32_t)(((uint64_t)IRT_BOARD_CLOCK_HZ * 1000u * 256u) /
                      (div256 * IRT_PIO_CYCLES_PER_PERIOD));
}

/*
 * Not on any runtime path on this board — the gate is the `jmp pin` in
 * tower.pio. They exist so that a bench test can park the LED on or off (step
 * 1 of the contract's build order: measure the carrier with a scope, with no
 * host attached) and so that the port interface means the same thing on every
 * board.
 */
void irt_port_carrier_on(void)  { pio_sm_set_enabled(PIO_DEV, PIO_SM, true); }
void irt_port_carrier_off(void) { pio_sm_set_enabled(PIO_DEV, PIO_SM, false); }

bool irt_port_tx_pin_read(void) { return gpio_get(IRT_PIN_TXD); }

void irt_port_idle(void) { __wfi(); }

int main(void)
{
    irt_config cfg = { IRT_CARRIER_HZ_DEFAULT, IRT_DUTY_PERCENT_DEFAULT };
    irt_status st = irt_init(&cfg);

    /*
     * stdio goes to USB CDC or UART depending on the CMakeLists switches; it
     * is a bring-up aid, not part of the device. Note what it does NOT do:
     * this board appears under the Pico's own VID/PID as an ordinary CDC-ACM
     * device. Claiming LEGO's 0694:0001 would be identity theft of a tower
     * whose USB protocol we do not implement.
     */
    stdio_init_all();
    printf("irtower %s: carrier %lu.%03lu Hz (%+ld ppm), gate=hardware\n",
           IRT_BOARD_NAME,
           (unsigned long)(st.carrier_achieved_mhz / 1000u),
           (unsigned long)(st.carrier_achieved_mhz % 1000u),
           (long)st.carrier_error_ppm);

    irt_run();
    return 0;
}
