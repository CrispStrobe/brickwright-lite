# Arcade 2h part 1: consumed prefix/postfix values

Status: claim and change in one PR. Owner: Arcade lane (exporter/runtime
rows 2c, 2g, 2h). Base: main `4b2f5047dde6`.

Scope: 2h part 1 only (2h-1). `primitiveConstraintGraphOptions` in
`overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js`, the
inspection `+` proof in `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`
(and its integrated copy), `test/makecode-arcade-update-values.test.mjs`, new
`test/arcade-consumed-update-number-proofs.test.mjs`, the 2h rows of
`lanes/2026-11-03-arcade-pending-after-1643.md` and the matching row of
`docs/ARCADE-888-OPEN-FAILURES.md`. No importer helper-recognition, pin or
workflow change.

Change: `pair(counter++,++counter)` was refused at export for two reasons.
1. The exported `__bwUnaryAdd(value){return +value}` helper was analysed as
   an ordinary function whose formal joins every call site, so one call with
   a non-Number operand (an index read that may be Undefined, a Sprite
   property) voided every `+x` call. A top-level, once-declared, never-written
   one-parameter `return +param` helper is now specialized per call site, as
   the binary helpers already are: each call is Number only from its own
   Number operand.
2. A native dynamic `+` read its output type from the flow-insensitive
   annotation node, which the lazy `true&&counter++` Any copy joins. It is now
   a Number when both of its own operands are proved Number (PXT never
   concatenates two Numbers); otherwise the old rule applies.

Evidence: the TODO test `consumed prefix/postfix updates preserve values, lazy
choice and evaluated-once targets` passes with its marker removed (original
PXT, VM, Code, export in original PXT, reimport, SB3). New tests compare
original PXT before and after export and keep near-misses refused: a possibly
Undefined `+row()[3]` operand, and an edited Text operand of the `+`.
Mutations: removing rule 1 fails the per-call-site test; removing rule 2 fails
the lazy-choice test; rule 2 without its operand proof fails the Text-operand
refusal.

2h part 2 (2h-2, argument edited to text) stays TODO: it conflicts with the
deliberate control `registered stock/managed Number rejects text before body
effects` in `test/arcade-procedure-constraints-native.test.mjs`, which this
claim does not change. Waits for an operator decision.
