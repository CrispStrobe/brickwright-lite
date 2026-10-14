#include <stdbool.h>
#include <stdint.h>

#define CHIPS_IMPL
#define CHIPS_ASSERT(condition) do { if (!(condition)) __builtin_trap(); } while (0)
#include "z80.h"

static z80_t cpu;
static uint64_t pins;
static uint8_t memory[1 << 16];

__attribute__((export_name("candidate_init")))
uint32_t candidate_init(void) {
    for (uint32_t address = 0; address < (1U << 16); address++) memory[address] = 0;
    memory[0] = 0x3e; /* LD A,$2a */
    memory[1] = 0x2a;
    memory[2] = 0x32; /* LD ($8000),A */
    memory[3] = 0x00;
    memory[4] = 0x80;
    memory[5] = 0xc3; /* JP $0000 */
    memory[6] = 0x00;
    memory[7] = 0x00;
    pins = z80_init(&cpu);
    return (uint32_t)sizeof(cpu);
}

/* One call owns the complete batch: the receipt can prove one JS/WASM crossing. */
__attribute__((export_name("candidate_run_batch")))
uint32_t candidate_run_batch(uint32_t ticks) {
    uint32_t hash = 2166136261U;
    for (uint32_t index = 0; index < ticks; index++) {
        pins = z80_tick(&cpu, pins);
        const uint16_t address = Z80_GET_ADDR(pins);
        if ((pins & (Z80_MREQ | Z80_RD)) == (Z80_MREQ | Z80_RD)) {
            Z80_SET_DATA(pins, memory[address]);
        } else if ((pins & (Z80_MREQ | Z80_WR)) == (Z80_MREQ | Z80_WR)) {
            memory[address] = Z80_GET_DATA(pins);
        }
        hash = (hash ^ (uint32_t)pins ^ (uint32_t)(pins >> 32)) * 16777619U;
    }
    return hash ^ memory[0x8000] ^ cpu.pc;
}
