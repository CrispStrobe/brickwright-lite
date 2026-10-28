#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define CHIPS_IMPL
#define CHIPS_ASSERT(c) do { if (!(c)) abort(); } while (0)
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

#ifdef Z80_ORACLE_HEADER
#include Z80_ORACLE_HEADER
#endif

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

static bool single_step_ld_a(unsigned* ticks_out) {
    machine_t m;
    memset(&m, 0, sizeof(m));
    m.mem[12180] = 0x3e;
    m.mem[12181] = 169;
    m.pins = z80_init(&m.cpu);
    m.cpu.a = 150; m.cpu.f = 240;
    m.cpu.b = 201; m.cpu.c = 216; m.cpu.d = 178; m.cpu.e = 120;
    m.cpu.h = 236; m.cpu.l = 250; m.cpu.i = 188; m.cpu.r = 14;
    m.cpu.sp = 54538; m.cpu.wz = 22259; m.cpu.ix = 12801; m.cpu.iy = 37525;
    m.cpu.af2 = 2030; m.cpu.bc2 = 33616; m.cpu.de2 = 2697; m.cpu.hl2 = 63694;
    m.cpu.im = 2; m.cpu.iff1 = false; m.cpu.iff2 = false;
    m.pins = z80_prefetch(&m.cpu, 12180);
    unsigned ticks = 0;
    while (ticks < 7) {
        service(&m);
        ticks++;
    }
    *ticks_out = ticks;
    return ticks == 7 && m.cpu.a == 169 && m.cpu.f == 240 && m.cpu.b == 201 &&
        m.cpu.c == 216 && m.cpu.d == 178 && m.cpu.e == 120 && m.cpu.h == 236 &&
        m.cpu.l == 250 && m.cpu.i == 188 && m.cpu.r == 15 && m.cpu.sp == 54538 &&
        m.cpu.wz == 22259 && m.cpu.ix == 12801 && m.cpu.iy == 37525 &&
        m.cpu.af2 == 2030 && m.cpu.bc2 == 33616 && m.cpu.de2 == 2697 &&
        m.cpu.hl2 == 63694 && m.cpu.im == 2 && !m.cpu.iff1 && !m.cpu.iff2;
}

static bool wait_stretches_one_bus_cycle(void) {
    machine_t baseline;
    memset(&baseline, 0, sizeof(baseline));
    baseline.mem[0] = 0x00;
    baseline.pins = z80_init(&baseline.cpu);
    const uint64_t request = service(&baseline);
    if ((request & (Z80_MREQ | Z80_RD)) != (Z80_MREQ | Z80_RD)) return false;
    if (baseline.cpu.step != Z80_M1_T2) return false;
    machine_t held;
    memcpy(&held, &baseline, sizeof(held));
    const uint16_t held_step = held.cpu.step;
    bool state_held = true;
    for (int i = 0; i < 3; i++) {
        held.pins |= Z80_WAIT;
        service(&held);
        state_held = state_held && held.cpu.step == held_step &&
            held.cpu.pc == baseline.cpu.pc && held.cpu.r == baseline.cpu.r;
    }
    held.pins &= ~Z80_WAIT;
    for (int i = 0; i < 8; i++) {
        service(&baseline);
        service(&held);
    }
    return state_held && memcmp(&held.cpu, &baseline.cpu, sizeof(z80_t)) == 0 &&
        (held.pins & ~Z80_WAIT) == (baseline.pins & ~Z80_WAIT) &&
        memcmp(held.mem, baseline.mem, sizeof(held.mem)) == 0;
}

