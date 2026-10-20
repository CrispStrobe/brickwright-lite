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

The retained installed package at
`f7b3bf03b1468a81e26228d052c4164d7081dc73` now passes the finite two-UI-Stop
case: real Code Stop followed by real arena Stop while only the completed native
close return is held. Both Stop promises wait, one native close is observed,
clock/configuration ownership releases, and a distinct own-NuttX guest completes
normally with cleanup. The standalone reader verifies the complete 54-byte Python
upload as six protocol-sized chunks, their offsets, CRC and acknowledgements,
plus both startup transactions and UI event order. Its authored controls accept
two positive fixtures and reject 53 adversaries.

Preserve the first controller failure from positional response-field ordering
and the original reader's unsupported single-chunk assumption. Neither is a
product defect or a successful qualification. A distinct chunk-aware reader
passed the retained successful originals; no guest was rerun for that reading.
The pane and session source match the pinned main composition, but this result
qualifies the named retained package only. Full G02 remains open.

Next continue the generation-transition collector and applicable lifecycle
matrix. Its earlier readiness refusal remains unresolved; the successful UI Stop
case does not admit helper processes or replace the collector's source, identity,
resource or timing requirements. Keep iOS audit work deferred independently.

Refresh pending PR checks without duplicating existing runs. PR1044 has been
normally composed with main; its workflow and test implementation are unchanged,
19 focused controls pass, and fresh checks are required. Its active embedded
frontend proof remains open, so it remains draft. Do not wait for that iOS proof
to make progress on SPIKE.

### Optional iOS audit lane (PR1078)

Current blocker: the unsigned installed embedded-map proof remains open. Installed
manuals and the complete simulator help graph now have bounded independent joins;
the sampler still failed and the diagnostic event remains partial. Bounded catalog
compatibility is now joined for iOS26.2/23C54, arm64 and iPhone16. Next finish
namespace/service ownership, family resources and guarded wrapper admission, with
fresh catalog joins in the eventual app job. No tool result qualifies an app or
the remaining SPIKE matrix.

## Immediate implementation contract

Continue inside the merged optional iOS audit lane; keep the workflow entry closed
until these acceptance criteria are met:

1. Reuse the retained directory identity/refusal observations at their named source;
   they grant no atomic namespace lease. Build the authentic SDK invocation context:
   bind the actual executable and selected developer/SDK environment, then join
   owned creation, UUID readback, boot, app and delegated services through platform
   responses and kernel/code identity. The absolute launcher alone is insufficient.
   Paths, callback assertions and returned PIDs alone cannot grant cleanup authority;
   missing permissions or service-family facts must refuse.
2. Qualify kernel identity, executable/code identity, family membership and resource
   accounting on owned actors. Include exit, exec, PID reuse, membership changes,
   failed readback and cleanup controls. Preserve current limits and failed
   originals. A successful single helper does not cover a simulator service family.
3. Compose the existing transaction, bounded invoker, prepared receiver and actual
   identity provider with one sticky Stop intent and a separate cleanup route.
   Retain the whole bounded original union, including partial capture and deferred
   interrupts. Require completed receiver metadata for successful publication;
   partial raw bytes must survive refusals without becoming a successful capture.
   Demonstrate normal behavior and cancellation at each boundary.
4. Rejoin the actual job's SDK/runtime/image/build/arm64/model and installed native
   bytes, then run the one admitted unsigned installed-map qualification. Its
   standalone reader must join source, effective configuration, artifact, active
   asset map and served bytes. Keep signed delivery and physical-device claims
   separate. Only then consider exact-head checks and matched-head integration.

The catalog observation selects a compatible candidate for review; it cannot
stand in for any of these ownership, resource or installed-map criteria.

## Landed and ready for continuation

