# bw-bundle — blocked items (campaign: circuit parity)

This tracks the campaign integration ladder (slices 1–3), distinct from
DEBUG-CONTROL-MODEL.md §8's acceptance ladder (rungs 1–8).

## ~~Slice 1: debugState.bwMs~~ — RESOLVED (ceafc8d)

`bwMs` added to debug-runner.js snapshot at line 138. circuit-tab.jsx reads
`ui.bwMs` and forwards it to DebugStatus. Undefined before symbols exist
(deliberate — no fabricated zero).

## Slice 1 note: activePartIds regex in CircuitDesigner

**Owner:** bw-circuit-ui

`CircuitDesigner.jsx:540` filters `debugState.tasks` by matching blockId against
`/setpin|toggle|writepin/`. Block IDs are opaque strings, not opcodes — the regex never
matches. The active-part highlight is dead. The right fix is to derive active parts from
pin state (`board.getPinStates()`), not from yield points. Not blocking bw-bundle.

## ~~Slice 3: project.stc does not survive save/reload~~ — IN PROGRESS

Two persistence paths, belt and braces:
1. **sb3.js patch** (apply-vm-overlay.mjs): serialize writes `stc: { version: 1, ... }`
   as a top-level key; deserialize restores it. Works for projects saved in lite.
2. **Stage comment** (sb3-creator e7d739d): `writeStcComment()` writes a minimized comment
   on the Stage target with magic `_stcconfig_`; `readStc()` recovers from it even after
   a foreign round trip strips the top-level key.

**Wired:** importer writes the comment on import via writeStcComment.
**Not yet wired:** comment recovery on .sb3 file open (the read path when a user opens a
saved .sb3 through the file menu, not through the importer). Needs a VM event listener.
**vm.setStc()** is patched in; importer uses it.

**Not verified:** no round-trip test in this workspace. sb3-creator has
`test/stc-persistence.test.mjs` covering readStc/writeStcComment.

**Coordinator note:** debug-runner.js reads `vm.runtime.stc`. The patches write to the
same property via `vm.setStc()`. If stc moves, `projectStc()` and `projectForEmit()` move.

**Future:** DEVICE/CLOCK/PIN as actual blocks would round-trip natively — eliminates the
dual source of truth. Belongs to bw-blocks and sb3-creator.

## ~~STC89 12T timing~~ — RESOLVED (ba6e001)

Fixed upstream in `00e9d5b`, rebuilt in `ba6e001`. STC89 now runs 12.0 clocks per NOP.
Re-pinned in lite.

## Naming rule: competitor name in vendored BoardCanvas.jsx

**Owner:** bw-circuit-ui (source file, line 1262: "TinkerCAD-style")

lite's vendored copy at `overlay/.../bw-circuit-ui/components/BoardCanvas.jsx`
carries the competitor product name. lite is a public repo. Do not patch the
vendored copy — it gets overwritten on every re-vendor. Wait for bw-circuit-ui
to fix the source, then re-vendor.
