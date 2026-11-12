# Scoped official-build menu and Robot Lab browser qualification

Status: CLAIMED; implementation remains a reviewed candidate.
Owner: scoped browser qualification lane.
Base: main `312609f46513d245e8e6ecb26bd91aa1ee83612c`.

Own only these paths and boundaries for the combined R3/R4 and submenu candidate:

- `.github/workflows/build.yml`: the existing `arcade-numeric-authoring` job's
  two-parent checkout, bounded changed-path selector, unchanged tilemap painter
  and separate Apex/Tempest example invocations, post-step snapshots and retention.
- New `scripts/menu-painter-browser-scope.mjs` and focused
  `test/menu-painter-browser-scope.test.mjs`: bind the actual synthetic checkout
  to the event base/head, inspect complete old/new rename paths, select affected
  guests, and select conservatively when identity or diff is uncertain. Prove
  unrelated PRs skip and a full label alone never suppresses affected guests.
- New `scripts/snapshot-scoped-browser-guest.mjs` and focused
  `test/scoped-browser-guest-snapshot.test.mjs`: retain each producing step's
  outcome/conclusion and move its original output before another guest can reuse
  the directory, including failure, timeout and no-output cases.
- This claim only. Existing menu and Robot Lab claims retain their source scope.

Preserve `needs: build`, exact producer admission, existing job steps, conditions,
permissions, action pins, model laws, page-error assertions and existing 3/8/8
minute guest limits. Use the same admitted frontend and embedded SDK. No extra
frontend build, workflow dispatch, full-CI label, gate weakening or replay of a
completed qualification. Post-step snapshots must execute after failed/timed-out
producing steps; do not let a failed snapshot permit the next guest to overwrite
its output. Keep original failures and absent-output facts.

Qualification requires focused synthetic-parent, rename, unrelated-PR and labeled
PR controls; actual finite child failure/timeout snapshot controls; clean affected
final-head painter/Apex/Tempest browser observations and every enabled check.
Source controls alone do not qualify the browser, physical behavior or Robot Lab
as a whole. Keep Vesper, Aster, Solstice and Impulse Line experimental at their
recorded limits; their earlier failures remain failures.
