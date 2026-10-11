# SPIKE execution: current state and next lanes

Recorded 2026-10-05; candidate adoption checkpoint 2026-10-07. Refresh the public default branches and `LANES.md` before
claiming a task. This is a bounded handover, not full firmware compatibility or
physical SPIKE qualification. Repository-relative paths below belong to the
named owner. Operational locations, reference images and raw transcripts are
not public documentation inputs.

## What works

The same virtual hub and arena serve browser execution and desktop firmware
execution. The execution selector chooses the program owner; 2D and 3D are views
of the same world, not separate simulation backends. Open **SPIKE arena** from
the Code view, use sandbox mode for free exploration, and select a supported
execution route. Native firmware routes need a configured desktop package;
they are unavailable in the ordinary web build.

| Route | Program execution | Established scope | Remaining boundary |
|---|---|---|---|
| Browser simulator | Independent JavaScript backend runs Scratch/native commands and the supported converted LEGO Python subset | Shared motors, sensors, deterministic clock and arena; works without a firmware runtime | Not arbitrary Python or a physical hub model |
| Small ARM simulation guest | Supported blocks/native program is compiled to the guest's bounded instruction format and executed by ARM code in Renode | Guest-driven motors, arena observations, completion and Stop | A small interpreter fixture, not the full operating system or arbitrary C loader |
| Full NuttX firmware | Source-built kernel/userspace executes the native program runner or embedded MicroPython with the `brickwright` API | Upload, run, output, Stop, retained program and explicit storage workflows | Bounded APIs/limits; no general desktop Python, automatic webserver or qualified physical transport |
| Upstream MicroPython application | User chooses an application image; Code-tab Python runs through raw REPL in the emulated CPU with `bwspike`/`bwhub` support | Default sensors, six-motor topology, feedback motor commands, hub I/O and shared arena | Different API from LEGO modules and NuttX; synchronous feedback commands, no active position hold |
| Unchanged stock LEGO image | Separately supplied image admitted for bounded emulator/reference experiments | Image validation and recorded execution milestones | Complete boot, Code-tab program upload and modern IMU wire mapping remain unqualified; not a working interchangeable editor backend |

No external firmware image is bundled or downloaded by the image chooser. C is
used to build the source firmware and fixtures; the Code-tab native instruction
runner does not imply arbitrary uploaded C executables. NuttX's embedded Python
and the separate upstream MicroPython application are distinct routes.

Firmware sessions own motor evolution. Native observations update the hub/world
and arena inputs return to modeled devices; JavaScript must not advance a second
motor controller over the same session. See [arena](SPIKE-ARENA.md),
[firmware programs](SPIKE-FIRMWARE-PROGRAMS.md),
[MicroPython GUI](spike-micropython-gui.md) and
[Linux package](SPIKE-LINUX-DESKTOP.md).

## Evidence and version boundaries

