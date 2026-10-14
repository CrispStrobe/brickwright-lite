/*
 * boards/attiny85/port.c — ATtiny85 port. Software gate.
 *
 * Clean-room; sources listed in ../../README.md. The register names and the
 * mode numbers come from the ATtiny25/45/85 datasheet (2586Q-AVR-08/2013),
 * chapter 11 (8-bit Timer/Counter0).
 */
#include <avr/io.h>

#include "irtower.h"
#include "irtower_port.h"

#define BIT(n) ((uint8_t)(1u << (n)))

uint32_t irt_port_carrier_init(uint32_t carrier_hz, uint8_t duty_percent)
{
    uint32_t top;
    uint32_t achieved_mhz;

    if (carrier_hz == IRT_CARRIER_TARGET_HZ) {
        /* The common case, resolved at compile time so that a 38 kHz build
         * does not drag in a 32-bit divide it never needs. */
        top = IRT_CARRIER_DIVISOR - 1u;
        achieved_mhz = IRT_CARRIER_ACHIEVED_MHZ;
    } else {
        /* 36 and 40 kHz receiver modules exist and are otherwise identical
         * parts, so an odd carrier costs one division at startup, not a
         * recompile. */
        top = (IRT_BOARD_CLOCK_HZ + carrier_hz / 2u) / carrier_hz - 1u;
        /* 8e9 does not fit in 32 bits; this is the one place on this part
         * where that matters, and it happens once, at startup. */
        achieved_mhz = (uint32_t)(((uint64_t)IRT_BOARD_CLOCK_HZ * 1000u) / (top + 1u));
    }

    DDRB |= BIT(IRT_PIN_RXD);
    DDRB &= (uint8_t)~(BIT(IRT_PIN_TXD) | BIT(IRT_PIN_RECV));

    OCR0A = (uint8_t)top;
    OCR0B = (uint8_t)(((top + 1u) * duty_percent) / 100u - 1u);

    /*
     * Fast PWM, TOP = OCR0A (WGM0[2:0] = 7), prescaler 1, OC0B clear-on-match.
     * The timer runs from now until power-off and is never stopped: stopping
     * it to gate would restart every burst at an arbitrary phase, and the
     * receiver's integrator counts cycles.
     */
    TCCR0A = BIT(COM0B1) | BIT(WGM01) | BIT(WGM00);
    TCCR0B = BIT(WGM02) | BIT(CS00);

    return achieved_mhz;
}

/*
 * The gate is the LED pin's *direction* bit, not the timer.
 *
 * DDRB lives at I/O address 0x17, inside the range SBI and CBI can reach, so
 * each of these is one two-cycle instruction with no read-modify-write and no
 * register clobbered. TCCR0A at 0x2A is outside that range and would have cost
 * in/ori/out — three instructions in the tightest loop in the firmware, to do
 * the same job. With the direction bit clear the pin is an input (pull-up off)
 * and the LED simply has nothing driving it.
 */
void irt_port_carrier_on(void)  { DDRB |= BIT(IRT_PIN_LED); }
void irt_port_carrier_off(void) { DDRB &= (uint8_t)~BIT(IRT_PIN_LED); }

bool irt_port_tx_pin_read(void)   { return (PINB & BIT(IRT_PIN_TXD)) != 0; }
bool irt_port_rx_recv_read(void)  { return (PINB & BIT(IRT_PIN_RECV)) != 0; }

void irt_port_rx_pin_write(bool level)
{
    if (level) {
        PORTB |= BIT(IRT_PIN_RXD);
    } else {
        PORTB &= (uint8_t)~BIT(IRT_PIN_RXD);
    }
}

void irt_port_idle(void) { /* unreachable: this board's gate is software */ }

int main(void)
{
    irt_init(0);
    irt_run();
    return 0;
}
