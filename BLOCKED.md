# bw-bundle — blocked items (campaign: circuit parity)

This tracks the campaign integration ladder (slices 1–3), distinct from
DEBUG-CONTROL-MODEL.md §8's acceptance ladder (rungs 1–8).

## ~~Slice 1: debugState.bwMs~~ — RESOLVED (ceafc8d)

`bwMs` added to debug-runner.js snapshot at line 138. circuit-tab.jsx reads
`ui.bwMs` and forwards it to DebugStatus. Undefined before symbols exist
(deliberate — no fabricated zero).

## Slice 1 note: activePartIds regex in CircuitDesigner

**Owner:** bw-circuit-ui

`CircuitDesigner.jsx:540` filters `debugState.tasks` by matching blockId against
`/setpin|toggle|writepin/`. Block IDs are opaque strings, not opcodes — the regex never
matches. The active-part highlight is dead. The right fix is to derive active parts from
pin state (`board.getPinStates()`), not from yield points. Not blocking bw-bundle.

## ~~Slice 3: project.stc does not survive save/reload~~ — IMPLEMENTED

Patched in apply-vm-overlay.mjs. sb3 serializer writes `stc: { version: 1, ... }` when
`runtime.stc` is set; deserializer restores it on load. `vm.setStc()` added as the single
entry point. The pseudocode re-parse fallback is kept (belt and braces).

**Not verified:** no round-trip test exists yet. The serializer and deserializer are
patched but no test builds a project with pins, serializes, deserializes into a fresh
VM, and asserts the pin table is identical. A CI-level test requires a VM harness that
this workspace does not have.

**Coordinator note:** debug-runner.js's `projectStc()` and `projectForEmit()` read from
`vm.runtime.stc`. The patches write to the same property. If the coordinator moves where
stc lives, those two functions must move with it.

**Future:** DEVICE/CLOCK/PIN as actual blocks in the project would round-trip natively
(they are just blocks). That eliminates the dual source of truth. Belongs to bw-blocks
and sb3-creator, not to this slice.

## STC89 core instruction rate: 1T, not 12T (emu8051-stc)

**Owner:** emu8051-stc

**Correction:** the original "12x fast" claim was overstated. Timers ARE part-correct
(AUXR.T0x12 prescaling works), and `generateC` hangs every duration off Timer 0 at
FOSC/12, so `wait` durations are correct for both 1T and 12T parts.

What is 1T: the **core instruction rate** (a NOP costs 1 clock for all parts, should be
12 for STC89). This affects anything measuring *work*, not *time*: profiling, `tNs` for
compute-heavy stretches, `bw_block_ms` spin loops. On a real STC89 those read ~12x
optimistic. Whether this is deliberately out of scope is emu8051-stc's to say.

bw-bundle action: none.
