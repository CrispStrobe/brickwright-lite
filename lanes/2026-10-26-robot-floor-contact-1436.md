# Robot Lab driven-linkage floor contact — issue1436

Status: DONE — generated-ground source correction and regression contract.
Landing requires actual hosted acceptance and every enabled exact-head check;
the associated implementation pull request records that verdict. No physical-accuracy claim.
Owner: Codex, Robot Lab floor-contact lane.
Source branch: `lane/robot-floor-contact-1436-source-20261026`.
Claims landed through #1439 and #1442.
Base: `a7f688940f96ac89771dfc533ea17dab635703b5`.

Issue1436 reports that the single-chain Sarrus control, driven by the intact
model's original program, loses ground contact and falls through the floor.
Preserve that failure and its exact inputs. The observe-only control is a
mitigation, not a solver fix.

Scope: `overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js`, a new
`test/bw-sim-floor-contact.test.mjs`, fixtures under
`test/fixtures/bw-sim/floor-contact/`, an optional standalone
`scripts/verify-sim-floor-contact.mjs`, and
`docs/ROBOT-LAB-FLOOR-CONTACT.md`, plus this claim. Use existing qualification
infrastructure; any additional workflow, engine/fork change or pin adoption
requires a separately coordinated scope first.

Qualification entry-point clarification: `test/bw-sim-sarrus-lift.test.mjs`
may invoke the new floor-contact fixture qualifier, preserving all its existing
tests and assertions. Reuse its existing GUI dependency declaration and the
unchanged direct-VM helper; no shared GUI-scope allowlist or workflow edit.
This added entry-point ownership must land before editing that file.

First bind the reported model/program and current engine inputs and reproduce
the failing ground-contact case. Correct its runtime collision behavior;
do not change model geometry or drive instructions to avoid the failure,
teleport or clamp returned poses, weaken assertions, or relax existing time,
resource or observation limits. Retain fixed-step observers and other owners'
code. Require the driven case to retain valid ground contact, with the intact
Sarrus and observe-only single-chain controls preserving their existing
behavior. Preserve original failures and meaningful negative controls.

Merge this claim before implementation. Heavy builds and actual physics runs
use hosted CI in the owned repositories. Source changes need affected clean
actual-engine qualification and every enabled exact-head check before a normal
matched-head merge with independently verified parents/tree. Acquire official
originals once after admission and audit them independently. No measurement
pane/helpers/readers, shared session/worker protocol, NXT/API/direct-VM helper,
model registry, census files, dependency pins, native/firmware, hardware or
production-service changes belong to this lane. Issue1435's separate resting
frame creep is not claimed here.

Implementation: generated, level 20 m ground uses Jolt's solid negative
half-space at the original top height. Authored boxes, sweep cutoff, timesteps,
solver counts, models and motors remain unchanged. Four pure controls pass;
standalone scalar-reader synthetic acceptance and seven rejection cuts pass.
Eight isolated actual-engine cases are required: old/candidate compound drop,
old/candidate driven single-chain, intact Sarrus, and held cold 0/275/1000 ms.
Original intact assertions remain. Retained baseline core bytes are exact;
candidate identity is measured from the tested tree. See
[the diagnostic contract](../docs/ROBOT-LAB-FLOOR-CONTACT.md).
Finite floor-edge equivalence, resting creep, calibration and general solver
stability remain separate scoped work. A red actual case keeps source unmerged.
