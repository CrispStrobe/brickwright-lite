# Who is doing what — merge the claim before implementation

## Original Arcade display readiness proof — 2026-10-12

CLAIMED — Codex bwcx, continuing `fix/painter-installation-proof-20261011`.
Build38198014926 passes both browser shards, corpus and FPGA but fails the
seven-segment exact-screen comparison (19200 pixels different). Program-global
completion does not prove a presented frame: original ScreenState initially
fills its buffer black, while the authored scene draws a white background.
Envelope: LANES.md, test/helpers/pxt-arcade-runtime.mjs and
test/makecode-arcade-sevenseg.test.mjs only. Add opt-in observation of a real
screen update after the existing completion marker; preserve default callers,
original call semantics and exact pixel equality. No fabricated image, native
renderer change, timeout increase, changed expected palette or engine pin.
The current candidate remains rejected until replacement hosted qualification.

Created 2026-08-24, after two sessions independently did the same repair.

## SPIKE caller profile preflight — 2026-10-12

CLAIMED — Codex SPIKE integration, isolated branch
`fix/spike-profile-preflight-20261012`, base
`926901bab0` (resolve the full base with Git history).
Envelope: `overlay/scratch-vm/src/extension-support/native-renode-capability.js`,
its tracked `packages/scratch-vm` twin, focused native-capability tests,
`docs/SPIKE-STATUS-AND-LANES.md` and this ledger. Reject unknown SPIKE topology
and custom topology without explicit own-NuttX backend before broker allocation
or dispatch. Keep valid requests and existing sessions unchanged; preserve opaque
native authorization failures and closed relay failure codes. Test valid profile
forwarding, local refusals, concurrent ordering and session survival, including
mutations of both guards. This is caller validation, not native authorization or
installed-package qualification. The separate PR755 adoption/package lane and
peer Arcade painter/browser repair retain their ownership.

## Why this file exists

### Painted-level installation proof repair — 2026-10-11

CLAIMED — Codex bwcx, branch `fix/painter-installation-proof-20261011`.
Build38155522851 and the independent PR797/800 Builds38155089351 and
38157758738 all failed the same saved-level runtime-after-reopen check.
The saved maps compare exactly; the final runtime receipt instead contains
the platformer's original32x8 map, not the new10x8 map. Diagnose competing
startup writes without assuming that any requested map was actually installed.
Observe the real native tilemap primitive after its unchanged execution, retain
immutable receipts, and require an exact saved-map installation with the same
pixel/wall requirements. Do not claim that this map remains the game's final
map when its other scripts replace it. Envelope: this ledger,
scripts/verify-arcade-tilemap-painter.mjs, new
scripts/lib/arcade-tilemap-installations.mjs and
test/arcade-tilemap-installations.test.mjs. Preserve receiver/arguments/return,
exceptions and restoration; prove wrong/missing installed maps are rejected.
No engine, painter UI, project, dependency, workflow, timeout or tolerance edits.
The prior persistence lane is DONE; active identity/legacy/placement lanes
exclude this persistence proof. Hosted browser qualification remains required.

The vendor of `sb3-creator eac7a1a` made two OPEN DEFECT sentinels fire — the
shift-register bit test and the four faceplates with dead controls. Both are
written to go red the moment their defect is fixed, and both carry instructions
for what to do when that happens. Two of us followed those instructions, at the
same time, without knowing about each other. The work was done twice, reached
`main` twice, and had to be merged against itself.

Nobody ignored a rule; there was no rule. The coordinating session worked from a
worktree created *before* the other landed, and never re-checked. A worktree is a
photograph of `main`, and the longer you hold it the more of a lie it becomes.

