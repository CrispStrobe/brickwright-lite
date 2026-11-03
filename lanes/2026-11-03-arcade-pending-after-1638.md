# Arcade: pending work after #1638 (open, unclaimed unless marked)

Status: OPEN task list, written 2026-11-03 at main `003289f7`. Each item is a
separate future claim: add your own `lanes/<date>-<slug>.md` (claim and change
in one PR) and mark the item here as taken in that PR.
Refresh PR and main state before acting; another agent may have finished it.

## Ownership right now

- Remaining `docs/ARCADE-888-OPEN-FAILURES.md` TODO rows (A 5, C 3, B 9
  triage) are owned by the open PR #1643 and its follow-ups. Do not edit the
  Arcade exporter/importer (`overlay/scratch-gui/src/lib/bw-makecode/`) until
  #1643 merges; then re-read ARCADE-888 for what is left.
- #1645 (this lane file's PR): original-PXT session lock, see
  `lanes/2026-11-03-arcade-pxt-session-lock.md`.

## Rules for every item

- Merge only with `gh pr merge --merge --match-head-commit <sha>` after every
  enabled exact-head check is SUCCESS; add `ci:full` once on the final head.
- Never weaken assertions, thresholds or timeouts, and never add retries.
- Every fix gets a nonvacuity check: revert or mutate the fix and show the new
  test fails; record that in the PR body.
- Export claims need original-PXT equality (`test/helpers/pxt-arcade-runtime.mjs`).

## 1. Land #1645 (session lock)

Test-only. Waiting for hosted CI (queue stalled on 2026-11-03). When unit
shards run, check that no Arcade oracle test got slower beyond its shard
budget; the lock serializes browser sessions inside a shard. Then `ci:full`
once and matched-head merge. No further code expected.

## 2. SDK effect framing tests (after #1643 merges)

File: `overlay/scratch-gui/src/lib/bw-makecode/project-conditional-array-entry.js`.
Read-only review found NO unsound admission: the startup prefix admits
`arcade_playSound`, `arcade_splash` and `control_wait` only with pure inputs
that do not read the receiver; the only other hats are procedure definitions
and the registered paint hat, whose registration is refused in the prefix;
game over is refused. Sound and splash do yield (splash blocks until
dismissed), but no user code can be scheduled during the prefix, an effect
error continues the thread, and a restart (`stopAll` + `greenFlag`) reruns
the deterministic prefix.
Do:
- Rewrite the comment above `prefixEffects` to state that model exactly
  (yield, blocking splash, error continues, no callback before publication,
  epoch ends only at stopAll+greenFlag).
- New `test/project-array-publication-frontier-effects.test.mjs`. Positive:
  splash, playSound with UNTIL_DONE true and false, wait, then publication is
  admitted. Negatives: an effect argument reading the receiver; a
  registerPaintHandler before publication; game over in the prefix; an extra
  event hat. Mutations that must each flip a negative: drop the receiver
  check in the effect-argument loop; allow `arcade_registerPaintHandler` in
  the prefix; add a game-over opcode to `prefixEffects`.
- Also verify (and test if true) that info countdown/life state is reset on
  greenFlag; it was not traced.

## 3. Importer: `sprite.onOverlap(handler)` (after #1643; up to +4 corpus)

Corpus census at main `cb878669`: 156 translated / 27 partial / 1
parse-failed of 184. In four partial programs the sole blocker is the Sprite
instance handler `x.onOverlap(function (other: Sprite) {...})`, refused as
"unsupported Arcade handle method": pxt-arcade docs examples jumper, runner,
asteroids and car-race. First confirm the method exists in the pinned Arcade
typings (search the shipped PXT Arcade libs for `onOverlap` on `Sprite`). If
it does not, close this item: the docs are stale. If it does, add the
lowering with original-PXT equality and refusal controls.

## 4. Importer: `sprites.createProjectileFromSprite` source (+1 corpus)

Sole blocker in pxt-arcade `courses/csintro/blocks/unit-3/lab0301-part1.md`
snippet 5: "source must be a sprite handle or null". Prove the source is a
Sprite where it provably is; keep the refusal otherwise.

## 5. Corpus: every other partial is input-limited (operator decision)

The corpus stores single doc snippets. Twenty partials reference artwork,
animations, songs or helper namespaces (for example `assets.image\`p1\``,
`labNimgs.*`, `sprites.step_right()`) that live in the tutorial's asset pack,
not in the snippet; one parse failure is a truncated snippet. Fixing these
needs a corpus change (collect assets/helpers with snippets), not importer
work. Ask the operator before changing the corpus schema.

## 6. Legacy-layout browser check (only if it fails again)

`scripts/verify-arcade-legacy-layout.mjs`: `runEdited` calls `greenFlag`
right after Save/reload and then polls the end tilemap, which a value from
the previous run can satisfy. Fix at the cause: wait until the target's
`arcade_setLegacyTilemap` arguments equal the saved layout, clear the device
tilemap before greenFlag, wait for the project start event. Nonvacuity:
greenFlag before Save must be refused by the new pre-wait. No occurrences in
hosted Build CI 2026-10-24..11-03, so do this only when it reappears.

## 7. Physics stall proof grid (low priority)

`test/makecode-arcade-physics-engine-stall.test.mjs` checks frame deltas on
a 0.25 ms grid; the real delta is wall clock. Either prove the property for
any delta from the engine's rounding, or quantise the delta in the engine.

## 8. Connected editor acceptance

Prove in a real browser that the Blocks/Code GUI can author, edit and export
the admitted programs (snake, frame-delta accumulator, askForNumber/runtime
joins) and that export equals original PXT. Start from the existing
`scripts/verify-arcade-*` browser harnesses. Run in hosted CI (browser
shards); do it after items 2-4 land. Done when a browser check covering those
programs passes in CI.
