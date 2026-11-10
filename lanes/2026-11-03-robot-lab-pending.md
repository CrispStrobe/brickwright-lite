# Robot Lab — pending qualification tasks (unowned)

Status: DONE — Q1–Q5 all landed (2026-11-09). Nothing open in this file.

The full task list with exact steps is section 00 of
`docs/ROBOT-LAB-QUALIFICATION-HANDOFF-20261028.md`:

- P1–P6 all DONE (2026-11-08): #1641, #1639, #1669, #1672, #1671, #1668.
  Promoted this round: Afterturn, Toggle Press, Footfall, Phasekeeper,
  Vector Sum, Paired Door Sync, Helixgate.
- Q1–Q5 all DONE (2026-11-09), landed together in #1683 (merge `98067ba8`),
  which also merged #1684, #1681 and #1682. Promoted: Loop Relay, Parity
  Dial, Counter Slide, Point Weaver, Evenhand, RimRun.
  - Manual browser controls, saved-project replay and export not run.
  - RimRun: about 4 % residual, inside the judge's 5 % gate, now explained:
    each roller loses about 0.0085 m/s at each 128 mm track-collider seam
    (about 0.05 mm out of plane, near 74 mm and 202 mm); the judge window
    (2960–3240 ms) covers one crossing (~0.03 of the 0.0327/0.0331 m/s²
    shortfall). Between seams the prediction matches within 0.1 %. Inertia,
    joint friction/damping, timestep and per-part mass ruled out. Judge and
    gate unchanged. Follow-ups not done: single-segment fit, or merging
    abutting track colliders (affects every model). Details in handoff 0000.
  - "Arcade numeric authoring (official build)" was an operator-declared
    exception for that merge. Details are in handoff section 0000.

Rules: iterate without `ci:full`, add it once on the final head; merge only
with `--match-head-commit` after every enabled check passes; never weaken a
threshold, judge or gate; no force-push or rebase of shared branches.
