# Robot Lab effort, saved experiments and physical inspection

Status: CLAIMED — merge this claim before implementation.
Owner: Codex, user-approved four-item continuation; isolated branch
`lane/robot-effort-history-fidelity-claim-20261025`.
Exact base: `d11627829b514398368a5e782e148f3386161983`.

Carry all four items through implementation, affected hosted qualification,
independent evidence review and normal qualified landing before closing the
user loop. Preserve the completed measurement work in PR1375 and PR1387.

1. Publish read-only signed motor/joint effort and mechanical power where the
   existing Jolt impulses and matching velocity establish them. Separate motor
   effort from limit reactions and commands; document units, sign, fixed-step
   interval and unavailable/reset/rollback behavior. No inferred total contact
   force or unsupported hardware-accuracy claim.
2. Persist bounded experiment runs and comparison selections with projects;
   restore on reopen and import the existing CSV format with strict model,
   definition, unit, source, time and bound checks. Preserve unavailable gaps
   and legacy projects. Keep existing bundle caps; refuse incompatible or
   oversized data visibly instead of silently dropping histories. Prevent
   project/model-switch leakage and metadata-dependent identity loops.
3. Add an assembly physics inspector: centre of mass, solver inertia,
   configured mass and effective solver mass, with static bodies and mass/
   inertia floors explicitly identified. Values must come from the admitted
   body snapshot; display sources and units rather than inventing diagnostics.
4. Investigate tracked coasting and imported steering with targeted analytic
   and actual-Jolt controls. Repair demonstrated defects within owned physics
   or measurement paths, preserving mechanical acceptance thresholds and
   existing stability. Retain unresolved model-specific limits; no arbitrary
   material retuning or blanket physical calibration claim.

Owned envelope: measurement helpers, recorder/panel and inspector UI; narrowly
scoped save/restore and observer publication hooks in the existing Sim Lab
pane, persistence and session/worker snapshot paths; Jolt core/rolling/steering
observation or demonstrated corrections; focused tests, existing measurement
browser gate and its independent original reader; measurement/physical-limit
and validation documentation; this claim. New controlled fixtures may test
tracked coasting and steering without editing another owner's model batch.
Canonical overlays follow the established mirror process.

The delivery owner retains PR1336, experimental model geometry/programs,
model intake/importer behavior and pane API pause/resume semantics. No changes
to that owner's transport/API/release files or controls. This lane does not
own native/firmware, dependency pins, signing, deployment or unrelated CI.
Shared persistence hooks are additive and scoped to experiment metadata.

Acceptance: meaningful pure negative/mutation controls plus affected hosted
real-Jolt/browser tests; signed-effort and power analytic expectations; compact
save/reopen and CSV-import roundtrips, malformed/oversized/stale inputs and
project isolation; inspector cross-checks and finite coasting/steering controls.
Retain successful official SB3/JSON/CSV originals once after metadata admission
and audit independently without producer imports or guest replay. Admit every
enabled final-head check (only declared skips), preserve all other owners'
entries, and verify predicted/reviewed/landed parents and tree. Mark the claim
complete in the final source candidate; do not add a ledger-only successor
merely to repeat product qualification. Keep old failures and sealed native
results unchanged. No old successful guest or original is replayed.
