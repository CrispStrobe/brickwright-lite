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


## Proposed 386 Board HDD adoption handoff

Proposed 2026-10-16; documentation only. This is a serialized next task for a
fresh agent, not a transfer of package or pin ownership. The
[ledger proposal](../LANES.md#proposed-386-board-hdd-adoption-handoff--2026-10-16)
owns only these two documents. Refresh both repositories and the existing
adopters before implementation; do not treat this dated checkpoint as a current
merge decision.

The STM32 owner holds [PR975](https://github.com/CrispStrobe/brickwright-lite/pull/975),
branch `chore/stm32-faithful-pins-20261015`, at
`fb9961382287f5981d70ea6a15f504ee45101d39`. Its merged claim PR969 covers
Board/SB3 pins, package specifications and locks, notices and generated outputs,
and the STM32 runner changes. The PR says **Not for agent merge**. The CUI
adopter holds [PR965](https://github.com/CrispStrobe/brickwright-lite/pull/965),
at `fcf39b5cdfa1d4422ec4da685730baef429b43c1`, under merged claim PR961,
including shared lock surfaces. Preserve both owners and their recorded
coordination; this proposal changes neither their order nor their merge authority.
Obtain an explicit recorded handoff, agree one dependency writer and merge a
precise implementation claim before touching those shared surfaces.

At Lite main `9226b7522f69a287a9de77330d8d129ab043bdd7`, Board is pinned to
`b4b4c87f70624dfb570a6d21391c5a2d5a40a0e8`. PR975 instead proposes Board
`04f19952cea008b7498c701c16be5cc7ea1bdf63` and SB3
`a13f92b8bc4b06f0cb9ffec22bab71f06db7ac76`. Neither of those Board revisions
contains the 386 target's `snapshotAtaMaster()` implementation. A successful
STM32 adoption alone therefore cannot qualify the HDD export workflow. PR965
moves CUI separately while preserving its base Board/SB3 pins; the HDD feature
does not require its new CUI API.

The required Board source anchor is
[PR623](https://github.com/CrispStrobe/bw-board/pull/623), merged as
`48635add0807dc37c8c26551949fb58dcc9858e7`: inspect
[`src/i80386-debug.js`](https://github.com/CrispStrobe/bw-board/blob/48635add0807dc37c8c26551949fb58dcc9858e7/src/i80386-debug.js)
and its factory connection in
[`src/debug-target-factory.js`](https://github.com/CrispStrobe/bw-board/blob/48635add0807dc37c8c26551949fb58dcc9858e7/src/debug-target-factory.js).
Preserve the helper and metadata prerequisites rather than copying only a
method name. The related CLI persistence qualification is PR625, merged as
`cb5058e5f8865110aa099ff3fbc84092668563c0`, tested with PR627's pacing correction
at `b8f95cfdb8ee654407b63e626e46eb8859ce7b41` in
[run 38806122785](https://github.com/CrispStrobe/bw-board/actions/runs/38806122785).
The [master-disk continuation](#master-disk-export-continuation) records the
original failed run and the finite two-session data-disk result. Preserve both;
neither result proves installed GUI persistence or HDD boot.

The pending Lite consumers are PR986 (runner bridge, `a28ac3546cf5feb1541bc636ec626faf8cd24b74`),
PR987 (download helper/panel, `bb19267c36cda7648cdfd013344185bdeaf18716`),
PR989 (download/reload scenario, `f1c6bcf745d99c7ea96844bb67d27962d50b5eb6`),
and PR992 (bounded package chooser, `5b593cba63ec42896f0567b1a05fc653861e4468`).
These are source checkpoints, not a composed installed qualification. The
package chooser's existing canonical DOSBox parser is a separate boundary from
the snapshot API. Keep both boundaries explicit in the composed candidate.

After the owner handoff and merged claim, the fresh agent should:

1. Freeze the exact supplier revision, its qualification and ancestry, and the
   installed package's complete selected blob graph. Verify the snapshot API,
   factory wiring, metadata and persistence prerequisites. A later Board main
   revision is not automatically qualified by the historical tested source.
2. Review the component diff against each current adopter. Preserve STM32 and
   SB3 behavior and the agreed CUI revision; record unchanged component and
   unrelated pin identities. Use the canonical dependency/notices writers and
   inspect specifications, both locks, generated twins, notices and existing
   provenance, pin, matrix and integration gates. Claim any extra change first.
3. Compose one owned GUI candidate with the reviewed x86 consumers and exact
   installed supplier identities. Retain ordinary targets, source ownership,
   mirror equality, snapshot refusals and stale-session controls. Require every
   enabled final-head CI check; host controls alone do not qualify the app.
4. Admit a finite hosted source/build/free-input/resource manifest, then capture
   genuine image and metadata downloads and reload those exact bytes through
   the real chooser into a fresh machine. Verify the guest-written marker and
   original input/session independently, using the documented free boot floppy
   and 306×4×17 data image route. Qualify PR992's own package selection,
   rejection, input/output and tab-retention route separately. Retain original
   failures and acquire each official original once for independent audit.

No implementation is authorized by this proposal. No new dependency, lock,
notice, workflow, package or source change is made here. A future adoption is
complete only after qualified supplier and affected clean consumer results,
owner review and every enabled exact-head check, followed by the normal
matched-head merge and tree/parent verification. This finite handoff grants no
full-OS, broad DOSBox, physical-timing, RTx or release claim.


## Next finite GUI composition and hosted acceptance

The existing runner bridge [PR986](https://github.com/CrispStrobe/brickwright-lite/pull/986),
download action [PR987](https://github.com/CrispStrobe/brickwright-lite/pull/987)
and persistence scenario [PR989](https://github.com/CrispStrobe/brickwright-lite/pull/989)
are composed in [draft PR1013](https://github.com/CrispStrobe/brickwright-lite/pull/1013)
under their merged ownership, with canonical manifest admission corrected.
That source checkpoint keeps the selected dependency unchanged and is not an
installed qualification.
The [merged acceptance claim](../LANES.md#386-gui-hdd-and-forward-debug-hosted-acceptance--2026-10-16)
adds only one hosted entry controller, one standalone original reader, focused
inert controls and a separate workflow around the existing probe. Ownership
was merged in [PR1014](https://github.com/CrispStrobe/brickwright-lite/pull/1014)
before implementation; the hosted acceptance remains unfinished.

The [acceptance source checkpoint](https://github.com/CrispStrobe/brickwright-lite/commit/37cf9a63cb6da453145b031fc682880e448dbb11)
implements the controller, standalone reader, workflow and two probe scenarios
in the same draft composition. The HDD scenario uses genuine
browser downloads and a fresh chooser session. The separate self-authored boot
image exercises existing breakpoint, instruction-step, full-width register,
physical readonly-memory and pane-retention controls. Source controls pass 59
Node tests, including 33 embedded Python original-byte controls; they include a
complete controller-to-reader mocked attempt and coherently rehashed negatives.
Twenty targeted source cuts are detected. They are not an executed browser or
guest result. The independent reader also
grades captured rendered memory and register text, not only target values.
The initial checkpoint kept both guards false. A subsequent separately reviewed
activation enables metadata inventory only; actual source/workflow guards remain
false. An immutable template and explicit own-PR event are still required.
The first inventory selects source/runtime metadata only: locally assumed Python
cache paths are excluded. This inventory does not establish executing Python
import/bytecode closure; selected hosted system interpreter/native libraries
remain an explicit trusted platform boundary.

The [startup checkpoint](https://github.com/CrispStrobe/brickwright-lite/commit/7e11a159c)
versions the future actual request and reader as v3 while preserving v2 metadata
inventory. Before CPython entry, the actual workflow exclusively creates and
records an empty cache prefix; fixed isolated, no-site and no-bytecode-write
options redirect cache reads to it. Controller and reader join the original
installation, before/after flags, path and directory snapshots, plus ordered
successful official steps. Fifty Python controls and 59 Node tests pass, with
nine detected startup source cuts. These controls do not prove source/native
import closure, whole-host authenticity or a browser/guest result.

The first metadata event is already consumed for source `671702949709dc78da7d0cc8d0e064f9799ff399`:
[run 39106669518](https://github.com/CrispStrobe/brickwright-lite/actions/runs/39106669518).
Its template digest is `668f81ce67ad7bd4313da934e0bddbd0e78e6cd152e67b68e55bb695fbdaf583`.
At publication it is pending; do not repeat the label or original acquisition.
Later source changes do not qualify or alter this earlier selected observation.

Continue within the already claimed five implementation paths; dependency
writers and other workflows remain outside this lane. Next tasks are:

1. **Bounded reads and alias source delivered.** The subsequent
   [v2 source checkpoint](https://github.com/CrispStrobe/brickwright-lite/commit/7dd18548e)
   bounds held proc reads to 4097 bytes before parsing and both lazy censuses to
   8192 entries. Explicit directory aliases have a combined 256-alias cap,
   bounded declared resolution and observed target-directory identities. The
   request, inventory template, inventory original/admission and reader are v2;
   result and probe-admission schemas remain v1. All 33 earlier Python test
   bodies are held, with nine additional methods and thirteen detected source
   cuts. The four focused Node wrappers pass independently. No real process,
   browser or guest result is inferred from these mocked controls.
2. Review the fixed `bw.gui-hdd.inventory-template.v2` path roster against the
   locked Playwright package and selected Node/Python/tool closure. Select the
   real pinned headless-shell executable; do not substitute a larger browser or
   silently raise the file cap. The template must contain no operator paths.
   With only the reviewed metadata guards enabled, freeze the exact source head
   and template. The first own-PR `x86-hdd-gui-inventory` event above is already
   consumed: await that run and acquire its official originals
   once, independently audit source/event/job and observed selected files,
   aliases and installed packages, then freeze the reviewed immutable input.
   The inventory is an observation, not automatic actual approval or a complete
   host attestation. Preserve any mismatch; do not install a fallback.
3. Independently admit the official frontend Build checkout log, full source
   head/tree/selected closure and producing workflow before selecting its ZIP
   digest from official metadata. The actual controller acquires that original
   once and derives bounded member inventories from authenticated bytes; the
   reader recomputes them. Freeze the `bw.gui-hdd.actual-request.v3` identity
   separately from the producer, including the prior inventory admission.
4. Review final source, exact official event/job/step/artifact joins and resource
   margin before the separate actual activation. The HDD and forward scenarios
   keep 1250/180-second bounds under the 1800-second controller and 35-minute job;
   package/browser setup consumes that same job budget. Per-process limits do
   not prove aggregate containment or continuous process-group ownership.
   After every enabled final-head check passes, admit one bounded actual event
   and audit its original packet with `scripts/read-i80386-hdd-gui-originals.py`,
   without producer imports or browser/guest replay. Preserve failures.
5. Only qualified original evidence plus all enabled final-head checks can
   close the component/composition merge gates. Refresh ownership and normal
   merge parents/tree before merging; source controls alone do not qualify it.

The dependency-free focused check is:

```sh
node --test test/i80386-hdd-gui-actual.test.mjs test/i80386-hdd-download.test.mjs
```

The earlier handoff proposal above is a dated snapshot. Read-only source
observations on 2026-10-16 found PR975 head `e553bb7a` selecting Board `f00f8ff5`,
then head `943d540c` selecting Board `f84ba60e`. These are historical observations,
not a supplier selection or qualification for a future actual. The latter
source contains the snapshot target and factory wiring; the selected 386
module graph matches the retained CLI source anchor, while an unrelated
labwired source change means the entire supplier source tree is not identical.
Source equality does not qualify an installed browser or transfer ownership.

At the 2026-10-18 refresh, [PR975](https://github.com/CrispStrobe/brickwright-lite/pull/975)
has merged. Canonical main selects Board
`f84ba60ead0a90deb9830f0c1468839c293ecf05`, CUI
`055930ec51300e0d71466c696ce1bf76284bde38` and SB3
`a13f92b8bc4b06f0cb9ffec22bab71f06db7ac76`. Historical proposal holds above
are superseded by the merged adoption, not a transfer of dependency writers.
Refresh canonical package, lock and vendor-pin declarations immediately before
source and actual admission. Independently admit the complete installed graph;
a merged pin alone does not qualify these GUI scenarios. The root manifest's
authoritative Board field is `devDependencies`; the GUI manifest's is
`dependencies`. Refuse missing, conflicting or duplicate declarations.

After qualified adoption and source/build admission, run the existing genuine
download/reload scenario with its fixed free floppy and 306×4×17 data image.
Retain actual canvas/input/download evidence, the exact exported image and JSON,
fresh-session marker readback, the paused original session's identity/counters,
and terminal process/resource/cleanup observations. Freeze a standalone reader
and the attempt-1 official event/job/step/artifact joins before execution.
Preserve all current predicates and limits; source controls cannot replace an
original or justify an automatic retry.

The candidate user flow is **Code → device selector → Manage machines… →
FreeDOS VGA (named 386 profile)**. Select the boot floppy and a type-1 HDD
(306×4×17), then **Boot FreeDOS VGA**. After the guest closes its files, pause
and use **Download HDD image + JSON**. To reopen it, start a fresh machine with
the same floppy and the downloaded image in the HDD chooser. This is an
explicit exported copy; the original selected file is not an automatic save
destination. The download action is still in the unmerged composition, and
its installed browser acceptance is the task above. Optional AT BIOS and VGA
ROM choosers and the bundled free firmware remain existing profile choices;
other disk geometries and ISO/CD images are outside this acceptance.

A separate bounded forward-debug scenario must demonstrate actual UI pause,
code breakpoint, instruction step, full-width register and read-only physical
memory inspection, resume and pane retention. Dedicated supplier support does
not provide mode-aware disassembly, step-over/out, architectural checkpoint or
reverse execution. ZIP selection in PR992 remains a separate acceptance task;
ISO/CD/ATAPI and general DOSBox compatibility are outside this claim.
