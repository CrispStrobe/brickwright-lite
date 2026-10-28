# Robot Lab tracked coasting and buildable steering

Status: CLAIMED — scope only; merge this claim before implementation.
Owner: Codex, user-approved ordered Robot Lab continuation.
Branch: `lane/robot-coast-steering-20261028`.
Base: `b9fa2e844f66566f9f801c94a4dfd425e973bdd6`.

Finish existing measurement acceptance and coordinate the published rotor,
collider and model repairs before changing their shared runtime integration.
This claim prepares the two unimplemented P4 packages in
[the Robot Lab handoff](../docs/ROBOT-LAB-AGENT-HANDOFF.md).

1. Measure tracked-frame coasting against the true-parts analytical inertia and
   drag prediction; retain the existing floor baseline and bounded alternative
   floor observations. Select a demonstrated correction that preserves static
   hold and powered/stalled behavior. Do not substitute angular damping or tune
   material coefficients to fit a desired result.
2. Design a differential-car steering linkage that meets its pin holes using
   stock parts. Reject the documented non-buildable rack-offset shortcut.
   Regenerate the model with its generator, verify geometry/collision/bindings
   and qualify circle, steering, stop and parked behavior before narrowing any
   acceptance band to the demonstrated analytical result.

Owned scope: bounded new qualification helpers/fixtures and corresponding tests;
coasting-specific portions of `lib/bw-sim/physics/rolling.js` and, only if needed,
sprocket inertia bookkeeping in `lib/bw-sim/physics/jolt-core.js`; differential
car generator/model and its focused construction/steering tests; corresponding
GUI mirrors, exact new GUI-consumer rows, affected qualification registration,
and physics/validation/measurement documentation. Preserve every existing gate,
budget, source pin and unrelated consumer row. Any workflow addition or generated
budget change requires its own applicable scope and census obligations.

Published rotor-inertia PR1505 retains its relative-motor-inertia changes;
published collider/model PR1512/1510/1514 retain their parts and model ownership.
Coordinate a released exact head before shared-file composition; do not edit
those workers' trees or import an unqualified sibling as accepted main.
The active resting-creep successor retains its contact/manifold implementation;
this claim owns no contact-policy, solver, native Jolt fork or engine-pin change.
No hardware/reference/release or material-calibration claim is included.

Acceptance: independent analytical expectations and meaningful negative controls;
actual clean affected Jolt/model/program and rendered save/reopen qualification;
tracked coast, rolling/static-slope and row25 checks; buildable pin connections,
no-overlap and differential-car circle/stop checks. Preserve every original
failure. Acquire genuinely new official originals once after exact metadata
admission and audit saved bytes independently without producer imports/replay.
Use hosted qualification when the shared host cannot safely run the workload.
All enabled exact-head checks must pass, only declared skips, before a normal
`--match-head-commit` merge with predicted/actual parents/tree verification.
Do not close the broader user loop until the coordinated final physics work
also passes and final documentation is reconciled.
