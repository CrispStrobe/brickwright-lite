# Integration handoff — 2026-10-19

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
pass. No new dispatch, download, actual launch or workflow entry mode is added
by this source preparation.

## Handoff and privacy

Public handoffs contain repository-relative paths and public source/PR identities
only. Machine paths, acquisition receipts, originals, transcripts and access
details belong in ignored local `CLAUDE.md` files or the private evidence store.
Never commit or publish those inputs. Check the local ignored handoff before
using retained artifacts, so that a successful original is acquired only once.
