# Robot Lab — pending qualification tasks (unowned)

Status: OPEN — no owner. Claim a task by adding your own `lanes/` file in the
PR that does it, and mark the task here as taken in that same PR.

The full task list with exact steps is section 00 of
`docs/ROBOT-LAB-QUALIFICATION-HANDOFF-20261028.md`:

- P1 finish PR #1641 (Afterturn judge and promotion, Poise lesson): checks, merge.
- P2 finish PR #1639 (nine-intake judge registration, no promotions): ready, `ci:full`, merge.
- P3 geometry repairs for Toggle Press, Footfall, Phasekeeper, Vector Sum, Point Weaver, then promote.
- P4 (taken 2026-11-07, lanes/2026-11-07-robot-piece-minimum.md) Loop Relay disconnection run loses the hub observation base.
- P5 (taken 2026-11-07, lanes/2026-11-07-robot-piece-minimum.md) decided (2026-11-07): drop the >50-piece bound from the qualification validator, then qualify Helixgate, Parity Dial, Counter Slide.
- P6 RimRun, Evenhand and Paired Door Sync.

Rules: iterate without `ci:full`, add it once on the final head; merge only
with `--match-head-commit` after every enabled check passes; never weaken a
threshold, judge or gate; no force-push or rebase of shared branches.
