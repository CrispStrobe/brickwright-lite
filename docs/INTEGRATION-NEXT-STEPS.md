# Integration handoff — 2026-10-19

Refresh PR heads, checks and `LANES.md` before acting. This file records the
integration owner's remaining work; other lanes retain their own ownership.
Historical results qualify their named source and artifact, not later builds.

## Current priority

Continue integration and the remaining SPIKE G02 lifecycle cases independently.
The optional iOS audit in draft [PR1078](https://github.com/CrispStrobe/brickwright-lite/pull/1078)
is deferred; additional SDK, simulator-ownership and resource-controller work
should resume only for a demonstrated blocker in its own lane. It is not a
prerequisite for separate SPIKE desktop lifecycle work. Existing qualification
and merge requirements remain in force for each candidate.

For SPIKE, first test the remaining two-UI-Stop boundary using the retained,
source-bound installed package: click Code Stop, hold only the already completed
native close return, and attempt the second visible arena Stop through the real
UI. Preserve an unavailable or disabled control as an observation; never replace
that click with a direct pane method and report two UI Stops. Require normal
recovery and cleanup before accepting the finite case. Keep this distinct from
the generation-transition collector, whose earlier readiness refusal remains
unresolved. Record each result at its exact source, not as current-main or full
G02 qualification. Then continue the applicable lifecycle matrix below.

Refresh pending PR checks without duplicating existing runs. PR1044 has been
normally composed with main; its workflow and test implementation are unchanged,
19 focused controls pass, and fresh checks are required. Its active embedded
frontend proof remains open, so it remains draft. Do not wait for that iOS proof
to make progress on SPIKE.

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

## Remaining work by lane

### 1. Qualify and integrate the iOS workflow resource preparation

Candidate: draft [PR1044](https://github.com/CrispStrobe/brickwright-lite/pull/1044),
head `9e4e123aad1756f67780e000d22977a6e3377b48`, branch
`lane/ios-workflow-resource-preparation-20261017`. This normally merges main
`5a468d19a2f337ffa40be422a8f1363b33fad27a` into the earlier qualified source.
Fourteen source checks passed on the earlier head; conditional delivery jobs
skipped as declared. Refresh every enabled check for the new head. `ci:full` has already been
applied. Do not apply it again merely to start another run.

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

The separately admitted [mobile event 39105125520](https://github.com/CrispStrobe/brickwright-lite/actions/runs/39105125520)
completed on the earlier `0fce34bef3467a8d9a5722d483611217ff11ee81`
source. Its results do not qualify the later main composition. Four official
web/iOS artifact digests and job
joins match. Independent unsigned simulator, App Store and ad-hoc resource
inventories passed, without copied root frontend folders or static archives.
Profile CMS signatures, profile/export fields and the original CI codesign
verification passed. Certificate-chain verification and physical-device
acceptance remain unestablished. Android was not acquired or independently
qualified; these results do not establish a whole-event pass.

The remaining blocker is **active embedded frontend identity**. The component
conjunction passed, but archive identity and native resource absence do not
prove which asset map the running executable serves. Do not infer that join
from stripped-symbol searches or byte-presence tests.

Next actions and completion criteria:

1. Admit the final source head and successful enabled checks, including the
   existing fast and thorough runs. Preserve failures and conditional skips;
   source tests do not qualify an app or IPA.
2. Review current-main composition before any qualification event. Freeze the
   tested combined source, frontend inputs, native package inputs and actual
   workflow/job/artifact boundaries. Refresh the candidate if needed, using a
   normal merge and fresh checks.
3. Reuse the retained successful component originals and independent results.
   Keep unsigned simulator, App Store and sideloadable export acceptance distinct;
   no device acceptance follows from simulator success. A changed candidate needs
   its own admitted affected qualification; historical results keep their identity.
4. Merge the separate active-asset observation claim in `LANES.md` before source
   implementation. Observe the actual installed App resolver after Ready, with
   complete ordered keys, served lengths/hashes and explicit finite budgets.
   Account for iterator compression, resolver fallback and HTML/CSP transformations
   without changing production security or context construction. Add authored
   negative controls for incomplete maps, wrong bytes, fallback and budget refusal.
   Bind the actual executable and frontend inputs independently. An unsigned
   observation alone cannot establish signed-target map identity; demonstrate that
   join separately. Keep the workflow audit optional and default off, preserve
   delivery guards, and print device counts/status instead of device identifiers.
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
