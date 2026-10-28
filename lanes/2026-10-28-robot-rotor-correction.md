# Robot Lab rotor correction: preserve reaction, contact and endpoint guards

Status: CLAIMED — source candidate; native qualification pending.
Owner: Codex, user-approved ordered measurement and physics continuation.
Carrier branch: `lane/robot-coast-steering-20261028` (scope-only stage).
Base: `b9fa2e844f66566f9f801c94a4dfd425e973bdd6`.

## Source successor checkpoint

Scope merged by PR1531. Source carrier:
`lane/robot-rotor-correction-successor-20261028`, composed normally from
published `92fb5d37` and scope merge `0ecd77de`.

Candidate replaces lagged whole-step rate feedback with current native signed
motor/friction impulses. A pure rotor algebra module computes effective axial
moments from inverse tensors, rebuilds all rank-one additions from captured
bare tensors, and computes a full common vector for each free rotor component.
Anchored components receive no common kick. Native warm-started motor lambda
uses the pinned body1-negative/body2-positive convention in N m s; no extra
previous-step impulse or timestep multiplier is applied. Rollback restores
rotor configuration together and rebuilds derived tensors without rate history.

Six independent pure algebra controls pass, including anisotropic rotated-axis
momentum, scalar-axis mutation detection, effective moments, multiple additions,
removal and non-dynamic endpoints. Seven new native controls are prepared for
configuration, signed torque, passive friction, shared velocity servos, clamped
orientation, rollback and a transverse ordinary neighboring hinge. Native
controls have NOT RUN. The existing free-pair,
Sarrus, collision and transport assertions are unchanged byte-for-byte.

This remains a provisional diagonal approximation. Shared or differently aligned
rotors do not get an exact coupled inertia matrix; contacts retain inflated
common-mode inertia and positions integrate before the velocity correction.
The core currently constructs static/dynamic bodies, so kinematic admission has
pure algebra coverage only. No physical, contact, browser, endpoint or combined
main qualification is claimed. Failure of the original guards or meaningful
new controls stops this candidate and requires separately scoped native work.
In particular, a correction shared only by rotor-linked bodies may reopen an
ordinary neighboring hinge's transverse angular constraint. The new causal
control measures that risk against the same bench without rotor inertia; it
has not yet been executed. Do not treat the source checkpoint as qualification.

The qualification handoff in PR1521 delegates completion of published PR1505.
Read its frozen source and first failure originals before choosing a correction.
Published head `92fb5d37cb244855b9a8af40dd122b444a21ec7a` still applies lagged
whole-step angular-rate coupling, although its PR description discusses a
motor-impulse-only approach. The successful analytic free-pair example alone
is insufficient: actual unit assertions fail in Sarrus clearance, collision
stopping and hub motor endpoint agreement. Retain these outcomes and their
original assertions. No tolerance or model-verdict relaxation is claimed.

Own a source-preserving successor for relative rotor inertia in
`lib/bw-sim/physics/jolt-core.js`, corresponding GUI mirrors, focused new or
extended rotor/rollback diagnostics and tests, exact new GUI-consumer entries,
and this claim plus relevant rotor/validation documentation. Preserve existing
Sarrus clearance, world collision and hub transport comparisons byte-for-byte
unless a separately justified source/model correction requires a stronger test.
Do not import the unpublished tolerance relaxation from the original owner's
worktree or mutate that tree. Preserve the published branch and all originals.

Derive sign, units, effective axial moments and momentum conservation against
the pinned hinge motor convention. Preserve clamped, dynamic and kinematic
behavior, multiple rotors, repeated configuration/removal, velocity servos and
rollback. A motor-impulse correction is only a candidate: contacts and integrated
positions need actual verification, not a claim from algebra. If a native solver
or engine API/pin change proves necessary, separately claim that owning fork
and integration before doing it; none is silently authorized by this file.

Coordinate the active resting-creep contact/manifold successor and existing
collider/model owners before shared-file composition. This scope owns no
contact policy, material, floor, timestep, solver-iteration or model geometry
change. Run the new correction through the original failing guards, meaningful
analytic negative controls and all currently promoted-model verdicts, then
actual affected browser/save-reopen qualification. Keep every old failure.

Acquire genuinely new official originals once after exact metadata admission;
audit retained bytes independently without producer imports or guest replay.
No unchanged-failure rerun, repeated one-shot label/dispatch, force push,
auto-merge, pin drift or private public paths. Every enabled exact-head check
must succeed, only declared skips, before a guarded normal merge and exact
predicted/actual tree/parent verification. The broader user loop stays open
through the subsequent coasting, buildable-steering and coordinated contact work.
