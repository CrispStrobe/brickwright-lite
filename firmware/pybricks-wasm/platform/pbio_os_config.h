// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Single-threaded wasm: there are no interrupts to mask. Waiting for an
// "interrupt" is where the simulation advances time and yields to the page
// (hal/clock_wasm.c).

#include <stdint.h>

typedef uint32_t pbio_os_irq_flags_t;

static inline pbio_os_irq_flags_t pbio_os_hook_disable_irq(void) {
    return 0;
}

static inline void pbio_os_hook_enable_irq(pbio_os_irq_flags_t flags) {
    (void)flags;
}

void pbio_os_hook_wait_for_interrupt(pbio_os_irq_flags_t flags);
