# Robot Lab force, precision, presets and paired controls

Status: DONE (implementation) — normal landing requires the candidate's exact-head hosted qualification.
Owner: Codex, user-approved four-item Robot Lab continuation.
Isolated branch: `lane/robot-force-precision-pairs-20261026`.
Base: `5cd027707eceed3451bd62eaa21125a051650e59`.
Merge this claim before implementation. Carry all four items through affected
hosted qualification, independent retained-original review and normal merge
before closing the user loop.

1. Publish existing slider motor/limit force and power, passive hinge friction,
   screw slip diagnostics and contact presence as measurements where their
   existing native readers establish the value. Preserve units, unavailable
   states and provenance. Contact presence does not establish contact force;
   filtered screw supporting load is not signed instantaneous force.
2. Consume opt-in completed fixed-step observations through accepted worker
   batches for period, phase, signed discrete motor work and bounded triggered
   recording windows. Reject discarded retry batches and stale selections;
   expose gaps and overflow. Preserve current recording memory/sample/duration
   caps, fixed timestep, solver settings and physical checkpoint semantics.
3. Add role-based measurement packs and a measurement-specific save/reopen
   pilot for the model/control entries in owner PR1336. Coordinate against its
   explicit admitted source identity and current manifest. Own measurement
   bindings and bounded qualification fixtures only; preserve the delivery
   owner's registry, geometry, programs, thresholds and release decisions.
   Metadata coverage is distinct from actual persistence and mechanical tests.
4. Add explicit opt-in control-pair comparison, retaining both authored model
   identities, units, semantic bindings and provenance. Preserve strict default
   same-model comparison. Version and validate the new persistent semantics;
   refuse ambiguous or incompatible comparisons rather than silently relabeling.

Path envelope: helpers under
`overlay/scratch-gui/src/lib/bw-sim/measurements/`; measurement-only panel and
persistence integration in the existing simulation pane and project bundle;
observation selection/transport in the existing worker protocol, physics host
and client, SimRunner and SimSession; corresponding generated GUI mirrors;
focused tests, the existing measurement browser helper, standalone artifact
reader and measurement artifact-upload steps in `.github/workflows/build.yml`;
measurement/dynamics/architecture documentation and this claim. New bounded
qualification-only helpers may read explicitly pinned owned model sources for
PR1336 persistence coverage without adding public gallery entries or changing
those model sources. Keep observation collectors internal, bounded, removable
and separate from physical rollback state; apply analytical state only after
accepted replay and matching selection identity.

No solver/core physics change, motor rule, material/floor/iteration/timestep
change, dependency pin adoption, model registry/geometry/program ownership,
API, native, firmware, resource, deployment or release work is claimed. Reuse the
landed fixed-step observer and copied diagnostic readers. Preserve the rejected
solver experiment and all prior failures and limits. Native9710 and previously
accepted originals remain sealed; do not replay or reacquire them.

Acceptance: focused positive and meaningful negative controls, bounded versioned
persistence and identity refusal, observed/unobserved trajectory preservation,
actual hosted Jolt and rendered save/reopen journeys, and successful new bounded
originals acquired once after metadata admission and audited independently
without producer imports or guest replay. Admit every enabled exact-head check,
only declared skips, and verify reviewed/predicted/landed parents and tree.
New implementation opens Ready without `ci:full`; admit actual opened-event
fast=true/thorough=false scope before adding `ci:full` once. No Ready cycle,
duplicate dispatch, relaxed acceptance or physical-accuracy/release claim.


## Candidate boundary

All four implementations are composed with main after PR1336 landed. Existing
force channels, accepted fixed-step rotation/oscillation analysis, versioned
scheduled windows, explicit structural packs and the separate paired codec/UI
are present. Pure codec, lifecycle, binding and persistence controls pass. Actual hosted
Jolt/worker and browser journeys, plus independent new-original review, are
mandatory landing gates. The new
browser journey retains original paired project bytes, accepted native packets
and the exact 60-source structural persistence report for an independent reader.
No prior native or successful original is replayed. The final merge remains
gated on every enabled exact-head check and admitted new-original review.