- [PR990](https://github.com/CrispStrobe/brickwright-lite/pull/990) merged as
  `6d9dfeb1d50139de517cfbdf302055b71eab125f`. Its retained Linux package
  passed finite Stop, held teardown-return, cleanup and two own-NuttX startup
  cases. The separately observed two-UI-Stop case is recorded above; the full
  G02 matrix remains unqualified.
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

   The unwired command adapter now restricts command shapes and explicit device
   UUIDs, requires a named device-set directory, and always passes that namespace.
   It streams stdout and stderr under one byte limit, closes stdin and inherited
   descriptors, filters inherited environment, and checks an absolute deadline and
   stop predicate. It observes exit without reaping, signals its newly created
   command group, then reaps the leader and closes owned pipes/selector/directory.
   Primary and cleanup failures remain separate, including cancellation notes.
   Non-reaping `waitid` and exception-note APIs are required before spawning; macOS
   `waitid` support requires Python 3.13 or later, per the
   [Python API documentation](https://docs.python.org/3/library/os.html#os.waitid).
   The existing inventory helper also observes exit without reaping before group
   signaling and now refuses missing APIs/default-signal admission before spawning.
   Existing workflow Python setup is unchanged: the optional runtime phase refuses
   an unsupported interpreter; ordinary build/input retention remain unaffected. Linux subprocess
   controls do not qualify Darwin behavior, device-set ownership or path races,
   process creation latency, escaped descendants, delegated services or app RSS.

   The unwired receipt receiver now prepares an absent output before launch,
   hashes installed executable/plist files, and holds the output directory and
   original receipt descriptors. It accepts a growing original without accepting a
   replacement inode, parent, symlink, FIFO or hardlink. Capture is single-use;
   bounded partial bytes survive failure, deadline and cleanup uncertainty. Source,
   base configuration and typed profile headers must match; content joins remain
   the standalone reader's job. Supplied PID/identity/RSS samples must match under
   a fixed sampled RSS threshold, which does not enforce a hard memory limit or
   authenticate the sampler. Installed files and receipt metadata are rechecked
   after the final sample. Stop is rechecked after callbacks and final readback, so
   a request during those boundaries keeps the capture partial. No workflow caller,
   process sampler or launch-environment
   binding is supplied by this receiver. The transaction core now requires a
   preparation callback after installation and before launch, passes its opaque
   context to observation, and releases each returned context once. A 15 s
   preparation return fence refuses late preparation; release is attempted even
   with a broken clock and has a separate 5 s cooperative return check. Preparation
   adapters must clean their own partial acquisition if they raise before returning.
   Release failures remain separate, and a nested finally preserves release when
   device cleanup is interrupted. An interrupt may leave device cleanup incomplete;
   no callback interruption or containment is claimed. Owned-file controls join the
   actual receiver to an authored launch, without observing an Apple app.
   The unwired preparation adapter now queries app and data containers for the
   explicit device and bundle, holds directory identities during preparation, and
   confines canonical returned paths to that device's data tree. It refuses changed
   paths, overlapping containers, stale output and wrong executable/plist pins,
   then repeats both queries after receiver preparation. A release adapter reports
   close uncertainty; close interrupts attempt the remaining owned descriptors
   before propagating. These are path/readback checks, not authenticated namespace
   ownership or a proven bundle-to-data-container binding. Current Xcode behavior
   and actual container semantics still need admission. Invocation must retain
   private command originals. Stop and deadline are rechecked after directory
   cleanup before publishing the receiver; a late boundary keeps preparation
   refused and closes the receiver. No directory creation, launch or environment
   forwarding is added. Launch-path/environment binding, actual PID/process
   monitoring and independent runtime-image admission remain open. No workflow
   phase calls these adapters or the core.

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
   Launch environment selection is now implemented only inside the unwired command
   adapter. An optional prepared receiver must match the explicit device set, UUID
   and bundle; its installed files, directory identities and absent fixed output
   are checked before consuming one launch attempt. The only added child variable
   is the derived audit path. Inherited audit/arbitrary child variables are still
   filtered. Binding and pins are read back after client cleanup, then Stop and
   deadline are checked before returning. Failed spawns consume the attempt. These
   finite consistency checks are not authenticated ownership, running-code proof
   or cancellation of delegated services. A refused launch reply can follow an
   actual start, so the transaction owner still owes app cleanup. No workflow phase
   calls this path. Validate actual Xcode environment/path behavior, implement
   Darwin monitoring and complete the admitted wrapper before an actual observation.

   The Rust collector controls now select an explicit Cargo installation executable
   rather than a bare PATH command. Missing and relative installation roots refuse
   without fallback. The original ambient-binding CI failure is retained; the
   detector and baseline are unchanged, and its controls plus the real Rust controls
   pass locally with PATH-shadow and missing-tool checks. Tool version and actual
   app compiler identity remain separate joins. This test repair does not add launch
   wiring or qualify the installed candidate; launch environment and Darwin process
   monitoring remain open.
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
armed native run or guest campaign. A failed-ready child capture took 4.809
seconds; the unchanged empty-descendant guard refused three WebKit helpers. The
startup 250 ms capture assertion was never reached. That diagnostic cannot serve
as the required startup sampler, and no per-operation timing cause is established. Preserve
the original refusal; do not relax deadlines or treat a matching helper image
as runtime ownership, generation identity or a successful guest result.

The bounded collector and independent-reader prototypes remain unwired audit
controls. Before connecting them to an actual run, review the complete producer
graph, source identities, original retention, resource budget and independent
reader. Mock source tests establish no live process, timing or provenance claim.
The independent budget reader now gates the complete frozen source-constructor
context before graph or history joins, including empty and complete-only histories.
A coherently forged supplied context previously passed a partial graph even though
the actual constructor refused it. Keep that authored counterexample distinct from
actual evidence. Next prepare the explicit-authority OS/FD/clock adapter with the
required executable-metadata operation, then review helper-aware readiness and
startup policy; the old bridge's descendant limits still refuse the helper set.

Retain the finite two-UI-Stop result above. Complete the remaining actual
chooser/startup/final-sampling,
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

## Darwin sampler admission before controller wiring

The draft active-asset candidate defines an unwired `DarwinProcessSampler` in
`.github/workflows/mobile.yml`. Its authored controls are in
`test/ios-workflow-embedded-asset-audit.test.mjs`. It reads one PID through
`proc_pid_rusage` and `proc_pidpath`, brackets path lookup with birth/UUID and
counter checks, and converts cumulative Mach CPU ticks with `mach_timebase_info`.
The fixed sampled limits are 1 GiB RSS, five lifetime CPU seconds, 30 cooperative
wall seconds, 100 polls and 1 MiB of private raw syscall records. These are sampled
refusal thresholds, not hard kernel containment. A blocking foreign call is not
interrupted. A process family and delegated simulator services remain unbounded.

The API/layout research uses Apple XNU revision
`f6217f891ac0bb64f3d375211650a4c1ff8ca1ea`:
[resource layout](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/sys/resource.h),
[libproc interfaces](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/libsyscall/wrappers/libproc/libproc.c),
[timebase layout](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/osfmk/mach/mach_time.h),
[resource counters](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/osfmk/kern/bsd_kern.c)
and [Mach CPU accounting](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/osfmk/kern/task.c).
No Apple implementation is vendored. The installed SDK and runner are not yet
joined to that research revision.

The same workflow now has an isolated `ios_audit_preflight_only` mode, off by
default. It requires the owned source branch, input retention and unsigned flags.
It skips the web build and therefore every dependent app build. Its bounded Mac
job checks SDK offsets and one owned C process against the sampler, including
wait/cleanup and refusal after exit. Only a structured report is uploaded; the
probe executable and full runner path are excluded. Review that exact event's
metadata and report once. A passing platform preflight does not qualify a running
app or authorize a simulator launch.

The first platform event failed without a report artifact; its exact failing
boundary remains unknown. Preserve that original. The diagnostic revision records
host/admission/cleanup stages and a summary even if upload fails. It also checks
read-only audit-token/code-directory APIs and executable page consistency against
its owned helper. Keep this distinct from a simulator target's permissions.
The second event retained a precise compile failure: the SDK lacks
`sys/codesign.h`. Its host had the required Python wait APIs, but no helper or
kernel identity query ran. The corrected observer tool declares only the reviewed
read-only ABI using SDK types, records its XNU declaration provenance separately
from SDK layout, and requires the actual library exports before compilation.
No Apple implementation or private header is bundled. A corrected event still
needs its own exact source-bound platform evidence.
The third event compiled and passed SDK layout, executable pages, kernel audit
identity and resource sampling, then failed group signaling after the helper's
nonreaping zero-exit observation. Preserve that `PermissionError` and cleanup
failure. Apple's [signal-group implementation](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/kern_sig.c)
is consistent with a zombie-only group returning
`EPERM`; the runner kernel is not source-joined to that research revision.
The next probe checks two bounded singleton group originals and the same owned
UID/PID/zero-exit record before classifying this fixed, nonforking-helper negative.
It always attempts the owned reap despite signal errors. This does not admit
simulator command-group cleanup, service families or app observation. General
process-group qualification remains explicitly false.
The fourth event retained a zero-exit wait record whose `si_uid` was zero, while
the pre-exit kernel audit token had UID 501. It refused before group census; its
owned child was nevertheless reaped with no cleanup error. Darwin's reviewed
[wait implementation](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/kern_exit.c)
zeros that structure and does not populate UID on this exit path. The corrected
probe retains wait UID as information and joins ownership to the authenticated
pre-exit audit token's PID/UID. Changed tokens still refuse; no supplied UID or
blanket wait-UID exception provides authority. Actual group-census behavior and
the full platform result remain unqualified until the corrected event passes.

The corrected [fifth platform event](https://github.com/CrispStrobe/brickwright-lite/actions/runs/39216035612)
passed on source `ecc8d063f6f775f56f96e27bd3eb1815658fb424` with SDK 26.5 on
Darwin arm64. Its fixed helper passed layout, token/code hash, executable-page,
resource, stable wait/group and exit-refusal checks, released its owned port and
was reaped with no cleanup errors. The zombie-only signal negative was retained,
with both singleton kernel group originals and authenticated pre-exit ownership.
The source-bound independent packet reader passed its limited joins. Independent
executable bytes and full path originals were not retained, so it establishes no
complete executable/compiler-input or mapped-app identity proof. All prior failed
originals remain failures. General simulator groups, namespaces, service families,
resources, installed-app behavior, physical devices and release remain unqualified.
Do not repeat the successful event, download or reader merely to inspect it.

`DarwinAuditIdentity` and `simulator_code_directory` remain unwired for app
observation. The former obtains a kernel task-name right and audit token, uses
read-only code-status/hash queries tied to that token, and releases its right
once. The latter checks the supported thin-arm64 ad-hoc SHA-256 directory and
covered pages; it provides no certificate or signature-trust conclusion. Resolve
these actual APIs before using their derived identity in the controller. API
references are Apple's [task info](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/osfmk/mach/task_info.h),
[code-sign operations](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/sys/codesign.h)
and [CodeDirectory layout](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/osfmk/kern/cs_blobs.h).

Before use, independently verify the exact target SDK's ABI offsets, library
exports, syscall status semantics, CPU units/timebase and permission failures.
Then test actual birth/exit/reuse/path drift and resource limits on the admitted
runner, retaining originals. Resolve executable identity across exec, mapped-file
identity, target ownership, child/service census and cleanup before composing the
transaction controller. An observed UUID/path/birth digest is not an authenticated
capability or a continuous identity lease. Keep existing app qualification flags
false until the full source/artifact/installed-map joins and affected actual run
pass. The isolated helper preflight provides no authority for an actual app
launch or an additional installed observation.

## Whole-transaction cancellation before wrapper admission

The unwired transaction core now accepts a typed Stop callback. It checks before
active effects and again after identity readback, preparation and observation,
then fences publication after device cleanup and receiver release. A cancelled
create still resolves the returned identity for exact owned cleanup before
refusing boot. Stop does not suppress cleanup or release, and a returned
observation remains retained with partial status. Cancellation is sticky and
cannot be cleared by a later callback value. Normal transactions remain live.

This closes the core's cooperative cancellation boundary; callbacks can still
block and the complete wrapper remains unwired. Adapters must share the same
Stop intent, enforce their own interruption/resource bounds and retain originals.
Target ownership, service families, command-group cleanup and actual installed
qualification are still mandatory before an app launch.

## Handoff and privacy

Public handoffs contain repository-relative paths and public source/PR identities
only. Machine paths, acquisition receipts, originals, transcripts and access
details belong in ignored local `CLAUDE.md` files or the private evidence store.
Never commit or publish those inputs. Check the local ignored handoff before
using retained artifacts, so that a successful original is acquired only once.

### CAD browser selection repair and remaining integration queue

1. **Land the CAD helper repair, PR1101.** Hover/status layout can resize the
   canvas between projecting a part and clicking it. The candidate waits for
   rendering, checks the projection again, and re-aims before any click. It also
   refuses points covered by another DOM element. The real pointer interaction,
   exact selected-part assertion and original budgets remain unchanged; no editor
   or physics source changes. Run
   `node --test test/sim-lab-cad-pointer.test.mjs` and the affected production
   browser gate, `node scripts/verify-sim-lab-browser.mjs --part=core`, against an
   admitted integrated build. Require every enabled exact-head check before
   matched-head merge. Keep the original failed browser job and the authored
   layout counterexample; do not retry an old head to replace its failure.
2. **Qualify the Stop-race fix, PR1099.** Candidate
   `cf855981e5772a17609f7863e1d7224a27fb542c` has 74 session tests and five
   detected source mutations. Its official frontend was acquired and independently
   verified; the actual CI checkout matches its whole tree. Check the ignored
   local handoff before acquiring anything. After the CAD repair lands, normally
   merge main into the owned source branch, preserve original failures, and
   refresh the final head's checks and artifact/source binding. Then qualify
   installed own-NuttX dual save/load/restart/upload and six-motor upload with
   Stop during frame publication, queued Stop, normal controls and distinct guest
   recovery. Verify session, clock, configuration and backend cleanup. The old
   installed app cannot qualify this changed source; frontend verification alone
   is insufficient. Do not broaden or relax the standalone binder silently.
3. **Qualify the terminal startup reason, PR1100.** Candidate
   `cf8d140ac289184ccd24595be5860200919e5e21` records a closed native-only
   RSP failure reason without exposing backend text or changing public errors,
   deadlines or teardown. Refresh full native CI; bind a fresh installed package
   to the final source, then observe cold startup and Stop/reset/closure with
   distinct normal recovery. The existing original error remains
   `operation-failed`; another unchanged old-app run adds no attribution.
   `unavailable` still combines several I/O stages and does not establish TCP
   refusal or a child-exit cause. This is a diagnostic candidate, not a startup fix.
4. **Keep packaging and release holds explicit.** PR1044 still needs an installed
   active-asset-map proof and resolution of its enabled CI failures. PR1078 is
   deferred despite passing source CI; optional SDK/namespace infrastructure is
   not the next SPIKE prerequisite. Refresh their current heads before acting.
   Complete the remaining G02 matrix before G03/G05 and qualified delivery above.
   Retain PR1011 release ownership and PR1043's instrument owner; the actual
   instrument campaign remains after TestFlight. No source-only check, old app,
   unsigned artifact or passing prefix closes these tasks.

Machine paths, raw originals and acquisition identities remain in the ignored
local handoff and private evidence store. Public candidates contain neither
private receipts nor transcripts. A new agent should start with this queue,
refresh GitHub, and read the ignored handoff to avoid duplicate one-shot intakes.

### Command cleanup candidate and remaining admission

The unwired simulator command adapter retains a Darwin child's numeric identity
until signaling and reaping finish. Its cleanup candidate accepts an exited
singleton EPERM only around two matching kernel group censuses and a stable
nonreaping terminal record. Uncertain groups and other signal failures refuse.
Cleanup continues through interruptions; Linux behavior has separate controls.
The default-off v6 fixed-helper event39222955547 passed for its one nonforking
helper, with retained wait/group originals and independent packet joins. That
bounded result does not qualify a general process group or delegated service
family. Successful originals must not be replayed.

The command journal retains bounded observed stdout/stderr, terminal waits and
reap records privately, including prefixes from refusals. It is not a complete
transcript of bytes never read. Before an installed-app event, identify an authoritative join from the explicit device set and boot to the app
and delegated services, admit target SDK/runtime/build/architecture and process
identity, and bound the whole observed resource and original union. Then compose
the same prepared receiver and Stop intent through invocation, observation and
cleanup. Missing ownership, permission or family facts must remain refusals.
Exact final-head checks and affected actual installed qualification still precede
merge. TestFlight, instrumentation and later SPIKE lifecycle qualification remain
separate pending work.

The separate default-off interface inventory collects installed Xcode/simctl and
launchctl help with fixed commands only. It rejects mixed modes/runtime selection
and excludes app builds and delivery. Retain and independently read one frozen
actual result before choosing a device/boot/process/service ownership interface.
Tool help is an interface fact; it cannot substitute for actual ownership or
resource admission. The command-cleanup v6 fixed-helper original has passed its
bounded standalone joins, with simulator/app/family claims still false.

The first tool-interface event failed before `simctl help` returned any bytes;
its owned pending child was killed and reaped. Retain the failed original and
partial-reader refusal. Earlier queries identify Xcode 26.6 but establish no
simulator ownership API. Investigate with phase/timing originals and an explicit
opt-in sample of only the still-unreaped owned help child. Preserve the original
ten-second deadline, avoid shared-service actions and retain diagnostic failures.
Sampling changes execution timing and cannot establish a performance conclusion.
Do not retry the original profile or admit app execution from this partial result.

The first sampler diagnostic failed within its own three-second bound without a
stack report; both owned children were reaped. Timing originals showed that this
auxiliary failure prematurely ended the primary observation. The v3 source fixes
that isolation: primary commands retain their original deadlines and requested
sampler failures still prevent whole-profile success. Independent reader outputs
separate primary-graph completeness from diagnostic completeness. No new actual
result or startup cause is inferred from the source controls.

A separate manual-only selection reads the installed sample manual and launchctl
print/procinfo/managerpid help, without starting simctl or a sampler. It refuses
mixed manual/sampler requests, requires interface selection and excludes app
builds. Preserve earlier failures and limits; use the actual retained manuals to
choose supported diagnostics instead of inventing flags or raising timeouts.

The manual-only event passed its bounded packet joins on Xcode26.6. Its installed
sample documentation identifies mayDie as eager symbol acquisition. The next
candidate uses default sampling order without that optional prefetch, retaining
all output and time bounds. Do not infer that symbol lookup caused the earlier
failure; an affected actual diagnostic remains required. Complete manual evidence
still supplies no simulator namespace, service or installed-map admission.

Wrapper preparation now has a separate cleanup callback route. Active commands
must share Stop; cleanup catalogs and owned cleanup effects must remain available
after Stop while retaining identity, count and time checks. Deferred interrupts
preserve the first cancellation and retained originals while later cleanup and
receiver release are attempted. These source controls do not authenticate callback
ownership or satisfy actual wrapper/resource qualification; entry remains disabled.

The separate inventory-only selection reads installed runtime/image catalogs and
a filtered iPhone-16 device-type catalog. It starts no devices or apps and requests
no downloads. Collection completeness is distinct from selected-target admission;
review actual architecture/build/image/model fields before any create/boot event.
The retained complete help graph is usable despite the separate failed sampler,
without relabeling the whole event or making a startup-cause claim.

The initial unfiltered runtime catalog exceeded the64KiB cap and remains refused.
A new metadata-only query filters runtimes by the observed iOS26.2 description;
it retains the cap and omits already retained runtime help. Candidate selection
from a failed capture cannot admit the catalog or target. Require bounded new
originals and independent image/build/architecture/model joins before proceeding.

The bounded filtered catalog now has independent packet and semantic compatibility
joins for iOS26.2/23C54, arm64 and iPhone16. Those facts belong to the metadata job;
a future app job must rejoin its own image, runtime, build, model and architecture.
Selected-target, namespace, installed-code and resource admission remain open.
Receiver cancellation now keeps the original interrupt, partial receipt bytes and
cleanup uncertainty even if a later descriptor close is interrupted. Keep this
custody when wiring the guarded wrapper; source controls are not app qualification.

The directory factory is now implemented, with optional command binding to
its held parent/directory identity. It preserves state after cancellation or close;
it never removes an uncertain replacement. The future guarded wrapper must require
this context rather than path-only command admission. A separate default-off
`ios_audit_directory_only` profile runs finite filesystem controls on macOS and
retains source/job/stat/FD observations. It invokes no simulator commands or builds.
Its result can qualify only that filesystem boundary; boot, app/service ownership,
family resources and installed-map qualification remain separate acceptance gates.

The directory-only event39239129340 passed atb880ca774. The first full-stat reader
refused because it incorrectly assumed link count would remain fixed after adding
state. Preserve that refusal. A distinct narrower reader joins directory identity,
replacement/permission refusals and cancellation cleanup while recording the changed
link count without a stability or filesystem-semantics claim. The directory class
is byte-identical in the subsequent launcher candidate; the whole later workflow
is not relabelled as the observed source.

The bounded simulator command adapter now names `/usr/bin/xcrun` explicitly.
Its source controls detect a return to PATH lookup. This closes launcher selection
through PATH; actual SDK selection, immutable invocation environment, executable
provenance and app/service ownership still need the invocation factory above.