[PR #631](https://github.com/CrispStrobe/brickwright-lite/pull/631) merged as
`9c999cdd6274278e5e54f1c135d35af11fb5feac`. Code-tab feedback now follows
actual firmware completion, faults and cancellation; Stop is installed during
startup and terminal results survive cleanup. Its 73 focused tests passed;
[merged-main qualification](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37249838252)
reported 5,512 passing tests, 15 documented skips and no failures. A terminal-state
mutation was detected. These counts describe that qualification, not every later head.

An installed Linux desktop run exercised actual Code-tab entry and arena controls:
small-guest blocks/native execution, full NuttX Python driving A–F followed by
Arena Stop, and upstream MicroPython 1.29.0 through the native image chooser,
with motor/world motion, display/output and completion. Small-guest and
MicroPython completion release ownership; full NuttX retains its program/storage
session until explicit close or backend switch. Program completion does not
promise electrical braking unless the program or route contract requests it.
This is installed-GUI evidence, not signed-release or physical-hardware evidence.

Newer [firmware PR #34](https://github.com/CrispStrobe/brickwright-spike-prime-fw/pull/34)
qualified retained restart, virtual Bluetooth peers and LittleFS interruption
fixtures. Its [current handover](https://github.com/CrispStrobe/brickwright-spike-prime-fw/blob/main/docs/project/next-steps.md)
is authoritative for firmware L01–L13. Those newer capabilities are not implicitly
present in the already tested desktop package. Firmware consumes specific Runtime
and Infrastructure revisions; Runtime main's newer MicroPython SDK likewise does
not automatically advance every consumer. Record each route's actual pins.

## 2026-10-07 desktop adoption candidate

[PR #695](https://github.com/CrispStrobe/brickwright-lite/pull/695) merged as
`0faacb84211a5d6df8b4d3ed8ed9127c14b76fc5`, adding retained NuttX program
restart to the arena. All seven enabled
[reviewed-head checks](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37579912369)
passed; the two main-only deployment jobs were not enabled on the PR. The merge
tree matched the reviewed plan, preserving the tested production source and
unrelated task/claim documentation. Tested package source is
`2b36862fb39f34a990eb296c734e9e800ed884c8`; its production frontend was built at
`0af782bdfe15774416690d09c724b19b4019c23c`, with no production overlay/Tauri
source changes between those heads. This is a private qualification candidate,
not a newly distributed installer or an automatic update to every desktop.

The own NuttX build used firmware source
`4e326e7a62624acc865002b256230042d1f50d63`, full-NuttX Runtime inputs
`756b684eee56ba698a931a14b3f4885cb8d8ada6` and Infrastructure inputs
`fe4ad383c7392527433783fcec455daa7ddc2bb7`. The native Renode executable was
retained from the earlier verified desktop input; matching newer helper/model
source does not establish its source-to-binary provenance. G05 remains open.
Compiler/config/linker/notice/TI-exclusion gates passed. Measured userspace flash
was 592,780 bytes and static RAM 88,144 bytes for this build.

Actual extracted-candidate GUI checks passed Code-tab Python execution on all
six motors, Arena Stop, retained restart and repeated Stop with matching Code
feedback. Save/Load reached READY without automatically running, and explicit
Run completed with output. A fresh app process recovered the saved Python
program, ran it explicitly and moved the motor. From a fresh editor profile,
Code-tab pseudocode compiled into Scratch blocks, ran in full NuttX, moved the
shared motor/arena and completed. GUI fault/restart checks retained the failed
status and traceback while clearing Code Stop. Stop during pending native
startup closed the owned session, retained terminal feedback and published no
late motor motion after cleanup. Cleanup can wait for native startup to unwind;
this is not an instantaneous native process abort. The separate small ARM guest GUI route also
passed Start, motion and Stop. Native-driver guest checks additionally passed
native/Python retained restart, repeated runtime fault, SAVE and fresh-process
native-program recovery. The JavaScript regression set passed 81 tests; the
native driver's Rust suite passed 129, with 10 ignored. Restart availability,
cancellation and pane-ownership mutations were detected. Raw receipts remain
private.

The desktop supervisor still bounds a session to 120 wall-clock seconds. A
long combined scenario reached that bound; shorter separate sessions passed.
The first comprehensive six-motor guest fixture reached its 300-second external
wall bound. A later run passed with a 900-second external bound: per-port native
speed and relative position, concurrent six-port motion, cancellation and Python.
For the six -30-degree position moves, observed final deltas ranged from
-28.90 to -28.17 degrees, within the declared 3-degree fixture tolerance. Both
the failed attempt and the later pass remain preserved. This does not establish
every motor/control case or physical SPIKE behavior. Firmware/reference and
release licence boundaries from the preceding handover remain in force.

A separate UI limitation was observed: starting from a saved Python view,
requesting Pseudocode with an empty conversion buffer can leave the editor in
Python mode with an error. G03 should reproduce that transition and provide an
explicit usable path into an empty Pseudocode editor; the fresh-profile native
execution result does not qualify that transition. Keep changes in
`overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx` with its
current owner until the overlapping claim is released.

## How a fresh agent starts

1. Refresh the owning public repository; read its current claims and the linked
   contracts. Claim only the paths needed by one lane, preserving other work.
2. State the observable contract, required inputs, units, timing, cancellation,
   ownership and unsupported errors before changing behavior. Use synthetic
   fixtures for public tests and declare their limits.
3. Add a regression that fails the old behavior; use a meaningful mutation where
   practical. Test the actual guest/GUI when that is the capability being claimed.
4. Land model/runtime work in its owning fork before advancing exact consumer
   pins. Preserve notices and the overlay/package mirror in this repository.
5. Record tested source, route/dependency pins, public CI, acceptance results and
   remaining exclusions. Never relabel host-only evidence as guest or hardware proof.

These are proposed tasks, not ownership claims. Existing non-SPIKE actuator work
in `LANES.md` and [the broader queue](OPEN-TASKS-2026-09-29.md) retains its ownership.

## Next-step lanes

### G01 — Adopt the newer qualified firmware in the desktop package

**Owner:** Brickwright Lite, after firmware L11. **Start:**
`scripts/prepare-spike-nuttx-package.mjs`, `scripts/build-spike-linux-desktop.mjs`,
`test/spike-linux-package.test.mjs`, `test/spike-nuttx-storage-exchange.test.mjs`.
Read the firmware handover and actual current manifests first.

Build/stage the reviewed source profiles using existing tools; record immutable
Runtime/model/firmware inputs and retain their notices. Rebuild the configured
package without external images. Exercise the actual Code tab for native and
embedded Python: upload, complete, restart without upload, Stop, fault, save,
close/reopen/load and retry. Define expected persistence and terminal feedback.
**Done:** real guest and installed GUI observations establish every advertised
operation; invalid manifests and stale sessions fail closed; package receipts
match the tested artifacts. New firmware guest qualification is required before
claiming adoption. Doable now with the documented build prerequisites.

### G02 — Preserve lifecycle correctness under concurrent GUI actions

**Owner:** Lite. **Start:** `overlay/scratch-gui/src/lib/spike-arena/code-run-feedback.js`,
`renode-arena-session.js` in that directory,
`overlay/scratch-gui/src/components/tw-pseudocode/`,
`test/spike-code-run-feedback.test.mjs`, `test/spike-micropython-code-tab.test.mjs`.

Add actual GUI cases for Stop during chooser/startup/final sampling, backend
switch, pane disposal, reopen/reupload, UART generation change and late polls.
Use a delayed/error-capable synthetic native boundary for races, then verify
representative races with an actual owned guest. Preserve all #631 regressions.
**Done:** one terminal result, no late world publication, no stale owner stopping
its replacement and no leaked owned process. Mutating a terminal/ownership guard
must fail the comparison. Doable now; no externally supplied firmware needed for
small-guest/NuttX cases.

### G03 — Qualify usable sandbox and responsive editor controls

**Owner:** Lite. **Start:** `docs/SPIKE-ARENA.md`,
`overlay/scratch-gui/src/components/tw-pseudocode/`,
`test/spike-arena-3d-pane.test.mjs`, `test/spike-arena-pane-units.test.mjs`.

Inspect existing controls before adding UI. Test free sandbox access, shared
2D/3D state, topology selection, reset/edit/save/reopen, and firmware ownership
across view switches. Cover narrow desktop/mobile widths, long conversion/error
messages, dismissible reports, collapsed/moved lessons and a right pane taking
50–75% of the available width. Check keyboard/touch controls and translations.
Include explicit image/backdrop selection, familiar undo icons, compact run
controls and clearly labeled import actions in the overflow menu.
Document what Identify A–F actually observes; unresolved identification must
show a bounded error rather than an indefinite ellipsis.
**Done:** real rendered UI remains resizable and usable; mode switches preserve
one world and cannot start an unavailable backend. Doable now; this lane first
records already working features and fixes only demonstrated gaps.

### G04 — Extend API/topology parity through declared capabilities

**Owners:** firmware L01/L02/L05/L06/L09, Runtime, then Lite. **Start:**
[Runtime tasks](https://github.com/CrispStrobe/renode-spike-prime/blob/0bb3f3e40ec8e84afe6c7a63a03374a5a0553969/docs/SPIKE-STATUS-AND-LANES.md),
`test/independent-spike-backend.test.mjs`, `test/spike-renode-arena-session.test.mjs`.

Choose one supported command slice; compare identical external scenarios across
browser, small guest, NuttX and upstream MicroPython only where each advertises
it. Specify units, tolerances, simulated time, end actions and errors. Cover
sequence/concurrency, boundary values, detach/load/no-progress and cancellation.
Avoid claiming a timeout is measured stall or a completed move is active HOLD.
**Done:** a published route-specific capability table and comparisons reject a
broken observable behavior; shared hub/arena state remains single-owned. Contract
work is doable now; guest motor/hotplug extensions depend on firmware lanes.

### G05 — Finish portable packaging and dependency/licence closure

**Owner:** Lite packaging, coordinated with firmware L11 and Runtime. **Start:**
`scripts/build-spike-linux-desktop.mjs`, `test/spike-linux-package.test.mjs`,
`docs/spike-micropython-installed-resources.md`, `docs/SPIKE-LINUX-DESKTOP.md`.

Inventory exact distributed runtime/native libraries and source-built components;
verify selected versions, licences, notices and applicable MPL/LGPL obligations.
Resolve open source-to-binary provenance without rewriting artifact bytes.
Test relocation, missing/tampered files, constrained resource admission and owned
child cleanup. Add non-Unix staging as a separate reviewed contract rather than
advertising it from Linux results. Signed installers/update channels need their
own packaging and platform acceptance evidence.
**Done:** an exact distributable closure, reproducible assembly instructions and
platform-specific installed tests. Linux inventory work is doable now; other
platform/signing tests require their build environment and credentials.

### G06 — Improve model fidelity and unchanged-image bringup

**Owners:** Infrastructure and Runtime; firmware L07/L08/L11. **Start:**
[model tasks](https://github.com/CrispStrobe/renode-infrastructure-spike-prime/blob/5a519ce5d9b5122bcf2ecedcbfd6f49d2735bbeb/docs/SPIKE-STATUS-AND-LANES.md).

Implement one evidenced public peripheral contract at a time, then adopt exact
pins and rerun affected guest workflows. Keep unknown modern IMU mapping false.
Prepare source-only fixtures now; unchanged-image experiments require lawful
operator-supplied inputs and remain separate from Code-tab compatibility.
**Done:** model regression plus bounded real guest milestones, not elapsed time
alone. Complete original-firmware boot and upload are explicitly pending.

### G07 — Define program delivery over supported transports

**Owners:** firmware transport/runner, Runtime virtual peers, Lite client UI.
**Start:** firmware `docs/hubprogram.md`, `docs/project/classic-protocol.md`,
`docs/project/ble-protocol.md`; Runtime `docs/spike-program-uart.md`; Lite
`SPIKE-NUTTX.md` and `docs/SPIKE-FIRMWARE-PROGRAMS.md`.

Inventory actual upload/run/output/Stop/status/storage endpoints before promising
another listener. Define a bounded common program-delivery contract, protocol
version, authentication/admission, chunk limits and failure/ownership rules.
Qualify a virtual Bluetooth peer against real guest handling where supported.
Specify a web-facing service as an external bridge unless an actual guest network
interface and server are established; the editor's local Renode state service
is not an on-hub webserver. Native program upload does not imply an arbitrary C
executable loader; decide that ABI separately if required.
**Done:** public capability tables name each implemented transport, actual guest
upload/run/Stop/fault/reconnect tests pass, and unsupported modes refuse clearly.
Contract and virtual transport work is doable now; physical USB/BLE and remote
service deployment need separate hardware/security/platform qualification.

## Reproducible starting checks

From the Lite repository root, Node 22, with repository-prescribed dependencies:

```sh
node --test test/overlay-packages-pairs.test.mjs test/spike-code-run-feedback.test.mjs test/spike-micropython-code-tab.test.mjs test/spike-renode-arena-session.test.mjs test/spike-nuttx-storage-exchange.test.mjs test/spike-arena-pane-units.test.mjs test/spike-arena-3d-pane.test.mjs
node --test test/independent-spike-backend.test.mjs test/independent-spike-controller.test.mjs test/spike-arena-sim.test.mjs
```

These are focused starting checks; they do not replace actual guest/installed GUI
qualification. Follow the linked route guides for source assembly and image
selection. Firmware source changes need its affected clean-build/guest matrix;
documentation-only work needs documentation/source-policy checks. LabWired has
no qualified SPIKE peripheral/firmware integration and is not a substitute for
these Renode gates. Physical USB/BLE, radio security, electrical calibration and
hardware release remain outside the demonstrated simulation scope.


## Addressed-reader package discovery candidate — 2026-10-09

Package preparation now recognizes the optional
`g_bw_program_addressed_sensor_abi` version1 constant in the own userspace ELF.
It validates a global four-byte OBJECT in an allocated nonwritable section,
exact section/load file mapping, flash bounds and absence of virtual or physical
load aliases. NuttX merged-text/RWE layouts remain accepted through section
metadata. Unsupported or malformed present markers fail packaging; absent
markers retain legacy package behavior.

The optional `addressedSensorCapability` configuration object contains `abi`,
`address` and `userspaceSha256`. Packaging writes the captured kernel/userspace
buffers used for vector/feature discovery, preventing a changed source file
from replacing the qualified bytes during a later copy. Existing configuration,
manifest and pin hashes bind the staged metadata and image. This is package
metadata preparation; the current state adapter does not advertise a live
addressed capability from it.

Eight focused new/legacy tests pass, including three source mutations that must
fail their intended version, section-write and physical-alias assertions. The
first mutation runner inherited Node's child-test context and falsely returned
zero; the corrected isolated runner removes that context and requires a named
assertion failure. Hosted consumer qualification remains required.

Firmware [PR52](https://github.com/CrispStrobe/brickwright-spike-prime-fw/pull/52)
source `6648a21548dcc3c40e000cd13374d113f7d85d3c` passed
[CI37916873278](https://github.com/CrispStrobe/brickwright-spike-prime-fw/actions/runs/37916873278);
its [clean ARM matrix37916873239](https://github.com/CrispStrobe/brickwright-spike-prime-fw/actions/runs/37916873239)
is still pending at this checkpoint. No firmware, Runtime or Infrastructure
package pin is adopted by this slice. Next require exact image-bound live
marker detection, a declared E/F ultrasonic topology through the state adapter
and shared arena, gated native/Python callers, and actual installed Code/Blocks
qualification. Default D-distance/E-force and six-motor configurations retain
their existing contracts; package metadata alone does not qualify those next
steps or arbitrary A–F addressed reads.
