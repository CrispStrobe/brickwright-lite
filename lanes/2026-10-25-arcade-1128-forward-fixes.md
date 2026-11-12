# Arcade PR #1128: forward fixes for main-test regressions

Owner: Arcade compatibility lane (stacked on PR #1128).
Branch: `fix/arcade-1128-forward-20261025`, base
`lane/arcade-current-main-successor-20261020` at `59af3b49152`.
Status: claim and change in one stacked PR; the owner of #1128 takes it in.

## Problem

PR #1128 keeps its features but fails existing main unit tests (main itself is
green). The failures group into a few root causes:

- native addition: ordinary programs that contain an Array somewhere, but whose
  addition operands no Array can reach, were refused instead of keeping the
  ordinary helper main always emitted;
- object/class type graph: producers the graph does not model were published to
  consumers as an actual `any`, turning module declarations into `any` (class
  callable initializer refusals, SDK Image refusals, SplashDialog `iface` crash
  in the original simulator);
- native bitwise export gate: captured lexical callable cells and compound
  Sprite flags stores were not proved, and Arcade `min`/`max`/`randomRange`
  were not Number producers (export and runtime inspection);
- the new score-threshold native test: a literal threshold arrives as its number
  field text, and its fixture's trailing `ready` flag was never observable in the
  original PXT run.

## Owned paths

- `overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js`
- `overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js` (one export)
- `overlay/scratch-gui/src/lib/bw-makecode/object-class-export.js`
- `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`
- `overlay/scratch-gui/src/lib/bw-makecode/callable-export-graph.js`
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js`
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values.js`
- `test/arcade-native-addition-ordinary-fallback.test.mjs`
- `test/fixtures/arcade-score-threshold.mjs`

## Boundaries

No existing assertion is weakened and no main test is marked TODO. Refusals stay
wherever an Array can reach an operand, an Array escapes into an SDK or unknown
callee, a member store or a callback return, or a receiver is an unproved
parameter. Remaining conflicts between unchanged main tests and deliberate
#1128 refusals are listed in the PR body for the owner to decide.

## Qualification

The affected single test files pass locally (Node 24); the full hosted unit
shards on this PR head are the gate.
