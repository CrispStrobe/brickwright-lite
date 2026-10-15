# x86 GUI checkpoint and task handoff

Updated 2026-10-15. Shared CPU/device work belongs in bw-board; UI behavior belongs here. Start with the [board checkpoint and seven implementation lanes](https://github.com/CrispStrobe/bw-board/blob/master/docs/X86-NEXT-LANES.md), [GUI guide](I80386-GUI.md), [loading scope](X86-LOADING-SCOPE.md), and [generated language/device matrix](generated/LANGUAGE-DEVICE-MATRIX.md). Refresh both default branches and inspect completed receipts before repeating a task.

## Current boundary

The functional experimental 386 AT exposes console/VGA and keyboard/mouse routes through Circuits, Widgets and Code. Machine Manager accepts raw HDD media with supported CHS geometry and partial DOSBox configs; the named FreeDOS VGA route has its own documented floppy/HDD constraints. Widgets supports a large screen and full screen. Media selection remains tab-local and mouse reporting depends on the guest enabling it. These capabilities have different synthetic, headless-adapter and actual-browser evidence boundaries; consult the guide rather than treating them as one broad compatibility claim.

The board's native page-fault recovery result remains a finite diagnostic fixture, and its previous compact native paired result was slower than JS. The new [ABI 5 same-DSO direct-RAM checkpoint](https://github.com/CrispStrobe/bw-board/blob/0f295116f9543cdfc57762e120b2e1567bbce125/docs/I80386-COLD-DIRECT-RAM-RESULTS.md), merged in [board PR420](https://github.com/CrispStrobe/bw-board/pull/420), passes actual direct/companion/callback cold guest parity at tested source `acdb5dcef438c0ac7bc3c7794d43af4371d6e0d1` in [run 37605762900](https://github.com/CrispStrobe/bw-board/actions/runs/37605762900). Independent raw audits reproduce the whole RAM hash by replaying all 91,958 writes, with complete CPU/board/ordered-PIO parity and closed sessions. JavaScript physical-memory entries are zero, but clock/page/PIO/device callbacks remain. The separate [paired result](https://github.com/CrispStrobe/bw-board/blob/b1d982b57e220f3e980f28a0d11ee00d4cd51a24/docs/I80386-COLD-DIRECT-RAM-PAIRED-RESULTS.md) at harness `447fb5bfbc913db0ef00fca333ecb5be28b0e156` passes all 36 semantic children but fails adoption in [run 37609656584](https://github.com/CrispStrobe/bw-board/actions/runs/37609656584): direct uses 5.035176× JS execution CPU and 9.870393× execution wall, with 0/7 favorable pairs, on EPYC 9V45 with four logical CPUs. Ordinary JS remains the default. Configured RTx is JS 2.657023 / direct 0.269191 under the fixed six-clock/6 MHz pacing model; this is not physical 16 MHz 386DX calibration. Older compact timings remain separate historical evidence.

This fixed-A20, ROM-execution-only coherence fixture does not introduce a general native GUI backend or qualify a complete OS. The GUI's **Native blocks** checkbox selects the JS native-block dispatcher, not a Bochs Node addon. There is no wired 386 target. The next native step is a pure model for explicit clock authority in the board repository, followed by its own guest and paired timing gates; this handoff changes no consumer pin or frontend behavior.

Read [vendor-pins.json](../vendor-pins.json), the package manifests and lockfile for the selected board revision. Board diagnostics and merged supplier APIs do not qualify a newer installed consumer. Coordinate the existing supplier-adoption owner before changing pins.

## Task A: real free-media GUI acceptance

**Start:** `scripts/verify-i80386-freedos-real-browser.mjs`, `scripts/verify-i80386-freedos-vga-browser.mjs`, `scripts/verify-i80386-local-hdd-gui.mjs`, `scripts/verify-machine-widgets.mjs`, and the corresponding media/mouse tests. First inspect existing results and distinguish synthetic media, headless adapter and actual browser execution; extend a proven harness rather than creating a parallel one.

**Work:** use a freely licensed FreeDOS image and redistributable BIOS with recorded hashes. Boot via Machine Manager; verify a visible guest prompt, typed command response, guest-enabled mouse, tab transitions, focus, resizing, full-screen entry/exit and drag capture. Retain failure UI and media-lifetime checks. Cover browser-reserved keys and the documented absence of Pointer Lock.

The [optional real FreeDOS interaction probe](I80386-FREEDOS-INTERACTION.md) extends the existing harness with an owned PS/2 guest program and nonmutating pixel observation. Its exact observed result must accompany any completion claim. The [corrected-build receipt](receipts/2026-10-07-freedos-interaction-acceptance.json) clears real boot/listing, Widgets keyboard, fullscreen, pane growth, guest PS/2 packet readback and a working shell after the Circuits/Code roundtrip. The separate [direct-Circuits result](I80386-FREEDOS-CIRCUITS-DIRECT-RESULTS.md) at tested source `327143c40bfd0e0655395ec7c6cdb940de72c305` now clears physical typing through the focused Circuit VDP with a changed guest-rendered canvas, followed by retained output and a working shell after tab switching. Next cover drag capture outside the canvas, reserved keys and an actual guest mouse driver/application; do not repeat either cleared subset merely because main advanced.

**Deliverable:** a bounded browser scenario, exact build/dependency identities and screen/input evidence. **Done when:** the actual guest responds through Widgets and remains usable in Circuits and Code. Update `docs/I80386-GUI.md` and matrix inputs from the observed result. If the existing receipt already clears a criterion, preserve it and take the next uncovered criterion.

## Task B: DOSBox packages and disk formats

**Start:** `test/local-dosbox.test.mjs`, `scripts/machine-manager.mjs`, and the [board loading guide](https://github.com/CrispStrobe/bw-board/blob/master/docs/X86-LOADING-GUIDE.md). Shared parsing changes land in bw-board first.

**Work:** align config-relative media resolution, explicit CHS validation, unsupported-command reporting and CLI/GUI selection. Add bounded ZIP admission with traversal/count/size protections, deterministic config choice and no host-shell execution. A DOSBox package is an input format, not a promise of DOSBox compatibility. ISO support needs a real upstream CD-ROM/ATAPI path; do not enable a file picker that implies an absent device. Disk writeback/export is a separate explicit workflow.

The first connected GUI slice is proposed in
[PR992](https://github.com/CrispStrobe/brickwright-lite/pull/992). It admits only a
STORED ZIP of at most 16 MiB and 32 regular ASCII-named files: one `dosbox.conf`,
one matching config-relative `.img` HDD and optional `LICENSE.txt` notices.
Raw local/central records, extents, CRCs and paths are checked before extraction;
commands are checked against a closed subset around the canonical board AST.
Only explicit HDD CHS plus `boot -l c` selects the existing ordinary 386 route.
DEFLATE, COM/MZ virtual files, host mounts and ISO devices remain unsupported.
Source controls and an activation sink do not qualify a browser or guest boot.
Same-archive CLI loading, installed GUI input and tab retention remain next
acceptance work; claim the CLI entry/test changes before implementing them.

**Deliverable:** shared parser tests and one freely licensed package loaded in both CLI and GUI. **Done when:** the same bytes reach the intended functional target, malformed inputs produce useful persistent errors, and actual guest input/output passes. Document unsupported formats and disk persistence accurately.

## Task C: upstream adoption and matrix gaps

**Start:** `package.json`, the npm lockfile, `docs/VENDORING-REGIME.md`, `docs/generated/LANGUAGE-DEVICE-MATRIX.md`, and its source generator.

**Work:** choose an upstream board revision only after the required behavior and checks pass there. Move the exact pin and lockfile together; verify mirrored/derived ownership invariants and relevant GUI tests. Distinguish wired, functional JS, JS block/WASM dispatch and diagnostic native addon support in the capability source. Keep unavailable language/backend combinations explicit.

**Deliverable:** a focused pin-adoption PR and generated matrix diff. **Done when:** changed shared behavior passes an actual Lite scenario, source ownership checks pass, and the published matrix describes the selected dependency. A documentation-only checkpoint does not require a pin move or imply backend adoption.

## Task D: console interaction and free guest expansion

**Start:** the [board CLI/GUI guide](https://github.com/CrispStrobe/bw-board/blob/master/docs/X86-LOADING-GUIDE.md) and [guest acceptance lanes](https://github.com/CrispStrobe/bw-board/blob/master/docs/X86-NEXT-LANES.md).

**Work:** keep direct DOS-service loading distinct from BIOS boot; qualify terminal input/redraw/exit separately from browser interaction. Choose one freely licensed guest/application with a reproducible manifest and concrete success criterion. FreeDOS, ELKS and appropriate small-Unix fixtures are candidates; verify each exact release's redistribution terms before bundling. Keep strict 386DX and later-feature xv6 profiles separate.

**Deliverable:** one media/license manifest and bounded guest scenario. **Done when:** boot plus meaningful application/shell interaction passes, with the first uncovered CPU/device gap recorded as a follow-up task. Restricted media and their test details belong in the private repository.

## Working order and ownership

A frontend worker can take A while a shared-media worker takes B; coordinate Machine Manager and adapter edits. C follows an upstream implementation change. D supplies regression scenarios for either lane. CPU RAM ownership, clock batching, protected-mode oracle expansion and RTx calibration remain the board lanes. Each task should end in a reviewable change with relevant evidence and an updated handoff, not a stale implicit SHA.


## Qualified 386 debugging and media workflows

Source checkpoints and remaining acceptance work are recorded below. Refresh board PR599,
its subscribed free-guest qualification, performance decisions and this app's
actual selected supplier. The shared adoption owner in PR961 must hand off
package/lock/vendor work explicitly before x86 changes those surfaces. Adopt
only qualified source and preserve unrelated supplier changes; a successful
board diagnostic does not qualify the installed app.

First qualify forward debugging in the actual installed package. Source support
for target-declared physical bounds and read-only memory is merged in
[PR970](https://github.com/CrispStrobe/brickwright-lite/pull/970) and
[PR972](https://github.com/CrispStrobe/brickwright-lite/pull/972). The drawer uses
those descriptors for address jumps, bounded pages, refusals and editing controls.
Legacy targets retain their 64 KiB behavior. A newer drawer does not supply
missing metadata to an older installed board package.
Use explicit validated target memory bounds and read/write capabilities, not
linear code-address limits as a substitute for physical memory metadata.
This reviewed extension owns canonical
`overlay/scratch-gui/src/lib/bw-debug/debug-capabilities.js` and existing
`test/debug-capabilities.test.mjs`. Preserve schema-1 legacy spaces and normalize
the board's optional `spaces.mem` fields: `addressSpace: 'physical'`, inclusive
`addressMin`/`addressMax`, `maxReadBytes`, and existing `read`/`write`/`passiveRead`.
The 386 target contract uses 0 through `0xffffffff`, at most 1048576 bytes per
read, and `write: false`. This is a physical bus domain, not mapped RAM; passive
read claims require board observation controls. Absent optional metadata keeps
legacy behavior; presence of any new metadata field selects complete strict
validation. Partial or malformed descriptors fail closed without an editable
64 KiB fallback. Read lengths must be nonnegative safe integers. Preserve an
empty read at `addressMax + 1`, but never treat that endpoint as an addressable
byte or valid UI jump/page start; nonempty reads stay within inclusive bounds.
Test zero-length reads, the top byte and one-past empty endpoint explicitly. Use `write: false` as the read-only authority, not a duplicate
contradictory flag. Freeze normalized nested descriptors. Board metadata is
merged in [PR615](https://github.com/CrispStrobe/bw-board/pull/615); verify the
selected installed supplier before claiming those capabilities in the app.
Preserve other targets' declared address spaces.
Display full-width registers and physical addresses without truncation. Offer a
bounded address jump/page view, report read refusals, and disable editing when
the target refuses writes. Unsupported 386 disassembly, step-over/out, symbols
and reverse execution must be clearly unavailable, not rendered as valid legacy
operations. Keep ordinary 8086 controls and inspection working.

Use an existing free client through the exact installed supplier: visible guest
completion/input, pause, linear code breakpoint, one instruction, full-width
register/physical-memory observation, resume and Circuits/Widgets/Code transitions
without session loss. Retain source/package/media/build identities and actual
browser/native observations. A synthetic adapter test is not this acceptance.
Historical application/browser receipts remain source-bound; do not repeat them
as missing capability or promote them to a newer package without evidence.

Next add explicit raw-HDD download after the board export API qualifies. The
action applies to the active paused target and downloads detached raw bytes plus
geometry/hash metadata. Revoke Blob URLs on success, failure and disposal; never
write the originally selected file, silently autosave or store binary media in
the configuration library. Machine Manager's existing chooser supplies reload.
Controls cover live-session selection, unsupported/busy/capped export, download
failure/disposal and byte isolation. Actual installed acceptance captures the
genuine browser download, reloads those exact bytes through the real chooser
into a fresh machine, and verifies the guest-written marker and unchanged input.
Preserve the original session independently.

Then add one bounded DOS package chooser using the board's canonical admission
policy. Reuse the existing ZIP dependency only with raw-record preflight and
bounded extraction; no shared dependency edits belong here. Accept only the
explicit COM/MZ-plus-virtual-files or raw-HDD/CHS subset. Show deterministic config
selection and persistent useful rejection for ambiguity, unsupported commands,
unsafe paths, malformed archives or unsupported devices. No host-shell, package
JavaScript or network fallback runs. Actual CLI and GUI acceptance use the same
free/authored archive bytes and demonstrate guest input/output, target selection,
error recovery and tab/session retention. Keep raw-image loading available.

ISO/CD-ROM support remains a separate board/device task; do not advertise an ISO
picker before that path qualifies. Free application expansion follows these user
journeys: requalify an existing protected client first, then an explicitly licensed
engine/assets build with visible frames, live input and a repeatable workload.
Public examples and new notes use free/authored media with exact notices; private
licensed-media records remain in the private repository. No calibrated RTx,
physical 386 timing, whole-OS, broad DOSBox or release claim follows from this lane.


## Master-disk export continuation

Updated 2026-10-15. The board's master-copy API is merged in
[PR623](https://github.com/CrispStrobe/bw-board/pull/623); explicit CLI raw output
is merged in [PR618](https://github.com/CrispStrobe/bw-board/pull/618).
The two-session FreeDOS persistence fixture is merged in
[PR625](https://github.com/CrispStrobe/bw-board/pull/625). Its first actual run
[38790214003](https://github.com/CrispStrobe/bw-board/actions/runs/38790214003)
failed before command completion and left the disk unchanged. Accepted controller
scan bytes did not prove that the guest consumed the complete command. The live
console pacing correction is merged in
[PR627](https://github.com/CrispStrobe/bw-board/pull/627). The corrected
[actual run 38806122785](https://github.com/CrispStrobe/bw-board/actions/runs/38806122785)
passed at source `b8f95cfdb8ee654407b63e626e46eb8859ce7b41`. Root and independent
original-artifact audits reproduce the 19-byte `BWKEEP.TXT`, 43 permitted changed
bytes, and byte-identical first/fresh-readback exports. Both sessions boot the
same floppy; this is master-data persistence, not HDD boot, GUI acceptance,
crash durability or a full-OS result. Preserve the original failure; the passing
finite run does not establish a general BIOS failure cause.

GUI memory descriptor normalization and the memory drawer are merged in
[PR970](https://github.com/CrispStrobe/brickwright-lite/pull/970) and
[PR972](https://github.com/CrispStrobe/brickwright-lite/pull/972). These source
checkpoints do not adopt a newer board package or qualify the installed app.
The runner bridge is in
[PR986](https://github.com/CrispStrobe/brickwright-lite/pull/986); the complete
download helper and panel consumer are in
[PR987](https://github.com/CrispStrobe/brickwright-lite/pull/987). PR987 supersedes
the standalone helper PR984. Source checks, supplier adoption and installed
browser acceptance remain distinct gates.

The bounded CLI write/export/fresh-process reload is now qualified at the source
and run above. Continue with the pending runner bridge, complete helper/panel
feature, supplier handoff and actual installed-browser download/reload; do not
repeat the cleared CLI subset merely because main advances. The bridge calls
only the current target's
`snapshotAtaMaster()` and rejects stale session ownership after stop,
replacement, or destroy. Do not expose the target object or infer support merely
because a bridge method exists on every runner. Preserve the board's copy-time
boundary and refusals; no continuous pause or guest flush is implied.

Before installed acceptance, coordinate the supplier handoff and verify the
actual package includes the qualified API. Capture genuine browser image and
metadata downloads, compare the downloaded image hash, then use the real
**Boot FreeDOS VGA** chooser with the same free boot floppy and the exported
306×4×17 master data image. Start a fresh machine and read the guest-written
marker without rewriting it. Preserve the original input and session separately.
The **Boot disk** shortcut boots an HDD and is not the data-disk reload route.
Keep the existing authored boot-sector acceptance intact when extending its
harness. Exercise browser download permission behavior: two mocked anchor clicks
do not prove two files were saved.

The optional real download/reload scenario is proposed in
[PR989](https://github.com/CrispStrobe/brickwright-lite/pull/989), extending
`scripts/verify-i80386-local-hdd-gui.mjs`. Its default authored boot-sector
scenario stays unchanged. After qualified supplier/consumer adoption and an
externally reviewed source/build/input manifest, run from the repository root:

```sh
PROOF_SCENARIO=freedos-hdd-persistence \
PROOF_ADMISSION=reviewed-admission.json \
PROOF_OUTPUT=new-owned-output \
node scripts/verify-i80386-local-hdd-gui.mjs
```

The optional scenario refuses missing required APIs or mismatched identities
before browser execution. It captures both genuine browser downloads, reloads
the exact image through the chooser in a fresh session, and retains the original
paused session. Its finite source/build profile does not establish complete
package or compiled-source authenticity. Mock controls are not a browser result;
the harness observes deadlines, while a hosted external controller must enforce
hard resource limits. Nonlocal page HTTP blocking and disabled service workers
do not establish OS network isolation. No actual GUI persistence pass is recorded
by this source-preparation checkpoint.

Board export geometry is broader than the current GUI BIOS loader's accepted
geometry. Do not promise arbitrary exports can be reloaded: the named FreeDOS
route accepts the fixture's 306×4×17 image, while the generic DOSBox-config route
has its own CHS limits. Geometry metadata is a sidecar, not a config import
format. A wider chooser or ISO/CD-ROM path needs its own claim and qualification.
