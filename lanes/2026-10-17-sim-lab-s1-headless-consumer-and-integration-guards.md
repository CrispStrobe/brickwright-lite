## Sim Lab S1 headless consumer and integration guards — 2026-10-17

DONE candidate / QUALIFICATION PENDING — Codex root, implemented on the existing
STM32 composition branch after claimPR1039 merged. User requested continued software
integration. Hosted run38975443782 passes both browsers/build/corpus but unit2
finds the Sim Lab plan missing from trigger paths and five S1 entry modules
without a non-test consumer. Own only the already planned
`scripts/verify-sim-physics.mjs` headless scenario command, a Node worker
transport adapter in scripts/lib, its package command and CLI controls, plus
the exact plan trigger entry and these receipts. Consume the unchanged parser,
compiler, Jolt core, hub bridge, worker client and actual physics-worker entry
to report real movement/encoders/IMU and a worker snapshot; refuse parse and
compile errors, retain one-clock ownership and clean up worker/core resources.
Use the existing driving-base asset/catalog and original physical expectations.

Preserve the Sim Lab owner's runtime files, UI/engine/pins, worker protocol and
all original guard assertions. No dead-code allowlist, fabricated import, test
consumer counted as production, waived diagnostic, trigger bypass or workflow
budget change. Add only the missing governed plan path to Build's trigger.
Require the unchanged two failed controls and all enabled final-head source CI
to pass before source merge. This creates a genuine headless diagnostic entry
point; browser editor integration remains owned by Sim Lab's existing lane.
