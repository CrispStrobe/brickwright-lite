# Arcade: pending work after the 2026-11-03 rows PR (#1643)

Status: OPEN task list (docs only). Written 2026-11-03 for a fresh agent.
Owner: unclaimed. Claim an item by adding your name next to it in this file
(claim and change in the same PR is fine for the Arcade lane).

Read first: `docs/ARCADE-AGENT-HANDOFF.md` (methodology) and
`docs/ARCADE-888-OPEN-FAILURES.md` (one row per open test, each with the
reason it is still open). PXT is the reference for every behaviour question.

## Standing rules for every item

- Never weaken an assertion, threshold or refusal to get green. A TODO is
  removed only when the test passes unchanged, or when an assertion change
  carries the original-PXT reason in the test itself.
- Every new admission needs: an original-PXT comparison test, a mutation
  check (remove the rule and the test fails) and refusal controls.
- Local test setup: clean `npm install`, then the integrate step, then the VM
  overlay, under Node 22. Do not borrow another checkout's `node_modules`.
- Iterate without the `ci:full` label; add it once on the final head. Merge
  with `gh pr merge --merge --match-head-commit <head>` only after every
  enabled exact-head check is SUCCESS. Normal pushes only, no force-push.
- If main is red because of another lane, wait for that lane's fix.

## 1. Land #1643 (first; nothing else in the importer/exporter before it)

#1643 "positional Array elements and constant computed indexes" is complete.
Head `7a0894fd`, `ci:full` already set; at hand-off its normal checks were
green and the thorough tier was still running. Steps:

1. `gh pr checks 1643`; if all enabled checks pass, merge with
   `--match-head-commit 7a0894fd`. Verify the merge parents (main + that
   head) and that only the PR's files changed.
2. If a check failed: read the job log. If it is a known flake listed in
   ARCADE-888 ("Not marked known-open"), rerun only that job. If it is a real
   failure, fix it on the PR branch (normal push) and run CI again.
3. After merge, rerun the 184-input corpus census as described in the
   handoff doc (same audit code, same inputs, same limits) and record the
   result in the handoff doc. Last results: 156 translated / 27 partial /
   1 parse failure on `cb878669`.

Documented Arcade TODO count: 37 (2 Nov) -> 24 (after #1638) -> 22 after
#1643.

## 2. Remaining documented TODO rows: what each one needs

Each row's full reason is in ARCADE-888. Ordered by expected tractability.

| # | Group | Row (test file) | What it needs |
|---|---|---|---|
| 2a | B | stop-other / stop-all second export (`makecode-export-arcade`) | Exporter change: give each `arcade run parallel` handler its own run token instead of nesting it inside the start script's `control.runInParallel`. |
| 2b | A | allOfKind second export (`makecode-arcade-sprite-collections`) | Exporter change: stop emitting the `null` prologue in `__bwStartup` and the `actors = null` reset before it. Widening the reset rule was tried and breaks 17 refusal tests; do not retry that. |
| 2c | B | class formals (`makecode-arcade-pxt-staging`, `makecode-arcade-accessor-pxt-staging`) | Call-site obligations for class constructors and methods (today `constraints()` skips class members), so `new Box(<any>"x")` is refused. Then both rows can admit. |
| 2d | C | named-array re-import (3 rows) | Importer recognition of the exporter's whole named-array helper library on reimport. |
| 2e | B | order-dependent string (`makecode-string-conversion-roundtrip`) | A flow-sensitive source producer proof, and no receiver cast for statically String operands. |
| 2f | B | map result index (`makecode-array-map-values`) | Per-site array-callback entry proof (today it is closed over the whole program) plus an in-bounds proof for the index read. |
| 2g | A | fresh animation re-export, array-copy effects, class accessor aliases | Per-slot proofs, row by row (see ARCADE-888 "second pass" notes for each counter-example). |
| 2h | B | other B rows (prefix/postfix value used; argument edited to text) | See ARCADE-888; each needs its own proof. |

Do not start: `randint` (needs bitwise support, out of scope); F and G
(PXT has one runtime per simulator frame, so a second Arcade instance has no
behaviour to match; refusal stays by operator decision); the timing, tile
callback order and do-while rows (kept by operator decision).

## 3. Importer gains ranked from the corpus census

From the 27 partial corpus programs, 20 are input-limited (missing tutorial
asset packs or helper libraries) and cannot be fixed in the importer.

- 3a. Sprite-instance `x.onOverlap(fn)`: the only blocker in 4 programs
  (jumper, runner, asteroids, car-race). Check the pinned PXT typings ship
  it; translate it the way PXT defines it. Expected +4 translated.
- 3b. `createProjectileFromSprite` with an unproven source sprite: +1.

These two are also listed in the pending list added with #1645; mark them
there as well when you take them.

