# Arcade connected authoring acceptance

Status: ACTIVE. Owner: Arcade integration. Base: main `7f753d25da4fc93ea02af31f83f78e9c8617b372`.

Extend the existing official-build numeric-authoring browser harness and an
owned fixture to exercise representative published Array/snake, frame-delta
and number-entry/runtime programs through visible Blocks and Code editing,
save/reopen and export. Compare observed supported behavior with the pinned
original PXT simulator, with deterministic controls for clocks and inputs.
Existing qualified Pixel/Code/Blocks Image authoring evidence remains distinct.

Scope: `scripts/verify-arcade-numeric-authoring-gui.mjs`, its narrowly related
`scripts/lib/` browser helpers if necessary, a new owned fixture under
`test/fixtures/`, focused harness controls, the existing Arcade handoff and
pending task list, and this claim. Do not change product behavior, dependencies,
pins, workflows, unrelated browser journeys or other owners' files. If the
existing job cannot safely host the scenarios, amend the scope before changing
its CI envelope.

Qualification: preserve the admitted official artifact/source binding; exercise
real visible user events and save/reopen, compare exact supported behavior to
original PXT and Lite, and retain independent reports. Add meaningful negative
or mutation controls. Run all enabled exact-head checks including affected
hosted actual browser/guest acceptance before landing. Keep unobserved behavior
and previously input-limited examples outside the claim.
