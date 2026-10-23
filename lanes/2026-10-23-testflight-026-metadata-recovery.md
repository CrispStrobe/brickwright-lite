# TestFlight 0.1.26 metadata and distribution recovery

CLAIMED — Codex circuit/release follow-through owner, isolated branch
`lane/testflight026-metadata-recovery-20261023`, exact base
`6ed78045cb672acfd67271500a4eaf5ff9c82cb6`.

The user authorizes completing release recovery before the scoped instrument
campaign. The existing v0.1.26 mobile run built, signed and uploaded the iOS app,
then timed out waiting for a VALID iOS build while only macOS was VALID. Its
distribution step did not run. This is not proof of a signing or notes-format
defect, nor proof of current Apple processing, group or review state.

Own only this claim, `.github/workflows/testflight-release-recovery.yml`,
`scripts/testflight-release-recovery.mjs`,
`scripts/lib/testflight-release-state.mjs`,
`test/testflight-release-recovery.test.mjs`, and
`docs/TESTFLIGHT-RECOVERY.md`. The workflow census bootstrap additionally owns
`scripts/gen-ci-steps.mjs`, `test/ci-step-census.test.mjs`, `CI-POINTERS.md`, and
`docs/generated/ci-step-census.json`: allow a scoped, zero-run manual workflow
declaration using the existing recorded source baseline, preserve unrelated
workflow observations, and record explicitly that no live run has occurred.
Do not manufacture successful-run evidence or weaken census checks.
Do not modify mobile/release build workflows,
existing writer implementations, dependencies, pins, native sources, signing
policy, secrets or old tags. Coordinate a separate expansion if an actual
writer defect requires repair. Other circuit/Robot Lab/native owners continue
independently; no overlapping source or package work belongs in this lane.

Implement a manual-only, metadata-only audit/recover path using the existing
Actions App Store secret boundary. Admit the immutable release tag, exact
source/version and existing Apple build/platform identities before recovery.
Audit performs no writes. Recovery reuses the admitted release's existing
notes/distribution writers; it never builds, signs, uploads, creates groups,
changes app versions or modifies a different release. Avoid exposing API keys,
raw API payloads, private identifiers or captured writer logs in public output.

Use fresh readback, not writer exit status or tolerated API errors, to verify
both localized notes, exact build/group relationships, export-compliance state
and Beta App Review state. Pending review is not approval or external delivery.
Retain the original failure and report partial or uncertain operations honestly.
No blind rerun or duplicate upload; audit existing state first.

Merge this claim before implementation. Require pure executable controls for
read-only mode, source/platform/version refusal, missing/ambiguous builds,
writer ordering/failure and postcondition mutations, plus workflow-call-path
and secret-output controls. Admit all enabled exact-head CI before landing;
then perform the bounded actual API audit and qualified recovery, recording
observed results without a native or physical-device qualification claim.
