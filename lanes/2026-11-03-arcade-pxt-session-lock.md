# Arcade original-PXT oracle: one browser session at a time

Status: candidate; exact-head qualification is pending.
Owner: Arcade lane (load-sensitive CI flakes follow-up, 2026-11-03).
Base: main `cb878669d8f0bbf91112bde445b0b9410f7b0e42`.

## Why

Each `runPxtArcade` call launches its own Chromium and boots the full pinned
simulator. `node --test` runs several files at once, and shards do not group
the oracle files, so several sessions can boot together. The fixed 20 s
readiness guards then measure CPU contention rather than program behaviour
(reported "PXT program never starts" in value-arithmetic, export-arcade and
randint tests). No guard, timeout or assertion is changed.

## Scope

- New `test/helpers/exclusive-boot-lock.mjs`: cross-process exclusive section
  (unique participant paths, ordered tickets, recovery of a dead chooser or
  holder, optional interval log). The namespace directory remains for reuse.
- `test/helpers/pxt-arcade-runtime.mjs`: the simulator server and browser
  session run inside that section; compilation stays outside.
- New `test/pxt-exclusive-boot-lock.test.mjs`: four real processes never
  overlap; a dead holder is recovered; a live holder blocks. Removing the
  acquire fails all three tests; disabling stale recovery fails the second.

## 2026-11-06 recovery correction

A stale check followed by renaming the shared lock directory can remove a
new owner that acquired the same path in between. The candidate uses unique
participant paths and ordered tickets; stale cleanup removes only the dead
participant's never-reused path. Tests cover the interleaving, dead chooser and
holder recovery, live exclusion and release after a logging error. Removing
ticket ordering fails the concurrent and live-holder controls. The earlier
unit shard hit its job time limit while running; its cause is unestablished.
The new candidate needs all enabled exact-head checks and must fit the
unchanged shard budget.
