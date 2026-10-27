# Arcade integration takeover and native-addition regression repair

Status: CLAIMED — implementation waits for this claim to merge.
Owner: Arcade integration, now driven by a Claude Code agent taking over from
the previous Arcade integration worker (paused by the operator; its last push
was more than 30 minutes before this claim). Base: current main.

## Taken over

- PR #1128 (branch `lane/arcade-current-main-successor-20261020`) and its
  continuation branches `lane/arcade-source-entry-image-banks-20261026` and
  `lane/arcade-source-continuation-20261027`. Normal pushes only, no history
  rewrite; the previous worker's commits, retained failures and claims stay.
- The controller-retention claim (`lanes/` file from PR #1482) once it merges,
  under that claim's own scope.

## Owned scope of the repair

At #1128 head 7ef0dacc all six unit shards fail; most blocking assertion
diffs share one refusal, `native addition requires initialized primitive or
proved flat Array operands`, from
`overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js`.
Owned: that file and the proof modules it consumes in the same directory, as
far as the bisected regression requires, plus focused tests under `test/` and
Arcade handoff documentation. Locate the introducing commit by bisection,
then fix the producer/proof forward. No assertion, threshold, expected value,
fixture, pin, budget, workflow or runtime change to get green; refusals that
are correct stay refusals.

## Qualification

Focused source tests per change; the final #1128 head needs every enabled
exact-head hosted check SUCCESS before a matched-head merge, with parents and
tree verified. Supplementary off-GitHub runs are evidence only, never a merge
gate.
