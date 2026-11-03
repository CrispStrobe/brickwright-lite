# Arcade original-PXT oracle: one browser session at a time

Status: DONE in the implementing PR (claim and change together).
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
  (atomic directory lock in the OS temp directory, owner PID, recovery of a
  dead or ownerless holder, optional interval log).
- `test/helpers/pxt-arcade-runtime.mjs`: the simulator server and browser
  session run inside that section; compilation stays outside.
- New `test/pxt-exclusive-boot-lock.test.mjs`: four real processes never
  overlap; a dead holder is recovered; a live holder blocks. Removing the
  acquire fails all three tests; disabling stale recovery fails the second.
