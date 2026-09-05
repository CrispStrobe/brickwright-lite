#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define CHIPS_IMPL
#define CHIPS_ASSERT(c) do { if (!(c)) return 90; } while (0)
#include "z80.h"

typedef struct {
    z80_t cpu;
    uint64_t pins;
    uint8_t mem[1 << 16];
} machine_t;

static uint64_t service(machine_t* m) {
    uint64_t pins = z80_tick(&m->cpu, m->pins);
    const uint16_t addr = Z80_GET_ADDR(pins);
    if ((pins & (Z80_MREQ | Z80_RD)) == (Z80_MREQ | Z80_RD)) {
        Z80_SET_DATA(pins, m->mem[addr]);
    } else if ((pins & (Z80_MREQ | Z80_WR)) == (Z80_MREQ | Z80_WR)) {
        m->mem[addr] = Z80_GET_DATA(pins);
    }
    m->pins = pins;
    return pins;
}

static uint64_t mix(uint64_t h, uint64_t value) {
    h ^= value;
    return h * UINT64_C(1099511628211);
}

static uint64_t run(machine_t* m, int ticks, unsigned* controls) {
    uint64_t hash = UINT64_C(1469598103934665603);
    for (int i = 0; i < ticks; i++) {
        const uint64_t pins = service(m);
        hash = mix(hash, pins);
        *controls |= (unsigned)((pins >> Z80_PIN_M1) & 1) << 0;
        *controls |= (unsigned)((pins >> Z80_PIN_MREQ) & 1) << 1;
        *controls |= (unsigned)((pins >> Z80_PIN_RD) & 1) << 2;
        *controls |= (unsigned)((pins >> Z80_PIN_RFSH) & 1) << 3;
    }
    return hash;
}

int main(void) {
    machine_t m;
    memset(&m, 0, sizeof(m));
    /* LD A,$2a; LD ($8000),A; INC A; JP $0004 */
    const uint8_t program[] = {0x3e, 0x2a, 0x32, 0x00, 0x80, 0x3c, 0xc3, 0x04, 0x00};
    memcpy(m.mem, program, sizeof(program));
    m.pins = z80_init(&m.cpu);
    unsigned controls = 0;
    run(&m, 7, &controls);
    machine_t base;
    memcpy(&base, &m, sizeof(m));
    bool equal = true;
    uint64_t first = 0;
    unsigned snapshot_points = 0;
    for (int point = 0; point <= 41; point++) {
        memcpy(&m, &base, sizeof(m));
        unsigned ignored = 0;
        run(&m, point, &ignored);
        machine_t checkpoint;
        memcpy(&checkpoint, &m, sizeof(m));
        const uint64_t expected = run(&m, 41 - point, &ignored);
        machine_t destination;
        memcpy(&destination, &m, sizeof(m));
        memcpy(&m, &checkpoint, sizeof(m));
        const uint64_t replay = run(&m, 41 - point, &ignored);
        equal = equal && expected == replay && memcmp(&m, &destination, sizeof(m)) == 0;
        if (point == 0) first = expected;
        snapshot_points++;
    }
    machine_t irq;
    memset(&irq, 0, sizeof(irq));
    irq.mem[0] = 0x76; /* HALT */
    irq.mem[0x0038] = 0x00;
    irq.pins = z80_init(&irq.cpu);
    irq.cpu.iff1 = irq.cpu.iff2 = true;
    bool halt_seen = false;
    bool int_ack_seen = false;
    for (int tick = 0; tick < 80; tick++) {
        if (tick == 16) irq.pins |= Z80_INT;
        const uint64_t pins = service(&irq);
        halt_seen = halt_seen || (pins & Z80_HALT);
        int_ack_seen = int_ack_seen || ((pins & (Z80_M1 | Z80_IORQ)) == (Z80_M1 | Z80_IORQ));
        if ((pins & (Z80_M1 | Z80_IORQ)) == (Z80_M1 | Z80_IORQ)) Z80_SET_DATA(irq.pins, 0xff);
    }
    printf("{\"schema\":1,\"ticks\":48,\"traceHash\":\"%016llx\","
           "\"snapshotReplay\":%s,\"snapshotPoints\":%u,\"memory8000\":%u,"
           "\"controlMask\":%u,\"haltSeen\":%s,\"interruptAcknowledgeSeen\":%s}\n",
        (unsigned long long)first, equal ? "true" : "false", snapshot_points,
        m.mem[0x8000], controls, halt_seen ? "true" : "false", int_ack_seen ? "true" : "false");
    return equal && snapshot_points == 42 && m.mem[0x8000] == 0x2a && (controls & 15) == 15 &&
        halt_seen && int_ack_seen ? 0 : 1;
}
