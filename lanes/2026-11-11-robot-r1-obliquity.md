# Robot Lab — R1 Obliquity Orrery: judge obliquity-tilt-v1, controls, browser gate and promotion

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-r1-obliquity-20261111`.

Scope: `judgeObliquityTilt` in the new `scripts/lib/sim-lab-obliquity-judge.mjs` and its id
`obliquity-tilt-v1` in `QUALIFICATION_JUDGES` (the older, unused `obliquity-orrery-v1` entry and
`sim-lab-batch2-judges.mjs` are unchanged); the contract in `docs/data/robot-lab-qualification.json`;
source fixture `test/fixtures/model-files/obliquity-orrery-source/`; the disconnection branch and an
orrery-only mutant test in `test/bw-sim-qualification.test.mjs`; the registry move (`sim-session.js`
MODELS after Evenhand, `experimental-models.js`, dialect and extension model lists, all in MODELS
order); catalogue, lesson and mechanism entries and their generated outputs; registration tests that
enumerate MODELS; the browser gate (`scripts/lib/sim-lab-q5-browser-gate.mjs`, new shard
`robotaddon15` in `build.yml`, the shard tests and the readings registration); the checkpoint review
record, the handoff and the pending file. Model, program, start guard and every existing judge,
threshold and gate are unchanged. `obliquity-orrery-turned-axis` stays experimental.

Law: sin δ = sin 22.5° · cos(λ − 45°), max error 0.01°. It is this mechanism's physics: motor A turns
crank A 1:1; both cranks are 16 mm and their frame axles 32 mm apart, the coupler-pin spacing, so the
coupler translates without turning; the Earth's axis (angle connector #3) keeps its 22.5° tilt in one
direction; the Sun marker sits at the orbit centre, level with the Earth's reference point; the axis
leans at the Sun at λ = 45°. ε, λ₀, the orbit radius and the parallelogram are read from the compiled
parts, and the 1:1 drive is checked against the encoder.

Controls: frozen-output (`earth`) and 1 cm shift; disconnection `crank_pin_A` (crank A's coupler pin);
two wrong-model mutants built from the real run (Earth turned 90° about its spindle; Earth turning with
its orbit), both refused; the handoff's crank-B cut is run and recorded.

Qualification: hosted unit/build checks and the chromium browser gate, `ci:full` once on the final head.
