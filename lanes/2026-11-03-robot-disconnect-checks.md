# Robot Lab — disconnection checks for Kestrel, Meridian, Lumen and Tangent Table

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-disconnect-checks-20261103`.

Scope: four `batchADisconnectionLoss` cases in `scripts/lib/sim-lab-batchA-judges.mjs`
(Meridian's inversion rows factored into a shared helper, judge unchanged); four contracts in
`docs/data/robot-lab-qualification.json`; source fixtures under
`test/fixtures/model-files/<id>-source/`; the registry move (`sim-session.js` MODELS,
`experimental-models.js`, dialect and extension model lists); catalogue/lesson generator
entries and regenerated outputs; mechanism search entries; registration tests that
enumerate MODELS; review records in `docs/data/robot-lab-experimental-checkpoint.json`.

Disconnections (each removes the part that carries the law; thresholds unchanged):
- Kestrel: `coupler` — four-bar closure error 64 mm (> 2 mm).
- Meridian: `cell_BQ` — inversion error 21.7 mm (> 2 mm).
- Lumen: `ring_top` — leaves 1–5 leave the gear law by 181° (> 5°).
- Tangent Table: `radial_sleeve` replaces `follower_axle` — 13.4 mm (> 2 mm). With only
  the axle removed, the sleeve stays nested in the output bearings and contact still
  carries the output (0.25 mm).

Promoted after native ordinary, strict and disconnected runs. Model and program bytes unchanged.
Qualification: hosted unit/build checks, `ci:full` once on the final head.
