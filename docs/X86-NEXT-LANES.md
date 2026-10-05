# x86 GUI checkpoint and task handoff

Updated 2026-10-05. Shared CPU/device work belongs in bw-board; UI behavior belongs here. Start with the [board checkpoint and seven implementation lanes](https://github.com/CrispStrobe/bw-board/blob/master/docs/X86-NEXT-LANES.md), [GUI guide](I80386-GUI.md), [loading scope](X86-LOADING-SCOPE.md), and [generated language/device matrix](generated/LANGUAGE-DEVICE-MATRIX.md). Refresh both default branches and inspect completed receipts before repeating a task.

## Current boundary

The functional experimental 386 AT exposes console/VGA and keyboard/mouse routes through Circuits, Widgets and Code. Machine Manager accepts raw HDD media with supported CHS geometry and partial DOSBox configs; the named FreeDOS VGA route has its own documented floppy/HDD constraints. Widgets supports a large screen and full screen. Media selection remains tab-local and mouse reporting depends on the guest enabling it. These capabilities have different synthetic, headless-adapter and actual-browser evidence boundaries; consult the guide rather than treating them as one broad compatibility claim.

The board's new native page-fault recovery result is a finite diagnostic fixture. Its compact native cold path remains slower than JS in the measured paired gate. Neither result introduces a general native GUI backend. The GUI's **Native blocks** checkbox selects the JS native-block dispatcher, not a Bochs Node addon. There is no wired 386 target.

At this documentation checkpoint, `package.json` pins bw-board to `31c6499a617e274505386dbbc9d3a955e8f527ac`. The new board results are upstream evidence; this documentation change does not adopt a new dependency or claim they ran in Lite. Read the current pin and lockfile again before an implementation change.

## Task A: real free-media GUI acceptance

**Start:** `scripts/verify-i80386-freedos-real-browser.mjs`, `scripts/verify-i80386-freedos-vga-browser.mjs`, `scripts/verify-i80386-local-hdd-gui.mjs`, `scripts/verify-machine-widgets.mjs`, and the corresponding media/mouse tests. First inspect existing results and distinguish synthetic media, headless adapter and actual browser execution; extend a proven harness rather than creating a parallel one.

**Work:** use a freely licensed FreeDOS image and redistributable BIOS with recorded hashes. Boot via Machine Manager; verify a visible guest prompt, typed command response, guest-enabled mouse, tab transitions, focus, resizing, full-screen entry/exit and drag capture. Retain failure UI and media-lifetime checks. Cover browser-reserved keys and the documented absence of Pointer Lock.

**Deliverable:** a bounded browser scenario, exact build/dependency identities and screen/input evidence. **Done when:** the actual guest responds through Widgets and remains usable in Circuits and Code. Update `docs/I80386-GUI.md` and matrix inputs from the observed result. If the existing receipt already clears a criterion, preserve it and take the next uncovered criterion.

## Task B: DOSBox packages and disk formats

**Start:** `test/local-dosbox.test.mjs`, `scripts/machine-manager.mjs`, and the [board loading guide](https://github.com/CrispStrobe/bw-board/blob/master/docs/X86-LOADING-GUIDE.md). Shared parsing changes land in bw-board first.

**Work:** align config-relative media resolution, explicit CHS validation, unsupported-command reporting and CLI/GUI selection. Add bounded ZIP admission with traversal/count/size protections, deterministic config choice and no host-shell execution. A DOSBox package is an input format, not a promise of DOSBox compatibility. ISO support needs a real upstream CD-ROM/ATAPI path; do not enable a file picker that implies an absent device. Disk writeback/export is a separate explicit workflow.

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
