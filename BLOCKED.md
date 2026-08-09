# bw-bundle — blocked items (campaign: circuit parity)

This tracks the campaign integration ladder (slices 1–3), distinct from
DEBUG-CONTROL-MODEL.md §8's acceptance ladder (rungs 1–8).

## Slice 1: debugState.bwMs not available from runner snapshot

**Owner:** coordinator (debug-runner.js is frozen for agents)

The debug-runner's `snapshot()` does not expose `target.bwMs()`. The runner holds the
target internally and does not make it available to consumers. `DebugStatus.jsx:33`
destructures `bwMs` from `debugState` and shows "—" when it's undefined.

**Needs:** coordinator to add `bwMs: target ? target.bwMs() : undefined` to
`debug-runner.js:snapshot()` (the returned object at ~line 118).

**Impact:** DebugStatus shows "—" for the cooperative-scheduler millisecond counter.
Halting, stepping, tasks, capabilities, and haltReason all work.

## Slice 1 note: activePartIds regex in CircuitDesigner

**Owner:** bw-circuit-ui

`CircuitDesigner.jsx:540` filters `debugState.tasks` by matching blockId against
`/setpin|toggle|writepin/`. Block IDs are opaque strings, not opcodes — the regex never
matches. The active-part highlight is dead. The right fix is to derive active parts from
pin state (`board.getPinStates()`), not from yield points. Not blocking bw-bundle.

## STC89 12T timing: shipped WASM runs at 1T (emu8051-stc)

**Owner:** emu8051-stc

The vendored WASM (pin ca1ef09) accepts `emu_set_part(2)` (STC89) but runs at 1T timing.
A real STC89C52RC is 12T: a NOP costs 12 oscillator clocks. Everything timed would run 12x
fast. The part is selectable but the defining characteristic is not modelled.

Either emu8051-stc implements 12T instruction timing for PART_STC89, or `capabilities()`
reports the timing model as 1T-only so the front end can refuse rather than mislead.

bw-bundle action: none on the pin. The WASM is otherwise good (HEAPU8, all emu_dbg_*
exports present). The commit message "STC89+STC15W parts" is narrower than it reads —
STC89 part identity is selectable but timing is not modelled.
