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

Contracts: Loop Relay, Toggle Press, Footfall, Phasekeeper, Vector Sum,
Point Weaver. Helixgate (20 pieces), Parity Dial (31) and Counter Slide (44)
get no contract: the qualification contract validator requires more than 50
pieces, and the intake record keeps honest counts rather than padding. Whether
that rule should apply to these intakes is an operator decision.

Model and program bytes are unchanged. Qualification: hosted unit/build
checks, `ci:full` once on the final head.
