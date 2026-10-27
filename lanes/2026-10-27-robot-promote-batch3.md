# Robot Lab — promote Samebeat and Phasor Twin (third experimental batch)

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-promote-batch3-20261027`.
Base: `dea504b32a9` (origin/main at claim time).

Scope: reviewed judges in the new `scripts/lib/sim-lab-batch3-judges.mjs`,
their registration in `scripts/lib/robot-lab-qualification.mjs` (judge map and
two optional contract keys, `withSpike` and `disconnectLaw`), one dispatch line
in `test/bw-sim-qualification.test.mjs`, two contracts in
`docs/data/robot-lab-qualification.json`, source fixtures under
`test/fixtures/model-files/{samebeat,phasor-twin}-source/`, the registry move
(`sim-session.js` MODELS, `experimental-models.js`, dialect and extension model
lists), catalogue/lesson generator entries and their regenerated outputs,
mechanism search entries, the registration tests that enumerate MODELS, and the
two entries' `promoted` records in `docs/data/robot-lab-experimental-checkpoint.json`.

Model and program bytes stay unchanged. The comparison files
(`samebeat-conjugate`, `samebeat-control`, `phasor-twin-control`) stay
experimental. Impulse Line, Afterturn, Quiet Partner and Pivot Exchange were
reviewed and stay experimental (reasons in the checkpoint and the PR).

Not touched: PR #1455's six models, its `sim-lab-batch2-judges.mjs`, and
Obliquity Orrery.
