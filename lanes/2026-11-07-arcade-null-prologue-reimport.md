# Arcade reimport of the exporter's null sprite prologue (items 2a, 2b)

Status: 2a DONE in the implementing PR (claim and change together). 2b
investigated and released unchanged (see below).
Owner: Arcade lane. Base: main `cc4405a68914`.

Scope: `liftExporterStops` in
`overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js`, focused tests in
`test/makecode-export-arcade.test.mjs`, the 2a/2b rows of
`lanes/2026-11-03-arcade-pending-after-1643.md` and the matching rows in
`docs/ARCADE-888-OPEN-FAILURES.md`. No exporter, pin or workflow change. Not
the connected-authoring claim's numeric harness or fixtures.

Change: the stop-machinery lift accepted only the first export's sprite
prologue (root `let GameSprite = sprites.create(...)`). The second export
writes it as a root `let GameSprite: Sprite` with no initializer and, directly
in the body of the root `control.runInParallel` start function, the two
consecutive statements `GameSprite = null` and `GameSprite = sprites.create(
img`...`, SpriteKind.<K>)`, optionally followed by a literal-arithmetic
`GameSprite.setPosition(a, b)`. The lift now admits exactly that form too.

Evidence: the 2a TODO test (`exported stock stop-other and stop-all retain
actual native lifecycle behavior`) now passes with its marker removed: original
PXT on the first export, native VM, Code, fresh SB3, second export in PXT, and
the reimported second export in the VM all agree (`n = 10`, `after = 0`, all
threads stopped). New test `stop machinery lifts from the exporter null
prologue and only from that exact form` has a positive lift on the real second
export and thirteen near-miss refusal controls (statement between null and
create, create without null, reset to undefined, initialized or differently
typed declaration, nested block, foreign or stop-storage position arguments,
a second creation, another receiver, a root update handler, a nested parallel
handler). Eight source mutations of the new recognizer (drop the Null check,
the no-initializer check, the Sprite type check, the position argument check,
adjacency, the root start-function check, root-only scanning, or the whole
recognizer) are each detected by a failing test.

2b not changed: its blocking refusals are export-side Array authority
(`Array reference ... requires an actual initialized Array producer and
compatible all writers`) for root `let actors: Sprite[] = null` globals that
the start script resets before calling `__bwStartup`. That is the cross-
procedure Array reset proof, not the sprite prologue the stop lift reads, so
an importer recognizer of the null prologue does not close it. The row stays
TODO with this diagnosis.
