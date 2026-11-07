# Arcade second export: parallel handler run tokens (item 2a, partial)

Status: DONE in the implementing PR (claim and change together).
Owner: Arcade lane. Base: main `03f4355de16e`.

Scope: `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js` (and its
integrated copy under `packages/scratch-gui`), focused tests in
`test/makecode-export-arcade.test.mjs`, the 2a row of
`lanes/2026-11-03-arcade-pending-after-1643.md` and its row in
`docs/ARCADE-888-OPEN-FAILURES.md`. No importer, pin or workflow change.

Change: when a reimported program is exported again, each `arcade run
parallel` handler that carries stop machinery now takes its own run token
(`const _t = _tok()`), as every flag script does in the first export.
Before, the handler borrowed the start script's token, so `stop other
scripts in sprite` kept the other handler running.

Evidence: original PXT on the first export gives `atStop = later = 5`; the
second export before this change gave `later = 15`, `m = 16`; after it, all
four values equal the original. Mutation: the same second export with the
handlers' own tokens removed is run in PXT inside the test and differs.
Mutation of the source (main's exporter) fails both new tests. Refusal
control: a program without stop machinery gets no token.

Not closed: the TODO row `exported stock stop-other and stop-all retain
actual native lifecycle behavior` still fails at the third step (reimport
of the second export) with `_dead.t requires Number from actual producers`.
The cause is not nesting: the importer lifts the stop machinery only when
the sprite prologue is the exporter's own `let <X>Sprite = sprites.create(...)`
recipe, and the second export emits the reimported start script's
`GameSprite = null` / `GameSprite = sprites.create(...)` instead. The row
needs that prologue shape (related to item 2b's null prologue), not more
token work.
