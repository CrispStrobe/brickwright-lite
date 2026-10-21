# SPIKE compiler/runtime power contract adoption — 2026-10-21

Owner: Codex, Arcade integration repair. Isolated branch:
`lane/spike-power-adoption-claim-20261021`, based on `bf59ed7e5`.
Status: claim only; implementation waits for this claim to merge.

## Observed gap and intended repair

The Arcade integration's adopted Creator supplier emits SPIKE `motorStartPower`,
but its current bundled SPIKE extension does not implement that opcode. The
complete hosted independent SPIKE gate reports two failures in its opcode and
menu conformance controls. Preserve those assertions.

The owned extension supplier already implements power separately from regulated
speed at `ff74f1309b8807713508884048292182a369f8f5`. Review its exact qualified
head and adopt it through the canonical vendor producer, scoped to SPIKE only.
The existing encoder-based movement wait fix is already present upstream;
prove its exact preservation before retiring the corresponding divergence.
The independent gate also names an absent bridge-test path: use the actual
canonical eight-group bridge module rather than deleting that coverage. That
missing path is a separate source coverage issue, not the observed failure cause.

## Owned Lite paths

- `scripts/verify-independent-spike.mjs` (canonical bridge-test name only).
- `scripts/spike/bundled-upstream.mjs` (SPIKE-specific supplier pin and the
  precisely reconciled SPIKE divergence; other extensions stay at their pins).
- `vendor-pins.json` (explicit reviewed SPIKE supplier identity).
- `scripts/lib/notices-census.mjs` and its normal generated notice evidence,
  if required to retain the scoped supplier identity and attribution.
- Generated `overlay/scratch-vm/src/extensions/crispstrobe/spikeprime/index.js`
  and `overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json`.
- Generated `overlay/scratch-gui/src/lib/extension-menu-table.js` and its normal
  integrated mirror, using actual complete extension metadata generation.
- `overlay/scratch-gui/src/lib/virtual-hub/spike-hub-commands.js`,
  `overlay/scratch-gui/src/lib/spike-sim/independent-backend.js`,
  `overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-motor-controller.js` and
  `overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js`: adopt a
  distinct open-loop duty mode at the existing command/model/physics boundary.
  Reuse the existing motor physics; preserve regulated speed, replacement, Stop,
  interruption and encoder completion. Modeled no-load behavior must be explicit;
  a speed alias is not a duty implementation. Other hub/controller/UI paths are
  excluded. This is the narrow motor-power continuation of the old arena lane,
  not a takeover of its lifecycle or editor work.
- New `test/spikeprime-motor-power-adoption.test.mjs`,
  `test/spikeprime-independent-gate-manifest.test.mjs` and the directly affected
  existing SPIKE Python opcode/menu conformance controls, retaining assertions.
- `docs/ARCADE-CI-REPAIR-STATUS.md`, `docs/ARCADE-AGENT-HANDOFF.md`,
  `docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md` and this claim.

No firmware, connection transport, shared physics engine, producer compiler or
other extension source changes are authorized by this claim. The four enumerated
SPIKE virtual command/model/controller paths are the only model boundary in
scope. If required behavior is missing elsewhere, coordinate a separate scope
rather than bypass it.

## Acceptance

Preserve original hosted failures and confirm the adopted supplier's enabled
exact-head checks. Verify source-to-bundle identity, targeted pin isolation,
unchanged movement-wait behavior and actual generated menu metadata. Qualify
signed power, clamping, port validation, zero/coast and separate regulated speed
through the shipped implementation, including affected actual virtual execution.
Run complete SPIKE conformance and affected clean guest controls; do not replace
an absent prerequisite with a passing skip or claim physical-hardware accuracy.
Final normal landing still requires all enabled exact-head checks and a verified
merge composition. Use existing qualification; do not add an unnecessary
`ci:full` label or duplicate dispatch. Private receipts and local paths remain
outside public Markdown.
