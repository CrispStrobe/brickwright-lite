# SPIKE macOS packaging: bundled Renode, signing and installed test

Status: DONE — implementation and signed dry run 40507444319 (see docs/SPIKE-MACOS.md); open items listed there. Operator-authorized follow-up to
`lanes/2026-10-26-spike-macos-runtime-feasibility.md`.
Owner: Claude, operator-approved (including `.github/workflows/release.yml`).
Base: current main at claim time.

No open PR or claim of the model-delivery lane touches `release.yml` at claim
time; if one appears, this lane rebases onto it rather than overwriting it.

Scope in this repository:
- `apps/tauri/src-tauri/src/renode_supervisor.rs`: macOS child environment for the
  bundled multi-file Renode under `Contents/Resources/renode` (container `TMPDIR`,
  shipped tlib directory, loopback bind), with focused Rust tests. No change to
  Linux launch semantics beyond the loopback bind variable.
- New `scripts/stage-spike-macos-resources.mjs` (+ focused test) that freezes the
  own NuttX profile with the existing `scripts/lib/spike-resource-profile.mjs` and
  maps the Renode layout as Tauri resources with compile-time pins.
- `.github/workflows/release.yml` (macOS leg only): build the own guest and the
  SPIKE Renode layout (reusable workflow in `renode-spike-prime`), stage them,
  sign every nested binary with the existing Mac App Store identity (child:
  `app-sandbox` + `inherit`), measure hardened-runtime entitlements with the real
  Team ID, and an installed-app test on a hosted macOS runner booting the own
  NuttX guest. Upload to App Store Connect stays tag-only and is not triggered;
  no tag is created by this lane. Dispatch runs only.
- `docs/SPIKE-MACOS.md`, the macOS section of `docs/SPIKE-STATUS-AND-LANES.md`,
  this claim and the 2026-10-26 claim's status.

Qualification: affected Rust/script tests, the hosted macOS dispatch run's
signed-build and installed-guest result, every enabled exact-head check, normal
matched-head merge. Original failures are kept. Not a licence clearance.
