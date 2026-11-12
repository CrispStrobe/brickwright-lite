# Robot Lab — Q4 Evenhand: holding-torque judge, disconnection and promotion

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-q4-evenhand-20261108` (brings in the judge commit from `lane/robot-evenhand-20261107` by merge).

Scope: `judgeEvenhand` in `scripts/lib/sim-lab-p6-judges.mjs` (from the evenhand branch) and its id
`counterbalance-holding-torque-v1` in `QUALIFICATION_JUDGES`; an `observeDynamics` contract flag read
only by `run()` in `test/bw-sim-qualification.test.mjs` (records body mass/centre of mass and motor
torque per frame); the contract in `docs/data/robot-lab-qualification.json`; source fixture
`test/fixtures/model-files/evenhand-source/`; the registry move (`sim-session.js` MODELS,
`experimental-models.js`, dialect and extension model lists); catalogue/lesson/mechanism entries and
regenerated outputs; registration tests that enumerate MODELS; the checkpoint review record and the
handoff status. Model, program, guard, settle time, thresholds and judge bounds are unchanged.

Law: at each of the 11 settled holds, each motor's held torque equals the static gravity moment of its
distal bodies; the elbow holds no load (< 0.01 mN·m), the shoulder keeps its 0.32–0.37 mN·m residual.

Disconnection: `forearm_weight_pin_-1_-20`, the inner counterweight's outer 3L pin, 120 LDU behind the
elbow. The elbow balance is the mirror condition Σ mᵢdᵢ = 0 about the elbow; this pin's moment
(0.35 g × 48 mm × g ≈ 0.165 mN·m) is a term of it, so its removal brings back a predicted 0.165 mN·m
elbow load (measured 0.166, loss bar 0.1). It is small enough that the motors' holding compliance sags
the arm only 1.4° / 1.0° during the 500 ms cold settle, inside the program's 3° start guard; removing
whole weight beams (≥ 0.63 mN·m) sags 3.4–17° and faults the guard.

Qualification: hosted unit/build checks, `ci:full` once on the final head. Browser journey and
saved-project replay stay NOT_RUN.
