# Robot Lab native reflected-rotor adoption

Status: IMPLEMENTATION CANDIDATE — native API migration prepared; qualification pending.
Owner: Codex, user-authorized ordered measurement and physics continuation.
Base: `a5705955b274ae75c3aa890fb4ce1424e9ee6afb`.

The merged [rotor correction scope](2026-10-28-robot-rotor-correction.md)
requires a separate native/pin scope if a solver element is necessary. A clean
Node 22 / released bw.7 diagnostic rejected the published post-step successor:
the ordinary neighboring hinge's forbidden transverse speed was 0.313091 rad/s,
versus 1.40e-8 without the correction, against the unchanged 1e-4 guard.
Preserve this failure; do not rerun an unchanged candidate or loosen a guard.

Coordinate native [JoltPhysics PR2](https://github.com/CrispStrobe/JoltPhysics/pull/2)
and [JoltPhysics.js PR3](https://github.com/CrispStrobe/JoltPhysics.js/pull/3).
The owning forks implement and qualify the optional scalar hinge rotor inside
native velocity iterations, contacts, warm starting and state restoration.
No hidden body or JavaScript post-step momentum correction is accepted.

Own only the reviewed Jolt package URL/integrity/version change in
`packages/scratch-gui/package.json` and its lockfile, corresponding generated
package mirrors, native-API use and rotor bookkeeping in
`lib/bw-sim/physics/jolt-core.js` with its GUI source mirror, focused rotor and
state/effort controls, exact new GUI-consumer rows, this claim and affected
physics/qualification documentation. Advance the engine pin only after native
and built/packed scalar AND SIMD qualification identifies the exact package.
Keep unrelated dependency/compiler pins and consumers unchanged.

Replace approximate body-inertia inflation and post-step corrections with the
qualified native hinge API. Body mass, centre of mass and bare inertia must
remain unchanged. Preserve reflected relative response and housing reaction,
static/dynamic/kinematic cases, multiple rotors, zero/removal/reconfiguration,
sleep/activation and exact checkpoints. Require ordinary neighboring hinge and
anchor-point controls, and preserve the original Sarrus clearance, collision
stop and hub endpoint assertions. No tolerance/model-verdict change, material,
contact policy, floor, timestep or solver-iteration change is included.
The active resting-creep successor keeps its contact-policy ownership.

Qualify clean affected Jolt, promoted-model/program and actual rendered
save/reopen paths at the adopted package and actual combined source. Preserve
all frozen failures, branches and originals. Acquire new official originals
once after metadata admission; independently audit saved bytes without replay.
Open a new ready PR without a full-CI label; inspect its actual opened scope,
then apply the one full label when required. Every enabled exact-head check
must succeed, only declared skips, before a normal matched-head merge and
predicted/actual parent/tree preservation proof. Keep the broader user loop
open through coasting, buildable steering, coordinated contact and final docs.

The source candidate uses native hinge configuration and native completed-step
rotor impulses, scalar speed and energy. Rollback restores JavaScript metadata
without reconfiguring the already-restored native rotor. The original issue1494
fixture is retained verbatim; new controls cover atomic configuration, bare body
properties, optional effort copies, stale samples and exact native checkpoints.
The candidate now pins the qualified `1.1.0-bw.9` archive from the owning fork's
`bw.9-qualified-20261029` release, including its exact SHA-512 integrity and
archive SHA256. Those published bytes are the already-qualified built/packed
scalar/SIMD package, with native coupled soft-motor/rotor rows; no rebuild is
substituted. Earlier bw.8 consumer failures remain preserved, including hub
full-turn endpoints, clutch-bench transmission, Twinpoint loop closure and
Butterfly wing sweep. Library qualification does not establish their repair.
Fresh main composition and affected native/model, programme, rendered worker
and saved-project qualification remain pending at this package. No consumer
acceptance follows from the owning forks' bounded native/package results.

The same package-pin implementation includes only the canonical
`JOLT_PHYSICS_URL` and `JOLT_PHYSICS_INTEGRITY` literals and their adjacent
archive SHA/release-history comment in `scripts/integrate.mjs`, which produces
the GUI manifest and checks its lock entry. This does not expand ownership to
other pins or toolchains; all other constants, dependency maps, GUI consumer
rows, core guards and model inputs remain unchanged. No integration/install
script or engine qualification has been run for this source candidate.

The pin update also refreshes only the existing Jolt release row in the
fetch-pinning census: URL, package version, archive SHA256 and the description
of its qualification. Its content-hash classification, scanner, exclusions,
assertions and all other rows remain unchanged. The first bw.9 CI build refused
the stale bw.7 census; the original failure is retained. A direct source-policy
check reproduced that undeclared URL before the metadata correction.

## Findings on main + #1553 at bw.9 (2026-10-30, fix/rotor-1494-20261030)

Measured on main + #1553 with bw.9 for every model. On this Mac, clean main (`e4fe7f8bc`, bw.7) passes all 271
`bw-sim-*`, `robot-lab-*` and `*qualification*` files.

The #1494 law holds with the native rotor. Afterturn's actual program reorients the
platform 0.02606 to 0.02608 platform degrees per wheel degree at B ≈ 0. The bare-tensor
prediction at the saved pose is Iw/J = 6.044e-5 / 2.318e-3 = 0.02608, against 0.1239 for
the old (Iw+Jr)/(J+2Jr). The focused tests in `test/bw-sim-rotor-inertia.test.mjs` pass.

Control: bw.9 with the old body-inertia code (diagnostic only, never committed) passes
every listed consumer. The other bw.9 engine changes are therefore inert, and every
consumer change comes from the rotor treatment.

Two changes were mechanical:
- With native for every model, Counterturn's `reflectedVerticalLeakageFraction` (a measure of
  the body-tensor increment) became 0/0. Under the opt-in decision below Counterturn stays
  `legacy`, so its original test is kept unchanged.
- Engine-pin bookkeeping: `test/fixtures/bw-sim/floor-contact/manifest.json` and
  `test/fixtures/resting-creep-1435/manifest.json` pin bw.7.

In the remaining failures, the housing is clamped or does not turn about the motor axis.
In that case ½·Jr·(ω2 − ω1)² equals ½·Jr·ω2², so putting Jr on body2 only is the same
physics. Even so, the native rotor row differs from that equivalent body2-only form:

| test | native | body2-only Jr | 255 vel. steps | 4 substeps | static-housing hybrid |
|---|---|---|---|---|---|
| validation stall (arm into block) | fail: residual 88 °/s at a still arm | pass | fail | pass | pass |
| validation-2 tilting table | fail: 6.19° vs 6.98 ± 0.5 | pass | fail | fail | pass |
| differential-car rack stall | fail | pass | pass | pass | fail |
| qualification carry-ratio | fail: ball 2/7 | pass | fail | fail | fail |
| brick-buttons-guest FDK turn 50 | fail: 2° vs > 10° | pass | fail | fail | fail |
| seven-machines butterfly | fail | pass | pass | pass | fail |
| crane reverse-only | fail: crane launched 17 cm / 54° | pass | pass | pass | fail |
| watt backstops | fail: −45.8° through ±26° stops | pass | fail | fail | fail |

Cause: the rotor is a separate scalar DOF (Jr ≈ 3e-4 to 2.5e-3 kg·m²). It is coupled
to a light output body (gear, arm, wheel; axial inertia about 1e-6 to 3e-5) by a hard row
that the sequential-impulse solver solves separately from the contact, gear-mesh and
friction rows on that body. Those rows act on the bare light body, and the rotor row then
restores most of its velocity. Each iteration therefore moves the rotor's momentum by only
about I_light/Jr, roughly 1 %. This is the same failure the old setRotorInertia comment
recorded for a motor-term rotor: a gear slipped and an arm went through a block. Iteration
count and substeps fix only some cases, and the stall, FDK and Watt fixed points do not
converge. Fixing this needs a solver decision (fork). It is not a test or tolerance change.

### Decision (owner, 2026-10-30): per-model opt-in now, solver later

- The engine stays `jolt-physics 1.1.0-bw.9`. The default rotor is main's body-inertia
  treatment, so unflagged models are byte- and behaviour-identical (all 271 baseline files).
- `0 !BW ROTOR_INERTIA native` in a model's main section selects the native relative rotor, which
  leaves bare body inertia unchanged. It works like `0 !BW MOTOR_DIRECTION`: parsed, validated,
  kept through edits, undo, save and reopen; invalid or duplicate declarations refuse
  simulation; submodels cannot override it (docs/SIM-LAB.md, "Motor rotor treatment").
- Opted in: `afterturn` and `afterturn-fixed-masses`. In both, the motor housing is the free
  yaw platform, and the motor axis is the yaw axis. Counterturn's carrier also yaws, but its
  motor axis is horizontal ((a·ŷ)² = 0), so `legacy` is already exact there.
- Afterturn law: test/bw-sim-rotor-model.test.mjs, Iw/J = 0.02608 within 1 %.
- The general fix is separate Jolt-fork work: solve the rotor row together with the output
  body's contact and gear rows.
