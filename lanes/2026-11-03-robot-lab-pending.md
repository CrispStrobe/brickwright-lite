# Robot Lab — pending qualification tasks (unowned)

Status: OPEN — no owner. Claim a task by adding your own `lanes/` file in the
PR that does it, and mark the task here as taken in that same PR.

The full task list with exact steps is section 00 of
`docs/ROBOT-LAB-QUALIFICATION-HANDOFF-20261028.md`:

- P1–P6 all DONE (2026-11-08): #1641, #1639, #1669, #1672, #1671, #1668.
  Promoted this round: Afterturn, Toggle Press, Footfall, Phasekeeper,
  Vector Sum, Paired Door Sync, Helixgate.
- Still open (unowned), details in handoff section 000 and the checkpoint:
  - Q1 (taken 2026-11-08, lanes/2026-11-08-robot-q12-geometry.md) Loop Relay and Parity Dial: input axle 2.5 LDU into the motor (construction gate). Repair, re-add contract, promote.
  - Q2 (taken 2026-11-08, lanes/2026-11-08-robot-q12-geometry.md) Counter Slide: housing angles overlap racks 2.5 LDU, eight pins about 2 LDU into housings. Repair, re-add contract, promote.
  - Q3 Point Weaver: 70 LDU-deep rear holes; redesign the motor-foot mount.
  - Q4 Evenhand: counterweight removal trips the 3° start guard; pick a non-tripping or justified disconnection, register judge from `lane/robot-evenhand-20261107`, promote.
  - Q5 RimRun: bridge the hub to the frame (about 170 LDU), repair catch/watchdog-hold checks, write a judge with `rimrun-swapped` as the causal control.

Rules: iterate without `ci:full`, add it once on the final head; merge only
with `--match-head-commit` after every enabled check passes; never weaken a
threshold, judge or gate; no force-push or rebase of shared branches.
