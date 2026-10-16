# Deterministic original Arcade clock bootstrap

**Claim merged in [PR1001](https://github.com/CrispStrobe/brickwright-lite/pull/1001).**
Implementation and runtime qualification remain pending.
This continues the deterministic original-clock lane recorded in `LANES.md`.

## Observed failure

The original-simulator helper pauses Date, performance and time origin at zero
before document startup. Preserve that initial-clock assertion. The retained
original PXT runtime uses a zero profiler offset as an inactive sentinel:
starting its profiler at performance zero and then stopping it throws
`bad time now`. This is a reference-harness failure; it does not establish a
failure in the corresponding Brickwright game.

## Owned change

Own `test/helpers/pxt-initial-clock.mjs`, the initialization call site in
`test/helpers/pxt-arcade-runtime.mjs`, focused reference-clock controls, this
contract and the matching ledger entry. Coordinate any other original-simulator
consumer before changing its setup. No application, simulator vendor source,
dependency pin or workflow change is included.

Keep the existing empty-context admission and paused-zero document assertions.
After verifying them, explicitly advance a bounded, complete animation-frame
quantum **before constructing the guest Runtime**. Observe the resulting Date,
performance and time origin separately. Bind the quantum to the actual retained
Playwright scheduler implementation and qualify the hosted version as well.
The inspected scheduler uses a 16 ms grid; a 1 ms advance would move the next
relative animation callback from 16 ms to 15 ms and is insufficient.

Do not replace or suppress PXT profiling, patch its sentinel, inject a positive
profiler offset, subtract an invented elapsed value, or replace a guest clock.
The actual original Runtime must establish its own game-time baseline. Unknown
scheduler versions or an unexpected clock observation must refuse this protocol.

## Required qualification

- Preserve original failed runs and exact vendor/helper identities.
- In separate fresh contexts, observe zero-start and whole-frame-bootstrap
  scheduler paths. Compare actual relative frames, timeouts, intervals and input
  ordering, including the first frame. Keep timers paused between explicit
  advances and exercise delayed host execution.
- In unmodified PXT, observe initial guest elapsed time zero, profiling without
  the sentinel failure, and exact requested elapsed increments. Observe the
  baseline; do not normalize a wrong result afterward.
- Retain countdown, frame ordering, motion, button, dialog and rendering
  expectations. Run affected original/native/authoring comparisons; preserve
  phase-dependent mismatches as failures requiring investigation.
- Check fresh contexts, repeated runs and disposal independently. A clock
  control does not qualify a game, image plane, sound or editor journey.

All enabled checks for the actual candidate and affected runtime qualifications
remain required before adoption. No timing budget, assertion, skip policy or
compatibility count changes are authorized by this claim.
