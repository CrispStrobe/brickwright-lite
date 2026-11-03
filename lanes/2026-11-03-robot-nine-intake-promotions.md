# Robot Lab — qualify the nine Technic intakes and promote passing models

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-nine-intake-promotions-20261103`.

Scope: register the existing nine-intake judge (`scripts/lib/sim-lab-nine-intake-judge.mjs`,
unchanged law code; a throwing qualification wrapper and a disconnection-loss
measure are appended) in `QUALIFICATION_JUDGES`; one import and one dispatch
line in `test/bw-sim-qualification.test.mjs`; contracts in
`docs/data/robot-lab-qualification.json`; source fixtures under
`test/fixtures/model-files/<id>-source/`; the registry move for passing
models (`sim-session.js` MODELS, `experimental-models.js`, dialect and
extension model lists, catalogue/lesson generator entries and regenerated
outputs, mechanism search entries, registration tests that enumerate MODELS);
review records in `docs/data/robot-lab-experimental-checkpoint.json`.

Outcome: no model promoted. The judge is registered per principle family with a
disconnection-loss measure. Toggle Press, Footfall, Phasekeeper, Vector Sum and
Point Weaver passed hosted native ordinary, strict and disconnected runs but fail
the established construction gate (solid-part penetration and double-filled
holes); they need geometry repair and requalification. Loop Relay's shared
disconnection run loses its hub observation base. Helixgate, Parity Dial and
Counter Slide are under the validator's 50-piece minimum (operator decision).
Reasons are in the checkpoint. Model and program bytes are unchanged.
