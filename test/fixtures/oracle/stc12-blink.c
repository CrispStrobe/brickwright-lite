/* Tiny deterministic uCsim oracle fixture: toggle P1.0 forever. */
#include <8051.h>

__sbit __at (0x90) LED;

void main(void) {
    unsigned int i;
    while (1) {
        LED = !LED;
        for (i = 0; i < 100; i++) {
            __asm
                nop
            __endasm;
        }
    }
}
