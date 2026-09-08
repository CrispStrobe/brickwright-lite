# Experimental 286 board lab

Open **Settings → 8086 execution diagnostics → Open experimental 286 board lab**,
then choose **Enable experimental board lab**. The gate resets whenever the
dialog closes. The engine is loaded lazily only after Enable; no project settings,
editor circuit, production device registry or production engine pin are changed.

This is a separate fixed-profile board workspace, **not arbitrary 286 parts in
Circuit Editor** and not a full Boundary-D debugger target. It executes the owned
loop ROM through wired memory and supports the current limited instruction subset.
No protected mode, interrupt handling, cycle-accurate instruction timing or general
80286 compatibility is claimed.

## Controls

- Load the owned loop demo or import a recipe from a JSON file/text field.
  Successful loads create fresh machines paused before the reset instruction.
  Failed imports keep the previous machine. Inputs are limited to 2 MB.
- Export/download writes the original construction recipe: ROM, fixed typed part
  inventory, alias choice and editable wires. It does not save live RAM or CPU state.
  Unknown parts/backends/profiles and electrically invalid boards fail explicitly.
- Step one modeled clock or one instruction (bounded to 256 clocks).
- Run at most 4096 clocks in 16-clock batches that yield to the browser. Pause
  retains partial instruction state; Close cancels and discards the session.
  These are safety budgets, not real-time performance guarantees.
- Set/clear a hexadecimal **physical 24-bit** breakpoint. `FFFFF0` stops before
  the reset instruction; Continue skips that stop once and rearms it on revisits.
- Inspect a memory bank or a named net such as `cpu.ready_n`. The bank preview
  currently shows offsets `0280h–028Fh`; the loop's sum appears at `ram0[0288h]`
  as `0a` (physical RAM address `0510h`, low byte). Inspections do not issue guest
  reads. Register/history state is shown after each operation or run stop.
- **Edit board draft** opens a separate logical block view. Position parts with
  X/Y controls, remove/connect named terminals, and import/export draft JSON with
  layout. Apply reconstructs a fresh board; failed validation preserves the prior
  session. Closing discards unapplied edits. This is not physical package routing.

The backend remains fixed. There are no live snapshots, memory/register writes,
hot backend switches, editor rewiring while running or project save integration.

## Source and license

`overlay/scratch-gui/src/lib/bw-286-lab/engine/SOURCE.json` pins an isolated,
unmodified ten-module subset from `CrispStrobe/bw-board` at
`14f253877e006673f5eea6745853ee28e360fca9`, plus its MIT license. Git blob hashes
are checked by the application unit test. Its device registry is separate from
the production engine. `vendor-pins.json` and normal vendor sync are unaffected.
Update this copy only from a reviewed engine commit, with new provenance and tests;
do not patch vendored emulator implementations directly.

## Verification

Local results on 2026-09-08:

- `test/harris-board-lab.test.mjs`: 4/4 pass, including exact upstream blob checks,
  registry isolation, recipe execution/export and lazy entry checks.
  Combined with the existing `test/i8086-lab.test.mjs`: 10/10 pass, zero skips.
- `node scripts/verify-harris-board-lab.mjs`: Chromium component gate passed,
  exercising unloaded-before-enable behavior, reset breakpoint, stepping, full
  47-instruction execution, bank/net inspection, JSON and file import, export and
  download, rejected backend preservation, pause, close and fresh disabled reopen.

Without `PROOF_URL`, the browser script serves the actual lab modules in a small
standalone harness; that mode does **not** test React Settings or a webpack build.
With `PROOF_URL`, it clicks the real Settings → diagnostics → 286 lab entry in
the served application and verifies that the named engine chunk is fetched only
after Enable. The build workflow now runs this mode in the light browser shard.
For a separately installed Playwright, `PLAYWRIGHT_MODULE` may name its absolute
ES module entry. Local unit verification used Node 20's
`--experimental-default-type=module`; the application declares Node >=22.
The initial milestone did not run a full application build or full CI.
Follow-up hosted run `34266037150` targets exact acceptance commit `8030218da`;
both browser-shard editor builds succeeded and the light shard's experimental
286 lab gate passed through the real Settings menu. The corpus job also passed.
Final result of that run: both browser shards and corpus succeeded, but the unit
job failed four assertions in the browser-budget and pin-move policy gates. The
follow-up regenerates budget metadata and declares the independent experimental
revision field, retaining blob verification and mutation checks. This is not an
all-green full-CI receipt. The editor-draft bridge commit `895ae3b91` has local targeted
coverage, not coverage from that earlier-SHA hosted run.
No deployment or hardware verification is part of this work.

The [editor draft bridge](HARRIS-286-EDITOR-DRAFT.md) defines strict part,
layout and topology conversion and now has a separate visual draft surface.
This lab must not silently load an ordinary project circuit as its fixed profile.
For execution priorities, see [DOS readiness](HARRIS-286-DOS-READINESS.md).

Visual-editing follow-up: hosted run `34268635533` was queued at source commit
`5e74286bc` after the local browser pass and policy repairs. Its result is pending,
not an all-green CI receipt.
