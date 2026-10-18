# Integration handoff — 2026-10-18

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
head `0fce34bef3467a8d9a5722d483611217ff11ee81`, branch
`lane/ios-workflow-resource-preparation-20261017`. Fourteen source checks passed;
conditional delivery jobs skipped as declared. `ci:full` has already been
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
completed on this exact source. Four official web/iOS artifact digests and job
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
4. The separate active-asset observation claim in `LANES.md` merged in PR1070.
   Its source candidate uses the running app's resolver from Ready, stays
   default-off and release-simulator-only, and distinguishes embedded storage
   bytes from served bytes and HTML/CSP handling. It preserves resource preparation
   and all three helper call paths. Authored independent content and Git/artifact
   readers now cover their limited input contracts; they do not prove compiler
   input use, an actual installed map or a complete build-input graph.

   Optional `retain_ios_audit_inputs` preparation is off by default. It is restricted
   to manual unsigned requests on main or the owned source branch, with both signed
   and device IPA requests excluded. It retains selected exact tracked sources,
   downloaded web originals and toolchain version observations before the build;
   afterward it refuses changed source/web inputs and retains all observed package
   codegen candidates plus the one simulator executable and plist. Existing app
   upload remains before the optional product capture. Missing or partial retention
   fails and cannot qualify an app; retained partial inputs remain inspectable.
   Entry/file/total/time caps and link/alias checks constrain retention, not the app.
   The runtime receipt now uses envelope v2 and retains a narrow asset-configuration
   projection from the actual typed `app.config()`, tied to its full serialization
   hash. The admitted profile requires absent development URL/CSP/development CSP,
   brownfield pattern, disabled prototype freezing/CSP-modification override and
   disabled asset protocol. Unsupported or malformed profiles remain partial.
   Oversized envelopes retain a bounded explicit refusal with candidate length/hash;
   they cannot be mistaken for complete maps. This does not bound serialization RSS.
   No frontend path, plugin value or raw configuration is emitted. An independent
   reader compares these typed values to a separately admitted profile and keeps
   the full-configuration, compiler-input and actual-installed claims false.

   A separate `brickwright-ios-toolchain-inputs` artifact now observes installed
   Rust compiler/Cargo, Apple Clang/Xcode build executable and simulator SDK-settings
   file identities before and after the build. It retains role, length and SHA-256
   only, with an exact before/after chain; no binary contents or host paths. These
   are installed candidate observations, not proof of compiler use, SDK contents or
   a complete toolchain closure. The existing input-manifest format is preserved.

   Optional `ios_audit_runtime` and `ios_audit_runtime_build` inputs now prepare
   runtime admission after retained products, under the same unsigned/branch guards.
   Empty runtime input makes no inventory request. A requested exact installed
   runtime/build must be available and meet both retained plist and thin ARM64
   simulator Mach-O minimum versions. The host must be Darwin ARM64. One bounded
   inventory request retains only reviewed fields and the raw inventory hash/length;
   runtime paths and device identifiers are omitted. Hashes bind the retained
   manifest, producer, executable, plist and current job/source identities.
   The separate artifact remains `runtime-candidate-only-launch-refused`: runtime
   architecture support, device selection, executable loadability, process resources,
   cleanup and actual app observation are not qualified. No device is created,
   booted, installed or launched. This is the admission stage of the controller.

   An unwired owned-device transaction core now defines create/identity/boot/ready/
   install/launch/observe/cleanup sequencing. It refuses previously existing UUIDs,
   rechecks the created device identity before every targeted operation, and attempts
   later cleanup after an earlier cleanup failure. Primary and cleanup failures stay
   separate; late bounded observations remain partial. Command/observation deadlines,
   counts and byte caps are checked at adapter returns, with a separate cleanup
   budget. These cooperative checks cannot interrupt a blocking adapter or enforce
   app memory use. Supplied admission fields are not authenticated capabilities.
   There is no workflow caller, launch input or path from runtime admission into
   this core. Qualify its bounded adapters, device/runtime compatibility, resource
   monitoring and installed-code/receipt bindings before enabling actual execution.

   Next, independently join the complete retained source/web/configuration/toolchain/
   executable and official job/artifact identities. Distinguish referenced codegen
   outputs from stale cache candidates without guessing Rust map layout. Toolchain
   version strings are not compiler-binary identity. The projection does not prove
   the rest of the expanded configuration or the complete input graph. Before a new
   actual observation, admit an already installed simulator runtime and explicit
   process/memory/output/time limits; add the optional launch controller without
   runtime downloads. Require one fresh candidate-bound unsigned observation.
   Signed-target map identity remains separate. Pure controls do not qualify the
   Apple adapter, decompression allocation, callback lifetime or installed package.
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
