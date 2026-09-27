// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Clock and event-loop hook for the Brickwright wasm hub.
//
// Time is a simulated millisecond counter. It only moves while the hub runs:
//  - every time pbio has nothing left to do (pbio_os_hook_wait_for_interrupt),
//    exactly as a 1 ms SysTick interrupt would wake a real hub, and
//  - from the MicroPython VM hook, so a busy loop that never waits still sees
//    time pass (the same approach as Pybricks' own clock_test driver).
//
// Two pacing modes:
//  - realtime (the browser pane): simulated time is held to wall-clock time,
//    yielding to the page with emscripten_sleep() (Asyncify) when ahead;
//  - deterministic (node tests): no wall clock at all, time advances at a
//    fixed rate per wait / per N bytecodes, so a run is reproducible.
//    The page gets a yield every PBW_DET_YIELD_MS of simulated time so a
//    runaway program can still be stopped.

#include <stdbool.h>
#include <stdint.h>

#include <emscripten.h>

#include <pbdrv/config.h>
#include <pbio/os.h>
#include "pbio_os_config.h"

#include "wasm_hub.h"

#define PBW_DET_YIELD_MS        (100)
#define PBW_DET_HOOKS_PER_MS    (64)
#define PBW_RT_HOOKS_PER_CHECK  (256)
#define PBW_RT_MAX_LAG_MS       (250)
#define PBW_RT_YIELD_MS         (30)

static uint32_t now_ms;
static bool realtime;
static double wall_origin;
static uint32_t virt_origin;
static double last_yield_wall;
static uint32_t last_yield_virt;

EM_JS(void, pbw_js_tick, (uint32_t ms), {
    if (Module.pbwOnTick) {
        Module.pbwOnTick(ms);
    }
});

EMSCRIPTEN_KEEPALIVE
void pbw_set_realtime(int enable) {
    realtime = enable != 0;
    wall_origin = emscripten_get_now();
    virt_origin = now_ms;
    last_yield_wall = wall_origin;
    last_yield_virt = now_ms;
}

EMSCRIPTEN_KEEPALIVE
uint32_t pbw_now_ms(void) {
    return now_ms;
}

static void pbw_yield(int ms) {
    emscripten_sleep(ms);
    last_yield_wall = emscripten_get_now();
    last_yield_virt = now_ms;
}

static void pbw_pace(void) {
    if (!realtime) {
        if (now_ms - last_yield_virt >= PBW_DET_YIELD_MS) {
            pbw_yield(0);
        }
        return;
    }
    double wall = emscripten_get_now();
    double target = wall_origin + (double)(now_ms - virt_origin);
    if (target - wall >= 4) {
        // Ahead of the wall clock: give the page the difference.
        pbw_yield((int)(target - wall));
    } else if (wall - target > PBW_RT_MAX_LAG_MS) {
        // Hopelessly behind (tab was hidden, or heavy compute): re-anchor
        // instead of fast-forwarding through seconds of simulation.
        wall_origin = wall;
        virt_origin = now_ms;
    } else if (wall - last_yield_wall > PBW_RT_YIELD_MS) {
        pbw_yield(0);
    }
}

void pbw_tick(void) {
    now_ms++;
    pbio_os_request_poll();
    pbw_js_tick(now_ms);
    pbw_check_stop_request();
    pbw_pace();
}

// Called by pbio when all processes are idle: the next "interrupt" is the
// next millisecond.
void pbio_os_hook_wait_for_interrupt(pbio_os_irq_flags_t flags) {
    (void)flags;
    pbw_tick();
}

// Called from the MicroPython VM loop (mpconfigport.h).
void pbw_vm_hook(void) {
    static uint32_t hooks;
    hooks++;
    if (!realtime) {
        if (hooks % PBW_DET_HOOKS_PER_MS == 0) {
            pbw_tick();
        }
        return;
    }
    if (hooks % PBW_RT_HOOKS_PER_CHECK != 0) {
        return;
    }
    // Busy code consumes real time, as it would on a hub.
    double wall = emscripten_get_now();
    double target = wall_origin + (double)(now_ms - virt_origin);
    if (wall - target >= 1) {
        pbw_tick();
    } else if (wall - last_yield_wall > PBW_RT_YIELD_MS) {
        pbw_yield(0);
    }
}

void pbdrv_clock_init(void) {
}

uint32_t pbdrv_clock_get_ms(void) {
    return now_ms;
}

uint32_t pbdrv_clock_get_100us(void) {
    return now_ms * 10;
}

uint32_t pbdrv_clock_get_us(void) {
    return now_ms * 1000;
}
