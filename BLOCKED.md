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

## Slice 3: project.stc does not survive save/reload

**Owner:** coordinator (sb3-creator serializer or lite save path)

**File:** `packages/scratch-gui/node_modules/scratch-vm/src/serialization/sb3.js`
(the sb3 serializer in scratch-vm)

**Symbol:** `sb3.serialize()` at ~line 400 — emits `targets`, `monitors`, `extensions`,
`meta` and discards every other top-level key from the project JSON.

**What breaks:** sb3-creator writes a `stc` key into the project JSON containing
`{ device, clock, pins: [...] }`. The sb3 serializer drops it on save. When the project
is reopened, `vm.runtime.stc` is null, the Circuit tab opens empty, the debugger has no
pin table, and every hardware block that reads `runtime.stc.pins` gets nothing.

**Current workaround:** `pseudocode-importer.jsx:672-680` re-parses the pseudocode source
on load to reconstruct `runtime.stc`. This only works if the Code tab still has the source
text — a project saved without the pseudocode tab open loses the declarations permanently.

**What is needed:** either:
1. sb3-creator's serializer preserves `stc` as a top-level key (the cleanest — `stc` is
   project metadata, not a target), or
2. lite's save path writes `stc` into a target's `comments` or `variables` as a
   round-trippable encoding, or
3. a `vm.setStc()` API that the importer calls, and the VM's own serializer includes it.

**Impact:** hardware projects lose all declarations on save/reload. The debugger, the
Circuit tab, and the pin blocks all read from `runtime.stc` and get null.

**Workaround exists:** yes (re-parse pseudocode on load), but fragile.

## STC89 12T timing: shipped WASM runs at 1T (emu8051-stc)

**Owner:** emu8051-stc

The vendored WASM (pin ca1ef09) accepts `emu_set_part(2)` (STC89) but runs at 1T timing.
A real STC89C52RC is 12T: a NOP costs 12 oscillator clocks. Everything timed would run 12x
fast. The part is selectable but the defining characteristic is not modelled.

Either emu8051-stc implements 12T instruction timing for PART_STC89, or `capabilities()`
reports the timing model as 1T-only so the front end can refuse rather than mislead.

bw-bundle action: none on the pin. The WASM is otherwise good (HEAPU8, all emu_dbg_*
exports present).
