# Robot Lab — land rescued batch A/B judges and promote passing models

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-batchab-promotions-20261102`.

Scope: new `scripts/lib/sim-lab-batchA-judges.mjs` and
`scripts/lib/sim-lab-batchB-judges.mjs` (reviewed judges and disconnection
measures); their import and judge-map entries in
`scripts/lib/robot-lab-qualification.mjs`; one import and two dispatch lines
in `test/bw-sim-qualification.test.mjs`; nine contracts in
`docs/data/robot-lab-qualification.json`; source fixtures under
`test/fixtures/model-files/<id>-source/`; the registry move (`sim-session.js`
MODELS, `experimental-models.js`, dialect and extension model lists);
catalogue/lesson generator entries and regenerated outputs; mechanism search
entries; registration tests that enumerate MODELS; review records in
`docs/data/robot-lab-experimental-checkpoint.json`.

Promoted: Poise, Bend Ripple, Offset Relay, Rack Decoder, Remote Pivot,
Schmidt Shift, Equal Share, Stroke Shift, Triad Table (native ordinary, strict
and disconnected runs pass; all construction gates pass). Model and program
bytes unchanged.

Kept experimental, with reasons in the checkpoint: Tangent Table (its
disconnection does not lose the law), Kestrel, Meridian, Lumen (judges
registered; no reviewed disconnection measure yet).

Qualification: hosted unit/build checks, `ci:full` once on the final head.