static bool nmi_entry_writes_the_stack(void) {
    machine_t m;
    memset(&m, 0, sizeof(m));
    m.mem[0] = 0x00;
    m.mem[0x0066] = 0x00;
    m.pins = z80_init(&m.cpu);
    m.cpu.sp = 0xfffe;
    bool stack_write = false;
    for (int tick = 0; tick < 64; tick++) {
        if (tick == 8) m.pins |= Z80_NMI;
        if (tick == 9) m.pins &= ~Z80_NMI;
        const uint64_t pins = service(&m);
        if ((pins & (Z80_MREQ | Z80_WR)) == (Z80_MREQ | Z80_WR) &&
            Z80_GET_ADDR(pins) >= 0xfffc) stack_write = true;
    }
    return stack_write;
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
    unsigned oracle_ticks = 0;
    const bool oracle_match = single_step_ld_a(&oracle_ticks);
#ifdef Z80_ORACLE_HEADER
    const char *oracle_failure = NULL;
    const char *oracle_failure_kind = NULL;
    unsigned oracle_timing_passed = 0, oracle_expected_ticks = 0, oracle_actual_ticks = 0;
    const unsigned oracle_corpus_passed = run_oracle_corpus(&oracle_failure, &oracle_failure_kind,
        &oracle_timing_passed, &oracle_expected_ticks, &oracle_actual_ticks);
    const unsigned oracle_corpus_total = Z80_ORACLE_VECTOR_COUNT;
#else
    const char *oracle_failure = "oracle header absent";
    const char *oracle_failure_kind = "harness-configuration";
    const unsigned oracle_timing_passed = 0, oracle_expected_ticks = 0, oracle_actual_ticks = 0;
    const unsigned oracle_corpus_passed = 0;
    const unsigned oracle_corpus_total = 0;
#endif
    char oracle_failure_json[128];
    if (oracle_failure) snprintf(oracle_failure_json, sizeof(oracle_failure_json), "\"%s\"", oracle_failure);
    else strcpy(oracle_failure_json, "null");
    char oracle_failure_kind_json[64];
    if (oracle_failure_kind) snprintf(oracle_failure_kind_json, sizeof(oracle_failure_kind_json),
        "\"%s\"", oracle_failure_kind);
    else strcpy(oracle_failure_kind_json, "null");
    const bool wait_stretched = wait_stretches_one_bus_cycle();
    const bool nmi_stack_write = nmi_entry_writes_the_stack();
    machine_t benchmark;
    memset(&benchmark, 0, sizeof(benchmark));
    benchmark.pins = z80_init(&benchmark.cpu);
    const clock_t started = clock();
    unsigned benchmark_controls = 0;
    const uint64_t benchmark_hash = run(&benchmark, 200000, &benchmark_controls);
    const clock_t ended = clock();
    const double seconds = (double)(ended - started) / (double)CLOCKS_PER_SEC;
    const unsigned long long ticks_per_second = seconds > 0.0
        ? (unsigned long long)(200000.0 / seconds) : 0;
    printf("{\"schema\":1,\"ticks\":48,\"traceHash\":\"%016llx\","
           "\"snapshotReplay\":%s,\"snapshotPoints\":%u,\"memory8000\":%u,"
           "\"controlMask\":%u,\"haltSeen\":%s,\"interruptAcknowledgeSeen\":%s,"
           "\"waitStretched\":%s,\"nmiStackWrite\":%s,"
           "\"oracleVector\":\"3E 0000\",\"oracleTicks\":%u,\"oracleMatch\":%s,"
           "\"oracleCorpusTotal\":%u,\"oracleCorpusPassed\":%u,\"oracleFirstFailure\":%s,"
           "\"oracleTimingPassed\":%u,\"oracleFailureKind\":%s,"
           "\"oracleExpectedTicks\":%u,\"oracleActualTicks\":%u,"
           "\"checkpointBytes\":%llu,\"benchmarkTicks\":200000,\"benchmarkHash\":\"%016llx\","
           "\"ticksPerSecond\":%llu}\n",
        (unsigned long long)first, equal ? "true" : "false", snapshot_points,
        m.mem[0x8000], controls, halt_seen ? "true" : "false", int_ack_seen ? "true" : "false",
        wait_stretched ? "true" : "false", nmi_stack_write ? "true" : "false",
        oracle_ticks, oracle_match ? "true" : "false", oracle_corpus_total, oracle_corpus_passed,
        oracle_failure_json, oracle_timing_passed, oracle_failure_kind_json,
        oracle_expected_ticks, oracle_actual_ticks, (unsigned long long)sizeof(machine_t),
        (unsigned long long)benchmark_hash, ticks_per_second);
    return equal && snapshot_points == 42 && m.mem[0x8000] == 0x2a && (controls & 15) == 15 &&
        halt_seen && int_ack_seen && wait_stretched && nmi_stack_write && oracle_match &&
        oracle_corpus_total > 0 && oracle_corpus_passed == oracle_corpus_total &&
        oracle_timing_passed == oracle_corpus_total &&
        ticks_per_second > 0 ? 0 : 1;
}
