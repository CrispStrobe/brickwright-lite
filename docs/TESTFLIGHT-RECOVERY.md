# Recover the existing TestFlight 0.1.26 release

This metadata-only workflow audits or recovers an already uploaded release. It
does not build, sign, upload, create groups, change versions or move tags.
The original mobile upload succeeded; its notes step timed out before an iOS
build became VALID. That old timeout does not establish current Apple state.

The supported immutable input is `v0.1.26`, release source
`6d78f7e107752497ed96b30b03e985386916fc59`. The workflow checks out its own
qualified recovery source separately from that tag. Both the actual release
checkout and the app version/bundle identity are admitted before API access.
No credentials are needed locally: existing Actions secrets remain in their
existing secret boundary. Never print keys, raw API bodies or writer output.
Resolve the app privately using Apple's [bundle-ID filter](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps).
Only the three existing API credentials enter the workflow environment;
the resolved app ID is passed to captured writers inside the process.

## Qualification and operation

Run `node --test test/testflight-release-recovery.test.mjs` and admit every
enabled exact-head check before landing the workflow. Keep the admitted source
branch frozen. Dispatch `TestFlight release metadata recovery` at that exact
branch with `action=audit` first; verify the returned run's head SHA. Do not
repeat an actual dispatch or re-download an acquired original to inspect it.

Audit is read-only. It observes the exact release's iOS and macOS build state,
source/version/platform/app identity, expiry, export-compliance flag, existing
group memberships, bilingual notes and review/testing state. Pagination is
bounded and may not leave Apple's API origin. Missing, ambiguous, expired or
rejected state must not become a recovery success.

Only after audit admission, use one distinct `action=recover` dispatch at the
same frozen source. Recovery reuses the release tag's existing notes and
distribution writers, whose existing policy covers its VALID iOS/macOS builds.
It captures their output instead of publishing private identifiers and performs
fresh independent readback after each stage. A writer exit code or tolerated
API error is not proof that notes, exact build/group relationships or review
submission exist. Readback retries are bounded, read-only and do not repeat
the writers. Partial or uncertain failure requires fresh inspection, not a blind
binary re-upload or an unchanged workflow rerun.

Existing localization entries and one unambiguous internal/external group are
required. A missing locale/group, encryption inconsistency or rejected review
needs a separately scoped repair or operator decision; the workflow never
creates groups or silently selects among multiple groups.

## Reading the result

The public summary contains only release-source identity, platform/state names
and verification booleans, not raw Apple objects or private resource IDs.
`metadataVerified` proves matching bilingual notes, export state and exact
group relationships. `PENDING_REVIEW` is not approval; `PENDING_AVAILABILITY`
is not proof that testers can install. `COMPLETE` also requires observed internal
and external testing availability without an opposing pending/rejected review.
None of these is a hardware, physical-device-install or native-code qualification.

Apple's [beta review states](https://developer.apple.com/documentation/appstoreconnectapi/betareviewstate)
and [build beta details](https://developer.apple.com/documentation/appstoreconnectapi/build-beta-details)
are separate observations. Preserve that distinction when reporting delivery.
Do not close the instrument campaign's release prerequisite merely because an
upload, GitHub release or metadata writer succeeded.

## Follow-up for future releases

Apply private app discovery to the ordinary metadata launch points in
`mobile.yml` and `release.yml`, with their shared writer interfaces and tests.
Keep opaque app IDs inside the authenticated process, including subprocess
environments; prove runner headers and summaries omit them. Preserve existing
version/platform selection, signing and upload behavior, and immutable tags.
Claim that separate boundary before implementation and require affected
workflow qualification. This recovery does not qualify those launch points.
