# Robot Lab — Afterturn judge, corrected claims, promotion; Poise lesson lead

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-afterturn-judge-20261103`.

Scope: new `scripts/lib/sim-lab-afterturn-judge.mjs` (independent prediction,
`afterturn-shape-cycle-v1` judge, fixed-mass control branch, disconnection
measure); its judge-map entry in `scripts/lib/robot-lab-qualification.mjs`;
Afterturn dispatch and control lines in `test/bw-sim-qualification.test.mjs`;
one prediction test in `test/bw-sim-rotor-model.test.mjs`; the Afterturn
contract, source fixture, registration, catalogue, mechanism and lesson
entries; corrected Afterturn and Afterturn-control lessons (en/de) and
checkpoint rows; `scripts/gen-robot-lab-lessons.mjs` (mechanism name leads a
lesson once) with its lesson-test check.

Result: Afterturn passes ordinary, strict, fixed-mass control and
disconnected native runs. Predicted Iw/J = 0.02608 (B = 0) and 0.02746
(B = 70°) from compiled masses; measured strokes agree within 0.1 %, cycle
1.24° against 1.25° predicted. The supplier's 4.6625° was the #1494 double
count. Afterturn is promoted; afterturn-fixed-masses stays experimental as
its control. Model and program bytes are unchanged.
