## iOS mobile workflow resource preparation — 2026-10-17

CLAIMED — Codex integration owner, branch
`docs/ios-workflow-resource-preparation-20261017`, base
`e2225bb05eb2464e31100de3a8060f59ab6f3062`. The release ownership claim
PR1011 is merged. PR1020's generated-project resource preparation is reached
through the local device-build npm hook; the current mobile workflow invokes
the Tauri CLI directly and does not execute that preparation. Its local signed
archive and simulator results do not automatically qualify the workflow path.

Own only `.github/workflows/mobile.yml`, focused workflow call-path controls,
this ledger and narrowly necessary packaging documentation. Connect the
existing reviewed preparation to the simulator, App Store signed and device
IPA build paths after project initialization, with explicit ordering controls.
Preserve the preparation implementation from PR1020, embedded frontend inputs,
all other resources and static linker inputs, the Tauri CLI targets/export
methods, privacy/icon/signing/provisioning checks and existing CI bounds.
No application/runtime/firmware/dependency, version, tag, signing policy, secret
handling or unrelated workflow change belongs in this lane. Coordinate any
required helper implementation change as a separate envelope before editing.

Merge this claim before implementation. Require nonvacuous call-path and
ordering controls, every enabled exact-head check, and affected actual clean
iOS qualification on the final combined source before merging implementation.
Independently inspect source-bound unsigned app and actual signed IPA resource
inventories, including duplicate frontend folders and unintended static
archives; source checks or fresh initialization alone are not absence proof.
Preserve embedded offline frontend, frameworks, privacy, icons and signatures.
Existing component receipts remain bounded; physical device acceptance,
release versions/tag, upload, both TestFlight groups and Beta App Review stay
separate prerequisites. No new mobile or release event is performed by this
documentation-only ownership claim.
