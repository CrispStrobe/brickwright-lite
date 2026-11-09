# Arcade: pending work after the 2026-11-03 rows PR (#1643)

Status: OPEN task list, refreshed 2026-11-06. Claim each implementation scope
in a separate file and merge that claim before implementation; follow
[the lane protocol](PROTOCOL.md).

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

## 1. #1643 landed; corpus checked

#1643 landed as `8a969d7d` after all enabled exact-head checks passed. The
184-input source import and Creator census on that merge reports 156
translated / 27 partial / 1 parse failure. All 184 input hashes match the
previous census on `cb878669`, and no input changed stage. This does not
measure export, original PXT, VM, browser or full application execution.

The documented Arcade TODO count is 22 after #1643. Check the current main
and active claims before taking any remaining row.

## 2. Remaining documented TODO rows: what each one needs

Each row's full reason is in ARCADE-888. Ordered by expected tractability.

| # | Group | Row (test file) | What it needs |
|---|---|---|---|
| 2a | B | stop-other / stop-all second export (`makecode-export-arcade`) | DONE ([run tokens](2026-11-07-arcade-second-export-run-tokens.md), [null prologue](2026-11-07-arcade-null-prologue-reimport.md)): each parallel handler takes its own run token, and the reimport lifts the stop machinery from the second export's exact `GameSprite = null` / `GameSprite = sprites.create(...)` prologue. TODO marker removed; PXT, VM and refusal controls in the claim. |
| 2b | A | allOfKind second export (`makecode-arcade-sprite-collections`) | Still TODO ([diagnosis](2026-11-07-arcade-null-prologue-reimport.md)): the reimport is accepted; the second export refuses `actors`, `alias`, `another` and `currentFood` in the Array export authority, because the start script resets the root `let X: Sprite[] = null` globals before calling `__bwStartup`. Needs a cross-procedure Array reset proof or an exporter change, not sprite-prologue recognition. Widening the reset rule was tried and breaks 17 refusal tests; do not retry that. |
| 2c | B | class formals (`makecode-arcade-pxt-staging`, `makecode-arcade-accessor-pxt-staging`) | Call-site obligations for class constructors and methods (today `constraints()` skips class members), so `new Box(<any>"x")` is refused. Then both rows can admit. |
| 2d | C | named-array re-import (3 rows) | Importer recognition of the exporter's whole named-array helper library on reimport. |
| 2e | B | order-dependent string (`makecode-string-conversion-roundtrip`) | DONE (exporter side, [claim](2026-11-09-arcade-2e-export-string-receivers.md)): a start-script global whose saved default is never read and whose writers are String is declared `= ""`, and a String receiver calls `.concat` directly instead of `__bwSdkConcat(<any>...)`. TODO removed; PXT, mutation and near-miss controls in the claim. |
| 2f | B | map result index (`makecode-array-map-values`) | Per-site array-callback entry proof (today it is closed over the whole program) plus an in-bounds proof for the index read. |
| 2g | A | fresh animation re-export, array-copy effects, class accessor aliases | Per-slot proofs, row by row (see ARCADE-888 "second pass" notes for each counter-example). |
| 2h | B | other B rows (prefix/postfix value used; argument edited to text) | See ARCADE-888; each needs its own proof. |
| 2i | A | named-array second export (`makecode-arcade-named-arrays`, after 2d) | Unowned. Export-side Array authority for the reimported program: `row = alias[2]` (a mixed named-array element is not proven Array for `arrays_mutateReference`) and `alias` length after the registry is re-created (`arrays_referenceLength`). Dropping the `row` start default (2e) removes its reset but does not prove the element; needs per-slot proofs. |

Do not start: `randint` (needs bitwise support, out of scope); F and G
(PXT has one runtime per simulator frame, so a second Arcade instance has no
behaviour to match; refusal stays by operator decision); the timing, tile
callback order and do-while rows (kept by operator decision).

## 3. Importer gains ranked from the corpus census

From the 27 partial corpus programs, 20 are input-limited (missing tutorial
asset packs or helper libraries) and cannot be fixed in the importer.

- 3a. Four snippets use Sprite-instance `x.onOverlap(fn)`, which the #1643
  review reports is absent from the pinned SDK. Treat these as input-limited
  unless the exact pinned source establishes supported behavior.
- 3b. The projectile snippet uses an undeclared source sprite; preserve the
  refusal until the original input supplies a valid source.

These two are also listed in the pending list added with #1645; mark them
there as well when you take them.

