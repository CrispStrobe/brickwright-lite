/* Tiny deterministic simavr oracle fixture: Arduino D13 is PORTB5. */
#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <simavr/avr/avr_mcu_section.h>

AVR_MCU_VCD_PORT_PIN('B', 5, "D13");
AVR_MCU_VCD_FILE("brickwright-oracle.vcd", 1);
AVR_MCU_SIMAVR_COMMAND(_SFR_MEM_ADDR(GPIOR0));

static void delay_cycles(void) {
    for (volatile uint16_t i = 0; i < 1600; i++) __asm__ __volatile__("nop");
}

int main(void) {
    DDRB |= _BV(DDB5);
    PORTB &= (uint8_t)~_BV(PORTB5);
    GPIOR0 = SIMAVR_CMD_VCD_START_TRACE;
    for (uint8_t i = 0; i < 4; i++) {
        PORTB ^= _BV(PORTB5);
        delay_cycles();
    }
    cli();
    set_sleep_mode(SLEEP_MODE_IDLE);
    sleep_mode();
    for (;;) {}
}
