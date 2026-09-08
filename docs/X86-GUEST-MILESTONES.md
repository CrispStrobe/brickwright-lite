# 16-bit guest acceptance: 8086, 80186, 80286

Owner request, 2026-09-08: implement all five milestones, with Tim Paterson's
[DOS listings](https://github.com/DOS-History/Paterson-Listings) as a named source.
This is an implementation backlog, not a declaration that the guests boot.

## Execution contracts

* **8086:** existing instruction core and PC-style machine, plus the separately
  labelled DOS-service bench. A bench pass is not a firmware/kernel boot pass.
* **80186:** existing instruction variant on an explicitly external PC-style
  chipset. This is not a pin-compatible replacement for the 8086, nor a model of
  the 80186's integrated interrupt controller, timers, DMA and chip selects.
  The eventual editor board needs a separate 80186 component/profile.
* **80286:** default-off Harris wired bus/boot CPU. No alias to the 80186 decoder
  may be called a 286 pass. Complete real-mode prerequisites before OS boot;
  protected mode is an additional 286-only milestone.

The common guest workloads target 8086 instructions and appropriate 16-bit
binaries. Protected-mode software is **not applicable** on 8086/80186, rather
than a failing compatibility score. CPU identity, board identity, storage path
and guest identity must accompany every receipt.

## Five milestones and their acceptance gates

| Milestone | Required observable evidence | Starting state |
| --- | --- | --- |
| 1. Licensed utilities and assembly | Exact pinned source/binary, hashes/notices; bounded execution; expected output and exit; no unreported unsupported services | Owned COM smoke test and Paterson FAT12 routine tests pass; whole Paterson utility pending |
| 2. Shell/editor with persistent files | Type commands, create/edit/save a file, reload storage into a fresh machine, read exact saved bytes; invalid input tested | Real DOS shell disk-write/remount checks pass on 8086/80186; editor and wired 286 pending |
| 3. Circuit Editor reference machine | Versioned editable recipe, adequate RAM, firmware, PIC/timer, console and storage; removing a required wire breaks the corresponding guest operation | Existing PC machine components; experimental wired 286 has only 64 KiB RAM/ROM |
| 4. ELKS | Boot an appropriate real-mode PC image, reach shell, write/read a file, execute multiple processes and verify both outputs | Not demonstrated here |
| 5. Classic MINIX, then 286 protection | Named 16-bit MINIX build reaches shell/files/processes; separate 286 descriptor/privilege/fault tests precede protected guests | Not demonstrated here |

Each row is evaluated independently on all three CPU contracts. Missing media
is `not-run`; an exhausted execution budget is not a boot; a deliberate refusal
test passing does not make the guest compatible. Report the last reached boot
stage, CS:IP, instruction count, console tail and unsupported calls on failure.

## Sources and distribution

Paterson source pin: `acbfced8a2d9828c6cd2c8ca8f12b35d0572d60b`, MIT. Start with
CHKDSK's original source and selected routines with independent result oracles; do not
silently translate Seattle ASM's `JP` into x86 parity jumps (`JP` in that source
dialect is an unconditional short jump). Distinguish routine tests, utility
error-path tests and successful disk repair. Run repair utilities only on
disposable test media, never on user-mounted images.

Additional permissive candidates: Microsoft's explicitly released DOS files,
SvarCOM (MIT), MS-DOS Kermit (Columbia-owned files under revised BSD). Pin exact
versions and audit third-party components before vendoring. A repository's
root licence does not relicense somebody else's binaries contained within it.

[ELKS](https://github.com/ghaerr/elks) has a GPLv2 kernel and separately licensed
userland. Keep guest media separate from the permissive emulator sources; if
distributing images, include corresponding source and required notices. Stock
disk images need at least 512 KiB RAM. Select a real-mode 8086 PC configuration,
not a protected-mode or platform-specific build merely named ELKS.

[Classic MINIX's original distribution notice](https://minnie.tuhs.org/ftp/minix/ftp.cs.vu.nl/)
records retroactive BSD relicensing. Choose an Intel 16-bit build, not MINIX 3,
and audit compiler/runtime/third-party files in the selected distribution.

Xenix and System V are optional user-supplied research targets, not approved
bundled guests. They are not prerequisites for completing these five milestones.

## Implementation sequence

1. Establish source provenance and deterministic Paterson routine/application
   fixtures; run separately on 8086 and 80186, expose honest 286 refusals.
2. Extend the wired 286 with byte operands, segment loads, stack/calls/returns,
   then ALU/strings/software interrupts and I/O. Every memory operand must use
   the board transaction path; add delayed READY and lane/memory assertions.
3. Execute shell/editor persistence on the mature PC path while the wireable
   CPU progresses. Test disk writeback, fresh-machine remount and failure paths.
4. Freeze PC reference-machine recipes and guest media pins; probe ELKS and
   MINIX boot landmarks to select missing firmware/device behaviour.
5. Close the same end-to-end tests on the wireable boards; only then advertise
   guest support in the GUI. Keep experiments default-off until their gates pass.

No merge, deployment, default-backend change or accelerated-path promotion is
part of this request. Full integrated 80186 peripherals and 286 protected mode
remain explicit work, not implied by a successful 8086 application.

## First implementation receipt

Engine `f2eeb5964bc1285a6c8f3b1c297d2998833cc56f`: 71 targeted tests passed
across boot/loop/new real-mode prerequisites, Paterson, circuit sessions, real
DOS persistence and OS probe validation (no skips in these local runs). This
is not a full suite or SingleStepTests/80286 run.

The application preserves original/adapted source, notices, hashes and a
reproducible recipe under `static/guests/paterson-fat12/`, with a default-off
lab load button. Eight focused app tests passed and the isolated Chromium
panel gate exercised the new routine load/run as well as existing debugger,
draft wire edits, failed apply preservation and import/export. Full built-app
browser/hosted CI and deployment are not included in that receipt.

ELKS and MINIX probes have exact source/media identities and negative results
in engine `docs/X86-GUEST-ACCEPTANCE.md`; they do not yet reach accepted shells.
Games and DOSBox packages are research-only in
[the preservation/package notes](X86-PRESERVATION-AND-PACKAGES.md).
