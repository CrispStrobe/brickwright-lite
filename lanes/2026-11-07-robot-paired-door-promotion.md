# Robot Lab — Paired Door Sync judge and promotion (handoff P6, part 1)

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-paired-door-promotion-20261107`.

Scope: new judge module `scripts/lib/sim-lab-p6-judges.mjs` (`opposed-rack-pinion-v1` and its
disconnection measure); its import and judge id in `QUALIFICATION_JUDGES`; one `p6` disconnection
branch in `test/bw-sim-qualification.test.mjs`; the contract in `docs/data/robot-lab-qualification.json`;
source fixture `test/fixtures/model-files/paired-door-sync-source/`; the registry move (`sim-session.js`
MODELS, `experimental-models.js`, dialect and extension model lists); catalogue/lesson/mechanism entries
and regenerated outputs; registration tests that enumerate MODELS; the model hash pin in
`test/helpers/paired-door-program-child.mjs`; the now-redundant experimental input in `test/bw-sim-models-solid.test.mjs`; the review record in the experimental checkpoint.

Law: one 16-tooth 94925 pinion (module 1 mm, pitch radius 8 mm) between two racks on opposite sides;
each passive rack moves ±8 mm per radian of the observed pinion angle (signs from geometry, not from
the compiler's coupling ratio) and their sum stays zero. Measured: 6e-6 mm law error (bound 0.3 mm),
sum 4e-6 mm. Disconnection removes `pinion`: motor still turns, racks leave the law by 24 mm (> 2 mm).

Model change: the SPIKE hub's `!BW ID chassis_reference` renamed to `hub` (identifier only; geometry,
parts and program unchanged) so the standard hub observation base applies.

Qualification: native ordinary, strict and disconnected runs locally; hosted unit/build checks,
`ci:full` once on the final head. Browser journey and saved-project replay stay NOT_RUN unless run.
