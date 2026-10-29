# EV3 note-to-frequency instruction

Status: CANDIDATE — compiled-program and guest qualification pending.
Owner: Robot Lab bytecode continuation.
Branch: `lane/ev3-note-to-frequency-20261029`.

Implement the EV3 VM's `NOTE_TO_FREQ` instruction using independently documented
firmware behavior, with deterministic bounded parsing and explicit invalid-input
behavior. The firmware developer kit describes a note string input and 16-bit
frequency output. Establish accepted note forms and rounding from primary evidence
and apply the documented fallback for unmatched strings.

Scope: `overlay/scratch-gui/src/lib/bw-sim/routes/ev3-vm/`, focused EV3 VM tests
and compiled fixtures, `docs/EV3-RBF-VM.md`, and this claim. Preserve other
instructions, storage, GUI, dependency pins and workflows. Compile each new
fixture once using the owned compiler and retain its input and output.

Acceptance: cite semantics, test positive boundaries and invalid inputs, qualify
the affected clean virtual EV3 guest with a compiled program, independently
audit retained original evidence, and pass all enabled checks before a normal
matched-head merge. Physical-device equivalence requires separate evidence.
