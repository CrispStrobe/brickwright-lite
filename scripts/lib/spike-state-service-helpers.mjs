// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Runtime helpers (`tools/*.py`) a SPIKE state service needs in its package.
// The fixed set every service imports, plus the ones newer services import:
// `spike_program_uart` (MicroPython program UART) and `spike_lockstep` (Robot Lab
// lockstep, renode-spike-prime#59, imported unconditionally by that service).
const ALWAYS = ['spike_arena_mailbox', 'spike_arena_inputs', 'spike_state_monitor_protocol', 'ev3_state_observer', 'spike_nuttx_mailbox'];

/** Helper paths (relative to the Runtime/package root) for a state service's source text. */
export function stateServiceHelpers (stateService) {
    const names = [...ALWAYS];
    if (stateService.includes('from spike_program_uart import')) names.push('spike_program_uart');
    if (/^import spike_lockstep$/m.test(stateService)) names.push('spike_lockstep');
    return names.map(name => `tools/${name}.py`);
}
