# Read-only TestFlight verification for an admitted new release

CLAIMED — Codex model-delivery owner, isolated branch
`claim/testflight127-audit-20261024`, base
`8308035d54e9121c2d6fdb0fd0dce6c6da6b1392`.

The user authorizes the ordered delivery in claim #1331, including verified
iOS/macOS TestFlight availability for the next application release. The
existing recovery reader deliberately admits only v0.1.26 and its exact old
commit. Preserve that restriction and the other owner's recovery path; it
cannot establish the state of v0.1.27 by reusing an old result.

Own `.github/workflows/testflight-release-audit.yml`,
`scripts/testflight-release-audit.mjs`,
`test/testflight-release-audit.test.mjs`, and a bounded read-only factory in
`scripts/lib/testflight-release-state.mjs` sharing its existing observation
logic. Preserve every old export's v0.1.26 defaults, admission and recovery
semantics. The new factory exposes observations, never recovery or writers.
Do not modify existing mobile/release/recovery workflows, signing/upload,
tester-note/distribution writers, old tags, app-store secrets or group policy.

The new manual audit must bind an operator-declared immutable release tag and
full expected commit to the actual clean checked-out tag, matching app version
and Brickwright bundle identity before secret/API use. Resolve the app inside
the authenticated process, retaining bounded same-origin pagination and exact
build/platform/app joins. Refuse ambiguity, rejected/expired state and source
mismatches. Enforce GET-only API access. Read back both language notes, exact
internal/external build/group relationships, export compliance and beta review
state. Report processing, pending review and tester availability separately;
pending review is not external approval or delivered hardware acceptance.

Print only source identity, categorical state and verification booleans.
Credentials, opaque API resource identifiers, raw response bodies and captured
writer output must not enter public logs or artifacts. Use the existing three
App Store credential names inside the authenticated process; no app-ID job env.

Also own the new workflow's declaration-only census registration in
`docs/generated/ci-step-census.json`, exact dated `CI-POINTERS.md` entry, and
focused census/workflow contracts where needed. Use the canonical generator
helpers, preserving every unrelated run, workflow record and recorded main
provenance. Zero observations remain zero; do not dispatch to populate evidence.

Merge this claim before implementation. Require executable admission,
read-only, identity/platform/group/note/review and secret-output negatives;
preserve the old recovery tests. All enabled exact-head checks and reviewed
normal merge parents/tree precede operational use. After the qualified new
release upload, retain actual audit/readback receipts and report partial
states honestly. No source, upload or TestFlight approval claim follows from
the pure fixtures or a successfully queued audit.

Implementation prepared: a separate frozen-descriptor reader and manual audit
bind the actual release checkout, tag, commit, version and bundle before API use.
The transport refuses writes; complete delivery requires both iOS and macOS.
The original v0.1.26 defaults and recovery path remain locked. Focused audit,
legacy recovery, census and claim controls pass (79, none skipped). The workflow
has declaration-only registration with zero observed runs; existing observations
and recorded main provenance are preserved. Combined-source hosted qualification
and an actual new-release readback remain required before operational admission.
