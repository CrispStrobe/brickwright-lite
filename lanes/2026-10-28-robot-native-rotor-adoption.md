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
