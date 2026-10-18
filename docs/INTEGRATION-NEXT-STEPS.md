# Integration handoff — 2026-10-17

Refresh PR heads, checks and `LANES.md` before acting. This file records the
integration owner's remaining work; other lanes retain their own ownership.
Historical results qualify their named source and artifact, not later builds.

## Landed and ready for continuation

- [PR990](https://github.com/CrispStrobe/brickwright-lite/pull/990) merged as
  `6d9dfeb1d50139de517cfbdf302055b71eab125f`. Its retained Linux package
  passed finite Stop, held teardown-return, cleanup and two own-NuttX startup
  cases. Two actual UI Stops and the full G02 matrix remain unqualified.
- Release ownership [PR1011](https://github.com/CrispStrobe/brickwright-lite/pull/1011)
  merged as `e2225bb05eb2464e31100de3a8060f59ab6f3062`. This did not publish
  a version, tag, signed build or TestFlight delivery.
- iOS workflow ownership [PR1042](https://github.com/CrispStrobe/brickwright-lite/pull/1042)
  merged as `f823dac58882ba9f03b0d6dc43a214339a39d48a`. Its four enabled
  checks passed; seven documented conditional jobs skipped.

## Remaining work, in order

### 1. Qualify and integrate the iOS workflow resource preparation

Candidate: draft [PR1044](https://github.com/CrispStrobe/brickwright-lite/pull/1044),
head `c85bcbfad27357a1c4446d0c26e373a581d0d8ce`, branch
`lane/ios-workflow-resource-preparation-20261017`. Source CI is pending at this
checkpoint; `ci:full` has already been applied. Do not apply it again merely
to start another run.

Scope: `.github/workflows/mobile.yml`,
`test/ios-workflow-resource-preparation.test.mjs`, and the owning ledger entry.
The workflow delta is three calls to the existing
`apps/tauri/scripts/prepare-ios-device-build.mjs`, immediately after initialization
in `ios`, `ios-signed` and `ios-device`. Keep the helper, other resources,
static linker inputs, CLI targets/export methods, privacy/icons/signing,
provisioning and CI bounds unchanged. A helper implementation change needs a
separately coordinated scope.

All 19 focused tests pass, including the existing preparation and workflow-shape
tests. The new tests execute each actual build block with authored command shims;
they verify ordering, failure propagation and removed/commented/moved/cross-job
negative controls. Run them with:

```sh
node --test test/ios-workflow-resource-preparation.test.mjs test/ios-device-build-command.test.mjs test/workflow-step-shape.test.mjs
```

Next actions and completion criteria:

1. Admit the final source head and successful enabled checks, including the
   existing fast and thorough runs. Preserve failures and conditional skips;
   source tests do not qualify an app or IPA.
2. Review current-main composition before any qualification event. Freeze the
   tested combined source, frontend inputs, native package inputs and actual
   workflow/job/artifact boundaries. Refresh the candidate if needed, using a
   normal merge and fresh checks.
3. Qualify clean unsigned simulator and actual signed device IPA outputs on
   that source. Inspect resource inventories independently: no duplicate root
   frontend folder or unintended static archive, while embedded offline frontend,
   ordinary resources, frameworks, privacy, icons and signatures remain valid.
   Keep App Store and sideloadable export/profile acceptance distinct. No device
   acceptance follows from simulator success.
4. Establish source-to-embedded-frontend identity; matching archive digests or
   passing JavaScript source tests alone do not establish this join.
5. Merge only after actual affected qualification and every enabled final-head
   check succeeds. Use a matched-head normal merge and verify landed tree/parents.

The previously retained mobile event has matching iOS and web artifact digests,
but its Android original is corrupt and the cause is unknown. Do not claim a
whole-event pass, replace that original or repeat its successful acquisition.
Earlier local iOS helper-path results do not qualify the workflow candidate.

### 2. Close the remaining SPIKE G02 lifecycle boundaries

Use [SPIKE-STATUS-AND-LANES.md](SPIKE-STATUS-AND-LANES.md) for the source and
qualified component history. Claim a narrow source lane before implementation.

The latest generation diagnostic stopped at readiness: it did not reach an
armed native run or guest campaign. A complete diagnostic capture took 4.809
seconds, which does not meet the required 250 ms observation cadence. Preserve
the original refusal; do not relax deadlines or treat a matching helper image
as runtime ownership, generation identity or a successful guest result.

The bounded collector and independent-reader prototypes remain unwired audit
controls. Before connecting them to an actual run, review the complete producer
graph, source identities, original retention, resource budget and independent
reader. Mock source tests establish no live process, timing or provenance claim.

Complete the remaining actual two-UI-Stop, chooser/startup/final-sampling,
generation, late-poll and deferred-storage cases with clean source-bound installed
own-guest evidence. Retain normal Start/restart, cancellation, ownership, cleanup
and distinct recovery controls. Do not replay successful originals just to read
them. Full G02 closure requires the entire applicable matrix, not a passing
prefix or the finite PR990 cases.

### 3. Continue G03 and G05 as separately claimed work

After the G02 prerequisite is met, take G03 sandbox/editor responsiveness and
usability as its own lane. Reproduce transitions such as Python-mode errors and
verify visible controls and recovery against the actual installed package.

G05 remains a selected-component provenance, notices, source-to-binary and
distribution review. Preserve retained-source credit and component obligations;
neither host tests nor own-guest execution provide blanket licensing clearance,
reference-firmware compatibility or physical-accuracy evidence.

### 4. Complete release delivery only after qualification

Keep release ownership from PR1011. Incorporate only qualified simulator,
instrument and packaging candidates, and bind final metadata/version/notes to
that combined source. Do not move an old tag.

Completion requires the new release's actual signed build and upload, both
Internal and External TestFlight group assignment, and Beta App Review receipts.
Unsigned artifacts, queued workflows, earlier component results and App Store
submission do not substitute for those receipts. Physical-device acceptance
remains separately bounded.

The instrument CLI harness has a separate owner in
[PR1043](https://github.com/CrispStrobe/brickwright-lite/pull/1043). Coordinate with
that owner instead of duplicating observation or merging. The actual instrument
campaign remains after TestFlight; harness preparation does not authorize it.

## Handoff and privacy

Public handoffs contain repository-relative paths and public source/PR identities
only. Machine paths, acquisition receipts, originals, transcripts and access
details belong in ignored local `CLAUDE.md` files or the private evidence store.
Never commit or publish those inputs. Check the local ignored handoff before
using retained artifacts, so that a successful original is acquired only once.
